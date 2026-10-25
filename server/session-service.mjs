import {fromMarkdown} from 'mdast-util-from-markdown';
import {toString} from 'mdast-util-to-string';
const normalize=value=>value.replace(/\s+/g,' ').trim();
const threadId = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('无效会话 ID');
  return value;
};
const text = (value,max=1000) => {
  if(typeof value !== 'string' || !value.trim() || value.length>max) throw new Error('文本为空或超过长度限制');
  return value.trim();
};
export class SessionService {
  ancestry=new Map();forking=new Set();
  constructor(rpc,store) {this.rpc=rpc;this.store=store;}
  async list({cursor,archived=false,cwd}={}) {
    if(typeof archived!=='boolean'||cursor!==undefined&&(typeof cursor!=='string'||cursor.length>4096)||cwd!==undefined&&(typeof cwd!=='string'||!cwd.trim()||cwd.length>4096))throw new Error('无效会话列表参数');
    const [page,groups]=await Promise.all([this.rpc.call('thread/list',{limit:60,sortKey:'updated_at',modelProviders:[],sourceKinds:['cli','vscode','appServer','exec','unknown'],useStateDbOnly:true,archived,...(cursor?{cursor}:{}),...(cwd?{cwd}:{})}),this.sections()]);
    const pinned=groups.data.find(s=>s.name==='Pinned');
    const missing=page.data.filter(t=>!t.forkedFromId&&!this.ancestry.has(t.id));
    // Some Codex versions omit fork ancestry from list results but expose it in thread/read.
    for(let offset=0;offset<missing.length;offset+=8) {
      await Promise.all(missing.slice(offset,offset+8).map(async t=>{
        try {const {thread}=await this.rpc.call('thread/read',{threadId:t.id,includeTurns:false});this.ancestry.set(t.id,thread.forkedFromId||null);} catch {/* Retry unavailable metadata on the next sync. */}
      }));
    }
    page.data=page.data.map(t=>({...t,forkedFromId:t.forkedFromId||this.ancestry.get(t.id)||null,isPinned:t.section?.id===pinned?.id && !!pinned}));
    return page;
  }
  async read(id,cursor) {
    threadId(id);
    if(cursor!==undefined&&(typeof cursor!=='string'||cursor.length>4096))throw new Error('无效历史分页游标');
    const {thread} = await this.rpc.call('thread/read',{threadId:id,includeTurns:false});
    let page,legacy=false;
    try {page=await this.rpc.call('thread/turns/list',{threadId:id,limit:12,itemsView:'full',sortDirection:'desc',...(cursor?{cursor}:{})});}
    catch(error) {
      if (!/unsupported|legacy|unknown variant/i.test(error.message)) throw error;
      const result = await this.rpc.call('thread/read',{threadId:id,includeTurns:true});
      if(cursor)throw new Error('此 Codex 版本不支持历史分页');
      page={data:result.thread.turns || [],nextCursor:null};legacy=true;
    }
    const groups=await this.sections();const pinned=groups.data.find(s=>s.name==='Pinned');
    return {thread:{...thread,isPinned:!!pinned&&thread.section?.id===pinned.id},turns:legacy?[...page.data]:[...page.data].reverse(),nextCursor:page.nextCursor};
  }
  async rename(id,name) {return this.rpc.call('thread/name/set',{threadId:threadId(id),name:text(name,200)});}
  async move(id,sectionId) {
    threadId(id);
    if(sectionId==='pinned') {
      const groups=await this.sections();const pinned=groups.data.find(s=>s.name==='Pinned');
      if(!pinned)throw new Error('未找到 Codex 置顶分组，请先在原生界面置顶一个会话。');
      sectionId=pinned.id;
    }
    return this.rpc.call('thread/section/move',{threadId:id,sectionId:sectionId===null?null:text(sectionId,100)});
  }
  async sections() {return this.rpc.call('threadSection/list',{});}
  async createSection(name) {return this.rpc.call('threadSection/create',{name:text(name,80)});}
  async archive(id,restore=false) {if(typeof restore!=='boolean')throw new Error('无效归档参数');return this.rpc.call(restore?'thread/unarchive':'thread/archive',{threadId:threadId(id)});}
  async fork({id,turnId,quote='',question='',name,send=false}) {
    threadId(id);
    if(turnId!==undefined)threadId(turnId);
    if(typeof quote!=='string'||typeof question!=='string'||typeof send!=='boolean'||quote.length>16000 || question.length>16000) throw new Error('引用或追问格式不正确或过长');
    if(name!==undefined)text(name,200);
    if(send && !question.trim()) throw new Error('请输入追问内容');
    if(this.forking.has(id))throw new Error('正在创建分支，请稍候');
    this.forking.add(id);
    try {
    if(turnId) {
      // Validate the selected turn belongs to this thread and has completed before creating anything.
      let cursor=null,turn=null;const seen=new Set();
      do {
        const page=await this.rpc.call('thread/turns/list',{threadId:id,itemsView:'full',sortDirection:'desc',limit:50,...(cursor?{cursor}:{})});
        turn=page.data.find(t=>t.id===turnId);cursor=page.nextCursor;
        if(cursor&&seen.has(cursor))throw new Error('历史分页游标重复，无法验证分支起点');
        if(cursor)seen.add(cursor);
      }while(!turn&&cursor);
      if(!turn || turn.status!=='completed') throw new Error('找不到已完成的原回答，请等待本轮结束后重新选择。');
      if(quote && !(turn.items||[]).some(item=>item.type==='agentMessage' && (normalize(item.text||'').includes(normalize(quote))||normalize(toString(fromMarkdown(item.text||''))).includes(normalize(quote))))) throw new Error('引用内容与原回答不一致，请重新选择。');
    } else if(quote) throw new Error('引用追问必须指定原回答所在轮次');
    const {thread} = await this.rpc.call('thread/fork',{threadId:id,...(turnId?{lastTurnId:turnId}:{}),excludeTurns:true,deferGoalContinuation:true});
    // Only record a known parent and exact API fork anchor; never infer ancestry from text.
    this.ancestry.set(thread.id,id);
    const branch={parentId:id,turnId:turnId||null,quote,question,sent:false,createdAt:Date.now()};
    let warning=null,turn,accepted=!send;
    try{await this.store.update({branches:{[thread.id]:branch}});}catch(error){warning=`分支已创建，画布定位保存失败：${error.message}`;}
    if(name?.trim()) try {await this.rename(thread.id,name);} catch(error){warning=`分支已创建，命名失败：${error.message}`;}
    if(send) {
      const prompt = quote ? `关于这段回答：\n\n<quoted-answer>\n${quote}\n</quoted-answer>\n\n我的追问：\n${question}` : question;
      try {
        const response=await this.rpc.call('turn/start',{threadId:thread.id,input:[{type:'text',text:prompt}]});turn=response.turn;accepted=true;
        try{await this.store.update({branches:{[thread.id]:{...branch,sent:true}}});}catch(error){warning=`问题已发送，画布状态保存失败：${error.message}`;}
      }
      catch(error){accepted=false;warning=`分支已创建，发送未能确认；请先查看该分支状态后重试。${error.message}`;}
    }
    return {thread,turn,accepted,warning};
    } finally {this.forking.delete(id);}
  }
}

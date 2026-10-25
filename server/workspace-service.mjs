const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
const busyTurn=turn=>turn?.status==='inProgress'||turn?.status==='in_progress';
const busyThread=thread=>thread?.status?.type==='active'||thread?.status==='active';
// Native history is authoritative; cache only in-flight events until persisted.
export class WorkspaceService {
  live=new Map();errors=new Map();sending=new Set();
  constructor(service){
    this.service=service;this.rpc=service.rpc;this.store=service.store;
    this.onNotification=event=>this.event(event);this.onUnsupported=p=>{if(p?.threadId)this.errors.set(p.threadId,`此步骤请求了暂不支持的审批格式，已拒绝执行：${p.message}`);};
    this.rpc.on('notification',this.onNotification);this.rpc.on('unsupportedRequest',this.onUnsupported);
  }
  close(){this.rpc.off('notification',this.onNotification);this.rpc.off('unsupportedRequest',this.onUnsupported);}
  listApprovals(id){
    return (this.rpc.listApprovals?.(id)??[]).map(approval=>{
      const turn=this.live.get(approval.threadId),item=turn?.id===approval.turnId?turn.items?.find(item=>item.id===approval.itemId):null;
      if(!item)return approval;
      return {...approval,...(approval.kind==='file'&&item.changes?{changes:structuredClone(item.changes)}:{}),...(approval.kind==='command'&&!approval.command&&item.command?{command:item.command}:{})};
    });
  }
  event({method,params:p}){
    if(!p?.threadId)return;
    if(method==='error'){this.errors.set(p.threadId,p.error?.message||'生成失败，请重试');return;}
    if(method==='turn/started'||method==='turn/completed'){
      if(!p.turn)return;
      const previous=this.live.get(p.threadId);
      const turn={...p.turn,items:p.turn.items??[]};
      if(previous?.id===turn.id&&!turn.items.length&&previous.items?.length)turn.items=previous.items;
      this.live.set(p.threadId,turn);return;
    }
    const turn=this.live.get(p.threadId);if(!turn||p.turnId!==turn.id)return;
    turn.items??=[];
    if((method==='item/started'||method==='item/completed')&&p.item){const i=turn.items.findIndex(x=>x.id===p.item.id);if(i<0)turn.items.push(p.item);else turn.items[i]=p.item;}
    else if(method==='item/agentMessage/delta'&&typeof p.delta==='string'){
      let item=turn.items.find(x=>x.id===p.itemId);if(!item){item={type:'agentMessage',id:p.itemId,text:''};turn.items.push(item);}item.text+=p.delta;
    }
  }
  async read(id,cursor){
    const result=await this.service.read(id,cursor),live=this.live.get(id);
    if(!cursor&&live){
      const i=result.turns.findIndex(t=>t.id===live.id),persisted=result.turns[i];
      if(busyTurn(live)){if(i<0)result.turns.push(live);else if(busyTurn(persisted))result.turns[i]=live;else this.live.delete(id);}
      else if(i<0)result.turns.push(live);else this.live.delete(id);
    }
    return {...result,warning:this.errors.get(id)||null,approvals:this.listApprovals(id)};
  }
  async snapshot(id){
    await this.store.load();
    const page=await this.service.list(),threads=[...page.data];
    let selectedId=id??null,selected=null;
    if(id!==undefined){
      // An explicitly requested chat must surface its own error, never silently open another.
      selected=await this.read(id);
    }else{
      const savedId=this.store.data.view?.selectedId;
      if(validId(savedId)){
        // A saved selection may be older than the first thread-list page.
        try{selected=await this.read(savedId);selectedId=savedId;}catch{/* Deleted/unavailable saved chats fall back to the current list. */}
      }
      if(!selected&&threads.length){selectedId=threads[0].id;selected=await this.read(selectedId);}
    }
    if(selected&&!threads.some(t=>t.id===selectedId))threads.unshift(selected.thread);
    const family=new Set(selectedId?[selectedId]:[]);let changed=true;
    while(changed){changed=false;for(const t of threads){const parent=t.forkedFromId||this.store.data.branches?.[t.id]?.parentId;if(parent&&(family.has(t.id)||family.has(parent))){if(!family.has(t.id)||!family.has(parent))changed=true;family.add(t.id);family.add(parent);}}}
    const histories={};await Promise.all([...family].slice(0,24).map(async key=>{try{histories[key]=key===selectedId?selected:await this.read(key);}catch(e){histories[key]={error:e.message};}}));
    return {threads,nextCursor:page.nextCursor,histories,layout:this.store.data,selectedId,familyTruncated:family.size>24};
  }
  remember(result){if(result.turn&&result.thread?.id){const id=result.thread.id;const previous=this.live.get(id);if(!previous||previous.id!==result.turn.id)this.live.set(id,{...result.turn,status:result.turn.status??'inProgress',items:result.turn.items??[]});}return result;}
  async fork(args){
    const key=args.id;if(this.sending.has(key))throw new Error('正在提交，请稍候');this.sending.add(key);
    try{return this.remember(await this.service.fork(args));}finally{this.sending.delete(key);}
  }
  async send({id,question,turnId,quote='',branch=false,cwd}){
    if(typeof question!=='string'||!question.trim()||question.length>16000)throw new Error('请输入 1–16000 字的问题');
    if(id!==undefined&&!validId(id)||turnId!==undefined&&!validId(turnId)||typeof branch!=='boolean'||typeof quote!=='string'||quote.length>16000)throw new Error('追问参数无效');
    if(!branch&&(turnId||quote))throw new Error('历史轮次追问需要创建分支');
    const key=id||'new';if(this.sending.has(key))throw new Error('正在提交，请稍候');this.sending.add(key);
    try{
      if(branch){if(!id||!turnId)throw new Error('请选择分支的起点');return this.remember(await this.service.fork({id,turnId,quote,question,send:true}));}
      if(id){
        const history=await this.read(id);if(history.turns.some(busyTurn)||busyThread(history.thread)||busyTurn(this.live.get(id)))throw new Error('本轮仍在生成，请等待或停止后再发送');
        const resumed=await this.rpc.call('thread/resume',{threadId:id,excludeTurns:true});if(busyThread(resumed.thread))throw new Error('本轮仍在生成，请等待或停止后再发送');
      }else{
        const created=await this.rpc.call('thread/start',{...(cwd?{cwd}:{}),threadSource:'synapse'});id=created.thread.id;
        try{await this.service.rename(id,question.trim().slice(0,42));}catch{/* A title failure must not discard a newly created input. */}
      }
      this.errors.delete(id);const {turn}=await this.rpc.call('turn/start',{threadId:id,input:[{type:'text',text:question.trim()}]});
      return this.remember({thread:{id},turn,accepted:true});
    }finally{this.sending.delete(key);}
  }
  async stop(id,turnId){
    if(!validId(id)||!validId(turnId))throw new Error('无效会话或轮次 ID');
    const live=this.live.get(id);if(live&&live.id!==turnId)throw new Error('停止请求与当前轮次不匹配');
    if(live&&!busyTurn(live))throw new Error('该轮次当前没有生成任务');
    if(!live){const history=await this.read(id);if(!history.turns.some(t=>t.id===turnId&&busyTurn(t)))throw new Error('该轮次当前没有生成任务');}
    return this.rpc.call('turn/interrupt',{threadId:id,turnId});
  }
}

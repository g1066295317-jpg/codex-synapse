import {EventEmitter} from 'node:events';

// Synthetic fixtures only. This backend never imports or starts Codex RPC.
export class DemoBackend extends EventEmitter {
  constructor(){
    super();this.sequence=0;this.layout={version:1,nodes:{},branches:{'demo-branch-0002':{parentId:'demo-main-0001',turnId:'turn-02'}},view:{selectedId:'demo-main-0001'}};
    const thread=(id,name,cwd,parent)=>({id,name,preview:name,cwd,createdAt:1700000000,updatedAt:1700000000,status:{type:'idle'},...(parent?{forkedFromId:parent}:{})});
    const turn=(id,q,a)=>({id,status:'completed',items:[{type:'userMessage',id:id+'-q',content:[{type:'text',text:q}]},{type:'agentMessage',id:id+'-a',text:a}]});
    const t1=turn('turn-01','如何把长对话变成一张可探索的地图？','把每一轮问答放在节点上，沿着追问的顺序连接。\n\n- 原生聊天保留连续阅读\n- 画布展示思路与分支\n- 选中节点后查看完整内容\n\n这是合成会话，仅用于界面验收。');
    const t2=turn('turn-02','从历史轮次继续提问，怎样保留原来的思路？','在选定轮次创建分支，并记录该轮次的精确标识。\n\n```js\nconst anchor = { threadId, turnId };\n```\n\n随后产生的回答属于新分支，原来的聊天仍然保留。');
    const t3=turn('turn-03','切换回原生聊天时，输入草稿和滚动位置能保留吗？','切换只显示或隐藏画布。原生聊天的 DOM 与输入框保持挂载。\n\n| 操作 | 预期结果 |\n| --- | --- |\n| 切到画布 | 保留原生输入区 |\n| 返回原生 | 继续当前会话 |\n| 拖动节点 | 保存地图位置 |');
    this.histories={
      'demo-main-0001':{thread:thread('demo-main-0001','把对话展开成思路地图','D:\\演示项目\\对话地图'),turns:[t1,t2,t3],nextCursor:null,approvals:[]},
      'demo-branch-0002':{thread:thread('demo-branch-0002','历史轮次 · 分支探索','D:\\演示项目\\对话地图','demo-main-0001'),turns:[t1,t2,turn('branch-03','如果两条思路内容相同，会被误连吗？','不会凭文字相似推断分支。关系依赖原生分支记录与轮次标识。')],nextCursor:null,approvals:[]},
      'demo-notes-0003':{thread:thread('demo-notes-0003','研究笔记与引用','D:\\演示项目\\研究笔记'),turns:[turn('notes-01','如何引用一段回答继续追问？','在详情中选中回答文字，点击引用追问。引用内容会作为新问题的上下文，发送前可编辑或清除。')],nextCursor:null,approvals:[]},
    };
  }
  async call(name,args={}){
    const threads=()=>Object.values(this.histories).map(h=>structuredClone(h.thread));
    switch(name){
      case 'workspace_snapshot':{
        const selectedId=this.histories[args.id]?args.id:this.histories[this.layout.view.selectedId]?this.layout.view.selectedId:'demo-main-0001';
        const family=new Set([selectedId]);let changed=true;
        while(changed){changed=false;for(const [id,h]of Object.entries(this.histories)){const parent=h.thread.forkedFromId;if(parent&&(family.has(id)||family.has(parent))){if(!family.has(id)||!family.has(parent))changed=true;family.add(id);family.add(parent);}}}
        return {threads:threads(),histories:Object.fromEntries([...family].filter(id=>this.histories[id]).map(id=>[id,structuredClone(this.histories[id])])),layout:structuredClone(this.layout),selectedId,nextCursor:null};
      }
      case 'read_session':if(!this.histories[args.id])throw new Error('演示会话不存在');return structuredClone(this.histories[args.id]);
      case 'list_sessions':return {data:threads(),nextCursor:null};
      case 'save_canvas':case 'save_layout':this.layout={...this.layout,nodes:{...this.layout.nodes,...args.nodes},view:{...this.layout.view,...args.view}};return structuredClone(this.layout);
      case 'list_approvals':return {approvals:[]};
      case 'list_sections':return {sections:[]};
      case 'send_question':{
        const id=args.branch?'demo-fork-'+(++this.sequence):args.id||'demo-new-'+(++this.sequence);
        if(!this.histories[id]){const source=this.histories[args.id],index=source?.turns.findIndex(t=>t.id===args.turnId)??-1;this.histories[id]={thread:{id,name:args.question.slice(0,40),cwd:source?.thread.cwd||'D:\\演示项目',status:{type:'idle'},...(source?{forkedFromId:args.id}:{})},turns:source?structuredClone(source.turns.slice(0,index+1)):[],nextCursor:null,approvals:[]};if(source)this.layout.branches[id]={parentId:args.id,turnId:args.turnId};}
        const turn={id:'demo-added-'+(++this.sequence),status:'completed',items:[{type:'userMessage',content:[{type:'text',text:args.question}]},{type:'agentMessage',text:'这是合成后端生成的验收回答。实际 Codex 没有收到消息。'}]};this.histories[id].turns.push(turn);this.emit('change',{kind:'send_question',threadId:id});return {thread:structuredClone(this.histories[id].thread),turn,accepted:true};
      }
      case 'rename_session':this.histories[args.id].thread.name=args.name;return {thread:structuredClone(this.histories[args.id].thread)};
      default:throw new Error('演示模式暂不执行此操作');
    }
  }
  close(){this.removeAllListeners();}
}

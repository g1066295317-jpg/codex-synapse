import {EventEmitter} from 'node:events';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {z} from 'zod';
import {CodexRpc} from './codex-rpc.mjs';
import {LayoutStore} from './layout-store.mjs';
import {SessionService} from './session-service.mjs';
import {WorkspaceService} from './workspace-service.mjs';

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const cursor=z.string().min(1).max(4096).optional();
const text=max=>z.string().trim().min(1).max(max);
const layouts=z.object({nodes:z.record(z.string().max(300),z.object({x:z.number().finite(),y:z.number().finite()}).strict()).optional(),view:z.record(z.string().max(300),z.unknown()).optional()}).strict();
const schemas={
  open_session_map:z.object({id:id.optional()}).strict(),
  workspace_snapshot:z.object({id:id.optional()}).strict(),
  read_session:z.object({id,cursor}).strict(),
  list_sessions:z.object({cursor,archived:z.boolean().optional(),cwd:text(4096).optional()}).strict(),
  send_question:z.object({id:id.optional(),question:text(16000),turnId:id.optional(),quote:z.string().max(16000).optional(),branch:z.boolean().optional(),cwd:text(4096).optional()}).strict(),
  stop_turn:z.object({id,turnId:id}).strict(),
  save_layout:layouts,
  fork_session:z.object({id,turnId:id.optional(),quote:z.string().max(16000).optional(),question:z.string().max(16000).optional(),name:text(200).optional(),send:z.boolean().default(false)}).strict(),
  rename_session:z.object({id,name:text(200)}).strict(),
  move_session:z.object({id,sectionId:id.nullable()}).strict(),
  archive_session:z.object({id,restore:z.boolean().default(false)}).strict(),
  list_sections:z.object({}).strict(),create_section:z.object({name:text(80)}).strict(),
  list_approvals:z.object({id:id.optional()}).strict(),
  respond_approval:z.object({approvalId:id,threadId:id,turnId:id,decision:z.unknown().optional(),answers:z.record(z.string(),z.object({answers:z.array(z.string().max(16000)).max(20)}).strict()).optional()}).strict(),
};
const aliases={save_canvas:'save_layout',stop_generation:'stop_turn'};
function validateLayout(patch){
  const serialized=JSON.stringify(patch,(_key,value)=>{if(typeof value==='number'&&!Number.isFinite(value))throw new Error('布局包含无效数字');return value;});
  if(serialized.length>2_000_000||Object.keys(patch.nodes||{}).length>20000)throw new Error('画布布局超过大小限制');
  const inspect=value=>{if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw new Error('布局包含不支持的属性');inspect(child);}};
  inspect(patch);
}

// The host transports only this small tool allowlist. Never expose rpc.call to a renderer.
export class NativeBackend extends EventEmitter {
  constructor({rpc,store,dataDirectory,rpcOptions}={}){
    super();this.rpc=rpc??new CodexRpc(rpcOptions);this.store=store??new LayoutStore(dataDirectory??process.env.SYNAPSE_DATA??join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'CodexSynapse'));
    this.service=new SessionService(this.rpc,this.store);this.workspace=new WorkspaceService(this.service);this.closed=false;
    this.forwardNotification=event=>{const p=event.params||{};this.emit('change',{kind:event.method,threadId:p.threadId,turnId:p.turnId??p.turn?.id});};
    this.forwardApproval=event=>{this.emit('approval',event);this.emit('change',{kind:'approval',threadId:event.approval?.threadId});};
    this.forwardUnsupported=event=>this.emit('change',{kind:'unsupportedApproval',threadId:event.threadId,message:event.message});
    this.rpc.on('notification',this.forwardNotification);this.rpc.on('approval',this.forwardApproval);this.rpc.on('unsupportedRequest',this.forwardUnsupported);
  }
  async call(name,args={}){
    if(this.closed)throw new Error('工作台已关闭');
    if(typeof name!=='string')throw new Error('无效工具名称');
    const method=Object.hasOwn(aliases,name)?aliases[name]:name;
    if(!Object.hasOwn(schemas,method))throw new Error(`不支持的工作台操作：${name}`);
    const parsed=schemas[method].safeParse(args);
    if(!parsed.success)throw new Error(`参数无效：${parsed.error.issues.map(issue=>`${issue.path.join('.')||'args'} ${issue.message}`).join('; ')}`);
    const a=parsed.data;let result;
    switch(method){
      case 'open_session_map':result={selectedId:a.id??null,version:'0.3.0'};break;
      case 'workspace_snapshot':result=await this.workspace.snapshot(a.id);break;
      case 'read_session':result=await this.workspace.read(a.id,a.cursor);break;
      case 'list_sessions':result=await this.service.list(a);break;
      case 'send_question':result=await this.workspace.send(a);break;
      case 'stop_turn':result=await this.workspace.stop(a.id,a.turnId);break;
      case 'save_layout':validateLayout(a);result=await this.store.update(a);break;
      case 'fork_session':result=await this.workspace.fork(a);break;
      case 'rename_session':result=await this.service.rename(a.id,a.name);break;
      case 'move_session':result=await this.service.move(a.id,a.sectionId);break;
      case 'archive_session':result=await this.service.archive(a.id,a.restore);break;
      case 'list_sections':result=await this.service.sections();break;
      case 'create_section':result=await this.service.createSection(a.name);break;
      case 'list_approvals':result={approvals:this.workspace.listApprovals(a.id)};break;
      case 'respond_approval':if(!this.rpc.respondApproval)throw new Error('审批连接不可用');result=await this.rpc.respondApproval(a);break;
    }
    if(['send_question','stop_turn','save_layout','fork_session','rename_session','move_session','archive_session','create_section'].includes(method))this.emit('change',{kind:method,threadId:result?.thread?.id??a.id});
    return result??{};
  }
  close(){if(this.closed)return;this.closed=true;this.workspace.close();this.rpc.off('notification',this.forwardNotification);this.rpc.off('approval',this.forwardApproval);this.rpc.off('unsupportedRequest',this.forwardUnsupported);this.rpc.close?.();this.removeAllListeners();}
}

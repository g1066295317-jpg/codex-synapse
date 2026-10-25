import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {EventEmitter} from 'node:events';
import {ApprovalQueue} from './approval-queue.mjs';

export class CodexRpc extends EventEmitter {
  pending=new Map();sequence=0;process=null;ready=null;closed=false;
  constructor({command=process.env.CODEX_BIN||'codex',args=['app-server','--stdio'],spawnProcess=spawn,timeoutMs=30000}={}) {
    super();this.command=command;this.args=args;this.spawnProcess=spawnProcess;this.timeoutMs=timeoutMs;
    this.approvals=new ApprovalQueue(message=>this.write(message));
    this.approvals.on('change',event=>{this.emit('approval',event);if(event.kind==='requested')this.emit('approvalRequired',event.approval);});
    this.approvals.on('unsupported',event=>this.emit('unsupportedRequest',event));
  }
  async connect() {
    if(this.closed)throw new Error('连接已关闭');
    if(this.ready)return this.ready;
    this.ready=this.initialize();
    try{return await this.ready;}catch(error){this.ready=null;const child=this.process;this.process=null;this.reader?.close();if(child&&!child.killed)child.kill();throw error;}
  }
  async initialize() {
    // Inherit Codex configuration and sandbox policy; no approval or permission override.
    const proc=this.spawnProcess(this.command,this.args,{windowsHide:true,stdio:['pipe','pipe','pipe']});this.process=proc;
    proc.stderr.on('data',data=>this.emit('diagnostic',data.toString()));
    proc.on('error',error=>{if(this.process===proc)this.fail(error);});
    proc.on('exit',code=>{if(this.process!==proc)return;this.process=null;this.ready=null;this.reader?.close();this.fail(new Error(`Codex 会话服务已退出 (${code})`));});
    this.reader=createInterface({input:proc.stdout});this.reader.on('line',line=>{let message;try{message=JSON.parse(line);}catch{return;}this.handleMessage(message);});
    const result=await this.request('initialize',{clientInfo:{name:'codex_synapse',title:'Codex Synapse',version:'0.3.0'},capabilities:{experimentalApi:true}});
    this.write({method:'initialized'});return result;
  }
  handleMessage(message) {
    if(!message||typeof message!=='object')return;
    if(message.id!==undefined&&typeof message.method==='string'){this.approvals.receive(message);return;}
    if(message.id!==undefined){
      const request=this.pending.get(message.id);if(!request)return;
      clearTimeout(request.timer);this.pending.delete(message.id);
      if(message.error)request.reject(Object.assign(new Error(message.error.message),{code:message.error.code}));else request.resolve(message.result);
      return;
    }
    if(message.method==='serverRequest/resolved')this.approvals.resolved(message.params||{});
    if(typeof message.method==='string')this.emit('notification',message);
  }
  write(message) {
    if(this.closed||!this.process?.stdin?.writable)throw new Error('Codex 会话服务未连接');
    this.process.stdin.write(JSON.stringify(message)+'\n',error=>{if(error)this.fail(error);});
  }
  async call(method,params={}){await this.connect();return this.request(method,params);}
  request(method,params) {
    return new Promise((resolve,reject)=>{
      const id=++this.sequence;
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Codex 接口超时：${method}`));},this.timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      try{this.write({id,method,params});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
    });
  }
  listApprovals(id){return this.approvals.list(id);}
  respondApproval(args){return this.approvals.respond(args);}
  fail(error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();this.approvals.clear();}
  close(){
    if(this.closed)return;this.closed=true;this.ready=null;this.fail(new Error('连接已关闭'));this.reader?.close();
    const child=this.process;this.process=null;
    // Only the exact child spawned by this instance is terminated.
    if(child&&!child.killed)child.kill();
  }
}

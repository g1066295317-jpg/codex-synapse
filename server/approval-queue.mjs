import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const basicDecisions=['accept','acceptForSession','decline','cancel'];
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const nonempty=value=>typeof value==='string'&&value.length>0&&value.length<=1000;
const clone=value=>structuredClone(value);
const keysOnly=(value,keys)=>record(value)&&Object.keys(value).every(key=>keys.includes(key));
function decisionSupported(value,kind) {
  if(basicDecisions.includes(value))return true;
  if(kind!=='command'||!record(value))return false;
  if(keysOnly(value,['acceptWithExecpolicyAmendment'])&&record(value.acceptWithExecpolicyAmendment)) {
    const amendment=value.acceptWithExecpolicyAmendment;
    return keysOnly(amendment,['execpolicy_amendment'])&&Array.isArray(amendment.execpolicy_amendment)&&amendment.execpolicy_amendment.length>0&&amendment.execpolicy_amendment.every(nonempty);
  }
  if(keysOnly(value,['applyNetworkPolicyAmendment'])&&record(value.applyNetworkPolicyAmendment)) {
    const amendment=value.applyNetworkPolicyAmendment.network_policy_amendment;
    return keysOnly(value.applyNetworkPolicyAmendment,['network_policy_amendment'])&&keysOnly(amendment,['host','action'])&&nonempty(amendment.host)&&['allow','deny'].includes(amendment.action);
  }
  return false;
}

// Requests stay pending until a scoped user action resolves them. A pending
// request belongs to this client and cannot be handed off to native chat.
export class ApprovalQueue extends EventEmitter {
  pending=new Map();
  constructor(reply){super();this.reply=reply;}
  receive(message) {
    const p=message.params;
    const kinds={'item/commandExecution/requestApproval':'command','item/fileChange/requestApproval':'file','item/tool/requestUserInput':'input'};
    const kind=Object.hasOwn(kinds,message.method)?kinds[message.method]:null;
    if(!kind){this.reply({id:message.id,error:{code:-32601,message:`Unsupported server request: ${message.method}`}});return false;}
    try {
      if(!record(p)||![p.threadId,p.turnId,p.itemId].every(nonempty))throw new Error('Missing approval scope');
      if(typeof message.id!=='string'&&typeof message.id!=='number')throw new Error('Unsupported request ID');
      if(this.pending.size>=1000)throw new Error('Too many pending approvals');
      for(const field of ['reason','command','cwd','grantRoot'])if(p[field]!=null&&typeof p[field]!=='string')throw new Error(`Invalid ${field}`);
      if([...this.pending.values()].some(entry=>entry.requestId===message.id))throw new Error('Duplicate server request ID');
      const entry={id:randomUUID(),kind,method:message.method,threadId:p.threadId,turnId:p.turnId,itemId:p.itemId,title:kind==='command'?'执行命令审批':kind==='file'?'文件修改审批':'回答问题',reason:p.reason??null,createdAt:Date.now()};
      if(kind==='input') {
        if(p.isBlocking!==undefined&&typeof p.isBlocking!=='boolean')throw new Error('Invalid blocking flag');
        if(!Array.isArray(p.questions)||!p.questions.length||p.questions.length>20)throw new Error('Unsupported question list');
        const ids=new Set();
        entry.questions=p.questions.map(q=>{
          if(!record(q)||!nonempty(q.id)||ids.has(q.id)||typeof q.header!=='string'||typeof q.question!=='string'||q.question.length>16000)throw new Error('Unsupported question schema');
          if(q.isOther!==undefined&&typeof q.isOther!=='boolean'||q.isSecret!==undefined&&typeof q.isSecret!=='boolean')throw new Error('Invalid question flags');
          if(q.options!=null&&(!Array.isArray(q.options)||q.options.length>100||q.options.some(o=>!record(o)||!nonempty(o.label)||typeof o.description!=='string')))throw new Error('Unsupported question options');
          ids.add(q.id);return clone(q);
        });
        entry.isBlocking=p.isBlocking??true;
      }else {
        const offered=p.availableDecisions;
        if(offered!=null&&(!Array.isArray(offered)||!offered.length||offered.some(d=>!decisionSupported(d,kind))))throw new Error('Unsupported approval decision schema');
        entry.availableDecisions=clone(offered??basicDecisions);
        if(p.kind!==undefined&&!['command','writeStdin'].includes(p.kind))throw new Error('Unsupported command approval kind');
        if(p.kind==='writeStdin')entry.title='终端输入审批';
        entry.actionKind=p.kind??kind;
        for(const field of ['command','cwd','commandActions','additionalPermissions','proposedExecpolicyAmendment','proposedNetworkPolicyAmendments','networkApprovalContext','changes','grantRoot','environmentId'])if(p[field]!==undefined)entry[field]=clone(p[field]);
      }
      this.pending.set(entry.id,{...entry,requestId:message.id});
      this.emit('change',{kind:'requested',approval:clone(entry)});return true;
    }catch(error){this.reply({id:message.id,error:{code:-32602,message:`Unsupported approval request: ${error.message}`}});this.emit('unsupported',{method:message.method,threadId:p?.threadId,message:error.message});return false;}
  }
  list(threadId){return [...this.pending.values()].filter(p=>!threadId||p.threadId===threadId).map(({requestId,...entry})=>clone(entry));}
  respond({approvalId,threadId,turnId,decision,answers}) {
    const entry=this.pending.get(approvalId);
    if(!entry)throw new Error('审批已失效或已经处理');
    if(entry.threadId!==threadId||entry.turnId!==turnId)throw new Error('审批会话或轮次不匹配');
    let result;
    if(entry.kind==='input') {
      if(decision!==undefined||!record(answers))throw new Error('请提交问题答案');
      const ids=entry.questions.map(q=>q.id);
      if(Object.keys(answers).length!==ids.length||Object.keys(answers).some(id=>!ids.includes(id)))throw new Error('问题答案不完整或含未知问题');
      for(const q of entry.questions) {
        const answer=answers[q.id];
        if(!keysOnly(answer,['answers'])||!Array.isArray(answer.answers)||answer.answers.length!==1||typeof answer.answers[0]!=='string'||!answer.answers[0].trim()||answer.answers[0].length>16000)throw new Error('每个问题需要一个有效答案');
        if(q.options?.length&&!q.isOther&&!q.options.some(option=>option.label===answer.answers[0]))throw new Error('答案不在可选项内');
      }
      result={answers:clone(answers)};
    }else {
      if(answers!==undefined||!entry.availableDecisions.some(d=>isDeepStrictEqual(d,decision)))throw new Error('该审批不允许此决定');
      result={decision:clone(decision)};
    }
    this.reply({id:entry.requestId,result});this.pending.delete(approvalId);
    this.emit('change',{kind:'resolved',approval:{id:entry.id,threadId,turnId}});return {resolved:true};
  }
  resolved({threadId,requestId}) {
    for(const [id,entry] of this.pending)if(entry.threadId===threadId&&entry.requestId===requestId){this.pending.delete(id);this.emit('change',{kind:'resolved',approval:{id,threadId,turnId:entry.turnId}});}
  }
  clear(){if(this.pending.size){this.pending.clear();this.emit('change',{kind:'closed'});}}
}

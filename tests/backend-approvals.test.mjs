import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {ApprovalQueue} from '../server/approval-queue.mjs';
import {CodexRpc} from '../server/codex-rpc.mjs';

const scope={threadId:'thread-1',turnId:'turn-1',itemId:'item-1'};
const request=(method='item/commandExecution/requestApproval',extra={})=>({id:71,method,params:{...scope,...extra}});
const fixture=()=>{const replies=[];return {replies,queue:new ApprovalQueue(reply=>replies.push(reply))};};
const response=(queue,extra={})=>({approvalId:queue.list()[0].id,threadId:scope.threadId,turnId:scope.turnId,...extra});

test('command approval does not reply before explicit matching user response',()=>{
  const {queue,replies}=fixture();queue.receive(request(undefined,{command:'Get-ChildItem',cwd:'D:\\synthetic'}));
  assert.deepEqual(replies,[]);assert.equal(queue.list('another').length,0);
  assert.throws(()=>queue.respond(response(queue,{threadId:'another',decision:'accept'})),/不匹配/);
  assert.deepEqual(replies,[]);
  const args=response(queue,{decision:'decline'});assert.deepEqual(queue.respond(args),{resolved:true});
  assert.deepEqual(replies,[{id:71,result:{decision:'decline'}}]);assert.throws(()=>queue.respond(args),/失效/);
});

test('advertised policy objects cannot be widened or invented by renderer',()=>{
  const {queue,replies}=fixture();const decision={acceptWithExecpolicyAmendment:{execpolicy_amendment:['python','safe.py']}};
  queue.receive(request(undefined,{availableDecisions:[decision,'cancel']}));
  assert.throws(()=>queue.respond(response(queue,{decision:'acceptForSession'})),/不允许/);
  assert.throws(()=>queue.respond(response(queue,{decision:{acceptWithExecpolicyAmendment:{execpolicy_amendment:['python']}}})),/不允许/);
  queue.respond(response(queue,{decision:structuredClone(decision)}));assert.deepEqual(replies[0].result,{decision});
});

test('file approval emits the exact protocol decision only after user input',()=>{
  const {queue,replies}=fixture();queue.receive(request('item/fileChange/requestApproval',{grantRoot:'D:\\synthetic'}));
  assert.equal(replies.length,0);assert.equal(queue.list()[0].grantRoot,'D:\\synthetic');
  queue.respond(response(queue,{decision:'cancel'}));assert.deepEqual(replies[0],{id:71,result:{decision:'cancel'}});
});

test('requestUserInput validates all question ids and selectable answers',()=>{
  const {queue,replies}=fixture();queue.receive(request('item/tool/requestUserInput',{isBlocking:true,questions:[{id:'plan',header:'Plan',question:'Choose',options:[{label:'A',description:'first'}],isOther:false},{id:'detail',header:'Detail',question:'Explain',options:null,isOther:true}]}));
  assert.equal(replies.length,0);
  assert.throws(()=>queue.respond(response(queue,{answers:{plan:{answers:['A']}}})),/不完整/);
  assert.throws(()=>queue.respond(response(queue,{answers:{plan:{answers:['B']},detail:{answers:['detail']}}})),/可选项/);
  const answers={plan:{answers:['A']},detail:{answers:['explicit detail']}};
  queue.respond(response(queue,{answers}));assert.deepEqual(replies[0].result,{answers});
});

test('unknown request methods and evolving decision schemas fail closed',()=>{
  const {queue,replies}=fixture();queue.receive(request('item/permissions/requestApproval'));
  queue.receive({...request('constructor'),id:74});
  queue.receive({...request(undefined,{availableDecisions:[{unknownFutureGrant:{all:true}}]}),id:72});
  queue.receive({...request('item/tool/requestUserInput',{questions:[{id:'a',header:'a',question:'q',options:[{text:'unknown'}]}]}),id:73});
  assert.deepEqual(replies.map(reply=>reply.error.code),[-32601,-32601,-32602,-32602]);assert.equal(queue.list().length,0);
});

test('resolved notification and disconnect remove stale approvals without invented decisions',()=>{
  const {queue,replies}=fixture();queue.receive(request());queue.resolved({threadId:scope.threadId,requestId:71});assert.equal(queue.list().length,0);
  queue.receive({...request(),id:72});queue.clear();assert.equal(queue.list().length,0);assert.equal(replies.length,0);
});

test('RPC retains inherited settings and kills only its spawned child',async()=>{
  const writes=[],spawnCalls=[];let killed=0;
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.killed=false;
  child.stdin=new Writable({write(chunk,_encoding,callback){const message=JSON.parse(String(chunk));writes.push(message);if(message.method==='initialize')queueMicrotask(()=>child.stdout.write(JSON.stringify({id:message.id,result:{userAgent:'synthetic'}})+'\n'));callback();}});
  child.kill=()=>{killed++;child.killed=true;};
  const rpc=new CodexRpc({command:'synthetic-codex',spawnProcess:(...args)=>{spawnCalls.push(args);return child;}});
  await rpc.connect();
  assert.deepEqual(spawnCalls[0],['synthetic-codex',['app-server','--stdio'],{windowsHide:true,stdio:['pipe','pipe','pipe']}]);
  rpc.handleMessage(request());assert.equal(writes.filter(w=>w.id===71).length,0);
  const approval=rpc.listApprovals()[0];rpc.respondApproval({approvalId:approval.id,threadId:scope.threadId,turnId:scope.turnId,decision:'decline'});
  assert.deepEqual(writes.at(-1),{id:71,result:{decision:'decline'}});rpc.close();rpc.close();assert.equal(killed,1);assert.equal(rpc.pending.size,0);
  await assert.rejects(rpc.call('thread/list',{}),/关闭/);
});

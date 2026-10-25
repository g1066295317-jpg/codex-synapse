import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {NativeBackend} from '../server/native-backend.mjs';
import {SessionService} from '../server/session-service.mjs';
import {WorkspaceService} from '../server/workspace-service.mjs';

const completed=id=>({id,status:'completed',items:[{id:'answer',type:'agentMessage',text:'Measured **Fourier coefficients** are preserved.'}]});
function fixture(handler=()=>({})){
  const calls=[],rpc=new EventEmitter();rpc.close=()=>{rpc.closed=true;};rpc.call=async(method,params)=>{calls.push({method,params});return handler(method,params);};
  const store={data:{version:1,nodes:{},branches:{}},async load(){return this.data;},async update(patch){this.data={...this.data,...patch,branches:{...this.data.branches,...patch.branches}};return this.data;}};
  return {rpc,store,calls,backend:new NativeBackend({rpc,store})};
}

test('backend is lazy and exposes a validated allowlist without arbitrary RPC',async()=>{
  const {backend,calls,store}=fixture();assert.equal(calls.length,0);
  for(const name of ['thread/archive','__proto__','constructor','unknown'])await assert.rejects(backend.call(name,{id:'root'}),/不支持/);
  await assert.rejects(backend.call('send_question',{id:'root',question:'safe',sandbox:'danger-full-access'}),/参数无效/);
  await assert.rejects(backend.call('stop_turn',{id:'..',turnId:'turn'}),/参数无效/);
  assert.equal(calls.length,0);
  const layout=await backend.call('save_canvas',{nodes:{one:{x:10,y:20}},view:{draft:'synthetic'}});assert.deepEqual(layout.nodes,store.data.nodes);
  await assert.rejects(backend.call('save_layout',{nodes:{one:{x:Infinity,y:0}}}),/参数无效/);
  backend.close();await assert.rejects(backend.call('list_sections'),/关闭/);
});

test('duplicate continuation and active turn are rejected without second model start',async()=>{
  let release;const blocked=new Promise(resolve=>release=resolve);
  const f=fixture(async(method)=>{
    if(method==='thread/read')return {thread:{id:'root',status:{type:'idle'}}};
    if(method==='thread/turns/list')return {data:[completed('old')]};
    if(method==='threadSection/list')return {data:[]};
    if(method==='thread/resume'){await blocked;return {thread:{id:'root',status:{type:'idle'}}};}
    if(method==='turn/start')return {turn:{id:'running',status:'inProgress',items:[]}};
    return {};
  });
  const first=f.backend.call('send_question',{id:'root',question:'one'});
  await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(f.backend.call('send_question',{id:'root',question:'duplicate'}),/正在提交/);
  release();await first;
  await assert.rejects(f.backend.call('send_question',{id:'root',question:'second'}),/仍在生成/);
  assert.equal(f.calls.filter(c=>c.method==='turn/start').length,1);f.backend.close();
});

test('active native thread blocks send even when latest loaded turn is completed',async()=>{
  const f=fixture(method=>method==='thread/read'?{thread:{id:'root',status:{type:'active',activeFlags:[]}}}:method==='thread/turns/list'?{data:[completed('old')]}:method==='threadSection/list'?{data:[]}:{});
  await assert.rejects(f.backend.call('send_question',{id:'root',question:'one'}),/仍在生成/);assert.equal(f.calls.some(c=>c.method==='turn/start'),false);f.backend.close();
});

test('plain continuation never silently discards a supplied quote or historical anchor',async()=>{
  const f=fixture();
  await assert.rejects(f.backend.call('send_question',{id:'root',question:'followup',turnId:'latest',branch:false}),/需要创建分支/);
  await assert.rejects(f.backend.call('send_question',{id:'root',question:'followup',quote:'selected excerpt',branch:false}),/需要创建分支/);
  await assert.rejects(f.backend.call('send_question',{id:'root',question:'followup',turnId:'historical',quote:'selected excerpt',branch:false}),/需要创建分支/);
  assert.equal(f.calls.length,0);f.backend.close();
});

test('historical fork validates exact completed source and passes lastTurnId',async()=>{
  const f=fixture((method,params)=>{
    if(method==='thread/turns/list')return params.cursor?{data:[completed('historical')],nextCursor:null}:{data:[completed('newer')],nextCursor:'older-page'};
    if(method==='thread/fork')return {thread:{id:'child',forkedFromId:'root'}};
    if(method==='turn/start')return {turn:{id:'child-turn',status:'inProgress',items:[]}};
    return {};
  });
  const result=await f.backend.call('send_question',{id:'root',question:'Why?',turnId:'historical',quote:'Fourier coefficients',branch:true});
  assert.equal(result.accepted,true);assert.equal(result.thread.id,'child');
  assert.deepEqual(f.calls.find(c=>c.method==='thread/fork').params,{threadId:'root',lastTurnId:'historical',excludeTurns:true,deferGoalContinuation:true});
  assert.equal(f.calls.find(c=>c.method==='turn/start').params.threadId,'child');assert.equal(f.store.data.branches.child.turnId,'historical');
  assert.match(f.calls.find(c=>c.method==='turn/start').params.input[0].text,/Fourier coefficients/);f.backend.close();
});

test('invented quote or unfinished source fails before creating a branch',async()=>{
  const f=fixture(method=>method==='thread/turns/list'?{data:[completed('source'),{id:'busy',status:'inProgress',items:[]}]}:{});
  await assert.rejects(f.backend.call('fork_session',{id:'root',turnId:'source',quote:'invented'}),/引用/);
  await assert.rejects(f.backend.call('fork_session',{id:'root',turnId:'busy'}),/已完成/);
  assert.equal(f.calls.some(c=>c.method==='thread/fork'),false);f.backend.close();
});

test('branch title failure preserves accepted=true when model input succeeded',async()=>{
  const f=fixture(method=>{
    if(method==='thread/turns/list')return {data:[completed('source')]};
    if(method==='thread/fork')return {thread:{id:'child'}};
    if(method==='thread/name/set')throw new Error('synthetic title failure');
    if(method==='turn/start')return {turn:{id:'next',status:'inProgress'}};
    return {};
  });
  const result=await f.backend.call('fork_session',{id:'root',turnId:'source',question:'question',name:'name',send:true});
  assert.equal(result.accepted,true);assert.match(result.warning,/命名失败/);assert.equal(f.store.data.branches.child.sent,true);f.backend.close();
});

test('generation errors without a cached turn are visible and persisted completion wins',async()=>{
  const f=fixture();const workspace=new WorkspaceService({rpc:f.rpc,store:f.store,read:async()=>({thread:{id:'root'},turns:[completed('t')]})});
  workspace.event({method:'error',params:{threadId:'root',error:{message:'synthetic failure'}}});
  workspace.event({method:'turn/started',params:{threadId:'root',turn:{id:'t',status:'inProgress',items:[]}}});
  const result=await workspace.read('root');assert.equal(result.warning,'synthetic failure');assert.equal(result.turns[0].status,'completed');assert.equal(result.turns[0].items[0].text,completed('t').items[0].text);
  workspace.close();f.backend.close();
});

test('legacy read preserves native chronological order and does not fabricate pagination',async()=>{
  const rpc={call:async(method,params)=>{
    if(method==='thread/read')return {thread:{id:'root',turns:[completed('first'),completed('second')]}};
    if(method==='thread/turns/list')throw new Error('unsupported');
    if(method==='threadSection/list')return {data:[]};
  }};
  const service=new SessionService(rpc,{});assert.deepEqual((await service.read('root')).turns.map(t=>t.id),['first','second']);
  await assert.rejects(service.read('root','cursor'),/不支持历史分页/);
});

test('real ancestry is read from native metadata while unrelated similar chats stay separate',async()=>{
  const f=fixture((method,params)=>{
    if(method==='thread/list')return {data:[{id:'root',name:'same'},{id:'child',name:'same'},{id:'unrelated',name:'same'}],nextCursor:null};
    if(method==='thread/read')return {thread:{id:params.threadId,forkedFromId:params.threadId==='child'?'root':null}};
    if(method==='thread/turns/list')return {data:[completed(params.threadId+'-turn')]};
    if(method==='threadSection/list')return {data:[]};return {};
  });
  const result=await f.backend.call('workspace_snapshot',{id:'root'});assert.deepEqual(Object.keys(result.histories).sort(),['child','root']);f.backend.close();
});

test('initial snapshot chooses the first chat and includes its fork family immediately',async()=>{
  const f=fixture((method,params)=>{
    if(method==='thread/list')return {data:[{id:'root'},{id:'child',forkedFromId:'root'},{id:'unrelated'}]};
    if(method==='thread/read')return {thread:{id:params.threadId,forkedFromId:params.threadId==='child'?'root':null}};
    if(method==='thread/turns/list')return {data:[completed(params.threadId+'-turn')]};
    if(method==='threadSection/list')return {data:[]};return {};
  });
  const result=await f.backend.call('workspace_snapshot');
  assert.equal(result.selectedId,'root');assert.deepEqual(Object.keys(result.histories).sort(),['child','root']);f.backend.close();
});

test('initial snapshot restores an existing saved chat outside the first list page and its family',async()=>{
  const f=fixture((method,params)=>{
    if(method==='thread/list')return {data:[{id:'recent'},{id:'root'}],nextCursor:'next-page'};
    if(method==='thread/read')return {thread:{id:params.threadId,forkedFromId:params.threadId==='saved-child'?'root':null}};
    if(method==='thread/turns/list')return {data:[completed(params.threadId+'-turn')]};
    if(method==='threadSection/list')return {data:[]};return {};
  });
  f.store.data.view={selectedId:'saved-child'};
  const result=await f.backend.call('workspace_snapshot');
  assert.equal(result.selectedId,'saved-child');assert.equal(result.threads[0].id,'saved-child');assert.deepEqual(Object.keys(result.histories).sort(),['root','saved-child']);assert.equal(result.nextCursor,'next-page');f.backend.close();
});

test('missing saved selection falls back but explicit selection errors remain visible',async()=>{
  const f=fixture((method,params)=>{
    if(method==='thread/list')return {data:[{id:'root'},{id:'child',forkedFromId:'root'}]};
    if(method==='thread/read'){if(params.threadId==='missing')throw new Error('synthetic selected chat not found');return {thread:{id:params.threadId,forkedFromId:params.threadId==='child'?'root':null}};}
    if(method==='thread/turns/list')return {data:[completed(params.threadId+'-turn')]};
    if(method==='threadSection/list')return {data:[]};return {};
  });
  f.store.data.view={selectedId:'missing'};
  const result=await f.backend.call('workspace_snapshot');assert.equal(result.selectedId,'root');assert.deepEqual(Object.keys(result.histories).sort(),['child','root']);
  await assert.rejects(f.backend.call('workspace_snapshot',{id:'missing'}),/synthetic selected chat not found/);f.backend.close();
});

test('empty initial snapshot has a null selection without reading a chat',async()=>{
  const f=fixture(method=>method==='thread/list'||method==='threadSection/list'?{data:[]}:{});
  const result=await f.backend.call('workspace_snapshot');assert.equal(result.selectedId,null);assert.deepEqual(result.histories,{});assert.equal(f.calls.some(call=>call.method==='thread/read'),false);f.backend.close();
});

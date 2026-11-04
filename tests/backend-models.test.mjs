import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {NativeBackend} from '../server/native-backend.mjs';

const fixture=()=>{
  const calls=[],rpc=new EventEmitter(),store={data:{branches:{},view:{}},load:async()=>store.data,update:async patch=>(store.data={...store.data,...patch})};
  rpc.listApprovals=()=>[];rpc.close=()=>{};
  rpc.call=async(method,params)=>{
    calls.push({method,params});
    if(method==='model/list')return params.cursor?{data:[{id:'two',model:'model-two',displayName:'Second',hidden:false}],nextCursor:null}:{data:[{id:'one',model:'model-one',displayName:'First',hidden:false},{id:'hidden',model:'hidden',hidden:true}],nextCursor:'next'};
    if(method==='thread/turns/list')return{data:[{id:'anchor',status:'completed',items:[]}]};
    if(method==='thread/read')return{thread:{id:params.threadId,status:{type:'idle'}}};
    if(method==='threadSection/list')return{data:[]};
    if(method==='thread/fork')return{thread:{id:'child'}};
    if(method==='thread/start')return{thread:{id:'new'}};
    if(method==='turn/start')return{turn:{id:'accepted',status:'inProgress',items:[]}};
    return{};
  };
  return{backend:new NativeBackend({rpc,store}),calls};
};

test('model picker catalogs use native pagination, filter hidden models and can refresh',async()=>{
  const {backend,calls}=fixture();const result=await backend.call('list_models');
  assert.deepEqual(result.data.map(model=>model.model),['model-one','model-two']);assert.ok(!calls.some(call=>call.method==='thread/start'));
  await backend.call('list_models');assert.equal(calls.length,2);await backend.call('list_models',{refresh:true});assert.equal(calls.length,4);backend.close();
});

test('chosen model reaches continuation, historical branch and new conversation before generation',async()=>{
  for(const args of [{id:'root',question:'continue'},{id:'root',turnId:'anchor',branch:true,question:'branch'},{question:'new topic'}]){
    const {backend,calls}=fixture();await backend.call('send_question',{...args,model:'model-two'});
    assert.equal(calls.find(call=>call.method==='turn/start').params.model,'model-two');
    if(!args.id)assert.equal(calls.find(call=>call.method==='thread/start').params.model,'model-two');
    backend.close();
  }
});

test('unavailable models fail before a chat or branch is created and inheritance omits overrides',async()=>{
  const {backend,calls}=fixture();
  await assert.rejects(backend.call('send_question',{id:'root',turnId:'anchor',branch:true,question:'do not send',model:'unavailable'}),/不可用/);
  assert.ok(!calls.some(call=>['thread/fork','thread/start','turn/start','thread/resume'].includes(call.method)));
  await backend.call('send_question',{id:'root',question:'inherit'});assert.equal(Object.hasOwn(calls.find(call=>call.method==='turn/start').params,'model'),false);backend.close();
});

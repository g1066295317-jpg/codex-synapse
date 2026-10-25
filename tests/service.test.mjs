import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SessionService} from '../server/session-service.mjs';
import {LayoutStore} from '../server/layout-store.mjs';
import {buildGraph} from '../src/graph.mjs';
const fixture=()=>{
  const calls=[];
  const rpc={call:async(method,params)=>{
    calls.push({method,params});
    if(method==='thread/turns/list')return {data:[{id:'turn-one',status:'completed',items:[{type:'agentMessage',text:'Fourier sampling preserves measured coefficients.'}]}]};
    if(method==='thread/fork')return {thread:{id:'child-thread',forkedFromId:'parent-thread'}};
    if(method==='threadSection/list')return {data:[{id:'pinned-uuid',name:'Pinned'}]};
    return {};
  }};
  const store={data:{},update:async patch=>{store.data=patch}};
  return {service:new SessionService(rpc,store),calls,store};
};
test('quote fork uses the selected completed turn and never sends by default',async()=>{
  const {service,calls,store}=fixture();
  await service.fork({id:'parent-thread',turnId:'turn-one',quote:'measured coefficients',name:'a branch'});
  const fork=calls.find(c=>c.method==='thread/fork');
  assert.equal(fork.params.lastTurnId,'turn-one');assert.equal(fork.params.excludeTurns,true);
  assert.equal(calls.some(c=>c.method==='turn/start'),false);
  assert.equal(store.data.branches['child-thread'].parentId,'parent-thread');
});
test('forged quote and invalid name are rejected before creating a thread',async()=>{
  const {service,calls}=fixture();
  await assert.rejects(service.fork({id:'parent-thread',turnId:'turn-one',quote:'invented'}),/引用/);
  await assert.rejects(service.fork({id:'parent-thread',name:'x'.repeat(201)}),/文本/);
  assert.equal(calls.some(c=>c.method==='thread/fork'),false);
});
test('explicit sending carries quote and question in the child only',async()=>{
  const {service,calls}=fixture();
  await service.fork({id:'parent-thread',turnId:'turn-one',quote:'measured coefficients',question:'Why?',send:true});
  const send=calls.find(c=>c.method==='turn/start');assert.equal(send.params.threadId,'child-thread');
  assert.match(send.params.input[0].text,/measured coefficients/);assert.match(send.params.input[0].text,/Why\?/);
});
test('pin resolves the actual native Pinned section identity',async()=>{
  const {service,calls}=fixture();await service.move('parent-thread','pinned');
  assert.deepEqual(calls.at(-1),{method:'thread/section/move',params:{threadId:'parent-thread',sectionId:'pinned-uuid'}});
});
test('rendered Markdown selections can omit bold markers',async()=>{
  const {service,calls}=fixture();const original=service.rpc.call;
  service.rpc.call=async(m,p)=>m==='thread/turns/list'?{data:[{id:'turn-one',status:'completed',items:[{type:'agentMessage',text:'Use **measured coefficients** to preserve data.'}]}]}:original(m,p);
  await service.fork({id:'parent-thread',turnId:'turn-one',quote:'Use measured coefficients'});
  assert.ok(calls.some(c=>c.method==='thread/fork'));
});
test('concurrent position saves preserve both nodes across reload',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'synapse-layout-'));
  try{
    const store=new LayoutStore(dir);await store.load();
    await Promise.all([store.update({nodes:{a:{x:5,y:10}}}),store.update({nodes:{b:{x:15,y:20}}})]);
    assert.deepEqual((await new LayoutStore(dir).load()).nodes,{a:{x:5,y:10},b:{x:15,y:20}});
  }finally{await rm(dir,{recursive:true,force:true})}
});
test('graph draws only known actual fork relations and tolerates cyclic data',()=>{
  const threads=[{id:'a',forkedFromId:'b'},{id:'b',forkedFromId:'a'},{id:'c'}];
  const graph=buildGraph(threads,{nodes:{a:{x:3,y:4}},branches:{}},'a',()=>{});
  assert.equal(graph.edges.length,2);assert.deepEqual(graph.nodes[0].position,{x:3,y:4});assert.equal(graph.nodes[0].data.active,true);
});
test('existing fork ancestry is loaded from native metadata when list omits it',async()=>{
  const calls=[];const rpc={call:async(m,p)=>{
    calls.push(m);
    if(m==='thread/list')return {data:[{id:'parent'},{id:'child',forkedFromId:null}]};
    if(m==='threadSection/list')return {data:[]};
    if(m==='thread/read')return {thread:{id:p.threadId,forkedFromId:p.threadId==='child'?'parent':null}};
  }};
  const service=new SessionService(rpc,{});const page=await service.list();assert.equal(page.data[1].forkedFromId,'parent');
  await service.list();assert.equal(calls.filter(m=>m==='thread/read').length,2);
});

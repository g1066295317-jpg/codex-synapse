import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionService} from '../server/session-service.mjs';
import {readTurn} from '../server/turn-reader.mjs';
import {previewTurn} from '../shared/turn-preview.mjs';

const turn = id => ({id,status:'completed',items:[{type:'userMessage',content:[{type:'text',text:'Question'}]},{id:'answer',type:'agentMessage',text:'Answer '.repeat(3000)+'FULL_END'},{type:'reasoning',text:'PRIVATE_REASONING'},{id:'tool',type:'commandExecution',aggregatedOutput:'TOOL_OUTPUT'.repeat(10000)}]});

test('preview uses native summary history and excludes complete text, tool payloads and reasoning',async()=>{
  const calls=[];
  const rpc={call:async(method,params)=>{calls.push({method,params});if(method==='thread/read')return{thread:{id:'root'}};if(method==='thread/turns/list')return{data:[turn('t')],nextCursor:'older'};if(method==='threadSection/list')return{data:[]};throw new Error('Unexpected mutation');}};
  const result=await new SessionService(rpc,{}).read('root',undefined,'preview');
  assert.equal(calls.find(call=>call.method==='thread/turns/list').params.itemsView,'summary');
  assert.equal(result.turns[0].previewOnly,true);assert.equal(result.turns[0].toolCount,1);assert.equal(result.latestTurnId,'t');
  const json=JSON.stringify(result);assert.ok(json.length<4000);assert.ok(!/FULL_END|TOOL_OUTPUT|PRIVATE_REASONING/.test(json));assert.equal(result.nextCursor,'older');
});

test('one-turn details page only the selected turn and retain full answer and tool output',async()=>{
  const source=turn('target'),calls=[];
  const rpc={call:async(method,params)=>{calls.push({method,params});if(method==='thread/turns/list')return{data:[{id:'target',status:'completed',items:[]}],nextCursor:null};if(method==='thread/items/list')return params.cursor?{data:source.items.slice(2).map(item=>({turnId:'target',item})),nextCursor:null}:{data:source.items.slice(0,2).map(item=>({turnId:'target',item})),nextCursor:'items-2'};throw new Error('Unexpected mutation');}};
  const result=await readTurn(rpc,'root','target');
  assert.ok(JSON.stringify(result).includes('FULL_END'));assert.ok(JSON.stringify(result).includes('TOOL_OUTPUT'));assert.ok(!JSON.stringify(result).includes('PRIVATE_REASONING'));
  assert.equal(calls.length,3);assert.ok(calls.filter(call=>call.method==='thread/items/list').every(call=>call.params.turnId==='target'));assert.equal(calls[0].params.itemsView,'notLoaded');
});

test('mismatched items, repeated cursors and missing turns fail without resuming a thread',async()=>{
  const meta={data:[{id:'target',status:'completed',items:[]}]};
  await assert.rejects(readTurn({call:async method=>method==='thread/turns/list'?meta:{data:[{turnId:'wrong',item:{type:'agentMessage',text:'wrong'}}]}},'root','target'),/其他轮次/);
  await assert.rejects(readTurn({call:async method=>method==='thread/turns/list'?meta:{data:[],nextCursor:'repeat'}},'root','target'),/游标重复/);
  await assert.rejects(readTurn({call:async()=>({data:[],nextCursor:null})},'root','missing'),/已不存在/);
});

test('legacy details fall back to full pages and preview never truncates a formula in half',async()=>{
  const rpc={call:async(method,params)=>{if(method==='thread/items/list')throw new Error('unsupported item pagination');if(method==='thread/turns/list')return{data:[turn('target')],nextCursor:null};throw new Error('Unexpected call');}};
  assert.ok(JSON.stringify(await readTurn(rpc,'root','target')).includes('FULL_END'));
  const text='x'.repeat(800)+'\\['+'z'.repeat(100)+'\\]';
  const result=previewTurn({id:'math',status:'completed',items:[{type:'agentMessage',text:text}]});
  assert.ok(result.items[1].text.includes('z'.repeat(100)+'\\]'));assert.equal(text.length,904);
});

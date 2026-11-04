import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePreviewHistories,PREVIEW_TURN_LIMIT,PREVIEW_THREAD_LIMIT} from '../src/preview-history.mjs';
import {TurnDetailCache,loadTurnDetail} from '../src/turn-detail-cache.mjs';
import {turnGraph} from '../src/turn-graph.mjs';
import {questionTarget} from '../src/native-state.mjs';

const turn=(id,text=id)=>({id,status:'completed',items:[{type:'userMessage',content:[{type:'text',text:'Question '+id}]},{type:'agentMessage',text}]});
const history=(id,turns,parent)=>({thread:{id,...(parent?{forkedFromId:parent}:{})},turns,nextCursor:null,latestTurnId:turns.at(-1)?.id});

test('detail LRU evicts by count and estimated bytes, retains recency and skips oversized/running turns',()=>{
  const cache=new TurnDetailCache({entries:2,bytes:2000});cache.set('a',turn('a'));cache.set('b',turn('b'));cache.get('a');cache.set('c',turn('c'));
  assert.equal(cache.get('b'),undefined);assert.ok(cache.get('a'));assert.ok(cache.bytes<=2000);
  cache.set('huge',turn('huge','x'.repeat(10000)));assert.equal(cache.get('huge'),undefined);
  cache.set('busy',{...turn('busy'),status:'inProgress'});assert.equal(cache.get('busy'),undefined);
  for(let i=0;i<100;i++)cache.set(String(i),turn(String(i),'x'.repeat(300)));
  assert.ok(cache.entries.size<=2);assert.ok(cache.bytes<=2000);cache.clear();assert.equal(cache.bytes,0);
});

test('verified common native turns share one object while independent or different content stays separate',()=>{
  const input={root:history('root',[turn('a'),turn('b')]),child:history('child',[turn('a'),turn('c')],'root'),other:history('other',[turn('a')]),changed:history('changed',[turn('a','Different native content')],'root')};
  const result=mergePreviewHistories({},input);
  assert.equal(result.root.turns[0],result.child.turns[0]);assert.notEqual(result.root.turns[0],result.other.turns[0]);assert.notEqual(result.root.turns[0],result.changed.turns[0]);
  const refreshed=mergePreviewHistories(result,structuredClone(input));assert.equal(refreshed.root.turns[0],result.root.turns[0]);assert.equal(refreshed.child.turns[0],result.root.turns[0]);
  const cyclic=mergePreviewHistories({},{a:history('a',[turn('same')],'b'),b:history('b',[turn('same')],'a')});assert.notEqual(cyclic.a.turns[0],cyclic.b.turns[0]);
});

test('bounded older-history window remains readable through polling and returns latest only explicitly',()=>{
  const turns=Array.from({length:PREVIEW_TURN_LIMIT+20},(_,i)=>turn('t'+i));
  const recent=mergePreviewHistories({},{root:{...history('root',turns.slice(20)),nextCursor:'older'}});
  const old=mergePreviewHistories(recent,{root:{...history('root',turns.slice(0,20)),nextCursor:null}}, {},{olderId:'root'});
  assert.equal(old.root.turns.length,PREVIEW_TURN_LIMIT);assert.equal(old.root.turns[0].id,'t0');assert.equal(old.root.windowed,true);assert.equal(old.root.latestTurnId,'t139');
  const polled=mergePreviewHistories(old,{root:{...history('root',turns.slice(-12)),nextCursor:'older'}});
  assert.equal(polled.root.turns[0].id,'t0');assert.equal(polled.root.turns.at(-1).id,'t119');
  const graph=turnGraph(polled);assert.equal(questionTarget(graph,'root_t119','root',polled).historical,true);
  const reset=mergePreviewHistories(polled,{root:history('root',turns.slice(-12))},{},{resetId:'root'});assert.equal(reset.root.turns.length,12);assert.equal(reset.root.windowed,undefined);
});

test('preview family count is bounded and a shared suffix across different pages becomes one graph node',()=>{
  const many=Object.fromEntries(Array.from({length:100},(_,i)=>['s'+i,history('s'+i,[turn('t'+i)])]));assert.equal(Object.keys(mergePreviewHistories({},many)).length,PREVIEW_THREAD_LIMIT);
  const histories=mergePreviewHistories({},{root:history('root',[turn('b'),turn('c')]),child:history('child',[turn('a'),turn('b'),turn('new')],'root')});
  const graph=turnGraph(histories);assert.equal(graph.nodes.length,4);assert.equal(graph.paths.child[1],'root_b');assert.equal(graph.nodes.filter(node=>node.data.turn.id==='b').length,1);
});

test('an older controller detail fallback finds the correct turn and rejects a wrong modern response',async()=>{
  const calls=[];const call=async(name,args)=>{calls.push({name,args});if(name==='read_turn')throw new Error('不支持的画布操作');return args.cursor?{turns:[turn('old')],nextCursor:null}:{turns:[turn('new')],nextCursor:'older'};};
  assert.equal((await loadTurnDetail(call,'root','old')).id,'old');assert.equal(calls.length,3);
  await assert.rejects(loadTurnDetail(async()=>({threadId:'wrong',turn:turn('old')}),'root','old'),/不一致/);
});

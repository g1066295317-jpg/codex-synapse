import test from 'node:test';
import assert from 'node:assert/strict';
import {turnGraph} from '../src/turn-graph.mjs';
import {layoutTurns} from '../src/layout-turns.mjs';
import {mergePreviewHistories} from '../src/preview-history.mjs';
import {overviewText} from '../src/overview-text.mjs';
import {appendBranchLinks} from '../src/branch-links.mjs';

const turn = id => ({id,status:'completed',items:[{type:'userMessage',content:[{type:'text',text:'问题 '+id}]},{type:'agentMessage',text:'回答 '+id}]});
const history = (id,turns,parent) => ({thread:{id,...(parent?{forkedFromId:parent}:{})},turns:turns.map(turn)});
const noOverlaps = nodes => {
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    const a=nodes[i],b=nodes[j];
    assert.ok(Math.abs(a.position.x-b.position.x)>=370||Math.abs(a.position.y-b.position.y)>=400,`overlap: ${a.id} and ${b.id}`);
  }
};

test('merging shared suffixes with several roots uses non-overlapping slots and forward ranks',()=>{
  const input={root:history('root',['late-1','late-2']),a:history('a',['early-1','early-2','late-1','branch-a'],'root'),b:history('b',['early-1','early-2','branch-b'],'root'),c:history('c',['other-root','late-1','branch-c'],'root')};
  const normalized=mergePreviewHistories({},input),graph=turnGraph(normalized);
  assert.equal(graph.nodes.length,8);noOverlaps(graph.nodes);
  assert.equal(normalized.a.turns[0],normalized.b.turns[0]);
  assert.equal(graph.paths.a[0],graph.paths.b[0]);
  const positions=new Map(graph.nodes.map(node=>[node.id,node.position]));
  for(const edge of graph.edges)assert.ok(positions.get(edge.target).y>positions.get(edge.source).y);
  const reordered=turnGraph(mergePreviewHistories({},Object.fromEntries(Object.entries(input).reverse())));
  const byId=graph=>Object.fromEntries(graph.nodes.map(node=>[node.id,node.position]));
  assert.deepEqual(byId(graph),byId(reordered));
});

test('separate families and inconsistent copies stay separate and malformed cycles retain visible slots',()=>{
  const input={a:history('a',['same']),b:history('b',['same'])};
  assert.equal(turnGraph(mergePreviewHistories({},input)).nodes.length,2);
  const records=new Map(['a','b','c'].map(id=>[id,{id}]));
  const positions=layoutTurns(records,[{source:'a',target:'b'},{source:'b',target:'a'}]);
  assert.equal(positions.size,3);noOverlaps([...positions].map(([id,position])=>({id,position})));
});

test('zoomed-out excerpts retain the actual question and answer prose without rendering TeX or code',()=>{
  assert.equal(overviewText('**什么是软阈值？** $x_1$'),'什么是软阈值？ 〔公式〕');
  assert.ok(overviewText('软阈值会把较小的数压到零。\\[x=0\\]').includes('软阈值会把较小的数压到零。'));
  assert.ok(!overviewText('公式 \\(\\Phi x=y\\)').includes('\\Phi'));
  assert.equal(overviewText('```js\nconsole.log(1)\n```'),'〔代码〕');
  assert.ok(overviewText('长'.repeat(1000),120).length<=121);
});

test('failed and interrupted inherited turns never get connected backwards from the fork anchor',()=>{
  const first={...turn('failed-prefix'),status:'failed'},second={...turn('interrupted-prefix'),status:'interrupted'},anchor=turn('anchor');
  const input={root:{thread:{id:'root'},turns:[first,second,anchor]},child:{thread:{id:'child',forkedFromId:'root'},turns:structuredClone([first,second,anchor,turn('new')])}};
  const branches={child:{parentId:'root',turnId:'anchor'}},normalized=mergePreviewHistories({},input,branches),graph=turnGraph(normalized,branches);
  assert.equal(graph.nodes.length,4);assert.equal(graph.edges.length,3);assert.equal(normalized.root.turns[0],normalized.child.turns[0]);
  assert.deepEqual(graph.paths.child.slice(0,3),graph.paths.root);
  assert.ok(!graph.edges.some(edge=>edge.source==='root_anchor'&&edge.target.endsWith('_failed-prefix')));
  noOverlaps(graph.nodes);
  for(const edge of graph.edges){const a=graph.nodes.find(node=>node.id===edge.source),b=graph.nodes.find(node=>node.id===edge.target);assert.ok(b.position.y>a.position.y);}
});

test('anchor hints cannot close a cycle and malformed cycles keep downstream nodes in sequence',()=>{
  const keys=Array.from({length:32},(_,i)=>'n'+i),records=new Map(keys.map(id=>[id,{id}])),edges=keys.slice(1).map((id,i)=>({id:keys[i]+'>'+id,source:keys[i],target:id}));
  appendBranchLinks(records,edges,[{source:'n10',target:'n0'}]);assert.equal(edges.length,31);
  const positions=layoutTurns(records,[...edges,{source:'n1',target:'n0'}]);
  assert.ok(new Set([...positions.values()].map(position=>position.y)).size>20);
  noOverlaps([...positions].map(([id,position])=>({id,position})));
});

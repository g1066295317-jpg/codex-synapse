import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {turnGraph,descendants} from '../src/turn-graph.mjs';import {WorkspaceService} from '../server/workspace-service.mjs';
const turn=(id,q,a)=>({id,status:'completed',items:[{type:'userMessage',content:[{type:'text',text:q}]},{type:'agentMessage',text:a}]});
test('shared prefix becomes one node with two real successor paths',()=>{
 const first=turn('one','问题','回答');const histories={root:{thread:{id:'root'},turns:[first,turn('two','主线','主回答')]},child:{thread:{id:'child',forkedFromId:'root'},turns:[first,turn('branch','追问','分支回答')]}};
 const g=turnGraph(histories);assert.equal(g.nodes.length,3);assert.deepEqual(g.paths.child,['root_one','child_branch']);assert.equal(g.edges.filter(e=>e.source==='root_one').length,2);assert.equal(descendants('root_one',g.edges).size,2);
});
test('fork anchor connects when inherited history is outside loaded page',()=>{
 const g=turnGraph({root:{thread:{id:'root'},turns:[turn('one','x','y')]},child:{thread:{id:'child',forkedFromId:'root'},turns:[turn('two','q','a')]}},{child:{parentId:'root',turnId:'one'}});assert.equal(g.edges[0].source,'root_one');
});
test('live text replaces persisted turn and late response does not erase it',async()=>{
 const rpc=new EventEmitter();const w=new WorkspaceService({rpc,store:{},read:async()=>({turns:[]})});
 w.event({method:'turn/started',params:{threadId:'root',turn:{id:'live',status:'inProgress',items:[]}}});
 w.event({method:'item/agentMessage/delta',params:{threadId:'root',turnId:'live',itemId:'a',delta:'真实'}});w.event({method:'item/agentMessage/delta',params:{threadId:'root',turnId:'live',itemId:'a',delta:'回复'}});
 assert.equal((await w.read('root')).turns[0].items[0].text,'真实回复');
});
test('continuation resumes the same native thread and rejects a busy turn',async()=>{
 const rpc=new EventEmitter(),calls=[];rpc.call=async(m,p)=>{calls.push([m,p]);return m==='turn/start'?{turn:{id:'new',status:'inProgress',items:[]}}:{}};
 const w=new WorkspaceService({rpc,store:{},read:async()=>({turns:[]})});await w.send({id:'root',question:'追问'});assert.equal(calls[0][0],'thread/resume');assert.equal(calls[1][1].threadId,'root');
 await assert.rejects(w.send({id:'root',question:'重复'}),/仍在生成/);
});

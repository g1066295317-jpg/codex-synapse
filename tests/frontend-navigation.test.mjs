// All fixtures are synthetic; no calls to real Codex chats.
import test from 'node:test';import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';import {chromium} from '@playwright/test';
import {turnGraph} from '../src/turn-graph.mjs';import {contentBounds,scrollAxis} from '../src/scrollbar-metrics.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const turn=id=>({id,status:'completed',items:[]});
test('fixed automatic layout ignores old drag coordinates and survives reordered history responses',()=>{
 const first=turn('first'),histories={root:{thread:{id:'root',createdAt:1},turns:[first,turn('second')]},child:{thread:{id:'child',forkedFromId:'root',createdAt:2},turns:[first,turn('child-turn')]}};
 const before=turnGraph(histories,{}, {root_first:{x:9999,y:8888}});
 const reordered=turnGraph(Object.fromEntries(Object.entries(histories).reverse()));
 const positions=g=>Object.fromEntries(g.nodes.map(n=>[n.id,n.position]));assert.deepEqual(positions(before),positions(reordered));
 assert.notEqual(before.records.get('root_first').id,undefined);assert.notEqual(positions(before).root_first.x,9999);assert.ok(before.nodes.every(n=>n.draggable===false));
 histories.newChild={thread:{id:'newChild',forkedFromId:'root',createdAt:3},turns:[first,turn('new-turn')]};
 const after=turnGraph(histories);assert.equal(after.nodes.length,4);const siblings=after.nodes.filter(n=>n.position.y===520).map(n=>n.position.x).sort((a,b)=>a-b);
 assert.equal(siblings.length,3);for(let i=1;i<siblings.length;i++)assert.ok(siblings[i]-siblings[i-1]>=440);
});
test('scrollbar geometry is bounded and keeps its extent while panning outside the graph',()=>{
 const metric=scrollAxis(0,2000,100,500,1000);assert.ok(metric.thumb>=32&&metric.offset>=0&&metric.offset+metric.thumb<=metric.length);
 const outside=scrollAxis(0,1000,-5000,500,1000);const moved=scrollAxis(0,1000,-4500,500,1000,{min:outside.min,max:outside.maxStart+outside.visibleLength});assert.equal(moved.min,outside.min);assert.ok(moved.offset>outside.offset);
 const bounds=contentBounds([{position:{x:0,y:0},hidden:false},{position:{x:99999,y:99999},hidden:true}]);assert.equal(bounds.right,370);assert.equal(bounds.bottom,440);
});
const executablePath=[process.env.SYNAPSE_TEST_BROWSER,chromium.executablePath(),'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(path=>path&&existsSync(path));
test('edge bars pan without zoom, the wheel still zooms, nodes stay fixed and a new fork auto-arranges',{skip:!executablePath,timeout:45000},async()=>{
 const bundle=await build({entryPoints:[root+'src/native-entry.jsx'],bundle:true,write:false,format:'iife',globalName:'SynapseCanvas',platform:'browser',outfile:'navigation.js',minify:true,jsx:'automatic'});
 const browser=await chromium.launch({executablePath,headless:true});const report={};
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><html><body style="margin:0"><div id="fixture" style="width:1440px;height:1000px"></div></body></html>');
  await page.addStyleTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.css')).text});await page.addScriptTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.js')).text});
  await page.evaluate(()=>{
   const turn=(id,q)=>({id,status:'completed',items:[{type:'userMessage',content:[{type:'text',text:q}]},{type:'agentMessage',text:'这是一段用于自动排列与滚动条验证的合成回答。\n\n'.repeat(5)}]});
   const shared=turn('first','共同起点'),main={id:'nav-main',name:'主分支',createdAt:1},child={id:'nav-child',name:'已有分支',forkedFromId:'nav-main',createdAt:2};
   shared.items.push({type:'commandExecution',id:'synthetic-tool',command:'echo synthetic',aggregatedOutput:'合成工具日志\n'.repeat(100)});
   const data={threads:[main,child],histories:{[main.id]:{thread:main,turns:[shared,turn('second','主线问题')],nextCursor:null},[child.id]:{thread:child,turns:[shared,turn('child','分支问题')],nextCursor:null}},layout:{nodes:{'nav-main_first':{x:7777,y:8888}},branches:{},view:{sidebar:true,detail:false,viewport:{x:30,y:20,zoom:.9}}},selectedId:main.id,nextCursor:null};
   const calls=[];let context={threadId:main.id,canvasVisible:true,testing:true};
   const host={getContext:()=>context,onContextChange:()=>()=>{},onEvent:()=>()=>{},nativeChat:async()=>{},setActiveThread:id=>{context={...context,threadId:id};},call:async(name,args={})=>{
    calls.push({name,args:structuredClone(args)});
    if(name==='workspace_snapshot')return structuredClone(data);if(name==='read_session')return structuredClone(data.histories[args.id]);if(name==='list_approvals')return{approvals:[]};
    if(name==='save_layout'){data.layout={...data.layout,nodes:{...data.layout.nodes,...args.nodes},view:{...data.layout.view,...args.view}};return structuredClone(data.layout);}
    if(name==='send_question'){if(!args.branch)throw new Error('Synthetic test expects a fork');const source=data.histories[args.id],index=source.turns.findIndex(t=>t.id===args.turnId),thread={id:'nav-new',name:'新增分支',forkedFromId:args.id,createdAt:3},next=turn('new-turn',args.question);data.threads.push(thread);data.histories[thread.id]={thread,turns:[...source.turns.slice(0,index+1),next],nextCursor:null};data.layout.branches[thread.id]={parentId:args.id,turnId:args.turnId};return{thread,turn:next,accepted:true};}
    throw new Error('Synthetic navigation test cannot mutate live chats');
   }};window.navFixture={data,calls};window.SynapseCanvas.mount(document.getElementById('fixture'),host);
  });
  const camera=()=>page.evaluate(()=>{const m=new DOMMatrix(document.querySelector('.react-flow__viewport').style.transform);return{x:m.e,y:m.f,zoom:m.a};});
  await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length===3&&Math.abs(new DOMMatrix(document.querySelector('.react-flow__viewport').style.transform).a-.9)<.0001);
  const initial=await camera();
  for(const [label,dx,dy,property]of [['水平移动画布',50,0,'x'],['垂直移动画布',0,60,'y']]){
   const bar=page.getByRole('scrollbar',{name:label}),thumb=bar.locator('.canvas-scroll-thumb'),r=await thumb.boundingBox(),before=await camera(),direction=Number(await bar.getAttribute('aria-valuenow'))>50?-1:1;await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+dx*direction,r.y+r.height/2+dy*direction,{steps:8});await page.mouse.up();const after=await camera();report[label]={before,after};assert.ok(Math.abs(after[property]-before[property])>5,label);assert.ok(Math.abs(after.zoom-before.zoom)<.0001);
  }
  await page.mouse.move(1370,300);const beforeWheel=await camera();await page.mouse.wheel(0,-120);await page.waitForTimeout(350);assert.ok((await camera()).zoom>beforeWheel.zoom);report.wheelStillZooms=true;
  const answerPoint=await page.evaluate(()=>{const area=document.querySelector('.canvas-view').getBoundingClientRect();for(const e of document.querySelectorAll('.react-flow__node .answer-text')){const r=e.getBoundingClientRect(),top=Math.max(r.top,area.top+20),bottom=Math.min(r.bottom,area.bottom-30);if(bottom-top>15)return{x:Math.min(r.right-15,area.right-30),y:(top+bottom)/2};}return null;});assert.ok(answerPoint);await page.mouse.move(answerPoint.x,answerPoint.y);const cardWheel=await camera();await page.mouse.wheel(0,80);await page.waitForTimeout(350);assert.ok((await camera()).zoom<cardWheel.zoom);report.wheelOnCardWorks=true;
  const node=page.locator('.react-flow__node[data-id="nav-main_first"]'),heading=await node.locator('.node-heading >span').boundingBox();const worldBefore=await node.evaluate(e=>e.style.transform);await page.mouse.move(heading.x+30,heading.y+10);await page.mouse.down();await page.mouse.move(heading.x+120,heading.y+50,{steps:8});await page.mouse.up();assert.equal(await node.evaluate(e=>e.style.transform),worldBefore);report.nodesFixed=true;
  await node.locator('summary').click();await page.waitForTimeout(100);const card=await node.locator('.turn-card').boundingBox();assert.ok(card.height/(await camera()).zoom<=440.1);report.expandedPreviewFitsAutomaticRows=true;await node.locator('summary').click();
  await page.getByRole('button',{name:'主分支',exact:true}).click();const locateBefore=await camera();await page.getByRole('button',{name:'定位当前问答',exact:true}).click();await page.waitForTimeout(350);assert.ok(Math.abs((await camera()).zoom-locateBefore.zoom)<.0001);
  await page.getByRole('button',{name:'详情',exact:true}).click();await page.getByRole('button',{name:'继续当前会话',exact:true}).click();await page.getByRole('textbox',{name:'从这一轮探索另一个方向…'}).fill('合成新分支');const beforeNew=await camera();await page.getByRole('button',{name:'发送分支追问',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.map-title strong')?.textContent==='新增分支');await page.getByRole('button',{name:'定位当前问答',exact:true}).click();await page.waitForTimeout(400);
  assert.ok(Math.abs((await camera()).zoom-beforeNew.zoom)<.0001);const newNode=page.locator('.react-flow__node[data-id="nav-new_new-turn"]');await newNode.waitFor();const point=await newNode.evaluate(e=>{const m=new DOMMatrix(e.style.transform);return{x:m.e,y:m.f};});assert.equal(point.y,1040);report.newBranchAutoArranged=true;
  await page.waitForTimeout(750);const nodeWrites=await page.evaluate(()=>window.navFixture.calls.filter(c=>c.name==='save_layout'&&Object.keys(c.args.nodes||{}).length>0).length);assert.equal(nodeWrites,0);assert.equal(await page.evaluate(()=>window.navFixture.data.layout.nodes['nav-main_first'].x),7777);report.oldManualCoordinatesIgnoredWithoutDeletingData=true;
  await page.getByRole('button',{name:'关闭详情',exact:true}).click();await page.getByRole('button',{name:'适应画布',exact:true}).click();await page.waitForTimeout(400);
  if(process.env.SYNAPSE_NAV_SCREENSHOT)await page.screenshot({path:process.env.SYNAPSE_NAV_SCREENSHOT});assert.deepEqual(errors,[]);report.errors=errors;report.initialViewport=initial;
 }finally{if(process.env.SYNAPSE_NAV_REPORT)await writeFile(process.env.SYNAPSE_NAV_REPORT,JSON.stringify(report,null,2));await browser.close();}
});

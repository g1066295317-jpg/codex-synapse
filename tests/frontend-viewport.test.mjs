// Real browser interactions with synthetic fork history only; no Codex connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const root=fileURLToPath(new URL('../',import.meta.url));
const executablePath=[process.env.SYNAPSE_TEST_BROWSER,chromium.executablePath(),'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(path=>path&&existsSync(path));
const viewport=page=>page.evaluate(()=>{const m=new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform);return{x:m.e,y:m.f,zoom:m.a};});
const sameView=(before,after)=>{for(const key of ['x','y','zoom'])assert.ok(Math.abs(before[key]-after[key])<.0001,`${key} changed: ${before[key]} -> ${after[key]}`);};
test('fork selection preserves the user camera; only explicit fit changes zoom', {skip:!executablePath,timeout:45000},async()=>{
 const bundle=await build({entryPoints:[root+'src/native-entry.jsx'],bundle:true,write:false,format:'iife',globalName:'SynapseCanvas',platform:'browser',outfile:'viewport.js',jsx:'automatic',minify:true});
 const browser=await chromium.launch({executablePath,headless:true});
 const measurements=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><html><body style="margin:0"><div id="fixture" style="width:1440px;height:900px"></div></body></html>');
  await page.addStyleTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.css')).text});
  await page.addScriptTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.js')).text});
  await page.evaluate(()=>{
   const turn=(id,q)=>({id,status:'completed',items:[{type:'userMessage',content:[{type:'text',text:q}]},{type:'agentMessage',text:'这是一段用于真实测量节点高度的合成回答，点击分支应保留自己调整的阅读比例。\n\n'.repeat(6)}]});
   const first=turn('shared-1','共同起点'),parent={id:'camera-parent',name:'主分支',cwd:'D:\\Synthetic'},child={id:'camera-child',name:'对照分支',cwd:'D:\\Synthetic',forkedFromId:'camera-parent'};
   const data={threads:[parent,child],histories:{[parent.id]:{thread:parent,turns:[first,turn('parent-2','主线问题')],nextCursor:null},[child.id]:{thread:child,turns:[first,turn('child-2','分支问题')],nextCursor:null}},layout:{nodes:{},branches:{[child.id]:{parentId:parent.id,turnId:first.id}},view:{viewport:{x:24,y:20,zoom:1.1},sidebar:true,detail:false}},selectedId:parent.id,nextCursor:null};
   let context={threadId:parent.id,canvasVisible:true,testing:true};const listeners=[];
   const host={getContext:()=>context,onContextChange:fn=>(listeners.push(fn),()=>listeners.splice(listeners.indexOf(fn),1)),onEvent:()=>()=>{},setActiveThread:id=>{context={...context,threadId:id};},nativeChat:async()=>{},call:async(name,args={})=>{
    if(name==='workspace_snapshot')return structuredClone(data);
    if(name==='read_session')return structuredClone(data.histories[args.id]);
    if(name==='list_approvals')return{approvals:[]};
    if(name==='save_layout'){data.layout={...data.layout,nodes:{...data.layout.nodes,...args.nodes},view:{...data.layout.view,...args.view}};return structuredClone(data.layout);}
    throw new Error('Camera test cannot send or mutate chats');
   }};
   window.cameraFixture={host,setContext:patch=>{context={...context,...patch};for(const fn of [...listeners])fn(context);},data};window.SynapseCanvas.mount(document.getElementById('fixture'),host);
  });
  await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length===3&&Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a-1.1)<.0001);
  const initial=await viewport(page);
  const child=page.locator('.react-flow__node[data-id="camera-child_child-2"]');
  const parent=page.locator('.react-flow__node[data-id="camera-parent_parent-2"]');
  await child.locator('.node-heading > span').click();await page.waitForFunction(()=>document.querySelector('.map-title strong')?.textContent==='对照分支');await page.waitForTimeout(250);
  const afterChild=await viewport(page);measurements.push({action:'select-fork-node',before:initial,after:afterChild});sameView(initial,afterChild);
  await parent.locator('.node-heading > span').click();await page.waitForTimeout(250);sameView(initial,await viewport(page));
  await page.getByRole('button',{name:'对照分支',exact:true}).click();await page.waitForTimeout(300);sameView(initial,await viewport(page));
  await page.getByRole('button',{name:'主分支',exact:true}).click();await page.waitForTimeout(300);sameView(initial,await viewport(page));
  const area=await page.locator('.canvas-view').boundingBox();
  await page.mouse.move(area.x+area.width-20,area.y+300);await page.mouse.down();await page.mouse.move(area.x+area.width-20,area.y+80,{steps:8});await page.mouse.up();
  const panned=await viewport(page);assert.ok(panned.y<initial.y);assert.ok(Math.abs(panned.zoom-initial.zoom)<.0001);
  await child.getByRole('button',{name:'分支',exact:true}).click();await page.getByRole('textbox',{name:'从这一轮探索另一个方向…'}).waitFor();await page.waitForTimeout(300);
  const detail=await viewport(page);assert.ok(Math.abs(initial.zoom-detail.zoom)<.0001,'opening branch detail must not change zoom');
  await page.getByRole('button',{name:'关闭详情',exact:true}).click();
  await page.getByRole('button',{name:'适应画布',exact:true}).click();await page.waitForTimeout(400);const fitted=await viewport(page);assert.ok(Math.abs(fitted.zoom-initial.zoom)>.01,'explicit fit should remain functional');
  await page.locator('.react-flow__node').first().getByRole('button',{name:'居中显示',exact:true}).click();await page.waitForTimeout(400);const centered=await viewport(page);assert.ok(Math.abs(centered.zoom-fitted.zoom)<.0001,'center should pan without changing zoom');
  await page.waitForTimeout(2100);assert.ok(Math.abs((await viewport(page)).zoom-centered.zoom)<.0001,'background refresh must not reset zoom');
  await page.evaluate(()=>window.cameraFixture.setContext({canvasVisible:false}));await page.evaluate(()=>window.cameraFixture.setContext({canvasVisible:true}));await page.waitForTimeout(350);assert.ok(Math.abs((await viewport(page)).zoom-centered.zoom)<.0001,'native/canvas return must not reset zoom');
  measurements.push({action:'explicit-fit',after:fitted},{action:'center',after:centered});
  await page.evaluate(()=>{const element=document.getElementById('fixture');window.SynapseCanvas.unmount(element);element.style.display='none';window.cameraFixture.data.layout.view.viewport={x:500,y:-9000,zoom:1.23};window.SynapseCanvas.mount(element,window.cameraFixture.host);});
  await page.waitForFunction(()=>Math.abs(new DOMMatrix(document.querySelector('.react-flow__viewport').style.transform).a-1.23)<.0001);
  const restored=await page.evaluate(()=>{const m=new DOMMatrix(document.querySelector('.react-flow__viewport').style.transform);return{x:m.e,y:m.f,zoom:m.a};});sameView({x:500,y:-9000,zoom:1.23},restored);measurements.push({action:'restore-while-hidden',after:restored});
  assert.deepEqual(errors,[]);
 }finally{if(process.env.SYNAPSE_VIEWPORT_REPORT)await writeFile(process.env.SYNAPSE_VIEWPORT_REPORT,JSON.stringify(measurements,null,2));await browser.close();}
});

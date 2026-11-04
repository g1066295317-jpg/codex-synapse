// Synthetic renderer only. This test never starts Codex or reads user chats.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const root=fileURLToPath(new URL('../',import.meta.url));
const executablePath=[process.env.SYNAPSE_TEST_BROWSER,chromium.executablePath(),'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(path=>path&&existsSync(path));

test('large synthetic map loads previews, culls cards, reads details on click and ignores stale responses',{skip:!executablePath,timeout:45000},async()=>{
  const bundle=await build({entryPoints:[root+'src/native-entry.jsx'],bundle:true,write:false,platform:'browser',format:'iife',globalName:'SynapseCanvas',outfile:'lazy.js',jsx:'automatic',minify:true});
  const browser=await chromium.launch({executablePath,headless:true});
  const report={fixture:'synthetic-only',chatMutations:0,modelMessagesSent:0};
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.setContent('<!doctype html><html><body style="margin:0"><div id="fixture" style="width:1440px;height:1000px"></div></body></html>');
    await page.addStyleTag({content:bundle.outputFiles.find(file=>file.path.endsWith('.css')).text});
    await page.addScriptTag({content:bundle.outputFiles.find(file=>file.path.endsWith('.js')).text});
    await page.evaluate(()=>{
      const turn=i=>({id:'t'+i,status:'completed',previewOnly:true,toolCount:1,items:[{type:'userMessage',content:[{type:'text',text:'合成问题 '+i}]},{type:'agentMessage',text:'预览 $x_1$ · '+i}]});
      const thread={id:'lazy-root',name:'合成长会话',createdAt:1,updatedAt:100};
      const turns=Array.from({length:100},(_,i)=>turn(i));
      const data={previewProtocol:1,threads:[thread],histories:{[thread.id]:{thread,turns,nextCursor:null,latestTurnId:'t99'}},selectedId:thread.id,layout:{nodes:{},branches:{},view:{viewport:{x:30,y:20,zoom:1},detail:false}}};
      const calls=[],pending=new Map(),host={getContext:()=>({testing:true,threadId:thread.id,canvasVisible:true}),onContextChange:()=>()=>{},onEvent:()=>()=>{},setActiveThread:()=>{},nativeChat:async()=>{},call:async(name,args={})=>{
        calls.push({name,args});
        if(name==='workspace_snapshot')return structuredClone(data);
        if(name==='read_session')return structuredClone(data.histories[args.id]);
        if(name==='list_approvals')return{approvals:[]};
        if(name==='save_layout'){data.layout.view={...data.layout.view,...args.view};return structuredClone(data.layout);}
        if(name==='read_turn'){
          const i=Number(args.turnId.slice(1));
          if(i===1||i===2)await new Promise(resolve=>pending.set(args.turnId,resolve));
          return{threadId:args.id,turn:{...turn(i),previewOnly:false,items:[{type:'userMessage',content:[{type:'text',text:'完整问题 '+i}]},{type:'agentMessage',text:'完整回答 '+i+'\n\n'+('合成正文。'.repeat(400))+'\n\nFULL_END_'+i},{type:'commandExecution',command:'synthetic-only',aggregatedOutput:'FULL_TOOL_'+i}]}};
        }
        throw new Error('Synthetic lazy test forbids mutations');
      }};
      window.lazyFixture={calls,pending,data,started:performance.now()};window.SynapseCanvas.mount(document.getElementById('fixture'),host);
    });
    await page.locator('.turn-card').first().waitFor();
    Object.assign(report,await page.evaluate(()=>({firstCardsMs:performance.now()-window.lazyFixture.started,totalTurns:window.lazyFixture.data.histories['lazy-root'].turns.length,renderedCards:document.querySelectorAll('.react-flow__node').length,initialFullDetailReads:window.lazyFixture.calls.filter(call=>call.name==='read_turn').length})));
    assert.equal(report.initialFullDetailReads,0);assert.ok(report.renderedCards<10);
    assert.equal(await page.locator('.tool-details pre').count(),0);
    await page.locator('[data-id="lazy-root_t0"] .node-heading >span').click();
    await page.waitForFunction(()=>document.querySelector('.detail-pane')?.textContent.includes('FULL_END_0'));
    assert.equal(await page.locator('.detail-pane pre').count(),0);
    await page.locator('.detail-pane summary').click();
    await page.waitForFunction(()=>document.querySelector('.detail-pane pre')?.textContent.includes('FULL_TOOL_0'));
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await page.locator('[data-id="lazy-root_t0"] .node-heading >span').click();
    await page.waitForFunction(()=>document.querySelector('.detail-pane')?.textContent.includes('FULL_END_0'));
    assert.equal(await page.evaluate(()=>window.lazyFixture.calls.filter(call=>call.name==='read_turn'&&call.args.turnId==='t0').length),1);
    report.repeatedClickUsesCache=true;report.toolsRenderOnlyWhenExpanded=true;

    await page.getByRole('button',{name:'下一轮问答',exact:true}).click();
    await page.waitForFunction(()=>window.lazyFixture.pending.has('t1'));
    await page.getByRole('button',{name:'下一轮问答',exact:true}).click();
    await page.waitForFunction(()=>window.lazyFixture.pending.has('t2'));
    await page.evaluate(()=>window.lazyFixture.pending.get('t2')());
    await page.waitForFunction(()=>document.querySelector('.detail-pane')?.textContent.includes('FULL_END_2'));
    await page.evaluate(()=>window.lazyFixture.pending.get('t1')());
    await page.waitForTimeout(100);
    assert.ok((await page.locator('.detail-pane').textContent()).includes('FULL_END_2'));
    assert.ok(!(await page.locator('.detail-pane').textContent()).includes('FULL_END_1'));
    report.staleDetailIgnored=true;
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await page.getByRole('button',{name:'适应画布',exact:true}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.turn-card')].some(card=>card.dataset.previewMode==='overview'));
    assert.equal(await page.locator('.turn-card .math-markdown').count(),0);
    assert.ok((await page.locator('.node-overview').first().textContent()).includes('合成问题'));
    assert.ok((await page.locator('.node-overview').first().textContent()).includes('预览'));
    report.lowZoomSkipsMarkdown=true;
    await page.getByRole('button',{name:'恢复阅读视图',exact:true}).click();
    await page.waitForFunction(()=>Math.abs(new DOMMatrix(document.querySelector('.react-flow__viewport').style.transform).a-.85)<.0001);
    report.readingViewRestoresReadableZoom=true;
    assert.deepEqual(errors,[]);report.pageErrors=errors;
    if(process.env.SYNAPSE_PERF_SCREENSHOT)await page.screenshot({path:process.env.SYNAPSE_PERF_SCREENSHOT});
    await page.evaluate(()=>window.SynapseCanvas.unmount(document.getElementById('fixture')));
  } finally {if(process.env.SYNAPSE_PERF_REPORT)await writeFile(process.env.SYNAPSE_PERF_REPORT,JSON.stringify(report,null,2));await browser.close();}
});

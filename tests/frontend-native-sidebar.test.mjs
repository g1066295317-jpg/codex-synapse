import test from 'node:test';import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {installNativeSidebar} from '../runtime/native-sidebar.mjs';
const executablePath=[process.env.SYNAPSE_TEST_BROWSER,chromium.executablePath(),'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p=>p&&existsSync(p));
test('native sidebar folds only exact Synapse branches, restores on expand and survives native rerenders',{skip:!executablePath,timeout:30000},async()=>{
 const browser=await chromium.launch({executablePath,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:980,height:760}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://synapse-fixture.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head></head><body style="font:15px Segoe UI;background:#f8f6ef;margin:20px"><nav data-sidebar-navigation-root style="width:300px;border:1px solid #dedbd3;padding:12px"><h3>本机会话 · 合成演示</h3><section id="projects"><h4>项目</h4></section><section id="recent"><h4>最近</h4></section></nav><main id="native-chat" style="position:absolute;left:380px;top:30px">原生聊天内容保持不变</main></body></html>'}));
  await page.goto('http://synapse-fixture.test/');
  await page.evaluate(()=>{
   window.addSyntheticRow=(container,id,title,host='local')=>{const wrapper=document.createElement('span');wrapper.style.display='contents';const row=document.createElement('div');row.setAttribute('data-app-action-sidebar-thread-row','');row.setAttribute('data-app-action-sidebar-thread-id','local:'+id);row.setAttribute('data-app-action-sidebar-thread-kind','local');row.setAttribute('data-app-action-sidebar-thread-host-id',host);row.setAttribute('data-app-action-sidebar-thread-selected',String(id==='child-two'));row.setAttribute('role','button');row.tabIndex=0;row.textContent=title;row.style.cssText='padding:8px;margin:3px 0;background:#edeae1;border-radius:6px';wrapper.append(row);document.getElementById(container).append(wrapper);return row;};
   for(const list of ['projects','recent'])for(const id of ['root-thread','child-one','child-two','unrelated-thread'])window.addSyntheticRow(list,id,'同名研究聊天');
   window.addSyntheticRow('recent','child-one','其他主机同名聊天','other-host');window.addSyntheticRow('native-chat','child-one','正文中的同 ID 不处理');
  });
  await page.addScriptTag({content:`window.installSidebar=(${installNativeSidebar.toString()});window.sidebar=window.installSidebar();window.sidebar.update({'child-one':{parentId:'root-thread',quote:'PRIVATE_SYNTHETIC_QUOTE'},'child-two':{parentId:'child-one',question:'PRIVATE_SYNTHETIC_DRAFT'}});`});
  const info=()=>page.evaluate(()=>window.sidebar.getStatus());
  assert.deepEqual(await info(),{knownBranches:2,hiddenRows:4,groups:2});
  const rootRow=page.locator('#projects [data-app-action-sidebar-thread-id="local:root-thread"]');assert.ok(await rootRow.isVisible());assert.ok(await page.locator('#projects [data-app-action-sidebar-thread-id="local:unrelated-thread"]').isVisible());
  assert.ok(await page.locator('#recent [data-app-action-sidebar-thread-host-id="other-host"]').isVisible());assert.ok(await page.locator('#native-chat [data-app-action-sidebar-thread-id]').isVisible());
  const storage=await page.evaluate(()=>localStorage.getItem('synapse.native-sidebar.v1'));assert.ok(!storage.includes('PRIVATE_SYNTHETIC'));assert.ok(!storage.includes('同名研究聊天'));
  await page.getByRole('button',{name:'展开2条画布分支',exact:true}).first().click();assert.equal((await info()).hiddenRows,0);
  await page.evaluate(()=>{window.sidebar.uninstall();window.sidebar=window.installSidebar();});assert.equal((await info()).hiddenRows,0,'expanded state must survive reinstall');
  await page.getByRole('button',{name:'收起2条画布分支',exact:true}).first().click();assert.equal((await info()).hiddenRows,4);
  await page.evaluate(()=>{document.querySelector('#projects [data-app-action-sidebar-thread-id="local:child-one"]').parentElement.remove();window.addSyntheticRow('projects','child-one','同名研究聊天');});await page.waitForTimeout(150);assert.equal((await info()).hiddenRows,4);
  await page.evaluate(()=>{window.addSyntheticRow('recent','new-child','同名研究聊天');window.sidebar.update({'child-one':{parentId:'root-thread'},'child-two':{parentId:'child-one'},'new-child':{parentId:'root-thread'}});});assert.deepEqual(await info(),{knownBranches:3,hiddenRows:5,groups:2});
  if(process.env.SYNAPSE_SIDEBAR_SCREENSHOT)await page.screenshot({path:process.env.SYNAPSE_SIDEBAR_SCREENSHOT});
  await page.evaluate(()=>window.sidebar.uninstall());assert.equal(await page.locator('[data-synapse-branch-hidden]').count(),0);assert.equal(await page.locator('.synapse-native-branch-toggle').count(),0);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('orphan branches retain an expand entry and cyclic metadata never hides independent chats',{skip:!executablePath,timeout:20000},async()=>{
 const browser=await chromium.launch({executablePath,headless:true});try{const page=await browser.newPage();await page.setContent('<div data-sidebar-navigation-root><div data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:orphan-child" data-app-action-sidebar-thread-kind="local" data-app-action-sidebar-thread-host-id="local">合成分支</div><div data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:cycle-one" data-app-action-sidebar-thread-kind="local" data-app-action-sidebar-thread-host-id="local">独立入口</div></div>');await page.addScriptTag({content:`window.sidebar=(${installNativeSidebar.toString()})();window.sidebar.update({'orphan-child':{parentId:'unlisted-parent'},'cycle-one':{parentId:'cycle-two'},'cycle-two':{parentId:'cycle-one'}});`});assert.equal(await page.locator('[data-synapse-branch-hidden]').count(),1);await page.getByRole('button',{name:'展开1条画布分支',exact:true}).click();assert.equal(await page.locator('[data-synapse-branch-hidden]').count(),0);}finally{await browser.close();}
});

// Isolated about:blank renderer with synthetic data. Never connects to Codex.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const executablePath = [process.env.SYNAPSE_TEST_BROWSER, chromium.executablePath(), 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(path => path && existsSync(path));

test('synthetic host supports follow up, historical fork, quote, approval, native return and suspended polling', {skip: !executablePath, timeout: 45000}, async () => {
  const bundle = await build({entryPoints: [root + 'src/native-entry.jsx'], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'SynapseCanvas', outfile: 'synthetic.js', minify: true, jsx: 'automatic', define: {'process.env.NODE_ENV': JSON.stringify('production')}});
  const browser = await chromium.launch({executablePath, headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setContent('<!doctype html><html><body style="margin:0"><div id="fixture" style="width:1440px;height:900px"></div></body></html>');
    await page.addStyleTag({content: bundle.outputFiles.find(file => file.path.endsWith('.css')).text});
    await page.addScriptTag({content: bundle.outputFiles.find(file => file.path.endsWith('.js')).text});
    await page.evaluate(() => {
      const turn = (id, question, answer) => ({id, status: 'completed', items: [{type: 'userMessage', content: [{type: 'text', text: question}]}, {type: 'agentMessage', text: answer}]});
      const first = turn('t1', '合成问题一', '保留这一句用于引用测试。');
      const thread = {id: 'mock-main', name: '合成前端测试', cwd: 'D:\\Synthetic\\MRI'};
      const data = {threads: [thread], histories: {'mock-main': {thread, turns: [first, turn('t2', '合成问题二', '**合成回答二**')], nextCursor: null}}, layout: {nodes: {}, branches: {}, view: {detail: true}}};
      const calls = [], contextListeners = [], eventListeners = [];
      let counter = 0, approvals = [], context = {threadId: 'mock-main', testing: true, canvasVisible: true};
      const host = {
        getContext: () => context,
        onContextChange: fn => {contextListeners.push(fn); return () => contextListeners.splice(contextListeners.indexOf(fn), 1);},
        onEvent: fn => {eventListeners.push(fn); return () => eventListeners.splice(eventListeners.indexOf(fn), 1);},
        setActiveThread: id => {context = {...context, threadId: id};},
        nativeChat: id => {calls.push({name: 'nativeChat', args: {id}});},
        async call(name, args = {}) {
          calls.push({name, args: structuredClone(args)});
          if (name === 'workspace_snapshot') return structuredClone(data);
          if (name === 'read_session') return structuredClone(data.histories[args.id]);
          if (name === 'list_approvals') return {approvals: structuredClone(approvals.filter(item => item.threadId === args.id))};
          if (name === 'save_layout') {data.layout = {...data.layout, nodes: {...data.layout.nodes, ...args.nodes}, view: {...data.layout.view, ...args.view}}; return structuredClone(data.layout);}
          if (name === 'send_question') {
            if (!args.branch && (Object.hasOwn(args, 'turnId') || Object.hasOwn(args, 'quote'))) throw new Error('Continuation cannot carry an anchor or quote');
            if (args.quote) {
              const anchor = data.histories[args.id]?.turns.find(item => item.id === args.turnId);
              if (!anchor?.items.some(item => item.type === 'agentMessage' && item.text.includes(args.quote))) throw new Error('Quote must retain the selected source text');
            }
            let destination = args.id;
            if (args.branch) {
              destination = 'mock-fork-' + (++counter);
              const parent = data.histories[args.id];
              const anchor = parent.turns.findIndex(item => item.id === args.turnId);
              const child = {id: destination, name: '合成分支', forkedFromId: args.id, cwd: thread.cwd};
              data.threads.push(child);
              data.histories[destination] = {thread: child, turns: structuredClone(parent.turns.slice(0, anchor + 1)), nextCursor: null};
              data.layout.branches[destination] = {parentId: args.id, turnId: args.turnId};
            }
            const next = turn('generated-' + (++counter), args.question, '合成回复，只用于自动验收。');
            data.histories[destination].turns.push(next);
            return {thread: data.histories[destination].thread, turn: next, accepted: true};
          }
          if (name === 'respond_approval') {approvals = approvals.filter(item => item.id !== args.approvalId); return {resolved: true};}
          throw new Error('Unexpected synthetic action: ' + name);
        },
      };
      window.fixture = {data, calls, host, setContext: patch => {context = {...context, ...patch}; for (const listener of [...contextListeners]) listener(context);}, approval: item => {approvals = [item]; for (const listener of [...eventListeners]) listener({threadId: item.threadId, kind: 'approval'});}, listeners: () => ({context: contextListeners.length, event: eventListeners.length})};
      window.SynapseCanvas.mount(document.getElementById('fixture'), host);
    });
    await page.getByRole('textbox', {name: '继续当前会话…'}).waitFor();
    assert.ok(await page.locator('.react-flow__minimap').count());
    await page.getByRole('textbox', {name: '继续当前会话…'}).fill('模拟继续问题');
    await page.getByRole('button', {name: '发送问题', exact: true}).click();
    await page.waitForFunction(() => window.fixture.calls.some(call => call.name === 'send_question'));
    const continued = await page.evaluate(() => window.fixture.calls.find(call => call.name === 'send_question').args);
    assert.equal(continued.id, 'mock-main'); assert.equal(continued.branch, false); assert.equal(continued.question, '模拟继续问题');
    assert.ok(!Object.hasOwn(continued, 'turnId')); assert.ok(!Object.hasOwn(continued, 'quote'));

    await page.locator('.react-flow__node').filter({has: page.locator('[aria-label="问答节点 1"]')}).getByRole('button', {name: '查看完整', exact: true}).click();
    await page.getByRole('textbox', {name: '从这一轮探索另一个方向…'}).fill('模拟历史分支');
    await page.getByRole('button', {name: '发送分支追问', exact: true}).click();
    await page.waitForFunction(() => window.fixture.calls.filter(call => call.name === 'send_question').length === 2);
    const branched = await page.evaluate(() => window.fixture.calls.filter(call => call.name === 'send_question')[1].args);
    assert.equal(branched.id, 'mock-main'); assert.equal(branched.turnId, 't1'); assert.equal(branched.branch, true);
    await page.waitForFunction(() => document.querySelector('.detail-pane .answer-text')?.textContent.includes('合成回复'));

    await page.evaluate(() => {
      const answer = document.querySelector('.detail-pane .answer-text');
      const paragraph = answer.querySelector('p');
      const range = document.createRange(); range.selectNodeContents(paragraph);
      const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      answer.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
    });
    await page.getByRole('textbox', {name: '引用原文', exact: true}).fill('合成回复');
    await page.getByRole('textbox', {name: '从这一轮探索另一个方向…'}).fill('带引用的模拟追问');
    assert.equal(await page.getByRole('button', {name: '从此轮另开分支', exact: true}).isDisabled(), true);
    await page.getByRole('button', {name: '发送分支追问', exact: true}).click();
    await page.waitForFunction(() => window.fixture.calls.filter(call => call.name === 'send_question').length === 3);
    const quoted = await page.evaluate(() => window.fixture.calls.filter(call => call.name === 'send_question')[2].args);
    assert.equal(quoted.quote, '合成回复'); assert.equal(quoted.branch, true); assert.match(quoted.id, /^mock-fork-/);

    await page.evaluate(() => window.fixture.approval({id: 'synthetic-approval', kind: 'command', threadId: window.fixture.host.getContext().threadId, turnId: 'synthetic-turn', title: '合成命令审批', reason: '仅用于测试', command: 'echo synthetic', availableDecisions: ['accept', 'decline']}));
    await page.getByRole('button', {name: '允许本次', exact: true}).click();
    await page.waitForFunction(() => window.fixture.calls.some(call => call.name === 'respond_approval'));
    const approved = await page.evaluate(() => window.fixture.calls.find(call => call.name === 'respond_approval').args);
    assert.equal(approved.approvalId, 'synthetic-approval'); assert.equal(approved.decision, 'accept');

    await page.getByRole('button', {name: '原生聊天', exact: true}).click();
    assert.match(await page.evaluate(() => window.fixture.calls.find(call => call.name === 'nativeChat').args.id), /^mock-fork-/);
    await page.evaluate(() => window.fixture.setContext({canvasVisible: false}));
    await page.waitForTimeout(250);
    const hiddenReadCount = await page.evaluate(() => window.fixture.calls.filter(call => call.name === 'read_session').length);
    await page.waitForTimeout(2100);
    assert.equal(await page.evaluate(() => window.fixture.calls.filter(call => call.name === 'read_session').length), hiddenReadCount);
    await page.evaluate(() => window.fixture.setContext({canvasVisible: true}));
    await page.waitForFunction(count => window.fixture.calls.filter(call => call.name === 'read_session').length > count, hiddenReadCount);
    await page.evaluate(() => window.SynapseCanvas.unmount(document.getElementById('fixture')));
    assert.deepEqual(await page.evaluate(() => window.fixture.listeners()), {context: 0, event: 0});
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const container = document.getElementById('fixture'); container.style.width = '470px';
      window.fixture.data.layout.view = {detail: false};
      window.SynapseCanvas.mount(container, window.fixture.host);
    });
    await page.waitForFunction(() => {
      const card = document.querySelector('.turn-card.selected')?.getBoundingClientRect();
      const canvas = document.querySelector('.canvas-view')?.getBoundingClientRect();
      return !!card && !!canvas && card.width > 50 && card.x >= canvas.x && card.right <= canvas.right && card.y >= canvas.y && card.bottom <= canvas.bottom;
    });
    await page.evaluate(() => window.SynapseCanvas.unmount(document.getElementById('fixture')));
    assert.deepEqual(pageErrors, []);
  } finally {await browser.close();}
});

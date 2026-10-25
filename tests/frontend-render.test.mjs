import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import postcss from 'postcss';

const root = fileURLToPath(new URL('../', import.meta.url));

test('all native and ReactFlow CSS rules stay inside the injected root', async () => {
  for (const name of ['native.css', 'reactflow-scoped.css']) {
    const css = postcss.parse(await readFile(new URL('../src/' + name, import.meta.url), 'utf8'));
    css.walkRules(rule => {
      if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
      for (const selector of rule.selectors) assert.ok(selector.startsWith('.synapse-native-root'), name + ': ' + selector);
    });
  }
});

test('native entry bundles mount/unmount without an MCP bridge or automatic mounting', async () => {
  const result = await build({entryPoints: [root + 'src/native-entry.jsx'], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'SynapseCanvas', outfile: 'synthetic.js', minify: true, jsx: 'automatic', define: {'process.env.NODE_ENV': JSON.stringify('production')}, metafile: true});
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(!inputs.some(name => name.includes('bridge.mjs') || name.includes('ext-apps')));
  const entry = await readFile(new URL('../src/native-entry.jsx', import.meta.url), 'utf8');
  assert.match(entry, /export function mount\(container, host\)/);
  assert.match(entry, /export function unmount\(container\)/);
  assert.ok(!entry.includes('getElementById'));
});

test('synthetic detail rendering includes public messages and tools but no reasoning', async () => {
  const result = await build({stdin: {contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {TurnBody} from './src/TurnNode.jsx'; export function render(turn) {return renderToStaticMarkup(<TurnBody turn={turn}/>);}`, resolveDir: root, loader: 'jsx'}, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', define: {'process.env.NODE_ENV': JSON.stringify('production')}});
  const module = {exports: {}};
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const html = module.exports.render({id: 'fixture', status: 'completed', items: [{type: 'userMessage', content: [{type: 'text', text: '保留原问题'}]}, {type: 'agentMessage', text: '**原回答**\n\n`代码`'}, {type: 'reasoning', text: 'PRIVATE_SYNTHETIC_REASONING', summary: ['PRIVATE_SYNTHETIC_SUMMARY']}, {type: 'commandExecution', command: 'echo synthetic', aggregatedOutput: 'PUBLIC_SYNTHETIC_OUTPUT'}]});
  assert.ok(html.includes('保留原问题'));
  assert.ok(html.includes('<strong>原回答</strong>'));
  assert.ok(html.includes('echo synthetic'));
  assert.ok(html.includes('PUBLIC_SYNTHETIC_OUTPUT'));
  assert.ok(!html.includes('PRIVATE_SYNTHETIC_'));
});

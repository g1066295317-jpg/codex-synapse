import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import postcss from 'postcss';
import {chromium} from '@playwright/test';
import {normalizeMathDelimiters,mathPreview} from '../src/math-markdown.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const sample=String.raw`测量一致性：
\[\Phi x=y\]

稀疏先验帮助我们在与测量相符的候选图像中，优先选择在指定变换域里表示稀疏的图像。

因此，ISTA 中会出现：
\[
\min_x \underbrace{\frac12\|\Phi x-y\|_2^2}_{\text{要求符合测量}}
+\underbrace{\lambda\|\Psi x\|_1}_{\text{鼓励变换系数稀疏}}
\]

其中，\(\|\Psi x\|_1\) 是所有变换系数绝对值之和；\(\lambda\) 控制稀疏要求的强度。

常见 Markdown 公式也支持：$a_1+b^2$。
`;
test('backslash and dollar delimiters coexist without changing code samples or escaped text',()=>{
 assert.equal(normalizeMathDelimiters(String.raw`行内 \(x_1^2\) 和 $y$`),'行内 $x_1^2$ 和 $y$');
 assert.match(normalizeMathDelimiters(String.raw`\[\Phi x=y\]`),/\$\$\n\\Phi x=y\n\$\$/);
 for(const source of ['`\\(x\\)`','```latex\n\\[x\\]\n```',String.raw`\\(literal\\)`,'    \\(code\\)','成本 $5，公式稍后再写'])assert.equal(normalizeMathDelimiters(source),source);
 const open=String.raw`正在生成 \(\frac{1}`;assert.equal(normalizeMathDelimiters(open),open);
});
test('card preview does not cut a formula in half',()=>{
 const source='说明'.repeat(410)+String.raw` \(\frac{1}{2}+\underbrace{\Phi x}_{测量}\)`+'结尾'.repeat(100);
 const preview=mathPreview(source);assert.ok(preview.includes('underbrace'));assert.ok(preview.includes(String.fromCharCode(92)+')'));assert.ok(preview.endsWith('…'));
});
test('synthetic ISTA formulas render in both question and answer, including compact cards',async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {TurnBody} from './src/TurnNode.jsx';export function render(text,compact=false){return renderToStaticMarkup(<TurnBody compact={compact} turn={{id:'math',status:'completed',items:[{type:'userMessage',content:[{type:'text',text:'Question $x_1$'}]},{type:'agentMessage',text}]}}/>);}`,loader:'jsx',resolveDir:root},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic'});
 const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 for(const compact of [false,true]){
  const html=module.exports.render(sample,compact);assert.ok((html.match(/class="katex"/g)||[]).length>=6);assert.ok(html.includes('application/x-tex'));assert.ok(html.includes('underbrace'));assert.ok(!html.includes('katex-error'));
 }
 const hostile=module.exports.render(String.raw`\(\href{javascript:alert(1)}{x}\) <script>alert(1)</script>`);
 assert.ok(!hostile.includes('href="javascript:'));assert.ok(!hostile.includes('<script>'));
 const code=module.exports.render('```latex\n\\[x^2\\]\n```');assert.ok(code.includes('language-latex'));assert.ok(code.includes(String.fromCharCode(92)+'[x^2'+String.fromCharCode(92)+']'));
});
test('KaTeX styles are scoped and fonts have unique local data URLs',async()=>{
 const css=postcss.parse(await readFile(new URL('../src/katex-scoped.css',import.meta.url),'utf8'));
 css.walkRules(rule=>{for(const selector of rule.selectors)assert.ok(selector.startsWith('.synapse-native-root'));});
 const fonts=await readFile(new URL('../src/katex-fonts.mjs',import.meta.url),'utf8');assert.ok(fonts.includes('SynapseKaTeX_Main'));assert.ok(fonts.includes('data:font/woff2;base64,'));assert.ok(!fonts.includes('https://'));
});
const executablePath=[process.env.SYNAPSE_TEST_BROWSER,chromium.executablePath(),'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(path=>path&&existsSync(path));
test('math renders with loaded local fonts inside the native ShadowRoot at narrow width', {skip:!executablePath,timeout:30000},async()=>{
 const browser=await chromium.launch({executablePath,headless:true});
 try{
  const bundle=await build({entryPoints:[root+'src/native-entry.jsx'],bundle:true,write:false,format:'iife',globalName:'SynapseCanvas',platform:'browser',outfile:'math.js',jsx:'automatic',minify:true});
  const page=await browser.newPage({viewport:{width:560,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><html><body style="margin:0"><main id="host" style="height:100vh;width:100vw"></main></body></html>');
  await page.addScriptTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.js')).text});
  await page.evaluate(({css,text})=>{
   const shadow=document.getElementById('host').attachShadow({mode:'open'});const style=document.createElement('style');style.textContent=css;shadow.append(style);const surface=document.createElement('div');surface.style='width:100%;height:100%';shadow.append(surface);
   const thread={id:'synthetic-math',name:'ISTA · 公式渲染验证',cwd:'D:\\合成公式'};
   const history={thread,turns:[{id:'math-turn',status:'completed',items:[{type:'userMessage',content:[{type:'text',text:'如何理解 $\\Phi x=y$ 与 ISTA？'}]},{type:'agentMessage',text}]}],nextCursor:null};
   const snapshot={threads:[thread],histories:{[thread.id]:history},selectedId:thread.id,layout:{nodes:{},branches:{},view:{detail:true}},nextCursor:null};
   const host={getContext:()=>({testing:true,readOnly:true,threadId:thread.id,canvasVisible:true}),nativeChat:async()=>{},call:async name=>{if(name==='workspace_snapshot')return snapshot;if(name==='read_session')return history;if(name==='list_approvals')return{approvals:[]};throw new Error('Synthetic math test cannot mutate chats');}};
   window.SynapseCanvas.mount(surface,host);window.mathTestSurface=surface;
  },{css:bundle.outputFiles.find(f=>f.path.endsWith('.css')).text,text:sample});
  await page.locator('.detail-pane .katex').first().waitFor();
  await page.evaluate(()=>document.fonts.load('16px SynapseKaTeX_Main'));
  const check=await page.evaluate(()=>({loaded:[...document.fonts].filter(f=>f.family.includes('SynapseKaTeX_Main')&&f.status==='loaded').length,overflow:document.documentElement.scrollWidth>innerWidth,errors:document.getElementById('host').shadowRoot.querySelectorAll('.katex-error').length}));
  assert.ok(check.loaded>0);assert.equal(check.overflow,false);assert.equal(check.errors,0);assert.deepEqual(errors,[]);
  if(process.env.SYNAPSE_MATH_SCREENSHOT)await page.screenshot({path:process.env.SYNAPSE_MATH_SCREENSHOT});
  await page.evaluate(()=>window.SynapseCanvas.unmount(window.mathTestSurface));assert.equal(await page.locator('style[data-synapse-math-fonts]').count(),0);
 }finally{await browser.close();}
});

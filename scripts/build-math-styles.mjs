import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import postcss from 'postcss';

export async function buildMathStyles(){
  const require=createRequire(new URL('../src/MathMarkdown.jsx',import.meta.url));
  const katexRoot=dirname(require.resolve('katex/package.json'));
  const tree=postcss.parse(await readFile(join(katexRoot,'dist/katex.min.css'),'utf8'));
  const faces=[];
  const fontRules=[];tree.walkAtRules('font-face',rule=>fontRules.push(rule));
  for(const rule of fontRules){
    const src=rule.nodes.find(decl=>decl.prop==='src');
    const match=src.value.match(/url\((?:["'])?([^)'"\s]+\.woff2)(?:["'])?\)/);
    if(!match)throw new Error('KaTeX woff2 font missing');
    const bytes=await readFile(join(katexRoot,'dist',match[1]));
    src.value=`url("data:font/woff2;base64,${bytes.toString('base64')}") format("woff2")`;
    rule.walkDecls(decl=>{decl.value=decl.value.replace(/KaTeX_/g,'SynapseKaTeX_');});
    faces.push(rule.toString());rule.remove();
  }
  tree.walkRules(rule=>{rule.selectors=rule.selectors.map(selector=>'.synapse-native-root '+selector);});
  tree.walkDecls(decl=>{decl.value=decl.value.replace(/KaTeX_/g,'SynapseKaTeX_');});
  await writeFile('src/katex-scoped.css',tree.toString());
  await writeFile('src/katex-fonts.mjs','// Bundled local fonts; injected in the document because the canvas uses a ShadowRoot.\nexport const katexFontFaces='+JSON.stringify(faces.join('\n'))+';\n');
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/build-math-styles.mjs'))await buildMathStyles();

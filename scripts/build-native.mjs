import {build} from 'esbuild';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {buildMathStyles} from './build-math-styles.mjs';
await buildMathStyles();
await mkdir('dist',{recursive:true});
const browser=await build({entryPoints:['src/native-entry.jsx'],outfile:'dist/native-canvas.js',bundle:true,minify:true,format:'iife',globalName:'SynapseCanvas',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked',metafile:true});
// Keep Node built-ins external; no runtime npm installation is needed by the launcher.
const controller=await build({entryPoints:['runtime/controller.mjs'],outfile:'dist/controller.mjs',bundle:true,minify:false,format:'esm',platform:'node',target:'node22',packages:'bundle',legalComments:'linked',metafile:true});
const packageRoots=new Set();
for(const input of [...Object.keys(browser.metafile.inputs),...Object.keys(controller.metafile.inputs)]){const match=input.replace(/\\/g,'/').match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)/);if(match)packageRoots.add(resolve(match[1]));}
const notices=[];
for(const directory of [...packageRoots].sort()){
  const pkg=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));
  const files=(await readdir(directory)).filter(name=>/^(license|licence|copying|notice)(\.|$)/i.test(name));
  const licenses=await Promise.all(files.map(name=>readFile(join(directory,name),'utf8').catch(()=>'')));
  notices.push(`${pkg.name} ${pkg.version}\nDeclared license: ${typeof pkg.license==='string'?pkg.license:JSON.stringify(pkg.license)}\n${licenses.join('\n')}`);
}
await writeFile('dist/THIRD_PARTY_NOTICES.txt',notices.join('\n\n========================================\n\n'));
// Windows PowerShell 5.1 requires BOM for UTF-8 scripts containing Chinese.
const launcher='scripts/launch-native.ps1';
await writeFile(launcher,'\uFEFF'+(await readFile(launcher,'utf8')).replace(/^\uFEFF/,''));
console.log('Synapse native runtime and canvas built.');

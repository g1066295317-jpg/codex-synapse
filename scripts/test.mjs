import {mkdir,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=join(root,'.test-temp');await mkdir(temp,{recursive:true});
const tests=(await readdir(join(root,'tests'))).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>join(root,'tests',name));
const child=spawn(process.execPath,['--test',...tests],{cwd:root,env:{...process.env,TEMP:temp,TMP:temp},stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??1;if(signal)console.error(`Tests ended with ${signal}`);});


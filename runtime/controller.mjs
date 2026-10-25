import {spawn,execFile} from 'node:child_process';
import {createServer,connect} from 'node:net';
import {promisify} from 'node:util';
import {readFile,mkdir,writeFile,unlink} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Cdp,discover} from './cdp.mjs';
import {installNativeHost} from './native-host.mjs';
import {installNativeSidebar} from './native-sidebar.mjs';
import {nativeHandoffState} from './native-navigation.mjs';
import {NativeBackend} from '../server/native-backend.mjs';
import {DemoBackend} from './demo-backend.mjs';

const runFile=promisify(execFile);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const options=JSON.parse((await readFile(resolve(process.argv[2]),'utf8')).replace(/^\uFEFF/,''));
if(options.codexHome)process.env.CODEX_HOME=options.codexHome;
const profile=resolve(options.profile),dataDirectory=resolve(options.dataDirectory);
if(!options.executable||!profile.startsWith(root+'\\')&&!profile.startsWith(root+'/'))throw new Error('The enhanced client profile must stay inside this package');
await mkdir(profile,{recursive:true});await mkdir(dataDirectory,{recursive:true});
const pipe=process.platform==='win32'?`\\\\.\\pipe\\codex-synapse-${createHash('sha256').update(profile.toLowerCase()).digest('hex').slice(0,24)}`:join(dataDirectory,'controller.sock');
const signalExisting=()=>new Promise(resolveSignal=>{const socket=connect(pipe);let done=false;const end=v=>{if(done)return;done=true;socket.destroy();resolveSignal(v);};socket.on('connect',()=>socket.write('activate\n'));socket.on('data',bytes=>end(bytes.toString()==='ok'));socket.on('error',()=>end(false));socket.on('close',()=>end(false));socket.setTimeout(1500,()=>end(false));});
if(await signalExisting())process.exit(0);
let browser,app,backend,watcher,shuttingDown=false;
const clients=new Map(),binding='__synapse_'+randomBytes(12).toString('hex'),channel=randomBytes(24).toString('hex');
const methods=new Set(['workspace_snapshot','read_session','list_sessions','send_question','stop_generation','stop_turn','save_canvas','save_layout','fork_session','rename_session','move_session','archive_session','list_sections','create_section','list_approvals','respond_approval']);
const mutations=new Set(['send_question','stop_generation','stop_turn','fork_session','rename_session','move_session','archive_session','create_section','respond_approval']);
const deliver=(client,contextId,payload)=>client.evaluate(`window.__codexSynapse?.deliver(${JSON.stringify({channel,...payload})})`,contextId);
const broadcast=event=>{for(const entry of clients.values())entry.client.evaluate(`window.__codexSynapse?.deliver(${JSON.stringify({channel,event})})`).catch(()=>{});};
const getBackend=()=>{
  if(backend)return backend;
  backend=options.demo?new DemoBackend():new NativeBackend({dataDirectory,rpcOptions:{command:options.codexBin||'codex'}});
  backend.on('change',event=>broadcast({type:'change',...event}));backend.on('approval',event=>broadcast({type:'approval',...event}));
  return backend;
};
async function navigate(client,contextId,id){
  if(typeof id!=='string'||!/^[\w-]{8,100}$/.test(id))throw new Error('无效的会话标识');
  if(options.demo)throw new Error('演示会话没有对应的原生聊天');
  const open=async()=>{
    await client.evaluate(`window.dispatchEvent(new MessageEvent('message',{data:{type:'navigate-to-route',path:${JSON.stringify('/local/'+id)}}}))`,contextId);
    for(let n=0;n<60;n++){
      const state=await client.evaluate(`(${nativeHandoffState.toString()})(${JSON.stringify(id)},${n%5===0})`,contextId);
      if(state.sameThread&&!state.locked)return{opened:true};await delay(150);
    }
    throw new Error('原生聊天仍被其他窗口占用，请在那里关闭该会话后重试');
  };
  return backend?backend.withNativeHandoff(id,open):open();
}
async function attach(target){
  const client=await Cdp.connect(target.webSocketDebuggerUrl),contexts=new Map();
  const entry={client,script:null};clients.set(target.id,entry);
  client.on('disconnect',()=>clients.delete(target.id));
  client.on('Runtime.executionContextCreated',({context})=>contexts.set(context.id,context));
  client.on('Runtime.executionContextDestroyed',({executionContextId})=>contexts.delete(executionContextId));
  client.on('Runtime.executionContextsCleared',()=>contexts.clear());
  client.on('Runtime.bindingCalled',async event=>{
    if(event.name!==binding||event.payload.length>2_000_000)return;
    const context=contexts.get(event.executionContextId);
    if(!context?.auxData?.isDefault||context.auxData.frameId!==entry.frameId)return;
    let message;try{message=JSON.parse(event.payload);}catch{return;}
    if(message.channel!==channel||!Number.isSafeInteger(message.id)||message.id<1||typeof message.name!=='string'||!message.args||typeof message.args!=='object'||Array.isArray(message.args))return;
    try{
      let result;
      if(message.name==='load_canvas'){
        const [js,css]=await Promise.all([readFile(join(root,'dist/native-canvas.js'),'utf8'),readFile(join(root,'dist/native-canvas.css'),'utf8')]);
        await client.evaluate(js,event.executionContextId);await client.evaluate(`window.__codexSynapse?.setCss(${JSON.stringify(css)})`,event.executionContextId);result={loaded:true};
      }else if(message.name==='native_chat')result=await navigate(client,event.executionContextId,message.args.id);
      else{
        if(!methods.has(message.name))throw new Error('不支持的画布操作');
        if(options.readOnly&&mutations.has(message.name))throw new Error('此验证实例禁用了聊天修改');
        result=await getBackend().call(message.name,message.args);
      }
      await deliver(client,event.executionContextId,{id:message.id,result});
    }catch(error){await deliver(client,event.executionContextId,{id:message.id,error:error.message||'画布操作失败'}).catch(()=>{});}
  });
  await client.call('Runtime.enable');await client.call('Page.enable');
  const tree=await client.call('Page.getFrameTree');entry.frameId=tree.frameTree.frame.id;
  client.on('Page.frameNavigated',({frame})=>{if(!frame.parentId)entry.frameId=frame.id;});
  await client.call('Runtime.addBinding',{name:binding});
  const source=`window.__codexSynapse?.uninstall();window.__codexSynapseSidebar?.uninstall();(${installNativeSidebar.toString()})(${JSON.stringify({demo:!!options.demo})});(${installNativeHost.toString()})(${JSON.stringify({binding,channel,demo:!!options.demo,readOnly:!!options.readOnly})})`;
  entry.script=(await client.call('Page.addScriptToEvaluateOnNewDocument',{source})).identifier;
  await client.evaluate(source);
  if(options.initialCanvasMode==='canvas')await client.evaluate('window.__codexSynapse?.setMode("canvas")');
}
async function shutdown(){
  if(shuttingDown)return;shuttingDown=true;
  clearInterval(watcher);server.close();backend?.close();
  for(const {client,script}of clients.values()){await client.evaluate('window.__codexSynapse?.uninstall()').catch(()=>{});if(script)await client.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:script}).catch(()=>{});client.close();}
  await browser?.call('Browser.close').catch(()=>{});browser?.close();
  // The Owl tray can outlive Browser.close. Terminate only the child PID created here.
  if(app&&Number.isInteger(app.pid)&&!app.killed&&app.exitCode===null&&app.signalCode===null){if(process.platform==='win32')await runFile('taskkill.exe',['/PID',String(app.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});else app.kill();}
  await unlink(join(dataDirectory,'runtime-status.json')).catch(()=>{});process.exit(0);
}
const server=createServer(socket=>{let input='',handled=false;socket.setTimeout(1500,()=>socket.destroy());socket.on('error',()=>{});socket.on('data',bytes=>{if(handled)return;input+=bytes.toString();if(input==='activate\n'){handled=true;for(const {client}of clients.values())client.call('Page.bringToFront').catch(()=>{});socket.end('ok');}else if(input.length>24||input.includes('\n'))socket.destroy();});});
try{await new Promise((resolveListen,reject)=>{server.once('error',reject);server.listen(pipe,resolveListen);});}catch(error){if(error.code==='EADDRINUSE'&&await signalExisting())process.exit(0);throw error;}
try {
if(!options.adoptExisting){
 await unlink(join(profile,'DevToolsActivePort')).catch(()=>{});
 app=spawn(options.executable,[`--user-data-dir=${profile}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run'],{cwd:dirname(options.executable),env:{...process.env,CODEX_ELECTRON_USER_DATA_PATH:profile},windowsHide:false,stdio:'ignore'});
 app.on('error',()=>shutdown());
}else if(!Number.isInteger(options.existingAppPid)||!options.existingStartedAt)throw new Error('Existing enhanced window identity is required');
let found;
for(let n=0;n<160;n++){try{found=await discover(pathToFileURL(profile).href);if(found.targets.some(t=>t.type==='page'&&t.url==='app://-/index.html'))break;}catch{}await delay(250);}
if(!found)throw new Error('Codex did not expose a local interface in time');
browser=await Cdp.connect(found.browser);
await writeFile(join(dataDirectory,'runtime-status.json'),JSON.stringify({pid:process.pid,appPid:app?.pid??options.existingAppPid,demo:!!options.demo,readOnly:!!options.readOnly,startedAt:options.adoptExisting?options.existingStartedAt:new Date().toISOString(),controllerStartedAt:new Date().toISOString()}));
let polling=false,emptySince=null,discoveryFailures=0;
const poll=async()=>{if(polling||shuttingDown)return;polling=true;try{const {targets}=await discover(pathToFileURL(profile).href);discoveryFailures=0;const pages=targets.filter(t=>t.type==='page'&&t.url==='app://-/index.html');for(const t of pages)if(!clients.has(t.id)){try{await attach(t);}catch{clients.get(t.id)?.client.close();clients.delete(t.id);}}if(!pages.length){emptySince??=Date.now();if(Date.now()-emptySince>15000)await shutdown();}else emptySince=null;}catch{if(++discoveryFailures>=3)await shutdown();}finally{polling=false;}};
watcher=setInterval(poll,1000);await poll();
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}catch(error){process.stderr.write(`Codex Synapse startup failed: ${error.message}\n`);await shutdown();}

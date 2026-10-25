import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';

export async function discover(profile) {
  const lines=(await readFile(new URL('DevToolsActivePort',profile.endsWith('/')?profile:profile+'/'),'utf8')).trim().split(/\r?\n/);
  const port=Number(lines[0]);
  if(!Number.isInteger(port)||port<1||port>65535||!/^\/devtools\/browser\/[\w-]+$/.test(lines[1]))throw new Error('Invalid local debug endpoint');
  const response=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw new Error('Local application discovery failed');
  return {targets:await response.json(),browser:`ws://127.0.0.1:${port}${lines[1]}`};
}

export class Cdp extends EventEmitter {
  pending=new Map();sequence=0;closed=false;
  static async connect(url) {
    const parsed=new URL(url);
    if(parsed.protocol!=='ws:'||parsed.hostname!=='127.0.0.1')throw new Error('Only local app connections are accepted');
    const client=new Cdp();client.socket=new WebSocket(url);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client.socket.close();reject(new Error('Local app connection timed out'));},8000);client.socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});client.socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Cannot connect to local app'));},{once:true});});
    client.socket.addEventListener('message',event=>client.receive(event.data));
    client.socket.addEventListener('close',()=>client.finish());
    client.socket.addEventListener('error',()=>client.finish());
    return client;
  }
  receive(raw) {
    let message;try{message=JSON.parse(raw);}catch{return;}
    if(message.id!==undefined){const pending=this.pending.get(message.id);if(!pending)return;clearTimeout(pending.timer);this.pending.delete(message.id);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result);}
    else if(message.method)this.emit(message.method,message.params||{});
  }
  call(method,params={},timeoutMs=20000) {
    if(this.closed)return Promise.reject(new Error('Local app disconnected'));
    return new Promise((resolve,reject)=>{const id=++this.sequence;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Local app timed out: ${method}`));},timeoutMs);this.pending.set(id,{resolve,reject,timer});try{this.socket.send(JSON.stringify({id,method,params}));}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});
  }
  async evaluate(expression,contextId) {
    const result=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,...(contextId?{contextId}:{})});
    if(result.exceptionDetails)throw new Error('Native interface operation failed');
    return result.result?.value;
  }
  finish(){if(this.closed)return;this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Local app disconnected'));}this.pending.clear();this.emit('disconnect');}
  close(){this.finish();this.socket.close();}
}

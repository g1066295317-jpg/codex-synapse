// Serialized into the native document. It only reads routing/layout metadata.
export function installNativeHost(config) {
  if(window!==window.top||window.__codexSynapse)return;
  const pending=new Map(),contextListeners=new Set(),eventListeners=new Set(),patches=new Map();
  let sequence=0,disposed=false,queued=false,currentHeader=null,resizeObserver=null,loadPromise=null,mounted=false,activeThread=null;
  const state={mode:'native',ready:false,mounts:0};
  const make=(tag,text,attrs={})=>{const e=document.createElement(tag);if(text)e.textContent=text;for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;};
  const visible=e=>e.getBoundingClientRect().width>10&&e.getBoundingClientRect().height>10;
  const findHeader=()=>[...document.querySelectorAll('header[data-app-shell-titlebar]')].find(visible);
  const findMain=()=>[...document.querySelectorAll('main[data-app-shell-main-surface]')].find(visible);
  const validId=id=>typeof id==='string'&&/^[\w-]{8,100}$/.test(id);
  const readThread=()=>{
    const main=findMain();if(!main)return null;
    const ids=[...main.querySelectorAll('[data-response-annotation-conversation]')].map(e=>e.getAttribute('data-response-annotation-conversation')).filter(validId);
    return ids.at(-1)||null;
  };
  let nativeThread=null;
  const context=()=>({threadId:config.demo?null:nativeThread,testing:!!config.demo,readOnly:!!config.readOnly,canvasVisible:state.mode==='canvas'});
  const request=(name,args={})=>new Promise((resolve,reject)=>{
    if(disposed||pending.size>=128){reject(new Error('画布连接不可用'));return;}
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('画布请求超时，请重试'));},65000);
    pending.set(id,{resolve,reject,timer});
    try{window[config.binding](JSON.stringify({channel:config.channel,id,name,args}));}catch{clearTimeout(timer);pending.delete(id);reject(new Error('画布连接已断开'));}
  });
  const host={call:request,getContext:context,onContextChange:fn=>(contextListeners.add(fn),()=>contextListeners.delete(fn)),onEvent:fn=>(eventListeners.add(fn),()=>eventListeners.delete(fn)),setActiveThread:id=>{if(validId(id))activeThread=id;},nativeChat:async id=>{if(!config.demo&&id&&id!==nativeThread)await request('native_chat',{id});setMode('native');}};
  const style=make('style',`#synapse-chat-switch{display:inline-flex;align-items:center;gap:2px;padding:3px;margin-inline-end:6px;border:1px solid var(--color-border,#dcdfe4);border-radius:9px;background:var(--color-background,#f5f6f7);pointer-events:auto;-webkit-app-region:no-drag;font:12px 'Segoe UI','Microsoft YaHei',sans-serif;white-space:nowrap}#synapse-chat-switch button{border:0;border-radius:6px;padding:6px 10px;background:transparent;color:var(--color-text-secondary,#6c7078);cursor:pointer;font:inherit;line-height:18px;white-space:nowrap}#synapse-chat-switch button[aria-selected=true]{background:var(--color-background-elevated,#fff);color:var(--color-text,#24262b);box-shadow:0 1px 4px #00000016}#synapse-chat-canvas{position:fixed;z-index:29;overflow:hidden;background:var(--color-background,#f5f6f8);color:var(--color-text,#25282e);pointer-events:auto}#synapse-chat-canvas[hidden]{display:none}#synapse-chat-canvas .synapse-loading{padding:32px;font:13px 'Segoe UI','Microsoft YaHei',sans-serif;line-height:1.8}`);
  const bar=make('div','',{id:'synapse-chat-switch',role:'tablist','aria-label':'原生对话与会话画布'});
  const nativeButton=make('button','原生对话',{type:'button',role:'tab','data-synapse-mode':'native'}),canvasButton=make('button','会话画布',{type:'button',role:'tab','data-synapse-mode':'canvas'});
  bar.append(nativeButton,canvasButton);
  const canvas=make('section','',{id:'synapse-chat-canvas','aria-label':'Synapse 会话画布'});
  const shadow=canvas.attachShadow({mode:'open'}),surface=make('div','',{style:'width:100%;height:100%;'});
  shadow.append(surface);
  const setStyle=(node,key,value)=>{let saved=patches.get(node);if(!saved){saved=new Map();patches.set(node,saved);}if(!saved.has(key))saved.set(key,{value:node.style.getPropertyValue(key),priority:node.style.getPropertyPriority(key)});if(node.style.getPropertyValue(key)!==value)node.style.setProperty(key,value);};
  const restoreStyles=()=>{for(const [node,properties]of patches)for(const [key,old]of properties)old.value?node.style.setProperty(key,old.value,old.priority):node.style.removeProperty(key);patches.clear();};
  const updateLayout=()=>{
    if(!currentHeader||!bar.isConnected)return;
    const end=currentHeader.querySelector('[data-app-shell-header-slot="end"]'),content=end?.querySelector('[data-app-shell-header-slot-content="true"]'),title=currentHeader.querySelector('[data-app-shell-main-titlebar]');
    if(end&&content&&title){const width=Math.ceil(content.getBoundingClientRect().width+9);setStyle(end,'width',`${width}px`);setStyle(title,'inset-inline-end',`${width}px`);}
    const main=findMain();if(!main)return;const rect=main.getBoundingClientRect(),top=Math.max(rect.top,currentHeader.getBoundingClientRect().bottom);
    Object.assign(canvas.style,{left:`${rect.left}px`,top:`${top}px`,width:`${rect.width}px`,height:`${Math.max(0,Math.min(innerHeight,rect.bottom)-top)}px`});
  };
  const load=()=>loadPromise||(loadPromise=(async()=>{
    surface.replaceChildren(make('p','正在载入会话画布…',{class:'synapse-loading'}));
    try{await request('load_canvas');if(!window.SynapseCanvas?.mount)throw new Error('画布组件未就绪');surface.replaceChildren();window.SynapseCanvas.mount(surface,host);mounted=true;state.ready=true;}
    catch(error){loadPromise=null;const p=make('p',error.message,{class:'synapse-loading'}),retry=make('button','重试',{type:'button'});retry.onclick=()=>load();surface.replaceChildren(p,retry);}
  })());
  function setMode(mode){state.mode=mode;canvas.hidden=mode!=='canvas';nativeButton.setAttribute('aria-selected',String(mode==='native'));canvasButton.setAttribute('aria-selected',String(mode==='canvas'));updateLayout();for(const fn of contextListeners)fn(context());if(mode==='canvas')load();}
  const mount=()=>{
    queued=false;if(disposed||!document.body)return;if(!style.isConnected)document.head.append(style);
    const header=findHeader();if(!header)return;
    if(currentHeader!==header){resizeObserver?.disconnect();restoreStyles();currentHeader=header;resizeObserver=new ResizeObserver(updateLayout);resizeObserver.observe(header);}
    const content=header.querySelector('[data-app-shell-header-slot="end"] [data-app-shell-header-slot-content="true"]');if(!content)return;
    if(bar.parentElement!==content){content.prepend(bar);state.mounts++;}if(!canvas.isConnected)document.body.append(canvas);
    const id=readThread();if(id!==nativeThread){nativeThread=id;activeThread=id;for(const fn of contextListeners)fn(context());}
    updateLayout();
  };
  const queueMount=()=>{if(queued||disposed)return;queued=true;queueMicrotask(mount);};
  nativeButton.onclick=async()=>{nativeButton.disabled=true;try{await host.nativeChat(activeThread);}catch(error){canvasButton.title=error.message;}finally{nativeButton.disabled=false;}};
  canvasButton.onclick=()=>setMode('canvas');
  const observer=new MutationObserver(queueMount);
  window.addEventListener('resize',updateLayout);
  window.__codexSynapse={state,host,setMode,deliver:message=>{
    if(message.channel!==config.channel)return;
    if(message.event){for(const fn of eventListeners)fn(message.event);return;}
    const p=pending.get(message.id);if(!p)return;clearTimeout(p.timer);pending.delete(message.id);message.error?p.reject(new Error(message.error)):p.resolve(message.result);
  },setCss:css=>{let sheet=shadow.querySelector('style');if(!sheet){sheet=make('style');shadow.prepend(sheet);}sheet.textContent=css;},getLayout:()=>({insideNativeHeader:!!currentHeader?.contains(bar),threadId:nativeThread,mode:state.mode,ready:state.ready}),uninstall:()=>{
    disposed=true;observer.disconnect();resizeObserver?.disconnect();window.removeEventListener('resize',updateLayout);if(mounted)window.SynapseCanvas?.unmount(surface);restoreStyles();bar.remove();canvas.remove();style.remove();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('画布已关闭'));}pending.clear();contextListeners.clear();eventListeners.clear();delete window.__codexSynapse;
  }};
  setMode('native');
  const install=()=>{mount();observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-response-annotation-conversation']});};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install,{once:true}):install();
}

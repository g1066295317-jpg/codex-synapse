// Self-contained: serialized into the native document and also bundled with the canvas.
// Only explicit Synapse branch IDs are folded; titles never determine ancestry.
export function installNativeSidebar({demo=false}={}) {
  if(demo||window!==window.top)return null;
  if(window.__codexSynapseSidebar)return window.__codexSynapseSidebar;
  const key='synapse.native-sidebar.v1',id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
  let parents=new Map(),expanded=new Set(),timer=null,disposed=false;
  const controls=new Map(),patched=new Set();
  try{const saved=JSON.parse(localStorage.getItem(key)||'{}');parents=new Map((saved.parents||[]).filter(([child,parent])=>id(child)&&id(parent)&&child!==parent).slice(0,10000));expanded=new Set((saved.expanded||[]).filter(id));}catch{}
  const persist=()=>{try{localStorage.setItem(key,JSON.stringify({parents:[...parents],expanded:[...expanded]}));}catch{}};
  const rootOf=child=>{const seen=new Set([child]);let root=parents.get(child);if(!root)return null;while(parents.has(root)){if(seen.has(root))return null;seen.add(root);root=parents.get(root);}return seen.has(root)?null:root;};
  const rowId=row=>{
    if(row.getAttribute('data-app-action-sidebar-thread-kind')!=='local'||row.getAttribute('data-app-action-sidebar-thread-host-id')!=='local')return null;
    const value=row.getAttribute('data-app-action-sidebar-thread-id')||'';return value.startsWith('local:')&&id(value.slice(6))?value.slice(6):null;
  };
  const style=document.createElement('style');style.id='synapse-native-branch-style';
  style.textContent='[data-sidebar-navigation-root] [data-synapse-branch-hidden="true"]{display:none!important}[data-sidebar-navigation-root] .synapse-native-branch-toggle{display:block;flex:none;max-width:calc(100% - 24px);margin:0 8px 5px 24px;padding:4px 8px;border:0;border-radius:6px;background:transparent;color:var(--color-text-secondary,#73766d);font:11px/1.5 "Segoe UI","Microsoft YaHei",sans-serif;text-align:start;cursor:pointer;-webkit-app-region:no-drag}[data-sidebar-navigation-root] .synapse-native-branch-toggle:hover{background:var(--color-background-hover,#e9e7df)}[data-sidebar-navigation-root] .synapse-native-branch-toggle:focus-visible{outline:2px solid currentColor;outline-offset:1px}[data-sidebar-navigation-root] .synapse-native-branch-toggle[data-current="true"]{color:var(--color-text,#425a47)}';
  const set=(node,name,value)=>{if(node.getAttribute(name)!==value)node.setAttribute(name,value);};
  const ensureControl=(anchor,group,count,current,orphan=false)=>{
    let button=controls.get(anchor);
    if(!button){button=document.createElement('button');button.type='button';button.className='synapse-native-branch-toggle';controls.set(anchor,button);}
    const open=expanded.has(group);button.dataset.group=group;
    const label=`${open?'▾':'▸'} ${count} 条画布分支${current?' · 当前在分支':''} · ${open?'收起':'展开'}`;
    if(button.textContent!==label)button.textContent=label;
    set(button,'aria-label',`${open?'收起':'展开'}${count}条画布分支`);set(button,'aria-expanded',String(open));set(button,'data-current',String(current));
    button.title='只折叠此侧栏中的显示；完整分支仍保留在会话画布中';
    button.onclick=event=>{event.preventDefault();event.stopPropagation();open?expanded.delete(group):expanded.add(group);persist();render();};
    if(orphan){if(button.parentElement!==anchor)anchor.prepend(button);}else if(anchor.nextSibling!==button)anchor.after(button);
    return button;
  };
  const render=()=>{
    timer=null;if(disposed||!document.body)return;
    if(!style.isConnected)document.head.append(style);
    const needed=new Set(),hidden=new Set();
    for(const sidebar of document.querySelectorAll('[data-sidebar-navigation-root]')){
      const rows=[...sidebar.querySelectorAll('[data-app-action-sidebar-thread-row]')],byId=new Map(),families=new Map(),orphans=[];
      for(const row of rows){const value=rowId(row);if(value){if(!byId.has(value))byId.set(value,[]);byId.get(value).push(row);}}
      for(const row of rows){const child=rowId(row),root=child&&rootOf(child);if(!root)continue;if(!families.has(root))families.set(root,[]);families.get(root).push({row,child});}
      for(const [root,members]of families){
        const anchors=byId.get(root)||[];
        if(!anchors.length){orphans.push(...members);continue;}
        const count=new Set(members.map(m=>m.child)).size,current=members.some(m=>m.row.getAttribute('data-app-action-sidebar-thread-selected')==='true');
        for(const anchor of anchors){needed.add(anchor);ensureControl(anchor,root,count,current);}
        if(!expanded.has(root))for(const {row}of members)hidden.add(row);
      }
      if(orphans.length){const group='unlisted-branches',count=new Set(orphans.map(m=>m.child)).size;needed.add(sidebar);ensureControl(sidebar,group,count,orphans.some(m=>m.row.getAttribute('data-app-action-sidebar-thread-selected')==='true'),true);if(!expanded.has(group))for(const {row}of orphans)hidden.add(row);}
    }
    for(const row of patched)if(!hidden.has(row)){row.removeAttribute('data-synapse-branch-hidden');patched.delete(row);}
    for(const row of hidden){set(row,'data-synapse-branch-hidden','true');patched.add(row);}
    for(const [anchor,button]of controls)if(!needed.has(anchor)||!anchor.isConnected){button.remove();controls.delete(anchor);}
  };
  const schedule=()=>{if(timer===null&&!disposed)timer=setTimeout(render,60);};
  const observer=new MutationObserver(schedule);
  const api={update:branches=>{
    const next=new Map();for(const [child,branch]of Object.entries(branches||{}).slice(0,10000))if(id(child)&&id(branch?.parentId)&&child!==branch.parentId)next.set(child,branch.parentId);
    const before=JSON.stringify([...parents]);parents=next;if(before!==JSON.stringify([...parents]))persist();render();
  },refresh:render,getStatus:()=>({knownBranches:parents.size,hiddenRows:[...patched].filter(row=>row.isConnected).length,groups:controls.size}),uninstall:()=>{
    disposed=true;clearTimeout(timer);observer.disconnect();for(const row of patched)row.removeAttribute('data-synapse-branch-hidden');for(const button of controls.values())button.remove();controls.clear();patched.clear();style.remove();delete window.__codexSynapseSidebar;
  }};
  window.__codexSynapseSidebar=api;
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-app-action-sidebar-thread-id','data-app-action-sidebar-thread-kind','data-app-action-sidebar-thread-host-id','data-app-action-sidebar-thread-selected']});
  render();return api;
}

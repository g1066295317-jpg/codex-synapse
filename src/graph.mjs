export const titleOf=t=>t.name || t.preview?.split('\n')[0]?.slice(0,70) || '未命名会话';
export const folderOf=p=>(p||'无工作目录').split(/[\\/]/).filter(Boolean).at(-1);
export const buildGraph=(threads,layout,selected,onSelect)=>{
  const ids=new Set(threads.map(t=>t.id)); const lookup=new Map(threads.map(t=>[t.id,t]));
  const parentOf=t=>t.forkedFromId || layout.branches?.[t.id]?.parentId;
  const depthOf=(id,seen=new Set())=>{
    if(seen.has(id))return 0; seen.add(id);
    const parent=parentOf(lookup.get(id)||{});
    return parent && ids.has(parent)?Math.min(8,1+depthOf(parent,seen)):0;
  };
  const rows=new Map();
  const nodes=threads.map(t=>{
    const depth=depthOf(t.id),row=rows.get(depth)||0;rows.set(depth,row+1);
    const initial=depth?{x:1080+(depth-1)*360,y:row*215}:{x:(row%3)*340,y:Math.floor(row/3)*215};
    return {id:t.id,type:'session',position:layout.nodes?.[t.id] || initial,data:{thread:t,onSelect,active:t.id===selected,parentId:parentOf(t),quote:layout.branches?.[t.id]?.quote},selected:t.id===selected};
  });
  const edges=threads.flatMap(t=>{const parent=parentOf(t);return parent && ids.has(parent)?[{id:`${parent}-${t.id}`,source:parent,target:t.id,type:'smoothstep',animated:t.status?.type==='active',style:{stroke:'#c3673d',strokeWidth:1.5}}]:[]});
  return {nodes,edges};
};

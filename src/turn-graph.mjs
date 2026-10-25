export const userText=t=>(t.items||[]).filter(i=>i.type==='userMessage').flatMap(i=>(i.content||[]).filter(c=>c.type==='text').map(c=>c.text)).join('\n');
export const answerText=t=>(t.items||[]).filter(i=>i.type==='agentMessage').map(i=>i.text||'').join('\n\n');
export const titleOf=t=>t?.name||t?.preview?.slice(0,45)||'新讨论';
export function turnGraph(histories,branches={}){
  const ids=Object.keys(histories).sort((a,b)=>(Number(histories[a]?.thread?.createdAt)||0)-(Number(histories[b]?.thread?.createdAt)||0)||a.localeCompare(b));
  const records=new Map(),paths={},pending=new Set(ids),edges=[];
  for(let pass=0;pass<=pending.size+Object.keys(histories).length&&pending.size;pass++)for(const id of [...pending]){
    const h=histories[id];if(!h?.thread){pending.delete(id);continue;}
    const parent=h.thread.forkedFromId||branches[id]?.parentId;
    if(parent&&pending.has(parent))continue;
    const turns=h.turns||[],parentPath=paths[parent]||[],path=[];
    let prefix=0;
    while(prefix<turns.length&&prefix<parentPath.length){const original=records.get(parentPath[prefix])?.turn;
   if(!original||turns[prefix].id!==original.id)break;
      path.push(parentPath[prefix++]);
    }
    let previous=path.at(-1);
    if(!previous&&branches[id]?.turnId)previous=parentPath.find(key=>records.get(key)?.turn.id===branches[id].turnId);
    for(let i=prefix;i<turns.length;i++){
      const turn=turns[i],key=id+'_'+turn.id;
      records.set(key,{id:key,threadId:id,turn,index:i,label:titleOf(h.thread)});path.push(key);
   if(previous)edges.push({id:previous+'>'+key,source:previous,target:key,type:'smoothstep',data:{branch:!!parent&&i===prefix},style:{stroke:parent&&i===prefix?'#b4865a':'#bebdb7',strokeWidth:1.6}});
      previous=key;
    }
    paths[id]=path;pending.delete(id);
  }
  // Unknown/cyclic ancestry never invents a link.
  for(const id of pending)for(const [i,turn]of (histories[id].turns||[]).entries()){const key=id+'_'+turn.id;records.set(key,{id:key,threadId:id,turn,index:i,label:titleOf(histories[id].thread)});(paths[id]||=[]).push(key);}
  const children=new Map(),incoming=new Set();for(const e of edges){(children.get(e.source)||children.set(e.source,[]).get(e.source)).push(e.target);incoming.add(e.target);}
  const placed=new Map();let lane=0;
  function walk(key,depth,seen=new Set()){
    if(seen.has(key)||placed.has(key))return;seen.add(key);
    const kids=children.get(key)||[],start=lane;
    if(kids.length)for(const child of kids)walk(child,depth+1,new Set(seen));else lane++;
  placed.set(key,{x:(kids.length?start+(lane-start-1)/2:start)*440,y:depth*520});
  }
  for(const key of records.keys())if(!incoming.has(key))walk(key,0);
  return {records,paths,edges,nodes:[...records.values()].map(r=>({id:r.id,type:'turn',draggable:false,position:placed.get(r.id)||{x:0,y:0},data:r}))};
}
export function descendants(id,edges){const found=new Set();const queue=[id];while(queue.length){const next=queue.shift();for(const e of edges)if(e.source===next&&!found.has(e.target)&&e.target!==id){found.add(e.target);queue.push(e.target);}}return found;}

import {nativeFamilyRoot, isSettledTurn} from './native-family.mjs';
import {layoutTurns, TURN_CARD_SIZE} from './layout-turns.mjs';
import {appendBranchLinks} from './branch-links.mjs';
export const userText=t=>(t.items||[]).filter(i=>i.type==='userMessage').flatMap(i=>(i.content||[]).filter(c=>c.type==='text').map(c=>c.text)).join('\n');
export const answerText=t=>(t.items||[]).filter(i=>i.type==='agentMessage').map(i=>i.text||'').join('\n\n');
export const titleOf=t=>t?.name||t?.preview?.slice(0,45)||'新讨论';
export function turnGraph(histories,branches={}){
  const ids=Object.keys(histories).sort((a,b)=>(Number(histories[a]?.thread?.createdAt)||0)-(Number(histories[b]?.thread?.createdAt)||0)||a.localeCompare(b));
  const records=new Map(),paths={},pending=new Set(ids),edges=[],edgeIds=new Set(),families=new Map(),branchLinks=[];
  for(let pass=0;pass<=pending.size+Object.keys(histories).length&&pending.size;pass++)for(const id of [...pending]){
    const h=histories[id];if(!h?.thread){pending.delete(id);continue;}
    const parent=h.thread.forkedFromId||branches[id]?.parentId;
    if(parent&&pending.has(parent))continue;
    const turns=h.turns||[],parentPath=paths[parent]||[],path=[];
    const family=nativeFamilyRoot(id,histories,branches);
    if(family&&!families.has(family))families.set(family,new Map());
    const common=families.get(family);
    const inherited=new Map(parentPath.map(key=>[records.get(key)?.turn.id,key]));
    let previous;
    for(let i=0;i<turns.length;i++){
      const turn=turns[i],candidates=[inherited.get(turn.id),...(common?.get(turn.id)||[])].filter(Boolean);
      const shared=isSettledTurn(turn)?candidates.find(key=>records.get(key)?.turn===turn||JSON.stringify(records.get(key)?.turn)===JSON.stringify(turn)):null,key=shared||id+'_'+turn.id;
      if(!shared){records.set(key,{id:key,threadId:id,turn,index:i,label:titleOf(h.thread)});if(common&&isSettledTurn(turn))common.set(turn.id,[...(common.get(turn.id)||[]),key]);}
      const anchor=branches[id]?.turnId;
      if(i===0&&!shared&&anchor&&!candidates.length&&!turns.some(turn=>turn.id===anchor)){
        const source=inherited.get(anchor);if(source)branchLinks.push({source,target:key});
      }
      path.push(key);
      const branch=!!parent&&!shared&&records.get(previous)?.threadId!==id;
      const edgeId=previous+'>'+key;
      if(previous&&previous!==key&&!edgeIds.has(edgeId)){edgeIds.add(edgeId);edges.push({id:edgeId,source:previous,target:key,type:'smoothstep',data:{branch},style:{stroke:branch?'#b4865a':'#bebdb7',strokeWidth:1.6}});}
      previous=key;
    }
    paths[id]=path;pending.delete(id);
  }
  // Unknown/cyclic ancestry never invents a link.
  for(const id of pending)for(const [i,turn]of (histories[id].turns||[]).entries()){const key=id+'_'+turn.id;records.set(key,{id:key,threadId:id,turn,index:i,label:titleOf(histories[id].thread)});(paths[id]||=[]).push(key);}
  appendBranchLinks(records,edges,branchLinks);
  const placed=layoutTurns(records,edges);
  return {records,paths,edges,nodes:[...records.values()].map(r=>({id:r.id,type:'turn',draggable:false,initialWidth:TURN_CARD_SIZE.width,initialHeight:TURN_CARD_SIZE.height,style:TURN_CARD_SIZE,position:placed.get(r.id),data:r}))};
}
export function descendants(id,edges){const found=new Set();const queue=[id];while(queue.length){const next=queue.shift();for(const e of edges)if(e.source===next&&!found.has(e.target)&&e.target!==id){found.add(e.target);queue.push(e.target);}}return found;}

export const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
export function contentBounds(nodes){
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const node of nodes){
    if(node.hidden)continue;
    left=Math.min(left,node.position.x);top=Math.min(top,node.position.y);
    right=Math.max(right,node.position.x+(node.measured?.width||node.width||370));
    bottom=Math.max(bottom,node.position.y+(node.measured?.height||node.height||440));
  }
  return Number.isFinite(left)?{left,top,right,bottom,empty:false}:{left:0,top:0,right:0,bottom:0,empty:true};
}
export function scrollAxis(start,end,visibleStart,visibleLength,trackLength,previous){
  const padding=Math.max(160,visibleLength*.35);
  const min=Math.min(previous?.min??start-padding,visibleStart),max=Math.max(previous?.max??end+padding,visibleStart+visibleLength);
  const range=Math.max(0,max-min-visibleLength);
  const length=Math.max(0,trackLength);
  const thumb=Math.min(length,Math.max(32,length*visibleLength/Math.max(1,max-min)));
  const travel=Math.max(0,length-thumb);
  const progress=range?clamp((visibleStart-min)/range,0,1):0;
  return{min,maxStart:min+range,range,length,thumb,travel,offset:progress*travel,progress,visibleLength};
}

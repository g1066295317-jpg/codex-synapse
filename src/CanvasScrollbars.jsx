import React,{memo,useMemo,useRef} from 'react';
import {useReactFlow,useStore,useViewport} from '@xyflow/react';
import {clamp,contentBounds,scrollAxis} from './scrollbar-metrics.mjs';

const AxisBar=memo(function AxisBar({axis,metric,value,disabled,controls,move}){
  const rail=useRef(null),drag=useRef(null);
  const coordinate=event=>axis==='x'?event.clientX:event.clientY;
  const change=next=>move(axis,clamp(next,metric.min,metric.maxStart));
  const pointerDown=event=>{
    if(disabled||event.button!==0)return;
    event.preventDefault();event.stopPropagation();
    const rect=rail.current.getBoundingClientRect();
    let startValue=value;
    if(!event.target.closest('.canvas-scroll-thumb')){
      const point=coordinate(event)-(axis==='x'?rect.left:rect.top);
      startValue=metric.min+clamp(point-metric.thumb/2,0,metric.travel)/Math.max(1,metric.travel)*metric.range;
      change(startValue);
    }
    drag.current={pointer:coordinate(event),value:startValue,metric,pointerId:event.pointerId};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove=event=>{
    const current=drag.current;if(!current)return;
    event.preventDefault();event.stopPropagation();
    const next=current.value+(coordinate(event)-current.pointer)/Math.max(1,current.metric.travel)*current.metric.range;
    move(axis,clamp(next,current.metric.min,current.metric.maxStart));
  };
  const pointerUp=event=>{
    if(!drag.current)return;
    drag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    event.stopPropagation();
  };
  const keyDown=event=>{
    if(disabled)return;
    const step=metric.visibleLength*.1;
    const direction=axis==='x'?{ArrowLeft:-1,ArrowRight:1}:{ArrowUp:-1,ArrowDown:1};
    let next;
    if(direction[event.key])next=value+direction[event.key]*step;
    else if(event.key==='PageDown')next=value+metric.visibleLength*.9;
    else if(event.key==='PageUp')next=value-metric.visibleLength*.9;
    else if(event.key==='Home')next=metric.min;
    else if(event.key==='End')next=metric.maxStart;
    else return;
    event.preventDefault();event.stopPropagation();change(next);
  };
  return <div className={'canvas-scroll-axis canvas-scroll-'+axis+' nowheel nodrag nopan'} role="scrollbar" tabIndex={disabled?-1:0} aria-label={axis==='x'?'水平移动画布':'垂直移动画布'} aria-orientation={axis==='x'?'horizontal':'vertical'} aria-controls={controls} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(metric.progress*100)} aria-disabled={disabled} title={axis==='x'?'拖动滚动条左右移动画布':'拖动滚动条上下移动画布'} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={()=>{drag.current=null;}} onKeyDown={keyDown}>
    <div className="canvas-scroll-rail" ref={rail}><div className="canvas-scroll-thumb" style={axis==='x'?{width:metric.thumb,transform:`translateX(${metric.offset}px)`}:{height:metric.thumb,transform:`translateY(${metric.offset}px)`}}/></div>
  </div>;
});

export default memo(function CanvasScrollbars({nodes,controls}){
  const instance=useReactFlow();
  const {x,y,zoom}=useViewport();
  const width=useStore(state=>state.width),height=useStore(state=>state.height);
  const bounds=useMemo(()=>contentBounds(nodes),[nodes]);
  const extent=useRef(null);
  const left=-x/zoom,top=-y/zoom;
  const key=[bounds.left,bounds.top,bounds.right,bounds.bottom,width,height,zoom].join('|');
  const previous=extent.current?.key===key?extent.current:null;
  const horizontal=scrollAxis(bounds.left,bounds.right,left,width/zoom,width-22,previous?.x);
  const vertical=scrollAxis(bounds.top,bounds.bottom,top,height/zoom,height-22,previous?.y);
  extent.current={key,x:{min:horizontal.min,max:horizontal.maxStart+horizontal.visibleLength},y:{min:vertical.min,max:vertical.maxStart+vertical.visibleLength}};
  const move=(axis,value)=>{
    const viewport=instance.getViewport();
    instance.setViewport({...viewport,[axis==='x'?'x':'y']:-value*viewport.zoom},{duration:0});
  };
  return <div className="canvas-scrollbars">
    <AxisBar axis="x" metric={horizontal} value={left} disabled={bounds.empty||!horizontal.travel||!horizontal.range} controls={controls} move={move}/>
    <AxisBar axis="y" metric={vertical} value={top} disabled={bounds.empty||!vertical.travel||!vertical.range} controls={controls} move={move}/>
    <div className="canvas-scroll-corner"/>
  </div>;
});

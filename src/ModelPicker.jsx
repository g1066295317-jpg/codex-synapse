import React, {useEffect, useState} from 'react';
import {RefreshCw} from 'lucide-react';

export const useModelCatalog = (call, visible) => {
  const [catalog, setCatalog] = useState({data:[], loaded:false, loading:false, error:''});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let cancelled=false;
    setCatalog(previous=>({...previous,loading:true,error:''}));
    call('list_models',attempt?{refresh:true}:{}).then(result=>{
      if(!cancelled)setCatalog({data:result.data||[],loaded:true,loading:false,error:''});
    },error=>{if(!cancelled)setCatalog(previous=>({...previous,loaded:true,loading:false,error:/不支持.*操作/.test(error.message)?'重新打开 Codex 后启用模型选择':error.message}));});
    return()=>{cancelled=true;};
  },[call,visible,attempt]);
  return {...catalog,reload:()=>setAttempt(value=>value+1)};
};

export default function ModelPicker({catalog,value,onChange,disabled,newTopic}) {
  const unavailable=!!value&&!catalog.data.some(model=>model.model===value);
  return <div className="model-picker">
    <label><span>模型</span><select aria-label="提问模型" value={value} disabled={disabled||catalog.loading} onChange={event=>onChange(event.target.value)}>
      <option value="">{newTopic?'使用默认模型':'沿用会话模型'}</option>
      {unavailable&&<option value={value} disabled>已不可用：{value}</option>}
      {catalog.data.map(model=><option key={model.model} value={model.model}>{model.displayName}{model.isDefault?' · 默认':''}</option>)}
    </select></label>
    <button type="button" className="icon-button" title="刷新可用模型" aria-label="刷新可用模型" disabled={disabled||catalog.loading} onClick={catalog.reload}><RefreshCw size={13} className={catalog.loading?'spin':''}/></button>
    {(catalog.error||unavailable)&&<small role="status">{catalog.error||'所选模型已不可用，请重新选择'}</small>}
  </div>;
}

import React from 'react';
import {ArrowUp, GitBranch, Square, X} from 'lucide-react';

export default function Composer({value, onChange, onSend, busy, generating, onStop, branch, onBranch, historical, quote, onQuoteChange, onClearQuote, disabled, label = '继续当前思路…'}) {
  const canSend = !busy && !generating && !disabled && !!value.trim();
  return <form className="composer nodrag nowheel" onSubmit={event => {event.preventDefault(); if (canSend) onSend();}}>
    {quote && <div className="quoted-draft"><div><span>原文引用 · 可删减</span><button type="button" aria-label="取消引用" onClick={onClearQuote}><X size={13}/></button></div><textarea aria-label="引用原文" value={quote} rows={2} maxLength={16000} onChange={event => onQuoteChange?.(event.target.value)}/></div>}
    <textarea className="question-input" aria-label={label} placeholder={disabled ? '当前为只读模式' : label} value={value} disabled={disabled} maxLength={16000} onChange={event => onChange(event.target.value)} onKeyDown={event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault(); if (canSend) onSend();}
    }}/>
    <div className="composer-bottom">{onBranch ? <button type="button" className={'branch-mode ' + (branch ? 'active' : '')} disabled={disabled || historical || !!quote} title={quote ? '引用追问会创建分支；清除引用后可以切换继续原会话' : historical ? '历史轮次的追问会创建原生分支，保留后续对话' : '切换继续当前会话或另开分支'} onClick={onBranch}><GitBranch size={13}/>{branch ? '从此轮另开分支' : '继续当前会话'}</button> : <span className="new-topic-label">创建本机会话</span>}
      {generating ? <button type="button" className="send stop" aria-label="停止生成" disabled={disabled || busy} onClick={onStop}><Square size={14}/></button> : <button className="send" type="submit" aria-label={branch ? '发送分支追问' : '发送问题'} disabled={!canSend}><ArrowUp size={17}/></button>}
    </div><div className="composer-hint">{quote ? '引用请保留原文；补充说明可写在问题中。' : historical ? '分支保留到这一轮；后续问答留在原会话。' : 'Enter 发送 · Shift + Enter 换行'}</div>
  </form>;
}

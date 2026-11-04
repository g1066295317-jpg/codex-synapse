import React, {memo, useState} from 'react';
import {Handle, Position, useStore} from '@xyflow/react';
import MathMarkdown from './MathMarkdown.jsx';
import {ArrowUpRight, GitBranch, ChevronDown, ChevronRight, Focus, FileText} from 'lucide-react';
import {userText, answerText} from './turn-graph.mjs';
import {isRunning} from './native-state.mjs';
import {overviewText} from './overview-text.mjs';

const toolLabels = {commandExecution: '命令执行', fileChange: '文件变更', mcpToolCall: '工具调用', webSearch: '网络搜索', imageView: '查看图片', collabAgentToolCall: '协作任务', dynamicToolCall: '工具调用'};
const toolText = item => [item.command, item.aggregatedOutput, item.output, item.query, item.result && (typeof item.result === 'string' ? item.result : JSON.stringify(item.result, null, 2)), item.changes && JSON.stringify(item.changes, null, 2)].filter(value => typeof value === 'string').join('\n\n');
const overviewSelector = state => state.transform[2] < .45;

const ToolDetails = memo(function ToolDetails({items}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(20);
  return <details className="tool-details nodrag nowheel nopan" onToggle={event => setOpen(event.currentTarget.open)}><summary>工具过程 · {items.length} 项</summary>{open && <>
    {items.slice(0, limit).map((item, index) => <div key={item.id || index}><strong>{toolLabels[item.type]}</strong><pre>{toolText(item) || item.status || '已记录；可在原生聊天查看详情'}</pre></div>)}
    {limit < items.length && <button onClick={() => setLimit(value => value + 20)}>显示更多工具记录</button>}
  </>}</details>;
});

export const TurnBody = memo(function TurnBody({turn, onQuote, compact = false}) {
  const answer = answerText(turn);
  const extras = (turn.items || []).filter(item => Object.hasOwn(toolLabels, item.type));
  function captureQuote(event) {
    const selection = event.currentTarget.ownerDocument.getSelection();
    if (selection?.toString().trim() && event.currentTarget.contains(selection.anchorNode) && event.currentTarget.contains(selection.focusNode)) onQuote?.(selection.toString().slice(0, 16000));
  }
  return <>
    <div className={'question-text nodrag nopan '+(compact?'question-preview':'')}><span className="speaker">你</span><MathMarkdown source={userText(turn) || '（非文本输入，请在原生聊天查看附件）'} compact={compact}/></div>
    <div className={'answer-text nodrag nopan '+(compact?'':'nowheel')} onMouseUp={captureQuote}><span className="speaker">Codex{isRunning(turn) && <span className="answer-live">正在生成</span>}</span><MathMarkdown className={compact?'answer-preview':''} compact={compact} source={answer || (isRunning(turn) ? '等待回复…' : '（没有文本回复）')}/></div>
    {!compact && !!extras.length && <ToolDetails key={turn.id} items={extras}/>}
    {compact && (turn.toolCount || extras.length) > 0 && <span className="tool-preview">工具过程 · {turn.toolCount || extras.length} 项 · 详情中展开</span>}
    {turn.error && <p className="inline-error">{turn.error.message || '本轮生成失败'}</p>}
  </>;
});

function TurnNode({data}) {
  const overview = useStore(overviewSelector);
  const running = isRunning(data.turn);
  const stop = handler => event => {event.stopPropagation(); handler();};
  return <article className={'turn-card ' + (data.active ? 'selected ' : '') + (data.onPath ? 'on-path' : '')} data-preview-mode={overview ? 'overview' : 'content'} aria-label={'问答节点 ' + (data.index + 1)} onClick={() => data.select(data.id, data.threadId)}>
    <Handle type="target" position={Position.Top}/>
    <header className="node-heading"><span><i className={running ? 'live-dot' : 'dot'}/>问答 {data.index + 1}</span><small title={data.label}>{data.label}</small><button className="icon-button nodrag" title={data.folded ? '展开后续节点' : '折叠后续节点'} aria-label={data.folded ? '展开后续节点' : '折叠后续节点'} onClick={stop(() => data.fold(data.id))}>{data.folded ? <ChevronRight size={15}/> : <ChevronDown size={15}/>}</button></header>
    {overview ? <div className="node-overview"><span className="speaker">你</span><strong>{overviewText(userText(data.turn),120)||'（非文本问题）'}</strong><span className="speaker">Codex</span><p>{overviewText(answerText(data.turn),200)||(running?'正在生成…':'单击查看完整问答')}</p><small>单击查看完整</small></div> : <TurnBody turn={data.turn} compact onQuote={quote => data.quote(data.id, quote)}/>}
    <div className="node-actions nodrag nopan"><button onClick={stop(() => data.read(data.id, data.threadId))}><FileText size={13}/>查看完整</button><button disabled={data.readOnly} onClick={stop(() => data.branch(data.id, data.threadId))}><GitBranch size={13}/>分支</button><button className="icon-button" title="返回此轮原生聊天" aria-label="返回此轮原生聊天" onClick={stop(() => data.native(data.threadId))}><ArrowUpRight size={14}/></button><button className="icon-button" title="居中显示" aria-label="居中显示" onClick={stop(() => data.focus(data.id))}><Focus size={14}/></button></div>
    {data.folded && <span className="folded-hint">后续节点已折叠</span>}
    <Handle type="source" position={Position.Bottom}/>
  </article>;
}
export default memo(TurnNode);

import React, {useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';
import {ReactFlow, Background, Controls, MiniMap, useNodesInitialized, useNodesState} from '@xyflow/react';
import {ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, FileText, Focus, Folder, GitBranch, LoaderCircle, LocateFixed, Network, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Search, X} from 'lucide-react';
import TurnNode, {TurnBody} from './TurnNode.jsx';
import Composer from './Composer.jsx';
import ApprovalPanel from './ApprovalPanel.jsx';
import CanvasScrollbars from './CanvasScrollbars.jsx';
import {turnGraph, descendants, titleOf} from './turn-graph.mjs';
import {groupThreads, isRunning, mergeHistory, mergeThreads, normalizeDraft, questionTarget} from './native-state.mjs';
import {installNativeSidebar} from '../runtime/native-sidebar.mjs';

const nodeTypes = {turn: TurnNode};
const emptySnapshot = {threads: [], histories: {}, layout: {nodes: {}, branches: {}, view: {}}};

export default function NativeWorkspace({host}) {
  const canvasId=useId();
  const [context, setContext] = useState(() => host.getContext?.() || {});
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [selected, setSelected] = useState(null);
  const [active, setActive] = useState(null);
  const [query, setQuery] = useState('');
  const [sidebar, setSidebar] = useState(true);
  const [detail, setDetail] = useState(false);
  const [newTopic, setNewTopic] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [rootDraft, setRootDraft] = useState('');
  const [folded, setFolded] = useState({});
  const [closedGroups, setClosedGroups] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [approvals, setApprovals] = useState([]);
  const [saved, setSaved] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const nodesInitialized = useNodesInitialized();
  const flow = useRef(null);
  const mounted = useRef(true);
  const hydrated = useRef(false);
  const request = useRef(0);
  const readSequence = useRef(0);
  const pendingSave = useRef({});
  const saveTimer = useRef(null);
  const state = useRef({});
  const initialViewport = useRef(null);
  const initialViewApplied = useRef(false);
  const workspaceElement = useRef(null);
  const readOnly = !!context.readOnly || context.capabilities?.send === false || host.capabilities?.send === false;
  const canSave = !context.readOnly && context.capabilities?.saveLayout !== false && host.capabilities?.saveLayout !== false;
  const graph = useMemo(() => turnGraph(snapshot.histories, snapshot.layout.branches), [snapshot.histories, snapshot.layout.branches]);
  const activeKey = graph.records.has(active) ? active : graph.paths[selected]?.at(-1);
  const currentRecord = graph.records.get(activeKey);
  const selectedHistory = snapshot.histories[selected];
  const selectedThread = selectedHistory?.thread || snapshot.threads.find(thread => thread.id === selected);
  const target = questionTarget(graph, activeKey, selected, snapshot.histories);
  const draftKey = selected + ':' + activeKey;
  const draft = normalizeDraft(drafts[draftKey] || drafts[activeKey], target?.historical);
  const runningTurn = selectedHistory?.turns?.find(isRunning);
  const generating = !!runningTurn && !draft.branch && !newTopic;
  const groups = useMemo(() => groupThreads(snapshot.threads, query), [snapshot.threads, query]);
  state.current = {selected, activeKey, snapshot, graph, draft, draftKey, drafts, folded, rootDraft, context, canSave, readOnly};

  useEffect(() => {
    if(!context.testing && hydrated.current)installNativeSidebar()?.update(snapshot.layout.branches);
  }, [snapshot.layout.branches, context.testing]);

  const fail = useCallback(failure => {if (mounted.current) setError(failure?.message || String(failure));}, []);
  const call = useCallback((name, args = {}) => Promise.resolve().then(() => host.call(name, args)), [host]);

  const save = useCallback(patch => {
    if (!state.current.canSave) return;
    pendingSave.current = {nodes: {...pendingSave.current.nodes, ...patch.nodes}, view: {...pendingSave.current.view, ...patch.view}};
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const payload = pendingSave.current;
      pendingSave.current = {};
      try {await call('save_layout', payload); if (mounted.current) setSaved(true);} catch (failure) {fail(new Error('布局或草稿未保存：' + failure.message));}
    }, 650);
  }, [call, fail]);

  const refresh = useCallback(async id => {
    const sequence = ++request.current;
    setLoading(true);
    try {
      const data = await call('workspace_snapshot', id ? {id} : {});
      if (!mounted.current || sequence !== request.current) return;
      setSnapshot(previous => {
        const histories = {};
        for (const [key, history] of Object.entries(data.histories || {})) histories[key] = mergeHistory(previous.histories[key], history);
        return {...previous, ...data, nextCursor: previous.listPagesLoaded ? previous.nextCursor : data.nextCursor, threads: mergeThreads(previous.threads, data.threads || []), histories, layout: {...previous.layout, ...data.layout, nodes: {...data.layout?.nodes, ...previous.layout.nodes}, view: {...data.layout?.view, ...previous.layout.view}}};
      });
      if (!hydrated.current) {
        hydrated.current = true;
        const view = data.layout?.view || {};
        setDrafts(view.drafts || {}); setFolded(view.folded || {}); setRootDraft(view.rootDraft || '');
        setSidebar(view.sidebar !== false && (workspaceElement.current?.clientWidth || 1200) >= 880); setDetail(!!view.detail); setActive(view.activeId || null);
        initialViewport.current = view.viewport || null;
      }
      const chosen = id || data.selectedId || data.layout?.view?.selectedId || data.threads?.[0]?.id || null;
      if (chosen) {
        setSelected(chosen); host.setActiveThread?.(chosen);
        if (!data.histories?.[chosen]?.thread) {
          const history = await call('read_session', {id: chosen});
          if (mounted.current && sequence === request.current) setSnapshot(previous => ({...previous, histories: {...previous.histories, [chosen]: mergeHistory(previous.histories[chosen], history)}}));
        }
      }
    } catch (failure) {if (sequence === request.current) fail(failure);} finally {if (mounted.current && sequence === request.current) setLoading(false);}
  }, [call, fail, host]);

  const readCurrent = useCallback(async id => {
    if (!id) return;
    const sequence = ++readSequence.current;
    const generation = request.current;
    const results = await Promise.allSettled([call('read_session', {id}), call('list_approvals', {id})]);
    if (!mounted.current || state.current.selected !== id || sequence !== readSequence.current || generation !== request.current) return;
    if (results[0].status === 'fulfilled') {
      const history = results[0].value;
      setSnapshot(previous => ({...previous, histories: {...previous.histories, [id]: mergeHistory(previous.histories[id], history)}}));
      if (history.approvals) setApprovals(history.approvals);
    }
    if (results[1].status === 'fulfilled') setApprovals(results[1].value.approvals || []);
    if (results.every(result => result.status === 'rejected')) fail(results[0].reason);
  }, [call, fail]);

  useEffect(() => {
    mounted.current = true;
    const initial = host.getContext?.() || {};
    if (initial.canvasVisible !== false) refresh(initial.threadId);
    else setLoading(false);
    const unsubscribe = host.onContextChange?.(next => {
      if (!mounted.current) return;
      const updated = next || host.getContext?.() || {};
      setContext(updated);
      if (updated.canvasVisible === false) {
        if (updated.threadId && updated.threadId !== state.current.selected) {setSelected(updated.threadId); setActive(null); setNewTopic(false);}
        return;
      }
      if (state.current.context.canvasVisible === false || updated.threadId && updated.threadId !== state.current.selected) {setNewTopic(false); setActive(null); refresh(updated.threadId || state.current.selected);}
    });
    return () => {
      mounted.current = false; request.current++; unsubscribe?.(); clearTimeout(saveTimer.current);
      if (state.current.canSave && Object.keys(pendingSave.current).length) call('save_layout', pendingSave.current).catch(() => {});
    };
  }, [host, refresh, call]);

  useEffect(() => {
    if (!selected) {setApprovals([]); return;}
    let reading = false;
    let eventTimer;
    const update = async () => {
      if (reading || !mounted.current || state.current.context.canvasVisible === false) return;
      reading = true; try {await readCurrent(selected);} finally {reading = false;}
    };
    update();
    const timer = setInterval(() => {if (!document.hidden) update();}, 1800);
    const unsubscribe = host.onEvent?.(event => {
      if(event?.kind==='native_handoff_error'){fail(new Error(event.message));return;}
      const id = event?.params?.threadId || event?.threadId;
      if (!id || id === selected) {clearTimeout(eventTimer); eventTimer = setTimeout(update, 120);}
    });
    return () => {clearInterval(timer); clearTimeout(eventTimer); unsubscribe?.();};
  }, [selected, readCurrent, host]);

  useEffect(() => {
    if (initialViewApplied.current || loading || !flow.current) return;
    if (initialViewport.current) {
      initialViewApplied.current = true;
      flow.current.setViewport(initialViewport.current);
      return;
    }
    if (!nodesInitialized || !activeKey || !flow.current.getNode(activeKey)?.measured?.width) return;
    initialViewApplied.current = true;
    const narrow = (workspaceElement.current?.clientWidth || 1200) < 850;
    flow.current.fitView({...(narrow ? {nodes: [{id: activeKey}]} : {}), padding: narrow ? .12 : .14, maxZoom: narrow ? .95 : .88, duration: 0});
  }, [loading, nodesInitialized, activeKey, nodes]);

  const chooseSession = useCallback(id => {
    setSelected(id); setActive(null); setNewTopic(false); setApprovals([]);
    host.setActiveThread?.(id); save({view: {selectedId: id, activeId: null}}); refresh(id);
  }, [host, save, refresh]);

  const chooseNode = useCallback((key, sourceId, showDetail = true) => {
    const current = state.current;
    const id = (current.graph.paths[current.selected] || []).includes(key) ? current.selected : sourceId;
    setSelected(id); setActive(key); setNewTopic(false);
    if (showDetail) setDetail(true);
    host.setActiveThread?.(id); save({view: {selectedId: id, activeId: key, ...(showDetail ? {detail: true} : {})}});
  }, [host, save]);

  const editDraft = useCallback((key, patch) => {
    setDrafts(previous => {
      const next = {...previous, [key]: {...previous[key], ...patch}};
      save({view: {drafts: next}}); return next;
    });
  }, [save]);

  const quoteNode = useCallback((key, quote) => {
    const current = state.current;
    const record = current.graph.records.get(key);
    if (!record) return;
    const id = (current.graph.paths[current.selected] || []).includes(key) ? current.selected : record.threadId;
    chooseNode(key, id, true); editDraft(id + ':' + key, {quote, branch: true});
  }, [chooseNode, editDraft]);

  const branchNode = useCallback((key, sourceId) => {
    const current = state.current;
    const id = (current.graph.paths[current.selected] || []).includes(key) ? current.selected : sourceId;
    chooseNode(key, id, true); editDraft(id + ':' + key, {branch: true});
  }, [chooseNode, editDraft]);

  const foldNode = useCallback(key => {
    setFolded(previous => {const next = {...previous, [key]: !previous[key]}; save({view: {folded: next}}); return next;});
  }, [save]);
  const focusNode = useCallback(key => {
    const instance = flow.current;
    if (!instance?.getNode(key)) return;
    const bounds = instance.getNodesBounds([key]);
    return instance.setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {zoom: instance.getZoom(), duration: 250});
  }, []);
  const openNative = useCallback(id => {try {Promise.resolve(host.nativeChat(id)).catch(fail);} catch (failure) {fail(failure);}}, [host, fail]);

  useEffect(() => {
    const hidden = new Set();
    for (const [key, isFolded] of Object.entries(folded)) if (isFolded) for (const child of descendants(key, graph.edges)) hidden.add(child);
    const path = new Set(graph.paths[selected] || []);
    setNodes(graph.nodes.map(node => ({...node, hidden: hidden.has(node.id), data: {...node.data, active: node.id === activeKey, onPath: path.has(node.id), folded: !!folded[node.id], readOnly, select: chooseNode, read: (key, id) => chooseNode(key, id, true), branch: branchNode, quote: quoteNode, fold: foldNode, focus: focusNode, native: openNative}})));
  }, [graph, selected, activeKey, folded, readOnly, chooseNode, branchNode, quoteNode, foldNode, focusNode, openNative, setNodes]);

  const edges = useMemo(() => {
    const path = new Set(graph.paths[selected] || []);
    const hidden = new Set(nodes.filter(node => node.hidden).map(node => node.id));
    return graph.edges.map(edge => ({...edge, hidden: hidden.has(edge.source) || hidden.has(edge.target), style: {...edge.style, stroke: path.has(edge.source) && path.has(edge.target) ? '#6f8273' : edge.style?.stroke, strokeWidth: path.has(edge.source) && path.has(edge.target) ? 2.2 : 1.5}}));
  }, [graph.edges, graph.paths, selected, nodes]);

  async function sendQuestion() {
    if (busy || state.current.readOnly) return;
    const current = state.current;
    const destination = questionTarget(current.graph, current.activeKey, current.selected, current.snapshot.histories);
    const content = newTopic ? current.rootDraft : current.draft.text;
    if (!content.trim()) return;
    const branch = !!destination?.historical || current.draft.branch || !!current.draft.quote;
    setBusy(true); setError('');
    try {
      const result = await call('send_question', newTopic ? {question: content, ...(selectedThread?.cwd ? {cwd: selectedThread.cwd} : {})} : {id: destination?.threadId || current.selected, question: content, branch, ...(branch ? {turnId: destination?.turnId, ...(current.draft.quote ? {quote: current.draft.quote} : {})} : {})});
      if (!mounted.current) return;
      if (!result.accepted) {setError(result.warning || '本次问题未被接受，草稿已保留。'); return;}
      if (newTopic) {setRootDraft(''); save({view: {rootDraft: ''}});} else editDraft(current.draftKey, {text: '', quote: '', branch: false});
      setNewTopic(false); setActive(null);
      const id = result.thread?.id || current.selected;
      setSelected(id); host.setActiveThread?.(id); await refresh(id);
      if (result.warning) setError(result.warning);
    } catch (failure) {fail(failure);} finally {if (mounted.current) setBusy(false);}
  }

  async function stopGeneration() {
    if (busy || readOnly || !runningTurn) return;
    setBusy(true);
    try {await call('stop_turn', {id: selected, turnId: runningTurn.id}); await readCurrent(selected);} catch (failure) {fail(failure);} finally {if (mounted.current) setBusy(false);}
  }
  async function respond(approval, response) {
    if (busy || readOnly) return;
    setBusy(true);
    try {await call('respond_approval', {approvalId: approval.id, threadId: approval.threadId, turnId: approval.turnId, ...response}); await readCurrent(selected);} catch (failure) {fail(failure);} finally {if (mounted.current) setBusy(false);}
  }
  async function olderTurns() {
    if (loading || !selectedHistory?.nextCursor) return;
    const id = selected;
    setLoading(true);
    try {
      const page = await call('read_session', {id, cursor: selectedHistory.nextCursor});
      if (mounted.current) setSnapshot(previous => ({...previous, histories: {...previous.histories, [id]: mergeHistory(previous.histories[id], page, true)}}));
    } catch (failure) {fail(failure);} finally {if (mounted.current) setLoading(false);}
  }
  async function moreThreads() {
    if (loading || !snapshot.nextCursor) return;
    setLoading(true);
    try {const page = await call('list_sessions', {cursor: snapshot.nextCursor}); if (mounted.current) setSnapshot(previous => ({...previous, threads: mergeThreads(previous.threads, page.data || page.threads || []), nextCursor: page.nextCursor, listPagesLoaded: true}));} catch (failure) {fail(failure);} finally {if (mounted.current) setLoading(false);}
  }
  const toggleSidebar = () => {setSidebar(!sidebar); save({view: {sidebar: !sidebar}});};
  const toggleDetail = () => {setDetail(!detail); save({view: {detail: !detail}});};
  const title = newTopic ? '新讨论' : titleOf(selectedThread);
  const recordPath = graph.paths[selected] || [];
  const activeIndex = recordPath.indexOf(activeKey);

  return <div ref={workspaceElement} className={'synapse-workspace ' + (sidebar ? '' : 'sidebar-closed ') + (detail || newTopic ? 'detail-open ' : '')} data-testid="synapse-workspace">
    {sidebar && <nav className="sessions" aria-label="本机会话"><div className="sidebar-heading"><span><Network size={17}/>会话地图</span><button className="icon-button" onClick={toggleSidebar} title="收起会话列表" aria-label="收起会话列表"><PanelLeftClose size={16}/></button></div><label className="session-search"><Search size={14}/><input aria-label="搜索会话或目录" placeholder="搜索会话或目录" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button className="icon-button" aria-label="清除搜索" onClick={() => setQuery('')}><X size={13}/></button>}</label><button className="new-topic" disabled={readOnly} onClick={() => {setNewTopic(true); setDetail(true);}}><Plus size={15}/>新讨论</button>
      <div className="session-groups">{groups.map(group => <section className="session-group" key={group.key}><button className="group-heading" title={group.key} onClick={() => setClosedGroups(previous => ({...previous, [group.key]: !previous[group.key]}))}>{closedGroups[group.key] ? <ChevronRight size={12}/> : <ChevronDown size={12}/>}<Folder size={13}/><span>{group.label}</span><small>{group.threads.length}</small></button>{!closedGroups[group.key] && group.threads.map(thread => <button key={thread.id} className={'session ' + (selected === thread.id && !newTopic ? 'current' : '')} title={titleOf(thread)} onClick={() => chooseSession(thread.id)}><span className="session-symbol">{thread.forkedFromId || snapshot.layout.branches?.[thread.id] ? <GitBranch size={13}/> : <span className="session-dot"/>}</span><span>{titleOf(thread)}</span>{selected === thread.id && !newTopic && <span className="selected-indicator"/>}</button>)}</section>)}{!groups.length && !loading && <p className="empty-list">{query ? '没有匹配的会话' : '暂无本机会话'}</p>}{snapshot.nextCursor && <button className="more-sessions" disabled={loading} onClick={moreThreads}>加载更多会话</button>}</div><div className="sidebar-foot"><i className={context.testing ? 'test-dot' : 'connection-dot'}/>{context.testing ? '模拟数据' : '本机 Codex'}<span>{readOnly ? '只读' : '已连接'}</span></div></nav>}
    <main className="map-main"><header className="map-toolbar"><div className="map-title">{!sidebar && <button className="icon-button" aria-label="展开会话列表" onClick={toggleSidebar}><PanelLeftOpen size={17}/></button>}<div><strong title={title}>{title}</strong><span>{recordPath.length ? `${recordPath.length} 轮问答` : '选择会话，查看思路如何展开'}{snapshot.familyTruncated ? ' · 部分关联会话尚未加载' : ''}</span></div></div><div className="toolbar-actions"><button className="icon-button" title="同步会话" aria-label="同步会话" disabled={loading} onClick={() => refresh(selected)}><RefreshCw size={15} className={loading ? 'spin' : ''}/></button><button className="icon-button" title="适应画布" aria-label="适应画布" onClick={() => flow.current?.fitView({padding: .14, maxZoom: .9, duration: 250})}><Focus size={16}/></button><button className="icon-button" title="定位当前问答（保持缩放）" aria-label="定位当前问答" disabled={!currentRecord} onClick={() => focusNode(activeKey)}><LocateFixed size={16}/></button><button className={'detail-toggle ' + (detail ? 'active' : '')} disabled={!currentRecord && !newTopic} onClick={toggleDetail}><FileText size={14}/>详情</button><button className="native-link" disabled={!selected} onClick={() => openNative(selected)}>原生聊天<ArrowUpRight size={14}/></button></div></header>
      {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="关闭错误提示" onClick={() => setError('')}><X size={14}/></button></div>}
      {selectedHistory?.warning && <div className="status-warning">{selectedHistory.warning}<button onClick={() => openNative(selected)}>查看原生聊天<ArrowUpRight size={12}/></button></div>}
      <div className="canvas-view" id={canvasId}><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onInit={instance => {flow.current = instance; if (initialViewport.current) instance.setViewport(initialViewport.current);}} defaultViewport={{x: 52, y: 40, zoom: .82}} minZoom={.12} maxZoom={1.6} nodesConnectable={false} nodesDraggable={false} panOnScroll={false} zoomOnScroll={true} deleteKeyCode={null} selectionOnDrag={false} onlyRenderVisibleElements proOptions={{hideAttribution: true}} onMoveEnd={(_, viewport) => save({view: {viewport}})}>
        <Background color="#d5d2cb" gap={22} size={.8}/><Controls showInteractive={false}/><MiniMap pannable zoomable nodeColor={node => node.data.active ? '#6f8273' : node.data.onPath ? '#b7c0b4' : '#d6d2c9'} maskColor="rgba(247,246,242,.72)"/>
        <CanvasScrollbars nodes={nodes} controls={canvasId}/>
      </ReactFlow>{!graph.nodes.length && <div className="empty-canvas">{loading ? <LoaderCircle size={29} className="spin"/> : <Network size={29}/>}<strong>{loading ? '正在读取本机会话…' : '从一段对话展开'}</strong><p>{query ? '试试其他搜索词' : '在左侧选择会话；每一轮问题和回答都会成为地图上的一个节点。'}</p></div>}
      {!!graph.nodes.length && <div className="canvas-note"><span className="path-legend"/>当前会话路径<span className="branch-legend"/>原生分支</div>}{approvals.length > 0 && !detail && <button className="approval-badge" onClick={() => setDetail(true)}>{approvals.length} 项等待处理</button>}</div>
      <footer className="workspace-foot"><span>{readOnly ? '只读模式' : <><Check size={12}/>{saved ? '布局与草稿已保存' : '正在保存…'}</>}</span><span>拖动边缘滚动条平移 · 滚轮缩放 · 分支自动排列</span></footer>
    </main>
    {(detail || newTopic) && <aside className="detail-pane" aria-label="问答详情"><header className="detail-heading"><div><span>{newTopic ? '新讨论' : `问答 ${activeIndex >= 0 ? activeIndex + 1 : (currentRecord?.index || 0) + 1}`}</span><small>{newTopic ? selectedThread?.cwd || '当前工作目录' : titleOf(selectedThread)}</small></div><button className="icon-button" aria-label="关闭详情" onClick={() => {setNewTopic(false); setDetail(false); save({view: {detail: false}});}}><X size={16}/></button></header><div className="detail-scroll"><ApprovalPanel approvals={approvals} disabled={readOnly} busy={busy} respond={respond} native={openNative}/>{selectedHistory?.nextCursor && !newTopic && <button className="load-older" disabled={loading} onClick={olderTurns}>加载更早的问答</button>}{newTopic ? <div className="new-topic-intro"><GitBranch size={24}/><h2>从新的问题开始</h2><p>输入一个问题，创建本机 Codex 会话。后续可从任意一轮继续发散。</p></div> : currentRecord ? <TurnBody turn={currentRecord.turn} onQuote={quote => quoteNode(activeKey, quote)}/> : <p className="reader-empty">选择地图上的问答节点</p>}</div>
      {!newTopic && currentRecord && <div className="turn-pagination"><button aria-label="上一轮问答" disabled={activeIndex <= 0} onClick={() => {const key = recordPath[activeIndex - 1]; chooseNode(key, selected); focusNode(key);}}><ChevronLeft size={14}/>上一轮</button><span>{activeIndex + 1} / {recordPath.length}</span><button aria-label="下一轮问答" disabled={activeIndex < 0 || activeIndex >= recordPath.length - 1} onClick={() => {const key = recordPath[activeIndex + 1]; chooseNode(key, selected); focusNode(key);}}>下一轮<ChevronRight size={14}/></button></div>}
      {(newTopic || currentRecord) && <div className="detail-composer"><Composer value={newTopic ? rootDraft : draft.text} onChange={text => {if (newTopic) {setRootDraft(text); save({view: {rootDraft: text}});} else editDraft(draftKey, {text});}} disabled={readOnly} busy={busy} generating={generating} historical={!newTopic && target?.historical} branch={!newTopic && draft.branch} onBranch={newTopic ? undefined : () => editDraft(draftKey, {branch: !draft.branch})} quote={newTopic ? '' : draft.quote} onQuoteChange={quote => editDraft(draftKey, {quote})} onClearQuote={() => editDraft(draftKey, {quote: ''})} onSend={sendQuestion} onStop={stopGeneration} label={newTopic ? '输入新讨论的问题…' : draft.branch ? '从这一轮探索另一个方向…' : '继续当前会话…'}/></div>}
    </aside>}
  </div>;
}

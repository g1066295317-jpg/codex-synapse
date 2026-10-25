export function mergeThreads(previous = [], incoming = []) {
  const records = new Map(previous.map(thread => [thread.id, thread]));
  for (const thread of incoming) records.set(thread.id, {...records.get(thread.id), ...thread});
  return [...records.values()];
}

// History pages arrive in chronological order. A recent refresh must not discard
// older pages the reader explicitly loaded.
export function mergeHistory(previous, incoming, older = false) {
  if (!previous) return incoming;
  const first = older ? incoming.turns || [] : previous.turns || [];
  const second = older ? previous.turns || [] : incoming.turns || [];
  const turns = new Map(first.map(turn => [turn.id, turn]));
  for (const turn of second) turns.set(turn.id, turn);
  return {...previous, ...incoming, turns: [...turns.values()], olderLoaded: older || previous.olderLoaded, nextCursor: older || !previous.olderLoaded ? incoming.nextCursor : previous.nextCursor};
}

export function groupThreads(threads, query = '') {
  const needle = query.trim().toLocaleLowerCase();
  const groups = new Map();
  for (const thread of threads) {
    if (needle && !`${thread.name || ''} ${thread.preview || ''} ${thread.cwd || ''}`.toLocaleLowerCase().includes(needle)) continue;
    const key = thread.project?.name || thread.projectName || thread.cwd || '其他会话';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(thread);
  }
  return [...groups].map(([key, items]) => ({key, label: key.split(/[\\/]/).filter(Boolean).at(-1) || key, threads: items}));
}

export function questionTarget(graph, key, selectedId, histories) {
  const record = graph.records.get(key);
  if (!record) return null;
  const selectedPath = graph.paths[selectedId] || [];
  const threadId = selectedPath.includes(key) ? selectedId : record.threadId;
  const path = graph.paths[threadId] || [];
  const index = path.indexOf(key);
  return {threadId, turnId: histories[threadId]?.turns?.[index]?.id || record.turn.id, historical: path.at(-1) !== key};
}

export function normalizeDraft(draft = {}, historical = false) {
  return {text: draft.text || '', quote: draft.quote || '', branch: historical || !!draft.branch || !!draft.quote};
}

export function approvalChoices(approval) {
  return (approval.availableDecisions || []).map((value, index) => {
    const kind = typeof value === 'string' ? value : Object.keys(value || {})[0];
    const labels = {accept: '允许本次', acceptForSession: '本会话允许', decline: '拒绝', cancel: '取消', approved: '允许本次', approved_for_session: '本会话允许', denied: '拒绝', abort: '中止'};
    return {value, key: String(index), label: labels[kind] || kind || '确认', negative: /decline|denied|cancel|abort/i.test(kind)};
  });
}

export function approvalAnswers(questions, values) {
  return Object.fromEntries(questions.map(question => [question.id, {answers: [values[question.id] || '']} ]));
}

export function isRunning(turn) {
  return ['inProgress', 'in_progress', 'running'].includes(turn?.status);
}

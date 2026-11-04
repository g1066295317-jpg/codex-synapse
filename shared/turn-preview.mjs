import {mathPreview} from '../src/math-markdown.mjs';

const publicText = (turn, type) => (turn.items || []).filter(item => item.type === type);
// A preview is disposable display data. It is never sent back as model context.
export const previewTurn = turn => {
  const question = publicText(turn, 'userMessage').flatMap(item => (item.content || []).filter(part => part.type === 'text').map(part => part.text || '')).join('\n');
  const answer = publicText(turn, 'agentMessage').map(item => item.text || '').join('\n\n');
  return {
    id: turn.id, status: turn.status, startedAt: turn.startedAt, completedAt: turn.completedAt,
    previewOnly: true, itemsView: 'summary',
    error: turn.error ? {message: String(turn.error.message || '本轮生成失败').slice(0, 1000)} : null,
    toolCount: turn.toolCount ?? (turn.items || []).filter(item => !['userMessage', 'agentMessage', 'reasoning'].includes(item.type)).length,
    items: [
      {type: 'userMessage', content: [{type: 'text', text: mathPreview(question, 400)}]},
      {type: 'agentMessage', text: mathPreview(answer, 850)},
    ],
  };
};

export const previewHistory = history => {
  if (!history?.thread) return history;
  const {turns: _ignored, ...thread} = history.thread;
  return {...history, thread, turns: (history.turns || []).map(previewTurn)};
};

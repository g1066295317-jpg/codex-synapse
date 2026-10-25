import test from 'node:test';
import assert from 'node:assert/strict';
import {approvalAnswers, approvalChoices, groupThreads, mergeHistory, mergeThreads, normalizeDraft, questionTarget} from '../src/native-state.mjs';
import {turnGraph, answerText, userText} from '../src/turn-graph.mjs';

const turn = (id, question = id, answer = id) => ({id, status: 'completed', items: [{type: 'userMessage', content: [{type: 'text', text: question}]}, {type: 'agentMessage', text: answer}]});

test('identical text cannot imply native shared history', () => {
  const graph = turnGraph({main: {thread: {id: 'main'}, turns: [turn('a', '相同问题', '相同回答')]}, fork: {thread: {id: 'fork', forkedFromId: 'main'}, turns: [turn('b', '相同问题', '相同回答')]}});
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 0);
  assert.deepEqual(graph.paths.fork, ['fork_b']);
});

test('shared native turn IDs keep continuation on the selected child thread', () => {
  const first = turn('a');
  const histories = {main: {thread: {id: 'main'}, turns: [first, turn('b')]}, fork: {thread: {id: 'fork', forkedFromId: 'main'}, turns: [first]}};
  const graph = turnGraph(histories);
  assert.deepEqual(questionTarget(graph, 'main_a', 'fork', histories), {threadId: 'fork', turnId: 'a', historical: false});
  assert.equal(questionTarget(graph, 'main_a', 'main', histories).historical, true);
  assert.equal(normalizeDraft({text: '保留  原文', branch: false}, true).branch, true);
});

test('an exact stored fork anchor connects a truncated child page', () => {
  const histories = {main: {thread: {id: 'main'}, turns: [turn('a'), turn('b')]}, fork: {thread: {id: 'fork'}, turns: [turn('c')]}};
  const graph = turnGraph(histories, {fork: {parentId: 'main', turnId: 'a'}});
  assert.equal(graph.edges.find(edge => edge.target === 'fork_c').source, 'main_a');
});

test('history refresh retains loaded older turns and does not reset exhausted pagination', () => {
  const recent = {thread: {id: 'synthetic'}, turns: [turn('b'), turn('c')], nextCursor: 'older-page'};
  const withOlder = mergeHistory(recent, {thread: recent.thread, turns: [turn('a'), turn('b')], nextCursor: null}, true);
  const fresh = mergeHistory(withOlder, {...recent, turns: [turn('b'), turn('c', 'c', '正在更新')]});
  assert.deepEqual(fresh.turns.map(item => item.id), ['a', 'b', 'c']);
  assert.equal(fresh.turns.at(-1).items[1].text, '正在更新');
  assert.equal(fresh.nextCursor, null);
});

test('project grouping and title/directory search preserve stable thread order', () => {
  const source = [{id: '1', name: '第一个', cwd: 'D:\\研究\\MRI'}, {id: '2', name: '第二个', cwd: 'D:\\研究\\MRI'}, {id: '3', name: '其他', cwd: 'D:\\tools'}];
  assert.deepEqual(groupThreads(source, '研究')[0].threads.map(item => item.id), ['1', '2']);
  assert.equal(groupThreads(source, 'MRI')[0].label, 'MRI');
  assert.equal(groupThreads(source, '第一个').length, 1);
  const merged = mergeThreads(source, [{id: '1', name: '修改后的标题'}, {id: '4', name: '新会话'}]);
  assert.deepEqual(merged.map(item => item.id), ['1', '2', '3', '4']);
  assert.equal(merged[0].cwd, source[0].cwd);
});

test('approval choices round trip the original advertised object unchanged', () => {
  const decision = {acceptWithExecpolicyAmendment: {execpolicy_amendment: ['echo']}};
  const choices = approvalChoices({availableDecisions: ['decline', decision]});
  assert.equal(choices[1].value, decision);
  assert.equal(choices[0].negative, true);
  assert.deepEqual(approvalAnswers([{id: 'mode'}, {id: 'reason'}], {mode: '推荐选项', reason: '保留  空格'}), {mode: {answers: ['推荐选项']}, reason: {answers: ['保留  空格']}});
});

test('visible message extraction preserves wording and excludes internal reasoning', () => {
  const fixture = {items: [{type: 'userMessage', content: [{type: 'text', text: ' 第一行  '}, {type: 'text', text: '第二行'}]}, {type: 'reasoning', summary: [{text: 'PRIVATE_SYNTHETIC_REASONING'}]}, {type: 'agentMessage', text: '答复一'}, {type: 'agentMessage', text: '答复二'}]};
  assert.equal(userText(fixture), ' 第一行  \n第二行');
  assert.equal(answerText(fixture), '答复一\n\n答复二');
  assert.ok(!answerText(fixture).includes('PRIVATE_SYNTHETIC_REASONING'));
});

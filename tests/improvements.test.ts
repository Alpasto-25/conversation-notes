import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { emptyConversation, newNotebook } from '../src/notebooks';
import { matchingMessages } from '../src/message-search';
import { createNotebookStore } from '../src/storage';
import { planAnalysis } from '../src/analysis-plan';
import { reviseNotebook, undoMessageChange } from '../src/message-edit';
import { checkpointNotebook, restoreAnalysisVersion, mergeRunHistory, billingMonth } from '../src/analysis-history';
import { boundedContext } from '../shared/memory';
import { RUBRIC, requestContextKey, type Message, type AnalysisRequest, type LineResult } from '../shared/types';
import type { AnalysisUsage } from '../shared/usage';

const model = { provider: 'deepseek', model: 'deepseek-flash' };
const messages: Message[] = Array.from({ length: 150 }, (_, i) => ({ id: 'm' + i, sender: i % 2 ? 'other' : 'self', text: '原文 ' + i, timestamp: '2026/10/1 12:00', kind: 'text' }));
function fixture() { return newNotebook({ ...emptyConversation('friend'), self: '我', other: '对方', messages, analysisIdentity: model }); }
async function lineAt(index: number) {
  const context = boundedContext(messages, Math.max(0, index - 99), index + 1, {}, true);
  const job: AnalysisRequest = { ...context, task: 'self_message', targetIds: [messages[index].id], relation: 'friend', revision: 1 };
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(requestContextKey(job)));
  const hash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  return { id: messages[index].id, score: { value: 70, confidence: .8, status: 'clear', probabilities: {} },
    analysisContext: { hash, ...model, rubric: RUBRIC, task: 'self_message', targetIds: job.targetIds, fullScene: false, distant: false } } as LineResult;
}
test('正文搜索查找标题以外的原话、发送人和日期，回收站不混入', () => {
  const note = fixture(); note.conversation = { ...note.conversation, messages: [{ ...messages[0], text: '搬家周三讨论' }] };
  assert.equal(matchingMessages(note, '搬家').length, 1);
  assert.equal(matchingMessages(note, '搬家', { sender: 'other' }).length, 0);
  assert.equal(matchingMessages(note, '搬家', { from: '2026-10-01', to: '2026-10-01' }).length, 1);
  assert.equal(matchingMessages({ ...note, deletedAt: new Date().toISOString() }, '搬家').length, 0);
});
test('正文搜索读取完整库并定位超过虚拟列表首屏的消息，阅读位置重启保留', async () => {
  const store = createNotebookStore(new IDBFactory()), note = fixture();
  await store.save(note); const hits = await store.searchMessages('原文 149');
  assert.equal(hits[0].messageId, 'm149'); assert.equal(hits[0].index, 149);
  await store.rememberReading(note.id, { messageId: 'm80', offset: 25 });
  assert.deepEqual((await store.load(note.id))!.reading, { messageId: 'm80', offset: 25 }); await store.close();
});
test('分析预检不发送请求，完整缓存为零基础批次，Jev 不虚构费用', () => {
  const c = { ...fixture().conversation, completed: true, analyzedCount: messages.length };
  const plan = planAnalysis(messages, 'friend', c, { configured: true, ...model }, false);
  assert.equal(plan.batches, 0); assert.equal(plan.fee, undefined);
  const jev = planAnalysis(messages.slice(0, 2), 'friend', undefined, { configured: true, provider: 'typesafe', model: 'jev-1.13.0' }, false);
  assert.equal(jev.hasJev, true); assert.equal(jev.fee, undefined); assert.ok(jev.batches > 0);
});
test('编辑未来消息保留较早的因果评分，修改实际参考原话则失效', async () => {
  const note = fixture(); note.conversation.lines.m10 = await lineAt(10);
  const future = messages.map(m => m.id === 'm149' ? { ...m, text: '后来发生的新信息' } : m);
  const unchanged = await reviseNotebook(note, future, '编辑未来消息');
  assert.equal(unchanged.conversation.lines.m10.score.value, 70);
  const past = messages.map(m => m.id === 'm5' ? { ...m, text: '原话实际变了' } : m);
  const changed = await reviseNotebook(note, past, '编辑过去消息');
  assert.equal(changed.conversation.lines.m10, undefined);
  assert.deepEqual(undoMessageChange(changed).conversation, note.conversation);
});
test('消息修改撤销恢复各场景，旧结果缺少上下文记录时保守失效', async () => {
  const note = fixture(); note.conversation.lines.m10 = { id: 'm10', score: { value: 0, confidence: .8, status: 'clear', probabilities: {} } };
  note.scenes.friend = note.conversation; note.draft = '草稿';
  const changed = await reviseNotebook(note, messages.filter(m => m.id !== 'm149'), '删除');
  assert.equal(changed.conversation.lines.m10, undefined); assert.equal(changed.draft, '草稿');
  const restored = undoMessageChange(changed); assert.deepEqual(restored.scenes, note.scenes); assert.deepEqual(restored.conversation, note.conversation);
});
test('恢复旧分析版本不撤销历史用量，原文变化禁止套用版本', () => {
  const note = fixture(); note.conversation.lines.m10 = { id: 'm10', score: { value: 0, confidence: .8, status: 'clear', probabilities: {} } };
  const run = (id: string, tokens: number): AnalysisUsage => ({ run_id: id, ...model, input_tokens: tokens, output_tokens: 1, elapsed_ms: 1, local_targets: 0, requests: 1 });
  const old = checkpointNotebook(note, '重算前');
  const current = { ...old, runHistory: [run('one', 20), run('two', 30)], conversation: { ...old.conversation, lines: {} } };
  const restored = restoreAnalysisVersion(current, old.versions![0].id);
  assert.equal(restored.conversation.lines.m10.score.value, 0); assert.deepEqual(restored.runHistory, current.runHistory);
  assert.throws(() => restoreAnalysisVersion({ ...current, conversation: { ...current.conversation, messages: [] } }, old.versions![0].id), /原文/);
  assert.equal(mergeRunHistory([run('one', 20)], run('one', 2))[0].input_tokens, 20);
  assert.equal(mergeRunHistory([run('one', 20)], run('one', 25)).length, 1);
  assert.equal(billingMonth({ ...run('one', 20), started_at: '2026-09-30T20:00:00Z' }), '2026-10');
});

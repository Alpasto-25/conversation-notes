import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IDBFactory } from 'fake-indexeddb';
import { emptyConversation, newNotebook } from '../src/notebooks';
import { saveAnalysisResults, retainCurrentAnalysis, checkpointNotebook, deleteAnalysisVersion, restoreAnalysisVersion, type AnalysisResult } from '../src/analysis-history';
import { createNotebookStore } from '../src/storage';
import { decodeBackup, encodeBackup } from '../src/backup';
import { AnalysisTimeline } from '../src/AnalysisTimeline';
import { RUBRIC } from '../shared/types';

function fixture() {
  const usage = { purpose: 'basic' as const, status: 'complete' as const, run_id: 'analysis-delete-fixture', model: 'openai/gpt-6-luna-decisions', provider: 'openrouter',
    input_tokens: 200, output_tokens: 0, cost_usd: .00002, elapsed_ms: 1000, requests: 1, local_targets: 0, started_at: '2026-10-23T01:00:00Z', finished_at: '2026-10-23T01:00:01Z' };
  const note = newNotebook({ ...emptyConversation('general'), self: '我', other: '朋友', completed: true, analyzedCount: 1, analysisUsage: usage,
    messages: [{ id: 'o', sender: 'other', kind: 'text', timestamp: null, text: '我们下次再聊。' }],
    lines: { o: { id: 'o', score: { value: null, confidence: .8, status: 'ambiguous', probabilities: {} }, emotions: { happy: .7 } } } });
  note.scenes.general = note.conversation; note.runHistory = [usage];
  const result: AnalysisResult = { runId: usage.run_id, phase: 'basic', at: usage.finished_at, conversation: note.conversation };
  return { note: saveAnalysisResults(note, [result]), result };
}
test('删除指定历史结果保留当前聊天、当前分析、各场景与已发生用量', () => {
  const { note } = fixture(), before = structuredClone(note);
  const deleted = deleteAnalysisVersion(note, note.versions![0].id);
  assert.equal(deleted.versions?.length, 0);
  assert.deepEqual(deleted.conversation, before.conversation); assert.deepEqual(deleted.scenes, before.scenes);
  assert.deepEqual(deleted.runHistory, before.runHistory); assert.deepEqual(note, before);
  assert.throws(() => restoreAnalysisVersion(deleted, before.versions![0].id), /不能套用/);
  assert.throws(() => deleteAnalysisVersion(deleted, before.versions![0].id), /不存在/);
});
test('删除标记经持久化和备份保留，自动保存、重启迁移与重算前检查不会复活已删运行', async () => {
  const { note, result } = fixture(), deleted = deleteAnalysisVersion(note, note.versions![0].id);
  const store = createNotebookStore(new IDBFactory()); await store.save(deleted, true);
  const persisted = (await store.load(note.id))!;
  const restored = (await decodeBackup(await encodeBackup([persisted]))).notebooks[0];
  assert.deepEqual(restored.deletedAnalysisVersions, deleted.deletedAnalysisVersions);
  assert.equal(saveAnalysisResults(restored, [result]).versions?.length, 0);
  assert.equal(retainCurrentAnalysis(restored).versions?.length, 0);
  assert.equal(checkpointNotebook(restored, '重新分析前').versions?.length, 0);
  const nextResult = { ...result, runId: 'a-new-analysis', conversation: { ...result.conversation, analysisUsage: { ...note.conversation.analysisUsage!, run_id: 'a-new-analysis' } } };
  assert.equal(saveAnalysisResults(restored, [nextResult]).versions?.length, 1);
});
test('删除未带显式 runId 的旧快照仍使用其已有用量身份，其他历史可继续恢复', () => {
  const { note, result } = fixture();
  note.versions = [{ ...note.versions![0], id: 'legacy-snapshot', runId: undefined }];
  const another = { ...result, runId: 'another-result', conversation: { ...result.conversation, analysisUsage: { ...note.conversation.analysisUsage!, run_id: 'another-result' } } };
  const next = saveAnalysisResults(note, [another]), deleted = deleteAnalysisVersion(next, 'legacy-snapshot');
  assert.deepEqual(deleted.versions?.map(v => v.runId), ['another-result']);
  assert.ok(deleted.deletedAnalysisVersions?.includes(result.runId));
  assert.equal(retainCurrentAnalysis(deleted).versions?.length, 1);
  assert.equal(restoreAnalysisVersion(deleted, 'another-result').conversation.analysisUsage?.run_id, 'another-result');
});
test('比较范围使用简短模型名，完整模型与规则留在可展开来源中，规则不同仍分组', () => {
  const point = { at: '2026-10-23T01:00:00Z', count: 1, value: 55, provider: 'openrouter', model: 'openai/gpt-6-luna-decisions', rubric: RUBRIC, relation: 'general' as const };
  const html = renderToStaticMarkup(createElement(AnalysisTimeline, { points: [point] }));
  const label = html.match(/<option[^>]*>([^<]*)<\/option>/)?.[1];
  assert.equal(label, 'OpenAI Decisions · 通用沟通 · OpenRouter');
  assert.match(html, /来源详情/); assert.match(html, /openai\/gpt-6-luna-decisions/); assert.match(html, /规则版本/);
  const differentRules = renderToStaticMarkup(createElement(AnalysisTimeline, { points: [point, { ...point, rubric: 'other-rubric' }] }));
  assert.equal([...differentRules.matchAll(/<option /g)].length, 2);
});

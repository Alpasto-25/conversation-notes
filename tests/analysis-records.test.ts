import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { newNotebook, emptyConversation } from '../src/notebooks';
import { saveAnalysisResults, retainCurrentAnalysis, restoreAnalysisVersion, usagePurpose, type AnalysisResult } from '../src/analysis-history';
import { runModelSummary } from '../src/usage-summary';
import { AnalysisUsage as UsageView } from '../src/AnalysisUsage';
import { createNotebookStore } from '../src/storage';
import { decodeBackup, encodeBackup } from '../src/backup';
import type { AnalysisUsage } from '../shared/usage';

const basic: AnalysisUsage = { purpose: 'basic', status: 'complete', run_id: 'basic-one', provider: 'openrouter', model: 'openai/gpt-6-luna-decisions',
  started_at: '2026-10-23T01:00:00Z', finished_at: '2026-10-23T01:00:06.500Z', input_tokens: 122871, output_tokens: 0, requests: 13, cost_usd: .0122871, elapsed_ms: 6500, local_targets: 0 };
function fixture() {
  return newNotebook({ ...emptyConversation('friend'), self: '我', other: '朋友', messages: [{ id: 'o', text: '那你就这样结束吗？', sender: 'other', kind: 'text', timestamp: null }],
    lines: { o: { id: 'o', emotions: { disappointed: .8 }, score: { value: null, confidence: .8, status: 'ambiguous', probabilities: {} } } },
    analysisIdentity: { provider: 'openrouter', model: basic.model! }, analyzedCount: 1, completed: true, analysisUsage: basic });
}
test('每次结果独立冻结、稳定关联运行编号，持久化与备份保留基础及补充两份', async () => {
  const note = fixture();
  const first: AnalysisResult = { runId: basic.run_id!, at: basic.finished_at!, phase: 'basic', conversation: note.conversation };
  const base = saveAnalysisResults(note, [first]);
  const supplement: AnalysisUsage = { ...basic, run_id: 'supplement-one', purpose: 'supplement', model: 'deepseek-flash', provider: 'deepseek' };
  const c = structuredClone(note.conversation); c.lines.o.subtext = '可能希望朋友继续回应。'; c.semanticUsage = supplement;
  const next = saveAnalysisResults({ ...base, conversation: c, runHistory: [basic, supplement] }, [{ runId: supplement.run_id!, at: supplement.finished_at!, phase: 'supplement', conversation: c }]);
  c.lines.o.subtext = '后来修改了显示结果';
  assert.equal(next.versions?.length, 2);
  assert.equal(next.versions?.[0].conversation.lines.o.subtext, undefined);
  assert.equal(next.versions?.[1].conversation.lines.o.subtext, '可能希望朋友继续回应。');
  assert.equal(saveAnalysisResults(note, [first]).versions?.[0].id, base.versions?.[0].id);
  assert.equal(saveAnalysisResults(next, [first]).versions?.length, 2);
  const store = createNotebookStore(new IDBFactory()); await store.save(next, true);
  const saved = (await store.load(next.id))!;
  const decoded = (await decodeBackup(await encodeBackup([saved]))).notebooks[0];
  assert.deepEqual(decoded.versions, next.versions);
  const restored = restoreAnalysisVersion(decoded, decoded.versions![0].id);
  assert.equal(restored.conversation.lines.o.subtext, undefined);
  assert.equal(restored.runHistory?.length, 2);
  assert.ok(restored.versions?.some(v => v.runId === 'supplement-one'));
  assert.throws(() => restoreAnalysisVersion({ ...decoded, conversation: { ...decoded.conversation, self: '另一个人' } }, decoded.versions![0].id), /身份/);
});
test('旧数据只迁移实际保留的当前结果，不根据用量虚构旧结果', () => {
  const note = fixture(); note.runHistory = [{ ...basic, run_id: 'lost-old' }, basic];
  const migrated = retainCurrentAnalysis(note);
  assert.equal(migrated.versions?.length, 1);
  assert.equal(migrated.versions?.[0].runId, basic.run_id);
  assert.equal(retainCurrentAnalysis(migrated).versions?.length, 1);
});
test('单次基础分析显示实际模型耗时与美元费用，不混入未调用模型，未知费用不显示零', () => {
  const rows = runModelSummary(basic);
  assert.equal(rows.length, 1); assert.equal(rows[0].name, 'OpenAI Decisions');
  assert.equal(rows[0].elapsed, 6500); assert.equal(rows[0].cost, '$0.01229');
  const html = renderToStaticMarkup(createElement(UsageView, { usage: basic }));
  assert.match(html, /6.5 秒/); assert.match(html, /\$0.01229/); assert.match(html, /<details/);
  assert.doesNotMatch(html, /DeepSeek/);
  assert.equal(runModelSummary({ ...basic, cost_usd: undefined })[0].cost, '费用未提供');
  assert.equal(runModelSummary({ ...basic, cost_usd: 0 })[0].cost, '$0');
});
test('补充用量按实际调用分模型计算时间、分币种展示，旧记录仍可识别分析阶段', () => {
  const detail = { repair: false, prompt_family: 'test', started_at: basic.started_at!, finished_at: basic.finished_at!, requests: 1, input_tokens: 100, output_tokens: 10 };
  const run: AnalysisUsage = { ...basic, purpose: undefined, provider: 'jev+deepseek', model: 'openai/gpt-6-luna-decisions + deepseek-flash', cost_usd: undefined,
    input_tokens: 200, output_tokens: 20, details: [
      { ...detail, model: 'openai/gpt-6-luna-decisions-20261006', task: 'semantic_judgment', elapsed_ms: 2000, cost_usd: .0020555 },
      { ...detail, model: 'deepseek-flash', task: 'semantics', elapsed_ms: 3000, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100 },
    ] };
  assert.equal(usagePurpose(run), 'supplement');
  const rows = runModelSummary(run); assert.equal(rows.length, 2);
  assert.equal(rows[0].elapsed, 2000); assert.equal(rows[1].elapsed, 3000);
  assert.match(rows[0].cost, /^\$/); assert.match(rows[1].cost, /^约 ¥/);
  assert.equal(runModelSummary({ ...run, details: run.details?.slice(0, 1), input_tokens: 100, output_tokens: 10 }).length, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest } from '../shared/analysis-core';
import { overviewJob } from '../shared/incremental';
import { deepseekEnvelope, deepseekAnswerFormat, deepseekRequest, evaluateCausalDeepseek, evaluateWithDeepseekRepair } from '../shared/deepseek';
import { addUsage, combineAnalysisUsage, type AnalysisUsage } from '../shared/usage';
import { IDBFactory } from 'fake-indexeddb';
import { createNotebookStore } from '../src/storage';

test('统一用量合计基础与补充请求，保留任务明细和未知缓存数', () => {
  const primary: AnalysisUsage = { input_tokens: 100, output_tokens: 20, requests: 1, model: 'jev-1.13.0', run_id: 'primary',
    local_targets: 2, elapsed_ms: 400, started_at: '2026-10-06T01:00:00.000Z', finished_at: '2026-10-06T01:00:00.400Z' };
  const semantic: AnalysisUsage = { input_tokens: 70, output_tokens: 30, requests: 2, model: 'jev-1.13.0 + deepseek-flash', run_id: 'semantic',
    prompt_cache_hit_tokens: 50, prompt_cache_miss_tokens: 20, local_targets: 3, elapsed_ms: 200,
    started_at: '2026-10-06T02:00:00.000Z', finished_at: '2026-10-06T02:00:00.200Z' };
  const combined = combineAnalysisUsage([primary, undefined, semantic])!;
  assert.equal(combined.input_tokens, 170); assert.equal(combined.output_tokens, 50); assert.equal(combined.requests, 3);
  assert.equal(combined.local_targets, 5); assert.equal(combined.elapsed_ms, 600);
  assert.equal(combined.prompt_cache_hit_tokens, undefined); assert.equal(combined.prompt_cache_miss_tokens, undefined);
  assert.equal(combined.model, 'jev-1.13.0 + deepseek-flash');
  assert.equal(combined.started_at, primary.started_at); assert.equal(combined.finished_at, semantic.finished_at);
});

test('统一用量不重复累计同一运行记录，旧记录的未知请求数保持未知', () => {
  const run: AnalysisUsage = { input_tokens: 50, output_tokens: 10, local_targets: 0, elapsed_ms: 300, run_id: 'one-run' };
  const combined = combineAnalysisUsage([run, { ...run }])!;
  assert.equal(combined.input_tokens, 50); assert.equal(combined.output_tokens, 10); assert.equal(combined.elapsed_ms, 300);
  assert.equal(combined.requests, undefined);
  assert.equal(combineAnalysisUsage([undefined]), undefined);
});

test('零调用补充不会增加真实接口用量，进行中的分析没有虚构结束时间', () => {
  const paid: AnalysisUsage = { input_tokens: 80, output_tokens: 15, requests: 1, local_targets: 0, elapsed_ms: 700,
    prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 80, finished_at: '2026-10-06T01:00:00.700Z' };
  const local: AnalysisUsage = { input_tokens: 0, output_tokens: 0, requests: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0,
    details: [], local_targets: 3, elapsed_ms: 10 };
  const combined = combineAnalysisUsage([paid, local])!;
  assert.equal(combined.requests, 1); assert.equal(combined.input_tokens, 80); assert.equal(combined.output_tokens, 15);
  assert.equal(combined.prompt_cache_miss_tokens, 80); assert.equal(combined.finished_at, undefined);
});
import { emptyConversation, newNotebook, organizeNotebook, withoutMessages } from '../src/notebooks';

test('诊断保留供应商模型与用量，不增加请求或改变 prompt，也不保存原文和 Key', async () => {
  const payload = buildRequest(overviewJob([
    { id: 'a', sender: 'self', text: 'PRIVATE_CHAT_SENTINEL', timestamp: null, kind: 'text' },
    { id: 'b', sender: 'other', text: '周二讨论？', timestamp: null, kind: 'text' },
  ], 'friend', 1, {}));
  const before = JSON.stringify(deepseekRequest(payload, 'deepseek-v4-pro'));
  let calls = 0;
  const result = await evaluateCausalDeepseek(payload, async request => {
    calls++;
    assert.equal(JSON.stringify(deepseekRequest(request, 'deepseek-v4-pro')), before);
    return deepseekEnvelope({ id: 'safe-response-id', model: 'deepseek-v4-pro',
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(deepseekAnswerFormat(request.questions).answer_example) } }],
      usage: { prompt_tokens: 22980, completion_tokens: 3864, prompt_cache_hit_tokens: 256, prompt_cache_miss_tokens: 22724 } });
  });
  assert.equal(calls, 1);
  const detail = result.usage.details?.[0];
  assert.ok(detail);
  assert.equal(detail.request_id, 'safe-response-id');
  assert.equal(detail.model, 'deepseek-v4-pro');
  assert.equal(detail.task, 'overview');
  assert.equal(detail.input_tokens, 22980);
  assert.equal(detail.prompt_cache_miss_tokens, 22724);
  assert.match(detail.prompt_family, /^[a-f0-9]{16}$/);
  assert.ok(Date.parse(detail.finished_at) >= Date.parse(detail.started_at));
  assert.doesNotMatch(JSON.stringify(result.usage), /PRIVATE_CHAT_SENTINEL|apiKey|Authorization|Bearer/);
  const combined = addUsage(result.usage, { input_tokens: 1, output_tokens: 1 });
  assert.equal(combined.prompt_cache_hit_tokens, undefined);
  assert.equal(combined.details?.length, 1);
});

test('模型来源与一次分析诊断随手记保存，切换场景和恢复不会冒充新用量', async () => {
  const store = createNotebookStore(new IDBFactory());
  const conversation = { ...emptyConversation('friend'),
    analysisIdentity: { provider: 'deepseek', model: 'deepseek-v4-pro' },
    analysisUsage: { input_tokens: 10, output_tokens: 2, requests: 1, local_targets: 0, elapsed_ms: 100,
      provider: 'deepseek', model: 'deepseek-v4-pro', run_id: 'one-run',
      started_at: '2026-10-05T03:00:00.000Z', finished_at: '2026-10-05T03:00:00.100Z' } };
  const note = newNotebook(conversation);
  await store.save(note, true);
  const restored = await store.load(note.id);
  assert.deepEqual(restored?.conversation.analysisIdentity, conversation.analysisIdentity);
  assert.deepEqual(restored?.conversation.analysisUsage, conversation.analysisUsage);
  const switched = organizeNotebook(note, note.title, note.contact, 'general');
  const back = organizeNotebook(switched, note.title, note.contact, 'friend');
  assert.deepEqual(back.conversation.analysisIdentity, conversation.analysisIdentity);
  assert.deepEqual(back.conversation.analysisUsage, conversation.analysisUsage);
});

test('成功续跑的本次用量与失败明细独立保存，切场景恢复且修改原文后失效', async () => {
  const store = createNotebookStore(new IDBFactory());
  const current = { input_tokens: 10, output_tokens: 2, requests: 1, local_targets: 0, elapsed_ms: 100, run_id: 'successful-retry' };
  const failed = { ...current, input_tokens: 300, output_tokens: 60, requests: 3, run_id: 'previous-incomplete', details: [{
    task: 'other_messages', repair: true, single_recovery: true, model: 'deepseek-flash', prompt_family: 'rules',
    started_at: '2026-10-05T03:00:00.000Z', finished_at: '2026-10-05T03:00:01.000Z', elapsed_ms: 1000,
    input_tokens: 100, output_tokens: 20, validation: 'rejected' as const,
    answer_issues: [{ kind: 'event' as const, code: 'no_positive_weight' as const, count: 1 }],
  }] };
  const note = newNotebook({ ...emptyConversation('friend'), completed: true, analysisUsage: current, failedAnalysisUsage: failed,
    messages: [{ id: 'a', sender: 'other', text: '谢谢', timestamp: null, kind: 'text' }] });
  await store.save(note, true);
  const loaded = await store.load(note.id);
  assert.deepEqual(loaded?.conversation.analysisUsage, current);
  assert.deepEqual(loaded?.conversation.failedAnalysisUsage, failed);
  const switched = organizeNotebook(note, note.title, note.contact, 'general');
  assert.equal(switched.conversation.failedAnalysisUsage, undefined);
  const back = organizeNotebook(switched, note.title, note.contact, 'friend');
  assert.deepEqual(back.conversation.failedAnalysisUsage, failed);
  assert.equal(withoutMessages(back, ['a']).conversation.failedAnalysisUsage, undefined);
  await store.close();
});

test('Jev 合批不进入 DeepSeek 诊断或逐条限制，仍只发送原来的请求', async () => {
  const payload = buildRequest({ messages: [
    { id: 'a', sender: 'self', text: '周二？', timestamp: null, kind: 'text' },
    { id: 'b', sender: 'self', text: '还是周三？', timestamp: null, kind: 'text' },
  ], relation: 'friend', revision: 1, task: 'self_message', targetIds: ['a', 'b'] });
  let calls = 0;
  const result = await evaluateWithDeepseekRepair(payload, async request => {
    calls++;
    assert.equal(request, payload);
    const answers = Object.fromEntries(Object.entries(request.questions).map(([id, q]) => {
      if (q.type === 'noul') return [id, { type: 'noul', noul: 0.5 }];
      const keys = Object.keys(q.criteria), probabilities = Object.fromEntries(keys.map((k, i) => [k, i === 0 ? 1 : 0]));
      return [id, q.type === 'choice' ? { type: 'choice', choice: keys[0], confidence: 1, probabilities }
        : { type: 'score', score: 0, confidence: 1, probabilities }];
    }));
    return { model: 'jev-1.13.0', answers, usage: { input_tokens: 20, output_tokens: 5 } };
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.usage, { input_tokens: 20, output_tokens: 5 });
});

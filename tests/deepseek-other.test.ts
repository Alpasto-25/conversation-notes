import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest } from '../shared/analysis-core';
import { deepseekEnvelope, deepseekRequest, evaluateWithDeepseekRepair, validateNativeResult } from '../shared/deepseek';
import { otherQuestionAliases, deepseekPromptVersion } from '../shared/deepseek-prompt';
import { groupRequestUsage, type RequestUsage } from '../shared/usage';
import { RELATIONS, type Relation } from '../shared/types';

const messages = Array.from({ length: 40 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  sender: i % 2 ? 'other' as const : 'self' as const, text: `第 ${i} 句：时间确认后再安排，方便时回复。`, kind: 'text' as const, timestamp: null }));
const payloadFor = (relation: Relation = 'general') => buildRequest({ messages, relation, revision: 1, task: 'other_messages', targetIds: messages.filter(m => m.sender === 'other').map(m => m.id) });
const envelope = (answers: unknown) => deepseekEnvelope({ model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answers }) } }],
  usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 60, prompt_cache_miss_tokens: 40 } });

test('紧凑对方返回可无损还原八种场景的所有候选、概率和置信度，不截断小权重', async () => {
  for (const relation of Object.keys(RELATIONS) as Relation[]) {
    const payload = payloadFor(relation), aliases = otherQuestionAliases(payload);
    const original: Record<string, unknown> = {}, compact: Record<string, unknown> = {};
    for (const [id, q] of Object.entries(payload.questions)) {
      assert.notEqual(q.type, 'noul');
      if (q.type === 'noul') continue;
      const weights = Object.fromEntries(Object.keys(q.criteria).map((key, i) => [key, i ? (i + 1) / 1000 : 80]));
      original[id] = { weights }; compact[aliases.get(id)!] = { weights };
    }
    const expected = validateNativeResult(envelope(original), payload.questions);
    const actual = await evaluateWithDeepseekRepair(payload, async () => envelope(compact));
    assert.deepEqual(actual.answers, expected.answers);
    assert.equal(actual.usage.details?.length, 1);
    assert.equal(actual.usage.details?.[0].question_count, 60);
    assert.deepEqual(validateNativeResult(envelope(original), payload.questions, payload).answers, expected.answers);
  }
});

test('紧凑输入按消息只发送一次目标 ID，批次和定向补全共用完整规则', async () => {
  const payload = payloadFor(), aliases = otherQuestionAliases(payload);
  const wire = deepseekRequest(payload, 'deepseek-flash');
  const task = JSON.parse(wire.messages[1].content.match(/<task>\n([\s\S]+?)\n<\/task>/)![1]);
  assert.equal(task.targets.length, 20);
  assert.equal(task.targets.flatMap((t: any) => Object.keys(t.questions)).length, 60);
  for (const target of payload.deepseekContext.targets) assert.equal(JSON.stringify(task).split(target).length - 1, 1);
  assert.doesNotMatch(JSON.stringify(task), /_emotions|_event|_intents/);
  const compact: Record<string, unknown> = Object.fromEntries(Object.entries(payload.questions).map(([id, q]) => [aliases.get(id)!, { weights: { [Object.keys((q as any).criteria)[0]]: 100 } }]));
  const ids = Object.keys(payload.questions), missingId = ids[ids.length - 1], invalidId = ids[ids.length - 2];
  delete compact[aliases.get(missingId)!];
  compact[aliases.get(invalidId)!] = { weights: {} };
  let calls = 0;
  const result = await evaluateWithDeepseekRepair(payload, async request => {
    if (++calls === 1) return envelope(compact);
    assert.equal(deepseekRequest(request, 'deepseek-flash').messages[0].content, wire.messages[0].content);
    assert.deepEqual(new Set(Object.keys(request.questions)), new Set([missingId, invalidId]));
    const repairAliases = otherQuestionAliases(request);
    assert.equal(repairAliases.get(missingId), aliases.get(missingId));
    assert.equal(repairAliases.get(invalidId), aliases.get(invalidId));
    return envelope(Object.fromEntries(Object.entries(request.questions).map(([id, q]) => [repairAliases.get(id)!, { weights: { [Object.keys((q as any).criteria)[0]]: 100 } }])));
  });
  assert.equal(calls, 2);
  assert.equal(Object.keys(result.answers).length, 60);
  assert.equal(result.usage.input_tokens, 200);
  assert.deepEqual(result.usage.details?.map(d => [d.question_count, d.repair_missing, d.repair_invalid]), [[60, undefined, undefined], [2, 1, 1]]);
  const next = buildRequest({ messages, relation: 'general', revision: 2, task: 'other_messages', targetIds: [messages[3].id] });
  assert.equal(deepseekRequest(next, 'deepseek-flash').messages[0].content, wire.messages[0].content);
});

test('紧凑回答不容许未知正候选、全零、错误类型或混用两套题号，缺失不补造', () => {
  const payload = payloadFor(), aliases = otherQuestionAliases(payload), id = Object.keys(payload.questions)[0], alias = aliases.get(id)!;
  const q = payload.questions[id], key = Object.keys((q as any).criteria)[0];
  for (const weights of [{}, { [key]: 0 }, { [key]: 90, not_a_candidate: 10 }, { [key]: -1 }, { [key]: 101 }, { [key]: '80' }, [80]])
    assert.throws(() => validateNativeResult(envelope({ [alias]: { weights } }), { [id]: q }, payload));
  assert.throws(() => validateNativeResult(envelope({ [alias]: { weights: { [key]: 100 } }, [id]: { weights: { [key]: 100 } } }), { [id]: q }, payload));
  assert.throws(() => validateNativeResult(envelope({}), { [id]: q }, payload));
  assert.equal(deepseekPromptVersion('self_message'), 'conversation-prefix-v1');
  assert.equal(deepseekPromptVersion('overview'), 'conversation-prefix-v1');
  assert.equal(deepseekPromptVersion('other_messages'), 'other-sparse-v2');
});

test('任务汇总按模型与完整规则分组，真实加权命中率和缺失字段保持正确', () => {
  const row: RequestUsage = { task: 'other_messages', repair: false, model: 'deepseek-flash', prompt_family: 'abc',
    started_at: '2026-10-05T04:00:00.000Z', finished_at: '2026-10-05T04:00:01.000Z', elapsed_ms: 1000,
    input_tokens: 10, output_tokens: 2, requests: 1, prompt_cache_hit_tokens: 1, prompt_cache_miss_tokens: 9 };
  const groups = groupRequestUsage([row, { ...row, repair: true, input_tokens: 90, prompt_cache_hit_tokens: 81, prompt_cache_miss_tokens: 9 },
    { ...row, model: 'deepseek-v4-pro' }, { ...row, prompt_family: 'different' }, { ...row, task: 'self_message' }]);
  assert.equal(groups.length, 4);
  assert.deepEqual(groups[0], { model: row.model, task: row.task, prompt_family: row.prompt_family, returns: 2, repairs: 1, elapsed_ms: 2000,
    input_tokens: 100, output_tokens: 4, requests: 2, prompt_cache_hit_tokens: 82, prompt_cache_miss_tokens: 18 });
  const unknown = groupRequestUsage([row, { ...row, requests: undefined, prompt_cache_hit_tokens: undefined, prompt_cache_miss_tokens: undefined }])[0];
  assert.equal(unknown.input_tokens, 20);
  assert.equal(unknown.prompt_cache_hit_tokens, undefined);
  assert.equal(unknown.prompt_cache_miss_tokens, undefined);
  assert.equal(unknown.requests, undefined);
});

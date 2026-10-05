import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWithEvaluator, buildRequest } from '../shared/analysis-core';
import { deepseekEnvelope, deepseekRequest, evaluateCausalDeepseek, type DeepseekRequest } from '../shared/deepseek';
import { otherQuestionAliases } from '../shared/deepseek-prompt';
import { AnalysisFailure, EvaluationFailure, ProviderError } from '../shared/provider-contract';
import type { AnalysisRequest } from '../shared/types';

const job: AnalysisRequest = { relation: 'friend', revision: 1, task: 'other_messages', targetIds: ['a', 'b', 'c'],
  messages: ['a', 'b', 'c'].map(id => ({ id, sender: 'other', text: 'PRIVATE_CHAT 谢谢，方便时再确认。', kind: 'text', timestamp: null })) };
const packet = (answers: unknown, model = 'deepseek-flash') => deepseekEnvelope({ model,
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answers }) } }],
  usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 60, prompt_cache_miss_tokens: 40 } });
function good(request: DeepseekRequest): Record<string, unknown> {
  const aliases = otherQuestionAliases(request);
  return Object.fromEntries(Object.entries(request.questions).map(([id, q]) => [aliases.get(id) ?? id,
    q.type === 'noul' ? .2 : { weights: { [Object.keys(q.criteria)[0]]: 100 } }]));
}
function invalid(answers: Record<string, unknown>, request: DeepseekRequest, id: string) {
  if (Object.hasOwn(request.questions, id)) answers[otherQuestionAliases(request).get(id) ?? id] = { weights: {} };
}

test('大批补全后只剩一条时自动重评该条一次，密集题号、规则缓存与已有合法答案保留', async () => {
  const payload = buildRequest(job), before = deepseekRequest(payload, '').messages[0].content;
  let calls = 0;
  const result = await analyzeWithEvaluator(job, p => evaluateCausalDeepseek(p, async request => {
    calls++;
    const answers = good(request);
    if (calls <= 2) invalid(answers, request, 'c_event');
    else {
      assert.equal(calls, 3);
      assert.equal((request as any).deepseekSingleRecovery, true);
      assert.equal(request.deepseekRepair, undefined);
      assert.deepEqual(request.deepseekContext?.targets, ['c']);
      assert.deepEqual(Object.keys(request.questions).sort(), ['c_emotions', 'c_event', 'c_intents']);
      assert.deepEqual([...otherQuestionAliases(request).values()], ['q0', 'q1', 'q2']);
      assert.equal(deepseekRequest(request, '').messages[0].content, before);
      const q = request.questions.c_emotions;
      if (q.type !== 'noul') answers[otherQuestionAliases(request).get('c_emotions')!] = { weights: { [Object.keys(q.criteria).at(-1)!]: 100 } };
    }
    return packet(answers);
  }));
  assert.equal(calls, 3);
  assert.deepEqual(result.lines?.map(line => line.id), ['a', 'b', 'c']);
  assert.deepEqual(result.lines?.[2].emotions, result.lines?.[0].emotions);
  assert.equal(result.usage.input_tokens, 300);
  assert.equal(result.usage.requests, 3);
  assert.deepEqual(result.usage.details?.map(d => [d.validation, (d as any).single_recovery === true, d.question_count]),
    [['repair_needed', false, 9], ['rejected', false, 1], ['accepted', true, 3]]);
});

test('单条恢复仍失败便停止，保留完整消息及三次真实返回用量，不再循环', async () => {
  let calls = 0;
  await assert.rejects(() => analyzeWithEvaluator(job, p => evaluateCausalDeepseek(p, async request => {
    calls++;
    const answers = good(request); invalid(answers, request, 'c_event');
    return packet(answers);
  })), error => {
    assert.ok(error instanceof AnalysisFailure);
    assert.deepEqual(error.partial?.lines?.map(line => line.id), ['a', 'b']);
    assert.equal(error.usage.requests, 3);
    assert.equal(error.usage.input_tokens, 300);
    assert.equal(error.usage.details?.at(-1)?.validation, 'rejected');
    assert.equal((error.usage.details?.at(-1) as any).single_recovery, true);
    assert.doesNotMatch(JSON.stringify(error), /PRIVATE_CHAT|"json"\s*:/);
    return true;
  });
  assert.equal(calls, 3);
});

test('多条失败、单条原请求与总览都不触发额外恢复', async () => {
  for (const input of [job, { ...job, targetIds: ['c'] }, { ...job, task: 'overview' as const, targetIds: [] }]) {
    let calls = 0;
    await assert.rejects(() => evaluateCausalDeepseek(buildRequest(input), async request => {
      calls++;
      const answers = good(request);
      if (input.task === 'overview') answers.boundary = { weights: {} };
      else { invalid(answers, request, 'b_event'); invalid(answers, request, 'c_event'); }
      return packet(answers);
    }), EvaluationFailure);
    assert.equal(calls, 2);
  }
});

test('补全返回 JSON 无法读取或模型改变时，不自动重跑', async () => {
  for (const mode of ['json', 'model']) {
    let calls = 0;
    await assert.rejects(() => evaluateCausalDeepseek(buildRequest(job), async request => {
      calls++;
      const answers = good(request); invalid(answers, request, 'c_event');
      if (calls === 2 && mode === 'json') return { ...packet({}), json: '{"answers":' };
      return packet(answers, calls === 2 && mode === 'model' ? 'deepseek-v4-pro' : 'deepseek-flash');
    }), EvaluationFailure);
    assert.equal(calls, 2);
  }
});

test('恢复遇到限流只保留已返回用量，取消阻止新增请求', async () => {
  for (const mode of ['429', 'abort']) {
    const ctrl = new AbortController();
    let calls = 0;
    await assert.rejects(() => evaluateCausalDeepseek(buildRequest(job), async request => {
      calls++;
      if (calls === 3) throw new ProviderError(429, '稍后重试');
      const answers = good(request); invalid(answers, request, 'c_event');
      if (calls === 2 && mode === 'abort') ctrl.abort();
      return packet(answers);
    }, ctrl.signal), error => {
      if (mode === '429') {
        assert.ok(error instanceof EvaluationFailure);
        assert.equal(error.status, 429);
        assert.equal(error.result.usage.requests, 2);
        assert.equal(error.result.usage.input_tokens, 200);
      } else assert.equal((error as Error).name, 'AbortError');
      return true;
    });
    assert.equal(calls, mode === '429' ? 3 : 2);
  }
});

test('单条恢复返回其他模型不混用评分，也记录新增返回用量', async () => {
  let calls = 0;
  await assert.rejects(() => evaluateCausalDeepseek(buildRequest(job), async request => {
    calls++;
    const answers = good(request);
    if (calls < 3) invalid(answers, request, 'c_event');
    return packet(answers, calls === 3 ? 'deepseek-v4-pro' : 'deepseek-flash');
  }), error => {
    assert.ok(error instanceof EvaluationFailure);
    assert.equal(error.result.model, 'deepseek-flash');
    assert.equal(error.result.usage.requests, 3);
    assert.equal(Object.hasOwn(error.result.answers, 'c_event'), false);
    assert.equal(error.result.usage.details?.at(-1)?.validation_reason, 'model');
    return true;
  });
  assert.equal(calls, 3);
});

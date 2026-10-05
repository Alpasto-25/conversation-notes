import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { analyzeWithEvaluator, buildRequest } from '../shared/analysis-core';
import { AnalysisFailure, EvaluationFailure, ProviderError, analysisFailureDetails } from '../shared/provider-contract';
import { DEEPSEEK_FORMAT, deepseekEnvelope, evaluateCausalDeepseek, evaluateWithDeepseekRepair, validateNativeResult, type DeepseekRequest } from '../shared/deepseek';
import { otherQuestionAliases } from '../shared/deepseek-prompt';
import { RUBRIC, requestContextKey, type AnalysisRequest } from '../shared/types';

const job: AnalysisRequest = { relation: 'friend', revision: 4, task: 'other_messages', targetIds: ['a', 'b', 'c'],
  messages: ['a', 'b', 'c'].map(id => ({ id, sender: 'other', text: 'PRIVATE_CHAT_SENTINEL 方便的时候再确定时间。', kind: 'text', timestamp: null })) };
function goodAnswers(request: DeepseekRequest) {
  const aliases = otherQuestionAliases(request);
  return Object.fromEntries(Object.entries(request.questions).map(([id, q]) => [aliases.get(id) ?? id,
    q.type === 'noul' ? .5 : { weights: { [Object.keys(q.criteria)[0]]: 100 } }]));
}
function envelope(answers: unknown, model = 'deepseek-flash') {
  return deepseekEnvelope({ model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answers }), reasoning_content: 'PRIVATE_REASONING' } }],
    usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 60, prompt_cache_miss_tokens: 40 } });
}

test('v4 的带名称权重数组与候选键映射保留相同比例，位置数组及歧义格式仍拒绝', async () => {
  const questions = { mood: { type: 'choice' as const, instructions: 'Mood', criteria: { happy: null, sad: null } } };
  const raw = { format: DEEPSEEK_FORMAT, model: 'deepseek-flash', answers: { mood: { weights: { happy: 80, sad: 28 } } }, usage: { input_tokens: 1, output_tokens: 1 } };
  const expected = validateNativeResult(raw, questions);
  for (const mood of [{ weights: [{ candidate: 'happy', weight: 80 }, { candidate: 'sad', weight: 28 }] }, { happy: 80, sad: 28 }]) {
    let calls = 0;
    const result = await evaluateWithDeepseekRepair({ questions, state: 'text' }, async () => { calls++; return { ...raw, answers: { mood } }; });
    assert.deepEqual(result.answers, expected.answers);
    assert.equal(calls, 1);
    assert.equal(result.usage.details?.[0].validation, 'accepted');
  }
  for (const mood of [[.8, .2], { happy: 80, unknown: 20 }, { happy: '80' }, { happy: 0, sad: 0 }, { happy: 101 },
    { weights: [80, 20] }, { weights: [{ candidate: 'happy', weight: 80 }, { candidate: 'happy', weight: 20 }] },
    { weights: [{ candidate: 'happy', weight: 80, explanation: 'extra' }] }, { weights: { happy: 80 }, probabilities: { happy: 1 } }])
    assert.throws(() => validateNativeResult({ ...raw, answers: { mood } }, questions));
});

test('一个题号同时有原始 ID 与别名时，仅修该题且不丢弃其他合法答案', async () => {
  const payload = buildRequest(job), aliases = otherQuestionAliases(payload), id = Object.keys(payload.questions)[0];
  const answers = goodAnswers(payload); answers[id] = answers[aliases.get(id)!];
  let calls = 0;
  const result = await evaluateWithDeepseekRepair(payload, async request => {
    calls++;
    if (calls === 1) return envelope(answers);
    assert.deepEqual(Object.keys(request.questions), [id]);
    return envelope(goodAnswers(request));
  });
  assert.equal(calls, 2);
  assert.equal(Object.keys(result.answers).length, 9);
  assert.deepEqual(result.usage.details?.map(d => [d.validation, d.missing_answers, d.invalid_answers]), [['repair_needed', 0, 1], ['accepted', 0, 0]]);
});

test('补全仍缺题时保留两次返回用量与两轮中完整通过的目标，未完整的目标不造结果', async () => {
  let calls = 0;
  await assert.rejects(() => analyzeWithEvaluator(job, payload => evaluateWithDeepseekRepair(payload, async request => {
    calls++;
    const answers = goodAnswers(request), aliases = otherQuestionAliases(request);
    if (!request.deepseekRepair) {
      answers[aliases.get('b_event')!] = { weights: {} };
      for (const suffix of ['emotions', 'intents', 'event']) delete answers[aliases.get(`c_${suffix}`)!];
    } else {
      assert.deepEqual(new Set(Object.keys(request.questions)), new Set(['b_event', 'c_emotions', 'c_intents', 'c_event']));
      delete answers[aliases.get('c_emotions')!];
      answers[aliases.get('c_intents')!] = { weights: {} };
    }
    return envelope(answers);
  })), error => {
    assert.ok(error instanceof AnalysisFailure);
    assert.equal(error.status, 502);
    assert.deepEqual(error.partial?.lines?.map(line => line.id), ['a', 'b']);
    assert.equal(error.partial?.revision, job.revision);
    assert.equal(error.partial?.rubricVersion, RUBRIC);
    assert.equal(error.partial?.contextHash, createHash('sha256').update(requestContextKey(job)).digest('hex'));
    assert.equal(error.usage.input_tokens, 200);
    assert.equal(error.usage.output_tokens, 40);
    assert.equal(error.usage.requests, 2);
    assert.equal(error.usage.prompt_cache_hit_tokens, 120);
    assert.equal(error.usage.prompt_cache_miss_tokens, 80);
    assert.deepEqual(error.usage.details?.map(d => [d.validation, d.missing_answers, d.invalid_answers]), [['repair_needed', 3, 1], ['rejected', 1, 1]]);
    assert.deepEqual(error.partial?.usage, error.usage);
    const safe = JSON.stringify(analysisFailureDetails(error));
    assert.doesNotMatch(safe, /PRIVATE_CHAT|PRIVATE_REASONING|"json"\s*:|apiKey|Authorization|Bearer/);
    return true;
  });
  assert.equal(calls, 2);
});

test('补全连接失败时保留原先已返回的用量和完整目标，不猜测失败连接的 tokens', async () => {
  let calls = 0;
  await assert.rejects(() => analyzeWithEvaluator(job, payload => evaluateWithDeepseekRepair(payload, async request => {
    calls++;
    if (request.deepseekRepair) throw new ProviderError(429, '请求受限，请稍后继续。');
    const answers = goodAnswers(request); delete answers[otherQuestionAliases(request).get('c_event')!];
    return envelope(answers);
  })), error => {
    assert.ok(error instanceof AnalysisFailure);
    assert.equal(error.status, 429);
    assert.equal(error.usage.requests, 1);
    assert.equal(error.usage.input_tokens, 100);
    assert.deepEqual(error.partial?.lines?.map(line => line.id), ['a', 'b']);
    assert.equal(error.usage.details?.length, 1);
    return true;
  });
  assert.equal(calls, 2);
});

test('两轮 JSON 无法读取时记录两轮真实用量及安全原因，不生成任何评分', async () => {
  let calls = 0;
  await assert.rejects(() => analyzeWithEvaluator(job, payload => evaluateWithDeepseekRepair(payload, async () => {
    calls++;
    return { ...envelope({}), json: '{"answers":' };
  })), error => {
    assert.ok(error instanceof AnalysisFailure);
    assert.equal(error.partial, undefined);
    assert.equal(error.usage.requests, 2);
    assert.deepEqual(error.usage.details?.map(d => [d.validation, d.validation_reason, d.invalid_answers]), [['repair_needed', 'json', 9], ['rejected', 'json', 9]]);
    return true;
  });
  assert.equal(calls, 2);
});

test('补全返回不同模型时只保留原模型的完整目标，并按实际返回模型记录两次费用', async () => {
  await assert.rejects(() => analyzeWithEvaluator(job, payload => evaluateWithDeepseekRepair(payload, async request => {
    const answers = goodAnswers(request);
    if (!request.deepseekRepair) delete answers[otherQuestionAliases(request).get('c_event')!];
    return envelope(answers, request.deepseekRepair ? 'deepseek-v4-pro' : 'deepseek-flash');
  })), error => {
    assert.ok(error instanceof AnalysisFailure);
    assert.deepEqual(error.partial?.lines?.map(line => line.id), ['a', 'b']);
    assert.equal(error.partial?.model, 'deepseek-flash');
    assert.equal(error.usage.input_tokens, 200);
    assert.deepEqual(error.usage.details?.map(d => d.model), ['deepseek-flash', 'deepseek-v4-pro']);
    assert.equal(error.usage.details?.at(-1)?.validation_reason, 'model');
    return true;
  });
});

test('因果拆分的后一条表达补全失败时保留前一条结果与所有已返回用量', async () => {
  const selfJob: AnalysisRequest = { ...job, task: 'self_message', targetIds: ['a', 'b'], messages: job.messages.map(m => ({ ...m, sender: 'self' })) };
  let calls = 0;
  await assert.rejects(() => analyzeWithEvaluator(selfJob, payload => evaluateCausalDeepseek(payload, async request => {
    calls++;
    return envelope(request.deepseekContext?.targets[0] === 'a' ? goodAnswers(request) : {});
  })), error => {
    assert.ok(error instanceof AnalysisFailure);
    assert.deepEqual(error.partial?.lines?.map(line => line.id), ['a']);
    assert.equal(error.usage.requests, 3);
    assert.equal(error.usage.input_tokens, 300);
    assert.equal(error.usage.details?.length, 3);
    return true;
  });
  assert.equal(calls, 3);
});

test('非法用量不进入恢复统计或发起额外补全，普通错误没有可导出的原始响应', async () => {
  let calls = 0;
  await assert.rejects(() => evaluateWithDeepseekRepair(buildRequest(job), async () => {
    calls++;
    return { ...envelope({}), usage: { input_tokens: -1, output_tokens: 10 } };
  }), error => !(error instanceof EvaluationFailure));
  assert.equal(calls, 1);
  assert.deepEqual(analysisFailureDetails(new Error('PRIVATE_RESPONSE')), {});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest } from '../shared/analysis-core';
import { EvaluationFailure, validateReturnedUsage } from '../shared/provider-contract';
import { deepseekEnvelope, deepseekRequest, evaluateWithDeepseekRepair, type DeepseekRequest } from '../shared/deepseek';
import { otherQuestionAliases } from '../shared/deepseek-prompt';
import { answerQuestionKind, type AnswerIssueCode } from '../shared/usage';
import { RELATIONS, type Relation } from '../shared/types';
const messages = ['a', 'b'].map(id => ({ id, sender: 'other' as const, text: 'PRIVATE_CHAT_SENTINEL 谢谢，之后再确认。', timestamp: null, kind: 'text' as const }));
const payloadFor = (relation: Relation = 'general') => buildRequest({ relation, revision: 1, task: 'other_messages', messages, targetIds: ['a', 'b'] });
const packet = (request: DeepseekRequest) => {
  const wire = deepseekRequest(request, 'deepseek-flash');
  return { system: wire.messages[0].content, rules: JSON.parse(wire.messages[0].content.match(/<rules>\n([\s\S]+?)\n<\/rules>/)![1]),
    task: JSON.parse(wire.messages[1].content.match(/<task>\n([\s\S]+?)\n<\/task>/)![1]) };
};
const envelope = (answers: unknown) => deepseekEnvelope({ model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answers }) } }],
  usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 60, prompt_cache_miss_tokens: 40 } });
function good(request: DeepseekRequest): Record<string, unknown> {
  const aliases = otherQuestionAliases(request);
  return Object.fromEntries(Object.entries(request.questions).map(([id, q]) => [aliases.get(id) ?? id, q.type === 'noul' ? .2 : { weights: { [Object.keys(q.criteria)[0]]: 100 } }]));
}

test('三类短题号明确绑定用途和各自的候选规则，八种场景不删除原有候选或指令', () => {
  for (const relation of Object.keys(RELATIONS) as Relation[]) {
    const payload = payloadFor(relation), wire = packet(payload), aliases = otherQuestionAliases(payload);
    assert.equal(Object.keys(wire.rules.templates).length, 3);
    for (const [id, q] of Object.entries(payload.questions)) {
      const target = wire.task.targets.find((entry: any) => entry.target === id.slice(0, id.lastIndexOf('_')));
      const template = wire.rules.templates[target.questions[aliases.get(id)!]];
      assert.equal(template.answer_kind, answerQuestionKind(id, q.type));
      assert.deepEqual(template.criteria, (q as any).criteria);
      assert.deepEqual(template.answer_keys, Object.keys((q as any).criteria).sort());
      assert.match(template.answer_rule, /empty or all-zero/);
      if (template.answer_kind === 'event') { assert.ok(template.answer_keys.includes('none')); assert.match(template.answer_rule, /positive weight/); }
      if (template.answer_kind === 'intents') assert.match(template.answer_rule, /Never borrow none/);
    }
    assert.equal('repair_questions' in wire.task, false);
    assert.doesNotMatch(wire.system, /PRIVATE_CHAT_SENTINEL/);
  }
});

test('一次补全逐题提供原别名、用途、具体失败类别与精确允许选项，仍复用同一 system', async () => {
  const payload = payloadFor(), aliases = otherQuestionAliases(payload), before = packet(payload);
  let calls = 0;
  const result = await evaluateWithDeepseekRepair(payload, async request => {
    calls++;
    const answers = good(request);
    if (!request.deepseekRepair) {
      answers[aliases.get('a_event')!] = { weights: {} };
      answers[aliases.get('b_intents')!] = { weights: { PRIVATE_UNKNOWN_CANDIDATE: 100 } };
    } else {
      const wire = packet(request);
      assert.equal(wire.system, before.system);
      assert.equal(wire.task.repair_questions.length, 2);
      for (const entry of wire.task.repair_questions) {
        const id = [...aliases].find(([, alias]) => alias === entry.id)![0];
        assert.equal(entry.kind, answerQuestionKind(id, payload.questions[id].type));
        assert.deepEqual(entry.answer_keys, Object.keys((payload.questions[id] as any).criteria).sort());
        assert.equal(entry.issue, id === 'a_event' ? 'no_positive_weight' : 'unknown_candidate');
        assert.equal(entry.answer_format, 'positive_candidate_weights');
        assert.equal(entry.min_positive_weights, 1);
      }
      assert.doesNotMatch(JSON.stringify(wire.task.repair_questions), /PRIVATE_UNKNOWN_CANDIDATE/);
    }
    return envelope(answers);
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.usage.details?.[0].answer_issues, [{ kind: 'event', code: 'no_positive_weight', count: 1 }, { kind: 'intents', code: 'unknown_candidate', count: 1 }]);
  assert.equal(result.usage.details?.at(-1)?.validation, 'accepted');
});

test('诊断区分全零、混选项、重复候选、非法权重与题号冲突，仍失败时不储存原始值', async () => {
  const cases: [string, unknown, AnswerIssueCode][] = [
    ['a_event', { weights: {} }, 'no_positive_weight'],
    ['a_intents', { weights: { PRIVATE_UNKNOWN_CANDIDATE: 100 } }, 'unknown_candidate'],
    ['a_emotions', { weights: [{ candidate: 'happy', weight: 50 }, { candidate: 'happy', weight: 50 }] }, 'duplicate_candidate'],
    ['b_event', { weights: { none: 'PRIVATE_WEIGHT_VALUE' } }, 'invalid_weight'],
    ['b_intents', [1, 0], 'shape'],
  ];
  const payload = payloadFor(), aliases = otherQuestionAliases(payload);
  let calls = 0;
  await assert.rejects(() => evaluateWithDeepseekRepair(payload, async request => {
    calls++;
    const answers = good(request);
    for (const [id, bad] of cases) if (Object.hasOwn(request.questions, id)) answers[aliases.get(id)!] = bad;
    // A conflict must be classified for this question without hiding the other categories.
    if (Object.hasOwn(request.questions, 'b_emotions')) answers.b_emotions = answers[aliases.get('b_emotions')!];
    return envelope(answers);
  }), error => {
    assert.ok(error instanceof EvaluationFailure);
    const issues = error.result.usage.details?.at(-1)?.answer_issues;
    assert.equal(issues?.reduce((n, issue) => n + issue.count, 0), 6);
    for (const [id, , code] of cases) assert.ok(issues?.some(issue => issue.kind === answerQuestionKind(id, payload.questions[id].type) && issue.code === code && issue.count === 1));
    assert.ok(issues?.some(issue => issue.code === 'conflicting_ids'));
    assert.doesNotMatch(JSON.stringify(error.result), /PRIVATE_CHAT_SENTINEL|PRIVATE_UNKNOWN_CANDIDATE|PRIVATE_WEIGHT_VALUE|"json"\s*:/);
    assert.equal(Object.keys(error.result.answers).length, 0);
    return true;
  });
  assert.equal(calls, 2);
});

test('总览真假题补全明确要求单个零到一数字，正常总览和自己的表达不改协议', async () => {
  const payload = buildRequest({ relation: 'general', revision: 1, messages, task: 'overview', targetIds: [] });
  let calls = 0;
  const result = await evaluateWithDeepseekRepair(payload, async request => {
    calls++;
    const answers = good(request);
    if (!request.deepseekRepair) answers.boundary = { weights: { true: 80 } };
    else {
      const wire = packet(request), entry = wire.task.repair_questions[0];
      assert.equal(wire.rules.protocol, 'conversation-prefix-v1');
      assert.equal(entry.id, 'boundary');
      assert.equal(entry.kind, 'noul');
      assert.equal(entry.issue, 'invalid_noul');
      assert.equal(entry.answer_format, 'number_0_to_1');
      assert.equal('answer_keys' in entry, false);
    }
    return envelope(answers);
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.usage.details?.[0].answer_issues, [{ kind: 'noul', code: 'invalid_noul', count: 1 }]);
  assert.equal(result.usage.input_tokens, 200);
});

test('保存的诊断只允许固定用途和原因枚举，拒绝把未知字符串写入诊断', () => {
  const detail = { task: 'other_messages', repair: false, model: 'deepseek-flash', prompt_family: 'family', started_at: '2026-10-05T01:00:00.000Z', finished_at: '2026-10-05T01:00:01.000Z', elapsed_ms: 1000,
    input_tokens: 100, output_tokens: 20, answer_issues: [{ kind: 'event', code: 'no_positive_weight', count: 4, raw: 'PRIVATE_RAW' }] };
  const usage = { input_tokens: 100, output_tokens: 20, details: [detail] };
  assert.doesNotMatch(JSON.stringify(validateReturnedUsage(usage)), /PRIVATE_RAW/);
  assert.throws(() => validateReturnedUsage({ ...usage, details: [{ ...detail, answer_issues: [{ kind: 'PRIVATE_KIND', code: 'PRIVATE_REASON', count: 4 }] }] }));
});

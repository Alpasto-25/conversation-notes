import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest } from '../shared/analysis-core';
import { incrementalJobs, overviewJob } from '../shared/incremental';
import { canonicalJson, causalDeepseekPayloads, otherQuestionAliases } from '../shared/deepseek-prompt';
import { deepseekAnswerFormat, deepseekEnvelope, deepseekRequest, evaluateCausalDeepseek } from '../shared/deepseek';
import { runAnalysisQueue } from '../shared/analysis-queue';
import { addUsage } from '../shared/usage';
import { validateResult } from '../shared/provider-contract';
import { createAnalysisCache } from '../src/analysis-cache';
import { newNotebook, withoutMessages } from '../src/notebooks';
import { RELATIONS, type AnalysisRequest, type Message, type Relation } from '../shared/types';

const messages = (n: number): Message[] => Array.from({ length: n }, (_, i) => ({ id: `stable-${i}`, sender: i % 2 ? 'other' : 'self',
  text: `第${i}句：确认一下具体时间，尊重对方的选择。`, timestamp: null, kind: 'text' }));
function packet(input: ReturnType<typeof deepseekRequest>) {
  const task = JSON.parse(input.messages[1].content.match(/<task>\n([\s\S]+?)\n<\/task>/)![1]);
  if (task.targets) task.questions = task.targets.flatMap((entry: any) => Object.entries(entry.questions).map(([id, template]) => ({ id, template, target: entry.target })));
  return { rules: JSON.parse(input.messages[0].content.match(/<rules>\n([\s\S]+?)\n<\/rules>/)![1]),
    scene: JSON.parse(input.messages[1].content.match(/<scene>\n([\s\S]+?)\n<\/scene>/)![1]),
    task };
}
test('字典化后仍保留八种场景的完整约束、评分档位、候选、证据和每个题号', () => {
  const all = messages(8);
  for (const relation of Object.keys(RELATIONS) as Relation[]) for (const task of ['overview', 'other_messages', 'self_message'] as const) {
    const job: AnalysisRequest = { messages: all, relation, revision: 7, task, targetIds: task === 'overview' ? [] : [task === 'self_message' ? all[2].id : all[3].id],
      ...(task === 'overview' ? { memory: [{ id: all[0].id, kind: 'boundary', status: 'active' }] } : {}) };
    const payload = buildRequest(job), wire = packet(deepseekRequest(payload, 'deepseek-flash'));
    assert.equal(wire.rules.common_instructions, payload.deepseekContext.commonInstructions);
    const aliases = otherQuestionAliases(payload), originals = new Map([...aliases].map(([id, alias]) => [alias, id]));
    assert.deepEqual(wire.task.questions.map((q: any) => q.id).sort(), Object.keys(payload.questions).map(id => aliases.get(id) ?? id).sort());
    for (const binding of wire.task.questions) {
      const template = wire.rules.templates[binding.template], original = payload.questions[originals.get(binding.id) ?? binding.id];
      const originalText = typeof original.instructions === 'string' ? original.instructions : (original.instructions as any).question;
      const expanded = wire.rules.common_instructions + template.instructions.replaceAll('{{target}}', String(all.findIndex(m => m.id === binding.target)))
        .replaceAll('{{eventCandidate}}', binding.eventCandidate ?? '');
      assert.equal(expanded, originalText);
      assert.equal(template.type, original.type);
      if (original.type !== 'noul') {
        const criteria = binding.candidates ? { ...template.criteria, ...Object.fromEntries(Object.keys(binding.candidates).map(id => [id, null])) } : template.criteria;
        assert.deepEqual(criteria, original.criteria);
        for (const [index, id] of Object.entries(binding.candidates ?? {})) assert.equal(all[Number(index)].id, id);
      }
    }
    if (task === 'self_message') assert.equal(wire.scene.messages.at(-1).id, all[2].id);
    assert.doesNotMatch(JSON.stringify(wire.rules), /第\d+句/);
  }
});
test('不同批次复用同一规则与完整场景，目标和 UUID 只出现在任务尾部', () => {
  const all = messages(100), jobs = incrementalJobs(all, 'friend', 1, {}, {}, false, true).filter(j => j.task === 'other_messages');
  assert.equal(jobs.length, 3);
  const requests = jobs.map(job => deepseekRequest(buildRequest(job), 'deepseek-flash'));
  for (const request of requests.slice(1)) {
    assert.equal(request.messages[0].content, requests[0].messages[0].content);
    assert.deepEqual(packet(request).scene, packet(requests[0]).scene);
  }
  assert.equal(Object.keys(packet(requests[0]).rules.templates).length, 3);
  assert.doesNotMatch(requests[0].messages[0].content, /stable-|request_id|worker_id|user_id/);
});
test('恢复后字段和题目顺序不同仍生成相同字节，消息顺序和原话保持原样', () => {
  const payload = buildRequest(overviewJob(messages(5), 'general', 0, {}));
  const reverse = (value: any): any => Array.isArray(value) ? value.map(reverse) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverse(v)])) : value;
  const before = JSON.stringify(payload);
  assert.deepEqual(deepseekRequest(reverse(payload), 'deepseek-flash'), deepseekRequest(payload, 'deepseek-flash'));
  assert.equal(JSON.stringify(payload), before);
  assert.equal(canonicalJson({ b: 1, a: ['é', 'e\u0301'] }), '{"a":["é","é"],"b":1}');
});
test('多条表达请求在进入 completions 之前隔离，只包含各自当时可见的原话', async () => {
  const all = messages(5); all[3].text = 'FUTURE_REPLY_MUST_NOT_LEAK';
  const payload = buildRequest({ messages: all, relation: 'general', revision: 0, task: 'self_message', targetIds: [all[0].id, all[4].id] });
  assert.throws(() => deepseekRequest(payload, 'deepseek-flash'), /逐条/);
  const split = causalDeepseekPayloads(payload);
  assert.equal(split.length, 2);
  assert.doesNotMatch(JSON.stringify(deepseekRequest(split[0], 'deepseek-flash')), /FUTURE_REPLY/);
  assert.match(JSON.stringify(deepseekRequest(split[1], 'deepseek-flash')), /FUTURE_REPLY/);
  let count = 0;
  const result = await evaluateCausalDeepseek(payload, async request => {
    count++;
    const content = JSON.stringify(deepseekAnswerFormat(request.questions).answer_example);
    return deepseekEnvelope({ model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 4, prompt_cache_hit_tokens: 8, prompt_cache_miss_tokens: 2 } });
  });
  assert.equal(count, 2);
  assert.equal(Object.keys(result.answers).length, 6);
  const { details, ...totals } = result.usage;
  assert.deepEqual(totals, { input_tokens: 20, output_tokens: 8, requests: 2, prompt_cache_hit_tokens: 16, prompt_cache_miss_tokens: 4 });
  assert.equal(details?.length, 2);
  assert.equal(details?.reduce((sum, d) => sum + d.input_tokens, 0), totals.input_tokens);
});
test('DeepSeek 拆批覆盖全部目标，自评逐条截断，长文本和上下文预算仍有效', () => {
  for (const all of [messages(100), messages(40).map(m => ({ ...m, text: '长'.repeat(2000) })), messages(100).map(m => ({ ...m, sender: 'other' as const }))]) {
    const jobs = incrementalJobs(all, 'general', 0, {}, {}, false, true);
    assert.equal(new Set(jobs.flatMap(j => j.targetIds)).size, all.length);
    for (const job of jobs) {
      assert.ok(job.targetIds.length <= 20);
      const payload = buildRequest(job);
      deepseekRequest(payload, 'deepseek-flash');
      if (job.task === 'self_message') {
        assert.equal(job.targetIds.length, 1);
        const target = all.findIndex(m => m.id === job.targetIds[0]);
        assert.ok(job.messages.every(m => all.findIndex(source => source.id === m.id) <= target));
      }
    }
  }
});
test('串行种子都是真实任务，完成各族两个种子后最多两个并发，停止不继续派发', async () => {
  const jobs = Array.from({ length: 10 }, (_, id) => ({ id, family: id % 2 ? 'self' : 'other' }));
  const completed: number[] = []; let running = 0, peak = 0;
  await runAnalysisQueue(jobs, async job => {
    running++; peak = Math.max(peak, running);
    if (job.id >= 4) assert.deepEqual(completed.slice(0, 4), [0, 1, 2, 3]);
    await new Promise(resolve => setTimeout(resolve, 2)); completed.push(job.id); running--;
  }, () => true, j => j.family);
  assert.equal(peak, 2); assert.equal(new Set(completed).size, 10);
  let active = true; const stopped: number[] = [];
  await runAnalysisQueue(jobs, async j => { stopped.push(j.id); active = false; }, () => active, j => j.family);
  assert.deepEqual(stopped, [0]);
  const seeded: number[] = [];
  await runAnalysisQueue(jobs, async job => {
    if (job.id >= 6) assert.deepEqual(seeded.slice(0, 6), [0, 1, 2, 3, 4, 5]);
    seeded.push(job.id); return job.id >= 2;
  }, () => true, j => j.family);
  assert.equal(seeded.length, 10);
});
test('本机缓存可持久化恢复，模型、场景、目标和任何有效上下文变化都失效', async () => {
  const all = messages(6), job = incrementalJobs(all, 'general', 0, {}, {}, false, true).find(j => j.task === 'self_message' && j.targetIds[0] === all[2].id)!;
  const line = { id: all[2].id, score: { value: 60, confidence: .8, status: 'clear' as const, probabilities: { '3': 1 } } };
  const cache = createAnalysisCache(); await cache.put(job, [line], 'deepseek', 'deepseek-flash');
  const restored = createAnalysisCache(); restored.restore(JSON.parse(JSON.stringify(cache.snapshot())));
  assert.deepEqual(await restored.get({ ...job, revision: 99 }, 'deepseek', 'deepseek-flash'), { [line.id]: line });
  assert.deepEqual(await restored.get(job, 'deepseek', 'deepseek-v4-pro'), {});
  assert.deepEqual(await restored.get({ ...job, relation: 'friend' }, 'deepseek', 'deepseek-flash'), {});
  assert.deepEqual(await restored.get({ ...job, messages: job.messages.map((m, i) => i === 0 ? { ...m, text: '修改过的历史' } : m) }, 'deepseek', 'deepseek-flash'), {});
  // Editing a later line does not change this target's effective context.
  all[5].text = '只有将来的消息修改了';
  const early = incrementalJobs(all, 'general', 1, {}, {}, false, true).find(j => j.targetIds[0] === all[2].id)!;
  assert.deepEqual(await restored.get(early, 'deepseek', 'deepseek-flash'), { [line.id]: line });
  assert.doesNotMatch(JSON.stringify(cache.snapshot()), /第0句|修改过的历史/);
  const note = newNotebook(); note.conversation.messages = all; note.conversation.targetCache = cache.snapshot();
  const edited = withoutMessages(note, [all[5].id]);
  assert.deepEqual(edited.conversation.lines, {});
  restored.restore(edited.conversation.targetCache);
  assert.deepEqual(await restored.get(early, 'deepseek', 'deepseek-flash'), { [line.id]: line });
  const pending = cache.put(job, [line], 'deepseek', 'deepseek-flash'); cache.restore(); await pending;
  assert.deepEqual(cache.snapshot(), []);
});
test('缓存用量缺失保持未知，非法或不一致统计不能当成成功结果', () => {
  assert.deepEqual(addUsage({ input_tokens: 8, output_tokens: 1, prompt_cache_hit_tokens: 4 }, { input_tokens: 2, output_tokens: 1 }), { input_tokens: 10, output_tokens: 2 });
  for (const usage of [{ input_tokens: 10, output_tokens: 1, prompt_cache_hit_tokens: 11 },
    { input_tokens: 10, output_tokens: 1, prompt_cache_hit_tokens: 4, prompt_cache_miss_tokens: 5 },
    { input_tokens: 10, output_tokens: 1, prompt_cache_miss_tokens: -1 }]) assert.throws(() => validateResult({ model: 'deepseek-flash', answers: {}, usage }, {}));
});

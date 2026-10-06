import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { analysisMode, readSemanticPreference, SEMANTIC_PREFERENCE, readSemanticModePreference, SEMANTIC_MODE_PREFERENCE } from '../shared/analysis-mode';
import { analyzeJevSemantics, buildJevSemanticPayload, JEV_SEMANTIC_BATCH } from '../shared/semantic-judgment';
import { analyzeSemantics, buildSemanticPayload, hasCurrentJevJudgment, hasCurrentSemantics, semanticContextHash, semanticJobs, SemanticFailure } from '../shared/semantics';
import { parseChat, toMessages } from '../shared/parser';
import { deepseekEnvelope } from '../shared/deepseek';
import { validateReturnedUsage } from '../shared/provider-contract';
import { configuredProfiles, getConfiguredProviderConfig } from '../server/provider-config';
import { SemanticSwitch } from '../src/SemanticSwitch';
import { ChatMessage } from '../src/ChatMessage';
import type { AnalysisRequest, LineResult } from '../shared/types';

const job: AnalysisRequest = { revision: 1, relation: 'couple', task: 'other_messages', targetIds: ['o'], messages: [
  { id: 's', text: '那早点休息？晚安。', sender: 'self', kind: 'text', timestamp: null },
  { id: 'o', text: '你真的就晚安了？', sender: 'other', kind: 'text', timestamp: null },
] };
const config = { configured: true, provider: 'deepseek', model: 'deepseek-flash', profiles: [
  { configured: true, provider: 'typesafe', model: 'jev-1.13.0' }, { configured: true, provider: 'deepseek', model: 'deepseek-flash' },
] };
const judge = { provider: 'typesafe', model: 'jev-1.13.0' };
function jevPacket(payload: ReturnType<typeof buildJevSemanticPayload>, status = 'supported', confidence = .74) {
  return { model: judge.model, answers: Object.fromEntries(Object.entries(payload.questions).map(([id, q]) => {
    if (q.type === 'noul') return [id, { type: 'noul', noul: id.endsWith('withdrawal') ? .71 : id.endsWith('protest') ? .63 : id.endsWith('context_dependency') ? .91 : .01 }];
    assert.equal(q.type, 'choice');
    const keys = Object.keys(q.criteria), selected = id.endsWith('_subtext_status') ? status : id.endsWith('_semantic_evidence') ? '0' : id.endsWith('_emotions') ? 'disappointed' : 'acknowledge';
    assert.ok(keys.includes(selected));
    return [id, { type: 'choice', choice: selected, confidence, probabilities: Object.fromEntries(keys.map(k => [k, k === selected ? 1 : 0])) }];
  })), usage: { input_tokens: 80, output_tokens: 15 } };
}
const dsPacket = (analyses: unknown) => deepseekEnvelope({ model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ analyses }) } }], usage: { prompt_tokens: 30, completion_tokens: 10 } });
async function judged() { return analyzeJevSemantics(job, 'typesafe', async payload => jevPacket(payload)); }

for (const fixture of ['semantic-leaving', 'semantic-classmate']) test(`${fixture}：Jev 小批次覆盖全部目标并保留完整30条原文及缓存标识`, async () => {
  const messages = toMessages(parseChat(await readFile(new URL(`./fixtures/${fixture}.txt`, import.meta.url), 'utf8')).messages, '我');
  assert.equal(messages.length, 30);
  const jobs = semanticJobs(messages, 'couple', 1, {}, JEV_SEMANTIC_BATCH);
  assert.equal(jobs.length, 5);
  assert.deepEqual(new Set(jobs.flatMap(value => value.targetIds)), new Set(messages.filter(m => m.sender === 'other').map(m => m.id)));
  const original = semanticJobs(messages, 'couple', 1, {});
  assert.equal(original[0].targetIds.length, 12); // DeepSeek-only batching stays efficient.
  assert.throws(() => buildJevSemanticPayload(original[0], 'typesafe'), /每批最多3条/);
  const hash = await semanticContextHash(original[0]);
  for (const value of jobs) {
    assert.deepEqual(value.messages, messages);
    assert.equal(await semanticContextHash(value), hash);
    assert.equal(Object.keys(buildJevSemanticPayload(value, 'typesafe').questions).length, 51);
    for (const id of value.targetIds) {
      const single = { ...value, targetIds: [id] };
      assert.deepEqual(single.messages, messages);
      assert.equal(await semanticContextHash(single), hash);
    }
  }
});

test('开关默认关闭并可恢复，说明同时覆盖双平台和仅 DeepSeek', () => {
  assert.equal(readSemanticPreference(), false);
  assert.equal(readSemanticPreference({ getItem: key => key === SEMANTIC_PREFERENCE ? 'on' : null }), true);
  assert.equal(readSemanticPreference({ getItem: () => { throw new Error('unavailable'); } }), false);
  const html = renderToStaticMarkup(createElement(SemanticSwitch, { enabled: false, change: () => {} }));
  assert.match(html, /role="switch"/); assert.doesNotMatch(html, /checked=""/);
  assert.match(html, /Jev 判断、DeepSeek 写解释/); assert.match(html, /表达方式与潜台词需要 DeepSeek/);
  assert.ok(html.indexOf('表达方式与潜台词需要 DeepSeek') < html.indexOf('role="switch"'));
});
test('双平台开启优先 Jev、关闭保留原模型，切换不改配置', () => {
  const before = structuredClone(config);
  assert.deepEqual(analysisMode(config, true).judge, { ...judge, configured: true });
  assert.equal(analysisMode(config, true).primary.provider, 'typesafe');
  assert.equal(analysisMode(config, false).primary.provider, 'deepseek');
  assert.equal(analysisMode(config, false).judge, undefined);
  assert.deepEqual(config, before);
  const onlyDS = analysisMode({ ...config, profiles: [config.profiles[1]] }, true);
  assert.equal(onlyDS.judge, undefined); assert.equal(onlyDS.primary.provider, 'deepseek');
  const onlyJev = analysisMode({ configured: true, ...judge }, true);
  assert.equal(onlyJev.judge, undefined); assert.equal(onlyJev.deepseek.configured, false);
});
test('两平台配置后可明确选仅 DeepSeek，基础和补充均不使用 Jev', () => {
  const before = structuredClone(config);
  const mode = analysisMode(config, true, 'deepseek');
  assert.equal(mode.primary.provider, 'deepseek'); assert.equal(mode.primary.model, 'deepseek-flash');
  assert.equal(mode.selectedMode, 'deepseek'); assert.equal(mode.judge, undefined); assert.equal(mode.error, '');
  assert.deepEqual(config, before);
});
test('显式双模型沿用已保存 Jev，关闭开关恢复基础平台且保留组合偏好', () => {
  const mode = analysisMode(config, true, 'jev-deepseek');
  assert.deepEqual(mode.judge, { ...judge, configured: true }); assert.equal(mode.primary.provider, 'typesafe');
  const disabled = analysisMode(config, false, 'jev-deepseek');
  assert.equal(disabled.selectedMode, 'jev-deepseek'); assert.equal(disabled.primary.provider, 'deepseek');
  assert.equal(disabled.judge, undefined); assert.equal(disabled.error, '');
});
test('双模型缺少任一配置时不能自动降级；关闭功能不依赖补充配置', () => {
  const onlyDS = { ...config, profiles: [config.profiles[1]] };
  const onlyJev = { configured: true, ...judge };
  assert.match(analysisMode(onlyDS, true, 'jev-deepseek').error, /需要先配置 Jev/);
  assert.equal(analysisMode(onlyDS, true, 'jev-deepseek').primary.configured, false);
  for (const preference of ['deepseek', 'jev-deepseek', undefined] as const) {
    assert.match(analysisMode(onlyJev, true, preference).error, /保存 DeepSeek 配置/);
    assert.equal(analysisMode(onlyJev, true, preference).primary.configured, false);
    assert.equal(analysisMode(onlyJev, false, preference).primary.configured, true);
  }
  const blank = { configured: false };
  assert.equal(analysisMode(blank, true, 'deepseek').primary.configured, false);
});
test('分析组合偏好可恢复，缺失、非法值及不可访问存储使用兼容默认选择', () => {
  assert.equal(readSemanticModePreference(), undefined);
  for (const mode of ['deepseek', 'jev-deepseek'] as const) {
    assert.equal(readSemanticModePreference({ getItem: key => key === SEMANTIC_MODE_PREFERENCE ? mode : null }), mode);
  }
  for (const value of [null, '', 'automatic', 'constructor']) assert.equal(readSemanticModePreference({ getItem: () => value }), undefined);
  assert.equal(readSemanticModePreference({ getItem: () => { throw new Error('unavailable'); } }), undefined);
});
test('Web 中激活 DeepSeek 后仍用独立 Jev Key，状态不泄露密钥', () => {
  const env = { JEV_PROVIDER: 'deepseek', JEV_API_KEY: 'synthetic-ds-key', TYPESAFE_API_KEY: 'synthetic-jev-key' };
  assert.equal(getConfiguredProviderConfig('typesafe', env).apiKey, env.TYPESAFE_API_KEY);
  assert.equal(getConfiguredProviderConfig('deepseek', env).apiKey, env.JEV_API_KEY);
  assert.equal(analysisMode({ configured: true, provider: 'deepseek', model: 'deepseek-flash', profiles: configuredProfiles(env) }, true).primary.provider, 'typesafe');
  assert.doesNotMatch(JSON.stringify(configuredProfiles(env)), /synthetic|apiKey/);
  assert.throws(() => getConfiguredProviderConfig('constructor', env));
});
test('Jev 独立判断策略、状态、概率和证据，只使用其支持的题型', async () => {
  const payload = buildJevSemanticPayload(job, 'typesafe');
  assert.ok(Object.values(payload.questions).every(q => ['noul', 'choice'].includes(q.type)));
  assert.equal(Object.keys(payload.questions).filter(id => id.includes('_strategy_')).length, 12);
  assert.throws(() => buildJevSemanticPayload(job, 'deepseek'));
  const result = await judged(), value = result.lines[0].semanticJudgment;
  assert.deepEqual(value.communicationStrategies, { withdrawal: .71, protest: .63 });
  assert.equal(value.subtextStatus, 'supported'); assert.equal(value.semanticConfidence, .74);
  assert.deepEqual(value.semanticEvidenceIds, ['s']); assert.equal(value.emotions.disappointed, 1);
  assert.equal(result.usage.details?.[0].task, 'semantic_judgment');
});
test('DeepSeek 接收 Jev 已完成判断和正确原文编号，仅输出文字且不能修改判断', async () => {
  const result = await judged(), decision = result.lines[0].semanticJudgment;
  const input = { ...job, jevJudgments: { o: decision } };
  const answer = await analyzeSemantics(input, async payload => {
    assert.match(payload.deepseekMessages[0].content, /不得重新判断/);
    const content = payload.deepseekMessages[1].content;
    assert.match(content, /失落/); assert.match(content, /回应收到/); assert.match(content, /"evidence_ids":\["0"\]/);
    return dsPacket({ s0: { subtext: '可能对对方直接结束聊天感到失望，希望得到理解。' } });
  });
  assert.deepEqual(answer.lines[0].communicationStrategies, decision.communicationStrategies);
  assert.equal(answer.lines[0].semanticConfidence, decision.semanticConfidence);
  assert.equal(answer.lines[0].semanticAnalysis.judgeModel, judge.model);
  await assert.rejects(() => analyzeSemantics(input, async () => dsPacket({ s0: { subtext: '试图重新分类', confidence: .99 } })), SemanticFailure);
});
test('Jev 无潜台词或证据不足时直接显示其结论，不让 DeepSeek 猜测也不调用它', async () => {
  for (const [status, confidence] of [['none', .9], ['supported', .4]] as const) {
    const result = await analyzeJevSemantics(job, 'typesafe', async payload => jevPacket(payload, status, confidence));
    const input = { ...job, jevJudgments: { o: result.lines[0].semanticJudgment } };
    let calls = 0;
    const response = await analyzeSemantics(input, async () => { calls++; throw new Error('must not call'); });
    assert.equal(calls, 0); assert.equal(response.usage.requests, 0);
    assert.deepEqual(validateReturnedUsage(response.usage), response.usage);
    assert.equal(response.lines[0].subtext, status === 'none' ? '无明显潜台词' : '潜台词不确定');
  }
});
test('仅 DeepSeek 时继续完成判断与文字两部分，缓存与双平台分开', async () => {
  const response = await analyzeSemantics(job, async payload => {
    assert.match(payload.deepseekMessages[0].content, /你分析双人对话/);
    return dsPacket({ s0: { communication_strategy: { protest: .6 }, subtext: '可能期待对方继续回应。', subtext_status: 'supported', confidence: .7, context_dependency: .9, evidence_ids: ['0'] } });
  });
  const line = response.lines[0] as LineResult;
  assert.equal(line.semanticAnalysis?.judgeModel, undefined);
  assert.equal(hasCurrentSemantics(line, response.contextHash, 'deepseek-flash'), true);
  assert.equal(hasCurrentSemantics(line, response.contextHash, 'deepseek-flash', judge), false);
});
test('Jev 判断可单独持久化并复用，原文、模型或版本改变不能复用', async () => {
  const result = await judged(), line = { id: 'o', semanticJudgment: result.lines[0].semanticJudgment } as LineResult;
  assert.equal(hasCurrentJevJudgment(line, result.contextHash, judge), true);
  assert.equal(hasCurrentJevJudgment(line, result.contextHash, { ...judge, provider: 'vercel' }), false);
  const changed = { ...job, messages: job.messages.map(m => ({ ...m, text: m.text + '。' })) };
  assert.equal(hasCurrentJevJudgment(line, await semanticContextHash(changed), judge), false);
  assert.equal(hasCurrentJevJudgment({ ...line, semanticJudgment: { ...line.semanticJudgment!, version: 'old' } as never }, result.contextHash, judge), false);
  await assert.rejects(() => analyzeSemantics({ ...changed, jevJudgments: { o: line.semanticJudgment! } }, async () => { throw new Error('must reject before calling'); }), /Jev 判断与当前原文不匹配/);
});
test('关闭开关只隐藏新增层，原文和已保存分析保持不变', async () => {
  const result = await judged(), decision = result.lines[0].semanticJudgment;
  const semantic = await analyzeSemantics({ ...job, jevJudgments: { o: decision } }, async () => dsPacket({ s0: { subtext: '可能希望自己的情绪被理解。' } }));
  const line: LineResult = { ...semantic.lines[0], emotions: decision.emotions, intents: decision.intents, score: { value: null, confidence: .7, status: 'ambiguous', probabilities: {} } };
  const before = structuredClone(line);
  const html = renderToStaticMarkup(createElement(ChatMessage, { message: job.messages[1], result: line, self: '我', other: '对方', showTime: false, showSemantics: false }));
  assert.match(html, /emotion-row/); assert.doesNotMatch(html, /strategy-row|subtext-row/); assert.deepEqual(line, before);
});

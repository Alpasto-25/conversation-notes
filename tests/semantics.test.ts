import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import { parseChat, toMessages } from '../shared/parser';
import { renderToStaticMarkup } from 'react-dom/server';
import { IDBFactory } from 'fake-indexeddb';
import { analyzeSemantics, buildSemanticPayload, hasCurrentSemantics, hasCurrentJevJudgment, semanticAnswerSchema, semanticContextHash, semanticJobs, SemanticFailure, semanticFailureDetails, SEMANTIC_VERSION, DEEPSEEK_SEMANTIC_VERSION } from '../shared/semantics';
import { deepseekEnvelope } from '../shared/deepseek';
import { buildRequest, analyzeWithEvaluator } from '../shared/analysis-core';
import { validateResult } from '../shared/provider-contract';
import { getSemanticProviderConfig, semanticProviderStatus } from '../server/provider-config';
import { evaluateSemanticPayload } from '../server/provider';
import { newNotebook, conversationInScene, emptyConversation } from '../src/notebooks';
import { createNotebookStore } from '../src/storage';
import { ChatMessage } from '../src/ChatMessage';
import { SemanticDetail } from '../src/SemanticDetail';
import { shareText } from '../src/share-content';
import type { AnalysisRequest, LineResult } from '../shared/types';

const job: AnalysisRequest = { relation: 'couple', task: 'other_messages', revision: 2, targetIds: ['o'], messages: [
  { id: 's', sender: 'self', text: '那早点休息？晚安。', kind: 'text', timestamp: null },
  { id: 'o', sender: 'other', text: '你真的就晚安了？', kind: 'text', timestamp: null },
] };
const ordinary = { ...job, relation: 'friend' as const, messages: job.messages.map(m => ({ ...m, text: m.sender === 'self' ? '收到后核对一下。' : '嗯。' })) };
const answer = { communication_strategy: { withdrawal: .71, protest: .63 }, subtext: '可能对对方直接结束聊天感到失望，希望自己的情绪被理解。',
  subtext_status: 'supported' as const, context_dependency: .91, confidence: .74, evidence_ids: ['0', '1'] };
const packet = (analyses: unknown) => deepseekEnvelope({ model: 'deepseek-flash', id: 'synthetic-semantics-1',
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ analyses }), reasoning_content: 'PRIVATE_REASONING' } }],
  usage: { prompt_tokens: 100, completion_tokens: 30, prompt_cache_hit_tokens: 80, prompt_cache_miss_tokens: 20 } });
const primary: LineResult = { id: 'o', emotions: { calm: 1 }, intents: { acknowledge: 1 }, event: { kind: 'none', confidence: 1 },
  score: { value: null, confidence: .9, status: 'ambiguous', probabilities: {} } };

test('补充层保留独立多标签概率、自由文本、真实用量和原文依据', async () => {
  const result = await analyzeSemantics(job, async payload => {
    assert.equal(payload.purpose, 'semantics'); assert.deepEqual(payload.questions, {});
    assert.deepEqual(payload.state.messages.map(m => m.text), job.messages.map(m => m.text));
    return packet({ s0: answer });
  });
  const line = result.lines[0];
  assert.deepEqual(line.communicationStrategies, { withdrawal: .71, protest: .63 });
  assert.equal(Object.values(line.communicationStrategies).reduce((a, b) => a + b, 0), 1.3399999999999999);
  assert.equal(line.subtext, answer.subtext); assert.equal(line.contextDependency, .91); assert.equal(line.semanticConfidence, .74);
  assert.deepEqual(line.semanticEvidenceIds, ['s', 'o']);
  assert.equal(result.usage.input_tokens, 100); assert.equal(result.usage.output_tokens, 30);
  assert.equal(result.usage.details?.[0].task, 'semantics'); assert.equal(result.usage.details?.[0].validation, 'accepted');
  assert.doesNotMatch(JSON.stringify(result.usage), /PRIVATE_REASONING|晚安|apiKey/);
});

test('普通嗯和没事不被固定成负面，证据不足或低把握时撤回确定潜台词', async () => {
  const normal = await analyzeSemantics(ordinary, async () => packet({ s0: { communication_strategy: { direct: .9 }, subtext_status: 'none' } }));
  assert.equal(normal.lines[0].subtext, '无明显潜台词'); assert.deepEqual(normal.lines[0].communicationStrategies, { direct: .9 });
  assert.equal(normal.lines[0].semanticConfidence, undefined); assert.equal(normal.lines[0].contextDependency, undefined);
  for (const patch of [{ evidence_ids: ['1'] }, { evidence_ids: [] }, { confidence: .59 }]) {
    const result = await analyzeSemantics(ordinary, async () => packet({ s0: { ...answer, ...patch } }));
    assert.equal(result.lines[0].subtextStatus, 'uncertain'); assert.equal(result.lines[0].subtext, '潜台词不确定');
    assert.deepEqual(result.lines[0].communicationStrategies, {});
  }
  const uncertain = await analyzeSemantics(ordinary, async () => packet({ s0: { communication_strategy: { protest: .7 }, subtext_status: 'uncertain' } }));
  assert.equal(uncertain.lines[0].subtext, '潜台词不确定'); assert.deepEqual(uncertain.lines[0].communicationStrategies, {});
});

test('仅 DeepSeek 混合批次先返回状态，无潜台词不需要编写解释或数值，也不重复请求', async () => {
  const batch = { ...ordinary, targetIds: ['o', 'p', 'q'], messages: [...ordinary.messages,
    { ...ordinary.messages[1], id: 'p', text: '你真的就晚安了？' }, { ...ordinary.messages[1], id: 'q', text: '随你。' }] };
  const compact = { subtext_status: 'none', communication_strategy: { direct: .9 } };
  let calls = 0;
  const result = await analyzeSemantics(batch, async () => {
    calls++;
    return packet({ s0: compact, s1: answer, s2: { subtext_status: 'uncertain', communication_strategy: {} } });
  });
  assert.equal(calls, 1); assert.equal(result.usage.requests, 1);
  assert.deepEqual(result.lines.map(line => [line.id, line.subtextStatus, line.subtext]), [
    ['o', 'none', '无明显潜台词'], ['p', 'supported', answer.subtext], ['q', 'uncertain', '潜台词不确定'],
  ]);
  assert.equal(result.lines[0].semanticConfidence, undefined); assert.deepEqual(result.lines[0].semanticEvidenceIds, []);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(answer).length / 2);
  assert.equal(semanticAnswerSchema.safeParse({ ...compact, subtext: '为每句编写的猜测' }).success, false);
  assert.equal(semanticAnswerSchema.safeParse({ subtext_status: 'supported', communication_strategy: {} }).success, false);
  const cached = { ...primary, ...result.lines[0] };
  assert.equal(hasCurrentSemantics(cached, result.contextHash, 'deepseek-flash'), true);
  const note = newNotebook({ ...emptyConversation('friend'), messages: batch.messages, lines: { o: cached }, completed: true });
  const store = createNotebookStore(new IDBFactory()); await store.save(note, true);
  const restored = (await store.loadLibrary()).active!.conversation.lines.o;
  assert.equal(restored.subtextStatus, 'none'); assert.equal(hasCurrentSemantics(restored, result.contextHash, 'deepseek-flash'), true);
  await store.close();
});

test('新单模型规则只使旧 DeepSeek 补充缓存失效，Jev 判断和双模型结果保持可复用', async () => {
  const result = await analyzeSemantics(job, async () => packet({ s0: answer }));
  const judge = { provider: 'typesafe', model: 'jev-1.13.0' };
  const line = { ...primary, ...result.lines[0] };
  assert.equal(line.semanticAnalysis.version, DEEPSEEK_SEMANTIC_VERSION);
  const legacy = { ...line, semanticAnalysis: { ...line.semanticAnalysis, version: SEMANTIC_VERSION } };
  assert.equal(hasCurrentSemantics(legacy, result.contextHash, 'deepseek-flash'), false);
  const guided = { ...legacy, semanticAnalysis: { ...legacy.semanticAnalysis, judgeProvider: judge.provider, judgeModel: judge.model },
    semanticJudgment: { version: 'jev-semantic-judgment-v1', ...judge, contextHash: result.contextHash } } as LineResult;
  assert.equal(hasCurrentSemantics(guided, result.contextHash, 'deepseek-flash', judge), true);
  assert.equal(hasCurrentJevJudgment(guided, result.contextHash, judge), true);
  assert.equal(await semanticContextHash(job), result.contextHash);
  const html = renderToStaticMarkup(createElement(ChatMessage, { message: job.messages[1], result: legacy, self: '我', other: '对方', showTime: false }));
  assert.ok(html.includes(answer.subtext));
});

test('解读详情加粗表达方式和潜台词，保留依据并移除概率、置信度和模型信息', async () => {
  const semantic = (await analyzeSemantics(job, async () => packet({ s0: answer }))).lines[0];
  const html = renderToStaticMarkup(createElement(SemanticDetail, { result: { ...primary, ...semantic }, messages: job.messages }));
  assert.match(html, /<strong>收起交流<\/strong>/); assert.ok(html.includes(`<strong>${answer.subtext}</strong>`));
  assert.ok(html.includes(job.messages[0].text));
  assert.doesNotMatch(html, /置信度|依赖度|概率|deepseek-flash|71%|63%/);
});

test('策略字典、概率、句长和可见证据严格校验，禁止扩展隐藏意图类别', async () => {
  for (const patch of [{ communication_strategy: { made_up: .8 } }, { communication_strategy: { sarcasm: 82 } },
    { communication_strategy: { direct: .49 } }, { communication_strategy: { direct: .9, indirect: .8, sarcasm: .7, protest: .6 } },
    { confidence: -1 }, { context_dependency: 91 }, { subtext: '长'.repeat(81) }, { subtext: '第一行\n第二行' }, { evidence_ids: ['0', '0'] },
    { evidence_ids: Array.from({ length: 13 }, (_, i) => String(i)) }]) {
    assert.equal(semanticAnswerSchema.safeParse({ ...answer, ...patch }).success, false);
  }
  for (const analyses of [{ s0: { ...answer, evidence_ids: ['900'] } }, { unknown_target: answer }, {}])
    await assert.rejects(() => analyzeSemantics(job, async () => packet(analyses)), SemanticFailure);
  assert.throws(() => buildSemanticPayload({ ...job, task: 'self_message' }));
});

test('合法的额外原文依据不会使已付费解释失败，只保留三条且仍检查未保存的引用', async () => {
  const longer = { ...job, messages: [...job.messages, { ...job.messages[0], id: 'p' }, { ...job.messages[1], id: 'q' }] };
  const result = await analyzeSemantics(longer, async () => packet({ s0: { ...answer, evidence_ids: ['0', '1', '2', '3'] } }));
  assert.equal(result.usage.requests, 1); assert.equal(result.usage.details?.[0].validation, 'accepted');
  assert.deepEqual(result.lines[0].semanticEvidenceIds, ['s', 'o', 'p']); assert.equal(result.lines[0].subtext, answer.subtext);
  await assert.rejects(() => analyzeSemantics(longer, async () => packet({ s0: { ...answer, evidence_ids: ['0', '1', '2', '900'] } })), SemanticFailure);
});

test('单条补充无效时保留其他完整结果和实际用量，安全错误不携带原始回答', async () => {
  const batch = { ...job, targetIds: ['o', 'p'], messages: [...job.messages, { ...job.messages[1], id: 'p', text: '没事。' }] };
  await assert.rejects(() => analyzeSemantics(batch, async () => packet({ s0: answer, s1: { ...answer, communication_strategy: { unknown: 100 }, subtext: 'PRIVATE_INVALID_RESPONSE' } })), error => {
    assert.ok(error instanceof SemanticFailure);
    assert.deepEqual(error.partial.lines.map(line => line.id), ['o']); assert.equal(error.partial.usage.requests, 1);
    assert.equal(error.partial.usage.details?.[0].validation, 'rejected');
    assert.doesNotMatch(JSON.stringify(semanticFailureDetails(error)), /PRIVATE_INVALID_RESPONSE|PRIVATE_REASONING|"json"\s*:/);
    return true;
  });
});

test('相同上下文跨重试复用，消息、场景、模型或语义版本变化拒绝复用', async () => {
  const result = await analyzeSemantics(job, async () => packet({ s0: answer })), line = { ...primary, ...result.lines[0] };
  assert.equal(await semanticContextHash({ ...job, revision: 9, targetIds: [] }), result.contextHash);
  assert.equal(hasCurrentSemantics(line, result.contextHash, 'deepseek-flash'), true);
  for (const changed of [{ ...job, relation: 'friend' as const }, { ...job, messages: ordinary.messages },
    { ...job, messages: job.messages.map(m => ({ ...m, timestamp: '08:00' })) }, { ...job, messages: [...job.messages].reverse() }])
    assert.notEqual(await semanticContextHash(changed), result.contextHash);
  assert.equal(hasCurrentSemantics(line, result.contextHash, 'other-model'), false);
  assert.equal(hasCurrentSemantics({ ...line, semanticAnalysis: { ...line.semanticAnalysis!, version: 'old' } }, result.contextHash, 'deepseek-flash'), false);
  assert.equal(hasCurrentSemantics(primary, result.contextHash, 'deepseek-flash'), false);
});

test('超过100条的短语境测试保留完整前后文，长记录继续使用已有上下文预算', () => {
  const messages = Array.from({ length: 130 }, (_, i) => ({ id: `m${i}`, sender: i % 2 ? 'other' as const : 'self' as const,
    text: i === 126 ? '我在意的不是下雨。' : '嗯。', kind: 'text' as const, timestamp: null }));
  const jobs = semanticJobs(messages, 'couple', 1, {});
  assert.ok(jobs.length > 1); assert.ok(jobs.every(job => job.messages.length === 130));
  assert.ok(jobs.every(job => job.targetIds.length <= 12));
  assert.equal(jobs[0].messages[126].text, '我在意的不是下雨。');
  const long = semanticJobs(messages.map(m => ({ ...m, text: '长'.repeat(200) })), 'couple', 1, {});
  assert.ok(long.every(job => job.messages.reduce((n, m) => n + m.text.length, 0) <= 12000));
});

test('用户提供的高语境完整对话保留到每批补充请求，普通对照材料也可直接导入', async () => {
  const text = await readFile(new URL('./fixtures/semantic-high-context.txt', import.meta.url), 'utf8');
  const parsed = parseChat(text), messages = toMessages(parsed.messages, '男');
  assert.equal(parsed.warnings.length, 0); assert.ok(messages.length > 100);
  assert.equal(messages.at(-1)?.text, '你看，你不是挺会感觉的吗。');
  const jobs = semanticJobs(messages, 'couple', 3, {});
  assert.equal(new Set(jobs.flatMap(job => job.targetIds)).size, messages.filter(m => m.sender === 'other').length);
  for (const job of jobs) {
    const payload = buildSemanticPayload(job);
    assert.equal(payload.state.messages.length, messages.length);
    assert.ok(payload.state.messages.some(m => m.text === '我在意的不是下雨。'));
    assert.equal(payload.state.messages.at(-1)?.text, messages.at(-1)?.text);
  }
  const control = parseChat(await readFile(new URL('./fixtures/semantic-ordinary.txt', import.meta.url), 'utf8'));
  assert.equal(control.warnings.length, 0); assert.equal(control.messages.length, 8);
});

test('旧手记和新增层都能持久化，切场景保留独立分析并恢复全部新增字段', async () => {
  const semantic = (await analyzeSemantics(job, async () => packet({ s0: answer }))).lines[0];
  const old = { ...emptyConversation('couple'), messages: job.messages, self: '我', other: '对方', lines: { o: primary }, completed: true };
  const note = newNotebook(old); note.scenes.couple = { ...old, lines: { o: { ...primary, ...semantic } } };
  const store = createNotebookStore(new IDBFactory()); await store.save(note, true);
  const restored = (await store.loadLibrary()).active!;
  assert.deepEqual(restored.conversation.lines.o, primary);
  assert.deepEqual(conversationInScene(restored, 'couple').lines.o, { ...primary, ...semantic });
  assert.deepEqual(conversationInScene(restored, 'friend').lines, {}); await store.close();
  const html = renderToStaticMarkup(createElement(ChatMessage, { message: job.messages[1], result: primary, self: '我', other: '对方', showTime: false }));
  assert.match(html, /emotion-row/); assert.match(html, /intent-row/); assert.doesNotMatch(html, /strategy-row|subtext-row/);
});

test('分享保留策略独立概率与潜台词，旧格式仍可导出', async () => {
  const semantic = (await analyzeSemantics(job, async () => packet({ s0: answer }))).lines[0];
  const conversation = { ...emptyConversation('couple'), messages: job.messages, lines: { o: { ...primary, ...semantic } } };
  const txt = shareText({ title: '合成测试', conversation }, ['o']);
  assert.match(txt, /对方的表达方式（独立概率）.*收起交流 71%.*间接表达不满 63%/); assert.match(txt, /潜台词：可能/);
  assert.match(txt, /上下文依赖度：91% \[0.91\]/); assert.match(txt, /deepseek-flash/);
  const guided = shareText({ title: '双模型测试', conversation: { ...conversation, lines: {
    o: { ...primary, ...semantic, semanticAnalysis: { ...semantic.semanticAnalysis, judgeProvider: 'typesafe', judgeModel: 'jev-1.13.0' } },
  } } }, ['o']);
  assert.match(guided, /判断 jev-1.13.0；解释 deepseek-flash/);
  const legacy = shareText({ title: '旧测试', conversation: { ...conversation, lines: { o: primary } } }, ['o']);
  assert.match(legacy, /完整意图分布/); assert.doesNotMatch(legacy, /对方的表达方式|潜台词：/);
});

test('补充请求只用 DeepSeek 专用配置，不借用或更改 Jev Key', async () => {
  const env = { JEV_PROVIDER: 'typesafe', JEV_API_KEY: 'synthetic-jev-key', DEEPSEEK_API_KEY: 'synthetic-deepseek-key' };
  const before = { ...env }, config = getSemanticProviderConfig(env);
  assert.equal(config.provider, 'deepseek'); assert.equal(config.apiKey, env.DEEPSEEK_API_KEY); assert.deepEqual(env, before);
  assert.equal(semanticProviderStatus({ JEV_PROVIDER: 'typesafe', JEV_API_KEY: 'synthetic-jev-key' }).configured, false);
  assert.doesNotMatch(JSON.stringify(semanticProviderStatus(env)), /key/i);
  let calls = 0;
  const result = await analyzeSemantics(job, (payload, signal) => evaluateSemanticPayload(payload, signal, config, async (_url, init) => {
    calls++; assert.equal(_url, 'https://api.deepseek.com/chat/completions');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic-deepseek-key');
    const wire = JSON.parse(String(init?.body)); assert.equal(wire.max_tokens, 4096); assert.equal(wire.messages[0].role, 'system');
    assert.equal(wire.questions, undefined); assert.equal(wire.purpose, undefined);
    return Response.json({ model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ analyses: { s0: answer } }) } }], usage: { prompt_tokens: 5, completion_tokens: 3 } });
  }));
  assert.equal(calls, 1); assert.equal(result.lines.length, 1);
});

test('Jev 主请求仅含原来的题型，新增层不伪造其自由文本能力', async () => {
  const payload = buildRequest(job);
  assert.deepEqual(Object.keys(payload.questions).sort(), ['o_emotions', 'o_event', 'o_intents']);
  const result = await analyzeWithEvaluator(job, async request => validateResult({ model: 'jev-1.13.0',
    answers: Object.fromEntries(Object.entries(request.questions).map(([id, q]) => {
      if (q.type === 'noul') return [id, { type: 'noul', noul: .5 }];
      const keys = Object.keys(q.criteria); return [id, { type: q.type, choice: keys[0], confidence: 1, probabilities: Object.fromEntries(keys.map((key, i) => [key, i ? 0 : 1])) }];
    })), usage: { input_tokens: 10, output_tokens: 2 } }, request.questions));
  assert.equal(result.lines?.[0].intentVersion, 'surface-v1'); assert.equal(result.lines?.[0].subtext, undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recognizeScreenshotPayload } from '../server/provider';
import { getProviderConfig } from '../server/provider-config';
import { recognizeScreenshot } from '../src/platform';
import { screenshotInputSchema, screenshotProviderPreference, SCREENSHOT_PREFERENCE, SCREENSHOT_INSTRUCTIONS } from '../shared/openrouter';
import { analysisMode, judgmentSelection, readSemanticModePreference, SEMANTIC_MODE_PREFERENCE } from '../shared/analysis-mode';
import { summarizeModelUsage } from '../shared/billing';
import { analyzeSemantics, semanticContextHash, SEMANTIC_VERSION, SemanticFailure } from '../shared/semantics';
import { deepseekEnvelope } from '../shared/deepseek';
import { newNotebook, emptyConversation } from '../src/notebooks';
import { notebookSchema } from '../src/backup';
import { shareText } from '../src/share-content';
import { privateShareSource } from '../src/share-privacy';
import type { AnalysisRequest } from '../shared/types';

const image = 'data:image/jpeg;base64,/9j/2Q==';
const dsConfig = () => getProviderConfig({ JEV_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'synthetic-deepseek-vision' });
test('DeepSeek vision uses its own key, fixed multimodal Flash route, JSON output and raw cache usage', async () => {
  const config = dsConfig(), before = structuredClone(config);
  const result = await recognizeScreenshotPayload({ provider: 'deepseek', image, selfSide: 'left', endpoint: 'https://invalid.example', model: 'untrusted' }, new AbortController().signal, config, async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions'); assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic-deepseek-vision');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'deepseek-flash'); assert.deepEqual(body.thinking, { type: 'disabled' });
    assert.equal(body.reasoning, undefined); assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.messages[0].content, SCREENSHOT_INSTRUCTIONS);
    assert.match(body.messages[1].content[0].text, /左/);
    assert.deepEqual(body.messages[1].content[1], { type: 'image_url', image_url: { url: image, detail: 'high' } });
    return Response.json({ model: 'deepseek-flash', usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 70, prompt_cache_miss_tokens: 30 } });
  });
  assert.equal(result.usage.prompt_cache_hit_tokens, 70); assert.deepEqual(config, before);
  await assert.rejects(() => recognizeScreenshotPayload({ image, selfSide: 'right' }, new AbortController().signal, config), /平台与所选配置不一致/);
  await assert.rejects(() => recognizeScreenshotPayload({ provider: 'deepseek', image, selfSide: 'right' }, new AbortController().signal, config, async () => new Response('synthetic-deepseek-vision PRIVATE CHAT', { status: 401 })), error => {
    assert.match((error as Error).message, /DeepSeek/); assert.doesNotMatch((error as Error).message, /synthetic|PRIVATE/); return true;
  });
});

test('recognition ledger keeps DeepSeek time, CNY estimate and missing charges separate from OpenAI USD', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).provider, 'deepseek');
      return Response.json({ model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: '{"messages":[{"sender":"other","text":"明天见。"}]}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 70, prompt_cache_miss_tokens: 30 } });
    };
    const run = await recognizeScreenshot(image, 'right', new AbortController().signal, 'deepseek');
    assert.equal(run.messages?.[0].text, '明天见。'); assert.equal(run.usage.purpose, 'screenshot');
    assert.equal(run.usage.provider, 'deepseek'); assert.equal(run.usage.cost_usd, undefined);
    assert.equal(run.usage.input_tokens, 100); assert.equal(run.usage.prompt_cache_hit_tokens, 70);
    assert.equal(run.usage.requests, 1); assert.ok(run.usage.elapsed_ms >= 0); assert.ok(run.usage.run_id);
    const fees = summarizeModelUsage([{ ...run.usage, started_at: '2026-10-23T12:00:00Z', finished_at: '2026-10-23T12:00:01Z' }]);
    assert.equal(fees.models[0].kind, 'deepseek'); assert.ok(fees.models[0].fee!.min > 0);
    assert.equal(fees.models[0].fee!.min, fees.models[0].fee!.max);
    globalThis.fetch = async () => Response.json({ error: 'DeepSeek：请求受限' }, { status: 429 });
    const failed = await recognizeScreenshot(image, 'right', new AbortController().signal, 'deepseek');
    assert.equal(failed.usage.unreported_batches, 1); assert.equal(failed.usage.status, 'partial'); assert.equal(failed.usage.cost_usd, undefined);
    assert.equal(summarizeModelUsage([failed.usage]).models[0].fee, undefined);
  } finally { globalThis.fetch = original; }
});

test('vision rejects remote URLs, spoofed JPEGs and unsupported providers, and remembers its independent preference', () => {
  for (const patch of [{ provider: 'typesafe' }, { provider: 'constructor' }, { image: 'data:image/jpeg;base64,AAAA' }, { image: 'https://example.org/a.jpg' }, { selfSide: 'unknown' }])
    assert.equal(screenshotInputSchema.safeParse({ image, selfSide: 'right', ...patch }).success, false);
  assert.equal(screenshotInputSchema.parse({ image, selfSide: 'left' }).provider, 'openrouter');
  const status = { configured: true, provider: 'deepseek' };
  assert.equal(screenshotProviderPreference(status), 'deepseek');
  assert.equal(screenshotProviderPreference(status, { getItem: key => key === SCREENSHOT_PREFERENCE ? 'openrouter' : null }), 'openrouter');
  assert.equal(screenshotProviderPreference(status, { getItem: () => { throw new Error('disabled'); } }), 'deepseek');
});

test('three judgment choices never silently use a different judge and legacy OpenAI dual preference migrates', () => {
  const status = { configured: true, provider: 'openrouter', model: 'openai/gpt-6-luna-decisions', profiles: [
    { configured: true, provider: 'openrouter', model: 'openai/gpt-6-luna-decisions' },
    { configured: true, provider: 'deepseek', model: 'deepseek-flash' },
  ] };
  assert.equal(analysisMode(status, true).selectedMode, 'openai-deepseek');
  assert.equal(analysisMode(status, true, 'openai-deepseek').judge?.model, status.model);
  assert.equal(analysisMode(status, true, 'deepseek').primary.provider, 'deepseek');
  assert.equal(analysisMode(status, true, 'jev-deepseek').primary.configured, false);
  assert.deepEqual(judgmentSelection(status, 'jev-deepseek'), { provider: 'openrouter', model: 'typesafe/jev-1.13' });
  const migrated = readSemanticModePreference({ getItem: key => key === 'conversation-notes-semantic-mode-v1' ? 'jev-deepseek' : null });
  assert.equal(analysisMode(status, true, migrated).selectedMode, 'openai-deepseek');
  assert.equal(readSemanticModePreference({ getItem: key => key === SEMANTIC_MODE_PREFERENCE ? 'openai-deepseek' : null }), 'openai-deepseek');
});

const job: AnalysisRequest = { revision: 1, relation: 'friend', task: 'other_messages', targetIds: ['o'], messages: [
  { id: 's', sender: 'self', text: '明天三点见？', kind: 'text', timestamp: null },
  { id: 'o', sender: 'other', text: '可以。', kind: 'text', timestamp: null },
] };
test('DeepSeek explains visible strategies even without subtext; wording survives history, backup and sharing', async () => {
  const hash = await semanticContextHash(job);
  const decision = { version: 'jev-semantic-judgment-v1' as const, provider: 'openrouter' as const, model: 'openai/gpt-6-luna-decisions', contextHash: hash,
    communicationStrategies: { direct: .9 }, subtextStatus: 'none' as const, contextDependency: 0, semanticConfidence: .9, semanticEvidenceIds: [], emotions: { calm: 1 }, intents: { acknowledge: 1 } };
  const input = { ...job, jevJudgments: { o: decision } };
  const text = '用明确的肯定答复确认见面安排。';
  const packet = (item: unknown) => deepseekEnvelope({ model: 'deepseek-flash', usage: { prompt_tokens: 20, completion_tokens: 10 }, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ analyses: { s0: item } }) } }] });
  const result = await analyzeSemantics(input, async payload => {
    assert.match(payload.deepseekMessages[0].content, /none或uncertain不得写subtext/);
    assert.match(payload.deepseekMessages[1].content, /"alias":"s0"/);
    return packet({ strategy_explanation: text });
  });
  assert.equal(result.lines[0].strategyExplanation, text); assert.equal(result.lines[0].subtext, '无明显潜台词');
  assert.deepEqual(result.lines[0].communicationStrategies, decision.communicationStrategies); assert.equal(result.lines[0].semanticAnalysis.version, SEMANTIC_VERSION);
  for (const invalid of [{ subtext: '猜测隐藏含义', strategy_explanation: text }, {}, { strategy_explanation: text, confidence: 1 }])
    await assert.rejects(() => analyzeSemantics(input, async () => packet(invalid)), SemanticFailure);
  const empty = await analyzeSemantics({ ...input, jevJudgments: { o: { ...decision, communicationStrategies: {} } } }, async () => { throw new Error('No paid call for empty wording'); });
  assert.equal(empty.usage.requests, 0);
  const note = newNotebook({ ...emptyConversation('friend'), messages: job.messages, lines: { o: { ...result.lines[0], score: { value: null, confidence: 1, status: 'clear', probabilities: {} } } } });
  assert.equal(notebookSchema.parse(note).conversation.lines.o.strategyExplanation, text);
  assert.ok(shareText({ title: note.title, conversation: note.conversation }, ['o']).includes(text));
  note.conversation.lines.o.strategyExplanation = '小明用明确回复告知 13800138000 和 test@example.com。';
  note.conversation.other = '小明';
  const redacted = privateShareSource({ title: note.title, conversation: note.conversation }, { aliases: true, contacts: true, hideTime: false, replacements: '明确回复' });
  assert.doesNotMatch(redacted.conversation.lines.o.strategyExplanation!, /小明|明确回复|13800138000|test@example.com/);
  assert.match(note.conversation.lines.o.strategyExplanation, /小明/);
});

test('mobile exposes shared screenshot entry and native OCR uses the same transcription contract', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /!isMobile\s*&&\s*<IconButton label="识别聊天截图"/);
  const native = await readFile(new URL('../android/src/local/conversation/notes/MainActivity.java', import.meta.url), 'utf8');
  assert.ok(native.includes(`SCREENSHOT_INSTRUCTIONS = ${JSON.stringify(SCREENSHOT_INSTRUCTIONS)};`));
  assert.match(native, /method\.equals\("recognizeScreenshot"\)/); assert.match(native, /Intent\.EXTRA_ALLOW_MULTIPLE/); assert.match(native, /getClipData\(\)/);
});

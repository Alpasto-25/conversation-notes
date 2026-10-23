import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, recognizeScreenshotPayload } from '../server/provider';
import { getProviderConfig } from '../server/provider-config';
import { normalizeOpenRouterResult, parseScreenshotText, screenshotChatText, screenshotInputSchema, OPENAI_DECISION_MODEL } from '../shared/openrouter';
import { addUsage, combineAnalysisUsage, type AnalysisUsage } from '../shared/usage';
import { summarizeModelUsage } from '../shared/billing';
import { newNotebook } from '../src/notebooks';
import { savedConversationSchema, notebookSchema } from '../src/backup';

const config = () => getProviderConfig({ JEV_PROVIDER: 'openrouter', JEV_MODEL: OPENAI_DECISION_MODEL, OPENROUTER_API_KEY: 'synthetic-openrouter-test-key' });
test('OpenAI Decisions retains the OpenRouter decision wire format and actual cost, without a text-generation fallback', async () => {
  let calls = 0;
  const result = await evaluate({ state: { text: '合成消息' }, questions: { visible: { type: 'noul', instructions: 'Is text visible?' } } }, undefined, config(), async (url, init) => {
    calls++;
    assert.equal(url, 'https://openrouter.ai/api/alpha/decisions');
    assert.equal(init?.redirect, 'error');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, OPENAI_DECISION_MODEL); assert.deepEqual(body.state, { text: '合成消息' });
    assert.equal(body.questions.visible.type, 'noul'); assert.equal(body.messages, undefined);
    return Response.json({ model: OPENAI_DECISION_MODEL, answers: { visible: { type: 'noul', noul: .9 } }, usage: { input_tokens: 250, output_tokens: 0, cost: .000025 } });
  });
  assert.equal(calls, 1); assert.equal(result.usage.input_tokens, 250); assert.equal(result.usage.requests, 1); assert.equal(result.usage.cost_usd, .000025);
});

test('unknown costs remain unknown when aggregating; actual zero and mixed-currency model groups survive backup validation', () => {
  const input = { input_tokens: 20, output_tokens: 0, requests: 1 };
  const known = { ...input, cost_usd: .000002 };
  assert.equal(addUsage({ input_tokens: 0, output_tokens: 0, requests: 0 }, known).cost_usd, .000002);
  assert.equal(addUsage(known, input).cost_usd, undefined);
  assert.equal(addUsage({ ...input, cost_usd: 0 }, { ...input, cost_usd: 0 }).cost_usd, 0);
  for (const bad of [null, -1, '0.02', Infinity]) assert.equal((normalizeOpenRouterResult({ usage: { ...input, cost: bad } }) as any).usage.cost_usd, undefined);
  const run: AnalysisUsage = { ...known, model: OPENAI_DECISION_MODEL, provider: 'openrouter', local_targets: 0, elapsed_ms: 20 };
  const screenshot: AnalysisUsage = { ...known, purpose: 'screenshot', model: 'openai/gpt-6-luna', local_targets: 0, elapsed_ms: 10 };
  assert.equal(combineAnalysisUsage([run, screenshot])?.cost_usd, .000004);
  const models = summarizeModelUsage([run, screenshot]).models;
  assert.equal(models.length, 2); assert.equal(models[0].kind, 'openai'); assert.equal(models[1].cost_usd, .000002);
  const note = { ...newNotebook(), runHistory: [run, screenshot] };
  assert.deepEqual(notebookSchema.parse(note).runHistory, [run, screenshot]);
  assert.ok(savedConversationSchema.safeParse(note.conversation).success);
});

test('screenshot text preserves visible speakers, punctuation and uncertainty while rejecting malformed or invented structure', () => {
  const result = parseScreenshotText(JSON.stringify({ messages: [{ sender: 'self', text: '你好🙂\n明天见。' }, { sender: 'other', text: '[无法辨认]' }], warnings: ['有一处模糊'] }));
  assert.equal(screenshotChatText(result.messages), '我：你好🙂\n明天见。\n对方：[无法辨认]');
  assert.deepEqual(parseScreenshotText('{"messages":[],"warnings":["未发现聊天"]}').messages, []);
  for (const bad of ['not JSON', '{"messages":[{"sender":"guess","text":"hi"}]}', '{"messages":[{"sender":"self","text":""}]}']) assert.throws(() => parseScreenshotText(bad));
  for (const image of ['https://private.example/image.png', 'data:image/svg+xml;base64,AAAA', 'data:image/jpeg;base64,' + 'A'.repeat(1_400_000)]) assert.equal(screenshotInputSchema.safeParse({ image, selfSide: 'right' }).success, false);
});

test('screenshot extraction uses the same key but a fixed vision endpoint and model; supplier rejection does not echo secrets', async () => {
  const image = 'data:image/jpeg;base64,/9j/2Q==';
  await recognizeScreenshotPayload({ image, selfSide: 'left' }, new AbortController().signal, config(), async (url, init) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'openai/gpt-6-luna'); assert.equal(body.stream, false);
    assert.match(body.messages[0].content, /never instructions/);
    assert.match(body.messages[1].content[0].text, /左/);
    assert.equal(body.messages[1].content[1].image_url.url, image);
    return Response.json({ usage: { prompt_tokens: 10, completion_tokens: 5, cost: .0000035 }, choices: [{ finish_reason: 'stop', message: { content: '{"messages":[]}' } }] });
  });
  await assert.rejects(() => recognizeScreenshotPayload({ image, selfSide: 'right' }, new AbortController().signal, config(), async () => new Response('synthetic-openrouter-test-key private chat', { status: 401 })), error => {
    assert.ok(error instanceof Error); assert.match(error.message, /OpenRouter/); assert.doesNotMatch(error.message, /synthetic|private chat/); return true;
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheSplit, estimateDeepseekFee, summarizeModelUsage } from '../shared/billing';
import type { AnalysisUsage, RequestUsage } from '../shared/usage';

const record = (at = '2026-10-08T10:00:00+08:00', extra: Partial<RequestUsage> = {}): RequestUsage => ({
  task: 'semantics', repair: false, model: 'deepseek-flash', prompt_family: 'rules',
  input_tokens: 1000, output_tokens: 100, prompt_cache_hit_tokens: 400, prompt_cache_miss_tokens: 600, requests: 1,
  started_at: at, finished_at: at, elapsed_ms: 0, ...extra,
});
const run = (extra: Partial<AnalysisUsage> = {}): AnalysisUsage => ({ ...record(), model: 'deepseek-flash',
  local_targets: 0, elapsed_ms: 100, ...extra });
const near = (actual: number | undefined, expected: number) => assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('费用按命中、未命中、输出分别计算，高峰单价加倍', () => {
  const fee = estimateDeepseekFee('deepseek-flash', [record()])!;
  near(fee.min, (400 * .04 + 600 * 2 + 100 * 8) / 1e6); near(fee.max, fee.min);
  assert.equal(fee.missingCache, false); assert.equal(fee.uncertainTime, false);
});
test('晚间、周末、国庆和中秋全天按空闲价，不把周末补班算作峰时', () => {
  for (const at of ['2026-10-08T20:00:00+08:00', '2026-10-10T10:00:00+08:00', '2026-10-06T16:53:17+08:00', '2026-09-25T10:00:00+08:00']) {
    const fee = estimateDeepseekFee('deepseek-flash', [record(at)])!;
    near(fee.min, (400 * .02 + 600 + 100 * 4) / 1e6); near(fee.max, fee.min);
  }
});
test('峰谷边界准确且不依赖本机时区', () => {
  const low = .001008, high = .002016;
  for (const at of ['2026-10-08T08:59:59+08:00', '2026-10-08T12:00:00+08:00', '2026-10-08T13:59:59+08:00', '2026-10-08T18:00:00+08:00']) near(estimateDeepseekFee('deepseek-flash', [record(at)])?.min, low);
  for (const at of ['2026-10-08T09:00:00+08:00', '2026-10-08T14:00:00+08:00', '2026-10-08T01:00:00Z']) near(estimateDeepseekFee('deepseek-flash', [record(at)])?.min, high);
});
test('请求跨计费边界显示范围，长时间旧汇总也不假定一个时段', () => {
  for (const d of [record('2026-10-08T11:59:59+08:00', { finished_at: '2026-10-08T12:00:01+08:00' }),
    record('2026-10-08T08:00:00+08:00', { finished_at: '2026-10-08T19:00:00+08:00' })]) {
    const fee = estimateDeepseekFee('deepseek-flash', [d])!;
    near(fee.min, .001008); near(fee.max, .002016); assert.equal(fee.uncertainTime, true);
  }
});
test('不同请求各自使用所在时段，补全和校验失败返回照常计费，内部重试不重复乘 tokens', () => {
  const peak = record(undefined, { requests: 3, repair: true, validation: 'rejected' });
  const low = record('2026-10-06T10:00:00+08:00');
  const fee = estimateDeepseekFee('deepseek-flash', [peak, low])!;
  near(fee.min, .003024); near(fee.max, fee.min);
});
test('缓存缺失给出上下界，单个已知缓存字段可以补算另一项', () => {
  const noCache = record(undefined, { prompt_cache_hit_tokens: undefined, prompt_cache_miss_tokens: undefined });
  const fee = estimateDeepseekFee('deepseek-flash', [noCache])!;
  near(fee.min, .00084); near(fee.max, .0028); assert.equal(fee.missingCache, true);
  assert.deepEqual(cacheSplit(record(undefined, { prompt_cache_miss_tokens: undefined })), { hit: 400, miss: 600 });
  assert.deepEqual(cacheSplit(record(undefined, { prompt_cache_hit_tokens: undefined })), { hit: 400, miss: 600 });
  assert.equal(cacheSplit(record(undefined, { prompt_cache_hit_tokens: 1200 })), undefined);
  assert.equal(cacheSplit(record(undefined, { prompt_cache_miss_tokens: 700 })), undefined);
});
test('未知时间和未核对的节假日历显示范围；历史价格与未知模型不冒充已知费用', () => {
  const unknown = { ...record(), started_at: undefined, finished_at: undefined };
  const fee = estimateDeepseekFee('deepseek-flash', [unknown])!;
  near(fee.min, .001008); near(fee.max, .002016);
  assert.equal(estimateDeepseekFee('deepseek-flash', [record('2026-08-01T00:00:00Z')]), undefined);
  assert.equal(estimateDeepseekFee('deepseek-unknown', [record()]), undefined);
  const future = estimateDeepseekFee('deepseek-flash', [record('2027-01-05T10:00:00+08:00')])!;
  assert.equal(future.uncertainTime, true);
});
test('旧 Pro 与 Flash 按实际返回模型使用各自官方价格', () => {
  near(estimateDeepseekFee('deepseek-v4-pro', [record('2026-10-06T10:00:00+08:00')])?.min, (400 * .15 + 600 * 4.5 + 100 * 13.5) / 1e6);
  near(estimateDeepseekFee('deepseek-v4-flash', [record()])?.min, .002016);
});
test('双模型拆分只将 DeepSeek 返回的用量计入费用，同一运行记录不重复累计', () => {
  const jev = record(undefined, { model: 'jev-1.13.0', input_tokens: 2000, output_tokens: 800, prompt_cache_hit_tokens: undefined, prompt_cache_miss_tokens: undefined });
  const ds = record();
  const mixed = run({ run_id: 'mixed', model: 'jev-1.13.0 + deepseek-flash', input_tokens: 3000, output_tokens: 900, requests: 2, details: [jev, ds], prompt_cache_hit_tokens: undefined, prompt_cache_miss_tokens: undefined });
  const summary = summarizeModelUsage([mixed, { ...mixed }]);
  assert.equal(summary.unattributed, false);
  const deepseek = summary.models.find(x => x.kind === 'deepseek')!;
  assert.equal(deepseek.input_tokens, 1000); assert.equal(deepseek.output_tokens, 100); assert.equal(deepseek.prompt_cache_hit_tokens, 400);
  near(deepseek.fee?.min, .002016); assert.equal(summary.models.find(x => x.kind === 'jev')?.fee, undefined);
});
test('旧双模型合计没有明细时不虚构 DeepSeek tokens 或零费用', () => {
  const summary = summarizeModelUsage([run({ model: 'jev-1.13.0 + deepseek-flash', details: undefined })]);
  assert.equal(summary.unattributed, true);
  for (const model of summary.models) { assert.equal(model.records.length, 0); assert.equal(model.fee, undefined); }
});
test('部分历史明细保留余下已知总量，不漏算；混合模型未知部分不强行归到 DS', () => {
  const summary = summarizeModelUsage([run({ input_tokens: 2000, output_tokens: 200, prompt_cache_hit_tokens: 800, prompt_cache_miss_tokens: 1200, requests: 2, details: [record()] })]);
  assert.equal(summary.models[0].input_tokens, 2000); near(summary.models[0].fee?.min, .004032);
  assert.equal(summarizeModelUsage([run({ model: 'jev-1.13.0 + deepseek-flash', input_tokens: 2000, details: [record()] })]).unattributed, true);
});
test('零请求本机复用保留 ¥0，不让双模型的零用量记录影响已有费用', () => {
  const local = run({ model: 'jev-1.13.0 + deepseek-flash', input_tokens: 0, output_tokens: 0, requests: 0, details: [], local_targets: 10 });
  const summary = summarizeModelUsage([run(), local]);
  assert.equal(summary.unattributed, false); near(summary.models.find(x => x.kind === 'deepseek')?.fee?.min, .002016);
  const dsLocal = run({ input_tokens: 0, output_tokens: 0, requests: 0, started_at: undefined, finished_at: undefined });
  near(summarizeModelUsage([dsLocal]).models[0].fee?.min, 0);
});

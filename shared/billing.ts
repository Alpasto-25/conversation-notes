import { addUsage, uniqueAnalysisUsage, type AnalysisUsage, type TokenUsage } from './usage';

// Official CNY API prices checked on this date; estimates never represent an account debit.
export const DEEPSEEK_PRICE_DATE = '2026-10-06';
export const DEEPSEEK_PRICE_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
export const DEEPSEEK_RATES = {
  flash: { hit: 0.02, miss: 1, output: 4 },
  pro: { hit: 0.15, miss: 4.5, output: 13.5 },
} as const;
const PRICE_START = Date.parse('2026-09-10T04:00:00Z');
// State Council 2026 calendar: https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202511/t20251104_4258838.html
const HOLIDAYS_2026 = [['01-01', '01-03'], ['02-15', '02-23'], ['04-04', '04-06'], ['05-01', '05-05'],
  ['06-19', '06-21'], ['09-25', '09-27'], ['10-01', '10-07']];
type TimedUsage = TokenUsage & { started_at?: string; finished_at?: string };
export type FeeEstimate = { min: number; max: number; missingCache: boolean; uncertainTime: boolean };
export type ModelUsage = TokenUsage & {
  model: string; kind: 'deepseek' | 'jev' | 'other'; records: TimedUsage[]; fee?: FeeEstimate;
};
export function deepseekRate(model: string) {
  if (['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'deepseek-v4.1-flash'].includes(model)) return DEEPSEEK_RATES.flash;
  if (['deepseek-v4-pro', 'deepseek-v4-pro-0813'].includes(model)) return DEEPSEEK_RATES.pro;
  return undefined;
}
const tokenCount = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
export function cacheSplit(usage: TokenUsage) {
  const input = usage.input_tokens, hit = usage.prompt_cache_hit_tokens, miss = usage.prompt_cache_miss_tokens;
  if (!tokenCount(input)) return undefined;
  if (tokenCount(hit) && hit <= input && (miss === undefined || (tokenCount(miss) && hit + miss === input))) return { hit, miss: input - hit };
  if (hit === undefined && tokenCount(miss) && miss <= input) return { hit: input - miss, miss };
  return input === 0 ? { hit: 0, miss: 0 } : undefined;
}
// UTC arithmetic makes Beijing billing hours independent of the device's timezone.
function multiplierAt(at: number): [number, number] {
  const date = new Date(at + 8 * 60 * 60 * 1000), weekday = date.getUTCDay();
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  if (weekday === 0 || weekday === 6 || !((minute >= 540 && minute < 720) || (minute >= 840 && minute < 1080))) return [1, 1];
  if (date.getUTCFullYear() !== 2026) return [1, 2]; // Do not invent future holiday calendars.
  const day = date.toISOString().slice(5, 10);
  return HOLIDAYS_2026.some(([start, end]) => day >= start && day <= end) ? [1, 1] : [2, 2];
}
function timeMultipliers(record: TimedUsage): [number, number] | undefined {
  const start = Date.parse(record.started_at ?? ''), end = Date.parse(record.finished_at ?? '');
  if ((Number.isFinite(start) && start < PRICE_START) || (Number.isFinite(end) && end < PRICE_START)) return undefined;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 48 * 60 * 60 * 1000) return [1, 2];
  const samples = [multiplierAt(start), multiplierAt(end)];
  for (let at = (Math.floor(start / 3600000) + 1) * 3600000; at < end; at += 3600000) samples.push(multiplierAt(at));
  return [Math.min(...samples.map(x => x[0])), Math.max(...samples.map(x => x[1]))];
}
export function estimateDeepseekFee(model: string, records: TimedUsage[]): FeeEstimate | undefined {
  const rate = deepseekRate(model);
  if (!rate || !records.length) return undefined;
  const total: FeeEstimate = { min: 0, max: 0, missingCache: false, uncertainTime: false };
  for (const record of records) {
    if (!tokenCount(record.input_tokens) || !tokenCount(record.output_tokens)) return undefined;
    if (!record.input_tokens && !record.output_tokens) continue;
    const multipliers = timeMultipliers(record);
    if (!multipliers) return undefined; // Current rates do not claim to price old historical models.
    const split = cacheSplit(record);
    const inputMin = split ? split.hit * rate.hit + split.miss * rate.miss : record.input_tokens * rate.hit;
    const inputMax = split ? inputMin : record.input_tokens * rate.miss;
    total.min += (inputMin + record.output_tokens * rate.output) * multipliers[0] / 1_000_000;
    total.max += (inputMax + record.output_tokens * rate.output) * multipliers[1] / 1_000_000;
    total.missingCache ||= !split;
    total.uncertainTime ||= multipliers[0] !== multipliers[1];
  }
  return total;
}

export function summarizeModelUsage(values: (AnalysisUsage | undefined)[]) {
  const models = new Map<string, ModelUsage>();
  let unattributed = false;
  const kind = (model: string): ModelUsage['kind'] => model.startsWith('deepseek-') ? 'deepseek' : /jev/i.test(model) ? 'jev' : 'other';
  function add(model: string, record: TimedUsage) {
    const split = cacheSplit(record);
    const normalized = { ...record, prompt_cache_hit_tokens: split?.hit, prompt_cache_miss_tokens: split?.miss };
    const old = models.get(model);
    const totals = old?.records.length ? addUsage(old, normalized) : normalized;
    models.set(model, { ...totals, details: undefined, model, kind: kind(model), records: [...(old?.records ?? []), normalized] });
  }
  for (const run of uniqueAnalysisUsage(values)) {
    const runModels = run.model?.split(' + ') ?? [];
    for (const model of runModels) if (!models.has(model)) models.set(model, { model, kind: kind(model), input_tokens: 0, output_tokens: 0, records: [] });
    const details = run.details ?? [];
    for (const detail of details) add(detail.model, detail);
    const covered = details.reduce((sum, d) => ({ input: sum.input + d.input_tokens, output: sum.output + d.output_tokens }), { input: 0, output: 0 });
    if ((!details.length && (runModels.length === 1 || run.input_tokens || run.output_tokens)) || covered.input !== run.input_tokens || covered.output !== run.output_tokens) {
      if (runModels.length !== 1 || covered.input > run.input_tokens || covered.output > run.output_tokens) { unattributed = true; continue; }
      const sumCache = (key: 'prompt_cache_hit_tokens' | 'prompt_cache_miss_tokens') =>
        run[key] !== undefined && details.every(d => d[key] !== undefined) ? run[key]! - details.reduce((sum, d) => sum + d[key]!, 0) : undefined;
      add(runModels[0], { input_tokens: run.input_tokens - covered.input, output_tokens: run.output_tokens - covered.output,
        prompt_cache_hit_tokens: sumCache('prompt_cache_hit_tokens'), prompt_cache_miss_tokens: sumCache('prompt_cache_miss_tokens'),
        requests: run.requests !== undefined && details.every(d => d.requests !== undefined) ? run.requests - details.reduce((sum, d) => sum + d.requests!, 0) : undefined,
        started_at: run.started_at, finished_at: run.finished_at });
    }
  }
  return { models: [...models.values()].map(model => ({ ...model,
    fee: model.kind === 'deepseek' && !unattributed ? estimateDeepseekFee(model.model, model.records) : undefined })), unattributed };
}

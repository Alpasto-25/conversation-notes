// One source of truth for platform ids and the names users see. Never map an
// unknown id to a real platform: a wrong name hides which service failed.
export const PROVIDER_NAMES: Record<string, string> = {
  typesafe: 'TypeSafe',
  vercel: 'Vercel AI Gateway',
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
};
export function providerName(value?: string) {
  const id = (value || '').trim().toLowerCase();
  return PROVIDER_NAMES[id] || (value || '').trim();
}
export function providerLabel(value?: string) {
  return providerName(value) || '未选择平台';
}
export const MODEL_OPTIONS = [
  { provider: 'typesafe', model: 'jev-1.13.0', label: 'Jev · TypeSafe' },
  { provider: 'vercel', model: 'typesafe-ai/jev', label: 'Jev · Vercel' },
  { provider: 'openrouter', model: 'typesafe/jev-1.13', label: 'Jev · OpenRouter' },
  { provider: 'deepseek', model: 'deepseek-flash', label: 'DeepSeek Flash' },
] as const;
export type ModelProvider = typeof MODEL_OPTIONS[number]['provider'];
export function defaultModel(provider: string) {
  return MODEL_OPTIONS.find(option => option.provider === provider)?.model || '';
}
export function supportsModel(provider: string, model: string) {
  return MODEL_OPTIONS.some(option => option.provider === provider && option.model === model);
}
export function normalizeModel(provider: string, model: string) {
  return provider === 'deepseek' && model === 'deepseek-v4-pro' ? defaultModel(provider) : model || defaultModel(provider);
}
export const MODEL_DIFFERENCES = '切换模型仅影响后续分析。已有结果保留；速度、判断和费用因模型而异。';

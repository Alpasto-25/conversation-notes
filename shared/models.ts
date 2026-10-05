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

export const MODEL_OPTIONS = [
  { provider: 'typesafe', model: 'jev-1.13.0', label: 'Jev · TypeSafe' },
  { provider: 'vercel', model: 'typesafe-ai/jev', label: 'Jev · Vercel' },
  { provider: 'openrouter', model: 'typesafe/jev-1.13', label: 'Jev · OpenRouter' },
  { provider: 'deepseek', model: 'deepseek-flash', label: 'DeepSeek Flash' },
  { provider: 'deepseek', model: 'deepseek-v4-pro', label: 'DeepSeek Pro' },
] as const;
export type ModelProvider = typeof MODEL_OPTIONS[number]['provider'];
export function defaultModel(provider: string) {
  return MODEL_OPTIONS.find(option => option.provider === provider)?.model || '';
}
export function supportsModel(provider: string, model: string) {
  return MODEL_OPTIONS.some(option => option.provider === provider && option.model === model);
}
export const MODEL_DIFFERENCES = '不同模型的响应速度、分析结果和费用会有差异，实际耗时也受网络与供应商负载影响。切换只用于后续分析，已有结果保留，不会自动重新分析或消耗额度。';

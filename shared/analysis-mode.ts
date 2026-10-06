export type AnalysisConfiguration = {
  configured: boolean; provider?: string; model?: string; error?: string;
  profiles?: { provider: string; model: string; configured: boolean }[];
  semantics?: { configured: boolean; model?: string };
};
export function semanticConfiguration(status: AnalysisConfiguration | null) {
  if (status?.semantics) return status.semantics;
  return status?.profiles?.find(p => p.provider === 'deepseek') ?? {
    configured: status?.configured === true && status.provider === 'deepseek',
    model: status?.provider === 'deepseek' ? status.model : 'deepseek-flash',
  };
}
export type SemanticMode = 'deepseek' | 'jev-deepseek';
export function analysisMode(status: AnalysisConfiguration, enabled: boolean, preference?: SemanticMode) {
  const deepseek = semanticConfiguration(status);
  const jev = status.configured && ['typesafe', 'vercel', 'openrouter'].includes(status.provider ?? '')
    ? { configured: true, provider: status.provider!, model: status.model! }
    : status.profiles?.find(p => p.configured && ['typesafe', 'vercel', 'openrouter'].includes(p.provider));
  const selectedMode = preference ?? (jev ? 'jev-deepseek' : 'deepseek');
  const judge = enabled && deepseek.configured && selectedMode === 'jev-deepseek' ? jev : undefined;
  const primary = judge ?? (enabled && deepseek.configured ? { configured: true, provider: 'deepseek', model: deepseek.model } : status);
  const error = !enabled ? '' : !deepseek.configured
    ? '请先在 API 配置中保存 DeepSeek 配置。'
    : selectedMode === 'jev-deepseek' && !jev ? 'Jev + DeepSeek 需要先配置 Jev；也可选择仅 DeepSeek。' : '';
  return { primary: error ? { ...primary, configured: false } : primary, deepseek, judge, selectedMode, error };
}
export const SEMANTIC_MODE_PREFERENCE = 'conversation-notes-semantic-mode-v1';
export function readSemanticModePreference(storage?: Pick<Storage, 'getItem'>): SemanticMode | undefined {
  try {
    const value = storage?.getItem(SEMANTIC_MODE_PREFERENCE);
    return value === 'deepseek' || value === 'jev-deepseek' ? value : undefined;
  } catch { return undefined; }
}
export const SEMANTIC_PREFERENCE = 'conversation-notes-semantics-enabled-v1';
export function readSemanticPreference(storage?: Pick<Storage, 'getItem'>) {
  try { return storage?.getItem(SEMANTIC_PREFERENCE) === 'on'; } catch { return false; }
}

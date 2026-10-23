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
export type SemanticMode = 'deepseek' | 'jev-deepseek' | 'openai-deepseek';
const isOpenAI = (model?: string) => model === 'openai/gpt-6-luna-decisions';
export function judgmentSelection(status: AnalysisConfiguration | null, mode: SemanticMode) {
  if (mode === 'openai-deepseek') return { provider: 'openrouter', model: 'openai/gpt-6-luna-decisions' };
  if (mode === 'deepseek') return { provider: 'deepseek', model: 'deepseek-flash' };
  const candidates = [status, ...(status?.profiles ?? [])];
  const jev = candidates.find(p => p?.configured && ['typesafe', 'vercel', 'openrouter'].includes(p.provider ?? '') && !isOpenAI(p.model));
  return jev ? { provider: jev.provider!, model: jev.model! }
    : candidates.some(p => p?.configured && p.provider === 'openrouter') ? { provider: 'openrouter', model: 'typesafe/jev-1.13' }
    : { provider: 'typesafe', model: 'jev-1.13.0' };
}
export function analysisMode(status: AnalysisConfiguration, enabled: boolean, preference?: SemanticMode) {
  const deepseek = semanticConfiguration(status);
  const candidates = [status, ...(status.profiles ?? [])];
  const decision = candidates.find(p => p.configured && ['typesafe', 'vercel', 'openrouter'].includes(p.provider ?? ''));
  const selectedMode = preference ?? (decision ? isOpenAI(decision.model) ? 'openai-deepseek' : 'jev-deepseek' : 'deepseek');
  const selected = judgmentSelection(status, selectedMode);
  const available = candidates.find(p => p.configured && p.provider === selected.provider && p.model === selected.model);
  const judge = enabled && deepseek.configured && selectedMode !== 'deepseek' && available
    ? { configured: true, provider: selected.provider, model: selected.model } : undefined;
  const primary = judge ?? (enabled && deepseek.configured ? { configured: true, provider: 'deepseek', model: deepseek.model } : status);
  const error = !enabled ? '' : !deepseek.configured
    ? '请先在 API 配置中保存 DeepSeek 配置。'
    : selectedMode !== 'deepseek' && !available ? `${selectedMode === 'openai-deepseek' ? 'OpenAI + DeepSeek 需要先配置 OpenAI Decisions' : 'Jev + DeepSeek 需要先配置 Jev'}；也可选择仅 DeepSeek。` : '';
  return { primary: error ? { ...primary, configured: false } : primary, deepseek, judge, selectedMode, error };
}
export const SEMANTIC_MODE_PREFERENCE = 'conversation-notes-semantic-mode-v2';
export function readSemanticModePreference(storage?: Pick<Storage, 'getItem'>): SemanticMode | undefined {
  try {
    const value = storage?.getItem(SEMANTIC_MODE_PREFERENCE);
    if (value === 'deepseek' || value === 'jev-deepseek' || value === 'openai-deepseek') return value;
    // The old dual-mode value also represented OpenAI. Infer its judge from saved configuration.
    return storage?.getItem('conversation-notes-semantic-mode-v1') === 'deepseek' ? 'deepseek' : undefined;
  } catch { return undefined; }
}
export const SEMANTIC_PREFERENCE = 'conversation-notes-semantics-enabled-v1';
export function readSemanticPreference(storage?: Pick<Storage, 'getItem'>) {
  try { return storage?.getItem(SEMANTIC_PREFERENCE) === 'on'; } catch { return false; }
}

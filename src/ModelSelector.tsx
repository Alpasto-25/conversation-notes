import { useEffect, useState } from 'react';
import { ToggleSelect } from './ToggleSelect';
import { MODEL_OPTIONS, defaultModel, supportsModel } from '../shared/models';
import { saveMobileConfig, type ApiStatus } from './platform';

export type ModelSelection = { provider: string; model: string };
export function ModelSelector({ status, disabled, changed, configure, notice, pendingChanged, field = false }: {
  status: ApiStatus | null; disabled: boolean; changed: (value: ApiStatus) => void;
  configure: (selection: ModelSelection) => void; notice: (text: string) => void;
  pendingChanged?: (pending: boolean) => void; field?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  useEffect(() => { pendingChanged?.(saving); return () => pendingChanged?.(false); }, [saving, pendingChanged]);
  const provider = status?.provider || 'typesafe';
  const model = supportsModel(provider, status?.model || '') ? status!.model! : defaultModel(provider);
  async function select(value: string) {
    const option = MODEL_OPTIONS.find(item => `${item.provider}:${item.model}` === value);
    if (!option) return;
    const configured = status?.profiles?.find(item => item.provider === option.provider)?.configured
      || (status?.configured && status.provider === option.provider);
    if (!configured) { configure(option); return; }
    setSaving(true);
    try {
      changed(await saveMobileConfig(option.provider, '', option.model));
      notice(`已切换为 ${option.label}，已有分析保留。`);
    } catch (error) { notice(error instanceof Error ? error.message : '模型切换失败，请重试。'); }
    finally { setSaving(false); }
  }
  return <label className={field ? "field import-model-control" : "scene-control model-control"}><span>{field ? "本次分析模型" : "模型"}</span>
    <ToggleSelect className={field ? "" : "scene-select model-select"} aria-label={field ? "本次分析模型" : "分析模型"} value={`${provider}:${model}`}
      disabled={disabled || saving || !status} onChange={value => void select(value)}>
      {MODEL_OPTIONS.map(option => <option key={`${option.provider}:${option.model}`} value={`${option.provider}:${option.model}`}>{option.label}</option>)}
    </ToggleSelect>
  </label>;
}

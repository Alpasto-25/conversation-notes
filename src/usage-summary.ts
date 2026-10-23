import { summarizeModelUsage } from '../shared/billing';
import type { AnalysisUsage } from '../shared/usage';
import { usagePurpose } from './analysis-history';

export const purposeName = (run: AnalysisUsage) => ({ basic: '基础分析', supplement: '策略与潜台词', screenshot: '截图识别' })[usagePurpose(run)];
export function modelName(model: string) {
  return /gpt-.*decisions/.test(model) ? 'OpenAI Decisions' : /gpt-/.test(model) ? 'OpenAI 视觉'
    : /deepseek.*flash/.test(model) ? 'DeepSeek Flash' : /deepseek/i.test(model) ? 'DeepSeek' : /jev/i.test(model) ? 'Jev' : model || '未记录模型';
}
export function runState(run: AnalysisUsage) {
  return run.status === 'partial' ? '未完成' : run.status === 'paused' ? '已暂停' : !run.finished_at ? '未完成' : run.unreported_batches ? '用量不完整' : '已完成';
}
export const formatDuration = (ms: number | undefined) => ms === undefined ? '耗时未记录' : `${(ms / 1000).toFixed(1)} 秒`;
const amount = (value: number) => value.toLocaleString('zh-CN', { maximumSignificantDigits: 4 });
export function runModelSummary(run: AnalysisUsage, runs = [run]) {
  const { models, unattributed } = summarizeModelUsage(runs);
  const allDetails = runs.flatMap(r => r.details ?? []);
  const active = models.filter(m => m.records.length).sort((a, b) => allDetails.findIndex(d => d.model === a.model) - allDetails.findIndex(d => d.model === b.model));
  return (active.length ? active : models).map(m => {
    const details = allDetails.filter(d => d.model === m.model);
    const elapsed = details.length ? details.reduce((sum, d) => sum + d.elapsed_ms, 0) : active.length === 1 || models.length === 1 ? run.elapsed_ms : undefined;
    const local = run.requests === 0 && !run.unreported_batches;
    let cost = local ? '0 · 本机复用' : '费用未提供';
    if (!local && m.cost_usd !== undefined) cost = `$${amount(m.cost_usd)}`;
    else if (!local && m.fee) cost = Math.abs(m.fee.min - m.fee.max) < 1e-10 ? `约 ¥${amount(m.fee.max)}` : `约 ¥${amount(m.fee.min)}–${amount(m.fee.max)}`;
    if (run.unreported_batches && cost !== '费用未提供') cost += '（已知部分）';
    return { ...m, name: modelName(m.model), elapsed, cost, unattributed };
  });
}

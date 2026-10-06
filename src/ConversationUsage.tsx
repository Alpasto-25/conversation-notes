import type { AnalysisUsage as UsageStats } from '../shared/usage';
import { combineAnalysisUsage, uniqueAnalysisUsage } from '../shared/usage';
import { AnalysisUsage } from './AnalysisUsage';
import { ChevronRight } from 'lucide-react';

export function ConversationUsage({ primary, semantic, failed, primaryRestored, semanticRestored }: {
  primary?: UsageStats; semantic?: UsageStats; failed?: UsageStats; primaryRestored: boolean; semanticRestored: boolean;
}) {
  const runs = uniqueAnalysisUsage([primary, semantic]);
  const combined = combineAnalysisUsage(runs);
  const restored = (!primary || primaryRestored) && (!semantic || semanticRestored);
  const separateFailure = failed && !runs.some(run => failed === run || (failed.run_id && failed.run_id === run.run_id));
  return <>
    {combined && <AnalysisUsage usage={combined} runs={runs} restored={restored} combined />}
    {separateFailure && <details className="usage-history">
      <summary><ChevronRight size={16} aria-hidden="true" />上次未完成分析</summary>
      <p>单独统计，未计入上方合计。</p>
      <AnalysisUsage usage={failed} restored />
    </details>}
  </>;
}

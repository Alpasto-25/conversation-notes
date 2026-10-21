import { useEffect, useState } from 'react';
import { combineAnalysisUsage, type AnalysisUsage as Usage } from '../shared/usage';
import { billingMonth, mergeRunHistory } from './analysis-history';
import { notebookStore } from './storage';
import { AnalysisUsage } from './AnalysisUsage';
import { ToggleSelect } from './ToggleSelect';

export function UsageHistory({ runs }: { runs: Usage[] }) {
  const [scope, setScope] = useState('current'), [month, setMonth] = useState('all'), [all, setAll] = useState<Usage[]>([]), [error, setError] = useState('');
  useEffect(() => {
    if (scope !== 'all') return;
    let live = true;
    void notebookStore.exportAll().then(notes => {
      if (live) setAll(notes.reduce<Usage[]>((history, n) => mergeRunHistory(history, ...(n.runHistory ?? []), n.conversation.analysisUsage, n.conversation.semanticUsage, n.conversation.failedAnalysisUsage,
        ...Object.values(n.scenes).flatMap(c => [c.analysisUsage, c.semanticUsage, c.failedAnalysisUsage])), []));
    }).catch(() => { if (live) setError('历史用量读取失败。'); });
    return () => { live = false; };
  }, [scope]);
  const history = scope === 'all' ? mergeRunHistory(all, ...runs) : runs;
  const months = [...new Set(history.map(billingMonth))].sort().reverse();
  const selected = history.filter(r => month === 'all' || billingMonth(r) === month), combined = combineAnalysisUsage(selected);
  return <section aria-label="历史用量账本"><h3>历史用量</h3>
    <p>按本机保留的运行记录汇总，恢复旧结果不会清除记录。旧版本未保留的历史无法补算，未返回的用量不按零计算。</p>
    <label className="field">统计范围<ToggleSelect aria-label="用量统计范围" value={scope} onChange={v => { setScope(v); setMonth('all'); }}><option value="current">这份手记的全部场景</option><option value="all">全部手记（含回收站）</option></ToggleSelect></label>
    <label className="field">月份（北京时间）<ToggleSelect aria-label="用量月份" value={month} onChange={setMonth}><option value="all">全部日期</option>{months.map(m => <option key={m}>{m}</option>)}</ToggleSelect></label>
    <p>{selected.length} 次已保留运行记录。</p>
    {combined ? <AnalysisUsage usage={combined} runs={selected} description="所选范围内已保留的历史用量。" /> : <p>当前范围没有已保留用量。</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

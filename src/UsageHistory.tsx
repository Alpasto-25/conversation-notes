import { useEffect, useState } from 'react';
import type { AnalysisUsage as Usage } from '../shared/usage';
import { mergeRunHistory, usagePurpose, versionUsage, type AnalysisVersion } from './analysis-history';
import { notebookStore } from './storage';
import { AnalysisUsage } from './AnalysisUsage';
import { ToggleSelect } from './ToggleSelect';
import { purposeName, runState } from './usage-summary';

export function UsageHistory({ runs, versions, deletedIds = [], viewResult }: { runs: Usage[]; versions: AnalysisVersion[]; deletedIds?: string[]; viewResult: (id: string, notebookId?: string) => void }) {
  const [kind, setKind] = useState('all'), [query, setQuery] = useState('');
  const [scope, setScope] = useState('current'), [all, setAll] = useState<Usage[]>([]), [error, setError] = useState('');
  const [owners, setOwners] = useState<Record<string, { id: string; title: string; deleted: boolean; versions: AnalysisVersion[]; deletedIds: string[] }>>({});
  useEffect(() => {
    if (scope !== 'all') return;
    let live = true; setError('');
    void notebookStore.exportAll().then(notes => {
      if (live) setOwners(Object.fromEntries(notes.flatMap(n => mergeRunHistory(n.runHistory, n.conversation.analysisUsage, n.conversation.semanticUsage, n.conversation.failedAnalysisUsage,
        ...Object.values(n.scenes).flatMap(c => [c.analysisUsage, c.semanticUsage, c.failedAnalysisUsage])).filter(r => r.run_id)
        .map(r => [r.run_id!, { id: n.id, title: n.title, deleted: !!n.deletedAt, versions: n.versions ?? [], deletedIds: n.deletedAnalysisVersions ?? [] }]))));
      if (live) setAll(notes.reduce<Usage[]>((history, n) => mergeRunHistory(history, ...(n.runHistory ?? []), n.conversation.analysisUsage, n.conversation.semanticUsage, n.conversation.failedAnalysisUsage,
        ...Object.values(n.scenes).flatMap(c => [c.analysisUsage, c.semanticUsage, c.failedAnalysisUsage])), []));
    }).catch(() => { if (live) setError('历史用量读取失败。'); });
    return () => { live = false; };
  }, [scope]);
  const history = mergeRunHistory(scope === 'all' ? all : [], ...runs);
  const selected = history.filter(r => (kind === 'all' || usagePurpose(r) === kind)
    && `${r.model || ''} ${r.started_at || ''} ${r.started_at ? new Date(r.started_at).toLocaleString('zh-CN', { hour12: false }) : ''} ${purposeName(r)} ${scope === 'all' ? owners[r.run_id || '']?.title || '' : ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
  return <section aria-label="每次分析用量">
    <p>每次分析单独记录，最新的在前。费用按模型和币种分别展示。</p>
    <div className="records-filters">
      <label className="field">范围<ToggleSelect aria-label="用量统计范围" value={scope} onChange={setScope}><option value="current">当前手记</option><option value="all">全部手记（含回收站）</option></ToggleSelect></label>
      <label className="field">类型<ToggleSelect aria-label="用量类型" value={kind} onChange={setKind}><option value="all">全部类型</option><option value="basic">基础分析</option><option value="supplement">策略与潜台词</option><option value="screenshot">截图识别</option></ToggleSelect></label>
    </div>
    <input className="records-search" aria-label="搜索用量记录" placeholder="搜索日期或模型" value={query} onChange={e => setQuery(e.target.value)} />
    {selected.map((run, i) => {
      const owner = scope === 'all' ? owners[run.run_id || ''] : undefined;
      const local = versions.find(v => run.run_id && (v.runId === run.run_id || versionUsage(v)?.run_id === run.run_id));
      const version = local || (!owner?.deleted && owner?.versions.find(v => v.runId === run.run_id || versionUsage(v)?.run_id === run.run_id));
      const removed = run.run_id && (deletedIds.includes(run.run_id) || owner?.deletedIds.includes(run.run_id));
      return <article className="analysis-record" key={run.run_id || `legacy-${i}`}>
        <header><strong>{purposeName(run)}</strong><span>{runState(run)}</span></header>
        <p className="record-date">{run.started_at ? new Date(run.started_at).toLocaleString('zh-CN', { hour12: false }) : '未记录时间'}</p>
        {owner && <p className="record-help">{owner.title}{owner.deleted ? ' · 回收站' : ''}</p>}
        <AnalysisUsage usage={run} restored />
        {version ? <button className="text-button" onClick={() => viewResult(version.id, local ? undefined : owner?.id)}>查看这次结果</button>
          : usagePurpose(run) !== 'screenshot' && <p className="record-help">{removed ? '这次结果已删除，用量记录保留。' : scope === 'all' ? '请在对应手记中查看结果。' : '这次仅保留了用量，未保存可查看的结果。'}</p>}
      </article>;
    })}
    {!selected.length && <p>没有符合条件的记录。</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

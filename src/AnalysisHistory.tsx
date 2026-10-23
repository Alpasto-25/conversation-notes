import { useState } from 'react';
import { canRestoreVersion, versionUsage, type AnalysisVersion } from './analysis-history';
import type { SavedConversation } from './storage';
import { RELATIONS, STAGES, ACTIONS } from '../shared/types';
import { AnalysisUsage } from './AnalysisUsage';
import { ChatMessage } from './ChatMessage';
import { ToggleSelect } from './ToggleSelect';
import { modelName, purposeName, runState } from './usage-summary';
import { Trash2 } from 'lucide-react';

const versionDate = (version: AnalysisVersion) => new Date(versionUsage(version)?.started_at || version.at).toLocaleString('zh-CN', { hour12: false });

export function AnalysisHistory({ versions, current, restore, openCopy, remove, initialId, locked = false }: { versions: AnalysisVersion[]; current: SavedConversation; restore: (id: string) => Promise<unknown>; openCopy: (id: string) => Promise<unknown>; remove: (id: string) => Promise<unknown>; initialId?: string; locked?: boolean }) {
  const ordered = [...versions].sort((a, b) => b.at.localeCompare(a.at));
  const [selected, setSelected] = useState(initialId || ordered[0]?.id || ''), [query, setQuery] = useState(''), [model, setModel] = useState('all');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [messageQuery, setMessageQuery] = useState(''), [limit, setLimit] = useState(40);
  const [deleting, setDeleting] = useState<AnalysisVersion | null>(null), [notice, setNotice] = useState('');
  const models = [...new Set(ordered.flatMap(v => versionUsage(v)?.model?.split(' + ') || v.conversation.analysisIdentity?.model || []))];
  const filtered = ordered.filter(v => {
    const run = versionUsage(v), name = run?.model || v.conversation.analysisIdentity?.model || '';
    return (model === 'all' || name.split(' + ').includes(model))
      && `${v.at} ${versionDate(v)} ${name} ${v.label} ${RELATIONS[v.conversation.relation]}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  const version = filtered.find(v => v.id === selected) || filtered[0], previous = version?.conversation, run = version && versionUsage(version);
  const visibleMessages = previous?.messages.filter(m => `${m.text} ${previous.lines[m.id]?.subtext || ''}`.includes(messageQuery.trim())) ?? [];
  return <section className="analysis-history" aria-label="结果历史">
    <p>每次分析结束后自动保存。查看与恢复均在本机完成，不调用模型。</p>
    {!versions.length ? <p>尚无保存的结果。完成一次分析后，会在这里按时间和模型列出。</p> : <>
      <div className="records-filters">
        <label className="field">模型<ToggleSelect aria-label="筛选结果模型" value={model} onChange={value => { setModel(value); setDeleting(null); }}><option value="all">全部模型</option>{models.map(m => <option key={m} value={m}>{modelName(m)} · {m}</option>)}</ToggleSelect></label>
        <label className="field">搜索<input aria-label="搜索结果历史" placeholder="日期、场景或模型" value={query} onChange={e => { setQuery(e.target.value); setDeleting(null); }} /></label>
      </div>
      <label className="field">分析记录<ToggleSelect aria-label="选择历史分析版本" title={version ? `${versionDate(version)} · ${run?.model || version.label}` : undefined} value={version?.id || ''} onChange={id => { setSelected(id); setLimit(40); setMessageQuery(''); setDeleting(null); }}>
        {!filtered.length && <option value="">没有符合条件的结果</option>}
        {filtered.map(v => { const u = versionUsage(v); return <option value={v.id} key={v.id}>{versionDate(v)} · {u ? purposeName(u) : v.label} · {modelName(u?.model || v.conversation.analysisIdentity?.model || '')}</option>; })}
      </ToggleSelect></label>
      {version && previous && <>
        <div className="analysis-record">
          <header><strong>{run ? purposeName(run) : version.label}</strong><span>{run ? runState(run) : previous.completed ? '已完成' : '部分结果'}</span></header>
          <p>{versionDate(version)} · {RELATIONS[previous.relation]} · {previous.messages.length} 条消息</p>
          {run && <AnalysisUsage usage={run} restored />}
          {!canRestoreVersion(current, previous) && <p>原文、身份、规则或场景已变化，仍可浏览这份完整结果。</p>}
          {locked && <p>当前分析结束后可恢复或打开副本。</p>}
          <div className="record-actions"><button className="primary" disabled={busy || locked || !canRestoreVersion(current, previous)} onClick={async () => {
            setBusy(true); setError(''); try { await restore(version.id); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
          }}>恢复这次分析结果</button>
          <button className="secondary" disabled={busy || locked} onClick={async () => { setBusy(true); setError(''); try { await openCopy(version.id); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>以副本打开</button>
          <button className="secondary danger" disabled={busy || locked} onClick={() => { setError(''); setNotice(''); setDeleting(version); }}><Trash2 size={18} strokeWidth={1.8} aria-hidden="true" />删除历史结果</button></div>
          {deleting && <div className="record-delete-confirm" role="group" aria-label="确认删除历史分析结果">
            <p>删除 {versionDate(deleting)} · {versionUsage(deleting) ? purposeName(versionUsage(deleting)!) : deleting.label} 的历史结果？</p>
            <p>删除后无法从结果历史恢复。当前聊天、当前分析和已发生的用量记录会保留。</p>
            <div className="record-actions"><button className="secondary" disabled={busy} onClick={() => setDeleting(null)}>取消删除</button>
              <button className="primary danger" disabled={busy || locked} onClick={async () => {
                setBusy(true); setError('');
                try { await remove(deleting.id); setSelected(ordered.find(v => v.id !== deleting.id)?.id || ''); setDeleting(null); setMessageQuery(''); setLimit(40); setNotice('历史结果已删除，当前聊天和用量记录已保留。'); }
                catch (e) { setError((e as Error).message); }
                finally { setBusy(false); }
              }}>确认删除历史结果</button></div>
          </div>}
        </div>
        <h3>保存的分析结果</h3>
        {previous.overview && <div className="history-overview"><strong>沟通评分 {previous.overview.affinity.value ?? '—'} / 100</strong>
          <p>{STAGES[previous.overview.stage] || previous.overview.stage} · 下一步：{ACTIONS[previous.overview.action]?.label || previous.overview.action}</p>
        </div>}
        <input className="records-search" aria-label="搜索历史消息" placeholder="查找原文或潜台词" value={messageQuery} onChange={e => { setMessageQuery(e.target.value); setLimit(40); }} />
        <div className="history-results" aria-label="历史聊天分析结果">
          {visibleMessages.slice(0, limit).map((message, i) => <div key={message.id} className={`message ${message.sender === 'self' ? 'self' : ''}`}>
            <ChatMessage message={message} result={previous.lines[message.id]} self={previous.self} other={previous.other} showTime={i === 0 || message.timestamp !== visibleMessages[i - 1].timestamp} />
          </div>)}
          {!visibleMessages.length && <p>没有符合条件的消息。</p>}
          {visibleMessages.length > limit && <button className="secondary" onClick={() => setLimit(n => n + 40)}>继续显示 · 还有 {visibleMessages.length - limit} 条</button>}
        </div>
      </>}
    </>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

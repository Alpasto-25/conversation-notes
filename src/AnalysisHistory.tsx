import { useState } from 'react';
import { canRestoreVersion, type AnalysisVersion } from './analysis-history';
import type { SavedConversation } from './storage';
import { ToggleSelect } from './ToggleSelect';

export function AnalysisHistory({ versions, current, restore }: { versions: AnalysisVersion[]; current: SavedConversation; restore: (id: string) => Promise<unknown> }) {
  const [selected, setSelected] = useState(versions.at(-1)?.id || ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const version = versions.find(v => v.id === selected), previous = version?.conversation;
  const changed = previous ? current.messages.filter(m => JSON.stringify(current.lines[m.id]) !== JSON.stringify(previous.lines[m.id])) : [];
  return <section aria-label="分析版本历史">
    <p>重算前的结果保存在本机。恢复分析版本不会调用模型，也不会减少已经发生的历史用量。</p>
    {!versions.length ? <p>尚无历史版本。下次分析前会自动保留当前结果。</p> : <>
      <label className="field">历史版本<ToggleSelect aria-label="选择历史分析版本" value={selected} onChange={setSelected}>
        {[...versions].reverse().map(v => <option value={v.id} key={v.id}>{new Date(v.at).toLocaleString('zh-CN')} · {v.label}</option>)}
      </ToggleSelect></label>
      {version && previous && <>
        <p>场景 {previous.relation} · {previous.messages.length} 条消息 · 模型 {previous.analysisIdentity?.model || '未记录'}。</p>
        <p>沟通评分：当前 {current.overview?.affinity.value ?? '—'}，此版本 {previous.overview?.affinity.value ?? '—'}。有 {changed.length} 条逐句结果不同。</p>
        <div className="history-differences">{changed.slice(0, 20).map(m => <div key={m.id}><blockquote>{m.text}</blockquote>
          <p>当前：{current.lines[m.id]?.subtext || (current.lines[m.id]?.score.value ?? '无结果')}</p><p>此版本：{previous.lines[m.id]?.subtext || (previous.lines[m.id]?.score.value ?? '无结果')}</p></div>)}</div>
        {!canRestoreVersion(current, previous) && <p>原文、身份、规则或场景已变化，此版本仅供查看，不能套用。</p>}
        <button className="primary" disabled={busy || !canRestoreVersion(current, previous)} onClick={async () => {
          setBusy(true); setError(''); try { await restore(version.id); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>恢复此版本的分析</button>
      </>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

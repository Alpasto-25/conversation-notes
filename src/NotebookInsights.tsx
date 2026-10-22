import { useState } from 'react';
import type { Notebook } from './notebooks';
import { candidateFollowups, FOLLOWUP_LABELS, type Followup, type PersonalNotes } from './personal-notes';
import { ToggleSelect } from './ToggleSelect';
export function NotebookInsights({ note, save, locate }: { note: Notebook; save: (value: PersonalNotes) => Promise<unknown>; locate: (id: string) => void }) {
  const [annotation, setAnnotation] = useState(note.annotation || ''), [pinned, setPinned] = useState(!!note.pinned), [tags, setTags] = useState((note.tags ?? []).join('，'));
  const [followups, setFollowups] = useState(note.followups ?? {}), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const candidates = candidateFollowups(note);
  function update(id: string, changes: Partial<Followup>) {
    const previous = followups[id] ?? { status: 'open' as const, note: '', at: '' };
    setFollowups({ ...followups, [id]: { ...previous, ...changes, at: new Date().toISOString() } });
  }
  return <section className="notebook-insights" aria-label="我的手记与待跟进">
    <label className="insight-toggle"><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /> 在文件夹内置顶</label>
    <label className="field">标签（用逗号分隔）<input aria-label="手记标签" value={tags} onChange={e => setTags(e.target.value)} /></label>
    <label className="field">我的备注与实际结果<textarea aria-label="我的手记备注" maxLength={20000} value={annotation} onChange={e => setAnnotation(e.target.value)} placeholder="我如何理解、采用了什么建议、后来发生了什么…" /></label>
    <h3>收藏的原话</h3>
    <div className="insight-favorites">
      {note.conversation.messages.filter(m => note.favorites?.includes(m.id)).map(m => <button className="search-result" key={m.id} onClick={() => locate(m.id)}>{m.text}</button>)}
    </div>
    <h3>候选待跟进</h3>
    <p className="insight-note">来自模型提取，请结合原话确认。人工处理状态单独保存，不改写模型事件和历史证据。</p>
    {!candidates.length && <p className="insight-note">当前没有已提取的候选事项。</p>}
    <div className="insight-followups">
      {candidates.map(({ event, message }) => <div className="followup-item" key={event.id}>
        <div className="followup-head">
          <strong>{FOLLOWUP_LABELS[event.kind as keyof typeof FOLLOWUP_LABELS]}</strong>
          <span className="followup-state">模型状态：{event.status === 'resolved' ? '已找到后续解决依据' : event.status === 'uncertain' ? '不确定' : '尚待确认'}</span>
        </div>
        <blockquote>{message.text}</blockquote>
        <label className="field">我的处理状态<ToggleSelect aria-label={`跟进状态：${message.id}`} value={followups[event.id]?.status || 'open'} onChange={status => update(event.id, { status: status as Followup['status'] })}>
          <option value="open">待确认或待处理</option><option value="done">我已处理</option><option value="ignored">我选择忽略</option>
        </ToggleSelect></label>
        <label className="field">处理记录<input maxLength={2000} value={followups[event.id]?.note || ''} onChange={e => update(event.id, { note: e.target.value })} /></label>
        <button className="text-button followup-locate" onClick={() => locate(message.id)}>定位原话</button>
      </div>)}
    </div>
    <button className="primary insight-save" disabled={busy} onClick={async () => { setBusy(true); try { await save({ annotation, pinned, tags: tags.split(/[,，]/), followups }); setNotice('备注、标签和人工处理状态已保存。'); } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); } }}>保存我的手记</button>
    <p role="status">{notice}</p>
  </section>;
}

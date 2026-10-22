import { useEffect, useRef, useState } from 'react';
import { notebookStore } from './storage';
import { RELATIONS } from '../shared/types';
import type { MessageHit, SearchFilter } from './message-search';
import { ToggleSelect } from './ToggleSelect';

export function MessageSearch({ initialQuery, notebookId, open }: {
  initialQuery: string; notebookId?: string; open: (hit: MessageHit, hits: MessageHit[], query: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery), [sender, setSender] = useState<SearchFilter['sender']>('');
  const [favorites, setFavorites] = useState(false);
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [hits, setHits] = useState<MessageHit[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const revision = useRef(0);
  useEffect(() => {
    const current = ++revision.current; setBusy(true); setError('');
    const timer = setTimeout(() => {
      void notebookStore.searchMessages(query, { notebookId, sender, from, to, favorites }).then(found => {
        if (current === revision.current) setHits(found);
      }).catch(() => { if (current === revision.current) setError('搜索读取失败，请重试。'); })
        .finally(() => { if (current === revision.current) setBusy(false); });
    }, 200);
    return () => { clearTimeout(timer); revision.current++; };
  }, [query, notebookId, sender, from, to, favorites]);
  return <section aria-label="聊天正文搜索" className="message-search">
    <label className="field">{notebookId ? '查找当前手记' : '搜索全部手记正文'}<input autoFocus aria-label="正文关键词" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <div className="search-filters"><label className="field">发送人<ToggleSelect aria-label="搜索发送人" value={sender || ''} onChange={v => setSender(v as SearchFilter['sender'])}><option value="">双方</option><option value="self">我</option><option value="other">对方</option></ToggleSelect></label>
      <label className="field">开始日期<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label className="field">结束日期<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>
    <label className="search-favorites"><input type="checkbox" checked={favorites} onChange={e => setFavorites(e.target.checked)} /><span>只找收藏的原话（可不填关键词）</span></label>
    <p role="status">{busy ? '正在查找…' : error || (query.trim() || favorites ? `找到 ${hits.length}${hits.length === 200 ? '（先显示前 200 条，请缩小范围）' : ''} 条` : '输入原话中的关键词。')}</p>
    {(from || to) && <p className="folder-help">日期筛选只包含有完整年月日的消息。</p>}
    <div className="message-search-results">{!busy && hits.map(hit => <button className="search-result" key={`${hit.notebookId}:${hit.messageId}`} onClick={() => open(hit, hits, query)}>
      <strong>{hit.title}</strong><small>{hit.contact} · {RELATIONS[hit.relation]} · {hit.message.sender === 'self' ? '我' : '对方'} · {hit.message.timestamp || '无时间'}</small>
      <span>{hit.snippet}</span>
    </button>)}</div>
  </section>;
}

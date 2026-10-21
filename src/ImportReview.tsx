import { useState } from 'react';
import type { Parsed } from '../shared/types';
import { mergeImportRow, selectedImport, type ImportSelection } from './import-review';
import { ToggleSelect } from './ToggleSelect';

export function ImportReview({ rows, change, selection, select }: {
  rows: Parsed[]; change: (rows: Parsed[]) => void; selection: ImportSelection; select: (value: ImportSelection) => void;
}) {
  const [page, setPage] = useState(0), [aliases, setAliases] = useState<Record<string, string>>({});
  const speakers = [...new Set(rows.map(r => r.speaker))], choices = [...new Set(['我', '对方', ...speakers.filter(s => s !== '未分配')])];
  const pages = Math.max(1, Math.ceil(rows.length / 20)), actualPage = Math.min(page, pages - 1);
  const setRow = (index: number, fields: Partial<Parsed>) => change(rows.map((row, i) => i === index ? { ...row, ...fields } : row));
  return <details className="import-review" open={speakers.includes('未分配') || speakers.length > 2}>
    <summary>逐条校对与导入范围（已选 {selectedImport(rows, selection).length}/{rows.length} 条）</summary>
    <div className="search-filters"><label className="field">从第几条<input aria-label="导入起始消息" type="number" min={1} max={rows.length} value={selection.start} onChange={e => select({ ...selection, start: Number(e.target.value) })} /></label>
      <label className="field">到第几条<input aria-label="导入结束消息" type="number" min={selection.start} max={rows.length} value={Math.min(rows.length, selection.end)} onChange={e => select({ ...selection, end: Number(e.target.value) })} /></label></div>
    <div className="search-filters"><label className="field">开始日期<input type="date" value={selection.from} onChange={e => select({ ...selection, from: e.target.value })} /></label>
      <label className="field">结束日期<input type="date" value={selection.to} onChange={e => select({ ...selection, to: e.target.value })} /></label></div>
    <p className="folder-help">只导入选中的范围。日期筛选会排除没有完整年月日的消息。文件最多 8 MB，模型每次请求仍按既有上下文限制处理。</p>
    {speakers.length > 1 && <details><summary>合并同一人的不同昵称</summary>
      {speakers.map(speaker => <label className="field" key={speaker}>{speaker}<input aria-label={`映射昵称：${speaker}`} value={aliases[speaker] ?? speaker} onChange={e => setAliases({ ...aliases, [speaker]: e.target.value })} /></label>)}
      <button className="secondary" onClick={() => change(rows.map(row => ({ ...row, speaker: aliases[row.speaker]?.trim() || row.speaker })))}>应用昵称映射</button>
    </details>}
    <p>校对预览，每页 20 条；这里的修改尚未写入手记。</p>
    {rows.slice(actualPage * 20, actualPage * 20 + 20).map((row, offset) => {
      const index = actualPage * 20 + offset;
      return <div className="import-review-row" key={index}><strong>第 {index + 1} 条 · {row.timestamp || '无时间'}</strong>
        <label className="field">发送人<ToggleSelect aria-label={`第 ${index + 1} 条发送人`} value={row.speaker} onChange={speaker => setRow(index, { speaker })}>
          {row.speaker === '未分配' && <option value="未分配">未分配（需要校对）</option>}{choices.map(name => <option key={name}>{name}</option>)}
        </ToggleSelect></label>
        <label className="field">文字<textarea aria-label={`第 ${index + 1} 条导入原文`} value={row.text} onChange={e => setRow(index, { text: e.target.value })} /></label>
        <button className="text-button" disabled={!index} onClick={() => change(mergeImportRow(rows, index))}>合并到上一条</button>
        <button className="text-button" disabled={!index} onClick={() => setRow(index, { speaker: rows[index - 1].speaker })}>归属上一位发送人</button>
        <button className="text-button" onClick={() => change(rows.filter((_, i) => i !== index))}>忽略这条</button>
      </div>;
    })}
    <div className="search-filters"><button className="secondary" disabled={!actualPage} onClick={() => setPage(actualPage - 1)}>校对上一页</button><span>{actualPage + 1}/{pages}</span><button className="secondary" disabled={actualPage + 1 >= pages} onClick={() => setPage(actualPage + 1)}>校对下一页</button></div>
  </details>;
}

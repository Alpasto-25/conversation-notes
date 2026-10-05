import { Check, CheckCheck, ListChecks, RotateCcw, Square, Trash, Trash2 } from "lucide-react";
import { IconButton } from "./IconButton";
import { RELATIONS } from "../shared/types";
import type { NotebookSummary } from "./notebooks";
import { useNotebookSelection } from "./useNotebookSelection";

export function NotebookTrash({ items, disabled, recover, purge, empty }: {
  items: NotebookSummary[]; disabled: boolean;
  recover: (notes: NotebookSummary[]) => void; purge: (notes: NotebookSummary[]) => void;
  empty: () => void;
}) {
  const selection = useNotebookSelection(items);
  return <>
    <div className="batch-toolbar">
      <IconButton label={selection.managing ? "完成" : "批量管理"} aria-pressed={selection.managing} disabled={disabled || !items.length && !selection.managing} onClick={selection.toggleMode}>{selection.managing ? <Check size={18} /> : <ListChecks size={18} />}</IconButton>
      {selection.managing && <>
        <span role="status">已选 {selection.selected.length} 份</span>
        <IconButton label="全选" disabled={disabled || !items.length} onClick={() => selection.selectAll(items)}><CheckCheck size={18} /></IconButton>
        <IconButton label="取消选择" disabled={disabled || !selection.selected.length} onClick={selection.clear}><Square size={17} /></IconButton>
        <IconButton label="恢复" disabled={disabled || !selection.selected.length} onClick={() => recover(selection.selected)}><RotateCcw size={18} /></IconButton>
        <IconButton label="永久删除" className="danger" disabled={disabled || !selection.selected.length} onClick={() => purge(selection.selected)}><Trash2 size={18} /></IconButton>
      </>}
      <IconButton label="清空回收站" className="danger empty-trash" disabled={disabled || !items.length} onClick={empty}><Trash size={18} /></IconButton>
    </div>
    {!items.length && <p className="folder-empty">回收站为空</p>}
    <div className="trash-list">{items.map(n => <div className="trash-row" key={n.id}>
      {selection.managing && <label className="notebook-check"><input type="checkbox" aria-label={`选择回收站手记：${n.title}`} checked={selection.checked(n.id)} disabled={disabled} onChange={() => selection.toggle(n.id)} /></label>}
      <div><strong>{n.title}</strong><small>{RELATIONS[n.relation]} · {n.contact} · {n.count} 条</small></div>
      {!selection.managing && <>
        <IconButton label={`恢复手记：${n.title}`} disabled={disabled} onClick={() => recover([n])}><RotateCcw size={17} /></IconButton>
        <button className="icon danger" aria-label={`彻底删除手记：${n.title}`} data-tooltip="彻底删除" disabled={disabled} onClick={() => purge([n])}><Trash2 size={15} /></button>
      </>}
    </div>)}</div>
  </>;
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCheck, ListChecks, Square, Folder, FolderOpen, FolderInput, FileText, Plus, Search, UserRound, Pencil, Trash2, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { IconButton } from "./IconButton";
import { useNotebookDrag } from "./useNotebookDrag";
import { NotebookRow } from "./NotebookRow";
import { RELATIONS, type Relation } from "../shared/types";
import type { NotebookSummary } from "./notebooks";
import { useNotebookSelection } from "./useNotebookSelection";
import { ToggleSelect } from "./ToggleSelect";
import { FolderGroup } from "./FolderGroup";
import { FOLDER_VIEW_EVENT, FOLDER_VIEW_KEY, folderKey, parseFolderView, visibleNotebooks, type FolderView, type FolderSort } from "./folder-view";

function readView() {
  try { return parseFolderView(window.localStorage.getItem(FOLDER_VIEW_KEY)); }
  catch { return parseFolderView(null); }
}
export function ConversationFolders({ items, activeId, disabled, select, create, edit, move, moveTo, recycle, recycleMany, trashCount, openTrash, manageDisabled = disabled, compact = false }: {
  items: NotebookSummary[]; activeId?: string; disabled: boolean; select: (id: string) => void;
  create: () => void; edit: (id: string) => void; recycle: (note: NotebookSummary) => void;
  recycleMany: (notes: NotebookSummary[]) => void;
  move: (notes: NotebookSummary[]) => void;
  moveTo: (notes: NotebookSummary[], scene: Relation, contact: string) => void;
  trashCount: number; openTrash: () => void; manageDisabled?: boolean; compact?: boolean;
}) {
  const [search, setSearch] = useState(""), [view, setView] = useState(readView);
  const [searchCollapsed, setSearchCollapsed] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const selection = useNotebookSelection(items);
  useEffect(() => {
    const sync = () => setView(readView());
    const storage = (e: StorageEvent) => { if (!e.key || e.key === FOLDER_VIEW_KEY) sync(); };
    window.addEventListener(FOLDER_VIEW_EVENT, sync); window.addEventListener("storage", storage);
    return () => { window.removeEventListener(FOLDER_VIEW_EVENT, sync); window.removeEventListener("storage", storage); };
  }, []);
  function update(next: FolderView) {
    setView(next);
    try { window.localStorage.setItem(FOLDER_VIEW_KEY, JSON.stringify(next)); window.dispatchEvent(new Event(FOLDER_VIEW_EVENT)); }
    catch { /* Preferences still work for this session when local storage is unavailable. */ }
  }
  const searching = !!search.trim(), visible = visibleNotebooks(items, search, view.sort);
  const isOpen = (key: string) => searching ? !searchCollapsed.includes(key) : !view.collapsed.includes(key);
  function toggle(key: string) {
    if (searching) { setSearchCollapsed((old) => old.includes(key) ? old.filter((k) => k !== key) : [...old, key]); return; }
    update({ ...view, collapsed: view.collapsed.includes(key) ? view.collapsed.filter((k) => k !== key) : [...view.collapsed, key] });
  }
  const drag = useNotebookDrag(root, manageDisabled || selection.managing, moveTo, (scene, contact) => {
    const keys = [folderKey(scene), ...(contact === undefined ? [] : [folderKey(scene, contact)])];
    if (searching) setSearchCollapsed(old => old.filter(key => !keys.includes(key)));
    else update({ ...view, collapsed: view.collapsed.filter(key => !keys.includes(key)) });
  });
  return <div ref={root} className={`conversation-folders ${compact ? "compact" : ""}${drag.drag ? " has-drag" : ""}`}>
    <div className="folder-toolbar"><strong>对话文件夹 <small>{items.length}</small></strong>
      <IconButton label="新建手记" disabled={disabled} onClick={create}><Plus size={18} strokeWidth={1.8} /></IconButton></div>
    <label className="folder-search"><Search size={14} strokeWidth={1.8} /><input aria-label="搜索手记" placeholder="搜索对象、手记或场景" value={search} onChange={(e) => { setSearch(e.target.value); setSearchCollapsed([]); }} /></label>
    <div className="folder-controls">
      <ToggleSelect aria-label="手记排序" value={view.sort} onChange={value => update({ ...view, sort: value as FolderSort })}>
        <option value="updated">最近修改</option><option value="created">最近创建</option><option value="title">名称排序</option>
      </ToggleSelect>
      <button className="icon" aria-label="展开全部文件夹" data-tooltip="展开全部" disabled={searching} onClick={() => update({ ...view, collapsed: [] })}><ChevronsUpDown size={15} strokeWidth={1.8} /></button>
      <button className="icon" aria-label="收起全部文件夹" data-tooltip="收起全部" disabled={searching} onClick={() => update({ ...view, collapsed: [...new Set(items.flatMap((n) => [folderKey(n.relation), folderKey(n.relation, n.contact)]))] })}><ChevronsDownUp size={15} strokeWidth={1.8} /></button>
    </div>
    <div className="batch-toolbar">
      <IconButton label={selection.managing ? "完成" : "多选"} aria-pressed={selection.managing} disabled={manageDisabled} onClick={selection.toggleMode}>{selection.managing ? <Check size={18} /> : <ListChecks size={18} />}</IconButton>
      {selection.managing && <>
        <span role="status">已选 {selection.selected.length} 份</span>
        <IconButton label={searching ? "全选搜索结果" : "全选"} disabled={manageDisabled || !visible.length} onClick={() => selection.selectAll(visible)}><CheckCheck size={18} /></IconButton>
        <IconButton label="取消选择" disabled={manageDisabled || !selection.selected.length} onClick={selection.clear}><Square size={17} /></IconButton>
        <IconButton label="移动" disabled={manageDisabled || !selection.selected.length} onClick={() => move(selection.selected)}><FolderInput size={18} /></IconButton>
        <IconButton label="移入回收站" className="danger" disabled={manageDisabled || !selection.selected.length} onClick={() => recycleMany(selection.selected)}><Trash2 size={18} /></IconButton>
      </>}
    </div>
    <div className="folder-tree">
      {(Object.keys(RELATIONS) as Relation[]).map((scene) => {
        const notes = visible.filter((n) => n.relation === scene);
        if (!notes.length && !drag.drag) return null;
        const contacts = [...new Set(notes.map((n) => n.contact))].sort((a, b) => a.localeCompare(b, "zh-CN"));
        const sceneOpen = isOpen(folderKey(scene));
        return <FolderGroup key={scene} className="scene-folder" label={RELATIONS[scene]} count={notes.length} open={sceneOpen}
          dropScene={scene}
          toggle={() => toggle(folderKey(scene))} icon={sceneOpen ? <FolderOpen size={16} strokeWidth={1.8} /> : <Folder size={16} strokeWidth={1.8} />}>
          {contacts.map((contact) => <FolderGroup key={contact} className="contact-folder" label={contact} open={isOpen(folderKey(scene, contact))}
            dropScene={scene} dropContact={contact}
            toggle={() => toggle(folderKey(scene, contact))} icon={<UserRound size={16} strokeWidth={1.8} />}>
            {notes.filter((n) => n.contact === contact).map((n) => <NotebookRow key={n.id} title={n.title} selected={n.id === activeId || selection.checked(n.id)} canMove={!selection.managing && !manageDisabled} move={() => move([n])}
              hold={(event, activated) => drag.arm(n, event, activated)} dragging={drag.isDragging} cancelHold={drag.cancelPending}>
              {selection.managing && <label className="notebook-check"><input type="checkbox" aria-label={`选择手记：${n.title}`} checked={selection.checked(n.id)} disabled={manageDisabled} onChange={() => selection.toggle(n.id)} /></label>}
              <button className="notebook-entry" data-tooltip={n.title} aria-label={`${selection.managing ? "选择手记内容" : "打开手记"}：${n.title}`} aria-pressed={selection.managing ? selection.checked(n.id) : undefined} aria-current={!selection.managing && n.id === activeId ? "page" : undefined} disabled={selection.managing ? manageDisabled : disabled} onClick={() => selection.managing ? selection.toggle(n.id) : select(n.id)}>
                <FileText size={16} strokeWidth={1.8} /><span><strong>{n.title}</strong><small>{n.count} 条 · {n.completed ? "分析已保存" : n.analyzed ? "部分分析已保存" : "待分析"}</small></span>
              </button>
              {!selection.managing && <div className="notebook-actions">
                <button className="icon" aria-label={`移动手记：${n.title}`} data-tooltip="移动" disabled={manageDisabled} onClick={() => move([n])}><FolderInput size={14} strokeWidth={1.8} /></button>
                <button className="icon" aria-label={`整理手记：${n.title}`} data-tooltip="整理名称、对象与场景" disabled={manageDisabled} onClick={() => edit(n.id)}><Pencil size={14} strokeWidth={1.8} /></button>
                <button className="icon danger" aria-label={`删除手记：${n.title}`} data-tooltip="移入回收站" disabled={manageDisabled} onClick={() => recycle(n)}><Trash2 size={14} strokeWidth={1.8} /></button>
              </div>}
            </NotebookRow>)}
          </FolderGroup>)}
        </FolderGroup>;
      })}
      {!visible.length && <p className="folder-empty">没有匹配的手记</p>}
    </div>
    <button className="folder-trash" onClick={openTrash}><Trash2 size={15} strokeWidth={1.8} />回收站 <small>{trashCount}</small></button>
    {drag.drag && createPortal(<div className="notebook-drag-ghost" role="status" style={{ left: Math.max(8, Math.min(innerWidth - 228, drag.drag.x + 12)), top: Math.max(8, Math.min(innerHeight - 52, drag.drag.y + 12)) }}><FolderInput size={18} /><span>{drag.drag.note.title}</span></div>, document.body)}
  </div>;
}

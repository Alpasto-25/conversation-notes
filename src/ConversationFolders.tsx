import { useEffect, useState } from "react";
import { Folder, FolderOpen, FileText, Plus, Search, UserRound, Pencil, Trash2, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { RELATIONS, type Relation } from "../shared/types";
import type { NotebookSummary } from "./notebooks";
import { FolderGroup } from "./FolderGroup";
import { FOLDER_VIEW_EVENT, FOLDER_VIEW_KEY, folderKey, parseFolderView, visibleNotebooks, type FolderView, type FolderSort } from "./folder-view";

function readView() {
  try { return parseFolderView(window.localStorage.getItem(FOLDER_VIEW_KEY)); }
  catch { return parseFolderView(null); }
}
export function ConversationFolders({ items, activeId, disabled, select, create, edit, recycle, trashCount, openTrash, manageDisabled = disabled, compact = false }: {
  items: NotebookSummary[]; activeId?: string; disabled: boolean; select: (id: string) => void;
  create: () => void; edit: (id: string) => void; recycle: (note: NotebookSummary) => void;
  trashCount: number; openTrash: () => void; manageDisabled?: boolean; compact?: boolean;
}) {
  const [search, setSearch] = useState(""), [view, setView] = useState(readView);
  const [searchCollapsed, setSearchCollapsed] = useState<string[]>([]);
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
  return <div className={`conversation-folders ${compact ? "compact" : ""}`}>
    <div className="folder-toolbar"><strong>对话文件夹 <small>{items.length}</small></strong>
      <button className="icon" aria-label="新建手记" data-tooltip="新建手记，保留旧记录" disabled={disabled} onClick={create}><Plus size={16} strokeWidth={1.8} /></button></div>
    <label className="folder-search"><Search size={14} strokeWidth={1.8} /><input aria-label="搜索手记" placeholder="搜索对象、手记或场景" value={search} onChange={(e) => { setSearch(e.target.value); setSearchCollapsed([]); }} /></label>
    <div className="folder-controls">
      <select aria-label="手记排序" value={view.sort} onChange={(e) => update({ ...view, sort: e.target.value as FolderSort })}>
        <option value="updated">最近修改</option><option value="created">最近创建</option><option value="title">名称排序</option>
      </select>
      <button className="icon" aria-label="展开全部文件夹" data-tooltip="展开全部" disabled={searching} onClick={() => update({ ...view, collapsed: [] })}><ChevronsUpDown size={15} strokeWidth={1.8} /></button>
      <button className="icon" aria-label="收起全部文件夹" data-tooltip="收起全部" disabled={searching} onClick={() => update({ ...view, collapsed: [...new Set(items.flatMap((n) => [folderKey(n.relation), folderKey(n.relation, n.contact)]))] })}><ChevronsDownUp size={15} strokeWidth={1.8} /></button>
    </div>
    {searching && <p className="folder-search-note">搜索时自动展开匹配项，不改变原来的展开状态。</p>}
    <div className="folder-tree">
      {(Object.keys(RELATIONS) as Relation[]).map((scene) => {
        const notes = visible.filter((n) => n.relation === scene);
        if (!notes.length) return null;
        const contacts = [...new Set(notes.map((n) => n.contact))].sort((a, b) => a.localeCompare(b, "zh-CN"));
        const sceneOpen = isOpen(folderKey(scene));
        return <FolderGroup key={scene} className="scene-folder" label={RELATIONS[scene]} count={notes.length} open={sceneOpen}
          toggle={() => toggle(folderKey(scene))} icon={sceneOpen ? <FolderOpen size={16} strokeWidth={1.8} /> : <Folder size={16} strokeWidth={1.8} />}>
          {contacts.map((contact) => <FolderGroup key={contact} className="contact-folder" label={contact} open={isOpen(folderKey(scene, contact))}
            toggle={() => toggle(folderKey(scene, contact))} icon={<UserRound size={16} strokeWidth={1.8} />}>
            {notes.filter((n) => n.contact === contact).map((n) => <div key={n.id} className={`notebook-row ${n.id === activeId ? "selected" : ""}`}>
              <button className="notebook-entry" aria-label={`打开手记：${n.title}`} aria-current={n.id === activeId ? "page" : undefined} disabled={disabled} onClick={() => select(n.id)}>
                <FileText size={16} strokeWidth={1.8} /><span><strong>{n.title}</strong><small>{n.count} 条 · {n.completed ? "分析已保存" : n.analyzed ? "部分分析已保存" : "待分析"}</small></span>
              </button>
              <div className="notebook-actions">
                <button className="icon" aria-label={`整理手记：${n.title}`} data-tooltip="整理名称、对象与场景" disabled={manageDisabled} onClick={() => edit(n.id)}><Pencil size={14} strokeWidth={1.8} /></button>
                <button className="icon danger" aria-label={`删除手记：${n.title}`} data-tooltip="移入回收站" disabled={manageDisabled} onClick={() => recycle(n)}><Trash2 size={14} strokeWidth={1.8} /></button>
              </div>
            </div>)}
          </FolderGroup>)}
        </FolderGroup>;
      })}
      {!visible.length && <p className="folder-empty">没有匹配的手记</p>}
    </div>
    <button className="folder-trash" onClick={openTrash}><Trash2 size={15} strokeWidth={1.8} />回收站 <small>{trashCount}</small></button>
    {!compact && <p className="folder-help">切换直接读取本机原文与分析，不调用模型。整理或删除不会消耗模型额度；整份手记可在回收站恢复。</p>}
  </div>;
}

import { useState } from "react";
import { Folder, FileText, Plus, Search, UserRound } from "lucide-react";
import { RELATIONS, type Relation } from "../shared/types";
import type { NotebookSummary } from "./notebooks";

export function ConversationFolders({ items, activeId, disabled, select, create, compact = false }: {
  items: NotebookSummary[]; activeId?: string; disabled: boolean; select: (id: string) => void;
  create: () => void; compact?: boolean;
}) {
  const [search, setSearch] = useState("");
  const visible = items.filter((n) => `${n.title} ${n.contact} ${RELATIONS[n.relation]}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <div className={`conversation-folders ${compact ? "compact" : ""}`}>
    <div className="folder-toolbar"><strong>对话文件夹 <small>{items.length}</small></strong>
      <button className="icon" aria-label="新建手记" title="新建手记，保留旧记录" disabled={disabled} onClick={create}><Plus size={17} /></button></div>
    <label className="folder-search"><Search size={14} /><input aria-label="搜索手记" placeholder="搜索对象、手记或场景" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
    <div className="folder-tree">
      {(Object.keys(RELATIONS) as Relation[]).map((scene) => {
        const notes = visible.filter((n) => n.relation === scene);
        if (!notes.length) return null;
        const contacts = [...new Set(notes.map((n) => n.contact))].sort((a, b) => a.localeCompare(b, "zh-CN"));
        return <details key={scene} open className="scene-folder"><summary><Folder size={16} />{RELATIONS[scene]}<small>{notes.length}</small></summary>
          {contacts.map((contact) => <details key={contact} open className="contact-folder"><summary><UserRound size={14} /><span>{contact}</span></summary>
            {notes.filter((n) => n.contact === contact).map((n) => <button key={n.id} className={`notebook-entry ${n.id === activeId ? "selected" : ""}`}
              aria-label={`打开手记：${n.title}`} aria-current={n.id === activeId ? "page" : undefined} disabled={disabled} onClick={() => select(n.id)}>
              <FileText size={14} /><span><strong>{n.title}</strong><small>{n.count} 条 · {n.completed ? "分析已保存" : n.analyzed ? "部分分析已保存" : "待分析"}</small></span></button>)}
          </details>)}
        </details>;
      })}
      {!visible.length && <p className="folder-empty">没有匹配的手记</p>}
    </div>
    {!compact && <p className="folder-help">切换只读取本机记录和已保存分析，不调用模型。分析中切换会暂停当前任务。</p>}
  </div>;
}

import { useState } from "react";
import { RELATIONS, type Relation } from "../shared/types";
import type { NotebookSummary } from "./notebooks";
import { ToggleSelect } from "./ToggleSelect";

export function MoveNotebook({ notes, items, disabled, move }: {
  notes: NotebookSummary[]; items: NotebookSummary[]; disabled: boolean; move: (relation: Relation, contact: string) => void;
}) {
  const [relation, setRelation] = useState(notes[0].relation), [contact, setContact] = useState(notes[0].contact);
  const contacts = [...new Set(items.filter(note => note.relation === relation).map(note => note.contact))].sort((a,b) => a.localeCompare(b, "zh-CN"));
  const existing = contacts.includes(contact) ? contact : "";
  return <>
    <p>{notes.length === 1 ? notes[0].title : `已选 ${notes.length} 份手记`}</p>
    <label className="field">目标分类<ToggleSelect aria-label="移动目标分类" value={relation} disabled={disabled} onChange={value => setRelation(value as Relation)}>
      {Object.entries(RELATIONS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
    </ToggleSelect></label>
    <label className="field">目标文件夹<ToggleSelect aria-label="移动目标文件夹" value={existing} disabled={disabled} onChange={setContact}>
      <option value="">新建文件夹</option>{contacts.map(value => <option key={value} value={value}>{value}</option>)}
    </ToggleSelect></label>
    {!existing && <label className="field">文件夹名称<input aria-label="移动文件夹名称" value={contact} maxLength={80} disabled={disabled} onChange={event => setContact(event.target.value)} /></label>}
    <button className="primary" disabled={disabled || !contact.trim()} onClick={() => move(relation, contact)}>移动到此处</button>
  </>;
}

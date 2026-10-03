import { RELATIONS, type Relation } from "../shared/types";
import type { NotebookSummary } from "./notebooks";

export type FolderSort = "updated" | "created" | "title";
export type FolderView = { collapsed: string[]; sort: FolderSort };
export const FOLDER_VIEW_KEY = "conversation-notes-folder-view-v1";
export const FOLDER_VIEW_EVENT = "notebook-folder-view-changed";
export function folderKey(scene: Relation, contact?: string) { return JSON.stringify([scene, contact ?? null]); }
export function parseFolderView(raw: string | null): FolderView {
  try {
    const value = JSON.parse(raw || "null");
    return { collapsed: Array.isArray(value?.collapsed) ? value.collapsed.filter((k: unknown) => typeof k === "string").slice(0, 2000) : [],
      sort: ["updated", "created", "title"].includes(value?.sort) ? value.sort : "updated" };
  } catch { return { collapsed: [], sort: "updated" }; }
}
export function visibleNotebooks(items: NotebookSummary[], query: string, sort: FolderSort): NotebookSummary[] {
  const text = query.trim().toLocaleLowerCase();
  return items.filter((n) => `${n.title} ${n.contact} ${RELATIONS[n.relation]}`.toLocaleLowerCase().includes(text))
    .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "zh-CN") || a.id.localeCompare(b.id)
      : (sort === "created" ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt)) || a.id.localeCompare(b.id));
}

import { RUBRIC, type Relation } from "../shared/types";
import type { SavedConversation } from "./storage";

export type Notebook = {
  schema: 2;
  id: string;
  title: string;
  contact: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  draft: string;
  conversation: SavedConversation;
  scenes: Partial<Record<Relation, SavedConversation>>;
};
export type NotebookSummary = Pick<Notebook, "id" | "title" | "contact" | "createdAt" | "updatedAt" | "deletedAt"> & {
  relation: Relation;
  count: number;
  analyzed: boolean;
  completed: boolean;
};
export function emptyConversation(relation: Relation = "general"): SavedConversation {
  return { schema: 1, rubric: RUBRIC, messages: [], self: "", other: "对方", relation,
    lines: {}, events: {}, overview: null, trend: [], analyzedCount: 0, completed: false };
}
export function newNotebook(conversation = emptyConversation(), title = "新手记", contact = ""): Notebook {
  const at = new Date().toISOString();
  return { schema: 2, id: crypto.randomUUID(), title: title.trim().slice(0, 100) || "新手记",
    contact: contact.trim().slice(0, 80) || conversation.other, createdAt: at, updatedAt: at,
    draft: "", conversation, scenes: {} };
}
export function summarizeNotebook(n: Notebook): NotebookSummary {
  return { id: n.id, title: n.title, contact: n.contact, createdAt: n.createdAt, updatedAt: n.updatedAt,
    deletedAt: n.deletedAt,
    relation: n.conversation.relation, count: n.conversation.messages.length,
    analyzed: !!n.conversation.overview || Object.keys(n.conversation.lines).length > 0,
    completed: n.conversation.completed };
}
export function conversationInScene(n: Notebook, relation: Relation): SavedConversation {
  const current = n.conversation;
  const saved = n.scenes[relation];
  // Never apply old results to changed messages, identities, or a different rubric.
  if (saved && saved.rubric === RUBRIC && saved.self === current.self && saved.other === current.other
    && saved.messages.length === current.messages.length && saved.messages.every((m, i) => {
      const next = current.messages[i];
      return m.id === next.id && m.sender === next.sender && m.text === next.text
        && m.timestamp === next.timestamp && m.kind === next.kind;
    })) return { ...saved, messages: current.messages };
  return { ...emptyConversation(relation), messages: current.messages, self: current.self, other: current.other };
}
export function organizeNotebook(n: Notebook, title: string, contact: string, relation: Relation): Notebook {
  const conversation = relation === n.conversation.relation ? n.conversation : conversationInScene(n, relation);
  return { ...n, title: title.trim().slice(0, 100) || n.title, contact: contact.trim().slice(0, 80) || n.contact,
    updatedAt: new Date().toISOString(), conversation,
    scenes: { ...n.scenes, [n.conversation.relation]: n.conversation, [relation]: conversation } };
}
export function withoutMessages(n: Notebook, ids: readonly string[]): Notebook {
  const removed = new Set(ids);
  const messages = n.conversation.messages.filter((m) => !removed.has(m.id));
  if (messages.length === n.conversation.messages.length) return n;
  // Later judgments and memory may depend on the deleted text. Never reuse that context.
  return { ...n, updatedAt: new Date().toISOString(), scenes: {}, conversation: {
    ...emptyConversation(n.conversation.relation), messages, self: n.conversation.self, other: n.conversation.other,
  } };
}

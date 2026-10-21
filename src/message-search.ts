import type { Message, Relation } from '../shared/types';
import type { Notebook } from './notebooks';
export type SearchFilter = { notebookId?: string; sender?: Message['sender'] | ''; from?: string; to?: string; favorites?: boolean };
export type MessageHit = { notebookId: string; title: string; relation: Relation; contact: string; messageId: string; index: number; message: Message; snippet: string };
export function matchingMessages(note: Notebook, query: string, filter: SearchFilter = {}, limit = 200): MessageHit[] {
  if (note.deletedAt || (filter.notebookId && filter.notebookId !== note.id)) return [];
  const needle = query.trim().toLocaleLowerCase(); if (!needle && !filter.favorites) return [];
  const hits: MessageHit[] = [];
  for (const [index, message] of note.conversation.messages.entries()) {
    if (filter.sender && message.sender !== filter.sender) continue;
    if (filter.favorites && !note.favorites?.includes(message.id)) continue;
    const date = message.timestamp?.match(/(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})/);
    const stamp = date ? `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}` : undefined;
    if ((filter.from || filter.to) && (!stamp || !/^\d{4}-\d{2}-\d{2}$/.test(stamp))) continue;
    if ((filter.from && stamp! < filter.from) || (filter.to && stamp! > filter.to)) continue;
    const at = message.text.toLocaleLowerCase().indexOf(needle); if (at < 0) continue;
    hits.push({ notebookId: note.id, title: note.title, contact: note.contact, relation: note.conversation.relation,
      messageId: message.id, index, message, snippet: `${at > 30 ? '…' : ''}${message.text.slice(Math.max(0, at - 30), at + needle.length + 70)}${at + needle.length + 70 < message.text.length ? '…' : ''}` });
    if (hits.length >= limit) break;
  }
  return hits;
}

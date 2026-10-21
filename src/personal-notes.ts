import type { Notebook } from './notebooks';
export type Followup = { status: 'open' | 'done' | 'ignored'; note: string; at: string };
export type PersonalNotes = { annotation?: string; pinned?: boolean; tags?: string[]; favorites?: string[]; followups?: Record<string, Followup> };
export const FOLLOWUP_LABELS = { boundary: '边界需要尊重', invitation: '具体安排', commitment: '明确承诺', question: '待回应问题', cancellation: '取消或改期' } as const;
export function updatePersonalNotebook(note: Notebook, value: PersonalNotes): Notebook {
  if ((value.annotation?.length ?? 0) > 20_000) throw new Error('备注最多 20,000 字。');
  return { ...note, ...value, updatedAt: new Date().toISOString(),
    tags: [...new Set((value.tags ?? note.tags ?? []).map(t => t.trim().slice(0, 30)).filter(Boolean))].slice(0, 20),
    favorites: [...new Set(value.favorites ?? note.favorites ?? [])] };
}
export function candidateFollowups(note: Notebook) {
  return Object.values(note.conversation.events).filter(event => event.kind in FOLLOWUP_LABELS)
    .flatMap(event => { const message = note.conversation.messages.find(m => m.id === event.id); return message ? [{ event, message, personal: note.followups?.[event.id] }] : []; });
}

import { type AnalysisUsage } from '../shared/usage';
import type { SavedConversation } from './storage';
import type { Notebook } from './notebooks';

export type AnalysisVersion = { id: string; at: string; label: string; conversation: SavedConversation };
export function mergeRunHistory(history: readonly AnalysisUsage[] = [], ...runs: (AnalysisUsage | undefined)[]): AnalysisUsage[] {
  const map = new Map<string, AnalysisUsage>();
  for (const run of [...history, ...runs]) {
    if (!run) continue;
    const key = run.run_id || `legacy:${JSON.stringify(run)}`, old = map.get(key);
    const completeness = (item: AnalysisUsage) => item.input_tokens + item.output_tokens + item.elapsed_ms + (item.finished_at ? 1 : 0);
    if (!old || completeness(run) >= completeness(old)) map.set(key, run);
  }
  return [...map.values()];
}
export function checkpointNotebook(note: Notebook, label: string): Notebook {
  const c = note.conversation;
  if (!c.overview && !Object.keys(c.lines).length) return note;
  const versions = note.versions ?? [];
  if (versions.length && JSON.stringify(versions.at(-1)!.conversation) === JSON.stringify(c)) return note;
  return { ...note, versions: [...versions, { id: crypto.randomUUID(), at: new Date().toISOString(), label, conversation: c }] };
}
export function canRestoreVersion(current: SavedConversation, saved: SavedConversation) {
  return current.rubric === saved.rubric && current.relation === saved.relation && current.self === saved.self && current.other === saved.other
    && JSON.stringify(current.messages) === JSON.stringify(saved.messages);
}
export function restoreAnalysisVersion(note: Notebook, id: string): Notebook {
  const version = note.versions?.find(v => v.id === id);
  if (!version || !canRestoreVersion(note.conversation, version.conversation)) throw new Error('原文、身份、规则或场景已变化，不能套用这个分析版本。');
  const current = checkpointNotebook(note, '恢复旧版本前');
  return { ...current, updatedAt: new Date().toISOString(), conversation: version.conversation,
    scenes: { ...current.scenes, [version.conversation.relation]: version.conversation } };
}
export function billingMonth(run: AnalysisUsage) {
  const at = Date.parse(run.started_at || run.finished_at || '');
  return Number.isFinite(at) ? new Date(at + 8 * 3600000).toISOString().slice(0, 7) : '未记录日期';
}

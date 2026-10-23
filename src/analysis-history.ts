import { type AnalysisUsage } from '../shared/usage';
import type { SavedConversation } from './storage';
import type { Notebook } from './notebooks';

export type AnalysisVersion = { id: string; at: string; label: string; runId?: string; phase?: 'basic' | 'supplement'; conversation: SavedConversation };
export type AnalysisResult = { runId: string; at: string; phase: 'basic' | 'supplement'; conversation: Omit<SavedConversation, 'self' | 'other'> & Partial<Pick<SavedConversation, 'self' | 'other'>> };
export function usagePurpose(run: AnalysisUsage) {
  return run.purpose || (run.provider === 'jev+deepseek' || run.details?.some(d => ['semantic_judgment', 'semantics'].includes(d.task)) ? 'supplement' : 'basic');
}
export function versionUsage(version: AnalysisVersion) {
  const c = version.conversation;
  return version.phase === 'basic' ? c.analysisUsage : version.phase === 'supplement' ? c.semanticUsage
    : c.semanticUsage || c.analysisUsage || c.failedAnalysisUsage;
}
export function saveAnalysisResults(note: Notebook, results: readonly AnalysisResult[]): Notebook {
  const versions = [...(note.versions ?? [])];
  for (const result of results) {
    if (note.deletedAnalysisVersions?.includes(result.runId)) continue;
    if (versions.some(v => v.runId === result.runId)) continue;
    versions.push({ id: result.runId, runId: result.runId, at: result.at, phase: result.phase,
      label: result.phase === 'basic' ? '基础分析' : '策略与潜台词',
      conversation: structuredClone({ self: note.conversation.self, other: note.conversation.other, ...result.conversation }) });
  }
  return versions.length === (note.versions?.length ?? 0) ? note : { ...note, versions };
}
// Existing installations can retain the currently available result. Do not invent
// snapshots for older ledger entries whose results were already overwritten.
export function retainCurrentAnalysis(note: Notebook): Notebook {
  const conversations = [note.conversation, ...Object.values(note.scenes)];
  let next = note;
  for (const c of conversations) {
    const run = c.semanticUsage || c.analysisUsage || c.failedAnalysisUsage;
    if (!run?.run_id || (!c.overview && !Object.keys(c.lines).length)) continue;
    if (note.deletedAnalysisVersions?.includes(run.run_id)) continue;
    if (next.versions?.some(v => v.runId === run.run_id || JSON.stringify(v.conversation) === JSON.stringify(c))) continue;
    const phase = usagePurpose(run) === 'supplement' ? 'supplement' : 'basic';
    next = saveAnalysisResults(next, [{ runId: run.run_id, at: run.finished_at || run.started_at || next.updatedAt, phase, conversation: c }]);
  }
  return next;
}
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
  const runId = (c.semanticUsage || c.analysisUsage || c.failedAnalysisUsage)?.run_id;
  if (runId && note.deletedAnalysisVersions?.includes(runId)) return note;
  const versions = note.versions ?? [];
  const sameResult = (value: SavedConversation) => JSON.stringify([value.rubric, value.messages, value.self, value.other, value.relation, value.lines, value.events, value.overview, value.analysisUsage, value.semanticUsage]);
  if (versions.some(v => sameResult(v.conversation) === sameResult(c))) return note;
  return { ...note, versions: [...versions, { id: crypto.randomUUID(), at: new Date().toISOString(), label, conversation: c }] };
}
export function deleteAnalysisVersion(note: Notebook, id: string): Notebook {
  const version = note.versions?.find(v => v.id === id);
  if (!version) throw new Error('这份历史结果不存在或已经删除。');
  const runId = version.runId || versionUsage(version)?.run_id;
  return { ...note, updatedAt: new Date().toISOString(), versions: note.versions!.filter(v => v.id !== id),
    deletedAnalysisVersions: [...new Set([...(note.deletedAnalysisVersions ?? []), id, ...(runId ? [runId] : [])])] };
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

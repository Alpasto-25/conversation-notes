import { boundedContext, collectEvents } from '../shared/memory';
import { requestContextKey, RUBRIC, type AnalysisRequest, type LineResult, type Message } from '../shared/types';
import type { SavedConversation } from './storage';
import type { Notebook } from './notebooks';
import { checkpointNotebook } from './analysis-history';
import { semanticJobs, semanticContextHash } from '../shared/semantics';

async function hash(input: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
async function reviseConversation(c: SavedConversation, messages: Message[], forced: readonly string[] = []) {
  const present = new Set(messages.map(m => m.id)), remove = new Set(forced);
  let lines = Object.fromEntries(Object.entries(c.lines).filter(([id]) => present.has(id) && !remove.has(id)));
  let events = collectEvents(lines, Object.fromEntries(Object.entries(c.events).filter(([id, e]) => lines[id] && (!e.resolvedBy || present.has(e.resolvedBy)))));
  const positions = new Map(messages.map((m, i) => [m.id, i]));
  const digests = new Map<string, Promise<string>>();
  // Event removal can invalidate another retrieved context. Iterate to stability;
  // on a long dependency cascade, invalidate conservatively rather than retain stale judgments.
  for (let pass = 0; pass < 4; pass++) {
    const kept = await Promise.all(Object.entries(lines).map(async ([id, line]): Promise<[string, LineResult] | null> => {
      const p = line.analysisContext;
      if (!p || p.rubric !== RUBRIC || p.distant || p.provider !== c.analysisIdentity?.provider || p.model !== c.analysisIdentity?.model
        || p.targetIds.some(target => !positions.has(target))) return null;
      const targets = p.targetIds.map(target => positions.get(target)!);
      const first = Math.min(...targets), last = Math.max(...targets);
      const context = p.fullScene
        ? boundedContext(messages, 0, messages.length, events)
        : boundedContext(messages, Math.max(0, first - (p.provider === 'deepseek' && p.task === 'self_message' ? 99 : 80)),
          p.task === 'self_message' ? last + 1 : Math.min(messages.length, last + 21), events, p.task === 'self_message');
      if (p.fullScene && (messages.length > 100 || context.messages.length !== messages.length)) return null;
      const key = requestContextKey({ ...context, revision: 0, relation: c.relation, task: p.task, targetIds: p.targetIds });
      let digest = digests.get(key); if (!digest) { digest = hash(key); digests.set(key, digest); }
      return await digest === p.hash ? [id, line] : null;
    }));
    const next = Object.fromEntries(kept.filter((v): v is [string, LineResult] => !!v));
    if (Object.keys(next).length === Object.keys(lines).length) { lines = next; break; }
    lines = pass === 3 ? {} : next;
    events = collectEvents(lines, Object.fromEntries(Object.entries(events).filter(([id]) => !!lines[id])));
  }
  for (const size of [6, 12]) {
    const jobs = semanticJobs(messages, c.relation, 0, events, size);
    for (const job of jobs) {
      const digest = await semanticContextHash(job);
      for (const id of job.targetIds) {
        const old = lines[id];
        if (!old?.semanticAnalysis || (!!old.semanticAnalysis.judgeModel !== (size === 6))) continue;
        if (old.semanticAnalysis.contextHash !== digest) {
          const { communicationStrategies, subtext, subtextStatus, contextDependency, semanticConfidence, semanticEvidenceIds, semanticAnalysis, semanticJudgment, ...base } = old;
          lines[id] = base;
        }
      }
    }
  }
  return { ...c, messages, lines, events, overview: null, overviewSource: undefined, semanticState: { status: 'idle' as const, message: '' }, completed: false, analyzedCount: 0,
    targetCache: c.targetCache?.filter(entry => present.has(entry.line.id) && !remove.has(entry.line.id)) };
}
export async function reviseNotebook(note: Notebook, messages: Message[], label: string, forced: readonly string[] = []): Promise<Notebook> {
  const at = new Date().toISOString();
  const scenes = Object.fromEntries(await Promise.all(Object.entries({ ...note.scenes, [note.conversation.relation]: note.conversation }).map(async ([relation, c]) => [relation, await reviseConversation(c, messages, forced)])));
  return { ...checkpointNotebook(note, `${label}前`), updatedAt: at, conversation: scenes[note.conversation.relation], scenes,
    undo: { at, label, conversation: note.conversation, scenes: note.scenes, reading: note.reading } };
}
export function undoMessageChange(note: Notebook): Notebook {
  if (!note.undo) return note;
  const { undo, ...rest } = note;
  return { ...rest, updatedAt: new Date().toISOString(), conversation: undo.conversation, scenes: undo.scenes, reading: undo.reading };
}

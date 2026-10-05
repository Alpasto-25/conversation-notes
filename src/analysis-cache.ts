import { canonicalJson, deepseekPromptVersion } from '../shared/deepseek-prompt';
import { RUBRIC, requestContextKey, type AnalysisRequest, type LineResult } from '../shared/types';
export type CachedTarget = { key: string; line: LineResult };
export function createAnalysisCache() {
  let entries = new Map<string, LineResult>();
  let snapshot: CachedTarget[] = [];
  async function key(job: AnalysisRequest, id: string, provider: string, model: string) {
    const input = canonicalJson({ provider, model, rubric: RUBRIC, protocol: deepseekPromptVersion(job.task),
      task: job.task, target: id, context: requestContextKey(job) });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return {
    restore(saved: CachedTarget[] = []) { entries = new Map(saved.slice(-500).filter(e => /^[a-f0-9]{64}$/.test(e.key) && e.line?.id).map(e => [e.key, e.line])); snapshot = [...entries].map(([key, line]) => ({ key, line })); },
    snapshot: (): CachedTarget[] => snapshot,
    async get(job: AnalysisRequest, provider: string, model: string) {
      const found: Record<string, LineResult> = {};
      for (const id of job.targetIds) { const line = entries.get(await key(job, id, provider, model)); if (line?.id === id) found[id] = line; }
      return found;
    },
    async put(job: AnalysisRequest, lines: LineResult[], provider: string, model: string) {
      const current = entries;
      for (const line of lines) if (job.targetIds.includes(line.id)) {
        const hash = await key(job, line.id, provider, model); if (entries !== current) return;
        entries.delete(hash); entries.set(hash, line);
      }
      while (entries.size > 500) entries.delete(entries.keys().next().value!);
      snapshot = [...entries].map(([key, line]) => ({ key, line }));
    },
  };
}

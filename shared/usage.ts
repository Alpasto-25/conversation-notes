export type AnalysisIdentity = { provider: string; model: string };
export const ANSWER_ISSUE_CODES = ['missing', 'json', 'shape', 'type', 'unknown_candidate', 'duplicate_candidate', 'invalid_weight', 'no_positive_weight', 'probability_mass', 'invalid_noul', 'invalid_confidence', 'conflicting_ids'] as const;
export const ANSWER_QUESTION_KINDS = ['emotions', 'intents', 'event', 'score', 'evidence', 'noul', 'other'] as const;
export type AnswerIssueCode = typeof ANSWER_ISSUE_CODES[number];
export type AnswerQuestionKind = typeof ANSWER_QUESTION_KINDS[number];
export type AnswerIssue = { kind: AnswerQuestionKind; code: AnswerIssueCode; count: number };
export function answerQuestionKind(id: string, type: string): AnswerQuestionKind {
  if (type === 'noul' || type === 'score') return type;
  for (const kind of ['emotions', 'intents', 'event'] as const) if (id.endsWith(`_${kind}`)) return kind;
  return /^(evidence|actionEvidence)$|_proof$/.test(id) ? 'evidence' : 'other';
}
export function sameAnalysisModel(a: AnalysisIdentity | undefined, b: AnalysisIdentity | undefined) {
  return !!a?.provider && !!a.model && a.provider === b?.provider && a.model === b.model;
}
export type RequestUsage = {
  task: string;
  repair: boolean;
  single_recovery?: boolean;
  model: string;
  prompt_family: string;
  started_at: string;
  finished_at: string;
  elapsed_ms: number;
  request_id?: string;
  input_tokens: number;
  output_tokens: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  requests?: number;
  stage?: string;
  batch?: number;
  question_count?: number;
  repair_missing?: number;
  repair_invalid?: number;
  validation?: 'accepted' | 'repair_needed' | 'rejected';
  missing_answers?: number;
  invalid_answers?: number;
  validation_reason?: 'answers' | 'json' | 'model';
  answer_issues?: AnswerIssue[];
};
export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  requests?: number;
  details?: RequestUsage[];
};
export type AnalysisUsage = TokenUsage & {
  local_targets: number;
  elapsed_ms: number;
  provider?: string;
  model?: string;
  run_id?: string;
  started_at?: string;
  finished_at?: string;
};
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return { input_tokens: a.input_tokens + b.input_tokens, output_tokens: a.output_tokens + b.output_tokens,
    ...(a.requests !== undefined && b.requests !== undefined ? { requests: a.requests + b.requests } : {}),
    ...(a.prompt_cache_hit_tokens !== undefined && b.prompt_cache_hit_tokens !== undefined
      ? { prompt_cache_hit_tokens: a.prompt_cache_hit_tokens + b.prompt_cache_hit_tokens } : {}),
    ...(a.prompt_cache_miss_tokens !== undefined && b.prompt_cache_miss_tokens !== undefined
      ? { prompt_cache_miss_tokens: a.prompt_cache_miss_tokens + b.prompt_cache_miss_tokens } : {}),
    ...(a.details || b.details ? { details: [...(a.details ?? []), ...(b.details ?? [])] } : {}) };
}

export type RequestUsageGroup = TokenUsage & { model: string; task: string; prompt_family: string; returns: number; repairs: number; elapsed_ms: number };
// Group returned usage by model, task and exact system fingerprint, keeping absent supplier fields unknown.
export function groupRequestUsage(details: RequestUsage[]): RequestUsageGroup[] {
  const groups = new Map<string, RequestUsageGroup>();
  for (const d of details) {
    const key = JSON.stringify([d.model, d.task, d.prompt_family]);
    const tokens: TokenUsage = { input_tokens: d.input_tokens, output_tokens: d.output_tokens,
      requests: d.requests, prompt_cache_hit_tokens: d.prompt_cache_hit_tokens, prompt_cache_miss_tokens: d.prompt_cache_miss_tokens };
    const old = groups.get(key);
    groups.set(key, { ...(old ? addUsage(old, tokens) : tokens), model: d.model, task: d.task, prompt_family: d.prompt_family,
      returns: (old?.returns ?? 0) + 1, repairs: (old?.repairs ?? 0) + Number(d.repair), elapsed_ms: (old?.elapsed_ms ?? 0) + d.elapsed_ms });
  }
  return [...groups.values()];
}

import type { Questions } from "@typesafe-ai/sdk";
import { z } from "zod";
import type { AnalysisResponse } from './types';
import type { TokenUsage } from './usage';
import { ANSWER_ISSUE_CODES, ANSWER_QUESTION_KINDS } from './usage';

const probability = z.number().min(0).max(1);
const distribution = z.record(probability);
const requestUsageSchema = z.object({
  task: z.string(), repair: z.boolean(), single_recovery: z.boolean().optional(), model: z.string().min(1), prompt_family: z.string(),
  started_at: z.string().datetime(), finished_at: z.string().datetime(), elapsed_ms: z.number().nonnegative(),
  request_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative(),
  prompt_cache_hit_tokens: z.number().int().nonnegative().optional(),
  prompt_cache_miss_tokens: z.number().int().nonnegative().optional(), requests: z.number().int().positive().optional(),
  stage: z.string().optional(), batch: z.number().int().nonnegative().optional(),
  question_count: z.number().int().nonnegative().optional(),
  repair_missing: z.number().int().nonnegative().optional(), repair_invalid: z.number().int().nonnegative().optional(),
  validation: z.enum(['accepted', 'repair_needed', 'rejected']).optional(),
  missing_answers: z.number().int().nonnegative().optional(), invalid_answers: z.number().int().nonnegative().optional(),
  validation_reason: z.enum(['answers', 'json', 'model']).optional(),
  answer_issues: z.array(z.object({ kind: z.enum(ANSWER_QUESTION_KINDS), code: z.enum(ANSWER_ISSUE_CODES), count: z.number().int().positive() })).max(84).optional(),
});
const answerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("noul"), noul: probability }),
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    confidence: probability,
    probabilities: distribution,
  }),
  z.object({
    type: z.literal("score"),
    score: z.number().nonnegative(),
    confidence: probability,
    probabilities: distribution,
  }),
]);
const resultSchema = z.object({
  model: z.string().min(1),
  answers: z.record(answerSchema),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    prompt_cache_hit_tokens: z.number().int().nonnegative().optional(),
    prompt_cache_miss_tokens: z.number().int().nonnegative().optional(),
    requests: z.number().int().positive().optional(),
    details: z.array(requestUsageSchema).optional(),
  }),
});

export class ProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Only normalized answers and validated usage travel with failures, never a raw supplier response.
export class EvaluationFailure extends ProviderError {
  constructor(error: unknown, readonly result: ReturnType<typeof validateResult>) {
    super(error instanceof ProviderError ? error.status : 502,
      error instanceof ProviderError ? error.message : 'DeepSeek 返回处理失败，请重试；已完成的进度保留。');
  }
}
export class AnalysisFailure extends ProviderError {
  readonly usage: TokenUsage;
  constructor(error: EvaluationFailure, readonly partial?: AnalysisResponse) {
    super(error.status, error.message);
    this.usage = error.result.usage;
  }
}
export function analysisFailureDetails(error: unknown): { usage?: TokenUsage; partial?: AnalysisResponse } {
  return error instanceof AnalysisFailure ? { usage: error.usage, ...(error.partial ? { partial: error.partial } : {}) } : {};
}
export function validateReturnedUsage(value: unknown): TokenUsage {
  return validateResult({ model: 'usage', answers: {}, usage: value }, {}).usage;
}

// Never turn an incomplete gateway response into a successful score.
export function validateResult(value: unknown, questions: Questions) {
  const parsed = resultSchema.safeParse(value);
  const invalid = () =>
    new ProviderError(
      502,
      "模型返回的评分或概率不完整，请重试或切换平台。 / Incomplete model response.",
    );
  if (!parsed.success) throw invalid();
  const usage = parsed.data.usage;
  if ((usage.prompt_cache_hit_tokens !== undefined && usage.prompt_cache_hit_tokens > usage.input_tokens) ||
    (usage.prompt_cache_miss_tokens !== undefined && usage.prompt_cache_miss_tokens > usage.input_tokens) ||
    (usage.prompt_cache_hit_tokens !== undefined && usage.prompt_cache_miss_tokens !== undefined &&
      usage.prompt_cache_hit_tokens + usage.prompt_cache_miss_tokens !== usage.input_tokens)) throw invalid();
  for (const [id, question] of Object.entries(questions)) {
    const answer = parsed.data.answers[id];
    if (!answer || answer.type !== question.type) throw invalid();
    if (question.type === "noul" || answer.type === "noul") continue;
    const keys = Object.keys(question.criteria);
    if (
      keys.length !== Object.keys(answer.probabilities).length ||
      keys.some((key) => !Object.hasOwn(answer.probabilities, key))
    )
      throw invalid();
    const sum = Object.values(answer.probabilities).reduce((a, b) => a + b, 0);
    // Jev rounds to two decimals; large choice sets need tolerance.
    if (Math.abs(sum - 1) > keys.length * 0.005 + 0.001) throw invalid();
    if (answer.type === "choice" && !keys.includes(answer.choice))
      throw invalid();
    if (answer.type === "score" && answer.score > keys.length - 1)
      throw invalid();
  }
  return parsed.data;
}

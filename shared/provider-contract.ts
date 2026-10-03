import type { Questions } from "@typesafe-ai/sdk";
import { z } from "zod";

const probability = z.number().min(0).max(1);
const distribution = z.record(probability);
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

// Never turn an incomplete gateway response into a successful score.
export function validateResult(value: unknown, questions: Questions) {
  const parsed = resultSchema.safeParse(value);
  const invalid = () =>
    new ProviderError(
      502,
      "模型返回的评分或概率不完整，请重试或切换平台。 / Incomplete model response.",
    );
  if (!parsed.success) throw invalid();
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

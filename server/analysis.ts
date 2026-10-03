import { analyzeWithEvaluator } from "../shared/analysis-core";
import type { AnalysisRequest } from "../shared/types";
import { evaluate } from "./provider";

export { buildRequest, requestSchema } from "../shared/analysis-core";
export function analyze(input: AnalysisRequest, signal?: AbortSignal) {
  return analyzeWithEvaluator(input, evaluate, signal);
}

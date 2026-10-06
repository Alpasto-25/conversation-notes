import { analyzeWithEvaluator } from "../shared/analysis-core";
import type { AnalysisRequest } from "../shared/types";
import { evaluate } from "./provider";
import { getConfiguredProviderConfig } from './provider-config';

export { buildRequest, requestSchema } from "../shared/analysis-core";
export function analyze(input: AnalysisRequest, signal?: AbortSignal, provider?: string) {
  return analyzeWithEvaluator(input, provider ? (payload, requestSignal) => evaluate(payload, requestSignal, getConfiguredProviderConfig(provider)) : evaluate, signal);
}

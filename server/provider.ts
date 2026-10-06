import type { Questions, SystemOneRequest } from "@typesafe-ai/sdk";
import { setTimeout as delay } from "node:timers/promises";
import { getProviderConfig, getSemanticProviderConfig, type ProviderConfig } from "./provider-config";
import type { SemanticPayload } from '../shared/semantics';
import { ProviderError, validateResult, jevBudgetErrorCode } from "../shared/provider-contract";
import { deepseekRequest, deepseekEnvelope, evaluateCausalDeepseek, type DeepseekRequest } from '../shared/deepseek';
export { ProviderError, validateResult } from "../shared/provider-contract";

export function providerErrorMessage(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  return "连接超时或网络不可达，请检查网络后重试。 / Connection failed or timed out.";
}

function httpError(status: number, name: string, code?: ProviderError['providerCode']) {
  const reason: Record<number, string> = {
    400: "请求未被接受，请检查模型是否可用或缩小聊天范围 / Invalid request",
    401: "Key 无效或已过期，请运行 npm run setup 重新配置 / Invalid API key",
    402: "额度不足，请在该平台检查余额或计费设置 / Insufficient credits",
    403: "没有模型调用权限，请检查 Key 权限和模型访问权限 / Access denied",
    404: "模型或接口暂不可用，请检查平台公告 / Model or endpoint unavailable",
    413: "聊天过长，请缩小范围 / Request too large",
    422: "无法处理当前输入，请缩小聊天范围 / Invalid input",
    429: "请求受限，请稍后重试并检查账号限额 / Rate limit reached",
  };
  return new ProviderError(
    status,
    `${name}：${code ? '当前判断请求过大，请缩小聊天范围后重试。' : reason[status] || "服务暂不可用，请稍后重试 / Service unavailable"}`,
    code,
  );
}

// Native contracts: docs.typesafe.ai/api, Vercel's /sdks-and-apis/typesafe,
// and OpenRouter's /api/alpha/decisions. These are NOT chat/completions APIs.
export async function evaluate(
  payload: DeepseekRequest,
  signal?: AbortSignal,
  config: ProviderConfig = getProviderConfig(),
  fetchImpl: typeof fetch = fetch,
) {
  if (config.provider === 'deepseek') return evaluateCausalDeepseek(payload, (request, requestSignal) => evaluateOnce(request, requestSignal, config, fetchImpl), signal);
  return validateResult(await evaluateOnce(payload, signal, config, fetchImpl), payload.questions);
}
export function evaluateSemanticPayload(payload: SemanticPayload, signal?: AbortSignal, config = getSemanticProviderConfig(), fetchImpl: typeof fetch = fetch) {
  if (config.provider !== 'deepseek') throw new ProviderError(400, '补充分析只使用单独配置的 DeepSeek。');
  return evaluateOnce(payload, signal, config, fetchImpl);
}
async function evaluateOnce(payload: SystemOneRequest<Questions> & { deepseekMessages?: SemanticPayload['deepseekMessages'] }, signal: AbortSignal | undefined, config: ProviderConfig, fetchImpl: typeof fetch) {
  const deadline = AbortSignal.timeout(config.provider === 'deepseek' ? 75000 : 45000);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  for (let attempt = 0; ; attempt++) {
    requestSignal.throwIfAborted();
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config.provider === 'deepseek' ? payload.deepseekMessages
        ? { model: config.model, stream: false, thinking: { type: 'disabled' }, max_tokens: 4096, response_format: { type: 'json_object' }, messages: payload.deepseekMessages }
        : deepseekRequest(payload, config.model) : { state: payload.state, questions: payload.questions, model: config.model }),
      signal: AbortSignal.any([requestSignal, AbortSignal.timeout(config.provider === 'deepseek' ? 60000 : 30000)]),
    });
    if (!response.ok) {
      // Do not surface provider bodies: they may echo credentials or chat text.
      let code: ProviderError['providerCode'];
      if (config.provider === "vercel" && response.status === 403) {
        const details = await response.json().catch(() => null);
        if (details?.error?.type === "customer_verification_required") {
          throw new ProviderError(
            403,
            "Vercel AI Gateway：账号需要先绑定有效信用卡才能调用（包括免费额度）。请在 Vercel 控制台完成验证后重试。 / Add a valid credit card in Vercel to enable AI Gateway.",
          );
        }
      } else if (config.provider === 'typesafe' && response.status === 400) {
        code = jevBudgetErrorCode(await response.json().catch(() => null));
      } else {
        await response.body?.cancel();
      }
      const retry = response.headers.get("retry-after");
      const seconds =
        retry === null
          ? 0.4
          : /^\d+(\.\d+)?$/.test(retry)
            ? Number(retry)
            : Math.max(0, (Date.parse(retry) - Date.now()) / 1000);
      if (
        attempt === 0 &&
        [429, 503, 529].includes(response.status) &&
        Number.isFinite(seconds) &&
        seconds <= 3
      ) {
        await delay(Math.max(100, seconds * 1000), undefined, {
          signal: requestSignal,
        });
        continue;
      }
      throw httpError(response.status, config.name, code);
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ProviderError(
        502,
        `${config.name} 返回格式异常，请重试 / Invalid response`,
      );
    }
    if (config.provider === 'deepseek') {
      const result = deepseekEnvelope(data); result.usage.requests = attempt + 1; return result;
    }
    return validateResult(data, payload.questions);
  }
}

export async function checkProvider(
  config: ProviderConfig = getProviderConfig(),
  signal?: AbortSignal,
) {
  const result = await evaluate(
    {
      state: "This is a connection test. The sky is blue.",
      questions: {
        color: {
          type: "choice",
          instructions: "What color is the sky in the text?",
          criteria: { blue: null, red: null },
        },
        clarity: {
          type: "score",
          instructions: "How explicit is the sky color?",
          criteria: ["Not mentioned", "Implied", "Explicitly stated"],
        },
        mentioned: {
          type: "noul",
          instructions: "Does the text mention the sky?",
        },
      },
    },
    signal,
    config,
  );
  return {
    provider: config.provider,
    model: result.model,
    usage: result.usage,
  };
}

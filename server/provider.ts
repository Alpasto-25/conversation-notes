import type { Questions, SystemOneRequest } from "@typesafe-ai/sdk";
import { setTimeout as delay } from "node:timers/promises";
import { getProviderConfig, type ProviderConfig } from "./provider-config";
import { ProviderError, validateResult } from "../shared/provider-contract";
export { ProviderError, validateResult } from "../shared/provider-contract";

export function providerErrorMessage(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  return "连接超时或网络不可达，请检查网络后重试。 / Connection failed or timed out.";
}

function httpError(status: number, name: string) {
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
    `${name}：${reason[status] || "服务暂不可用，请稍后重试 / Service unavailable"}`,
  );
}

// Native contracts: docs.typesafe.ai/api, Vercel's /sdks-and-apis/typesafe,
// and OpenRouter's /api/alpha/decisions. These are NOT chat/completions APIs.
export async function evaluate(
  payload: SystemOneRequest<Questions>,
  signal?: AbortSignal,
  config: ProviderConfig = getProviderConfig(),
  fetchImpl: typeof fetch = fetch,
) {
  const deadline = AbortSignal.timeout(45000);
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
      body: JSON.stringify({ ...payload, model: config.model }),
      signal: AbortSignal.any([requestSignal, AbortSignal.timeout(30000)]),
    });
    if (!response.ok) {
      // Do not surface provider bodies: they may echo credentials or chat text.
      if (config.provider === "vercel" && response.status === 403) {
        const details = await response.json().catch(() => null);
        if (details?.error?.type === "customer_verification_required") {
          throw new ProviderError(
            403,
            "Vercel AI Gateway：账号需要先绑定有效信用卡才能调用（包括免费额度）。请在 Vercel 控制台完成验证后重试。 / Add a valid credit card in Vercel to enable AI Gateway.",
          );
        }
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
      throw httpError(response.status, config.name);
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

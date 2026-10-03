import type { AnalysisRequest } from "../shared/types";
import { validateResult, ProviderError } from "../shared/provider-contract";
import { isOfficialProviderUrl } from "../shared/provider-guides";
import { RELEASES_URL, type BuildInfo } from "../shared/updates";

declare const __APP_BUILD_INFO__: BuildInfo;
export const APP_BUILD = __APP_BUILD_INFO__;

export const isMobile = import.meta.env.MODE === "mobile";
export const isDesktop = import.meta.env.MODE === "desktop";
export const isNative = isMobile || isDesktop;
export type ApiStatus = {
  configured: boolean;
  provider?: string;
  model?: string;
  error?: string;
};
type NativeBridge = {
  call(id: string, method: string, payload: string): void;
  cancel(id: string): void;
};
type DesktopMessage = { id: string; ok: boolean; value: unknown };
type DesktopWebView = {
  postMessage(value: unknown): void;
  addEventListener(name: "message", callback: (event: { data: DesktopMessage }) => void): void;
};
declare global {
  interface Window {
    chrome?: { webview?: DesktopWebView };
    DialogueNative?: NativeBridge;
    __dialogueNativeResolve?: (id: string, ok: boolean, value: unknown) => void;
    __notebookBack?: () => boolean;
  }
}
if (isDesktop && window.chrome?.webview) {
  const webview = window.chrome.webview;
  window.DialogueNative = {
    call: (id, method, payload) => webview.postMessage({ id, method, payload: JSON.parse(payload) }),
    cancel: (id) => webview.postMessage({ id, method: "cancel" }),
  };
  webview.addEventListener("message", ({ data }) => {
    window.__dialogueNativeResolve?.(data.id, data.ok, data.value);
  });
}
const pending = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }
>();
if (isNative) {
  window.__dialogueNativeResolve = (id, ok, value) => {
    const request = pending.get(id);
    if (!request) return;
    if (ok) request.resolve(value);
    else {
      const error = value as { status?: number; error?: string };
      request.reject(
        new ProviderError(
          error.status || 502,
          error.error || "请求失败，请重试。",
        ),
      );
    }
  };
}
function nativeCall<T>(
  method: string,
  payload: unknown = {},
  signal?: AbortSignal,
): Promise<T> {
  const bridge = window.DialogueNative;
  if (!bridge)
    return Promise.reject(new Error("请在已安装的对话手记应用中使用此功能。"));
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      pending.delete(id);
    };
    const abort = () => {
      bridge.cancel(id);
      finish();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      bridge.cancel(id);
      finish();
      reject(new Error("连接超时，请检查网络后重试。"));
    }, 90000);
    pending.set(id, {
      resolve: (value) => {
        finish();
        resolve(value as T);
      },
      reject: (error) => {
        finish();
        reject(error);
      },
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      bridge.call(id, method, JSON.stringify(payload));
    } catch {
      finish();
      reject(new Error("应用服务未响应，请重新打开应用。"));
    }
  });
}
export async function getApiStatus(): Promise<ApiStatus> {
  if (isNative) return nativeCall<ApiStatus>("status");
  const response = await fetch("/api/health");
  if (!response.ok) throw new Error("本机服务未响应");
  return response.json();
}
export function saveMobileConfig(provider: string, apiKey: string) {
  return nativeCall<ApiStatus>("configure", { provider, apiKey });
}
export function importDesktopConfig() {
  return nativeCall<ApiStatus | null>("importConfig");
}
export function openOfficialProviderPage(url: string) {
  if (!isOfficialProviderUrl(url)) return Promise.reject(new Error("只允许打开已核对的供应商官方入口。"));
  return nativeCall<{ opened: boolean }>("openExternal", { url });
}
export async function checkUpdates(signal?: AbortSignal): Promise<unknown> {
  if (isNative) return nativeCall("checkUpdates", {}, signal);
  const response = await fetch("/api/updates", { signal, credentials: "omit" });
  if (!response.ok) throw new Error("更新检查暂不可用，请检查网络或直接查看 Release 页。");
  return response.json();
}
export function openReleasePage(): Promise<unknown> {
  if (isNative) return nativeCall("openRelease");
  window.open(RELEASES_URL, "_blank", "noopener,noreferrer");
  return Promise.resolve();
}
export async function checkMobileConnection() {
  const questions = {
    color: {
      type: "choice" as const,
      instructions: "What color is the sky in the text?",
      criteria: { blue: null, red: null },
    },
    clarity: {
      type: "score" as const,
      instructions: "How explicit is the sky color?",
      criteria: ["Not mentioned", "Implied", "Explicitly stated"] as [
        string,
        string,
        string,
      ],
    },
    mentioned: {
      type: "noul" as const,
      instructions: "Does the text mention the sky?",
    },
  };
  const result = validateResult(
    await nativeCall("evaluate", {
      state: "This is a connection test. The sky is blue.",
      questions,
    }),
    questions,
  );
  return result.model;
}
export async function analysisFetch(job: AnalysisRequest, signal: AbortSignal) {
  if (!isNative)
    return fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
      signal,
    });
  try {
    const { analyzeWithEvaluator, requestSchema } =
      await import("../shared/analysis-core");
    const valid = requestSchema.safeParse(job);
    if (!valid.success)
      return Response.json(
        { error: "聊天结构或长度不符合要求，请校正后重试" },
        { status: 400 },
      );
    const result = await analyzeWithEvaluator(
      valid.data,
      async (payload, requestSignal) => {
        const response = await nativeCall("evaluate", payload, requestSignal);
        return validateResult(response, payload.questions);
      },
      signal,
    );
    return Response.json(result);
  } catch (error) {
    if (signal.aborted) throw error;
    return Response.json(
      {
        error: error instanceof Error ? error.message : "分析失败，请重试。",
      },
      { status: error instanceof ProviderError ? error.status : 502 },
    );
  }
}

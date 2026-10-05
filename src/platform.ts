import type { AnalysisRequest } from "../shared/types";
import { ProviderError, analysisFailureDetails } from "../shared/provider-contract";
import { evaluateWithDeepseekRepair, evaluateCausalDeepseek, nativeDeepseekPayload, type DeepseekRequest } from "../shared/deepseek";
import { isOfficialProviderUrl } from "../shared/provider-guides";
import { RELEASES_URL, QUARK_DOWNLOAD_URL, type BuildInfo } from "../shared/updates";

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
  profiles?: { provider: string; model: string; configured: boolean }[];
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
  timeout = 90000,
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
      reject(new Error(method === "exportNotes" ? "保存等待超时，请重新导出。" : "连接超时，请检查网络后重试。"));
    }, timeout);
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
export function saveMobileConfig(provider: string, apiKey: string, model?: string) {
  return nativeCall<ApiStatus>("configure", { provider, apiKey, model });
}
export function setNativeAppearance(theme: "system" | "light" | "dark") {
  return nativeCall("setAppearance", { theme });
}
export function importDesktopConfig() {
  return nativeCall<ApiStatus | null>("importConfig");
}
export async function exportNotes(format: "png" | "txt", data: string, page = 1, share = false) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0,15).replace("T", "-");
  const name = `conversation-notes-${stamp}${format === "png" ? `-p${page}` : ""}.${format}`;
  const encoded = format === "png" ? data.replace(/^data:image\/png;base64,/, "") : (() => {
    const bytes = new TextEncoder().encode(data); let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i+8192));
    return btoa(binary);
  })();
  if (encoded.length > 1866668) throw new Error("内容较多，请减少所选消息后导出。");
  if (isNative) return nativeCall<{ saved?: boolean; opened?: boolean; cancelled?: boolean }>("exportNotes", { action:share ? "share" : "save", format, name, data:encoded }, undefined, 300000);
  const blob = format === "png" ? await (await fetch(data)).blob() : new Blob([data], {type:"text/plain;charset=utf-8"});
  const link = document.createElement("a"), url = URL.createObjectURL(blob);
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { saved:true };
}
export function openOfficialProviderPage(url: string) {
  if (!isOfficialProviderUrl(url)) return Promise.reject(new Error("只允许打开已核对的供应商官方入口。"));
  return nativeCall<{ opened: boolean }>("openExternal", { url });
}
export async function checkUpdates(signal?: AbortSignal, fresh = false): Promise<unknown> {
  if (isNative) return nativeCall("checkUpdates", fresh ? { fresh: true } : {}, signal);
  const response = await fetch(`/api/updates${fresh ? "?fresh=1" : ""}`, { signal, credentials: "omit", cache: "no-store" });
  if (!response.ok) throw new Error("更新检查暂不可用，请检查网络后重试，也可直接前往夸克网盘下载。");
  return response.json();
}
export function openReleasePage(): Promise<unknown> {
  if (isNative) return nativeCall("openRelease");
  window.open(RELEASES_URL, "_blank", "noopener,noreferrer");
  return Promise.resolve();
}
export function openQuarkDownloadPage(): Promise<unknown> {
  if (isNative) return nativeCall("openQuark");
  window.open(QUARK_DOWNLOAD_URL, "_blank", "noopener,noreferrer");
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
  const result = await evaluateWithDeepseekRepair({
      state: "This is a connection test. The sky is blue.",
      questions,
    }, (payload, signal) => nativeCall("evaluate", nativeDeepseekPayload(payload), signal));
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
        const status = await getApiStatus();
        const evaluateOnce = (request: DeepseekRequest, signal?: AbortSignal) => nativeCall("evaluate", nativeDeepseekPayload(request), signal);
        return status.provider === "deepseek" ? evaluateCausalDeepseek(payload, evaluateOnce, requestSignal)
          : evaluateWithDeepseekRepair(payload, (request, signal) => nativeCall("evaluate", request, signal), requestSignal);
      },
      signal,
    );
    return Response.json(result);
  } catch (error) {
    if (signal.aborted) throw error;
    return Response.json(
      {
        error: error instanceof Error ? error.message : "分析失败，请重试。",
        ...analysisFailureDetails(error),
      },
      { status: error instanceof ProviderError ? error.status : 502 },
    );
  }
}

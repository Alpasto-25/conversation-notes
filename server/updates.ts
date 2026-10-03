import { RELEASE_API, UPDATE_LIMIT } from "../shared/updates";

// Separate from model configuration and budgets. No cookies, key or chat is sent.
export function createReleaseChecker(fetcher: typeof fetch = fetch, now = Date.now) {
  let pending: Promise<unknown> | undefined;
  let expires = 0;
  return () => {
    if (pending && now() < expires) return pending;
    expires = now() + 60_000;
    pending = (async () => {
      try {
        const response = await fetcher(RELEASE_API, {
          method: "GET", redirect: "error", credentials: "omit",
          headers: { Accept: "application/vnd.github+json", "User-Agent": "ConversationNotes-UpdateCheck" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(response.status === 403 || response.status === 429
          ? "GitHub 暂时限制更新检查，请稍后重试或直接打开 Release 页。"
          : "暂时无法读取 GitHub 发布信息，请稍后重试。");
        if (!response.body) throw new Error();
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > UPDATE_LIMIT) throw new Error();
            chunks.push(value);
          }
        } finally { await reader.cancel(); }
        return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
      } catch {
        // Never forward upstream bodies or exception details.
        throw new Error("更新检查暂不可用，请检查网络、稍后重试，或直接查看 Release 页。");
      }
    })();
    return pending;
  };
}

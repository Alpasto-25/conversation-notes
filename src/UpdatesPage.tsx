import { useRef } from "react";
import { RefreshCw } from "lucide-react";
import { APP_BUILD } from "./platform";
import { UpdateDownloads } from "./UpdateDownloads";
import type { useUpdates } from "./useUpdates";

export function UpdatesPage({ updates }: { updates: ReturnType<typeof useUpdates> }) {
  const status = useRef<HTMLDivElement>(null);
  function check() {
    void updates.check(true);
    status.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  const platform = APP_BUILD.platform === "windows" ? "Windows" : APP_BUILD.platform === "android" ? "Android" : "网页版";
  return <section className="updates-page">
    <p>当前应用 · {platform} · v{APP_BUILD.version}</p>
    <details><summary>版本详情</summary><dl className="build-details"><dt>构建</dt><dd>{APP_BUILD.buildId}</dd>
      <dt>时间</dt><dd>{new Date(APP_BUILD.builtAt).toLocaleString()}</dd></dl></details>
    <div ref={status} className={`update-state${updates.error ? " state-error" : ""}`} role={updates.error ? "alert" : "status"} aria-live="polite" aria-atomic="true" aria-busy={updates.checking}>
      {updates.checking ? "正在检查更新…" : updates.error ? `检查失败：${updates.error}` : updates.result?.status === "current"
        ? `已是最新版本 v${APP_BUILD.version}`
        : updates.result?.status === "available" ? `发现新版 v${updates.result.version}`
        : updates.result ? updates.result.message : "尚未检查更新"}
    </div>
    {updates.checkedAt && <p className="update-time">上次成功检查：{new Date(updates.checkedAt).toLocaleString()}</p>}
    <div className="update-actions">
      <button className="secondary" disabled={updates.checking} onClick={check}><RefreshCw size={16} className={updates.checking ? "update-spinner" : undefined} /> {updates.checking ? "检查中…" : "检查更新"}</button>
    </div>
    <UpdateDownloads />
    <label className="update-preference"><input type="checkbox" checked={updates.automatic} onChange={e => updates.setAutomatic(e.target.checked)} /> 自动检查更新</label>
    <p>只检查版本，不自动安装。检查失败时可直接下载。</p>
  </section>;
}

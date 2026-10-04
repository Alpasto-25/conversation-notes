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
    <dl className="build-details"><dt>内部构建</dt><dd>{APP_BUILD.buildId}</dd>
      <dt>构建时间</dt><dd>{new Date(APP_BUILD.builtAt).toLocaleString()}</dd></dl>
    <div ref={status} className={`update-state${updates.error ? " state-error" : ""}`} role={updates.error ? "alert" : "status"} aria-live="polite" aria-atomic="true" aria-busy={updates.checking}>
      {updates.checking ? "正在检查更新…" : updates.error ? `检查失败：${updates.error}` : updates.result?.status === "current"
        ? `检查完成：当前已是最新版本 v${APP_BUILD.version}。`
        : updates.result?.status === "available" ? `检查完成：发现新版 v${updates.result.version}，可从下方下载。`
        : updates.result ? `检查完成：${updates.result.message}` : "尚未检查更新，点击下方按钮即可检查。"}
      {!updates.checking && !updates.error && updates.result && <p>最新发布：v{updates.result.version}{updates.result.buildId ? ` · 构建 ${updates.result.buildId}` : ""}</p>}
    </div>
    {updates.checkedAt && <p className="update-time">上次成功检查：{new Date(updates.checkedAt).toLocaleString()}</p>}
    <div className="update-actions">
      <button className="secondary" disabled={updates.checking} onClick={check}><RefreshCw size={16} className={updates.checking ? "update-spinner" : undefined} /> {updates.checking ? "检查中…" : "检查更新"}</button>
    </div>
    <UpdateDownloads />
    <label className="update-preference"><input type="checkbox" checked={updates.automatic} onChange={e => updates.setAutomatic(e.target.checked)} /> 自动检查应用更新</label>
    <p>开启后，每次打开应用和运行期间每 6 小时检查一次；确认有新版时弹窗提醒，更新入口显示红点。“稍后再说”仅关闭本次打开期间的提醒；“此版本不再提醒”会记住当前构建，下个新版本仍会提示。关闭弹窗或查看下载页不会清除红点，安装新版并成功检查后才会消失。关闭应用后不会后台运行。只读取公开 GitHub 发布信息，不发送 Key 或聊天记录，不调用模型、不消耗模型额度。</p>
    <p>检查需要读取 GitHub 公开版本信息，网络受限时可能失败，仍可直接使用夸克网盘下载。启动弹窗从 1.1.2 起提供，1.1.1 请先手动下载安装。应用不会自动下载或安装。API Key 由模型供应商提供，相关费用仍由用户自行承担。</p>
  </section>;
}

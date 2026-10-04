import { useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { RELEASES_URL } from "../shared/updates";
import { APP_BUILD, openReleasePage } from "./platform";
import type { useUpdates } from "./useUpdates";

export function UpdatesPage({ updates }: { updates: ReturnType<typeof useUpdates> }) {
  const [openError, setOpenError] = useState("");
  const platform = APP_BUILD.platform === "windows" ? "Windows" : APP_BUILD.platform === "android" ? "Android" : "网页版";
  return <section className="updates-page">
    <p>当前应用 · {platform} · v{APP_BUILD.version}</p>
    <dl className="build-details"><dt>内部构建</dt><dd>{APP_BUILD.buildId}</dd>
      <dt>构建时间</dt><dd>{new Date(APP_BUILD.builtAt).toLocaleString()}</dd></dl>
    <div className={`update-state${updates.error ? " state-error" : ""}`} role={updates.error ? "alert" : "status"}>
      {updates.checking ? "正在检查 GitHub 最新发布…" : updates.error || updates.result?.message || "尚未检查更新。"}
      {!updates.checking && !updates.error && updates.result && <p>最新发布：v{updates.result.version}{updates.result.buildId ? ` · 构建 ${updates.result.buildId}` : ""}</p>}
    </div>
    {updates.checkedAt && <p className="update-time">上次成功检查：{new Date(updates.checkedAt).toLocaleString()}</p>}
    <div className="update-actions">
      <button className="secondary" disabled={updates.checking} onClick={() => void updates.check()}><RefreshCw size={16} /> 检查更新</button>
      <button className="primary" onClick={() => { setOpenError(""); void openReleasePage().catch(() => setOpenError("无法打开浏览器，请复制下方链接自行访问。")); }}><ArrowUpRight size={16} /> 打开 Release 下载页</button>
    </div>
    {openError && <p className="error" role="alert">{openError}</p>}
    <p className="release-address">{RELEASES_URL}</p>
    <label className="update-preference"><input type="checkbox" checked={updates.automatic} onChange={e => updates.setAutomatic(e.target.checked)} /> 自动检查应用更新</label>
    <p>开启后，每次打开应用和运行期间每 6 小时检查一次；确认有新版时弹窗提醒，更新入口显示红点。“稍后再说”仅关闭本次打开期间的提醒；“此版本不再提醒”会记住当前构建，下个新版本仍会提示。关闭弹窗或查看下载页不会清除红点，安装新版并成功检查后才会消失。关闭应用后不会后台运行。只读取公开 GitHub 发布信息，不发送 Key 或聊天记录，不调用模型、不消耗模型额度。</p>
    <p>本软件免费使用。发现更新后会提醒你前往 Release 页，自行下载对应系统的安装包；不会自动下载或安装。API Key 由模型供应商提供，相关费用仍由用户自行承担。</p>
  </section>;
}

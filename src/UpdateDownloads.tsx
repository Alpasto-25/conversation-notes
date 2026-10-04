import { useState } from "react";
import { ArrowUpRight, Download } from "lucide-react";
import { QUARK_DOWNLOAD_URL, QUARK_EXTRACTION_CODE, RELEASES_URL } from "../shared/updates";
import { openQuarkDownloadPage, openReleasePage } from "./platform";

export function UpdateDownloads() {
  const [openError, setOpenError] = useState("");
  function open(quark: boolean) {
    setOpenError("");
    void (quark ? openQuarkDownloadPage() : openReleasePage())
      .catch(() => setOpenError("无法打开浏览器，请复制下方下载链接自行访问。"));
  }
  return <div className="update-downloads">
    <div className="update-actions">
      <button className="primary" onClick={() => open(true)}><Download size={16} /> 夸克网盘下载</button>
      <button className="secondary" onClick={() => open(false)}><ArrowUpRight size={16} /> GitHub 备用下载</button>
    </div>
    {openError && <p className="error" role="alert">{openError}</p>}
    <p>夸克提取码：<strong className="download-code">{QUARK_EXTRACTION_CODE}</strong>。选择对应系统的安装包，直接覆盖更新，手机请勿先卸载。</p>
    <p className="release-address">夸克：{QUARK_DOWNLOAD_URL}</p>
    <p className="release-address">备用：{RELEASES_URL}</p>
  </div>;
}

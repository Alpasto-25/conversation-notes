import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { BillingNotice, ProviderHelp } from "./ProviderHelp";
import {
  saveMobileConfig,
  checkMobileConnection,
  importDesktopConfig,
  isDesktop,
  type ApiStatus,
} from "./platform";

export function MobileSettings({
  status,
  changed,
}: {
  status: ApiStatus | null;
  changed: (status: ApiStatus) => void;
}) {
  const [provider, setProvider] = useState(status?.provider || "typesafe");
  const [key, setKey] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setFeedback("");
    try {
      changed(await saveMobileConfig(provider, key.trim()));
      setKey("");
      setFeedback(`配置已加密保存在${isDesktop ? "这台电脑" : "这部手机"}。可以测试连接了。`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function importConfig() {
    setBusy(true);
    setFeedback("");
    try {
      const imported = await importDesktopConfig();
      if (imported) {
        changed(imported);
        setProvider(imported.provider || "typesafe");
        setKey("");
        setFeedback("旧版 API 配置已导入并加密保存；原文件没有改动。");
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setBusy(true);
    setFeedback("正在连接模型服务…");
    try {
      setFeedback(`连接成功 · ${await checkMobileConnection()}`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "连接失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="api-settings" aria-label={`${isDesktop ? "电脑" : "手机"} API 设置`}>
      <h3>
        <KeyRound size={17} /> 模型服务
      </h3>
      <BillingNotice compact />
      <label className="field">
        服务平台
        <select
          value={provider}
          disabled={busy}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="typesafe">TypeSafe</option>
          <option value="vercel">Vercel AI Gateway</option>
          <option value="openrouter">OpenRouter</option>
        </select>
      </label>
      <ProviderHelp provider={provider} expanded={!status?.configured} />
      <label className="field">
        API Key
        <input
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={key}
          disabled={busy}
          onChange={(e) => setKey(e.target.value)}
          placeholder={
            status?.configured ? "已保存；留空可保留原 Key" : "只粘贴 Key 本身"
          }
        />
      </label>
      <div className="api-actions">
        <button
          className="primary"
          disabled={busy || (!key.trim() && !status?.configured)}
          onClick={save}
        >
          保存配置
        </button>
        <button
          className="secondary"
          disabled={busy || !status?.configured || !!key.trim()}
          onClick={check}
        >
          测试连接
        </button>
      </div>
      <p className="external-page-note">“测试连接”和正式分析均会调用供应商 API，可能消耗额度或产生费用；请确认自己的额度与费率。</p>
      {isDesktop && (
        <button className="secondary" disabled={busy} onClick={importConfig}>
          导入旧版 API 配置（.env）
        </button>
      )}
      <p className="secure-note">
        <ShieldCheck size={15} /> Key 在{isDesktop ? "电脑" : "手机"}本机加密保存，不会写进安装包。
      </p>
      <p role="status" className="api-feedback">
        {feedback}
      </p>
    </section>
  );
}

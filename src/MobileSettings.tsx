import { useEffect, useState } from "react";
import { MODEL_OPTIONS, MODEL_DIFFERENCES, defaultModel, supportsModel } from '../shared/models';
import { ToggleSelect } from './ToggleSelect';
import type { ModelSelection } from './ModelSelector';
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
  selection,
  disabled = false,
}: {
  status: ApiStatus | null;
  changed: (status: ApiStatus) => void;
  selection?: ModelSelection;
  disabled?: boolean;
}) {
  const [provider, setProvider] = useState(status?.provider || "typesafe");
  const [model, setModel] = useState(supportsModel(status?.provider || 'typesafe', status?.model || '') ? status!.model! : defaultModel(status?.provider || 'typesafe'));
  useEffect(() => { if (selection) { setProvider(selection.provider); setModel(selection.model); setKey(''); } }, [selection]);
  const [key, setKey] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const [saving, setBusy] = useState(false);
  const busy = saving || disabled;
  const saved = status?.profiles?.find(item => item.provider === provider)?.configured || (status?.configured && status.provider === provider);
  const active = status?.configured && status.provider === provider && status.model === model;
  async function save() {
    setBusy(true);
    setFeedbackError(false);
    setFeedback("");
    try {
      changed(await saveMobileConfig(provider, key.trim(), model));
      setKey("");
      setFeedback("配置已在本机加密保存。");
    } catch (error) {
      setFeedbackError(true);
      setFeedback(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function importConfig() {
    setBusy(true);
    setFeedbackError(false);
    setFeedback("");
    try {
      const imported = await importDesktopConfig();
      if (imported) {
        changed(imported);
        setProvider(imported.provider || "typesafe");
        setModel(imported.model || defaultModel(imported.provider || 'typesafe'));
        setKey("");
        setFeedback("旧版 API 配置已导入并加密保存；原文件没有改动。");
      }
    } catch (error) {
      setFeedbackError(true);
      setFeedback(error instanceof Error ? error.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setBusy(true);
    setFeedbackError(false);
    setFeedback("正在连接模型服务…");
    try {
      setFeedback(`连接成功 · ${await checkMobileConnection()}`);
    } catch (error) {
      setFeedbackError(true);
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
        <ToggleSelect
          value={provider}
          disabled={busy}
          aria-label="服务平台" onChange={id => {
            setProvider(id); setKey(''); setFeedback('');
            setModel(status?.profiles?.find(item => item.provider === id)?.model || defaultModel(id));
          }}
        >
          <option value="typesafe">TypeSafe</option>
          <option value="vercel">Vercel AI Gateway</option>
          <option value="openrouter">OpenRouter</option>
          <option value="deepseek">DeepSeek（官方）</option>
        </ToggleSelect>
      </label>
      <label className="field">模型
        <ToggleSelect aria-label="服务模型" value={model} disabled={busy} onChange={value => { setModel(value); setFeedback(''); }}>
          {MODEL_OPTIONS.filter(option => option.provider === provider).map(option => <option key={option.model} value={option.model}>{option.label}</option>)}
        </ToggleSelect>
      </label>
      <p className="model-differences">{MODEL_DIFFERENCES}</p>
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
            saved ? "此平台已保存 Key；留空保留" : "此平台首次使用，请粘贴 Key 本身"
          }
        />
      </label>
      <div className="api-actions">
        <button
          className="primary"
          disabled={busy || (!key.trim() && !saved)}
          onClick={save}
        >
          保存配置
        </button>
        <button
          className="secondary"
          disabled={busy || !active || !!key.trim()}
          onClick={check}
        >
          测试连接
        </button>
      </div>
      <p className="external-page-note">测试连接和分析均会消耗供应商额度。</p>
      {isDesktop && (
        <button className="secondary" disabled={busy} onClick={importConfig}>
          导入配置（.env）
        </button>
      )}
      <p className="secure-note">
        <ShieldCheck size={15} /> Key 在{isDesktop ? "电脑" : "手机"}本机加密保存，不会写进安装包。
      </p>
      <p role={feedbackError ? "alert" : "status"} className={`api-feedback${feedbackError ? " error" : ""}`}>
        {feedback}
      </p>
    </section>
  );
}

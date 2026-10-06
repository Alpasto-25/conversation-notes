import { useEffect, useState } from "react";
import { MODEL_OPTIONS, defaultModel, supportsModel } from '../shared/models';
import type { SemanticMode } from '../shared/analysis-mode';
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

const PROVIDERS = { typesafe: 'TypeSafe', vercel: 'Vercel AI Gateway', openrouter: 'OpenRouter', deepseek: 'DeepSeek（官方）' };
function ModelConfiguration({ status, changed, selection, disabled, providers, activate, title, keyLabel, saveLabel }: {
  status: ApiStatus | null;
  changed: (status: ApiStatus) => void;
  selection?: ModelSelection;
  disabled: boolean;
  providers: string[]; activate: boolean; title: string; keyLabel: string; saveLabel: string;
}) {
  const initial = selection && providers.includes(selection.provider) ? selection.provider
    : providers.includes(status?.provider || '') ? status!.provider! : status?.profiles?.find(p => p.configured && providers.includes(p.provider))?.provider || providers[0];
  const [provider, setProvider] = useState(initial);
  const storedModel = status?.profiles?.find(p => p.provider === initial)?.model || (status?.provider === initial ? status.model : '');
  const [model, setModel] = useState(supportsModel(initial, storedModel || '') ? storedModel! : defaultModel(initial));
  useEffect(() => { if (selection && providers.includes(selection.provider)) { setProvider(selection.provider); setModel(selection.model); setKey(''); } }, [selection]);
  const [key, setKey] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const [saving, setBusy] = useState(false);
  const busy = saving || disabled;
  const saved = status?.profiles?.find(item => item.provider === provider)?.configured || (status?.configured && status.provider === provider);
  async function save() {
    setBusy(true);
    setFeedbackError(false);
    setFeedback("");
    try {
      changed(await saveMobileConfig(provider, key.trim(), model, activate));
      setKey("");
      setFeedback("配置已在本机加密保存。");
    } catch (error) {
      setFeedbackError(true);
      setFeedback(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setBusy(true);
    setFeedbackError(false);
    setFeedback("正在连接模型服务…");
    try {
      setFeedback(`连接成功 · ${await checkMobileConnection(provider)}`);
    } catch (error) {
      setFeedbackError(true);
      setFeedback(error instanceof Error ? error.message : "连接失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="model-configuration" aria-label={title}>
      <h3>
        <KeyRound size={17} /> {title}
      </h3>
      {providers.length > 1 ? <><label className="field">
        服务平台
        <ToggleSelect
          value={provider}
          disabled={busy}
          aria-label="服务平台" onChange={id => {
            setProvider(id); setKey(''); setFeedback('');
            setModel(status?.profiles?.find(item => item.provider === id)?.model || defaultModel(id));
          }}
        >
          {providers.map(id => <option key={id} value={id}>{PROVIDERS[id as keyof typeof PROVIDERS]}</option>)}
        </ToggleSelect>
      </label>
      <label className="field">模型
        <ToggleSelect aria-label="服务模型" value={model} disabled={busy} onChange={value => { setModel(value); setFeedback(''); }}>
          {MODEL_OPTIONS.filter(option => option.provider === provider).map(option => <option key={option.model} value={option.model}>{option.label}</option>)}
        </ToggleSelect>
      </label></> : <p className="model-differences">模型：{MODEL_OPTIONS.find(option => option.provider === provider && option.model === model)?.label || model}</p>}
      <ProviderHelp provider={provider} expanded={!saved} />
      <label className="field">
        {keyLabel}
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
          {saveLabel}
        </button>
        <button
          className="secondary"
          disabled={busy || !saved || !!key.trim()}
          onClick={check}
        >
          测试连接
        </button>
      </div>
      <p role={feedbackError ? "alert" : "status"} className={`api-feedback${feedbackError ? " error" : ""}`}>
        {feedback}
      </p>
    </section>
  );
}

export function MobileSettings({ status, changed, selection, disabled = false, workflow }: {
  status: ApiStatus | null; changed: (status: ApiStatus) => void; selection?: ModelSelection;
  disabled?: boolean; workflow?: SemanticMode;
}) {
  const [importing, setImporting] = useState(false), [feedback, setFeedback] = useState(''), [feedbackError, setFeedbackError] = useState(false);
  const [importedSelection, setImportedSelection] = useState<ModelSelection>();
  async function importConfig() {
    setImporting(true); setFeedback(''); setFeedbackError(false);
    try {
      const imported = await importDesktopConfig();
      if (imported) {
        changed(imported);
        setImportedSelection({ provider: imported.provider || 'typesafe', model: imported.model || defaultModel(imported.provider || 'typesafe') });
        setFeedback('旧版 API 配置已导入并加密保存；原文件没有改动。');
      }
    } catch (error) { setFeedbackError(true); setFeedback(error instanceof Error ? error.message : '导入失败'); }
    finally { setImporting(false); }
  }
  const common = { status, changed, selection: selection || importedSelection, disabled: disabled || importing };
  return <section className="api-settings" aria-label={`${isDesktop ? '电脑' : '手机'} API 设置`}>
    <BillingNotice compact />
    {workflow === 'deepseek' ? <ModelConfiguration key="deepseek-only" {...common} providers={['deepseek']} activate
      title="DeepSeek 分析模型" keyLabel="DeepSeek API Key" saveLabel="保存 DeepSeek 配置" />
      : workflow === 'jev-deepseek' ? <>
        <ModelConfiguration key="jev" {...common} providers={['typesafe', 'vercel', 'openrouter']} activate
          title="Jev 判断模型" keyLabel="Jev API Key" saveLabel="保存 Jev 配置" />
        <ModelConfiguration key="deepseek-explanation" {...common} providers={['deepseek']} activate={false}
          title="DeepSeek 解释模型" keyLabel="DeepSeek API Key" saveLabel="保存 DeepSeek 配置" />
      </> : <ModelConfiguration key="primary" {...common} providers={Object.keys(PROVIDERS)} activate
        title="基础分析模型" keyLabel="API Key" saveLabel="保存配置" />}
    <p className="external-page-note">保存配置不会开始分析；测试连接和分析会消耗供应商额度。</p>
    {isDesktop && <button className="secondary" disabled={disabled || importing} onClick={importConfig}>导入配置（.env）</button>}
    <p className="secure-note"><ShieldCheck size={15} /> Key 在{isDesktop ? '电脑' : '手机'}本机加密保存，不会写进安装包。</p>
    <p role={feedbackError ? 'alert' : 'status'} className={`api-feedback${feedbackError ? ' error' : ''}`}>{feedback}</p>
  </section>;
}

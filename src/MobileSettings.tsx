import { useEffect, useState } from "react";
import { MODEL_OPTIONS, PROVIDER_NAMES, defaultModel } from '../shared/models';
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

const PROVIDERS = PROVIDER_NAMES;
function ModelConfiguration({ status, changed, selection, disabled, providers, activate, title, keyLabel, saveLabel, judgmentMode }: {
  status: ApiStatus | null;
  changed: (status: ApiStatus) => void;
  selection?: ModelSelection;
  disabled: boolean;
  providers: string[]; activate: boolean; title: string; keyLabel: string; saveLabel: string;
  judgmentMode?: SemanticMode;
}) {
  const options = MODEL_OPTIONS.filter(option => providers.includes(option.provider) && (!judgmentMode
    || (judgmentMode === 'openai-deepseek' ? option.model === 'openai/gpt-6-luna-decisions'
      : judgmentMode === 'jev-deepseek' ? option.model.includes('jev') : option.provider === 'deepseek')));
  const allowedModel = (id: string, stored?: string) => options.some(o => o.provider === id && o.model === stored) ? stored! : options.find(o => o.provider === id)!.model;
  const initial = selection && providers.includes(selection.provider) ? selection.provider
    : providers.includes(status?.provider || '') ? status!.provider! : status?.profiles?.find(p => p.configured && providers.includes(p.provider))?.provider || providers[0];
  const [provider, setProvider] = useState(initial);
  const storedModel = status?.profiles?.find(p => p.provider === initial)?.model || (status?.provider === initial ? status.model : '');
  const [model, setModel] = useState(allowedModel(initial, storedModel));
  useEffect(() => { if (selection && options.some(o => o.provider === selection.provider && o.model === selection.model)) { setProvider(selection.provider); setModel(selection.model); setKey(''); } }, [selection]);
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
      const selectedModel = selection?.purpose === 'screenshot'
        ? status?.profiles?.find(p => p.provider === provider)?.model || (status?.provider === provider ? status.model : undefined) || model : model;
      changed(await saveMobileConfig(provider, key.trim(), selectedModel, activate));
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
      const result = await checkMobileConnection(provider);
      setFeedback(`连接成功 · ${result.name || result.provider || '当前平台'} · ${result.model}`);
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
      {selection?.purpose === 'screenshot' ? <p className="model-differences">识图模型：{provider === 'deepseek' ? 'DeepSeek Flash' : 'OpenAI GPT-6 Luna'}。保存 Key 后，判断模型保持当前选择。</p> : providers.length > 1 ? <><label className="field">
        服务平台
        <ToggleSelect
          value={provider}
          disabled={busy}
          aria-label="服务平台" onChange={id => {
            setProvider(id); setKey(''); setFeedback('');
            setModel(allowedModel(id, status?.profiles?.find(item => item.provider === id)?.model));
          }}
        >
          {providers.map(id => <option key={id} value={id}>{PROVIDERS[id as keyof typeof PROVIDERS]}</option>)}
        </ToggleSelect>
      </label>
      <label className="field">模型
        <ToggleSelect aria-label="服务模型" value={model} disabled={busy} onChange={value => { setModel(value); setFeedback(''); }}>
          {options.filter(option => option.provider === provider).map(option => <option key={option.model} value={option.model}>{option.label}</option>)}
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
  const requested = selection || importedSelection;
  const common = { status, changed, selection: requested?.purpose === 'screenshot' ? undefined : requested, disabled: disabled || importing };
  return <section className="api-settings" aria-label={`${isDesktop ? '电脑' : '手机'} API 设置`}>
    <BillingNotice compact />
    {requested?.purpose === 'screenshot' && <ModelConfiguration key={`screenshot-${requested.provider}`} {...common} selection={requested} providers={[requested.provider]} activate={false}
      title="截图识别接口" keyLabel={requested.provider === 'deepseek' ? 'DeepSeek API Key' : 'OpenRouter API Key'} saveLabel="保存识图配置" />}
    {workflow === 'deepseek' ? <ModelConfiguration key="deepseek-only" {...common} providers={['deepseek']} activate
      title="DeepSeek 分析模型" keyLabel="DeepSeek API Key" saveLabel="保存 DeepSeek 配置" />
      : workflow === 'jev-deepseek' || workflow === 'openai-deepseek' ? <>
        <ModelConfiguration key={workflow} {...common} providers={workflow === 'openai-deepseek' ? ['openrouter'] : ['typesafe', 'vercel', 'openrouter']} activate judgmentMode={workflow}
          title={workflow === 'openai-deepseek' ? 'OpenAI 判断模型' : 'Jev 判断模型'} keyLabel="判断平台 API Key" saveLabel="保存判断模型配置" />
        <ModelConfiguration key="deepseek-explanation" {...common} providers={['deepseek']} activate={false}
          title="DeepSeek 解释模型" keyLabel="DeepSeek API Key" saveLabel="保存 DeepSeek 配置" />
      </> : <ModelConfiguration key="primary" {...common} providers={Object.keys(PROVIDERS)} activate
        title="基础分析模型" keyLabel="API Key" saveLabel="保存配置" />}
    <p className="external-page-note">保存配置不会开始分析；测试连接和分析会消耗供应商额度。</p>
    <p className="external-page-note">截图识别可选 OpenAI 或 DeepSeek，在识图窗口单独选择。OpenAI 识图使用 GPT-6 Luna，与 OpenAI Decisions 共用 OpenRouter Key；DeepSeek 识图和文字解读共用 DeepSeek Key。各项分别记录耗时和费用。</p>
    {isDesktop && <button className="secondary" disabled={disabled || importing} onClick={importConfig}>导入配置（.env）</button>}
    <p className="secure-note"><ShieldCheck size={15} /> Key 在{isDesktop ? '电脑' : '手机'}本机加密保存，不会写进安装包。</p>
    <p role={feedbackError ? 'alert' : 'status'} className={`api-feedback${feedbackError ? ' error' : ''}`}>{feedback}</p>
  </section>;
}

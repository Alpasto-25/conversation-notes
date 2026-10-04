import { useState, type MouseEvent } from "react";
import { ArrowUpRight, ChevronRight, ShieldCheck } from "lucide-react";
import { BILLING_DISCLOSURE, PROVIDER_GUIDES, guideProvider } from "../shared/provider-guides";
import { isNative, openOfficialProviderPage } from "./platform";

export function BillingNotice({ compact = false }: { compact?: boolean }) {
  return (
    <aside className="billing-notice" aria-label="软件与模型服务费用说明">
      <h4><ShieldCheck size={16} /> {BILLING_DISCLOSURE.title}</h4>
      <p>{BILLING_DISCLOSURE.software}</p>
      <p>{BILLING_DISCLOSURE.responsibility}</p>
      {!compact && <p>{BILLING_DISCLOSURE.external}</p>}
    </aside>
  );
}

export function ProviderHelp({ provider, expanded = false }: { provider?: string; expanded?: boolean }) {
  const info = PROVIDER_GUIDES[guideProvider(provider)];
  const [error, setError] = useState("");
  async function open(event: MouseEvent<HTMLAnchorElement>, url: string) {
    if (!isNative) return;
    event.preventDefault();
    setError("");
    try { await openOfficialProviderPage(url); }
    catch { setError("无法打开系统浏览器，请复制官方链接后自行访问。不会影响已保存的 API 配置。"); }
  }
  function link(url: string, text: string) {
    return <a className="provider-link" href={url} target="_blank" rel="noopener noreferrer" onClick={(event) => void open(event, url)}>{text}<ArrowUpRight size={14} /></a>;
  }
  return (
    <section className="provider-help" aria-label={`${info.name} API 获取与充值指引`}>
      <details key={info.name} open={expanded}>
        <summary><ChevronRight size={16} aria-hidden="true" />如何获取 {info.name} API Key？</summary>
        <ol>{info.keySteps.map((step) => <li key={step}>{step}</li>)}</ol>
        <p>{info.billingSteps}</p>
        <p>保存后可点击“测试连接”；测试和正式分析都会调用供应商 API，可能消耗额度或产生费用。</p>
      </details>
      <div className="provider-links">
        {link(info.keyUrl, "前往官网获取 Key")}
        {link(info.billingUrl, info.billingLabel)}
        {link(info.docsUrl, "官方教程")}
      </div>
      <p className="external-page-note">将在浏览器打开供应商官网，本软件不收取任何款项，也不会向跳转链接附加 Key 或聊天内容。</p>
      {error && <p role="alert" className="api-feedback error">{error}</p>}
    </section>
  );
}

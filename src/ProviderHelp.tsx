import { useState, type MouseEvent } from "react";
import { ArrowUpRight, ChevronRight, ShieldCheck } from "lucide-react";
import { BILLING_DISCLOSURE, PROVIDER_GUIDES, guideProvider } from "../shared/provider-guides";
import { isNative, openOfficialProviderPage } from "./platform";

export function BillingNotice({ compact = false }: { compact?: boolean }) {
  return (
    <aside className="billing-notice" aria-label="软件与模型服务费用说明">
      <h4><ShieldCheck size={16} /> {BILLING_DISCLOSURE.title}</h4>
      <p>软件免费；请自备 API Key，模型费用由供应商收取。</p>
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
    catch { setError("无法打开浏览器，请复制官方链接访问。"); }
  }
  function link(url: string, text: string) {
    return <a className="provider-link" href={url} target="_blank" rel="noopener noreferrer" onClick={(event) => void open(event, url)}>{text}<ArrowUpRight size={14} /></a>;
  }
  return (
    <section className="provider-help" aria-label={`${info.name} API 获取与充值指引`}>
      <details key={info.name} open={expanded}>
        <summary><ChevronRight size={16} aria-hidden="true" />{info.name} Key 获取指引</summary>
        <ol>{info.keySteps.map((step) => <li key={step}>{step}</li>)}</ol>
        <p>{info.billingSteps}</p>
      </details>
      <div className="provider-links">
        {link(info.keyUrl, "获取 Key")}
        {link(info.billingUrl, info.billingLabel)}
        {link(info.docsUrl, "官方教程")}
      </div>
      <p className="external-page-note">在浏览器打开供应商官网。</p>
      {error && <p role="alert" className="api-feedback error">{error}</p>}
    </section>
  );
}

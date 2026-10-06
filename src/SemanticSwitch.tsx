export function SemanticSwitch({ enabled, change, disabled = false }: {
  enabled: boolean; change: (enabled: boolean) => void; disabled?: boolean;
}) {
  return <section className="semantic-switch">
    <p>表达方式与潜台词需要 DeepSeek。可选仅 DeepSeek，或 Jev 判断、DeepSeek 写解释。</p>
    <label><span>表达方式与潜台词</span><input type="checkbox" role="switch" aria-label="表达方式与潜台词"
      checked={enabled} onChange={e => change(e.target.checked)} disabled={disabled} /></label>
    <p>关闭后只做基础分析，开启会增加模型用量。</p>
  </section>;
}

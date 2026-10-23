import type { AnalysisUsage as UsageStats } from '../shared/usage';
import { DEEPSEEK_PRICE_DATE } from '../shared/billing';
import { ChevronRight } from 'lucide-react';
import { formatDuration, runModelSummary } from './usage-summary';

const number = (value: number | undefined) => value === undefined ? '未提供' : value.toLocaleString('zh-CN');
export function AnalysisUsage({ usage, runs, restored = false, description }: { usage?: UsageStats; runs?: UsageStats[]; restored?: boolean; description?: string }) {
  if (!usage) return null;
  const models = runModelSummary(usage, runs);
  return <div className="analysis-usage">
    {description && <p>{description}</p>}
    <p>总耗时 <strong>{formatDuration(usage.elapsed_ms)}</strong></p>
    <div className="usage-models">{models.map(model => <div className="usage-model-brief" key={model.model}>
      <span title={model.model}>{model.name}</span><span>{formatDuration(model.elapsed)}</span><strong>{model.cost}</strong>
    </div>)}</div>
    {!!usage.unreported_batches && <p>有请求未返回完整用量，费用尚不完整。</p>}
    <details className="usage-technical"><summary><ChevronRight size={16} aria-hidden="true" />详细用量</summary>
      <p>模型旁为调用耗时，总耗时还包含等待和处理时间。费用以平台账单为准。</p>
      {restored && <p>查看或恢复本机结果不会产生新费用。</p>}
      <dl><div><dt>已返回用量的请求</dt><dd>{number(usage.requests)} 次</dd></div>
        {!!usage.local_targets && <div><dt>本机复用</dt><dd>{usage.local_targets} 条</dd></div>}</dl>
      {models.map(model => <section key={model.model} className="usage-model">
        <h4>{model.name}<span>{model.model}</span></h4>
        <dl><div><dt>输入 tokens</dt><dd>{number(model.input_tokens)}</dd></div>
          <div><dt>输出 tokens</dt><dd>{number(model.output_tokens)}</dd></div>
          {model.prompt_cache_hit_tokens !== undefined && <div><dt>缓存命中 tokens</dt><dd>{number(model.prompt_cache_hit_tokens)}</dd></div>}
          <div><dt>费用</dt><dd>{model.cost}</dd></div></dl>
        {model.cost_usd !== undefined && <p>平台返回费用（美元）：${model.cost_usd.toFixed(8)}</p>}
        {model.fee && <p>人民币为预估费用；缺少缓存或计费时间时显示范围。价格核对：{DEEPSEEK_PRICE_DATE}。</p>}
      </section>)}
    </details>
  </div>;
}

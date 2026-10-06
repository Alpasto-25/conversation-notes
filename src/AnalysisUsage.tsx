import type { AnalysisUsage as UsageStats } from '../shared/usage';
import { summarizeModelUsage, deepseekRate, DEEPSEEK_PRICE_DATE } from '../shared/billing';
import { ChevronRight } from 'lucide-react';

const number = (value: number | undefined) => value === undefined ? '未提供' : value.toLocaleString('zh-CN');
const money = (value: number) => value === 0 ? '¥0' : value < 0.0001 ? '小于 ¥0.0001' : `¥${value.toFixed(4)}`;
export function AnalysisUsage({ usage, runs, restored = false, combined = false }: {
  usage?: UsageStats; runs?: UsageStats[]; restored?: boolean; combined?: boolean;
}) {
  if (!usage) return null;
  const { models, unattributed } = summarizeModelUsage(runs ?? [usage]);
  const hasDeepseek = models.some(model => model.kind === 'deepseek');
  return <div className="analysis-usage">
    <p>{combined ? '当前对话的基础分析与潜台词用量。' : '本次分析用量。'}{restored ? '恢复已保存结果不产生新费用。' : ''}</p>
    <dl className="usage-overview">
      {usage.finished_at && <div><dt>分析时间</dt><dd>{new Date(usage.finished_at).toLocaleString('zh-CN', { hour12: false })}</dd></div>}
      {usage.requests !== undefined && <div><dt>接口请求</dt><dd>{number(usage.requests)} 次</dd></div>}
      <div><dt>{combined ? '累计耗时' : '耗时'}</dt><dd>{(usage.elapsed_ms / 1000).toFixed(1)} 秒</dd></div>
      {!!usage.local_targets && <div><dt>本机复用</dt><dd>{number(usage.local_targets)} 条 · 不收费</dd></div>}
    </dl>
    {models.map(model => <section className="usage-model" key={model.model} aria-label={`${model.kind === 'jev' ? 'Jev' : model.kind === 'deepseek' ? 'DeepSeek' : '模型'} 用量`}>
      <h4>{model.kind === 'jev' ? 'Jev' : model.kind === 'deepseek' ? 'DeepSeek' : '其他模型'}<span>{model.model}</span></h4>
      {model.kind === 'jev' ? <p>Jev 接口不提供详细用量，无法估算费用，请以平台账单为准。</p> : !model.records.length ? <p>这份旧记录未单独记录此模型用量。</p> : <>
        <dl>
          {model.kind === 'deepseek' && <div className="usage-cost"><dt>预估费用</dt><dd><strong>{model.fee
            ? Math.abs(model.fee.max - model.fee.min) < 1e-10 || model.fee.max < 0.0001 ? money(model.fee.max) : `${money(model.fee.min)} ～ ${money(model.fee.max)}`
            : '暂无法估算'}</strong></dd></div>}
          <div><dt>输入 tokens</dt><dd>{number(model.input_tokens)}</dd></div>
          {model.prompt_cache_hit_tokens !== undefined && <div><dt>其中缓存命中</dt><dd>{number(model.prompt_cache_hit_tokens)}</dd></div>}
          {model.prompt_cache_miss_tokens !== undefined && <div><dt>其中未命中</dt><dd>{number(model.prompt_cache_miss_tokens)}</dd></div>}
          <div><dt>输出 tokens</dt><dd>{number(model.output_tokens)}</dd></div>
        </dl>
        {model.fee && (model.fee.missingCache || model.fee.uncertainTime) && <p>缓存或计费时段信息不全，显示费用范围。</p>}
        {model.kind === 'deepseek' && !model.fee && !unattributed && <p>这份记录的模型或时间缺少对应价格，无法估费。</p>}
        {model.kind === 'deepseek' && deepseekRate(model.model) && <details className="usage-pricing">
          <summary><ChevronRight size={16} aria-hidden="true" />计费方式</summary>
          <p>每百万 tokens 的空闲单价：缓存命中 ¥{deepseekRate(model.model)!.hit}，未命中 ¥{deepseekRate(model.model)!.miss}，输出 ¥{deepseekRate(model.model)!.output}；高峰单价为两倍。</p>
          <p>高峰：北京时间周一至周五 9–12 时、14–18 时，节假日除外。费用按三项用量分别乘单价后相加。</p>
          <p>价格核对日期：{DEEPSEEK_PRICE_DATE}。</p>
        </details>}
      </>}
    </section>)}
    {unattributed && <p>部分旧记录未按模型记录用量，无法完整拆分或估费。</p>}
    {hasDeepseek && <p className="usage-footnote">仅按已返回用量估算 DeepSeek 费用，实际扣费以平台账单为准。{models.some(model => model.kind === 'jev') ? '不含 Jev 费用。' : ''}</p>}
  </div>;
}

import { planAnalysis } from './analysis-plan';
import type { Message, Relation } from '../shared/types';
import type { SavedConversation } from './storage';
import type { AnalysisConfiguration, SemanticMode } from '../shared/analysis-mode';
import { useEffect, useState } from 'react';

export function AnalysisPlan({ messages, relation, saved, config, semanticEnabled, semanticMode, fresh = false }: {
  messages: Message[]; relation: Relation; saved?: SavedConversation; config: AnalysisConfiguration | null;
  semanticEnabled: boolean; semanticMode?: SemanticMode; fresh?: boolean;
}) {
  const [plan, setPlan] = useState<ReturnType<typeof planAnalysis>>();
  const [error, setError] = useState('');
  const configKey = JSON.stringify(config);
  useEffect(() => {
    if (!config) return;
    let live = true, worker: Worker | undefined;
    setPlan(undefined); setError('');
    const fallback = () => setTimeout(() => { if (!live) return; try { setPlan(planAnalysis(messages, relation, saved, config, semanticEnabled, semanticMode, fresh)); } catch { setError('暂时无法估算，请先只保存记录。'); } }, 0);
    try {
      if (typeof Worker === 'undefined') { fallback(); return () => { live = false; }; }
      worker = new Worker(new URL('./analysis-plan.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => { if (live) data.ok ? setPlan(data.plan) : setError('暂时无法估算，请先只保存记录。'); worker?.terminate(); };
      worker.onerror = () => { worker?.terminate(); fallback(); };
      worker.postMessage([messages, relation, saved, config, semanticEnabled, semanticMode, fresh]);
    } catch { worker?.terminate(); fallback(); }
    return () => { live = false; worker?.terminate(); };
  }, [messages, relation, saved?.messages, saved?.lines, saved?.events, saved?.completed, saved?.analyzedCount, saved?.analysisIdentity?.model, saved?.analysisIdentity?.provider, configKey, semanticEnabled, semanticMode, fresh]);
  if (!config) return <p role="status">正在读取本机模型配置…</p>;
  if (!plan) return <p role="status">{error || '正在本机预检处理范围与预计用量…'}</p>;
  return <section className="analysis-plan" aria-label="分析前预检">
    <h3>本次分析范围</h3>
    <p>{plan.total} 条消息 · 模型 {plan.model} · 已有逐句结果 {plan.retained} 条。</p>
    <p>预计基础处理 {plan.batches} 批{semanticEnabled ? `，另有约 ${plan.semanticStages} 批表达方式与潜台词处理` : ''}。上下文变化和重试可能增加请求。</p>
    {plan.fee && <p>DeepSeek 粗估 ¥{plan.fee.min.toFixed(4)}～¥{plan.fee.max.toFixed(4)}。{plan.hasJev ? '不含决策判断模型费用。' : ''}</p>}
    {plan.hasJev && <p>{plan.hasOpenAI ? 'OpenAI Decisions 用量及美元费用将在请求完成后按平台返回值显示。' : 'Jev 不提供完整用量，无法预估其费用。'}</p>}
    {plan.fee && <details><summary>估算条件</summary><p>按输入 UTF-8 字节数的 1/4～1 倍估算 tokens，每批输出假设 300～1500 tokens，并考虑缓存及峰谷价格。补充分析按每批约 32,000 字节输入估算。</p><p>使用 {plan.priceDate} 核对的价格。该区间不是费用上限，不含额外修复；实际以供应商账单为准。</p></details>}
    <p className="folder-help">总览预计参考 {plan.overviewCount} 条近期与历史原话，逐句处理分别选取上下文。预览、编辑和只保存不消耗模型额度。</p>
    {plan.error && <p className="error">{plan.error}</p>}
  </section>;
}

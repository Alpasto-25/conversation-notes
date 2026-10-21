import { analysisMode, type AnalysisConfiguration, type SemanticMode } from '../shared/analysis-mode';
import { incrementalJobs, overviewJob } from '../shared/incremental';
import { buildRequest } from '../shared/analysis-core';
import { deepseekRate, DEEPSEEK_PRICE_DATE } from '../shared/billing';
import { sameAnalysisModel } from '../shared/usage';
import type { Message, Relation } from '../shared/types';
import type { SavedConversation } from './storage';

export function planAnalysis(messages: Message[], relation: Relation, saved: SavedConversation | undefined,
  config: AnalysisConfiguration, semanticEnabled: boolean, preference?: SemanticMode, fresh = false) {
  const mode = analysisMode(config, semanticEnabled, preference);
  const identity = { provider: mode.primary.provider || '', model: mode.primary.model || '' };
  const append = !fresh && saved?.relation === relation && sameAnalysisModel(saved.analysisIdentity, identity)
    && saved.messages.length <= messages.length && saved.messages.every((m, i) => JSON.stringify(m) === JSON.stringify(messages[i]));
  const exact = append && saved.completed && saved.messages.length === messages.length;
  const lines = append ? saved.lines : {}, events = append ? saved.events : {};
  const deepseek = identity.provider === 'deepseek';
  const jobs = exact ? [] : incrementalJobs(messages, relation, 0, lines, events, !append || saved?.analyzedCount !== messages.length, deepseek);
  const overview = overviewJob(messages, relation, 0, events);
  const stages = exact ? [] : [overview, ...jobs, overview];
  let promptBytes = 0;
  for (const job of stages) { try { promptBytes += new TextEncoder().encode(JSON.stringify(buildRequest(job))).length; } catch { promptBytes += 32_000; } }
  const supplementary = semanticEnabled ? Math.ceil(messages.filter(m => m.sender === 'other' && m.kind === 'text').length / (mode.judge ? 6 : 12)) : 0;
  const semanticStages = supplementary * (mode.judge ? 2 : 1);
  const deepseekStages = (deepseek ? stages.length : 0) + supplementary;
  const deepseekBytes = (deepseek ? promptBytes : 0) + supplementary * 32_000;
  const rate = deepseekRate(deepseek ? identity.model : mode.deepseek.model || '');
  const fee = rate && deepseekStages ? {
    min: (deepseekBytes / 4 * rate.hit + deepseekStages * 300 * rate.output) / 1_000_000,
    max: (deepseekBytes * rate.miss + deepseekStages * 1500 * rate.output) * 2 / 1_000_000,
  } : undefined;
  return { model: identity.model || '尚未配置', error: mode.error || (!mode.primary.configured ? '请先配置分析模型。' : ''),
    total: messages.length, newMessages: append ? messages.length - saved.messages.length : messages.length,
    retained: append ? Object.keys(lines).length : 0, batches: stages.length, semanticStages, fee,
    priceDate: DEEPSEEK_PRICE_DATE, overviewCount: overview.messages.length, hasJev: !deepseek || !!mode.judge };
}

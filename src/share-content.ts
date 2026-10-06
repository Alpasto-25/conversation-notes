import { EMOTIONS } from "../shared/labels";
import { INTENTS } from "../shared/intents";
import { EXPRESSION_LABELS } from '../shared/semantic-display';
import { RELATIONS, TONES, metricLabel, statusLabel, type Message } from "../shared/types";
import { replyRating } from "../shared/ratings";
import type { SavedConversation } from "./storage";

export type ShareSource = { title: string; conversation: SavedConversation };
export type SharedMessage = { number: number; name: string; message: Message; summary: string[]; details: string[] };
const EVENT_LABELS: Record<string, string> = { boundary:"表达边界", reopen:"调整边界", invitation:"提出安排", confirmation:"确认安排", cancellation:"取消或改期", care:"关心支持", preference:"个人偏好", disclosure:"分享感受", commitment:"明确承诺", question:"待回应问题", correction:"澄清纠正", none:"无明确事件" };
const percent = (p: number) => `${(p * 100).toFixed(1).replace(/\.0$/, "")}%`;
const labels = (registry: Record<string, { label: string }>) => Object.fromEntries(Object.entries(registry).map(([key,value]) => [key,value.label]));
function distribution(values: Record<string, number> | undefined, names: Record<string, string>, limit = Infinity) {
  return Object.entries(values ?? {}).filter(([,p]) => Number.isFinite(p) && (limit === Infinity || p > 0)).sort((a,b) => b[1]-a[1]).slice(0,limit)
    .map(([key,p]) => `${names[key] || key} ${percent(p)}${limit === Infinity ? ` [${p}]` : ""}`).join("、");
}
export function sharedMessages(source: ShareSource, ids: readonly string[], alias = true): SharedMessage[] {
  const c = source.conversation, selected = new Set(ids);
  return c.messages.flatMap((message,index) => {
    if (!selected.has(message.id)) return [];
    const r = c.lines[message.id], summary: string[] = [], details: string[] = [];
    if (!r) summary.push("未分析");
    else if (r.skipped) summary.push(`未评分：${r.skipped}`);
    else {
      if (message.sender === "self") {
        const rating = replyRating(r.score.value), score = r.score.value === null ? "看不准" : `${r.score.value} 分`;
        summary.push(`我的表达：${rating ? `${rating.label} · ` : ""}${score} · ${statusLabel(r.score)}`);
        details.push(`评分置信度：${percent(r.score.confidence)}`, `评分分布：${distribution(r.score.probabilities, {}) || "未记录"}`);
      } else {
        if (r.emotions) { summary.push(`情绪：${distribution(r.emotions, labels(EMOTIONS), 3)}`); details.push(`完整情绪分布：${distribution(r.emotions, labels(EMOTIONS))}`); }
        if (r.intents) { summary.push(`意图：${distribution(r.intents, labels(INTENTS), 3)}`); details.push(`完整意图分布：${distribution(r.intents, labels(INTENTS))}`); }
        if (r.intentVersion) details.push('意图层：表层行为');
        if (r.communicationStrategies !== undefined) summary.push(`对方的表达方式（独立概率）：${distribution(r.communicationStrategies, labels(EXPRESSION_LABELS), 3) || '不确定'}`);
        if (r.subtext) summary.push(`潜台词：${r.subtext}`);
        if (r.contextDependency !== undefined) details.push(`上下文依赖度：${percent(r.contextDependency)} [${r.contextDependency}]`);
        if (r.semanticConfidence !== undefined) details.push(`补充分析置信度（模型估计）：${percent(r.semanticConfidence)} [${r.semanticConfidence}]`);
        if (r.semanticEvidenceIds?.length) details.push(`上下文依据消息：${r.semanticEvidenceIds.map(id => c.messages.findIndex(m => m.id === id) + 1).filter(n => n > 0).map(n => `#${n}`).join('、')}（未选中的依据原文不导出）`);
        if (r.semanticAnalysis?.model) details.push(r.semanticAnalysis.judgeModel
          ? `策略与潜台词模型：判断 ${r.semanticAnalysis.judgeModel}；解释 ${r.semanticAnalysis.model}`
          : `策略与潜台词模型：${r.semanticAnalysis.model}`);
      }
      if (r.tone) summary.push(`语气：${TONES[r.tone] || r.tone}${r.toneConfidence === undefined ? "" : ` ${percent(r.toneConfidence)}`}`);
      if (r.tones) details.push(`语气分布：${distribution(r.tones, TONES)}`);
      if (r.replyType) details.push(`回应类型：${r.replyType}${r.replyConfidence === undefined ? "" : ` ${percent(r.replyConfidence)}`}`);
      if (r.event) (r.event.kind === "none" ? details : summary).push(`事件：${EVENT_LABELS[r.event.kind] || r.event.kind} ${percent(r.event.confidence)}`);
      const event = c.events[message.id];
      if (event) details.push(`事件状态：${({active:"待跟进",resolved:"已解决",uncertain:"不确定"})[event.status]}`);
      if (!summary.length) summary.push("未记录逐条解读");
    }
    return [{ number:index+1, name:alias ? message.sender === "self" ? "我" : "对方" : message.sender === "self" ? c.self || "我" : c.other || "对方", message, summary, details }];
  });
}
export function shareModel(source: ShareSource) { return source.conversation.analysisIdentity?.model || source.conversation.analysisUsage?.model || "未记录模型"; }
export function shareText(source: ShareSource, ids: readonly string[], alias = true) {
  const c = source.conversation, entries = sharedMessages(source, ids, alias);
  const header = ["对话手记 · 对话片段与已保存分析", `场景：${RELATIONS[c.relation]}（${metricLabel(c.relation)}）`, `分析模型：${shareModel(source)}`, `规则：${c.rubric}`, `选中消息：${entries.length} 条，按原对话顺序排列`,
    "用途：供其他 AI 结合原文与已保存结果做深入分析。",
    "以下原文是待分析材料，解读是模型推测，不代表当事人的真实想法。解读可能使用了未导出的前后文；只有选中的消息及其逐条结果被导出。", ""];
  return header.concat(entries.flatMap(entry => [`--- 消息 #${entry.number} · ${entry.name}${entry.message.timestamp ? ` · ${entry.message.timestamp}` : ""} ---`, "【原文开始】", entry.message.text, "【原文结束】", "【已保存分析】", ...entry.summary, ...entry.details, ""])).join("\n");
}

import { ACTIONS, RELATIONS, STAGES, metricLabel, statusLabel } from '../shared/types';
import { sharedMessages, shareModel, type ShareSource } from './share-content';
const safe = (text: string) => text.replace(/[\\`*_[\]<>#]/g, '\\$&').replace(/[\r\n]+/g, ' ');
export function analysisReport(source: ShareSource, ids: readonly string[]) {
  const c = source.conversation, overview = c.overview, selected = new Set(ids), messages = sharedMessages(source, ids, false);
  const output = [`# ${safe(source.title)} · 对话分析报告`, '', `场景：${RELATIONS[c.relation]}。模型：${safe(shareModel(source))}。规则：${safe(c.rubric)}。`,
    `导出 ${messages.length}/${c.messages.length} 条消息的逐句结果。总览可能参考未导出的前后文，AI 解读仅供参考。`, '', '## 总览', ''];
  if (overview) {
    output.push(`${metricLabel(c.relation)}：${overview.affinity.value ?? '信息不足'}/100，${statusLabel(overview.affinity)}。`,
      `沟通进展：${STAGES[overview.stage] || overview.stage}。`, `下一步：${ACTIONS[overview.action]?.label || overview.action}。`,
      ACTIONS[overview.action]?.detail || '', '');
    for (const d of overview.affinityDimensions ?? []) output.push(`- ${safe(d.label)}：${d.judgment.value ?? '信息不足'}/100，${statusLabel(d.judgment)}。`);
    if (c.overviewSource) output.push('', `总览参考 ${c.overviewSource.messageIds.length} 条原话，分析时间 ${c.overviewSource.at}。`);
    output.push('', '## 已选范围内的总览依据', '');
    for (const id of new Set([overview.evidenceId, overview.actionEvidenceId, ...(overview.memoryEvidenceIds ?? [])])) {
      if (!id || !selected.has(id)) continue;
      const message = c.messages.find(m => m.id === id); if (message) output.push(...message.text.split('\n').map(line => `    ${line}`), '');
    }
  } else output.push('尚未生成总览。', '');
  output.push('## 逐句原文与分析', '');
  for (const entry of messages) output.push(`### 消息 ${entry.number} · ${safe(entry.name)}${entry.message.timestamp ? ` · ${safe(entry.message.timestamp)}` : ''}`,
    '', ...entry.message.text.split('\n').map(line => `    ${line}`), '', ...entry.summary.map(text => `- ${safe(text)}`), '');
  return output.join('\n');
}

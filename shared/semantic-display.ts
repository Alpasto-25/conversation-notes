import { topStrategies, type SemanticFields, type StrategyKey } from './semantics';

// Display wording only: keep the model's strategy keys, judgment rules and saved probabilities intact.
export const EXPRESSION_LABELS: Record<StrategyKey, { label: string; description: string }> = {
  direct: { label: '直接表达', description: '直接说出自己的态度、感受或需要。' },
  indirect: { label: '委婉表达', description: '用含蓄、留余地的方式表达。' },
  avoidance: { label: '回避话题', description: '避开对话中已经提出的重点。' },
  withdrawal: { label: '收起交流', description: '收回表达或暂时退出交流，需要结合前后文理解。' },
  protest: { label: '间接表达不满', description: '通过否认、短答或退让表达不满。' },
  sarcasm: { label: '用反话表达', description: '字面说法与实际态度不同，可能借反话表达不满或反击。' },
  probe: { label: '试探反应', description: '观察对方是否察觉或回应自己的态度。' },
  reassurance: { label: '寻求确认', description: '希望得到对方在意、理解或接纳自己的明确回应。' },
  support: { label: '寻求支持', description: '希望得到关注、陪伴或安慰。' },
  boundary: { label: '表达边界', description: '说明自己的限制或需要的空间。' },
  deescalate: { label: '缓和分歧', description: '通过解释、让步或理解对方降低冲突。' },
  escalate: { label: '加重分歧', description: '这句话中的指责或反击可能使已有分歧加剧。' },
};
export function expressionStrategies(values?: SemanticFields['communicationStrategies']) {
  return topStrategies(values).map(item => ({ ...item, ...EXPRESSION_LABELS[item.key as StrategyKey] }));
}

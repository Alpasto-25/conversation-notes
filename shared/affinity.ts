import { isRomantic, type Judgment, type Relation } from "./types";
export const AFFINITY_DIMENSIONS = [
  {
    key: "initiative",
    label: "主动延续",
    weight: 15,
    question: "other 是否主动开启或延续与 self 的交流？不要靠消息条数推断。",
    levels: [
      "明确不愿继续交流",
      "有交流机会但只被动应付或反复终止话题",
      "自然接话，愿意保持交流",
      "主动追问、展开话题或在结束后重新找话题",
      "持续主动创造交流机会，并具体表达想与 self 保持联系",
    ],
  },
  {
    key: "engagement",
    label: "回应投入",
    weight: 20,
    question:
      "other 对 self 说的具体内容投入了多少注意与回应？短句、回复慢、忙碌本身不扣分。",
    levels: [
      "明确无视或贬低 self 的表达",
      "多次有回应机会却回避重点、只作敷衍应答",
      "正常回应问题，基本接得住话题",
      "回应细节、接住玩笑或认真展开 self 的话题",
      "持续专注地理解和回应 self，主动跟进此前提到的具体事情",
    ],
  },
  {
    key: "care",
    label: "关心体贴",
    weight: 20,
    question:
      "other 是否针对 self 的感受、需要和处境表达个人化关心？礼貌客套与具体关心分开判断。",
    levels: [
      "明确嘲弄或漠视已表达的困难和感受",
      "在 self 表达需要时明显不愿回应或只敷衍",
      "普通礼貌与基本照顾，未见针对个人的特别关心",
      "具体理解、安慰 self，记得其偏好或困扰",
      "主动持续照顾 self 的感受和需要，并提供具体支持",
    ],
  },
  {
    key: "openness",
    label: "自我开放",
    weight: 15,
    question:
      "other 是否愿意让 self 了解自己的生活、感受和个人想法？正常隐私边界不是疏远。",
    levels: [
      "明确拒绝让 self 了解自己并要求保持距离",
      "有相关话题但刻意保持非常表面的交流",
      "自然分享一般日常与观点",
      "主动分享个人细节、真实感受或寻求 self 的看法",
      "展现明显信任，主动分享脆弱感受、重要经历或内心想法",
    ],
  },
  {
    key: "intimacy",
    label: "亲密表达",
    weight: 20,
    question:
      "other 是否对 self 表达被双方接纳的特别亲近或恋爱意味？朋友间热闹、通用表情、普通夸奖不自动等于暧昧。情侣也需看当前实际表达，不按关系设置加分。",
    levels: [
      "明确拒绝恋爱或亲密接近，且当前仍有效",
      "明确限定普通关系、排除暧昧意味",
      "友好自然但没有明确恋爱意味，或亲近暗示尚不确定",
      "有针对 self 的特别称赞、想念、亲昵称呼或被接住的暧昧",
      "明确表达恋爱喜欢、爱意或双方接纳的亲密愿望",
    ],
  },
  {
    key: "action",
    label: "实际行动",
    weight: 10,
    question:
      "other 是否愿意把接近 self 落实为时间安排或具体行动？没有邀约机会不等于拒绝。因忙改期且给出替代安排是积极信号。",
    levels: [
      "明确拒绝进一步接触，且没有替代意愿",
      "有推进机会却反复含糊回避或拒绝且无替代安排",
      "只谈一般可能性，或这段聊天尚未涉及具体行动",
      "主动提出、接受具体相处安排，或没空但积极给出替代安排",
      "双方具体安排得到确认，或有直接文字证据表明已兑现关心与相处行动",
    ],
  },
] as const;
export const COMMUNICATION_DIMENSIONS = [
  {
    key: "engagement",
    label: "回应投入",
    weight: 20,
    question:
      "other 是否回应 self 的具体内容和重点？简洁回复、异步沟通和忙碌本身不扣分。",
    levels: [
      "明确无视、贬低或反复绕开重要表达",
      "有回应机会却只敷衍，关键问题持续未被接住",
      "基本回应了问题或话题",
      "针对细节认真回应，或说明何时可以回复",
      "持续回应关键内容，主动跟进此前的问题或需要",
    ],
  },
  {
    key: "understanding",
    label: "理解确认",
    weight: 20,
    question:
      "other 是否理解和核对 self 的意思、需要或目标？提出合理异议不等于缺乏理解。",
    levels: [
      "明确歪曲、否定表达，误解被指出后仍拒绝澄清",
      "多次错过重点，未回应已有的澄清机会",
      "基本接住意思，但关键理解尚未核对",
      "准确回应重点，主动确认含糊之处",
      "明确核对并协调双方的理解、需要或目标",
    ],
  },
  {
    key: "respect",
    label: "尊重边界",
    weight: 20,
    question:
      "other 是否尊重 self 的选择、时间、隐私和已表达的边界？礼貌拒绝、表达自己的边界和合理不同意见可以是积极证据，不要求服从。",
    levels: [
      "明确威胁、羞辱、强迫或无视已提出的边界",
      "反复施压、越界，或否定对方合理选择",
      "基本有分寸，未见明确越界或特别的边界协商",
      "清晰礼貌地表达不同意见、拒绝或限制，并尊重对方选择",
      "主动确认和照顾双方边界，协商方式具体且不施压",
    ],
  },
  {
    key: "support",
    label: "支持配合",
    weight: 15,
    question:
      "other 是否对 self 明确表达的情绪、需求或任务提供适合场景的支持？工作和业务场景不要求亲昵称呼或个人化关心。",
    levels: [
      "明确嘲弄困难或阻碍合理沟通",
      "在需要已被表达且有回应机会时，只推诿或敷衍",
      "基本礼貌、正常交流或一般配合",
      "具体接住需要，提供情绪支持、信息或可行帮助",
      "持续主动协调资源、支持需要或解决已有困难",
    ],
  },
  {
    key: "clarity",
    label: "表达清晰",
    weight: 15,
    question:
      "other 是否清楚表达相关信息、需要、立场或限制？只看当前交流所需内容，正常隐私和不分享私人经历不扣分。",
    levels: [
      "在原文可验证的关键事项上明确自相矛盾，且拒绝说明",
      "有必要澄清却持续含糊，造成明显理解障碍",
      "主要意思可理解，部分细节未展开",
      "信息、需要或限制表达具体，必要时解释原因",
      "主动补齐关键条件，清楚说明可做、不能做和待确认的事项",
    ],
  },
  {
    key: "followthrough",
    label: "行动跟进",
    weight: 10,
    question:
      "涉及约定、任务或共同安排时，other 是否明确跟进？没谈到行动不当成负面证据；成交、履约或线下行动必须有原文支持。",
    levels: [
      "有明确承诺却在原文中确认违背，且拒绝处理",
      "对已有安排反复推诿，未提供下一步或说明",
      "有一般行动意向，或这段交流尚未涉及具体行动",
      "明确下一步、时间或替代方案，愿意协调",
      "安排已被双方确认，或原文明确证明相关行动已兑现",
    ],
  },
] as const;
export function dimensionsForRelation(relation: Relation) {
  return isRomantic(relation) ? AFFINITY_DIMENSIONS : COMMUNICATION_DIMENSIONS;
}
export type AffinityDimension = {
  key: string;
  label: string;
  weight: number;
  judgment: Judgment;
};
export function composeAffinity(
  dimensions: AffinityDimension[],
  boundary: number,
) {
  const total = dimensions.reduce((s, d) => s + d.weight, 0);
  if (!total || dimensions.some((d) => d.judgment.value === null))
    throw new Error("分析维度缺失");
  const rawValue = Math.round(
    dimensions.reduce((s, d) => s + d.weight * d.judgment.value!, 0) / total,
  );
  const confidence =
    dimensions.reduce((s, d) => s + d.weight * d.judgment.confidence, 0) /
    total;
  const status = dimensions.some((d) => d.judgment.status === "insufficient")
    ? "insufficient"
    : dimensions.some((d) => d.judgment.status === "ambiguous")
      ? "ambiguous"
      : "clear";
  const boundaryApplied = boundary >= 0.8;
  return {
    affinity: {
      value: boundaryApplied ? Math.min(25, rawValue) : rawValue,
      confidence,
      status,
      probabilities: {},
    } as Judgment,
    rawValue,
    boundaryApplied,
  };
}

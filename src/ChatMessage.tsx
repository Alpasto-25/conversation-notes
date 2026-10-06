import type { ReactNode } from "react";
import type { LineResult, Message } from "../shared/types";
import { topEmotions } from "../shared/labels";
import { topIntents } from "../shared/intents";
import { replyRating } from "../shared/ratings";
import { expressionStrategies } from '../shared/semantic-display';

// The reading view, share preview and image export use the same message layout.
export function ChatMessage({ message: m, result: r, self, other, showTime, busy = false, showSemantics = true, detail, analyze, trailing }: {
  message: Message; result?: LineResult; self: string; other: string; showTime: boolean;
  busy?: boolean; showSemantics?: boolean; detail?: () => void; analyze?: () => void; trailing?: ReactNode;
}) {
  const strategies = expressionStrategies(r?.communicationStrategies);
  function tag(className: string, children: ReactNode, label: string, pending = false) {
    return detail || analyze ? <button type="button" className={className} aria-label={label}
      disabled={pending && busy} onClick={pending ? analyze : detail}>{children}</button>
      : <span className={className}>{children}</span>;
  }
  return <>
    {showTime && m.timestamp && <div className="timestamp">{m.timestamp.replace(/^\d{4}年/, "")}</div>}
    <div className="message-row">
      <div className={`avatar ${m.sender === "self" ? "mine" : ""}`}>{(m.sender === "self" ? self : other).slice(0, 1)}</div>
      <div className="message-content">
        <div className="bubble">{m.text}</div>
        {m.kind === "text" && <div className={`message-tags ${m.sender}`}>
          {r?.skipped ? <span className="pending-tag">{r.skipped}</span> : m.sender === "other" ? <>
            <div className="analysis-row emotion-row"><span className="analysis-row-label">情绪</span><div className="analysis-chips">
              {r?.emotions ? topEmotions(r.emotions).map(emotion => <span className="analysis-chip" key={emotion.key}>
                {tag(`emotion-tag emotion-${emotion.key}`, <><span>{emotion.label}</span><b>{emotion.percent}</b></>, `${emotion.label} ${emotion.percent}，查看情绪分析：${m.text}`)}
              </span>) : tag("pending-tag", busy ? "分析中" : "分析情绪", "分析情绪", true)}
            </div></div>
            <div className="analysis-row intent-row"><span className="analysis-row-label">意图</span><div className="analysis-chips">
              {r?.intents ? topIntents(r.intents).map(intent => <span className="analysis-chip" key={intent.key}>
                {tag("intent-tag", <><span>{intent.label}</span><b>{intent.percent}</b></>, `${intent.label} ${intent.percent}，查看意图分析：${m.text}`)}
              </span>) : tag("pending-tag", busy ? "分析中" : "分析意图", "分析意图", true)}
            </div></div>
            {showSemantics && r?.communicationStrategies !== undefined && <div className="analysis-row strategy-row"><span className="analysis-row-label">表达方式</span><div className="analysis-chips">
              {strategies.map(strategy => <span className="analysis-chip" key={strategy.key}>
                {tag('strategy-tag', <><span>{strategy.label}</span><b>{strategy.percent}</b></>, `${strategy.label} ${strategy.percent}，查看对方的表达方式：${m.text}`)}
              </span>)}
              {!strategies.length && <span className="semantic-empty">表达方式不确定</span>}
            </div></div>}
            {showSemantics && r?.subtext && <div className="analysis-row subtext-row"><span className="analysis-row-label">潜台词</span>
              {detail ? <button type="button" className="subtext-text" onClick={detail} aria-label={`查看潜台词依据：${r.subtext}`}>
                {r.subtext}
              </button> : <span className="subtext-text">{r.subtext}</span>}
            </div>}
          </> : r ? tag("reply-tag", <><span>回复评级：</span><b>{replyRating(r.score.value)?.label ?? "待判断"}</b></>, `查看回复评价：${m.text}`)
            : tag("pending-tag", busy ? "分析中" : "评价回复", "评价回复", true)}
        </div>}
      </div>
      {trailing}
    </div>
  </>;
}

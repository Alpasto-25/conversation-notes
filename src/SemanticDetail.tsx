import { expressionStrategies } from '../shared/semantic-display';
import type { LineResult, Message } from '../shared/types';

export function SemanticDetail({ result, messages }: { result?: LineResult; messages: Message[] }) {
  if (result?.communicationStrategies === undefined && !result?.subtext) return null;
  const strategies = expressionStrategies(result.communicationStrategies);
  return <>
    {result.communicationStrategies !== undefined && <>
      <h3 className="intent-detail-heading">对方的表达方式</h3>
      {strategies.map(strategy => <div className="intent-detail-item" key={strategy.key}>
        <div><strong>{strategy.label}</strong></div>
        <p>{strategy.description}</p>
      </div>)}
      {!strategies.length && <p>表达方式不确定。</p>}
    </>}
    {result.subtext && <>
      <h3 className="intent-detail-heading">潜台词</h3>
      <p className="semantic-explanation"><strong>{result.subtext}</strong></p>
      {!!result.semanticEvidenceIds?.length && <details className="semantic-evidence"><summary>查看上下文依据</summary>
        {result.semanticEvidenceIds.map(id => messages.find(m => m.id === id)).filter((m): m is Message => !!m)
          .map(message => <blockquote key={message.id}>{message.text}</blockquote>)}
      </details>}
    </>}
  </>;
}

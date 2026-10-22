import { useState } from 'react';
import type { Trend } from './storage';
import { RELATIONS } from '../shared/types';
import { ToggleSelect } from './ToggleSelect';
import { providerName } from '../shared/models';
export function AnalysisTimeline({ points }: { points: Trend[] }) {
  const all = [...new Map(points.map(point => [`${point.at}:${point.model}:${point.count}`, point])).values()].sort((a, b) => a.at.localeCompare(b.at));
  const family = (p: Trend) => p.model && p.rubric && p.relation ? `${providerName(p.provider) || '来源未知'} · ${p.model} · ${RELATIONS[p.relation]} · ${p.rubric}` : '旧记录（来源不完整，不连线）';
  const groups = [...new Set(all.map(family))], [selected, setSelected] = useState(groups.at(-1) || '');
  const group = groups.includes(selected) ? selected : groups.at(-1), rows = all.filter(p => family(p) === group), plotted = rows.filter(p => p.value !== null && p.model && p.rubric && p.relation).slice(-50);
  const x = (i: number) => 32 + i / Math.max(1, plotted.length - 1) * 520, y = (p: Trend) => 152 - p.value! * 1.3;
  return <section aria-label="有来源的分析历史"><h3>分析历史</h3><p>横轴是本机执行分析的顺序。聊天日期范围和消息数随每个点记录；分数变化不能直接当作按日的关系变化。</p>
    {!all.length ? <p>完成分析后将保留带模型、规则和聊天日期范围的记录。</p> : <>
      <label className="field">比较范围<ToggleSelect aria-label="分析历史比较范围" value={group || ''} onChange={setSelected}>{groups.map(key => <option key={key}>{key}</option>)}</ToggleSelect></label>
      {!!plotted.length && <svg className="analysis-timeline" viewBox="0 0 580 180" role="img" aria-label="同模型、同场景、同规则的最近分析评分历史">
        <path d="M32 22 V152 H560" fill="none" stroke="var(--line-strong)" /><text x="4" y="26">100</text><text x="15" y="155">0</text>
        <polyline points={plotted.map((p, i) => `${x(i)},${y(p)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" />
        {plotted.map((p, i) => <circle key={p.at} cx={x(i)} cy={y(p)} r="4" fill="var(--accent)"><title>{`${p.at} · ${p.value} 分 · ${p.count} 条 · 聊天 ${p.chatFrom || '未记录'} 至 ${p.chatTo || '未记录'}`}</title></circle>)}
      </svg>}
      <div className="analysis-timeline-table"><table><thead><tr><th>分析时间</th><th>聊天日期范围</th><th>消息数</th><th>分数</th></tr></thead><tbody>{[...rows].reverse().map(p => <tr key={`${p.at}:${p.count}`}><td>{new Date(p.at).toLocaleString('zh-CN')}</td><td>{p.chatFrom || '未记录'}～{p.chatTo || '未记录'}</td><td>{p.count}</td><td>{p.value ?? '信息不足'}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}

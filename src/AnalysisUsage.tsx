import type { AnalysisUsage as UsageStats } from '../shared/usage';
import { groupRequestUsage } from '../shared/usage';
import { ChevronRight } from 'lucide-react';
export function AnalysisUsage({ usage, restored = false }: { usage?: UsageStats; restored?: boolean }) {
  if (!usage) return null;
  const number = (value: number | undefined) => value === undefined ? '未提供' : value.toLocaleString('zh-CN');
  const time = (value?: string) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未记录';
  const rate = (hit?: number, input?: number) => hit !== undefined && input ? `${(100 * hit / input).toFixed(1)}%` : '未提供';
  const details = [...(usage.details ?? [])].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const groups = groupRequestUsage(details);
  const taskName = (stage: string) => ({ initial_overview: '初始总览', final_overview: '最终总览', overview: '总览', self_message: '我的表达', other_messages: '对方情绪、意图与事件', connection: '连接测试' }[stage] ?? stage);
  const validationName = (validation?: string) => ({ accepted: '通过', repair_needed: '需要补全', rejected: '仍未通过' }[validation ?? ''] ?? '未记录');
  const questionName = (kind: string) => ({ emotions: '情绪', intents: '意图', event: '事件', score: '评分', evidence: '证据', noul: '真假概率', other: '其他问题' }[kind] ?? '其他问题');
  const issueName = (code: string) => ({ missing: '缺少答案', json: 'JSON 无法读取', shape: '返回结构不符', type: '问题类型不符', unknown_candidate: '使用了其他选项', duplicate_candidate: '候选重复', invalid_weight: '权重不是合法数字', no_positive_weight: '空或全零权重', probability_mass: '概率分布不完整', invalid_noul: '真假概率格式不符', invalid_confidence: '置信度格式不符', conflicting_ids: '混用两套题号' }[code] ?? '返回结构不符');
  return <div className="analysis-usage">
    {restored && <p>这是上次保存的分析用量，恢复结果没有产生新请求；切换当前模型不会改变这些历史数字。</p>}
    <dl>
      <div><dt>分析模型</dt><dd>{usage.model ?? '旧记录未保存'}</dd></div>
      <div><dt>开始时间</dt><dd>{time(usage.started_at)}</dd></div>
      <div><dt>结束时间</dt><dd>{time(usage.finished_at)}</dd></div>
      <div><dt>接口请求</dt><dd>{number(usage.requests)}</dd></div>
      <div><dt>输入 tokens</dt><dd>{number(usage.input_tokens)}</dd></div>
      <div><dt>缓存命中 tokens</dt><dd>{number(usage.prompt_cache_hit_tokens)}</dd></div>
      <div><dt>缓存未命中 tokens</dt><dd>{number(usage.prompt_cache_miss_tokens)}</dd></div>
      <div><dt>输入命中率</dt><dd>{rate(usage.prompt_cache_hit_tokens, usage.input_tokens)}</dd></div>
      <div><dt>输出 tokens</dt><dd>{number(usage.output_tokens)}</dd></div>
      <div><dt>本机复用结果</dt><dd>{number(usage.local_targets)} 条</dd></div>
      <div><dt>分析耗时</dt><dd>{(usage.elapsed_ms / 1000).toFixed(1)} 秒</dd></div>
    </dl>
    <p>仅统计这一次分析已返回的用量，包含补全、单条恢复和返回后校验失败的请求。本机复用不调用模型；连接测试、其他手记和未返回用量的失败请求以供应商账单为准。官网按模型和时间段汇总，请按上面的模型、起止时间核对。</p>
    {!!groups.length && <details className="usage-groups">
      <summary><ChevronRight size={16} aria-hidden="true" />按任务汇总（{groups.length} 类）</summary>
      <p>按返回模型、任务和规则指纹汇总；命中率为总命中 ÷ 总输入。“补全返回”包含单条恢复。累计请求耗时包含并发请求，可能大于实际等待时间。</p>
      <div className="usage-group-scroll" tabIndex={0} aria-label="按任务用量汇总表格">
        <table><thead><tr><th>任务 / 模型 / 规则指纹</th><th>请求数</th><th>补全返回</th><th>输入</th><th>命中</th><th>未命中</th><th>命中率</th><th>输出</th><th>累计请求耗时</th></tr></thead>
          <tbody>{groups.map(g => <tr key={JSON.stringify([g.model, g.task, g.prompt_family])}>
            <td>{taskName(g.task)}<small>{g.model} · {g.prompt_family}</small></td>
            <td>{number(g.requests)}</td><td>{g.repairs}</td><td>{number(g.input_tokens)}</td><td>{number(g.prompt_cache_hit_tokens)}</td><td>{number(g.prompt_cache_miss_tokens)}</td><td>{rate(g.prompt_cache_hit_tokens, g.input_tokens)}</td><td>{number(g.output_tokens)}</td><td>{(g.elapsed_ms / 1000).toFixed(1)} 秒</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
    {!!details.length && <details className="usage-details">
      <summary><ChevronRight size={16} aria-hidden="true" />逐请求用量（{details.length} 条返回）</summary>
      <p>每行对应一次返回，补全与单条恢复单列并计入用量；“请求数”包含该返回前的内部重试，其未返回 tokens 不会猜测为零。规则指纹相同代表 system 内容相同。</p>
      <div className="usage-table-scroll" tabIndex={0} aria-label="逐请求用量表格">
        <table><thead><tr><th>序号 / 用途</th><th>返回模型 / 规则指纹</th><th>开始 / 结束 / 耗时</th><th>请求数</th><th>输入</th><th>命中</th><th>未命中</th><th>命中率</th><th>输出</th><th>问题与补全</th><th>返回校验</th></tr></thead>
          <tbody>{details.map((d, i) => <tr key={`${d.started_at}-${i}`}>
            <td>#{i + 1} {taskName(d.stage ?? d.task)}{d.single_recovery ? ' · 单条恢复' : d.repair ? ' · 补全' : ''}{d.batch ? ` · 批次 ${d.batch}` : ''}{d.request_id && <small>请求 ID：{d.request_id}</small>}</td>
            <td>{d.model}<small>{d.prompt_family}</small></td>
            <td>{time(d.started_at)}<small>{time(d.finished_at)} · {(d.elapsed_ms / 1000).toFixed(1)} 秒</small></td>
            <td>{number(d.requests)}</td><td>{number(d.input_tokens)}</td><td>{number(d.prompt_cache_hit_tokens)}</td><td>{number(d.prompt_cache_miss_tokens)}</td><td>{rate(d.prompt_cache_hit_tokens, d.input_tokens)}</td><td>{number(d.output_tokens)}</td>
            <td>{d.question_count === undefined ? '未记录' : `${d.question_count} 题`}{d.repair && d.repair_missing !== undefined && <small>缺失 {d.repair_missing} · 格式不符 {d.repair_invalid ?? 0}</small>}</td>
            <td>{validationName(d.validation)}{!!(d.missing_answers || d.invalid_answers) && <small>缺失 {d.missing_answers ?? 0} · 格式不符 {d.invalid_answers ?? 0}</small>}{d.validation_reason === 'json' && <small>JSON 无法读取</small>}{d.validation_reason === 'model' && <small>返回模型改变</small>}{d.answer_issues?.map(issue => <small key={`${issue.kind}:${issue.code}`}>{questionName(issue.kind)} {issue.count} 题：{issueName(issue.code)}</small>)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
    {!details.length && <p>这份记录没有逐请求明细；新的 DeepSeek 分析会记录模型、规则指纹、请求时间和 tokens，不记录聊天原文或 Key。</p>}
  </div>;
}

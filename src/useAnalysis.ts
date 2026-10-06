import { useRef, useState } from "react";
import { incrementalJobs, overviewJob } from "../shared/incremental";
import {
  collectEvents,
  boundedContext,
  type MemoryEvent,
} from "../shared/memory";
import {
  RUBRIC,
  requestContextKey,
  type Message,
  type Relation,
  type Overview,
  type LineResult,
  type AnalysisRequest,
  type AnalysisResponse,
} from "../shared/types";
import type { SavedConversation, Trend } from "./storage";
import { analysisFetch, getApiStatus, semanticsFetch, jevJudgmentFetch, type ApiStatus } from "./platform";
import { hasCurrentSemantics, hasCurrentJevJudgment, semanticContextHash, semanticJobs, type SemanticResponse } from '../shared/semantics';
import { JEV_SEMANTIC_BATCH, type JevSemanticResponse } from '../shared/semantic-judgment';
import { analysisMode, SEMANTIC_PREFERENCE, readSemanticPreference, SEMANTIC_MODE_PREFERENCE, readSemanticModePreference, type SemanticMode } from '../shared/analysis-mode';
import { runAnalysisQueue } from "../shared/analysis-queue";
import { addUsage, sameAnalysisModel, type TokenUsage, type AnalysisIdentity } from "../shared/usage";
import { createAnalysisCache } from "./analysis-cache";
import { JEV_TOKEN_BUDGET_ERROR, validateReturnedUsage } from '../shared/provider-contract';
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal.removeEventListener("abort", abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
export function useAnalysis() {
  const [semanticEnabled, setSemanticEnabled] = useState(() => { try { return readSemanticPreference(window.localStorage); } catch { return false; } });
  const semanticEnabledRef = useRef(semanticEnabled);
  const [semanticMode, setSemanticMode] = useState(() => { try { return readSemanticModePreference(window.localStorage); } catch { return undefined; } });
  const semanticModeRef = useRef(semanticMode);
  function changeSemanticMode(mode: SemanticMode) {
    semanticModeRef.current = mode; setSemanticMode(mode); setSemanticNotice('');
    try { localStorage.setItem(SEMANTIC_MODE_PREFERENCE, mode); } catch { /* The session selection still applies. */ }
  }
  function changeSemanticEnabled(enabled: boolean) {
    semanticEnabledRef.current = enabled; setSemanticEnabled(enabled); setSemanticNotice('');
    try { localStorage.setItem(SEMANTIC_PREFERENCE, enabled ? 'on' : 'off'); } catch { /* The session preference still applies. */ }
  }
  const [overview, setOverview] = useState<Overview | null>(null),
    [overviewFresh, setOverviewFresh] = useState(false),
    [lines, setLines] = useState<Record<string, LineResult>>({}),
    [events, setEvents] = useState<Record<string, MemoryEvent>>({}),
    [trend, setTrend] = useState<Trend[]>([]),
    [status, setStatus] = useState<"idle" | "loading" | "complete" | "error">(
      "idle",
    ),
    [error, setError] = useState(""),
    [progress, setProgress] = useState({ done: 0, total: 0 }),
    [latency, setLatency] = useState(0),
    [analyzedCount, setAnalyzedCount] = useState(0);
  const [analysisUsage, setAnalysisUsage] = useState<SavedConversation['analysisUsage']>();
  const [failedAnalysisUsage, setFailedAnalysisUsage] = useState<SavedConversation['analysisUsage']>();
  const [analysisIdentity, setAnalysisIdentity] = useState<AnalysisIdentity>();
  const [usageRestored, setUsageRestored] = useState(false);
  const [semanticNotice, setSemanticNotice] = useState('');
  const [semanticUsage, setSemanticUsage] = useState<SavedConversation['semanticUsage']>();
  const [semanticUsageRestored, setSemanticUsageRestored] = useState(false);
  const targetCache = useRef(createAnalysisCache());
  const rev = useRef(0),
    controller = useRef<AbortController | null>(null),
    base = useRef<{ messages: Message[]; relation: Relation; identity?: AnalysisIdentity } | null>(null),
    savedLines = useRef(lines),
    savedEvents = useRef(events),
    processed = useRef(0),
    completed = useRef(false);
  function cancel() {
    rev.current++;
    controller.current?.abort();
    // Stopping a complement must not turn completed primary analysis into an unfinished saved record.
    setStatus(completed.current ? "complete" : "idle");
    setSemanticNotice('');
  }
  function reset() {
    cancel();
    clearResults();
  }
  function clearResults() {
    base.current = null;
    savedLines.current = {};
    savedEvents.current = {};
    processed.current = 0;
    completed.current = false;
    setStatus("idle");
    setLines({});
    setEvents({});
    setTrend([]);
    setOverview(null);
    setOverviewFresh(false);
    setError("");
    setLatency(0);
    setProgress({ done: 0, total: 0 });
    setAnalyzedCount(0);
    setAnalysisUsage(undefined);
    setFailedAnalysisUsage(undefined);
    setAnalysisIdentity(undefined);
    setUsageRestored(false);
    setSemanticNotice('');
    setSemanticUsage(undefined);
    setSemanticUsageRestored(false);
    targetCache.current.restore();
  }
  function restore(s: SavedConversation) {
    reset();
    base.current = { messages: s.messages, relation: s.relation, identity: s.analysisIdentity };
    if (s.rubric !== RUBRIC) return;
    savedLines.current = s.lines;
    savedEvents.current = s.events;
    processed.current = s.analyzedCount;
    completed.current = s.completed;
    targetCache.current.restore(s.targetCache);
    setAnalysisUsage(s.analysisUsage);
    setFailedAnalysisUsage(s.failedAnalysisUsage ?? (s.completed ? undefined : s.analysisUsage));
    setAnalysisIdentity(s.analysisIdentity);
    setUsageRestored(!!s.analysisUsage);
    setSemanticUsage(s.semanticUsage);
    setSemanticUsageRestored(!!s.semanticUsage);
    setLines(s.lines);
    setEvents(s.events);
    setTrend(s.trend);
    setOverview(s.overview);
    setOverviewFresh(s.completed);
    setAnalyzedCount(s.analyzedCount);
    setStatus(s.completed ? "complete" : "idle");
  }
  async function supplement(messages: Message[], relation: Relation, revision: number, signal: AbortSignal, config: ApiStatus) {
    if (rev.current !== revision || signal.aborted || !semanticEnabledRef.current) return;
    setSemanticNotice('');
    const mode = analysisMode(config, true, semanticModeRef.current), semantic = mode.deepseek, judge = mode.judge;
    if (mode.error) { setSemanticNotice(mode.error); return; }
    const all = semanticJobs(messages, relation, revision, savedEvents.current, judge ? JEV_SEMANTIC_BATCH : 12);
    if (!all.some(job => job.targetIds.some(id => savedLines.current[id]?.emotions && !savedLines.current[id].skipped))) return;
    if (!semantic.configured || !semantic.model) {
      setSemanticNotice('情绪与意图已保留。请在设置中保存 DeepSeek 补充分析配置，再补充策略与潜台词。');
      return;
    }
    const pending: AnalysisRequest[] = [];
    let reused = 0;
    for (const job of all) {
      const hash = await semanticContextHash(job);
      const targetIds = job.targetIds.filter(id => {
        const line = savedLines.current[id];
        if (!line?.emotions || line.skipped) return false;
        if (hasCurrentSemantics(line, hash, semantic.model!, judge)) { reused++; return false; }
        return true;
      });
      if (targetIds.length) pending.push({ ...job, targetIds });
    }
    if (rev.current !== revision || !pending.length) return;
    const started = performance.now(), startedAt = new Date().toISOString(), runId = crypto.randomUUID();
    let usage: TokenUsage = { input_tokens: 0, output_tokens: 0, requests: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
    let failure = '';
    const showUsage = (finished = false) => setSemanticUsage({ ...usage, provider: judge ? 'jev+deepseek' : 'deepseek', model: judge ? `${judge.model} + ${semantic.model}` : semantic.model, run_id: runId,
      started_at: startedAt, ...(finished ? { finished_at: new Date().toISOString() } : {}), local_targets: reused, elapsed_ms: Math.round(performance.now() - started) });
    setSemanticUsageRestored(false);
    setProgress(p => ({ ...p, total: p.total + pending.length }));
    try {
      // Wording retries reuse completed Jev judgments; only absent or changed results are requested.
      for (const [batch, job] of pending.entries()) {
        if (rev.current !== revision) return;
        setSemanticNotice(`正在补充策略与潜台词 · ${batch + 1}/${pending.length}`);
        try {
          const hash = await semanticContextHash(job);
          if (rev.current !== revision) return;
          if (judge) {
            const missing = job.targetIds.filter(id => !hasCurrentJevJudgment(savedLines.current[id], hash, judge));
            if (missing.length) {
              setSemanticNotice(`Jev 正在判断策略 · ${batch + 1}/${pending.length}`);
              const response = await jevJudgmentFetch({ ...job, targetIds: missing }, judge.provider, signal), body = await response.json();
              if (rev.current !== revision) return;
              if (body.usage) { usage = addUsage(usage, validateReturnedUsage(body.usage)); showUsage(); }
              if (!response.ok) {
                if (response.status === 400 && body.code === JEV_TOKEN_BUDGET_ERROR && missing.length > 1) {
                  // Retain the same full context and cached judgments; retry only smaller target groups.
                  const split = job.targetIds.map(id => ({ ...job, targetIds: [id] }));
                  pending.splice(batch + 1, 0, ...split);
                  setProgress(p => ({ ...p, total: p.total + split.length }));
                  continue;
                }
                throw new Error(body.error || 'Jev 判断失败，原分析已保留。');
              }
              const data = body as JevSemanticResponse;
              if (data.revision !== revision || data.rubricVersion !== RUBRIC || data.contextHash !== hash || data.model !== judge.model
                || data.lines.length !== missing.length || data.lines.some(line => !missing.includes(line.id))) throw new Error('Jev 判断与当前模型或原文不匹配。');
              const lines = { ...savedLines.current };
              for (const line of data.lines) if (lines[line.id]) lines[line.id] = { ...lines[line.id], semanticJudgment: line.semanticJudgment };
              savedLines.current = lines; setLines(lines);
            }
            const needsExplanation = job.targetIds.some(id => savedLines.current[id].semanticJudgment?.subtextStatus === 'supported');
            setSemanticNotice(`${needsExplanation ? 'DeepSeek 正在写解释' : '正在保存 Jev 判断'} · ${batch + 1}/${pending.length}`);
          }
          const guidance = judge ? Object.fromEntries(job.targetIds.map(id => [id, savedLines.current[id].semanticJudgment!])) : undefined;
          const response = await semanticsFetch({ ...job, ...(guidance ? { jevJudgments: guidance } : {}) }, signal), body = await response.json();
          if (rev.current !== revision) return;
          if (body.usage) { usage = addUsage(usage, validateReturnedUsage(body.usage)); showUsage(); }
          const data: SemanticResponse | undefined = response.ok ? body : body.partial;
          if (data) {
            if (data.revision !== revision || data.rubricVersion !== RUBRIC || data.contextHash !== hash || data.model !== semantic.model
              || data.lines.some(line => !job.targetIds.includes(line.id))) throw new Error('补充分析的模型或上下文不匹配，已保留原分析。');
            if (rev.current !== revision) return;
            const lines = { ...savedLines.current };
            for (const line of data.lines) if (lines[line.id]) lines[line.id] = { ...lines[line.id], ...line,
              contextDependency: line.contextDependency, semanticConfidence: line.semanticConfidence };
            savedLines.current = lines;
            setLines(lines);
          }
          if (!response.ok) { failure = body.error || '补充分析失败，原分析已保留。'; break; }
        } catch (error) {
          if (signal.aborted) return;
          failure = error instanceof Error ? error.message : '补充分析失败，原分析已保留。';
          break;
        } finally { if (rev.current === revision) setProgress(p => ({ ...p, done: p.done + 1 })); }
      }
    } finally {
      if (rev.current === revision) {
        showUsage(true);
        setSemanticNotice(failure ? `${failure} 可仅重试策略与潜台词。` : '');
      }
    }
  }
  async function supplementOnly(messages: Message[], relation: Relation) {
    const revision = ++rev.current;
    controller.current?.abort();
    const ctrl = new AbortController(); controller.current = ctrl;
    const previousStatus = status;
    setStatus('loading'); setProgress({ done: 0, total: 0 });
    try { await supplement(messages, relation, revision, ctrl.signal, await getApiStatus()); }
    catch (error) { if (rev.current === revision && !ctrl.signal.aborted) setSemanticNotice(error instanceof Error ? error.message : '补充分析失败。'); }
    finally { if (rev.current === revision) setStatus(previousStatus); }
  }
  async function run(messages: Message[], relation: Relation, fresh = false) {
    const revision = ++rev.current;
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setStatus('loading');
    let provider: string, model: string, config: ApiStatus;
    try {
      config = await getApiStatus();
      const mode = analysisMode(config, semanticEnabledRef.current, semanticModeRef.current);
      if (mode.error) throw new Error(mode.error);
      provider = mode.primary.provider ?? ''; model = mode.primary.model ?? '';
    }
    catch (e) { if (rev.current === revision) { setStatus('error'); setError((e as Error).message); } return; }
    if (rev.current !== revision) return;
    if (fresh) clearResults();
    const identity = { provider, model };
    const previous = base.current;
    const append =
      !!previous &&
      sameAnalysisModel(previous.identity, identity) &&
      previous.relation === relation &&
      previous.messages.length <= messages.length &&
      previous.messages.every(
        (m, i) =>
          m.id === messages[i].id &&
          m.sender === messages[i].sender &&
          m.text === messages[i].text &&
          m.timestamp === messages[i].timestamp &&
          m.kind === messages[i].kind,
      );
    // A restored, complete result already covers this exact scene and text.
    if (append && completed.current && messages.length === processed.current) {
      setStatus("complete");
      setOverviewFresh(true);
      setError("");
      setUsageRestored(!!analysisUsage);
      setStatus('loading'); setProgress({ done: 0, total: 0 });
      await supplement(messages, relation, revision, ctrl.signal, config);
      if (rev.current === revision) setStatus('complete');
      return;
    }
    const started = performance.now();
    const startedAt = new Date().toISOString(), runId = crypto.randomUUID();
    const deepseek = provider === 'deepseek';
    let usage: TokenUsage = { input_tokens: 0, output_tokens: 0, requests: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
    let localTargets = 0;
    setAnalysisUsage(undefined);
    if (!append || previous.messages.length !== messages.length) setFailedAnalysisUsage(undefined);
    setAnalysisIdentity(identity);
    setUsageRestored(false);
    completed.current = false;
    setStatus("loading");
    setError("");
    setSemanticNotice('');
    setOverviewFresh(false);
    const changed = !append || messages.length !== processed.current;
    let nextLines: Record<string, LineResult> = append
      ? { ...savedLines.current }
      : {};
    let nextEvents: Record<string, MemoryEvent> = append
      ? { ...savedEvents.current }
      : {};
    if (!append) {
      setTrend([]);
      setOverview(null);
      processed.current = 0;
      setAnalyzedCount(0);
    }
    savedEvents.current = nextEvents;
    setEvents(nextEvents);
    base.current = { messages, relation, identity };
    for (const m of messages)
      if (m.kind === "text" && Array.from(m.text).length > 12000)
        nextLines[m.id] = {
          id: m.id,
          skipped: "单条超过12,000字，已保存，请拆分后分析",
          score: {
            value: null,
            confidence: 0,
            status: "insufficient",
            probabilities: {},
          },
        };
    setLines(nextLines);
    savedLines.current = nextLines;
    const jobs = incrementalJobs(
      messages,
      relation,
      revision,
      nextLines,
      nextEvents,
      changed,
      deepseek,
    );
    if (!append) jobs.reverse();
    if (deepseek) jobs.sort((a, b) => messages.findIndex(m => m.id === a.targetIds[0]) - messages.findIndex(m => m.id === b.targetIds[0]));
    const first = overviewJob(messages, relation, revision, nextEvents);
    if (!first.messages.length) {
      setStatus("error");
      setError("记录已保存，但没有可分析的文字。单条过长的消息请拆分。");
      return;
    }
    let failed = 0,
      done = 0;
    setProgress({ done: 0, total: jobs.length + 2 });
    function showUsage(finished = false) {
      const summary = { ...usage, provider, model, run_id: runId, started_at: startedAt,
        ...(finished ? { finished_at: new Date().toISOString() } : {}),
        local_targets: localTargets, elapsed_ms: Math.round(performance.now() - started) };
      setAnalysisUsage(summary);
      return summary;
    }
    async function execute(job: AnalysisRequest, stage: string, batch = 0) {
      let data: AnalysisResponse | undefined;
      let failureMessage: string | undefined, usageRecorded = false;
      function recordUsage(returned: TokenUsage) {
        usage = addUsage(usage, { ...returned,
          ...(returned.details ? { details: returned.details.map(d => ({ ...d, stage, batch })) } : {}) });
        showUsage();
        usageRecorded = true;
      }
      const cached = deepseek ? await targetCache.current.get(job, provider, model) : {};
      const missing = job.targetIds.filter(id => !cached[id]);
      const request = job.task === 'overview' ? job : { ...job, targetIds: missing };
      if (job.task !== 'overview' && !missing.length) {
        data = { revision, rubricVersion: RUBRIC, contextHash: '', model, lines: Object.values(cached), latencyMs: 0,
          usage: { input_tokens: 0, output_tokens: 0, requests: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 } };
      }
      for (let attempt = 0; attempt < 4; attempt++) {
        if (data) break;
        const response = await analysisFetch(request, ctrl.signal, semanticEnabledRef.current && analysisMode(config, true, semanticModeRef.current).deepseek.configured ? provider : undefined);
        const body = await response.json();
        if (rev.current !== revision) return;
        // A paid return must be accounted before any retry; never rerun its whole batch automatically.
        if ([429, 529].includes(response.status) && attempt < 3 && !body.usage && !body.partial) {
          await pause(
            Math.min(
              60000,
              Number(response.headers.get("retry-after") || 2 ** attempt) *
                1000,
            ),
            ctrl.signal,
          );
          continue;
        }
        if (!response.ok) {
          if (body.usage) recordUsage(validateReturnedUsage(body.usage));
          failureMessage = body.error || "分析失败";
          if (!body.partial) throw new Error(failureMessage);
          data = body.partial;
          break;
        }
        data = body;
        break;
      }
      if (!data || data.revision !== revision || data.rubricVersion !== RUBRIC)
        throw new Error("分析版本不匹配，请刷新重试");
      if (rev.current !== revision) return;
      // Keep the returned usage even if the model or subsequent context validation fails.
      if (!usageRecorded) recordUsage(data.usage);
      if (deepseek && data.model !== model) throw new Error("返回模型与所选模型不一致，已停止复用；请检查请求明细后重试。");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(requestContextKey(job)),
      );
      const hash = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      if (job.task !== 'overview' && !missing.length) data.contextHash = hash;
      if (hash !== data.contextHash)
        throw new Error("分析上下文不匹配，请重试");
      if (job.task !== 'overview' && data.lines?.some(line => !job.targetIds.includes(line.id)))
        throw new Error("返回消息与当前批次不匹配，请重试");
      if (rev.current !== revision) return;
      if (deepseek && missing.length) await targetCache.current.put(job, data.lines ?? [], provider, model);
      if (rev.current !== revision) return;
      localTargets += Object.keys(cached).length;
      if (missing.length) data.lines = [...Object.values(cached), ...(data.lines ?? [])];
      showUsage();
      if (data.overview) {
        setOverview(data.overview);
        setLatency(Math.round(performance.now() - started));
      }
      const added = Object.fromEntries(
        (data.lines ?? []).map((l) => [l.id, l]),
      );
      nextLines = { ...nextLines, ...added };
      nextEvents = collectEvents(added, nextEvents);
      for (const update of data.memoryUpdates ?? []) {
        const old = nextEvents[update.id];
        if (old)
          nextEvents[update.id] = {
            ...old,
            status: update.status,
            resolvedBy:
              update.status === "resolved"
                ? (update.evidenceId ?? undefined)
                : update.status === "uncertain"
                  ? old.resolvedBy
                  : undefined,
          };
      }
      savedLines.current = nextLines;
      savedEvents.current = nextEvents;
      setLines(nextLines);
      setEvents(nextEvents);
      if (failureMessage) throw new Error(failureMessage);
      return data;
    }
    async function safely(job: AnalysisRequest, stage = job.task as string, batch = 0) {
      try {
        return await execute(job, stage, batch);
      } catch (e) {
        if (!ctrl.signal.aborted) {
          failed++;
          setError((e as Error).message);
        }
      } finally {
        if (rev.current === revision)
          setProgress((p) => ({ ...p, done: ++done }));
      }
    }
    // Initial overview is provisional until historical event extraction completes.
    const initialOverview = await safely(first, 'initial_overview');
    async function runJob(job: AnalysisRequest) {
        const batch = jobs.indexOf(job) + 1;
        // Refresh retrieved evidence as earlier chunks finish extracting events.
        const positions = job.targetIds.map((id) =>
          messages.findIndex((m) => m.id === id),
        );
        const firstTarget = Math.min(...positions),
          lastTarget = Math.max(...positions);
        let revised = boundedContext(
          messages,
          Math.max(0, firstTarget - (deepseek && job.task === 'self_message' ? 99 : 80)),
          job.task === "self_message"
            ? lastTarget + 1
            : Math.min(messages.length, lastTarget + 21),
          nextEvents,
          job.task === "self_message",
        );
        if (deepseek && job.task === 'other_messages' && messages.length <= 100 && first.messages.length === messages.length) revised = { messages, memory: job.memory ?? [] };
        // Keep deliberately retrieved distant corrections paired with the newest context.
        let data: AnalysisResponse | undefined;
        if (job.memory?.some((e) => job.targetIds.includes(e.id)))
          data = await safely(job, job.task, batch);
        else if (
          job.targetIds.every((id) => revised.messages.some((m) => m.id === id))
        )
          data = await safely({ ...job, ...revised }, job.task, batch);
        else data = await safely(job, job.task, batch);
        return data?.usage.requests !== 0;
    }
    await runAnalysisQueue(jobs, runJob, () => rev.current === revision, deepseek ? job => job.task : undefined);
    if (rev.current !== revision) return;
    const finalJob = overviewJob(messages, relation, revision, nextEvents);
    const sameOverview = initialOverview && requestContextKey(first) === requestContextKey(finalJob);
    const final = sameOverview ? initialOverview : await safely(finalJob, 'final_overview');
    if (sameOverview) setProgress(p => ({ ...p, done: ++done }));
    if (rev.current !== revision) return;
    const finalUsage = showUsage(true);
    if (failed) setFailedAnalysisUsage(finalUsage);
    setOverviewFresh(!!final?.overview && !failed);
    if (final?.overview && !failed) {
      completed.current = true;
      processed.current = messages.length;
      setAnalyzedCount(messages.length);
      setTrend((old) => {
        const point = {
          at: new Date().toISOString(),
          value: final.overview!.affinity.value,
          count: messages.length,
        };
        return old.at(-1)?.count === point.count
          ? [...old.slice(0, -1), point]
          : [...old, point];
      });
    }
    if (!failed) await supplement(messages, relation, revision, ctrl.signal, config);
    if (rev.current === revision) setStatus(failed ? 'error' : 'complete');
  }
  return {
    semanticEnabled,
    changeSemanticEnabled,
    semanticMode,
    changeSemanticMode,
    overview,
    overviewFresh,
    lines,
    events,
    trend,
    status,
    error,
    clearError: () => setError(""),
    progress,
    latency,
    analyzedCount,
    analysisUsage,
    failedAnalysisUsage,
    analysisIdentity,
    usageRestored,
    semanticNotice,
    semanticUsage,
    semanticUsageRestored,
    supplementOnly,
    targetCache: targetCache.current.snapshot,
    run,
    cancel,
    reset,
    restore,
  };
}

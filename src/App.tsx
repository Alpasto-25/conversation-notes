import { useVirtualizer } from "@tanstack/react-virtual";
import {
  loadConversation,
  saveConversation,
  type SavedConversation,
} from "./storage";
import { INTENTS, topIntents } from "../shared/intents";
import { REPLY_RATINGS, replyRating } from "../shared/ratings";
import { EMOTIONS, topEmotions } from "../shared/labels";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  Heart,
  MoreHorizontal,
  X,
  ArrowUpRight,
  RotateCcw,
  MessageCircle,
  Settings2,
  Plus,
  ArrowRight,
  Check,
  NotebookPen,
  FileText,
  Upload,
  ShieldCheck,
  ChevronRight,
  BookOpen,
  Sparkles,
  Download,
} from "lucide-react";
import { parseChat, toMessages, mergeMessages } from "../shared/parser";
import {
  RUBRIC,
  ACTIONS,
  RELATIONS,
  STAGES,
  isRomantic,
  metricLabel,
  statusLabel,
  meanQuality,
  type Message,
  type Relation,
  type Parsed,
} from "../shared/types";
import { exampleForRelation } from "../shared/fixtures";
import { useAnalysis } from "./useAnalysis";
import { isMobile, isDesktop, isNative, getApiStatus, type ApiStatus } from "./platform";
import { MobileSettings } from "./MobileSettings";
import { BillingNotice, ProviderHelp } from "./ProviderHelp";
import { FirstRunGuide } from "./FirstRunGuide";
import { markOnboardingSeen, shouldShowOnboarding } from "../shared/provider-guides";
import { useUpdates } from "./useUpdates";
import { UpdatesPage } from "./UpdatesPage";

function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),select,textarea,input,a[href],summary",
          ) || [],
        );
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
      >
        <header>
          <h2>{title}</h2>
          <button className="icon" aria-label="关闭" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export default function App() {
  const a = useAnalysis();
  const updates = useUpdates();
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [self, setSelf] = useState(""),
    [other, setOther] = useState("对方"),
    [relation, setRelation] = useState<Relation>("general");
  const [raw, setRaw] = useState(""),
    [parsed, setParsed] = useState<Parsed[]>([]),
    [role, setRole] = useState(""),
    [importing, setImporting] = useState(false),
    [settings, setSettings] = useState(false),
    [detail, setDetail] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const [overlap, setOverlap] = useState<Message[] | null>(null);
  const [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState("");
  const [apiInfo, setApiInfo] = useState<ApiStatus | null>(null);
  const [onboarding, setOnboarding] = useState(() => {
    try { return shouldShowOnboarding(window.localStorage); }
    catch { return true; }
  });
  const finishGuide = () => {
    try { markOnboardingSeen(window.localStorage); } catch { /* Keep the guide dismissible. */ }
    setOnboarding(false);
  };
  useEffect(() => {
    let live = true;
    const refresh = () => {
      void getApiStatus()
        .then((status) => {
          if (live) setApiInfo(status);
        })
        .catch(() => {
          if (live) setApiInfo({ configured: false });
        });
    };
    refresh();
    window.addEventListener("notebook-config-changed", refresh);
    return () => {
      live = false;
      window.removeEventListener("notebook-config-changed", refresh);
    };
  }, []);
  useEffect(() => {
    window.__notebookBack = () => {
      if (updatesOpen) { setUpdatesOpen(false); return true; }
      if (onboarding) {
        finishGuide();
        return true;
      }
      if (overlap) {
        setOverlap(null);
        return true;
      }
      if (importing) {
        setImporting(false);
        return true;
      }
      if (settings) {
        setSettings(false);
        return true;
      }
      if (detail) {
        setDetail(null);
        return true;
      }
      return false;
    };
    return () => {
      delete window.__notebookBack;
    };
  }, [overlap, importing, settings, detail, onboarding, updatesOpen]);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const virtual = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 150,
    getItemKey: useCallback((i: number) => messages[i].id, [messages]),
    overscan: 8,
    anchorTo: "end",
    followOnAppend: true,
    scrollEndThreshold: 100,
  });
  useEffect(() => {
    let live = true;
    loadConversation()
      .then((saved) => {
        if (!live) return;
        if (saved?.schema === 1) {
          setMessages(saved.messages);
          setSelf(saved.self);
          setOther(saved.other);
          setRelation(saved.relation);
          a.restore(saved);
          if (saved.rubric !== RUBRIC)
            setNotice(
              "对话已保留，分析规则已更新。请选择场景，再点击继续分析。旧评分需要重新计算。",
            );
        }
        setReady(true);
      })
      .catch(() => {
        if (live) {
          setStorageError(
            "本机记录读取失败，请检查浏览器存储权限。为避免覆盖旧记录，暂不自动保存。",
          );
          setReady(true);
        }
      });
    return () => {
      live = false;
    };
  }, []);
  const pendingSave = useRef<SavedConversation | null>(null),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    lastSavedMessages = useRef<Message[] | null>(null);
  const flushSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    void saveConversation(pendingSave.current).catch(() =>
      setStorageError(
        "本机保存失败，可能存储空间不足。当前页面仍可使用，请勿刷新以免丢失未保存记录。",
      ),
    );
  };
  useEffect(() => {
    if (!ready || storageError) return;
    pendingSave.current = messages.length
      ? {
          schema: 1,
          rubric: RUBRIC,
          messages,
          self,
          other,
          relation,
          lines: a.lines,
          events: a.events,
          overview: a.overview,
          trend: a.trend,
          analyzedCount: a.analyzedCount,
          completed: a.status === "complete",
        }
      : null;
    if (lastSavedMessages.current !== messages || a.status !== "loading") {
      lastSavedMessages.current = messages;
      flushSave();
    } else if (!saveTimer.current)
      saveTimer.current = setTimeout(flushSave, 750);
  }, [
    ready,
    messages,
    self,
    other,
    relation,
    a.lines,
    a.events,
    a.overview,
    a.trend,
    a.analyzedCount,
    a.status,
  ]);
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) flushSave();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);
  const stay = useRef(true);
  useEffect(() => {
    if (messages.length && stay.current)
      virtual.scrollToIndex(messages.length - 1, { align: "end" });
  }, [messages.length]);
  const busy = a.status === "loading",
    ov = a.overview,
    value = ov?.affinity.value,
    quality = meanQuality(messages, a.lines);
  const romantic = isRomantic(relation),
    metric = metricLabel(relation);
  const last = a.trend.at(-1),
    previous = a.trend.at(-2);
  const delta =
    a.status === "complete" && last?.value != null && previous?.value != null
      ? last.value - previous.value
      : null;
  function start(ms: Message[]) {
    setMessages(ms);
    setInput("");
    a.run(ms, relation);
  }
  function changeRelation(next: Relation) {
    if (next === relation) return;
    setRelation(next);
    a.reset();
    setNotice(
      messages.length
        ? "场景已更换，对话已保留。点击继续分析，按新场景重新评价。"
        : "",
    );
  }
  async function importFile(file: File) {
    if (file.size > 1000000) {
      setNotice("文本文件超过 1 MB，请分成较小的片段导入。");
      return;
    }
    try {
      const text = await file.text();
      if (text.includes("\uFFFD")) {
        setNotice("文件编码无法完整读取，请另存为 UTF-8 文本后再导入。");
        return;
      }
      if (!text.trim()) {
        setNotice("这个文件没有可读取的文字。");
        return;
      }
      prepare(text);
    } catch {
      setNotice("文本文件读取失败，请重试或直接粘贴内容。");
    }
  }
  function add(ms: Message[], mode: "auto" | "append" | "skip" = "auto") {
    const m = mergeMessages(messages, ms, mode);
    if (m.ambiguous) {
      setOverlap(ms);
      return;
    }
    if (!m.added) {
      setNotice("没有新增消息，这段已经分析过了。");
      setInput("");
      return;
    }
    setNotice("");
    start(m.messages);
  }
  function prepare(text: string) {
    if (!text.trim()) return;
    if (text.length > 250000) {
      setNotice("这次粘贴超过25万字符，请分几次追加；历史记录不会被截断。");
      return;
    }
    const p = parseChat(text);
    const names = [...new Set(p.messages.map((x) => x.speaker))];
    if (
      messages.length &&
      self &&
      !p.warnings.length &&
      names.every((n) => n === self || n === other)
    ) {
      add(toMessages(p.messages, self));
      return;
    }
    setRaw(text);
    setParsed(p.messages);
    setRole(names.includes(self) ? self : names.includes("我") ? "我" : "");
    setImporting(true);
  }
  function confirmImport() {
    const names = [...new Set(parsed.map((x) => x.speaker))];
    setSelf(role);
    setOther(names.find((n) => n !== role) || "对方");
    setImporting(false);
    add(toMessages(parsed, role));
  }
  function clear() {
    a.reset();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    pendingSave.current = null;
    void saveConversation(null)
      .then(() => setStorageError(""))
      .catch(() => setStorageError("本机记录删除失败，请重试清空。"));
    setMessages([]);
    setInput("");
    setSelf("");
    setOther("对方");
    setNotice("");
    setSettings(false);
    setDetail(null);
  }
  const names = [...new Set(parsed.map((x) => x.speaker))];
  const chosen = messages.find((m) => m.id === detail),
    result = detail ? a.lines[detail] : undefined;
  return (
    <main className="app">
      <div className="workspace">
        <section className="notebook" aria-label="对话分析">
          <nav className="chat-rail" aria-label="工作空间工具">
            <div className="brand">
              <span className="brand-mark">
                <NotebookPen size={24} strokeWidth={1.8} />
              </span>
              <div>
                <strong>对话手记</strong>
                <span>Conversation Notes</span>
              </div>
            </div>
            <span className="rail-label">我的工作空间</span>
            <button
              className="rail-active"
              aria-label="滚动到最新聊天"
              onClick={() => {
                stay.current = true;
                if (messages.length)
                  virtual.scrollToIndex(messages.length - 1, { align: "end" });
              }}
            >
              <MessageCircle size={18} /> 当前对话
              <span className="nav-count">{messages.length || "01"}</span>
            </button>
            <button
              disabled={!ready || busy}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={18} /> 导入记录
            </button>
            <button
              onClick={() => prepare(exampleForRelation(relation))}
              disabled={busy}
            >
              <BookOpen size={18} /> 试试一段示例
            </button>
            <span className="rail-label rail-label-second">工具与帮助</span>
            <button onClick={() => setUpdatesOpen(true)}><Download size={18} /> 版本与更新{updates.result?.status === "available" && <span className="nav-count">新</span>}</button>
            <button onClick={() => setOnboarding(true)}><BookOpen size={18} /> 使用引导</button>
            <button onClick={() => setDetail("overview")}>
              <Sparkles size={18} /> 查看分析解读
            </button>
            <button onClick={() => setDetail("formats")}>
              <FileText size={18} /> 支持的格式
            </button>
            <button aria-label="聊天设置" onClick={() => setSettings(true)}>
              <Settings2 size={18} /> 分析设置
            </button>
            <div className="rail-note">
              <span className="note-eyebrow">A LITTLE MORE UNDERSTANDING</span>
              <p>
                留住对话，
                <br />
                也留一点思考的空间。
              </p>
              <span>不猜内心，只看有据可循的线索。</span>
            </div>
            <div className="rail-footer">
              <ShieldCheck size={17} />
              <div>
                <strong>本机保存</strong>
                <span>由你决定分享什么</span>
              </div>
            </div>
          </nav>
          <header className="chat-head">
            <div className="breadcrumb">
              <NotebookPen size={17} />
              <span>{isMobile ? "手机工作空间" : "私人工作空间"}</span>
              <ChevronRight size={13} />
              <strong>对话手记</strong>
            </div>
            <div className="header-tools">
              <button className={`icon update-entry ${updates.result?.status === "available" ? "has-update" : ""}`} aria-label="版本与更新" title="版本与更新" onClick={() => setUpdatesOpen(true)}><Download size={18} /></button>
              <button
                className={`api-badge ${apiInfo?.configured ? "configured" : ""}`}
                onClick={() => setSettings(true)}
              >
                <span />
                {apiInfo == null
                  ? "连接中"
                  : apiInfo.configured
                    ? "API 已配置"
                    : "配置 API"}
              </button>
              <button
                className="icon"
                aria-label="新聊天"
                title="新聊天"
                onClick={() => setDetail("clear")}
              >
                <Plus size={20} />
              </button>
              <button
                className="icon"
                aria-label="更多聊天设置"
                onClick={() => setSettings(true)}
              >
                <MoreHorizontal size={22} />
              </button>
            </div>
          </header>
          <div className="document-head">
            <div className="document-title">
              <div className="page-eyebrow">
                YOUR CONVERSATION, A NEW PERSPECTIVE
              </div>
              <h1>
                {messages.length ? (
                  `${other}的对话手记`
                ) : (
                  <>
                    让对话，多一点<span className="title-highlight">理解</span>
                    。
                  </>
                )}
              </h1>
              <p>
                {messages.length
                  ? `${messages.length.toLocaleString()} 条记录 · 保留原话，结合上下文阅读`
                  : "从日常聊天到工作沟通，看见情绪、表达和下一步。"}
              </p>
              <div className="document-meta">
                <label className="scene-control">
                  <span>分析场景</span>
                  <select
                    className="scene-select"
                    aria-label="分析场景"
                    value={relation}
                    onChange={(e) => changeRelation(e.target.value as Relation)}
                  >
                    {Object.entries(RELATIONS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="save-badge">
                  <ShieldCheck size={13} />
                  {storageError ? "保存异常" : "仅在本机保存"}
                </span>
              </div>
              {updates.showReminder && <div className="update-reminder" role="status">
                <span>有新的{isMobile ? "手机版" : isDesktop ? "电脑版" : "应用"}可下载</span>
                <button onClick={() => setUpdatesOpen(true)}>查看更新 <ArrowUpRight size={13} /></button>
                <button className="icon" aria-label="暂不提醒此构建" onClick={updates.dismiss}><X size={15} /></button>
              </div>}
            </div>
            <button
              className="header-affinity"
              onClick={() => setDetail("overview")}
              aria-label={`查看${metric}详情`}
            >
              <span>{metric}</span>
              <strong key={value} className="affinity-number">
                {value ?? "—"}
              </strong>
              <span className="metric-scale">/ 100</span>
              {value != null && romantic && (
                <span className="affinity-hearts" aria-hidden="true">
                  <Heart className="affinity-heart heart-one" size={12} />
                  <Heart className="affinity-heart heart-two" size={9} />
                  <Heart className="affinity-heart heart-three" size={7} />
                </span>
              )}
              {delta != null && delta !== 0 && (
                <small>
                  {delta > 0 ? "+" : ""}
                  {delta}
                </small>
              )}
              <span className="metric-detail">
                查看维度 <ArrowUpRight size={13} />
              </span>
            </button>
          </div>
          <div
            ref={scroller}
            className="chat-scroll"
            onScroll={(e) => {
              const el = e.currentTarget;
              stay.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 100;
            }}
          >
            {!messages.length ? (
              <div className="empty">
                <div className="empty-illustration" aria-hidden="true">
                  <span className="sketch-note">
                    <FileText size={38} strokeWidth={1.5} />
                    <i />
                  </span>
                  <span className="sketch-chat">
                    <MessageCircle size={28} strokeWidth={1.6} />
                  </span>
                  <span className="sketch-spark">
                    <Sparkles size={23} strokeWidth={1.8} />
                  </span>
                </div>
                <div className="empty-eyebrow">
                  每一段交流，都值得认真读一读
                </div>
                <h2>从一段对话开始</h2>
                <p>
                  选好场景，粘贴文字或导入记录。
                  <br />
                  手记会帮你梳理沟通中的线索。
                </p>
                <div className="getting-started">
                  <span>
                    <b>1</b>选择场景
                  </span>
                  <ChevronRight size={13} />
                  <span>
                    <b>2</b>导入对话
                  </span>
                  <ChevronRight size={13} />
                  <span>
                    <b>3</b>看看解读
                  </span>
                </div>
                <p className="source-hint">
                  微信 · QQ · WhatsApp · 其他双人文字对话
                </p>
                <button
                  className="text-button"
                  onClick={() => prepare(exampleForRelation(relation))}
                >
                  <BookOpen size={16} /> 用一段示例试试{" "}
                  <ArrowUpRight size={15} />
                </button>
              </div>
            ) : (
              <div
                style={{
                  height: virtual.getTotalSize(),
                  position: "relative",
                  width: "100%",
                }}
              >
                {virtual.getVirtualItems().map((row) => {
                  const i = row.index,
                    m = messages[i];
                  const r = a.lines[m.id];

                  return (
                    <div
                      key={m.id}
                      data-index={row.index}
                      ref={virtual.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${row.start}px)`,
                      }}
                      id={`message-${m.id}`}
                      className={`message ${m.sender}`}
                    >
                      {(i === 0 || m.timestamp !== messages[i - 1].timestamp) &&
                        m.timestamp && (
                          <div className="timestamp">
                            {m.timestamp.replace(/^\d{4}年/, "")}
                          </div>
                        )}
                      <div className="message-row">
                        <div
                          className={`avatar ${m.sender === "self" ? "mine" : ""}`}
                        >
                          {(m.sender === "self" ? self : other).slice(0, 1)}
                        </div>
                        <div className="message-content">
                          <div className="bubble">{m.text}</div>
                          {m.kind === "text" && (
                            <div className={`message-tags ${m.sender}`}>
                              {r?.skipped ? (
                                <span className="pending-tag">{r.skipped}</span>
                              ) : m.sender === "other" ? (
                                <>
                                  <div className="analysis-row emotion-row">
                                    <span className="analysis-row-label">
                                      情绪
                                    </span>
                                    {r?.emotions ? (
                                      topEmotions(r.emotions).map((emotion) => (
                                        <button
                                          key={emotion.key}
                                          className={`emotion-tag emotion-${emotion.key}`}
                                          onClick={() => setDetail(m.id)}
                                          aria-label={`${emotion.label} ${emotion.percent}，查看情绪分析：${m.text}`}
                                        >
                                          <span>{emotion.label}</span>
                                          <b>{emotion.percent}</b>
                                        </button>
                                      ))
                                    ) : (
                                      <button
                                        className="pending-tag"
                                        disabled={busy}
                                        onClick={() =>
                                          a.run(messages, relation)
                                        }
                                      >
                                        {busy ? "分析中" : "分析情绪"}
                                      </button>
                                    )}
                                  </div>
                                  <div className="analysis-row intent-row">
                                    <span className="analysis-row-label">
                                      意图
                                    </span>
                                    {r?.intents ? (
                                      topIntents(r.intents).map((intent) => (
                                        <button
                                          key={intent.key}
                                          className="intent-tag"
                                          onClick={() => setDetail(m.id)}
                                          aria-label={`${intent.label} ${intent.percent}，查看意图分析：${m.text}`}
                                        >
                                          <span>{intent.label}</span>
                                          <b>{intent.percent}</b>
                                        </button>
                                      ))
                                    ) : (
                                      <button
                                        className="pending-tag"
                                        disabled={busy}
                                        onClick={() =>
                                          a.run(messages, relation)
                                        }
                                      >
                                        {busy ? "分析中" : "分析意图"}
                                      </button>
                                    )}
                                  </div>
                                </>
                              ) : r ? (
                                <button
                                  className="reply-tag"
                                  onClick={() => setDetail(m.id)}
                                  aria-label={`查看回复评价：${m.text}`}
                                >
                                  <span>回复评级：</span>
                                  <b>
                                    {replyRating(r.score.value)?.label ??
                                      "待判断"}
                                  </b>
                                </button>
                              ) : (
                                <button
                                  className="pending-tag"
                                  disabled={busy}
                                  onClick={() => a.run(messages, relation)}
                                >
                                  {busy ? "分析中" : "评价回复"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="chat-insights">
            <button
              className="reply-summary"
              onClick={() => setDetail("performance")}
            >
              <span>我的表达</span>
              <strong>{replyRating(quality)?.label ?? "—"}</strong>
              {quality != null && <span>{quality}分</span>}
            </button>
            <span className="insight-divider" />
            <button
              className="action-summary"
              onClick={() => setDetail("action")}
            >
              <span>下一步</span>
              <strong>{ov ? ACTIONS[ov.action]?.label : "等你导入聊天"}</strong>
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="composer">
            <div className="import-toolbar">
              <input
                ref={fileInput}
                type="file"
                accept=".txt,.md,.log,text/plain"
                aria-label="选择对话文本文件"
                hidden
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (file) void importFile(file);
                }}
              />
              <button
                className="text-button"
                disabled={!ready || busy}
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={15} /> 导入文本文件
              </button>
              <button
                className="text-button"
                onClick={() => setDetail("formats")}
              >
                查看支持格式
              </button>
            </div>
            <textarea
              aria-label="粘贴聊天记录"
              disabled={!ready}
              placeholder={
                messages.length
                  ? "粘贴新的聊天，自动合并重复记录"
                  : "粘贴两人的对话，例如：我：内容 / 对方：内容…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(e) => {
                const t = e.clipboardData.getData("text");
                if (t.trim()) {
                  e.preventDefault();
                  setInput(t);
                  prepare(t);
                }
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter")
                  prepare(input);
              }}
            />
            <div className="composer-bottom">
              <div className="composer-feedback">
                <span role="status">{storageError || notice}</span>{" "}
                <div className="analysis-status" aria-live="polite">
                  {busy ? (
                    <>
                      <span className="working" />
                      正在分析 {a.progress.done}/{a.progress.total}
                      <button onClick={a.cancel}>停止</button>
                    </>
                  ) : a.status === "error" ? (
                    <>
                      <span>分析未完成</span>
                      <button onClick={() => a.run(messages, relation)}>
                        <RotateCcw size={14} />
                        重试
                      </button>
                    </>
                  ) : a.status === "complete" ? (
                    <span className="completed">
                      <Check size={14} />
                      分析完成
                      <button onClick={() => setDetail("overview")}>
                        查看解读
                      </button>
                    </span>
                  ) : messages.length ? (
                    <>
                      <span>分析已暂停</span>
                      <button onClick={() => a.run(messages, relation)}>
                        继续分析
                      </button>
                    </>
                  ) : null}
                </div>
                {a.error && <span className="error">{a.error}</span>}
              </div>
              <button
                className="send"
                disabled={!input.trim()}
                onClick={() => prepare(input)}
              >
                <Sparkles size={15} />
                分析聊天
              </button>
            </div>
          </div>
        </section>
      </div>
      {importing && (
        <Modal title="确认聊天里的你" close={() => setImporting(false)}>
          <label className="field">
            本次分析场景
            <select
              value={relation}
              onChange={(e) => changeRelation(e.target.value as Relation)}
            >
              {Object.entries(RELATIONS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="role-options">
            {names
              .filter((n) => n !== "未分配")
              .map((n) => (
                <button
                  className={role === n ? "selected" : ""}
                  key={n}
                  onClick={() => setRole(n)}
                >
                  {n}
                </button>
              ))}
            {names.length === 1 && (
              <button
                className={role === "__self_absent__" ? "selected" : ""}
                onClick={() => setRole("__self_absent__")}
              >
                这些都是对方的话
              </button>
            )}
          </div>
          <label className="field">
            识别到 {parsed.length} 条聊天
            <textarea
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setParsed(parseChat(e.target.value).messages);
              }}
            />
          </label>
          {(names.length > 2 || names.includes("未分配")) && (
            <p className="error">
              请保留两个人的聊天，可改成「我：内容」「对方：内容」。
            </p>
          )}
          <button
            className="primary"
            disabled={
              !role ||
              !parsed.length ||
              names.length > 2 ||
              names.includes("未分配") ||
              (!names.includes(role) && role !== "__self_absent__")
            }
            onClick={confirmImport}
          >
            开始分析
          </button>
        </Modal>
      )}
      {ready && onboarding && (
        <Modal title="初次使用引导" close={finishGuide}>
          <FirstRunGuide finish={finishGuide} configure={() => { finishGuide(); setSettings(true); }} />
        </Modal>
      )}
      {settings && (
        <Modal title="聊天设置" close={() => setSettings(false)}>
          {isNative && <MobileSettings status={apiInfo} changed={setApiInfo} />}
          {!isNative && (
            <>
            <p className="desktop-api-note">
              <ShieldCheck size={16} /> 原网页版 API 配置保存在电脑的 .env
              文件中，不会发送到浏览器。
            </p>
            <BillingNotice />
            <ProviderHelp provider={apiInfo?.provider} expanded={!apiInfo?.configured} />
            </>
          )}
          <label className="field">
            分析场景
            <select
              value={relation}
              onChange={(e) => changeRelation(e.target.value as Relation)}
            >
              {Object.entries(RELATIONS).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <p>
            场景会影响评分维度、回复评价和下一步建议。更换场景后点击继续分析，使用少量
            API 额度。
          </p>
          <button
            className="secondary"
            disabled={!messages.length}
            onClick={() => {
              const ms = messages.map((m) => ({
                ...m,
                sender:
                  m.sender === "self" ? ("other" as const) : ("self" as const),
              }));
              setSelf(other);
              setOther(self === "__self_absent__" ? "我" : self);
              setMessages(ms);
              a.reset();
              a.run(ms, relation);
              setSettings(false);
            }}
          >
            交换双方身份
          </button>
          <button
            className="secondary danger"
            onClick={() => {
              setSettings(false);
              setDetail("clear");
            }}
          >
            清空聊天，重新开始
          </button>
          <p>
            已保存 {messages.length.toLocaleString()} 条聊天。记录保存在
            {isMobile ? "这部手机" : isDesktop ? "这台电脑的应用中" : "本机浏览器"}
            ，重新打开后可继续；分析时只发送所需片段给模型服务。清空会删除本机记录。
          </p>
          <button className="secondary" onClick={() => { setSettings(false); setOnboarding(true); }}>重新查看使用引导</button>
          <button className="secondary" onClick={() => { setSettings(false); setUpdatesOpen(true); }}>版本与更新 / Release 下载页</button>
        </Modal>
      )}
      {updatesOpen && <Modal title="版本与更新" close={() => setUpdatesOpen(false)}><UpdatesPage updates={updates} /></Modal>}
      {detail === "clear" && (
        <Modal title="开始新的聊天？" close={() => setDetail(null)}>
          <p>当前聊天、分析和本机保存的记录都会删除。</p>
          <button className="primary" onClick={clear}>
            开始新聊天
          </button>
          <button className="secondary" onClick={() => setDetail(null)}>
            保留当前聊天
          </button>
        </Modal>
      )}
      {detail && detail !== "clear" && (
        <Modal
          title={
            detail === "overview"
              ? metric
              : detail === "action"
                ? "下一步"
                : detail === "performance"
                  ? "我的表达"
                  : detail === "formats"
                    ? "支持的对话格式"
                    : chosen?.sender === "other"
                      ? "情绪与意图"
                      : "回复评价"
          }
          close={() => setDetail(null)}
        >
          {detail === "overview" ? (
            <>
              <p>
                {romantic
                  ? "0—100 是当前聊天的好感信号评分，不是对方喜欢你的概率。"
                  : "0—100 是当前对话中回应、理解、尊重、支持、清晰表达和行动跟进的综合评分，不代表真实心理、亲密程度或合作成功率。"}
              </p>
              <p>
                按「{RELATIONS[relation]}
                」场景，参考近期对话和相关历史原话评分。请结合证据充分程度阅读，不同场景的分数不宜直接比较。
              </p>
              {ov && (
                <p>
                  {relation !== "couple" && (
                    <>沟通进展：{STAGES[ov.stage] ?? "信息不足"}</>
                  )}
                  {ov.rapport && (
                    <>
                      {relation !== "couple" && " · "}理解与协调{" "}
                      {ov.rapport.value ?? "—"}/100（
                      {statusLabel(ov.rapport)}）
                    </>
                  )}
                </p>
              )}
              {!!ov?.memoryEvidenceIds?.length && (
                <details>
                  <summary>参考的历史原话</summary>
                  {[...new Set(ov.memoryEvidenceIds)].map((id) => {
                    const m = messages.find((m) => m.id === id);
                    return m ? (
                      <blockquote key={id}>
                        {m.sender === "self" ? self : other}：{m.text}
                      </blockquote>
                    ) : null;
                  })}
                </details>
              )}
              {ov?.affinityDimensions && (
                <div className="affinity-breakdown">
                  {ov.affinityDimensions.map((d) => (
                    <div key={d.key}>
                      <span>{d.label}</span>
                      <meter
                        min="0"
                        max="100"
                        value={d.judgment.value ?? 0}
                        aria-label={`${d.label} ${d.judgment.value} 分`}
                      />
                      <strong>{d.judgment.value}</strong>
                      <small>
                        占 {d.weight}% · {statusLabel(d.judgment)}
                      </small>
                    </div>
                  ))}
                </div>
              )}
              {ov?.boundaryApplied && (
                <p>
                  对方表达了明确且仍有效的拒绝边界。综合原分{" "}
                  {ov.affinityRawValue}，最终好感信号最多显示 25 分。
                </p>
              )}
              {ov && (
                <p>
                  本轮判断：{statusLabel(ov.affinity)}。综合确定度{" "}
                  {Math.round(ov.affinity.confidence * 100)}%。
                </p>
              )}
            </>
          ) : detail === "formats" ? (
            <>
              <p>微信：电脑版多选复制的「昵称 → 时间 → 正文」格式。</p>
              <p>QQ：昵称与时间在一行、正文在下一行的复制记录。</p>
              <p>WhatsApp：导出的 .txt 文本，可直接导入文件或复制粘贴。</p>
              <p>
                其他软件、邮件往来或访谈文字：整理为下面的双人对话格式，支持中文、英文昵称和多行正文。
              </p>
              <pre className="format-example">
                {
                  "我：请问这份方案什么时候能确认？\n对方：明天下午，我会把修改意见发你。\n我：好的，收到后我们再核对。"
                }
              </pre>
              <p>
                可导入 UTF-8 的 .txt、.md 和 .log
                文件。当前分析对象是两人的文字对话，群聊需先整理出两人的相关交流；图片、语音和聊天数据库需要先转换成文字。
              </p>
            </>
          ) : detail === "action" ? (
            <>
              <h3>{ov ? ACTIONS[ov.action]?.label : "等待聊天"}</h3>
              <p>{ov ? ACTIONS[ov.action]?.detail : "导入后生成建议。"}</p>
              {ov?.actionEvidenceId && (
                <blockquote>
                  {messages.find((m) => m.id === ov.actionEvidenceId)?.text}
                </blockquote>
              )}
            </>
          ) : detail === "performance" ? (
            <>
              <div className="detail-score">
                {quality ?? "—"}
                <span>/100</span>
              </div>
              <p>
                已完成分析的我方回复平均分。Jev
                根据发出时的前文评价表达质量，再按固定分数区间显示评级。
              </p>
              <div className="reply-guide">
                {REPLY_RATINGS.map((v) => (
                  <p key={v.label}>
                    <strong>
                      {v.label} · {v.range} 分
                    </strong>
                    ：{v.description}
                  </p>
                ))}
              </div>
            </>
          ) : (
            <>
              <blockquote>{chosen?.text}</blockquote>
              {chosen?.sender === "other" ? (
                <>
                  <h3>情绪</h3>
                  <div className="emotion-distribution">
                    {Object.entries(result?.emotions || {})
                      .sort((a, b) => b[1] - a[1])
                      .map(([key, p]) => (
                        <div key={key}>
                          <span>
                            {EMOTIONS[key as keyof typeof EMOTIONS]?.label ||
                              key}
                          </span>
                          <div className="probability-track">
                            <i style={{ width: `${p * 100}%` }} />
                          </div>
                          <b>
                            {p > 0 && p < 0.005
                              ? "<1%"
                              : `${Math.round(p * 100)}%`}
                          </b>
                        </div>
                      ))}
                  </div>
                  <h3 className="intent-detail-heading">意图</h3>
                  <div className="intent-distribution">
                    {Object.entries(result?.intents || {})
                      .filter(([key, p]) => key in INTENTS && p > 0)
                      .sort((a, b) => b[1] - a[1])
                      .map(([key, p]) => (
                        <div key={key} className="intent-detail-item">
                          <div>
                            <strong>
                              {INTENTS[key as keyof typeof INTENTS].label}
                            </strong>
                            <b>
                              {p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`}
                            </b>
                          </div>
                          <p>{INTENTS[key as keyof typeof INTENTS].criteria}</p>
                        </div>
                      ))}
                    {!result?.intents && <p>意图尚未分析。</p>}
                  </div>
                  <p>
                    两行分别展示主要情绪与主要沟通意图的候选解读，不代表测量真实内心。每行最多显示前三项，保留原始概率，不重新凑成
                    100%。
                  </p>
                </>
              ) : (
                <>
                  <h3 className="reply-verdict">
                    回复评级：
                    {replyRating(result?.score.value)?.label ?? "待判断"}
                  </h3>
                  <p>
                    {replyRating(result?.score.value)?.description ??
                      "当前语境不足以判断表达质量"}
                  </p>
                  <p>
                    回复评分 {result?.score.value ?? "—"} / 100 ·{" "}
                    {result && statusLabel(result.score)}
                  </p>
                </>
              )}
              <p>结合当前已导入的上下文判断，不代表对方真实想法。</p>
            </>
          )}
        </Modal>
      )}
      {overlap && (
        <Modal title="这段可能重复了" close={() => setOverlap(null)}>
          <p>相同内容也可能是新消息，请选择如何合并。</p>
          <button
            className="primary"
            onClick={() => {
              add(overlap, "skip");
              setOverlap(null);
            }}
          >
            跳过重合部分
          </button>
          <button
            className="secondary"
            onClick={() => {
              add(overlap, "append");
              setOverlap(null);
            }}
          >
            作为新消息追加
          </button>
        </Modal>
      )}
    </main>
  );
}

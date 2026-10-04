import { useVirtualizer } from "@tanstack/react-virtual";
import { useNotebooks } from "./useNotebooks";
import { ConversationFolders } from "./ConversationFolders";
import { MobileDrawer, type MobileDrawerHandle } from "./MobileDrawer";
import { ModelSelector, type ModelSelection } from './ModelSelector';
import { useChatReading } from './useChatReading';
import { TooltipLayer } from "./TooltipLayer";
import { lockOverlayBackground } from "./overlay-lock";
import { emptyConversation, type NotebookSummary } from "./notebooks";
import { INTENTS, topIntents } from "../shared/intents";
import { REPLY_RATINGS, replyRating } from "../shared/ratings";
import { EMOTIONS, topEmotions } from "../shared/labels";
import {
  useEffect,
  useLayoutEffect,
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
  FolderOpen,
  Pencil,
  Trash2,
  Menu,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { parseChat, toMessages, mergeMessages } from "../shared/parser";
import {
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
import { UpdateDownloads } from "./UpdateDownloads";
import { useAppearance } from "./useAppearance";
import { AppearanceSettings } from "./AppearanceSettings";
import { APP_BUILD } from "./platform";

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
  const closeRef = useRef(close), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [closing, setClosing] = useState(false);
  closeRef.current = close;
  const dismiss = useCallback(() => {
    if (timer.current) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { closeRef.current(); return; }
    setClosing(true);
    const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion-panel"));
    timer.current = setTimeout(() => closeRef.current(), duration * 1000);
  }, []);
  useLayoutEffect(() => {
    const old = document.activeElement as HTMLElement;
    ref.current?.focus();
    const unlock = lockOverlayBackground(document.querySelector<HTMLElement>(".workspace"));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // The first Escape belongs to an open native select picker.
        if (CSS.supports("selector(select:open)") && ref.current?.querySelector("select:open")) return;
        dismiss();
      }
      if (e.key === "Tab") {
        const nodes = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),select:not(:disabled),textarea:not(:disabled),input:not(:disabled),a[href],summary",
          ) || [],
        ).filter((node) => !node.closest("[inert]") && node.getClientRects().length > 0);
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
      clearTimeout(timer.current);
      document.removeEventListener("keydown", onKey);
      unlock();
      if (old?.isConnected && old.getClientRects().length && !old.closest("[inert]")) old.focus();
      else document.querySelector<HTMLButtonElement>(".mobile-menu-toggle")?.focus();
    };
  }, []);
  return (
    <div
      className={`overlay${closing ? " is-closing" : ""}`}
      onMouseDown={(e) => e.target === e.currentTarget && dismiss()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        inert={closing}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon" aria-label="关闭" onClick={dismiss}>
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
  const notebooks = useNotebooks(a);
  const { messages, setMessages, input, setInput, self, setSelf, other, setOther, relation,
    ready, storageError, switching, changeRelation } = notebooks;
  const updates = useUpdates();
  const appearance = useAppearance();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const drawer = useRef<MobileDrawerHandle>(null);
  const closeMenu = useCallback(() => drawer.current?.close(), []);
  const workspace = useRef<HTMLDivElement>(null), menuButton = useRef<HTMLButtonElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false), [editingNotebook, setEditingNotebook] = useState(false);
  const [editTitle, setEditTitle] = useState(""), [editContact, setEditContact] = useState("");
  const [editScene, setEditScene] = useState<Relation>("general"), [trashOpen, setTrashOpen] = useState(false);
  const [notebookDelete, setNotebookDelete] = useState<{ note: NotebookSummary; permanent: boolean } | null>(null);
  const [messageDelete, setMessageDelete] = useState<Message | null>(null);
  const [importScene, setImportScene] = useState<Relation>("general"), [importTarget, setImportTarget] = useState<"new" | "append">("new"),
    [importTitle, setImportTitle] = useState("");
  const [raw, setRaw] = useState(""),
    [parsed, setParsed] = useState<Parsed[]>([]),
    [role, setRole] = useState(""),
    [importing, setImporting] = useState(false),
    [settings, setSettings] = useState(false),
    [detail, setDetail] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const [overlap, setOverlap] = useState<Message[] | null>(null);
  const [apiInfo, setApiInfo] = useState<ApiStatus | null>(null);
  const [settingsSelection, setSettingsSelection] = useState<ModelSelection>();
  useEffect(() => { if (!settings) setSettingsSelection(undefined); }, [settings]);
  const [onboarding, setOnboarding] = useState(() => {
    try { return shouldShowOnboarding(window.localStorage); }
    catch { return true; }
  });
  const finishGuide = () => {
    try { markOnboardingSeen(window.localStorage); } catch { /* Keep the guide dismissible. */ }
    setOnboarding(false);
  };
  const updatePrompt = updates.showReminder && ready && a.status !== "loading" && !switching &&
    !menuOpen && !onboarding && !appearanceOpen && !updatesOpen && !settings && !importing && !detail &&
    !libraryOpen && !editingNotebook && !trashOpen && !notebookDelete && !messageDelete && !overlap;
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
  const reading = useChatReading(scroller, virtual, notebooks.active?.id);
  const stay = useRef(true);
  useEffect(() => {
    if (messages.length && stay.current)
      virtual.scrollToIndex(messages.length - 1, { align: "end" });
  }, [messages.length]);
  useEffect(() => {
    window.__notebookBack = () => {
      if (updatePrompt) { updates.snooze(); return true; }
      if (appearanceOpen) { setAppearanceOpen(false); return true; }
      if (messageDelete) { setMessageDelete(null); return true; }
      if (notebookDelete) { setNotebookDelete(null); return true; }
      if (trashOpen) { setTrashOpen(false); return true; }
      if (editingNotebook) { setEditingNotebook(false); return true; }
      if (libraryOpen) { setLibraryOpen(false); return true; }
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
      if (drawer.current?.isOpen()) { closeMenu(); return true; }
      if (reading.expanded) { reading.close(); return true; }
      return false;
    };
    return () => {
      delete window.__notebookBack;
    };
  }, [overlap, importing, settings, detail, onboarding, updatesOpen, appearanceOpen, updatePrompt, updates.snooze, libraryOpen, editingNotebook, trashOpen, notebookDelete, messageDelete, closeMenu, reading.expanded, reading.close]);
  const busy = a.status === "loading" || switching,
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
      prepare(text, true, file.name.replace(/\.(txt|md|log)$/i, ""));
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
  function prepare(text: string, separate = false, title = "") {
    if (!ready || busy || storageError) return;
    if (!text.trim()) return;
    if (text.length > 250000) {
      setNotice("这次粘贴超过25万字符，请分几次追加；历史记录不会被截断。");
      return;
    }
    const p = parseChat(text);
    const names = [...new Set(p.messages.map((x) => x.speaker))];
    if (
      messages.length &&
      !separate &&
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
    setImportScene(relation);
    setImportTarget(!separate && messages.length && names.every((n) => n === self || n === other) ? "append" : "new");
    setImportTitle(title);
    setImporting(true);
  }
  async function confirmImport(analyze = true) {
    const names = [...new Set(parsed.map((x) => x.speaker))];
    const nextOther = names.find((n) => n !== role) || "对方";
    const imported = toMessages(parsed, role);
    if (importTarget === "append" && canAppend) {
      setImporting(false);
      if (analyze) add(imported);
      else {
        const merged = mergeMessages(messages, imported);
        if (merged.ambiguous) { setNotice("存在可能重复的记录。请用开始分析的导入流程确认合并方式，或保存为新手记。"); return; }
        const saved = { ...notebooks.snapshot(), messages: merged.messages, completed: false };
        setMessages(merged.messages); setInput(""); a.restore(saved);
      }
      return;
    }
    const conversation = { ...emptyConversation(importScene), messages: imported, self: role, other: nextOther };
    const note = await notebooks.create(conversation, importTitle || `${nextOther}的对话手记`, nextOther);
    if (!note) return;
    setImporting(false);
    setNotice(""); setDetail(null); setOverlap(null);
    if (analyze) void a.run(imported, importScene);
  }
  function resetViews() {
    setNotice(""); setSettings(false); setDetail(null); setOverlap(null); setImporting(false); setLibraryOpen(false);
    stay.current = true;
  }
  async function createNotebook() { if (await notebooks.create()) resetViews(); }
  async function selectNotebook(id: string) { if (id === notebooks.active?.id) { setLibraryOpen(false); return; } if (await notebooks.select(id)) resetViews(); }
  async function editNotebook(id = notebooks.active?.id) {
    if (!id) return;
    const note = id === notebooks.active?.id ? notebooks.active : await notebooks.select(id);
    if (!note) return;
    setLibraryOpen(false); setNotice("");
    setEditTitle(note.title); setEditContact(note.contact); setEditScene(id === notebooks.active?.id ? relation : note.conversation.relation); setEditingNotebook(true);
  }
  function requestNotebookDelete(note: NotebookSummary, permanent = false) {
    setLibraryOpen(false); setTrashOpen(false); setSettings(false); setNotebookDelete({ note, permanent });
  }
  async function confirmNotebookDelete() {
    if (!notebookDelete) return;
    const result = notebookDelete.permanent ? await notebooks.purge(notebookDelete.note.id) : await notebooks.recycle(notebookDelete.note.id);
    if (!result) return;
    setNotice(notebookDelete.permanent ? "已彻底删除这份手记，其他记录不受影响。" : "已移入回收站，可从对话文件夹恢复。其他记录不受影响。");
    setNotebookDelete(null); setDetail(null);
  }
  async function confirmMessageDelete() {
    if (!messageDelete || !await notebooks.deleteMessages([messageDelete.id])) return;
    setMessageDelete(null); setDetail(null); setNotice("消息已删除。为避免使用已删除的上下文，该手记的旧分析已清除；需要时再点击继续分析。");
  }
  const openTrash = () => { setLibraryOpen(false); setTrashOpen(true); };
  async function saveNotebookEdit() {
    if (!await notebooks.rename(editTitle, editContact, editScene)) return;
    setEditingNotebook(false); setNotice("名称与分类已保存，没有调用模型。新场景需要时可点击继续分析。");
  }
  const names = [...new Set(parsed.map((x) => x.speaker))];
  const canAppend = !!messages.length && role === self && names.every((name) => name === self || name === other) && importScene === relation;
  const libraryDisabled = !ready || switching || !!storageError;
  const manageDisabled = libraryDisabled || busy;
  const folderActions = { edit: (id: string) => void editNotebook(id), recycle: (note: NotebookSummary) => requestNotebookDelete(note),
    trashCount: notebooks.trashItems.length, openTrash, manageDisabled };
  const importInvalid = busy || !!storageError || !role || !parsed.length || names.length > 2 || names.includes("未分配") || (!names.includes(role) && role !== "__self_absent__");
  function menuAction(action: () => void) { closeMenu(); action(); }
  const chosen = messages.find((m) => m.id === detail),
    result = detail ? a.lines[detail] : undefined;
  return (
    <main className={`app${isDesktop ? " desktop-app" : ""}${reading.expanded ? " is-chat-reading" : ""}`}>
      <div ref={workspace} className="workspace">
        <section className={`notebook${messages.length ? '' : ' is-empty'}`} aria-label="对话分析">
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
            <button disabled={libraryDisabled} onClick={() => void createNotebook()}><Plus size={18} /> 新建手记，保留旧记录</button>
            <ConversationFolders compact items={notebooks.items} activeId={notebooks.active?.id} disabled={libraryDisabled}
              {...folderActions}
              select={(id) => void selectNotebook(id)} create={() => void createNotebook()} />
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
            <button onClick={() => setAppearanceOpen(true)}><Settings2 size={18} /> 外观模式</button>
            <button className="update-entry" aria-label={updates.hasUpdate ? "版本与更新，有新版本" : "版本与更新"} onClick={() => setUpdatesOpen(true)}>
              <span className="update-icon"><Download size={18} />{updates.hasUpdate && <span className="update-dot" aria-hidden="true" />}</span>
              版本与更新{updates.hasUpdate && <span className="nav-count">新</span>}
            </button>
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
            <button ref={menuButton} className="icon mobile-menu-toggle" aria-label="打开菜单"
              aria-expanded="false" aria-controls="mobile-workspace-menu" onClick={() => drawer.current?.toggle()}>
              <Menu size={22} />
            </button>
            <div className="breadcrumb">
              <NotebookPen size={17} />
              <span>{isMobile ? "手机工作空间" : "私人工作空间"}</span>
              <ChevronRight size={13} />
              <strong>对话手记</strong>
            </div>
            <div className="header-tools">
              <button className="icon mobile-secondary" aria-label="对话文件夹" data-tooltip="对话文件夹" disabled={libraryDisabled} onClick={() => setLibraryOpen(true)}><FolderOpen size={19} /></button>
              <button className="icon update-entry mobile-secondary" aria-label={updates.hasUpdate ? "版本与更新，有新版本" : "版本与更新"} data-tooltip={updates.hasUpdate ? "版本与更新：有新版本可下载" : "版本与更新"} onClick={() => setUpdatesOpen(true)}>
                <span className="update-icon"><Download size={18} />{updates.hasUpdate && <span className="update-dot" aria-hidden="true" />}</span>
              </button>
              <button
                className={`api-badge mobile-secondary ${apiInfo?.configured ? "configured" : ""}`}
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
                aria-label="新建对话手记"
                data-tooltip="新建手记，保留当前记录"
                disabled={libraryDisabled}
                onClick={() => void createNotebook()}
              >
                <Plus size={20} />
              </button>
              <button
                className="icon mobile-secondary"
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
                  notebooks.active?.title || `${other}的对话手记`
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
                    disabled={!ready || switching || !!storageError}
                    onChange={(e) => { setNotice(""); void changeRelation(e.target.value as Relation); }}
                  >
                    {Object.entries(RELATIONS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {isNative && <ModelSelector status={apiInfo} disabled={busy || !ready} changed={setApiInfo}
                  notice={setNotice} configure={selection => { setSettingsSelection(selection); setSettings(true); }} />}
                <span className="save-badge">
                  <ShieldCheck size={13} />
                  {storageError ? "保存异常" : "仅在本机保存"}
                </span>
                <button className="text-button organize-notebook" disabled={manageDisabled} onClick={() => void editNotebook()}><Pencil size={13} /> 整理手记</button>
              </div>
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
          <div ref={reading.container} className="chat-reading">
          <div
            ref={scroller}
            id="chat-records"
            className="chat-scroll"
            tabIndex={reading.expanded ? 0 : undefined}
            role="region"
            aria-label={reading.expanded ? '聊天记录全屏阅读' : '聊天记录'}
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
                                    <div className="analysis-chips">{r?.emotions ? (
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
                                    )}</div>
                                  </div>
                                  <div className="analysis-row intent-row">
                                    <span className="analysis-row-label">
                                      意图
                                    </span>
                                    <div className="analysis-chips">{r?.intents ? (
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
                                    )}</div>
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
                        <button className="icon message-delete danger" aria-label={`删除第 ${i + 1} 条消息`} data-tooltip="删除这条聊天消息" disabled={manageDisabled} onClick={() => setMessageDelete(m)}><Trash2 size={15} strokeWidth={1.8} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {!!messages.length && <button ref={reading.control} style={reading.controlStyle} className="icon chat-reading-toggle" onClick={reading.toggle}
            disabled={reading.transitioning || switching} aria-controls="chat-records" aria-pressed={reading.expanded}
            aria-label={reading.expanded ? '退出聊天记录全屏' : '全屏显示聊天记录'}
            data-tooltip={reading.expanded ? '恢复正常布局' : '全屏显示聊天记录'}>
            {reading.expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>}
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
              disabled={!ready || switching || !!storageError}
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
                <span role="status">{storageError || notice || notebooks.workspaceNotice}</span>{" "}
                {storageError && notebooks.active && <button className="text-button" onClick={() => void notebooks.retrySave()}>重试保存</button>}
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
                disabled={!input.trim() || busy || !!storageError || !ready}
                onClick={() => prepare(input)}
              >
                <Sparkles size={15} />
                分析聊天
              </button>
            </div>
          </div>
        </section>
      </div>
      <TooltipLayer />
      <MobileDrawer ref={drawer} background={workspace} trigger={menuButton} onOpenChange={setMenuOpen}>
        <span className="rail-label">我的工作空间</span>
        <button className="rail-active" aria-current="page" onClick={() => menuAction(() => {
          stay.current = true;
          if (messages.length) virtual.scrollToIndex(messages.length - 1, { align: "end" });
        })}><MessageCircle size={19} /> 当前对话<span className="nav-count">{messages.length}</span></button>
        <button disabled={libraryDisabled} onClick={() => menuAction(() => setLibraryOpen(true))}><FolderOpen size={19} /> 对话文件夹</button>
        <button disabled={!ready || busy} onClick={() => menuAction(() => fileInput.current?.click())}><Upload size={19} /> 导入记录</button>
        <button disabled={busy} onClick={() => menuAction(() => prepare(exampleForRelation(relation)))}><BookOpen size={19} /> 试试一段示例</button>
        <span className="rail-label rail-label-second">工具与帮助</span>
        <button onClick={() => menuAction(() => setAppearanceOpen(true))}><Settings2 size={19} /> 外观模式</button>
        <button className="update-entry" aria-label={updates.hasUpdate ? "版本与更新，有新版本" : "版本与更新"} onClick={() => menuAction(() => setUpdatesOpen(true))}>
          <span className="update-icon"><Download size={19} />{updates.hasUpdate && <span className="update-dot" aria-hidden="true" />}</span>
          版本与更新{updates.hasUpdate && <span className="nav-count">新版本</span>}
        </button>
        <button onClick={() => menuAction(() => setSettings(true))}><Settings2 size={19} /> 分析与 API 设置
          <small className={`menu-api-status${apiInfo?.configured ? " configured" : ""}`}>{apiInfo?.configured ? "已配置" : "待配置"}</small>
        </button>
        <button onClick={() => menuAction(() => setDetail("overview"))}><Sparkles size={19} /> 查看分析解读</button>
        <button onClick={() => menuAction(() => setDetail("formats"))}><FileText size={19} /> 支持的格式</button>
        <button onClick={() => menuAction(() => setOnboarding(true))}><BookOpen size={19} /> 使用引导</button>
      </MobileDrawer>
      {importing && (
        <Modal title="确认聊天里的你" close={() => setImporting(false)}>
          <label className="field">
            本次分析场景
            <select
              value={importScene}
              onChange={(e) => setImportScene(e.target.value as Relation)}
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
                  aria-pressed={role === n}
                  key={n}
                  onClick={() => setRole(n)}
                >
                  {n}
                </button>
              ))}
            {names.length === 1 && (
              <button
                className={role === "__self_absent__" ? "selected" : ""}
                aria-pressed={role === "__self_absent__"}
                onClick={() => setRole("__self_absent__")}
              >
                这些都是对方的话
              </button>
            )}
          </div>
          <label className="field">保存到
            <select aria-label="导入保存方式" value={canAppend ? importTarget : "new"} onChange={(e) => setImportTarget(e.target.value as "new" | "append")}>
              <option value="new">新建独立手记（保留原记录）</option>
              {canAppend && <option value="append">追加到当前手记</option>}
            </select>
          </label>
          {(importTarget === "new" || !canAppend) && <label className="field">手记名称
            <input aria-label="导入手记名称" maxLength={100} value={importTitle} placeholder="留空则按聊天对象命名" onChange={(e) => setImportTitle(e.target.value)} />
          </label>}
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
            disabled={importInvalid}
            onClick={() => void confirmImport()}
          >
            开始分析
          </button>
          <button className="secondary" disabled={importInvalid} onClick={() => void confirmImport(false)}>只保存记录，暂不分析</button>
          <p className="folder-help">不同聊天对象会保存为独立手记；旧记录和分析保留在对话文件夹中。只有点击开始分析才会调用模型。</p>
        </Modal>
      )}
      {ready && onboarding && (
        <Modal title="初次使用引导" close={finishGuide}>
          <FirstRunGuide finish={finishGuide} configure={() => { finishGuide(); setSettings(true); }} />
        </Modal>
      )}
      {settings && (
        <Modal title="聊天设置" close={() => setSettings(false)}>
          <AppearanceSettings appearance={appearance} />
          {isNative && <MobileSettings status={apiInfo} changed={setApiInfo} selection={settingsSelection} disabled={busy} />}
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
              disabled={!ready || switching || !!storageError}
              onChange={(e) => { setNotice(""); void changeRelation(e.target.value as Relation); }}
            >
              {Object.entries(RELATIONS).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <p>
            各场景的分析分别保存。切回已分析且原文未变的场景会直接恢复；新场景需要点击继续分析，才消耗 API 额度。
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
            disabled={manageDisabled}
            onClick={() => {
              const note = notebooks.items.find((n) => n.id === notebooks.active?.id);
              if (note) requestNotebookDelete(note);
            }}
          >
            删除当前手记
          </button>
          <p>
            已保存 {messages.length.toLocaleString()} 条聊天。记录保存在
            {isMobile ? "这部手机" : isDesktop ? "这台电脑的应用中" : "本机浏览器"}
            ，重新打开后可继续；分析时只发送所需片段给模型服务。整份手记删除后进入回收站，可以恢复。
          </p>
          <button className="secondary" onClick={() => { setSettings(false); setOnboarding(true); }}>重新查看使用引导</button>
          <button className="secondary update-entry" aria-label={updates.hasUpdate ? "版本与更新 / 下载安装，有新版本" : "版本与更新 / 下载安装"} onClick={() => { setSettings(false); setUpdatesOpen(true); }}>
            <span className="update-icon"><Download size={18} />{updates.hasUpdate && <span className="update-dot" aria-hidden="true" />}</span>
            版本与更新 / 下载安装
          </button>
          <button className="secondary" disabled={libraryDisabled} onClick={() => { setSettings(false); setLibraryOpen(true); }}>打开对话文件夹</button>
        </Modal>
      )}
      {updatesOpen && <Modal title="版本与更新" close={() => setUpdatesOpen(false)}><UpdatesPage updates={updates} /></Modal>}
      {appearanceOpen && <Modal title="外观模式" close={() => setAppearanceOpen(false)}><AppearanceSettings appearance={appearance} /></Modal>}
      {updatePrompt && <Modal title="发现新版本" close={updates.snooze}>
        <p>对话手记 v{updates.result?.version} 已发布。</p>
        <p>当前版本 v{APP_BUILD.version}。{updates.result?.message}</p>
        <p>查看更新说明，下载对应系统的安装包即可更新。应用不会自动下载或安装，现有记录继续保存在本机。</p>
        <div className="update-actions">
          <button className="secondary" onClick={updates.snooze}>稍后再说</button>
          <button className="secondary" onClick={() => { updates.snooze(); setUpdatesOpen(true); }}>查看更新说明</button>
        </div>
        <UpdateDownloads />
        <button className="text-button" onClick={updates.dismiss}>此版本不再提醒</button>
      </Modal>}
      {notebookDelete && <Modal title={notebookDelete.permanent ? "彻底删除手记？" : "删除手记？"} close={() => setNotebookDelete(null)}>
        <p>「{notebookDelete.note.title}」共 {notebookDelete.note.count} 条聊天。
          {notebookDelete.permanent ? "将永久删除原文、分析和草稿，无法恢复。" : "将移入回收站，原文、分析和草稿仍可恢复。"}其他手记不会受影响。</p>
        <button className="primary danger" disabled={manageDisabled} onClick={() => void confirmNotebookDelete()}>{notebookDelete.permanent ? "确认彻底删除" : "移入回收站"}</button>
        <button className="secondary" onClick={() => setNotebookDelete(null)}>取消，保留记录</button>
      </Modal>}
      {messageDelete && <Modal title="删除这条聊天消息？" close={() => setMessageDelete(null)}>
        <blockquote>{messageDelete.text}</blockquote>
        <p>单条消息删除后无法撤销。后续评分和历史记忆可能依赖这句话，因此会清除当前手记所有场景的分析、总览和趋势；其他消息、草稿与其他手记保留。不会自动重新分析或消耗额度。</p>
        <button className="primary danger" disabled={manageDisabled} onClick={() => void confirmMessageDelete()}>确认删除这条消息</button>
        <button className="secondary" onClick={() => setMessageDelete(null)}>取消，保留消息</button>
      </Modal>}
      {trashOpen && <Modal title="手记回收站" close={() => setTrashOpen(false)}>
        <p>回收站不会调用模型，也不会自动清空。恢复会保留原文、所有场景分析和草稿；“彻底删除”才不可恢复。</p>
        {!notebooks.trashItems.length && <p className="folder-empty">回收站为空</p>}
        <div className="trash-list">{notebooks.trashItems.map((n) => <div className="trash-row" key={n.id}>
          <div><strong>{n.title}</strong><small>{RELATIONS[n.relation]} · {n.contact} · {n.count} 条</small></div>
          <button className="text-button" aria-label={`恢复手记：${n.title}`} disabled={manageDisabled} onClick={() => void notebooks.recover(n.id).then((restored) => { if (restored) setNotice("手记已恢复，原文和分析保留，没有调用模型。"); })}><RotateCcw size={15} />恢复</button>
          <button className="icon danger" aria-label={`彻底删除手记：${n.title}`} data-tooltip="彻底删除" disabled={manageDisabled} onClick={() => requestNotebookDelete(n, true)}><Trash2 size={15} /></button>
        </div>)}</div>
        <button className="secondary" onClick={() => { setTrashOpen(false); setLibraryOpen(true); }}>返回对话文件夹</button>
      </Modal>}
      {libraryOpen && <Modal title="对话文件夹" close={() => setLibraryOpen(false)}>
        <ConversationFolders items={notebooks.items} activeId={notebooks.active?.id} disabled={libraryDisabled}
          {...folderActions}
          select={(id) => void selectNotebook(id)} create={() => void createNotebook()} />
      </Modal>}
      {editingNotebook && <Modal title="整理当前手记" close={() => setEditingNotebook(false)}>
        <label className="field">手记名称<input aria-label="手记名称" maxLength={100} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></label>
        <label className="field">聊天对象分类<input aria-label="聊天对象分类" maxLength={80} value={editContact} onChange={(e) => setEditContact(e.target.value)} /></label>
        <label className="field">场景分类<select aria-label="手记场景分类" value={editScene} onChange={(e) => setEditScene(e.target.value as Relation)}>{Object.entries(RELATIONS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        <p>归入「{RELATIONS[editScene]} → {editContact || other}」。修改名称不改原文和分析；更换场景保留旧场景结果，不自动分析。</p>
        <button className="primary" disabled={manageDisabled || !editTitle.trim() || !editContact.trim()} onClick={() => void saveNotebookEdit()}>保存名称与分类</button>
      </Modal>}
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
                  <summary><ChevronRight size={16} aria-hidden="true" />参考的历史原话</summary>
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

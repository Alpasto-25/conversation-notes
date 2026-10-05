import { useVirtualizer } from "@tanstack/react-virtual";
import { useNotebooks } from "./useNotebooks";
import { ConversationFolders } from "./ConversationFolders";
import { NotebookTrash } from "./NotebookTrash";
import { MoveNotebook } from "./MoveNotebook";
import { ShareDialog, type ShareDialogHandle } from "./ShareDialog";
import { ChatMessage } from "./ChatMessage";
import { IconButton } from "./IconButton";
import { dismissNotebookDrag } from "./useNotebookDrag";
import type { ShareSource } from "./share-content";
import { SidebarResize } from "./SidebarResize";
import { ToggleSelect, dismissSelect } from "./ToggleSelect";
import { useDismissMotion } from "./useDismissMotion";
import { MobileDrawer, type MobileDrawerHandle } from "./MobileDrawer";
import { ModelSelector, type ModelSelection } from './ModelSelector';
import { useChatReading } from './useChatReading';
import { TooltipLayer } from "./TooltipLayer";
import { lockOverlayBackground } from "./overlay-lock";
import { emptyConversation, type NotebookSummary } from "./notebooks";
import { INTENTS } from "../shared/intents";
import { REPLY_RATINGS, replyRating } from "../shared/ratings";
import { EMOTIONS } from "../shared/labels";
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
  Share2,
  BarChart3,
  History,
  CircleAlert,
  Square,
  ArrowLeft,
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
import { AnalysisUsage } from "./AnalysisUsage";
import { sameAnalysisModel } from "../shared/usage";
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
  suspended = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  suspended?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { closing, dismiss } = useDismissMotion(close);
  useLayoutEffect(() => {
    if (suspended) return;
    const old = document.activeElement as HTMLElement;
    ref.current?.focus();
    const unlock = lockOverlayBackground(document.querySelector<HTMLElement>(".workspace"));
    const onKey = (e: KeyboardEvent) => {
      if (Array.from(document.querySelectorAll(".overlay:not([inert]) .modal")).at(-1) !== ref.current) return;
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
      document.removeEventListener("keydown", onKey);
      unlock();
      if (old?.isConnected && old.getClientRects().length && !old.closest("[inert]")) old.focus();
      else document.querySelector<HTMLButtonElement>(".mobile-menu-toggle")?.focus();
    };
  }, [suspended]);
  return (
    <div
      className={`overlay${closing ? " is-closing" : ""}`}
      inert={suspended}
      aria-hidden={suspended || undefined}
      onMouseDown={(e) => !suspended && e.target === e.currentTarget && dismiss()}
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
  const [usageOpen, setUsageOpen] = useState<'current' | 'failed' | false>(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const drawer = useRef<MobileDrawerHandle>(null);
  const closeMenu = useCallback(() => drawer.current?.close(), []);
  const workspace = useRef<HTMLDivElement>(null), menuButton = useRef<HTMLButtonElement>(null), notebookFrame = useRef<HTMLElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false), [editingNotebook, setEditingNotebook] = useState(false);
  const [editTitle, setEditTitle] = useState(""), [editContact, setEditContact] = useState("");
  const [editScene, setEditScene] = useState<Relation>("general"), [trashOpen, setTrashOpen] = useState(false);
  const [notebookDelete, setNotebookDelete] = useState<{ notes: NotebookSummary[]; permanent: boolean; empty: boolean } | null>(null);
  const [messageDelete, setMessageDelete] = useState<Message | null>(null);
  const [movingNotes, setMovingNotes] = useState<NotebookSummary[] | null>(null);
  const sharePreview = useRef<ShareDialogHandle>(null);
  const [shareSource, setShareSource] = useState<ShareSource | null>(null);
  const [importScene, setImportScene] = useState<Relation>("general"), [importTarget, setImportTarget] = useState<"current" | "new" | "append">("new"),
    [importTitle, setImportTitle] = useState("");
  const [importDraft, setImportDraft] = useState("");
  const [importModelSaving, setImportModelSaving] = useState(false);
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
    !libraryOpen && !editingNotebook && !trashOpen && !notebookDelete && !messageDelete && !movingNotes && !shareSource && !overlap;
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
      if (dismissNotebookDrag()) return true;
      if (dismissSelect()) return true;
      if (updatePrompt) { updates.snooze(); return true; }
      if (usageOpen) { setUsageOpen(false); return true; }
      if (appearanceOpen) { setAppearanceOpen(false); return true; }
      if (messageDelete) { setMessageDelete(null); return true; }
      if (notebookDelete) { setNotebookDelete(null); return true; }
      if (movingNotes) { setMovingNotes(null); return true; }
      if (shareSource) { return sharePreview.current?.back() ?? true; }
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
      if (settings) {
        setSettings(false);
        return true;
      }
      if (importing) {
        setImporting(false);
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
  }, [overlap, importing, settings, detail, onboarding, updatesOpen, appearanceOpen, usageOpen, updatePrompt, updates.snooze, libraryOpen, editingNotebook, trashOpen, notebookDelete, messageDelete, movingNotes, shareSource, closeMenu, reading.expanded, reading.close]);
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
    const fillCurrent = notebooks.canFill(text);
    setImportTarget(fillCurrent ? "current" : !separate && messages.length && names.every((n) => n === self || n === other) ? "append" : "new");
    setImportTitle(fillCurrent && notebooks.active?.title !== "新手记" ? notebooks.active?.title || title : title);
    setImportDraft(text);
    setImporting(true);
  }
  async function confirmImport(analyze = true) {
    async function moveNotebookTo(notes: NotebookSummary[], scene: Relation, contact: string) {
    if (await notebooks.move(notes.map(note => note.id), scene, contact)) setNotice("手记已移动");
  }
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
    const note = importTarget === "current" && canFillCurrent
      ? await notebooks.fill(conversation, importTitle || `${nextOther}的对话手记`, nextOther, importDraft)
      : await notebooks.create(conversation, importTitle || `${nextOther}的对话手记`, nextOther);
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
  function requestNotebookDelete(note: NotebookSummary | NotebookSummary[], permanent = false, empty = false) {
    const notes = Array.isArray(note) ? note : [note];
    if (!notes.length) return;
    setSettings(false); setNotebookDelete({ notes, permanent, empty });
  }
  async function confirmNotebookDelete() {
    if (!notebookDelete) return;
    const ids = notebookDelete.notes.map(note => note.id);
    const result = notebookDelete.permanent ? await notebooks.purgeMany(ids) : await notebooks.recycleMany(ids);
    if (!result) return;
    setNotice(notebookDelete.permanent ? `已彻底删除 ${ids.length} 份手记，其他记录不受影响。` : `已将 ${ids.length} 份手记移入回收站，可随时恢复。`);
    setNotebookDelete(null); setDetail(null);
  }
  async function confirmMessageDelete() {
    if (!messageDelete || !await notebooks.deleteMessages([messageDelete.id])) return;
    setMessageDelete(null); setDetail(null); setNotice("消息已删除。为避免使用已删除的上下文，该手记的旧分析已清除；需要时再点击继续分析。");
  }
  const openTrash = () => setTrashOpen(true);
  async function recoverNotebooks(notes: NotebookSummary[]) {
    if (notes.length && await notebooks.recoverMany(notes.map(note => note.id))) setNotice(`已恢复 ${notes.length} 份手记，原文、分析和草稿保留。`);
  }
  async function saveNotebookEdit() {
    if (!await notebooks.rename(editTitle, editContact, editScene)) return;
    setEditingNotebook(false); setNotice("已保存；新场景可按需分析。");
  }
  async function moveNotebooks(scene: Relation, contact: string) {
    if (!movingNotes || !await notebooks.move(movingNotes.map(note => note.id), scene, contact)) return;
    setMovingNotes(null); setNotice("手记已移动，分析和草稿保留。");
  }
  async function moveNotebookTo(notes: NotebookSummary[], scene: Relation, contact: string) {
    if (await notebooks.move(notes.map(note => note.id), scene, contact)) setNotice("手记已移动");
  }
  const names = [...new Set(parsed.map((x) => x.speaker))];
  const canAppend = !!messages.length && role === self && names.every((name) => name === self || name === other) && importScene === relation;
  const canFillCurrent = notebooks.canFill(importDraft);
  const effectiveImportTarget = importTarget === "current" && canFillCurrent ? "current" : importTarget === "append" && canAppend ? "append" : "new";
  const libraryDisabled = !ready || switching || !!storageError;
  const manageDisabled = libraryDisabled || busy;
  const folderActions = { moveTo: (notes: NotebookSummary[], scene: Relation, contact: string) => void moveNotebookTo(notes, scene, contact), edit: (id: string) => void editNotebook(id), move: (notes: NotebookSummary[]) => setMovingNotes(notes), recycle: (note: NotebookSummary) => requestNotebookDelete(note),
    recycleMany: (notes: NotebookSummary[]) => requestNotebookDelete(notes),
    trashCount: notebooks.trashItems.length, openTrash, manageDisabled };
  const importInvalid = busy || importModelSaving || !!storageError || !role || !parsed.length || names.length > 2 || names.includes("未分配") || (!names.includes(role) && role !== "__self_absent__");
  function menuAction(action: () => void) { closeMenu(); action(); }
  const chosen = messages.find((m) => m.id === detail),
    result = detail ? a.lines[detail] : undefined;
  return (
    <main className={`app${isDesktop ? " desktop-app" : ""}${reading.expanded ? " is-chat-reading" : ""}`}>
      <div ref={workspace} className="workspace">
        <section ref={notebookFrame} className={`notebook${messages.length ? '' : ' is-empty'}`} aria-label="对话分析">
          {isDesktop && <SidebarResize container={notebookFrame} />}
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
            <button disabled={libraryDisabled} onClick={() => void createNotebook()}><Plus size={18} /> 新建手记</button>
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
                  ? `${messages.length.toLocaleString()} 条消息`
                  : "从日常聊天到工作沟通，看见情绪、表达和下一步。"}
              </p>
              <div className="document-meta">
                <label className="scene-control">
                  <span>分析场景</span>
                  <ToggleSelect
                    className="scene-select"
                    aria-label="分析场景"
                    value={relation}
                    disabled={!ready || switching || !!storageError}
                    onChange={value => { setNotice(""); void changeRelation(value as Relation); }}
                  >
                    {Object.entries(RELATIONS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </ToggleSelect>
                </label>
                {isNative && <ModelSelector status={apiInfo} disabled={busy || !ready} changed={setApiInfo}
                  notice={setNotice} configure={selection => { setSettingsSelection(selection); setSettings(true); }} />}
                <span className="save-badge">
                  <ShieldCheck size={13} />
                  {storageError ? "保存异常" : "仅在本机保存"}
                </span>
                <IconButton label="整理手记" className="organize-notebook" disabled={manageDisabled} onClick={() => void editNotebook()}><Pencil size={18} /></IconButton>
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
                      <ChatMessage message={m} result={r} self={self} other={other}
                        showTime={i === 0 || m.timestamp !== messages[i - 1].timestamp} busy={busy}
                        detail={() => setDetail(m.id)} analyze={() => a.run(messages, relation)}
                        trailing={<button className="icon message-delete danger" aria-label={`删除第 ${i + 1} 条消息`} data-tooltip="删除这条聊天消息" disabled={manageDisabled} onClick={() => setMessageDelete(m)}><Trash2 size={15} strokeWidth={1.8} /></button>} />
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
              <IconButton label="导入文本文件" disabled={!ready || busy} onClick={() => fileInput.current?.click()}><Upload size={18} /></IconButton>
              <IconButton label="查看支持格式" onClick={() => setDetail("formats")}><FileText size={18} /></IconButton>
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
                <span role="status">{storageError || notice || notebooks.workspaceNotice}</span>
                <div className="composer-actions">
                  {storageError && notebooks.active && <IconButton label="重试保存" onClick={() => void notebooks.retrySave()}><RotateCcw size={18} /></IconButton>}
                  <div className="analysis-status" aria-live="polite">
                    {busy ? <><span className="working" /><span>{a.progress.done}/{a.progress.total}</span><IconButton label="停止分析" onClick={a.cancel}><Square size={17} /></IconButton></>
                      : a.status === "error" ? <><CircleAlert size={18} aria-label="分析未完成" /><IconButton label="重试分析" onClick={() => a.run(messages, relation)}><RotateCcw size={18} /></IconButton></>
                      : a.status === "complete" ? <span className="completed" aria-label="分析完成" data-tooltip="分析完成"><Check size={18} /><IconButton label="查看解读" onClick={() => setDetail("overview")}><Sparkles size={18} /></IconButton></span>
                      : messages.length ? <IconButton label="继续分析" onClick={() => a.run(messages, relation)}><Sparkles size={18} /></IconButton> : null}
                  </div>
                  {!!messages.length && <IconButton label="分享片段" className="share-entry" disabled={busy} onClick={() => setShareSource({ title: notebooks.active?.title || "对话片段", conversation: notebooks.snapshot() })}><Share2 size={18} /></IconButton>}
                  {a.status === 'complete' && apiInfo?.configured && !sameAnalysisModel(a.analysisIdentity, { provider: apiInfo.provider ?? '', model: apiInfo.model ?? '' }) &&
                    <IconButton label={`用当前模型重新分析（已保存：${a.analysisIdentity?.model || '未记录模型'}；当前：${apiInfo.model}）`} disabled={busy} onClick={() => a.run(messages, relation)}><RotateCcw size={18} /></IconButton>}
                  {a.analysisUsage && <IconButton label={a.usageRestored ? '上次分析用量' : '本次分析用量'} onClick={() => setUsageOpen('current')}><BarChart3 size={18} /></IconButton>}
                  {a.failedAnalysisUsage && a.failedAnalysisUsage.run_id !== a.analysisUsage?.run_id && <IconButton label="上次未完成用量" onClick={() => setUsageOpen('failed')}><History size={18} /></IconButton>}
                </div>
                {a.error && <span className="error" role="alert">{a.error}</span>}
              </div>
              <button type="button" className="send" disabled={!input.trim() || busy || !!storageError || !ready} onClick={() => prepare(input)}><Sparkles size={19} /><span>开始分析</span></button>
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
        <Modal title="确认聊天里的你" close={() => setImporting(false)} suspended={settings}>
          <label className="field">
            本次分析场景
            <ToggleSelect
              aria-label="本次分析场景"
              value={importScene}
              onChange={value => setImportScene(value as Relation)}
            >
              {Object.entries(RELATIONS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </ToggleSelect>
          </label>
          {isNative && <ModelSelector field status={apiInfo} disabled={busy} changed={setApiInfo} pendingChanged={setImportModelSaving}
            notice={setNotice} configure={selection => { setSettingsSelection(selection); setSettings(true); }} />}
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
            <ToggleSelect aria-label="导入保存方式" value={effectiveImportTarget} onChange={value => setImportTarget(value as "current" | "new" | "append")}>
              {canFillCurrent && <option value="current">填入当前空手记</option>}
              <option value="new">新建手记</option>
              {canAppend && <option value="append">追加到当前手记</option>}
            </ToggleSelect>
          </label>
          {effectiveImportTarget !== "append" && <label className="field">手记名称
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
          <button className="secondary" disabled={importInvalid} onClick={() => void confirmImport(false)}>只保存</button>
          <p className="folder-help">只保存不消耗额度。已有手记保留。</p>
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
            <ToggleSelect
              aria-label="设置分析场景"
              value={relation}
              disabled={!ready || switching || !!storageError}
              onChange={value => { setNotice(""); void changeRelation(value as Relation); }}
            >
              {Object.entries(RELATIONS).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </ToggleSelect>
          </label>
          <p>
            各场景分别保存分析；切回原场景可直接恢复。
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
            ；分析片段会发送给所选模型。
          </p>
          <button className="secondary" onClick={() => { setSettings(false); setOnboarding(true); }}>使用引导</button>
          <button className="secondary update-entry" aria-label={updates.hasUpdate ? "版本与更新，有新版本" : "版本与更新"} onClick={() => { setSettings(false); setUpdatesOpen(true); }}>
            <span className="update-icon"><Download size={18} />{updates.hasUpdate && <span className="update-dot" aria-hidden="true" />}</span>
            版本与更新
          </button>
          <button className="secondary" disabled={libraryDisabled} onClick={() => { setSettings(false); setLibraryOpen(true); }}>对话文件夹</button>
        </Modal>
      )}
      {updatesOpen && <Modal title="版本与更新" close={() => setUpdatesOpen(false)}><UpdatesPage updates={updates} /></Modal>}
      {usageOpen && <Modal title={usageOpen === 'failed' ? '上次未完成用量' : a.usageRestored ? '上次分析用量' : '本次分析用量'} close={() => setUsageOpen(false)}>
        {usageOpen === 'failed' && <p>最近未完成分析的用量，单独统计。</p>}
        <AnalysisUsage usage={usageOpen === 'failed' ? a.failedAnalysisUsage : a.analysisUsage} restored={usageOpen === 'failed' || a.usageRestored} />
      </Modal>}
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
      {messageDelete && <Modal title="删除这条聊天消息？" close={() => setMessageDelete(null)}>
        <blockquote>{messageDelete.text}</blockquote>
        <p>删除消息不可撤销，并会清除这份手记各场景的旧分析。其他消息和草稿保留，不自动重算。</p>
        <button className="primary danger" disabled={manageDisabled} onClick={() => void confirmMessageDelete()}>删除消息</button>
        <button className="secondary" onClick={() => setMessageDelete(null)}>取消</button>
      </Modal>}
      {libraryOpen && <Modal title="对话文件夹" close={() => setLibraryOpen(false)} suspended={trashOpen || !!notebookDelete || !!movingNotes}>
        <ConversationFolders items={notebooks.items} activeId={notebooks.active?.id} disabled={libraryDisabled}
          {...folderActions}
          select={(id) => void selectNotebook(id)} create={() => void createNotebook()} />
      </Modal>}
      {movingNotes && <Modal title="移动手记" close={() => setMovingNotes(null)}>
        <MoveNotebook notes={movingNotes} items={notebooks.items} disabled={manageDisabled} move={(scene, contact) => void moveNotebooks(scene, contact)} />
      </Modal>}
      {shareSource && <ShareDialog ref={sharePreview} source={shareSource} close={() => setShareSource(null)} />}
      {trashOpen && <Modal title="手记回收站" close={() => setTrashOpen(false)} suspended={!!notebookDelete}>
        <NotebookTrash items={notebooks.trashItems} disabled={manageDisabled} recover={notes => void recoverNotebooks(notes)} purge={notes => requestNotebookDelete(notes, true)} empty={() => requestNotebookDelete(notebooks.trashItems, true, true)} />
        <IconButton label="返回对话文件夹" onClick={() => { setTrashOpen(false); setLibraryOpen(true); }}><ArrowLeft size={18} /></IconButton>
      </Modal>}
      {notebookDelete && <Modal title={notebookDelete.empty ? "清空回收站？" : notebookDelete.permanent ? "彻底删除手记？" : "删除手记？"} close={() => setNotebookDelete(null)}>
        <p>已选择 {notebookDelete.notes.length} 份手记，共 {notebookDelete.notes.reduce((count, note) => count + note.count, 0)} 条聊天。
          {notebookDelete.permanent ? "将永久删除原文、分析和草稿，无法恢复。" : "将移入回收站，原文、分析和草稿仍可恢复。"}其他手记不会受影响。</p>
        <ul className="batch-confirm-list">{notebookDelete.notes.slice(0, 8).map(note => <li key={note.id}>{note.title}</li>)}</ul>
        {notebookDelete.notes.length > 8 && <p>另有 {notebookDelete.notes.length - 8} 份已选手记。</p>}
        <button className="primary danger" disabled={manageDisabled} onClick={() => void confirmNotebookDelete()}>{notebookDelete.empty ? "确认清空" : notebookDelete.permanent ? "确认彻底删除" : "移入回收站"}</button>
        <button className="secondary" disabled={switching} onClick={() => setNotebookDelete(null)}>取消</button>
      </Modal>}
      {editingNotebook && <Modal title="整理当前手记" close={() => setEditingNotebook(false)}>
        <label className="field">手记名称<input aria-label="手记名称" maxLength={100} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></label>
        <label className="field">聊天对象分类<input aria-label="聊天对象分类" maxLength={80} value={editContact} onChange={(e) => setEditContact(e.target.value)} /></label>
        <label className="field">分析场景<ToggleSelect aria-label="手记场景分类" value={editScene} onChange={value => setEditScene(value as Relation)}>{Object.entries(RELATIONS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</ToggleSelect></label>
        <p>分析场景：{RELATIONS[editScene]}。换场景会保留旧结果；调整文件夹请使用“移动”。</p>
        <button className="primary" disabled={manageDisabled || !editTitle.trim() || !editContact.trim()} onClick={() => void saveNotebookEdit()}>保存</button>
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
                  : "0—100 表示当前沟通状态，不代表真实心理或合作成功率。"}
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
                其他记录可整理为以下双人对话格式：
              </p>
              <pre className="format-example">
                {
                  "我：请问这份方案什么时候能确认？\n对方：明天下午，我会把修改意见发你。\n我：好的，收到后我们再核对。"
                }
              </pre>
              <p>
                可导入 UTF-8 的 .txt、.md 和 .log
                文件。群聊请整理为双人对话；图片和语音需先转成文字。
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
                我方回复的平均分，依据发出时的前文评价。
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
                    候选解读仅供参考。前三项保留原始概率，不合并为 100%。
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

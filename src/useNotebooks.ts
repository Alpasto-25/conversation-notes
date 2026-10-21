import { useEffect, useRef, useState } from "react";
import { RUBRIC, type Message, type Relation } from "../shared/types";
import { notebookStore, type SavedConversation } from "./storage";
import { canFillNotebook, fillNotebook, emptyConversation, newNotebook, organizeNotebook, withoutMessages, summarizeNotebook, type Notebook, type NotebookSummary } from "./notebooks";
import type { useAnalysis } from "./useAnalysis";
import type { NotebookBackup, RestoreMode } from './backup';
import { reviseNotebook, undoMessageChange } from './message-edit';
import { checkpointNotebook, mergeRunHistory, restoreAnalysisVersion } from './analysis-history';
import { updatePersonalNotebook, type PersonalNotes } from './personal-notes';

export function useNotebooks(a: ReturnType<typeof useAnalysis>) {
  const [messages, setMessages] = useState<Message[]>([]), [input, setInput] = useState("");
  const [self, setSelf] = useState(""), [other, setOther] = useState("对方"), [relation, setRelation] = useState<Relation>("general");
  const [active, setActive] = useState<Notebook | null>(null), [items, setItems] = useState<NotebookSummary[]>([]);
  const [trashItems, setTrashItems] = useState<NotebookSummary[]>([]);
  const [ready, setReady] = useState(false), [storageError, setStorageError] = useState(""), [switching, setSwitching] = useState(false);
  const [workspaceNotice, setWorkspaceNotice] = useState("");
  const changing = useRef(false), scenes = useRef<Notebook["scenes"]>({});
  const lastSaved = useRef<Notebook | null>(null);
  const pending = useRef<Notebook | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readingAnchor = useRef<Notebook['reading']>(undefined), readingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function updateList(note: Notebook) {
    setItems((old) => [summarizeNotebook(note), ...old.filter((n) => n.id !== note.id)]
      .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)));
  }
  function apply(note: Notebook) {
    note = { ...note, runHistory: mergeRunHistory(note.runHistory, note.conversation.analysisUsage, note.conversation.semanticUsage, note.conversation.failedAnalysisUsage,
      ...Object.values(note.scenes).flatMap(c => [c.analysisUsage, c.semanticUsage, c.failedAnalysisUsage])) };
    if (readingTimer.current) clearTimeout(readingTimer.current);
    readingAnchor.current = note.reading;
    setActive(note); lastSaved.current = note; scenes.current = note.scenes; pending.current = null;
    const saved = note.conversation;
    setMessages(saved.messages); setSelf(saved.self); setOther(saved.other); setRelation(saved.relation); setInput(note.draft);
    a.restore(saved);
    setWorkspaceNotice(saved.rubric !== RUBRIC ? '规则已更新，可重新分析。'
      : saved.analysisTask && saved.analysisTask.status !== 'complete' ? `上次分析保留进度 ${saved.analysisTask.done}/${saved.analysisTask.total}。可点击继续分析，已完成结果会按上下文复用。` : '');
  }
  function snapshot(): SavedConversation {
    return { schema: 1, rubric: RUBRIC, messages, self, other, relation, lines: a.lines,
      events: a.events, overview: a.overview, trend: a.trend, analyzedCount: a.analyzedCount,
      completed: a.status === "complete" && a.overviewFresh && a.analyzedCount === messages.length,
      targetCache: a.targetCache(), analysisUsage: a.analysisUsage, failedAnalysisUsage: a.failedAnalysisUsage, analysisIdentity: a.analysisIdentity, semanticUsage: a.semanticUsage,
      semanticState: { status: a.semanticStatus, message: a.semanticNotice }, overviewSource: a.overviewSource,
      ...((a.status !== 'idle' || a.analysisIdentity || a.analysisUsage || Object.keys(a.lines).length) ? { analysisTask: { status: a.status === 'loading' ? 'running' as const : a.status === 'complete' ? 'complete' as const : a.status === 'error' ? 'error' as const : 'paused' as const,
        done: a.progress.done, total: a.progress.total } } : {}) };
  }
  function capture(): Notebook | null {
    if (!active) return null;
    const conversation = snapshot();
    const saved = lastSaved.current;
    const unchanged = saved?.id === active.id && saved.title === active.title && saved.contact === active.contact && saved.folderRelation === active.folderRelation && saved.draft === input
      && (Object.keys(conversation) as (keyof SavedConversation)[]).every((key) => saved.conversation[key] === conversation[key]);
    const history = saved?.id === active.id ? saved.runHistory : active.runHistory;
    const runHistory = mergeRunHistory(history, saved?.conversation.analysisUsage, saved?.conversation.semanticUsage, saved?.conversation.failedAnalysisUsage,
      a.analysisUsage, a.semanticUsage, a.failedAnalysisUsage);
    return { ...active, runHistory, reading: readingAnchor.current, updatedAt: unchanged ? saved.updatedAt : new Date().toISOString(), draft: input, conversation,
      scenes: { ...scenes.current, [relation]: conversation } };
  }
  function cancelTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; pending.current = null;
  }
  async function persist(note: Notebook) { if (!await notebookStore.save(note)) throw new Error("手记已在回收站，停止保存"); if (lastSaved.current?.id === note.id) lastSaved.current = note; updateList(note); }
  function flush() {
    const note = pending.current;
    cancelTimer();
    if (note) void persist(note).catch(() => setStorageError("本机保存失败。请勿关闭应用，以免丢失未保存记录；可点击重试保存。"));
  }
  useEffect(() => {
    let live = true;
    void notebookStore.loadLibrary().then(async (library) => {
      let note = library.active;
      if (!note) { note = newNotebook(); await notebookStore.save(note, true); }
      if (!live) return;
      setItems(library.items.length ? library.items : [summarizeNotebook(note)]); setTrashItems(library.trash); apply(note); setReady(true);
    }).catch(() => {
      if (live) { setStorageError("本机记录读取失败。请关闭其他旧版窗口后重开应用；为保护旧记录，暂不允许保存或切换。"); setReady(true); }
    });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!ready || storageError || changing.current) return;
    pending.current = capture();
    if (a.status !== 'loading' && timer.current) clearTimeout(timer.current);
    if (a.status !== 'loading' || !timer.current) timer.current = setTimeout(flush, a.status === 'loading' ? 750 : 350);
  }, [ready, active, messages, input, self, other, relation, a.lines, a.events, a.overview, a.overviewFresh, a.trend, a.analyzedCount, a.status, a.analysisUsage, a.failedAnalysisUsage, a.analysisIdentity, a.semanticUsage, a.semanticStatus, a.semanticNotice, a.overviewSource]);
  useEffect(() => { if (a.status === 'loading') setWorkspaceNotice(''); }, [a.status]);
  useEffect(() => {
    const hidden = () => {
      if (timer.current) flush();
      if (readingTimer.current && lastSaved.current && readingAnchor.current) {
        clearTimeout(readingTimer.current); readingTimer.current = null;
        void notebookStore.rememberReading(lastSaved.current.id, readingAnchor.current).catch(() => {});
      }
    };
    window.addEventListener("pagehide", hidden); document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("pagehide", hidden); document.removeEventListener("visibilitychange", hidden); if (timer.current) clearTimeout(timer.current); };
  }, []);
  async function transition(next: () => Promise<Notebook>, saveCurrent = true) {
    if (!ready || storageError || changing.current) return;
    changing.current = true; setSwitching(true); cancelTimer();
    const old = capture();
    a.cancel();
    try {
      if (saveCurrent && old) await persist(old);
      const note = await next();
      await notebookStore.select(note.id); apply(note);
      return note;
    } catch {
      setStorageError("保存或读取失败，已停止切换以保护记录。请勿关闭应用，可点击重试保存。");
    } finally { changing.current = false; setSwitching(false); }
  }
  function select(id: string) {
    if (id === active?.id) return Promise.resolve(undefined);
    return transition(async () => { const note = await notebookStore.load(id); if (!note) throw new Error("手记不存在"); return note; });
  }
  function create(conversation = emptyConversation(relation), title = "新手记", contact = "") {
    if (ready && !storageError && !changing.current && active?.title === "新手记" && active.contact === "对方"
      && !messages.length && !input.trim() && !conversation.messages.length && title === "新手记" && !contact) {
      setWorkspaceNotice("已有空手记，可直接导入。");
      return Promise.resolve(active);
    }
    return transition(async () => {
      const note = newNotebook(conversation, title, contact); await notebookStore.save(note, true); updateList(note); return note;
    });
  }
  function canFill(importedDraft = "") { const note = capture(); return !!note && canFillNotebook(note, importedDraft); }
  function fill(conversation: SavedConversation, title: string, contact: string, importedDraft: string) {
    if (!active || !canFill(importedDraft)) return Promise.resolve(undefined);
    return transition(async () => {
      const saved = await notebookStore.load(active.id);
      if (!saved) throw new Error("手记不存在");
      const note = fillNotebook(saved, conversation, title, contact, importedDraft);
      await persist(note); return note;
    });
  }
  function changeRelation(next: Relation) {
    if (next === relation || changing.current || !active || storageError) return;
    // Save the departing scene before restoring and saving the destination.
    return transition(async () => {
      const saved = await notebookStore.load(active.id);
      if (!saved || saved.deletedAt) throw new Error("手记不存在");
      const note = organizeNotebook(saved, saved.title, saved.contact, next);
      await persist(note);
      return note;
    }).then((note) => {
      if (!note) return;
      setWorkspaceNotice(note.conversation.completed ? ""
        : note.conversation.messages.length ? "此场景尚未分析。" : "");
    });
  }
  function rename(title: string, contact: string, scene = relation) {
    if (!active) return Promise.resolve(undefined);
    return transition(async () => {
      const saved = await notebookStore.load(active.id); if (!saved || saved.deletedAt) throw new Error("手记不存在");
      const note = organizeNotebook(saved, title, contact, scene); await persist(note); return note;
    });
  }
  function mutateLibrary(action: () => Promise<void>) {
    return transition(async () => {
      await action();
      const library = await notebookStore.loadLibrary(); setItems(library.items); setTrashItems(library.trash);
      if (library.active) return library.active;
      const note = newNotebook(); await notebookStore.save(note, true); updateList(note); return note;
    });
  }
  function recycle(id = active?.id) {
    if (!id) return Promise.resolve(undefined);
    return mutateLibrary(() => notebookStore.recycle(id));
  }
  function recover(id: string) { return mutateLibrary(() => notebookStore.recover(id)); }
  function move(ids: readonly string[], scene: Relation, contact: string) { return mutateLibrary(() => notebookStore.move(ids, scene, contact)); }
  function recycleMany(ids: readonly string[]) { return mutateLibrary(() => notebookStore.batch(ids, "recycle")); }
  function recoverMany(ids: readonly string[]) { return mutateLibrary(() => notebookStore.batch(ids, "recover")); }
  function purgeMany(ids: readonly string[]) { return mutateLibrary(() => notebookStore.batch(ids, "purge")); }
  function purge(id: string) {
    return mutateLibrary(async () => {
      const note = await notebookStore.load(id);
      if (!note?.deletedAt) throw new Error("仅允许彻底删除回收站中的手记");
      await notebookStore.remove(id);
    });
  }
  function deleteMessages(ids: readonly string[]) {
    if (!active || !ids.length) return Promise.resolve(undefined);
    return transition(async () => {
      const note = await notebookStore.load(active.id); if (!note || note.deletedAt) throw new Error("手记不存在");
      const selected = new Set(ids);
      const next = await reviseNotebook(note, note.conversation.messages.filter(m => !selected.has(m.id)), '删除消息'); await persist(next); return next;
    });
  }
  async function retrySave() {
    const note = capture(); if (!note) return;
    try { await persist(note); setStorageError(""); } catch { setStorageError("重试保存失败，请勿关闭应用。检查本机存储空间和权限后再试。"); }
  }
  function editMessage(id: string, text: string, sender: Message['sender']) {
    return transition(async () => {
      const note = await notebookStore.load(active!.id); if (!note || note.deletedAt || !text.trim()) throw new Error('消息不可编辑');
      const messages = note.conversation.messages.map(m => m.id === id ? { ...m, text: text.trim(), sender } : m);
      const next = await reviseNotebook(note, messages, '编辑消息'); await persist(next); return next;
    });
  }
  function undoMessages() {
    return transition(async () => {
      const note = await notebookStore.load(active!.id); if (!note || note.deletedAt) throw new Error('手记不存在');
      const next = undoMessageChange(note); await persist(next); return next;
    });
  }
  function invalidateTargets(ids: readonly string[]) {
    return transition(async () => {
      const note = await notebookStore.load(active!.id); if (!note || note.deletedAt) throw new Error('手记不存在');
      const next = await reviseNotebook(checkpointNotebook(note, '局部重算前'), note.conversation.messages, '局部重新分析', ids); await persist(next); return next;
    });
  }
  function checkpointAnalysis(label: string) {
    return transition(async () => {
      const note = await notebookStore.load(active!.id); if (!note || note.deletedAt) throw new Error('手记不存在');
      const next = checkpointNotebook(note, label); await persist(next); return next;
    });
  }
  function restoreVersion(id: string) {
    return transition(async () => {
      const note = await notebookStore.load(active!.id); if (!note || note.deletedAt) throw new Error('手记不存在');
      const next = restoreAnalysisVersion(note, id); await persist(next); return next;
    });
  }
  function savePersonal(value: PersonalNotes) {
    return transition(async () => {
      const note = await notebookStore.load(active!.id); if (!note || note.deletedAt) throw new Error('手记不存在');
      const next = updatePersonalNotebook(note, value); await persist(next); return next;
    });
  }
  function toggleFavorite(id: string) {
    const favorites = active?.favorites ?? [];
    return savePersonal({ favorites: favorites.includes(id) ? favorites.filter(key => key !== id) : [...favorites, id] });
  }
  async function exportData(onlyCurrent = false) {
    const current = capture();
    cancelTimer();
    if (current) await persist(current);
    return onlyCurrent && current ? [current] : notebookStore.exportAll();
  }
  function rememberReading(reading: NonNullable<Notebook['reading']>) {
    if (!active || changing.current || storageError) return;
    readingAnchor.current = reading;
    if (readingTimer.current) clearTimeout(readingTimer.current);
    const id = active.id;
    readingTimer.current = setTimeout(() => { void notebookStore.rememberReading(id, reading).catch(() => {}); }, 500);
  }
  async function restoreBackup(backup: NotebookBackup, mode: RestoreMode) {
    let result = { imported: 0, skipped: 0 };
    const note = await mutateLibrary(async () => { result = await notebookStore.restoreBackup(backup, mode); });
    if (!note) throw new Error('恢复失败，现有记录已保留。请检查本机存储后重试。');
    return result;
  }
  return { messages, setMessages, input, setInput, self, setSelf, other, setOther, relation,
    runHistory: mergeRunHistory(lastSaved.current?.id === active?.id ? lastSaved.current?.runHistory : active?.runHistory, a.analysisUsage, a.semanticUsage, a.failedAnalysisUsage),
    active, items, trashItems, ready, storageError, switching, workspaceNotice, snapshot, select, create, canFill, fill,
    changeRelation, rename, move, recycle, recover, purge, recycleMany, recoverMany, purgeMany, deleteMessages, editMessage, undoMessages, invalidateTargets, checkpointAnalysis, restoreVersion, savePersonal, toggleFavorite, retrySave, exportData, restoreBackup, rememberReading };
}

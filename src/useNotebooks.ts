import { useEffect, useRef, useState } from "react";
import { RUBRIC, type Message, type Relation } from "../shared/types";
import { notebookStore, type SavedConversation } from "./storage";
import { conversationInScene, emptyConversation, newNotebook, summarizeNotebook, type Notebook, type NotebookSummary } from "./notebooks";
import type { useAnalysis } from "./useAnalysis";

export function useNotebooks(a: ReturnType<typeof useAnalysis>) {
  const [messages, setMessages] = useState<Message[]>([]), [input, setInput] = useState("");
  const [self, setSelf] = useState(""), [other, setOther] = useState("对方"), [relation, setRelation] = useState<Relation>("general");
  const [active, setActive] = useState<Notebook | null>(null), [items, setItems] = useState<NotebookSummary[]>([]);
  const [ready, setReady] = useState(false), [storageError, setStorageError] = useState(""), [switching, setSwitching] = useState(false);
  const [workspaceNotice, setWorkspaceNotice] = useState("");
  const changing = useRef(false), scenes = useRef<Notebook["scenes"]>({});
  const pending = useRef<Notebook | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function updateList(note: Notebook) {
    setItems((old) => [summarizeNotebook(note), ...old.filter((n) => n.id !== note.id)]
      .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)));
  }
  function apply(note: Notebook) {
    setActive(note); scenes.current = note.scenes; pending.current = null;
    const saved = note.conversation;
    setMessages(saved.messages); setSelf(saved.self); setOther(saved.other); setRelation(saved.relation); setInput(note.draft);
    a.restore(saved);
    setWorkspaceNotice(saved.rubric !== RUBRIC
      ? "原文已保留，旧分析规则已更新；需要时点击继续分析。"
      : saved.completed ? "已恢复保存的分析，没有调用模型。" : "");
  }
  function snapshot(): SavedConversation {
    return { schema: 1, rubric: RUBRIC, messages, self, other, relation, lines: a.lines,
      events: a.events, overview: a.overview, trend: a.trend, analyzedCount: a.analyzedCount, completed: a.status === "complete" };
  }
  function capture(): Notebook | null {
    if (!active) return null;
    const conversation = snapshot();
    return { ...active, updatedAt: new Date().toISOString(), draft: input, conversation,
      scenes: { ...scenes.current, [relation]: conversation } };
  }
  function cancelTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; pending.current = null;
  }
  async function persist(note: Notebook) { await notebookStore.save(note); updateList(note); }
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
      setItems(library.items.length ? library.items : [summarizeNotebook(note)]); apply(note); setReady(true);
    }).catch(() => {
      if (live) { setStorageError("本机记录读取失败。请关闭其他旧版窗口后重开应用；为保护旧记录，暂不允许保存或切换。"); setReady(true); }
    });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!ready || storageError || changing.current) return;
    pending.current = capture();
    if (a.status !== "loading") flush();
    else if (!timer.current) timer.current = setTimeout(flush, 750);
  }, [ready, active, messages, input, self, other, relation, a.lines, a.events, a.overview, a.trend, a.analyzedCount, a.status]);
  useEffect(() => {
    const hidden = () => { if (timer.current) flush(); };
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
    return transition(async () => {
      const note = newNotebook(conversation, title, contact); await notebookStore.save(note, true); updateList(note); return note;
    });
  }
  function changeRelation(next: Relation) {
    if (next === relation || changing.current || !active) return;
    const note = capture()!;
    scenes.current = note.scenes;
    const saved = conversationInScene(note, next);
    setRelation(next); a.restore(saved);
    setWorkspaceNotice(saved.completed ? "已恢复这个场景的分析，没有调用模型。"
      : messages.length ? "原场景分析已保留。新场景尚未分析，需要时点击继续分析。" : "");
  }
  function rename(title: string, contact: string) {
    if (!active || changing.current) return;
    const note = { ...active, title: title.trim().slice(0, 100) || active.title, contact: contact.trim().slice(0, 80) || other };
    setActive(note);
  }
  async function removeCurrent() {
    if (!active) return;
    return transition(async () => {
      await notebookStore.remove(active.id);
      const library = await notebookStore.loadLibrary(); setItems(library.items);
      if (library.active) return library.active;
      const note = newNotebook(); await notebookStore.save(note, true); updateList(note); return note;
    }, false);
  }
  async function retrySave() {
    const note = capture(); if (!note) return;
    try { await persist(note); setStorageError(""); } catch { setStorageError("重试保存失败，请勿关闭应用。检查本机存储空间和权限后再试。"); }
  }
  return { messages, setMessages, input, setInput, self, setSelf, other, setOther, relation,
    active, items, ready, storageError, switching, workspaceNotice, snapshot, select, create,
    changeRelation, rename, removeCurrent, retrySave };
}

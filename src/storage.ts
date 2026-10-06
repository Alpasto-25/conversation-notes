import type { Message, Relation, LineResult, Overview } from "../shared/types";
import type { MemoryEvent } from "../shared/memory";
import type { CachedTarget } from "./analysis-cache";
import type { AnalysisUsage, AnalysisIdentity } from "../shared/usage";
import { moveNotebook, newNotebook, summarizeNotebook, type Notebook, type NotebookSummary } from "./notebooks";
export type Trend = { at: string; value: number | null; count: number };
export type NotebookBatchAction = "recycle" | "recover" | "purge";
export type SavedConversation = {
  schema: 1;
  rubric: string;
  messages: Message[];
  self: string;
  other: string;
  relation: Relation;
  lines: Record<string, LineResult>;
  events: Record<string, MemoryEvent>;
  overview: Overview | null;
  trend: Trend[];
  analyzedCount: number;
  completed: boolean;
  targetCache?: CachedTarget[];
  analysisUsage?: AnalysisUsage;
  failedAnalysisUsage?: AnalysisUsage;
  analysisIdentity?: AnalysisIdentity;
  semanticUsage?: AnalysisUsage;
};
export function createNotebookStore(factory?: IDBFactory) {
  let connection: Promise<IDBDatabase> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  function db() {
    return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = (factory ?? indexedDB).open("crush-monitor", 2);
      let failed = false;
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains("workspace")) database.createObjectStore("workspace");
        const notes = database.createObjectStore("notebooks", { keyPath: "id" });
        const workspace = req.transaction!.objectStore("workspace");
        const legacy = workspace.get("current");
        legacy.onsuccess = () => {
          const old = legacy.result as SavedConversation | undefined;
          if (old?.schema !== 1 || !Array.isArray(old.messages) || !old.messages.length) return;
          const note = newNotebook(old, `${old.other || "对方"}的对话手记`, old.other);
          notes.put(note);
          workspace.put(note.id, "activeId");
          // All three writes commit together, or the old database remains intact.
          workspace.delete("current");
        };
      };
      req.onsuccess = () => {
        if (failed) { req.result.close(); return; }
        req.result.onversionchange = () => { req.result.close(); connection = undefined; };
        resolve(req.result);
      };
      req.onerror = () => { connection = undefined; reject(req.error); };
      req.onblocked = () => { failed = true; connection = undefined; reject(new Error("请关闭其他旧版窗口后重试")); };
    }));
  }
  function transaction<T>(mode: IDBTransactionMode, perform: (tx: IDBTransaction, result: (value: T) => void) => void) {
    const operation = queue.catch(() => {}).then(async () => {
      const database = await db();
      return new Promise<T>((resolve, reject) => {
        const tx = database.transaction(["workspace", "notebooks"], mode);
        let value: T;
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("保存被中断"));
        perform(tx, (next) => { value = next; });
      });
    });
    queue = operation;
    return operation;
  }
  return {
    loadLibrary: () => transaction<{ items: NotebookSummary[]; trash: NotebookSummary[]; active?: Notebook }>("readwrite", (tx, result) => {
      const all = tx.objectStore("notebooks").getAll();
      const active = tx.objectStore("workspace").get("activeId");
      const finish = () => {
        if (all.readyState !== "done" || active.readyState !== "done") return;
        const stored = (all.result as Notebook[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const notes = stored.filter((n) => !n.deletedAt), trash = stored.filter((n) => !!n.deletedAt);
        if (!notes.length) { const note = newNotebook(); tx.objectStore("notebooks").put(note); notes.push(note); }
        const selected = notes.find((n) => n.id === active.result) ?? notes[0];
        if (active.result !== selected.id) tx.objectStore("workspace").put(selected.id, "activeId");
        result({ items: notes.map(summarizeNotebook), trash: trash.map(summarizeNotebook), active: selected });
      };
      all.onsuccess = finish; active.onsuccess = finish;
    }),
    load: (id: string) => transaction<Notebook | undefined>("readonly", (tx, result) => {
      const req = tx.objectStore("notebooks").get(id);
      req.onsuccess = () => result(req.result);
    }),
    save: (note: Notebook, activate = false) => transaction<boolean>("readwrite", (tx, result) => {
      const notes = tx.objectStore("notebooks"), existing = notes.get(note.id);
      existing.onsuccess = () => {
        // A delayed autosave must not resurrect a recycled notebook or overwrite its contents.
        if ((existing.result as Notebook | undefined)?.deletedAt) { result(false); return; }
        notes.put(note);
        if (activate) tx.objectStore("workspace").put(note.id, "activeId");
        result(true);
      };
    }),
    select: (id: string) => transaction<void>("readwrite", (tx) => { tx.objectStore("workspace").put(id, "activeId"); }),
    remove: (id: string) => transaction<void>("readwrite", (tx) => {
      tx.objectStore("notebooks").delete(id);
      const workspace = tx.objectStore("workspace"), active = workspace.get("activeId");
      active.onsuccess = () => { if (active.result === id) workspace.delete("activeId"); };
    }),
    recycle: (id: string) => transaction<void>("readwrite", (tx) => {
      const notes = tx.objectStore("notebooks"), req = notes.get(id), workspace = tx.objectStore("workspace");
      req.onsuccess = () => {
        const note = req.result as Notebook | undefined;
        if (note && !note.deletedAt) notes.put({ ...note, deletedAt: new Date().toISOString() });
      };
      const active = workspace.get("activeId");
      active.onsuccess = () => { if (active.result === id) workspace.delete("activeId"); };
    }),
    recover: (id: string) => transaction<void>("readwrite", (tx) => {
      const notes = tx.objectStore("notebooks"), req = notes.get(id);
      req.onsuccess = () => {
        const note = req.result as Notebook | undefined;
        if (!note?.deletedAt) return;
        delete note.deletedAt; notes.put(note);
      };
    }),
    batch: (ids: readonly string[], action: NotebookBatchAction) => transaction<void>("readwrite", (tx) => {
      const selected = new Set(ids), notes = tx.objectStore("notebooks"), workspace = tx.objectStore("workspace");
      const deletedAt = new Date().toISOString();
      for (const id of selected) {
        const req = notes.get(id);
        req.onsuccess = () => {
          const note = req.result as Notebook | undefined;
          if (!note) return;
          if (action === "recycle" && !note.deletedAt) notes.put({ ...note, deletedAt });
          else if (action === "recover" && note.deletedAt) { delete note.deletedAt; notes.put(note); }
          else if (action === "purge" && note.deletedAt) notes.delete(id);
        };
      }
      if (action === "recycle") {
        const active = workspace.get("activeId");
        active.onsuccess = () => { if (selected.has(active.result)) workspace.delete("activeId"); };
      }
    }),
    move: (ids: readonly string[], relation: Relation, contact: string) => transaction<void>("readwrite", (tx) => {
      const notes = tx.objectStore("notebooks");
      for (const id of new Set(ids)) {
        const req = notes.get(id);
        req.onsuccess = () => {
          const note = req.result as Notebook | undefined;
          if (note && !note.deletedAt) notes.put(moveNotebook(note, relation, contact));
        };
      }
    }),
    close: async () => { await queue.catch(() => {}); if (connection) (await connection).close(); connection = undefined; },
  };
}
export const notebookStore = createNotebookStore();

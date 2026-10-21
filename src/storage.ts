import type { Message, Relation, LineResult, Overview } from "../shared/types";
import type { MemoryEvent } from "../shared/memory";
import type { CachedTarget } from "./analysis-cache";
import type { AnalysisUsage, AnalysisIdentity } from "../shared/usage";
import { moveNotebook, newNotebook, summarizeNotebook, type Notebook, type NotebookSummary } from "./notebooks";
import { validateBackup, type NotebookBackup, type RestoreMode } from './backup';
import { matchingMessages, type MessageHit, type SearchFilter } from './message-search';
export type Trend = { at: string; value: number | null; count: number; provider?: string; model?: string; rubric?: string; relation?: Relation; chatFrom?: string; chatTo?: string };
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
  semanticState?: { status: 'idle' | 'loading' | 'complete' | 'error'; message: string };
  overviewSource?: { provider: string; model: string; at: string; messageIds: string[]; provisional: boolean };
  analysisTask?: { status: 'running' | 'paused' | 'complete' | 'error'; done: number; total: number };
};
export function createNotebookStore(factory?: IDBFactory) {
  let connection: Promise<IDBDatabase> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  function db() {
    return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = (factory ?? indexedDB).open("crush-monitor", 3);
      let failed = false;
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains("workspace")) database.createObjectStore("workspace");
        const notes = database.objectStoreNames.contains('notebooks') ? req.transaction!.objectStore('notebooks') : database.createObjectStore("notebooks", { keyPath: "id" });
        const summaries = database.createObjectStore('notebookIndex', { keyPath: 'id' });
        const cursor = notes.openCursor();
        cursor.onsuccess = () => { const row = cursor.result; if (row) { summaries.put(summarizeNotebook(row.value)); row.continue(); } };
        const workspace = req.transaction!.objectStore("workspace");
        const legacy = workspace.get("current");
        legacy.onsuccess = () => {
          const old = legacy.result as SavedConversation | undefined;
          if (old?.schema !== 1 || !Array.isArray(old.messages) || !old.messages.length) return;
          const note = newNotebook(old, `${old.other || "对方"}的对话手记`, old.other);
          notes.put(note);
          summaries.put(summarizeNotebook(note));
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
        const tx = database.transaction(["workspace", "notebooks", "notebookIndex"], mode);
        let value: T;
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("保存被中断"));
        try { perform(tx, (next) => { value = next; }); }
        catch (error) { tx.abort(); reject(error); }
      });
    });
    queue = operation;
    return operation;
  }
  function putNote(tx: IDBTransaction, note: Notebook, add = false) {
    const notes = tx.objectStore('notebooks');
    if (add) notes.add(note); else notes.put(note);
    tx.objectStore('notebookIndex').put(summarizeNotebook(note));
  }
  function deleteNote(tx: IDBTransaction, id: string) { tx.objectStore('notebooks').delete(id); tx.objectStore('notebookIndex').delete(id); }
  return {
    searchMessages: (query: string, filter: SearchFilter = {}) => transaction<MessageHit[]>('readonly', (tx, result) => {
      const hits: MessageHit[] = [], cursor = tx.objectStore('notebooks').openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) { result(hits); return; }
        hits.push(...matchingMessages(row.value as Notebook, query, filter, 200 - hits.length));
        if (hits.length >= 200) result(hits); else row.continue();
      };
    }),
    rememberReading: (id: string, reading: Notebook['reading']) => transaction<void>('readwrite', tx => {
      const notes = tx.objectStore('notebooks'), request = notes.get(id);
      request.onsuccess = () => { const note = request.result as Notebook | undefined; if (note && !note.deletedAt) putNote(tx, { ...note, reading }); };
    }),
    exportAll: () => transaction<Notebook[]>("readonly", (tx, result) => {
      const request = tx.objectStore('notebooks').getAll(); request.onsuccess = () => result(request.result);
    }),
    restoreBackup: (input: NotebookBackup, mode: RestoreMode) => {
      const backup = validateBackup(input);
      if (mode !== 'merge' && mode !== 'copies') return Promise.reject(new Error('恢复方式无效'));
      return transaction<{ imported: number; skipped: number }>('readwrite', (tx, result) => {
        const notes = tx.objectStore('notebooks'), all = notes.getAll();
        all.onsuccess = () => {
          const existing = new Set((all.result as Notebook[]).map(n => n.id));
          let imported = 0, skipped = 0, selected: string | undefined;
          for (const original of backup.notebooks) {
            if (mode === 'merge' && existing.has(original.id)) { skipped++; continue; }
            const note = mode === 'copies' ? { ...original, id: crypto.randomUUID(), title: `${original.title.slice(0, 90)}（导入副本）` } : original;
            putNote(tx, note, true); existing.add(note.id); imported++;
            if (!note.deletedAt && (!selected || original.id === backup.activeId)) selected = note.id;
          }
          if (selected) tx.objectStore('workspace').put(selected, 'activeId');
          result({ imported, skipped });
        };
      });
    },
    loadLibrary: () => transaction<{ items: NotebookSummary[]; trash: NotebookSummary[]; active?: Notebook }>("readwrite", (tx, result) => {
      const all = tx.objectStore("notebookIndex").getAll();
      const active = tx.objectStore("workspace").get("activeId");
      const finish = () => {
        if (all.readyState !== "done" || active.readyState !== "done") return;
        const stored = (all.result as NotebookSummary[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const notes = stored.filter((n) => !n.deletedAt), trash = stored.filter((n) => !!n.deletedAt);
        let created: Notebook | undefined;
        if (!notes.length) { created = newNotebook(); putNote(tx, created); notes.push(summarizeNotebook(created)); }
        const selected = notes.find((n) => n.id === active.result) ?? notes[0];
        if (active.result !== selected.id) tx.objectStore("workspace").put(selected.id, "activeId");
        if (created) result({ items: notes, trash, active: created });
        else { const request = tx.objectStore('notebooks').get(selected.id); request.onsuccess = () => result({ items: notes, trash, active: request.result }); }
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
        putNote(tx, note);
        if (activate) tx.objectStore("workspace").put(note.id, "activeId");
        result(true);
      };
    }),
    select: (id: string) => transaction<void>("readwrite", (tx) => { tx.objectStore("workspace").put(id, "activeId"); }),
    remove: (id: string) => transaction<void>("readwrite", (tx) => {
      deleteNote(tx, id);
      const workspace = tx.objectStore("workspace"), active = workspace.get("activeId");
      active.onsuccess = () => { if (active.result === id) workspace.delete("activeId"); };
    }),
    recycle: (id: string) => transaction<void>("readwrite", (tx) => {
      const notes = tx.objectStore("notebooks"), req = notes.get(id), workspace = tx.objectStore("workspace");
      req.onsuccess = () => {
        const note = req.result as Notebook | undefined;
        if (note && !note.deletedAt) putNote(tx, { ...note, deletedAt: new Date().toISOString() });
      };
      const active = workspace.get("activeId");
      active.onsuccess = () => { if (active.result === id) workspace.delete("activeId"); };
    }),
    recover: (id: string) => transaction<void>("readwrite", (tx) => {
      const notes = tx.objectStore("notebooks"), req = notes.get(id);
      req.onsuccess = () => {
        const note = req.result as Notebook | undefined;
        if (!note?.deletedAt) return;
        delete note.deletedAt; putNote(tx, note);
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
          if (action === "recycle" && !note.deletedAt) putNote(tx, { ...note, deletedAt });
          else if (action === "recover" && note.deletedAt) { delete note.deletedAt; putNote(tx, note); }
          else if (action === "purge" && note.deletedAt) deleteNote(tx, id);
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
          if (note && !note.deletedAt) putNote(tx, moveNotebook(note, relation, contact));
        };
      }
    }),
    close: async () => { await queue.catch(() => {}); if (connection) (await connection).close(); connection = undefined; },
  };
}
export const notebookStore = createNotebookStore();

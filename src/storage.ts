import type { Message, Relation, LineResult, Overview } from "../shared/types";
import type { MemoryEvent } from "../shared/memory";
import { newNotebook, summarizeNotebook, type Notebook, type NotebookSummary } from "./notebooks";
export type Trend = { at: string; value: number | null; count: number };
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
    loadLibrary: () => transaction<{ items: NotebookSummary[]; active?: Notebook }>("readwrite", (tx, result) => {
      const all = tx.objectStore("notebooks").getAll();
      const active = tx.objectStore("workspace").get("activeId");
      const finish = () => {
        if (all.readyState !== "done" || active.readyState !== "done") return;
        const notes = (all.result as Notebook[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (!notes.length) { const note = newNotebook(); tx.objectStore("notebooks").put(note); notes.push(note); }
        const selected = notes.find((n) => n.id === active.result) ?? notes[0];
        if (active.result !== selected.id) tx.objectStore("workspace").put(selected.id, "activeId");
        result({ items: notes.map(summarizeNotebook), active: selected });
      };
      all.onsuccess = finish; active.onsuccess = finish;
    }),
    load: (id: string) => transaction<Notebook | undefined>("readonly", (tx, result) => {
      const req = tx.objectStore("notebooks").get(id);
      req.onsuccess = () => result(req.result);
    }),
    save: (note: Notebook, activate = false) => transaction<void>("readwrite", (tx) => {
      tx.objectStore("notebooks").put(note);
      if (activate) tx.objectStore("workspace").put(note.id, "activeId");
    }),
    select: (id: string) => transaction<void>("readwrite", (tx) => { tx.objectStore("workspace").put(id, "activeId"); }),
    remove: (id: string) => transaction<void>("readwrite", (tx) => {
      tx.objectStore("notebooks").delete(id);
      const workspace = tx.objectStore("workspace"), active = workspace.get("activeId");
      active.onsuccess = () => { if (active.result === id) workspace.delete("activeId"); };
    }),
    close: async () => { await queue.catch(() => {}); if (connection) (await connection).close(); connection = undefined; },
  };
}
export const notebookStore = createNotebookStore();

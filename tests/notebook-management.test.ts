import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { createNotebookStore } from "../src/storage";
import { canFillNotebook, fillNotebook, emptyConversation, newNotebook, type Notebook } from "../src/notebooks";

const conversation = () => ({ ...emptyConversation("friend"), self: "我", other: "朋友",
  messages: [{ id: "m1", sender: "other" as const, text: "明天再讨论。", timestamp: null, kind: "text" as const }] });
const populated = (title: string) => {
  const note = newNotebook(conversation(), title);
  note.draft = "独立草稿";
  note.scenes.general = { ...conversation(), relation: "general" };
  return note;
};

test("import fills a reviewed blank notebook without adding a record and preserves its chosen name and identity", async () => {
  const factory = new IDBFactory(), store = createNotebookStore(factory);
  const original = populated("原有记录"), blank = newNotebook(emptyConversation(), "我起的名称");
  blank.draft = "我：明天再讨论。";
  await store.save(original); await store.save(blank, true);
  assert.equal(canFillNotebook(blank, blank.draft), true);
  const filled = fillNotebook(blank, conversation(), blank.title, "朋友", blank.draft);
  await store.save(filled, true);
  const library = await store.loadLibrary();
  assert.equal(library.items.length, 2); assert.equal(library.active!.id, blank.id);
  assert.equal(library.active!.createdAt, blank.createdAt); assert.equal(library.active!.title, blank.title);
  assert.equal(library.active!.draft, ""); assert.deepEqual(await store.load(original.id), original);
  assert.throws(() => fillNotebook(filled, conversation(), "重复", "朋友"));
  await store.close();
  const restarted = createNotebookStore(factory);
  assert.deepEqual((await restarted.loadLibrary()).active, filled); await restarted.close();
});

test("import never overwrites a different draft, recycled notebook, or saved content in any scene", () => {
  const blank = newNotebook();
  assert.equal(canFillNotebook(blank), true);
  const variants: Notebook[] = [
    { ...blank, draft: "另一份未完成的草稿" },
    { ...blank, deletedAt: new Date().toISOString() },
    { ...blank, conversation: conversation() },
    { ...blank, scenes: { friend: conversation() } },
    { ...blank, conversation: { ...blank.conversation, trend: [{ at: "today", value: null, count: 1 }] } },
  ];
  for (const note of variants) {
    assert.equal(canFillNotebook(note, "新导入的原文"), false);
    assert.throws(() => fillNotebook(note, conversation(), "新导入", "朋友", "新导入的原文"));
  }
});

test("batch recycling and restoring preserve drafts, scenes and unselected notes across restart", async () => {
  const factory = new IDBFactory(), store = createNotebookStore(factory);
  const a = populated("A"), b = populated("B"), untouched = populated("未选记录");
  for (const note of [a, b, untouched]) await store.save(note);
  await store.select(a.id);
  await store.batch([a.id, b.id, a.id, "missing"], "recycle");
  const library = await store.loadLibrary();
  assert.equal(library.items.length, 1); assert.equal(library.trash.length, 2);
  assert.deepEqual(library.active, untouched);
  for (const note of [a, b]) {
    const saved = (await store.load(note.id))!;
    const { deletedAt, ...rest } = saved;
    assert.ok(deletedAt); assert.deepEqual(rest, note);
  }
  assert.equal(await store.save({ ...a, draft: "迟到的自动保存" }), false);
  await store.close();
  const restarted = createNotebookStore(factory);
  await restarted.batch([a.id, b.id], "recover");
  assert.deepEqual(await restarted.load(a.id), a); assert.deepEqual(await restarted.load(b.id), b);
  assert.deepEqual((await restarted.loadLibrary()).active, untouched); await restarted.close();
});

test("batch recycling every live note creates only one replacement blank and preserves all selected records", async () => {
  const store = createNotebookStore(new IDBFactory()), a = populated("A"), b = populated("B");
  await store.save(a, true); await store.save(b);
  await store.batch([a.id, b.id], "recycle");
  const [first, second] = await Promise.all([store.loadLibrary(), store.loadLibrary()]);
  assert.equal(first.items.length, 1); assert.equal(first.trash.length, 2);
  assert.equal(first.active!.id, second.active!.id); assert.equal(first.active!.conversation.messages.length, 0);
  await store.close();
});

test("batch permanent deletion is restricted to selected recycled notes and keeps live selection intact", async () => {
  const store = createNotebookStore(new IDBFactory()), a = populated("A"), b = populated("B"), c = populated("C");
  await store.save(a); await store.save(b); await store.save(c, true);
  await store.batch([a.id, b.id], "recycle");
  await store.batch([a.id, c.id, "missing"], "purge");
  assert.equal(await store.load(a.id), undefined); assert.ok((await store.load(b.id))!.deletedAt);
  assert.deepEqual(await store.load(c.id), c); assert.equal((await store.loadLibrary()).active!.id, c.id);
  await store.close();
});

test("a failing batch transaction rolls back every selected note and the active selection", async () => {
  const factory = new IDBFactory(), originalOpen = factory.open.bind(factory);
  let fail = false;
  factory.open = ((name: string, version?: number) => {
    const req = originalOpen(name, version);
    req.addEventListener("success", () => {
      const db = req.result, originalTransaction = db.transaction.bind(db);
      db.transaction = ((names: string | string[], mode?: IDBTransactionMode) => {
        const tx = originalTransaction(names, mode), objectStore = tx.objectStore.bind(tx);
        let writes = 0;
        tx.objectStore = ((name: string) => {
          const store = objectStore(name), put = store.put.bind(store);
          store.put = ((value: unknown, key?: IDBValidKey) => {
            const request = put(value, key);
            if (fail && name === "notebooks" && ++writes === 2) { fail = false; tx.abort(); }
            return request;
          }) as typeof store.put;
          return store;
        }) as typeof tx.objectStore;
        return tx;
      }) as typeof db.transaction;
    });
    return req;
  }) as typeof factory.open;
  const store = createNotebookStore(factory), a = populated("A"), b = populated("B");
  await store.save(a, true); await store.save(b); fail = true;
  await assert.rejects(store.batch([a.id, b.id], "recycle"));
  assert.deepEqual(await store.load(a.id), a); assert.deepEqual(await store.load(b.id), b);
  assert.equal((await store.loadLibrary()).active!.id, a.id);
  await store.batch([a.id, b.id], "recycle"); assert.equal((await store.loadLibrary()).trash.length, 2);
  await store.close();
});

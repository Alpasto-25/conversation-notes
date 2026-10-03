import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { createNotebookStore, type SavedConversation } from "../src/storage";
import { newNotebook, emptyConversation, conversationInScene, summarizeNotebook, organizeNotebook, withoutMessages } from "../src/notebooks";

function fixture(other = "Alex"): SavedConversation {
  return { ...emptyConversation("friend"), self: "Me", other,
    messages: [{ id: "one", sender: "self", text: "明天下午讨论方案？", timestamp: null, kind: "text" },
      { id: "two", sender: "other", text: "可以，三点见。", timestamp: null, kind: "text" }],
    lines: { two: { id: "two", score: { value: 75, confidence: 0.8, status: "clear", probabilities: { high: 0.8 } }, emotions: { joy: 0.7 }, intents: { confirm: 0.8 } } },
    events: { two: { id: "two", kind: "invitation", status: "active", confidence: 0.8 } },
    overview: { affinity: { value: 75, confidence: 0.8, status: "clear", probabilities: {} }, stage: "agreement", action: "confirm", evidenceId: "two", actionEvidenceId: "two" },
    trend: [{ at: "2026-10-03T08:00:00Z", value: 75, count: 2 }], analyzedCount: 2, completed: true };
}
function seedLegacy(factory: IDBFactory, saved: SavedConversation) {
  return new Promise<void>((resolve, reject) => {
    const req = factory.open("crush-monitor", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("workspace");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction("workspace", "readwrite");
      tx.objectStore("workspace").put(saved, "current");
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  });
}
test("legacy migration preserves every original message, analysis, event and trend", async () => {
  const factory = new IDBFactory(), original = fixture(); await seedLegacy(factory, original);
  const store = createNotebookStore(factory), first = await store.loadLibrary();
  assert.equal(first.items.length, 1); assert.deepEqual(first.active!.conversation, original);
  assert.equal(first.items[0].completed, true); assert.equal(first.items[0].contact, "Alex");
  await store.close();
  const reopened = createNotebookStore(factory), second = await reopened.loadLibrary();
  assert.equal(second.items.length, 1); assert.equal(second.active!.id, first.active!.id);
  assert.deepEqual(second.active!.conversation, original); await reopened.close();
});
test("migration rollback leaves version-one records intact on transaction failure", async () => {
  const factory = new IDBFactory(), original = fixture(); await seedLegacy(factory, original);
  const originalOpen = factory.open.bind(factory);
  factory.open = ((name: string, version?: number) => {
    const req = originalOpen(name, version);
    if (version === 2) req.addEventListener("upgradeneeded", () => req.transaction!.abort(), { once: true });
    return req;
  }) as typeof factory.open;
  await assert.rejects(createNotebookStore(factory).loadLibrary());
  factory.open = originalOpen;
  const migrated = createNotebookStore(factory), library = await migrated.loadLibrary();
  assert.deepEqual(library.active!.conversation, original); await migrated.close();
});
test("simultaneous initialization creates only one empty notebook", async () => {
  const store = createNotebookStore(new IDBFactory());
  const results = await Promise.all([store.loadLibrary(), store.loadLibrary()]);
  assert.equal(results[0].active!.id, results[1].active!.id);
  assert.equal(results[1].items.length, 1); await store.close();
});
test("independent objects, scenes, drafts and results survive selection and restart", async () => {
  const factory = new IDBFactory(), store = createNotebookStore(factory);
  const a = newNotebook(fixture(), "朋友聊天", "Alex"), b = newNotebook({ ...fixture("Sam"), relation: "colleague" }, "工作方案", "同事 Sam");
  a.draft = "尚未发送的草稿";
  await store.save(a, true); await store.save(b, true); await store.select(a.id);
  const library = await store.loadLibrary(); assert.equal(library.items.length, 2);
  assert.deepEqual(library.active, a); assert.deepEqual(await store.load(b.id), b);
  await store.close(); const reopened = createNotebookStore(factory);
  assert.deepEqual((await reopened.loadLibrary()).active, a); await reopened.close();
});
test("a queued save to another notebook never changes the selected notebook", async () => {
  const store = createNotebookStore(new IDBFactory()), a = newNotebook(fixture()), b = newNotebook(fixture("Sam"));
  await Promise.all([store.save(a, true), store.save(b, true), store.save({ ...a, title: "保存较晚的 A" }), store.select(b.id)]);
  assert.equal((await store.loadLibrary()).active!.id, b.id);
  assert.equal((await store.load(a.id))!.title, "保存较晚的 A"); await store.close();
});
test("deleting one notebook leaves all other analysis intact and repairs selection", async () => {
  const store = createNotebookStore(new IDBFactory()), a = newNotebook(fixture()), b = newNotebook(fixture("Sam"));
  await store.save(a, true); await store.save(b, true); await store.remove(b.id);
  const library = await store.loadLibrary(); assert.equal(library.items.length, 1);
  assert.equal(await store.load(b.id), undefined); assert.deepEqual(library.active, a);
  await store.remove(a.id); assert.equal((await store.loadLibrary()).active!.conversation.messages.length, 0); await store.close();
});
test("a failed write does not erase existing data or poison subsequent writes", async () => {
  const store = createNotebookStore(new IDBFactory()), a = newNotebook(fixture()); await store.save(a, true);
  await assert.rejects(store.save({ ...a, draft: (() => {}) as unknown as string }));
  assert.deepEqual(await store.load(a.id), a);
  await store.save({ ...a, title: "恢复保存" }); assert.equal((await store.load(a.id))!.title, "恢复保存"); await store.close();
});
test("renaming and grouping metadata preserve original senders and cached analysis", async () => {
  const a = newNotebook(fixture(), "笔记", "朋友"), saved = { ...a, title: "方案讨论", contact: "老朋友 Alex" };
  const store = createNotebookStore(new IDBFactory()); await store.save(saved, true);
  assert.deepEqual((await store.load(a.id))!.conversation, a.conversation);
  assert.equal(summarizeNotebook(saved).contact, "老朋友 Alex"); await store.close();
});
test("previous scene results restore unchanged without rebuilding or reanalysis", () => {
  const friend = fixture(), note = newNotebook({ ...friend, relation: "colleague" });
  note.scenes.friend = friend; assert.deepEqual(conversationInScene(note, "friend"), friend);
  const uncached = conversationInScene(note, "family");
  assert.equal(uncached.relation, "family"); assert.deepEqual(uncached.messages, friend.messages); assert.deepEqual(uncached.lines, {});
});
test("old scene results are not applied to changed original messages, roles or rubrics", () => {
  for (const change of [
    { messages: [...fixture().messages, { id: "three", sender: "self" as const, text: "收到", timestamp: null, kind: "text" as const }] },
    { self: "SomeoneElse" },
    { messages: fixture().messages.map((m) => ({ ...m, text: "不同原文" })) },
  ]) {
    const note = newNotebook({ ...fixture(), ...change, relation: "colleague" }); note.scenes.friend = fixture();
    assert.equal(conversationInScene(note, "friend").completed, false);
    assert.deepEqual(conversationInScene(note, "friend").lines, {});
  }
  const note = newNotebook(fixture()); note.scenes.friend = { ...fixture(), rubric: "old-rubric" };
  assert.equal(conversationInScene(note, "friend").overview, null);
});
test("recycle and recover preserve original text, every scene, results, timestamps and draft", async () => {
  const factory = new IDBFactory(), store = createNotebookStore(factory);
  const a = newNotebook(fixture(), "朋友约定"), b = newNotebook(fixture("Sam"));
  a.draft = "未分析的草稿"; a.scenes.family = { ...fixture(), relation: "family" };
  await store.save(a, true); await store.save(b, true); await store.select(a.id);
  await store.recycle(a.id);
  const library = await store.loadLibrary();
  assert.equal(library.items.length, 1); assert.equal(library.active!.id, b.id); assert.equal(library.trash[0].id, a.id);
  assert.deepEqual((await store.load(a.id))!.conversation, a.conversation);
  await store.close(); const reopened = createNotebookStore(factory);
  assert.equal((await reopened.loadLibrary()).trash.length, 1);
  await reopened.recover(a.id); assert.deepEqual(await reopened.load(a.id), a);
  assert.equal((await reopened.loadLibrary()).active!.id, b.id); await reopened.close();
});
test("late autosaves never resurrect or overwrite a recycled notebook", async () => {
  const store = createNotebookStore(new IDBFactory()), a = newNotebook(fixture()); await store.save(a, true);
  await store.recycle(a.id); await store.save({ ...a, title: "late save", draft: "stale" }, true);
  const library = await store.loadLibrary(); assert.equal(library.trash[0].title, a.title);
  assert.notEqual(library.active!.id, a.id); await store.recover(a.id);
  assert.deepEqual(await store.load(a.id), a); await store.close();
});
test("recycling the last notebook creates one blank notebook without losing the recycled record", async () => {
  const store = createNotebookStore(new IDBFactory()), a = newNotebook(fixture()); await store.save(a, true);
  await store.recycle(a.id);
  const [one, two] = await Promise.all([store.loadLibrary(), store.loadLibrary()]);
  assert.equal(one.items.length, 1); assert.equal(one.trash.length, 1); assert.equal(one.active!.id, two.active!.id);
  await store.close();
});
test("permanent deletion removes only its specific recycled notebook", async () => {
  const store = createNotebookStore(new IDBFactory()), a = newNotebook(fixture()), b = newNotebook(fixture("Sam"));
  await store.save(a, true); await store.save(b, true); await store.recycle(a.id); await store.remove(a.id);
  assert.equal(await store.load(a.id), undefined); assert.deepEqual(await store.load(b.id), b);
  assert.equal((await store.loadLibrary()).trash.length, 0); await store.close();
});
test("organizing names and scenes never alters original messages and retains prior scene results", () => {
  const a = newNotebook(fixture());
  const moved = organizeNotebook(a, "工作方案", "同事 Alex", "colleague");
  assert.deepEqual(moved.conversation.messages, a.conversation.messages); assert.equal(moved.conversation.completed, false);
  assert.deepEqual(moved.scenes.friend, a.conversation);
  const returned = organizeNotebook(moved, "朋友约定", "好友 Alex", "friend");
  assert.deepEqual(returned.conversation, a.conversation); assert.equal(returned.conversation.completed, true);
});
test("single-message deletion invalidates all derived analysis and memory but preserves other messages and drafts", () => {
  const a = newNotebook(fixture()); a.draft = "保留草稿"; a.scenes.family = { ...fixture(), relation: "family" };
  const next = withoutMessages(a, ["two"]);
  assert.equal(next.conversation.messages.length, 1); assert.equal(next.conversation.messages[0].id, "one");
  assert.equal(next.draft, a.draft); assert.equal(next.title, a.title); assert.equal(next.contact, a.contact);
  assert.deepEqual(next.conversation.lines, {}); assert.deepEqual(next.conversation.events, {});
  assert.deepEqual(next.conversation.trend, []); assert.equal(next.conversation.overview, null);
  assert.equal(next.conversation.analyzedCount, 0); assert.equal(next.conversation.completed, false); assert.deepEqual(next.scenes, {});
  assert.equal(withoutMessages(a, ["missing"]), a); assert.equal(a.conversation.messages.length, 2);
});

import test from "node:test";
import assert from "node:assert/strict";
import { folderKey, parseFolderView, visibleNotebooks } from "../src/folder-view";
import { newNotebook, emptyConversation, summarizeNotebook } from "../src/notebooks";

test("folder preferences recover safely from invalid data and keep supported sort and group states", () => {
  for (const value of [null, "broken", "null", "[]", '{"sort":"unknown","collapsed":0}'])
    assert.deepEqual(parseFolderView(value), { collapsed: [], sort: "updated" });
  assert.deepEqual(parseFolderView('{"sort":"title","collapsed":["friend",null,5]}'), { sort: "title", collapsed: ["friend"] });
  assert.notEqual(folderKey("friend", "a/b"), folderKey("friend", "a"));
  assert.notEqual(folderKey("friend", "Alex"), folderKey("family", "Alex"));
});
test("folder search and sort preserve cached results and do not mutate the library", () => {
  const a = { ...summarizeNotebook(newNotebook(emptyConversation("friend"), "B plan", "Alex")), createdAt: "2026-10-01", updatedAt: "2026-10-03" };
  const b = { ...summarizeNotebook(newNotebook(emptyConversation("colleague"), "A plan", "Sam")), createdAt: "2026-10-02", updatedAt: "2026-10-02" };
  const source = [a, b];
  assert.deepEqual(visibleNotebooks(source, "", "title"), [b, a]);
  assert.deepEqual(visibleNotebooks(source, "", "updated"), [a, b]);
  assert.deepEqual(visibleNotebooks(source, "", "created"), [b, a]);
  assert.deepEqual(visibleNotebooks(source, " ALEx ", "title"), [a]);
  assert.deepEqual(visibleNotebooks(source, "工作", "updated"), [b]);
  assert.deepEqual(source, [a, b]);
});

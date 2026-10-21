import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { backupPreview, decodeBackup, encodeBackup, validateBackup } from '../src/backup';
import { newNotebook, emptyConversation } from '../src/notebooks';
import { createNotebookStore } from '../src/storage';

function fixture() {
  const note = newNotebook({ ...emptyConversation('friend'), self: '我', other: '朋友',
    messages: [{ id: 'original', sender: 'other', kind: 'text', text: '明天讨论方案。', timestamp: null }],
    lines: { original: { id: 'original', score: { value: 70, confidence: .8, status: 'clear', probabilities: { high: .8 } } } },
    completed: true, analyzedCount: 1 }, '朋友约定', '朋友');
  note.scenes.friend = note.conversation; note.draft = '没有分析的草稿'; return note;
}

test('合法长消息可备份，单条上限与 800 万字符导入一致', async () => {
  const note = fixture(); note.conversation.messages[0].text = 'a'.repeat(2_000_001);
  assert.equal((await decodeBackup(await encodeBackup([note]))).notebooks[0].conversation.messages[0].text.length, 2_000_001);
});
test('备份往返保留各场景、原文、分析、草稿、回收站且不携带配置密钥', async () => {
  const note = fixture(), trash = { ...fixture(), deletedAt: new Date().toISOString() };
  const text = await encodeBackup([{ ...note, apiKey: 'never-export-this' } as typeof note, trash], note.id);
  assert.ok(!text.includes('never-export-this'));
  const backup = await decodeBackup(text); assert.deepEqual(backup.notebooks, [note, trash]); assert.equal(backup.activeId, note.id);
  assert.deepEqual(backupPreview(backup, [note.id]), { total: 2, trash: 1, conflicts: 1, messages: 2 });
});
test('加密备份跨环境可恢复，错误口令或篡改密文均被拒绝', async () => {
  const note = fixture(), text = await encodeBackup([note], note.id, 'test-only-password');
  assert.ok(!text.includes(note.draft)); assert.ok(!text.includes('test-only-password'));
  assert.deepEqual((await decodeBackup(text, 'test-only-password')).notebooks, [note]);
  await assert.rejects(decodeBackup(text, 'wrong-password'), /口令/);
  const changed = JSON.parse(text); changed.data = (changed.data[0] === 'A' ? 'B' : 'A') + changed.data.slice(1);
  await assert.rejects(decodeBackup(JSON.stringify(changed), 'test-only-password'), /损坏/);
});
test('损坏、未知版本、重复 ID 与危险字段不会进入恢复事务', async () => {
  const note = fixture(), valid = JSON.parse(await encodeBackup([note]));
  await assert.rejects(decodeBackup('{'), /无法读取/);
  assert.throws(() => validateBackup({ ...valid, version: 99 }), /版本/);
  assert.throws(() => validateBackup({ ...valid, notebooks: [note, note] }), /结构/);
  await assert.rejects(decodeBackup('{"__proto__":{"polluted":true}}'), /无法读取/);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
test('恢复到新库后原文分析一致，合并跳过重复，副本不覆盖已有记录', async () => {
  const original = fixture(), backup = await decodeBackup(await encodeBackup([original], original.id));
  const factory = new IDBFactory(), store = createNotebookStore(factory);
  assert.deepEqual(await store.restoreBackup(backup, 'merge'), { imported: 1, skipped: 0 });
  assert.deepEqual(await store.load(original.id), original);
  await store.save({ ...original, title: '本机较新的名称' });
  assert.deepEqual(await store.restoreBackup(backup, 'merge'), { imported: 0, skipped: 1 });
  assert.equal((await store.load(original.id))!.title, '本机较新的名称');
  assert.deepEqual(await store.restoreBackup(backup, 'copies'), { imported: 1, skipped: 0 });
  const copied = (await store.exportAll()).find(n => n.id !== original.id)!;
  assert.deepEqual(copied.conversation, original.conversation); assert.deepEqual(copied.scenes, original.scenes);
  await store.close(); const reopened = createNotebookStore(factory);
  assert.equal((await reopened.exportAll()).length, 2); await reopened.close();
});
test('恢复事务失败会整体回滚，不留下部分导入', async () => {
  const factory = new IDBFactory(), store = createNotebookStore(factory), a = fixture(), b = fixture();
  await store.save(a, true);
  const backup = await decodeBackup(await encodeBackup([b, fixture()]));
  // Force a constraint collision during the same transaction using deterministic copy IDs.
  const originalUuid = crypto.randomUUID.bind(crypto);
  let generated = 0;
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => generated++ === 0 ? originalUuid() : a.id });
  try { await assert.rejects(store.restoreBackup(backup, 'copies')); }
  finally { Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: originalUuid }); }
  assert.deepEqual(await store.exportAll(), [a]); await store.close();
});
test('备份导出不会沿用片段的 1.4 MB 限制', async () => {
  const note = fixture(); note.draft = '大'.repeat(600_000);
  const text = await encodeBackup([note]); assert.ok(new TextEncoder().encode(text).length > 1_400_000);
  assert.equal((await decodeBackup(text)).notebooks[0].draft, note.draft);
});

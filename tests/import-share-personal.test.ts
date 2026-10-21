import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { IDBFactory } from 'fake-indexeddb';
import { parseChat } from '../shared/parser';
import { mergeImportRow, selectedImport, MAX_IMPORT_CHARS } from '../src/import-review';
import { privateShareSource } from '../src/share-privacy';
import { analysisReport } from '../src/analysis-report';
import { imageArchive } from '../src/share-archive';
import { newNotebook, emptyConversation, summarizeNotebook } from '../src/notebooks';
import { candidateFollowups, updatePersonalNotebook } from '../src/personal-notes';
import { visibleNotebooks } from '../src/folder-view';
import { createNotebookStore } from '../src/storage';
import { decodeBackup, encodeBackup } from '../src/backup';

test('导入范围与续行校对保留文字，不制造发送人，完整年月日可筛选', () => {
  const parsed = [{ speaker: '甲', text: '第一行', timestamp: '2026年10月1日 12:00' }, { speaker: '未分配', text: '续行', timestamp: null }, { speaker: '乙', text: '回应', timestamp: '2026-10-02 13:00' }];
  const merged = mergeImportRow(parsed, 1); assert.equal(merged[0].text, '第一行\n续行'); assert.equal(merged[0].speaker, '甲'); assert.equal(parsed.length, 3);
  assert.equal(selectedImport(parsed, { start: 1, end: 3, from: '2026-10-02', to: '2026-10-02' })[0].speaker, '乙');
  assert.equal(selectedImport(parsed, { start: 0, end: 3, from: '', to: '' }).length, 0);
  const large = '我：'.concat('字'.repeat(260000)); assert.ok(large.length < MAX_IMPORT_CHARS); assert.equal(parseChat(large).messages[0].text.length, 260000);
});
test('图片/TXT/报告共用脱敏副本，原始聊天和分析不变', () => {
  const c = { ...emptyConversation(), self: '小明', other: '小红', messages: [{ id: 'one', sender: 'other' as const, kind: 'text' as const, text: '小明联系我：13800000000、test@example.invalid，地址ABC', timestamp: '2026-10-21 10:00' }],
    lines: { one: { id: 'one', score: { value: null, confidence: .8, status: 'clear' as const, probabilities: {} }, subtext: '联系 test@example.invalid 商量地址ABC。' } } };
  const source = { title: '小红的手记', conversation: c };
  const exported = privateShareSource(source, { aliases: true, contacts: true, hideTime: true, replacements: '地址ABC' });
  assert.equal(exported.conversation.other, '对方'); assert.equal(exported.conversation.messages[0].timestamp, null);
  const report = analysisReport(exported, ['one']);
  for (const secret of ['13800000000', 'test@example.invalid', '地址ABC', '小红']) assert.ok(!report.includes(secret));
  assert.equal(c.messages[0].timestamp, '2026-10-21 10:00'); assert.ok(c.lines.one.subtext.includes('example.invalid'));
  assert.match(report, /总览/); assert.match(report, /逐句原文/);
});
test('全部图片 ZIP 可由独立标准库完整读取，字节和页序不变', t => {
  const archive = imageArchive([{ name: 'page-001.png', bytes: new Uint8Array([1, 2, 3, 4]) }, { name: 'page-002.png', bytes: new Uint8Array([5, 6]) }]);
  const result = spawnSync('python', ['-c', 'import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps({"names":z.namelist(),"data":[list(z.read(n)) for n in z.namelist()],"bad":z.testzip()}))'], { input: archive, encoding: 'utf8' });
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') { t.skip('Python standard-library ZIP checker unavailable'); return; }
  assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(result.stdout), { names: ['page-001.png', 'page-002.png'], data: [[1, 2, 3, 4], [5, 6]], bad: null });
  assert.throws(() => imageArchive([{ name: '../private.png', bytes: new Uint8Array([1]) }]), /文件名/);
});
test('人工备注/收藏/跟进不会改写模型事件，备份与排序保留个人内容', async () => {
  const note = newNotebook({ ...emptyConversation(), messages: [{ id: 'one', sender: 'other', text: '周五一起讨论方案。', timestamp: null, kind: 'text' }],
    events: { one: { id: 'one', kind: 'invitation', confidence: .9, status: 'active' } } });
  const personal = updatePersonalNotebook(note, { annotation: '已电话确认。', pinned: true, tags: ['复盘', '复盘'], favorites: ['one'], followups: { one: { status: 'done', note: '我已确认', at: new Date().toISOString() } } });
  assert.deepEqual(personal.conversation.events, note.conversation.events); assert.equal(candidateFollowups(personal)[0].personal!.status, 'done');
  assert.deepEqual((await decodeBackup(await encodeBackup([personal]))).notebooks[0], personal);
  assert.equal(visibleNotebooks([summarizeNotebook(newNotebook()), summarizeNotebook(personal)], '复盘', 'updated')[0].id, personal.id);
});
test('v2 数据库升级摘要索引后保留正文、回收站和草稿', async () => {
  const factory = new IDBFactory(), a = newNotebook(), b = { ...newNotebook(), draft: '草稿', deletedAt: new Date().toISOString() };
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('crush-monitor', 2);
    request.onupgradeneeded = () => { request.result.createObjectStore('notebooks', { keyPath: 'id' }); request.result.createObjectStore('workspace'); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, tx = db.transaction(['notebooks', 'workspace'], 'readwrite'); tx.objectStore('notebooks').put(a); tx.objectStore('notebooks').put(b); tx.objectStore('workspace').put(a.id, 'activeId'); tx.oncomplete = () => { db.close(); resolve(); }; };
  });
  const store = createNotebookStore(factory), library = await store.loadLibrary();
  assert.equal(library.items[0].id, a.id); assert.equal(library.trash[0].id, b.id); assert.deepEqual(await store.load(b.id), b);
  await store.recover(b.id); assert.equal((await store.loadLibrary()).items.length, 2); await store.close();
});

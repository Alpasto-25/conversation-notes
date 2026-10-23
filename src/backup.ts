import { z } from 'zod';
import { RELATIONS, type Relation } from '../shared/types';
import { EVENT_KINDS } from '../shared/memory';
import type { Notebook } from './notebooks';
import type { SavedConversation } from './storage';

export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const id = z.string().min(1).max(100).refine(v => !['__proto__', 'prototype', 'constructor'].includes(v));
const text = z.string().max(8_000_000), date = z.string().datetime({ offset: true });
const number = z.number().finite().nonnegative(), probability = number.max(1);
const relation = z.enum(Object.keys(RELATIONS) as [Relation, ...Relation[]]);
const distribution = z.record(id, probability);
const judgment = z.object({ value: number.max(100).nullable(), confidence: probability,
  status: z.enum(['clear', 'ambiguous', 'insufficient']), probabilities: distribution });
const message = z.object({ id, sender: z.enum(['self', 'other']), text, timestamp: z.string().nullable(), kind: z.enum(['text', 'unreadable']) });
const event = z.object({ id, kind: z.enum(Object.keys(EVENT_KINDS) as [keyof typeof EVENT_KINDS, ...(keyof typeof EVENT_KINDS)[]]),
  confidence: probability, status: z.enum(['active', 'resolved', 'uncertain']), resolvedBy: id.optional() });
const line = z.object({ id, score: judgment, emotions: distribution.optional(), intents: distribution.optional(), skipped: text.optional(),
  analysisContext: z.object({ hash: id, provider: id, model: id, rubric: id, task: z.enum(['overview', 'other_messages', 'self_message']), targetIds: z.array(id), fullScene: z.boolean(), distant: z.boolean(), at: date.optional(), messageIds: z.array(id).optional() }).optional(),
  intentVersion: z.literal('surface-v1').optional(), replyType: z.string().optional(), replyConfidence: probability.optional(),
  tone: z.string().optional(), tones: distribution.optional(), toneConfidence: probability.optional(),
  event: event.omit({ id: true, status: true, resolvedBy: true }).optional(), communicationStrategies: distribution.optional(),
  strategyExplanation: z.string().max(1000).optional(), subtext: text.optional(), subtextStatus: z.enum(['supported', 'none', 'uncertain']).optional(),
  contextDependency: probability.optional(), semanticConfidence: probability.optional(), semanticEvidenceIds: z.array(id).optional(),
  semanticAnalysis: z.object({ version: id, model: id, contextHash: id, judgeProvider: id.optional(), judgeModel: id.optional() }).optional(),
  semanticJudgment: z.object({ version: id, provider: id, model: id, contextHash: id, communicationStrategies: distribution,
    subtextStatus: z.enum(['supported', 'none', 'uncertain']), contextDependency: probability, semanticConfidence: probability,
    semanticEvidenceIds: z.array(id), emotions: distribution, intents: distribution }).optional() });
const overview = z.object({ affinity: judgment, rapport: judgment.optional(), stage: z.string(), action: z.string(),
  alternative: text.optional(), evidenceId: id.nullable(), actionEvidenceId: id.nullable(), memoryEvidenceIds: z.array(id).optional(),
  contextCount: number.optional(), affinityRawValue: number.optional(), boundaryApplied: z.boolean().optional(),
  affinityDimensions: z.array(z.object({ key: id, label: z.string(), weight: number, judgment })).optional() });
const tokens = z.object({ input_tokens: number, output_tokens: number, prompt_cache_hit_tokens: number.optional(),
  prompt_cache_miss_tokens: number.optional(), requests: number.optional(), cost_usd: z.number().finite().nonnegative().optional() });
const usage = tokens.extend({ local_targets: number, elapsed_ms: number, provider: id.optional(), model: z.string().optional(),
  unreported_batches: number.optional(),
  purpose: z.enum(['screenshot', 'basic', 'supplement']).optional(),
  status: z.enum(['running', 'complete', 'partial', 'paused']).optional(),
  run_id: id.optional(), started_at: date.optional(), finished_at: date.optional(),
  details: z.array(tokens.extend({ model: z.string(), task: z.string(), repair: z.boolean(), prompt_family: z.string(),
    started_at: date, finished_at: date, elapsed_ms: number }).passthrough()).optional() });
export const savedConversationSchema = z.object({ schema: z.literal(1), rubric: id, messages: z.array(message).max(100_000),
  self: z.string(), other: z.string(), relation, lines: z.record(id, line), events: z.record(id, event), overview: overview.nullable(),
  trend: z.array(z.object({ at: date, value: number.max(100).nullable(), count: number, provider: z.string().optional(), model: z.string().optional(), rubric: z.string().optional(), relation: relation.optional(), chatFrom: z.string().optional(), chatTo: z.string().optional() })), analyzedCount: number, completed: z.boolean(),
  targetCache: z.array(z.object({ key: z.string().regex(/^[a-f0-9]{64}$/), line })).max(500).optional(),
  analysisUsage: usage.optional(), failedAnalysisUsage: usage.optional(), semanticUsage: usage.optional(),
  analysisIdentity: z.object({ provider: id, model: z.string() }).optional(),
  semanticState: z.object({ status: z.enum(['idle', 'loading', 'complete', 'error']), message: z.string() }).optional(),
  overviewSource: z.object({ provider: z.string(), model: z.string(), at: date, messageIds: z.array(id), provisional: z.boolean() }).optional(),
  analysisTask: z.object({ status: z.enum(['running', 'paused', 'complete', 'error']), done: number, total: number }).optional(),
}).superRefine((c, ctx) => {
  const ids = new Set(c.messages.map(m => m.id));
  if (ids.size !== c.messages.length) ctx.addIssue({ code: 'custom', message: '消息 ID 重复' });
  if (c.analyzedCount > c.messages.length || Object.entries(c.lines).some(([key, line]) => key !== line.id || !ids.has(key))
    || Object.entries(c.events).some(([key, event]) => key !== event.id || !ids.has(key) || (!!event.resolvedBy && !ids.has(event.resolvedBy))))
    ctx.addIssue({ code: 'custom', message: '分析或事件引用不存在的消息' });
});
export const notebookSchema = z.object({ schema: z.literal(2), id, title: z.string().max(100), contact: z.string().max(80),
  folderRelation: relation.optional(), createdAt: date, updatedAt: date, deletedAt: date.optional(), draft: text,
  conversation: savedConversationSchema, scenes: z.record(relation, savedConversationSchema),
  reading: z.object({ messageId: id, offset: number }).optional(),
  undo: z.object({ at: date, label: z.string(), conversation: savedConversationSchema, scenes: z.record(relation, savedConversationSchema), reading: z.object({ messageId: id, offset: number }).optional() }).optional(),
  versions: z.array(z.object({ id, at: date, label: z.string(), runId: id.optional(), phase: z.enum(['basic', 'supplement']).optional(), conversation: savedConversationSchema })).optional(), runHistory: z.array(usage).optional(),
  deletedAnalysisVersions: z.array(id).optional(),
  annotation: z.string().max(20_000).optional(), pinned: z.boolean().optional(), tags: z.array(z.string().max(30)).max(20).optional(), favorites: z.array(id).optional(),
  followups: z.record(id, z.object({ status: z.enum(['open', 'done', 'ignored']), note: z.string().max(2000), at: date })).optional() });
const backupSchema = z.object({ format: z.literal('conversation-notes-backup'), version: z.literal(1), createdAt: date,
  activeId: id.optional(), notebooks: z.array(notebookSchema).max(10_000) }).strict().superRefine((v, ctx) => {
  if (new Set(v.notebooks.map(n => n.id)).size !== v.notebooks.length) ctx.addIssue({ code: 'custom', message: '手记 ID 重复' });
});
export type NotebookBackup = { format: 'conversation-notes-backup'; version: 1; createdAt: string; activeId?: string; notebooks: Notebook[] };
export type RestoreMode = 'merge' | 'copies';
const encoder = new TextEncoder();
function safeJson(raw: string) {
  if (encoder.encode(raw).length > MAX_BACKUP_BYTES) throw new Error('备份超过 64 MB，请分份备份。');
  return JSON.parse(raw, (key, value) => {
    if (['__proto__', 'prototype', 'constructor'].includes(key) || /^(api.?key|secret|token|password|credential)$/i.test(key))
      throw new Error('备份包含不允许的数据字段。');
    return value;
  });
}
export function validateBackup(value: unknown): NotebookBackup {
  const parsed = backupSchema.safeParse(value);
  if (!parsed.success) throw new Error(`备份结构或版本无效：${parsed.error.issues[0]?.path.join('.') || '文件'}。现有记录未修改。`);
  return parsed.data as unknown as NotebookBackup;
}
function base64(bytes: Uint8Array) { let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(binary); }
function unbase64(value: string) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
async function encryptionKey(password: string, salt: Uint8Array, usage: KeyUsage[]) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 250_000, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, usage);
}
export async function encodeBackup(notebooks: Notebook[], activeId?: string, password = '') {
  const backup = validateBackup({ format: 'conversation-notes-backup', version: 1, createdAt: new Date().toISOString(), activeId, notebooks });
  const plain = JSON.stringify(backup);
  let output = plain;
  if (password) {
    if (password.length < 8) throw new Error('加密口令至少 8 个字符。');
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await encryptionKey(password, salt, ['encrypt']);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('conversation-notes-backup:1') }, key, encoder.encode(plain));
    output = JSON.stringify({ format: 'conversation-notes-encrypted-backup', version: 1, salt: base64(salt), iv: base64(iv), data: base64(new Uint8Array(encrypted)) });
  }
  if (encoder.encode(output).length > MAX_BACKUP_BYTES) throw new Error('备份超过 64 MB，请分份备份。');
  return output;
}
export async function decodeBackup(raw: string, password = ''): Promise<NotebookBackup> {
  let value: unknown;
  try { value = safeJson(raw); } catch { throw new Error('无法读取备份，请检查文件是否完整且小于 64 MB。'); }
  if ((value as { format?: string })?.format === 'conversation-notes-encrypted-backup') {
    const envelope = z.object({ format: z.literal('conversation-notes-encrypted-backup'), version: z.literal(1),
      salt: z.string().max(24), iv: z.string().max(16), data: z.string().max(MAX_BACKUP_BYTES) }).strict().safeParse(value);
    if (!envelope.success) throw new Error('加密备份结构或版本无效。');
    if (!password) throw new Error('此备份已加密，请输入备份口令。');
    try {
      const salt = unbase64(envelope.data.salt), iv = unbase64(envelope.data.iv);
      if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid salt');
      const key = await encryptionKey(password, salt, ['decrypt']);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource,
        additionalData: encoder.encode('conversation-notes-backup:1') }, key, unbase64(envelope.data.data) as BufferSource);
      value = safeJson(new TextDecoder('utf-8', { fatal: true }).decode(plain));
    } catch { throw new Error('口令不正确或备份已损坏。现有记录未修改。'); }
  }
  return validateBackup(value);
}
export function backupPreview(backup: NotebookBackup, existingIds: readonly string[]) {
  const existing = new Set(existingIds);
  return { total: backup.notebooks.length, trash: backup.notebooks.filter(n => n.deletedAt).length,
    conflicts: backup.notebooks.filter(n => existing.has(n.id)).length,
    messages: backup.notebooks.reduce((n, note) => n + note.conversation.messages.length, 0) };
}

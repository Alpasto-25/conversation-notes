import { useEffect, useRef, useState } from 'react';
import { backupPreview, decodeBackup, encodeBackup, MAX_BACKUP_BYTES, type NotebookBackup, type RestoreMode } from './backup';
import type { Notebook } from './notebooks';
import { exportBackup } from './platform';
import { ToggleSelect } from './ToggleSelect';

export function BackupPanel({ activeId, existingIds, exportData, restore, initialScope = 'all', onBusyChange }: {
  activeId?: string; existingIds: string[]; exportData: (onlyCurrent: boolean) => Promise<Notebook[]>;
  restore: (backup: NotebookBackup, mode: RestoreMode) => Promise<{ imported: number; skipped: number }>;
  initialScope?: string; onBusyChange?: (busy: boolean) => void;
}) {
  const [password, setPassword] = useState(''), [scope, setScope] = useState(initialScope), [mode, setMode] = useState<RestoreMode>('merge');
  const [candidate, setCandidate] = useState<NotebookBackup | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  async function save() {
    setBusy(true); setNotice('');
    try {
      const notes = await exportData(scope === 'current');
      const result = await exportBackup(await encodeBackup(notes, activeId, password));
      setNotice(result.cancelled ? '已取消保存。' : `已备份 ${notes.length} 份手记。请妥善保存文件${password ? '和口令' : ''}。`);
    } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  }
  async function read(input?: File) {
    if (!input) return;
    setBusy(true); setNotice(''); setCandidate(null);
    try {
      if (input.size > MAX_BACKUP_BYTES) throw new Error('备份超过 64 MB，请选择较小的备份。');
      setCandidate(await decodeBackup(await input.text(), password));
    } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  }
  async function confirmRestore() {
    if (!candidate) return;
    setBusy(true); setNotice('');
    try { const result = await restore(candidate, mode); setCandidate(null); setNotice(`已导入 ${result.imported} 份，跳过 ${result.skipped} 份重复手记。已有记录保留。`); }
    catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  }
  const preview = candidate && backupPreview(candidate, existingIds);
  return <section className="backup-panel" aria-label="备份与恢复" aria-busy={busy}>
    <p>备份包含聊天、草稿、各场景分析、用量和回收站，不含 API Key。恢复不会调用模型。</p>
    <label className="field">备份范围<ToggleSelect aria-label="备份范围" value={scope} disabled={busy} onChange={setScope}>
      <option value="all">全部手记（含回收站）</option><option value="current">仅当前手记</option>
    </ToggleSelect></label>
    <label className="field">备份口令（可选）<input type="password" autoComplete="new-password" aria-label="备份口令" value={password} disabled={busy} onChange={e => { setPassword(e.target.value); setCandidate(null); }} placeholder="至少 8 个字符；恢复加密备份时填写原口令" /></label>
    <p className="folder-help">填写口令会加密文件，口令无法找回。未填写时导出明文，请保管好私人聊天。</p>
    <button className="primary" disabled={busy || (!!password && password.length < 8)} onClick={() => void save()}>保存备份文件</button>
    <input ref={file} type="file" accept=".json,application/json" hidden aria-label="选择手记备份" onChange={e => { const selected = e.target.files?.[0]; e.target.value = ''; void read(selected); }} />
    <button className="secondary" disabled={busy} onClick={() => file.current?.click()}>选择文件并预览恢复</button>
    {candidate && preview && <div className="backup-preview">
      <h3>恢复预览</h3><p>{preview.total} 份手记 · {preview.messages} 条消息 · 回收站 {preview.trash} 份 · 重复 {preview.conflicts} 份</p>
      <label className="field">恢复方式<ToggleSelect aria-label="备份恢复方式" value={mode} disabled={busy} onChange={v => setMode(v as RestoreMode)}>
        <option value="merge">合并：跳过相同 ID，不覆盖已有手记</option><option value="copies">全部导入为独立副本</option>
      </ToggleSelect></label>
      <button className="primary" disabled={busy || !preview.total} onClick={() => void confirmRestore()}>确认恢复手记</button>
      <button className="secondary" disabled={busy} onClick={() => setCandidate(null)}>取消预览</button>
    </div>}
    <p role="status">{busy ? '正在处理备份，请保持此窗口打开…' : notice}</p>
  </section>;
}

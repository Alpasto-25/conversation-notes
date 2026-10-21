import type { Parsed } from '../shared/types';
import { messageDate } from '../shared/message-date';
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
export const MAX_IMPORT_CHARS = 8_000_000;
export type ImportSelection = { start: number; end: number; from: string; to: string };
export function selectedImport(rows: Parsed[], selection: ImportSelection) {
  if (!Number.isInteger(selection.start) || !Number.isInteger(selection.end) || selection.start < 1 || selection.end < selection.start) return [];
  return rows.slice(selection.start - 1, selection.end).filter(row => {
    if (!selection.from && !selection.to) return true;
    const day = messageDate(row.timestamp);
    return !!day && (!selection.from || day >= selection.from) && (!selection.to || day <= selection.to);
  });
}
export function mergeImportRow(rows: Parsed[], index: number) {
  if (index < 1 || index >= rows.length) return rows;
  return rows.flatMap((row, i) => i === index ? [] : i === index - 1 ? [{ ...row, text: `${row.text}\n${rows[index].text}` }] : [row]);
}

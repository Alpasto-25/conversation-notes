import { parseChat } from '../shared/parser';
import { MAX_IMPORT_CHARS } from './import-review';
export function parseChatAsync(raw: string, signal: AbortSignal): Promise<ReturnType<typeof parseChat>> {
  if (raw.length > MAX_IMPORT_CHARS) return Promise.reject(new Error('单次最多导入 800 万字符，请按日期分文件导入。'));
  const fallback = () => new Promise<ReturnType<typeof parseChat>>((resolve, reject) => setTimeout(() => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    try { resolve(parseChat(raw)); } catch { reject(new Error('聊天解析失败，请检查文字格式。')); }
  }, 0));
  if (typeof Worker === 'undefined') return fallback();
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try { worker = new Worker(new URL('./chat-parser.worker.ts', import.meta.url), { type: 'module' }); }
    catch { void fallback().then(resolve, reject); return; }
    const finish = () => { worker.terminate(); signal.removeEventListener('abort', abort); };
    const abort = () => { finish(); reject(new DOMException('Aborted', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    worker.onmessage = ({ data }) => { finish(); data.ok ? resolve(data.result) : reject(new Error('聊天解析失败，请检查文字格式。')); };
    worker.onerror = () => { finish(); setTimeout(() => {
      if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      try { resolve(parseChat(raw)); } catch { reject(new Error('聊天解析失败，请检查文字格式。')); }
    }, 0); };
    worker.postMessage({ raw });
  });
}

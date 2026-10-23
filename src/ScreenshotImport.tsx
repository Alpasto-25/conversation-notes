import { useEffect, useRef, useState } from 'react';
import { ImagePlus, ArrowUp, ArrowDown, X, ScanText, Square } from 'lucide-react';
import { IconButton } from './IconButton';
import { ToggleSelect } from './ToggleSelect';
import { AnalysisUsage } from './AnalysisUsage';
import { recognizeScreenshot, type ApiStatus } from './platform';
import { combineAnalysisUsage, type AnalysisUsage as Usage } from '../shared/usage';
import { screenshotChatText, screenshotProviderPreference, SCREENSHOT_PREFERENCE, SCREENSHOT_PROVIDERS, type ScreenshotProvider } from '../shared/openrouter';

type Screenshot = { id: string; name: string; image: string };
async function prepareScreenshot(file: File): Promise<Screenshot> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 16 * 1024 * 1024)
    throw new Error('请选择 16 MB 以内的 PNG、JPG 或 WebP 截图。');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 32 || bitmap.height < 32 || bitmap.width * bitmap.height > 40_000_000)
      throw new Error('截图尺寸不合适，请选择清晰的聊天截图。');
    const scale = Math.min(1, 1440 / bitmap.width);
    if (bitmap.height * scale > 8000) throw new Error('这张长截图太长，请分段截图后按顺序选择，避免文字缩小后无法辨认。');
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法读取截图，请重试。');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let image = '';
    for (const quality of [.92, .85, .75, .65]) {
      image = canvas.toDataURL('image/jpeg', quality);
      if (image.length <= 1_398_000) break;
    }
    if (image.length > 1_398_000) throw new Error('截图内容太多，请分成几张截图后重试。');
    return { id: crypto.randomUUID(), name: file.name || '粘贴的截图', image };
  } finally { bitmap.close(); }
}

export function ScreenshotImport({ initialFiles, status, configure, imported, recordUsage }: {
  initialFiles: File[]; status: ApiStatus | null; configure: (provider: ScreenshotProvider) => void;
  imported: (text: string) => void; recordUsage: (usage: Usage) => Promise<void>;
}) {
  const [images, setImages] = useState<Screenshot[]>([]), [loading, setLoading] = useState(false);
  const [side, setSide] = useState('right'), [working, setWorking] = useState(false), [progress, setProgress] = useState('');
  const [text, setText] = useState(''), [error, setError] = useState(''), [warnings, setWarnings] = useState<string[]>([]);
  const [runs, setRuns] = useState<Usage[]>([]);
  const [provider, setProvider] = useState<ScreenshotProvider>(() => {
    try { return screenshotProviderPreference(status, window.localStorage); } catch { return screenshotProviderPreference(status); }
  });
  const picker = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null);
  const mounted = useRef(true), adding = useRef(false);
  const configured = status?.profiles?.some(p => p.provider === provider && p.configured)
    || (status?.provider === provider && status.configured);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (initialFiles.length) void addFiles(initialFiles); }, []);
  function invalidateTranscript() { setText(''); setError(''); setWarnings([]); }
  async function addFiles(files: File[]) {
    if (adding.current || working) return;
    if (images.length + files.length > 6) { setError('每次最多选择 6 张截图，请按聊天顺序导入。'); return; }
    adding.current = true; setLoading(true); setError('');
    try {
      const prepared: Screenshot[] = [];
      for (const file of files) prepared.push(await prepareScreenshot(file));
      if (mounted.current) { setImages(old => [...old, ...prepared]); invalidateTranscript(); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '截图读取失败。'); }
    finally { adding.current = false; if (mounted.current) setLoading(false); }
  }
  function move(index: number, delta: number) {
    invalidateTranscript();
    setImages(old => { const next = [...old]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; });
  }
  async function recognize() {
    if (!images.length || working || !configured) return;
    const control = new AbortController(); controller.current = control;
    setWorking(true); setError(''); setWarnings([]); setText('');
    const chunks: string[] = [], notes: string[] = [];
    try {
      for (const [index, image] of images.entries()) {
        if (control.signal.aborted) break;
        setProgress(`正在识别第 ${index + 1} / ${images.length} 张…`);
        const result = await recognizeScreenshot(image.image, side as 'right' | 'left', control.signal, provider);
        if (mounted.current) setRuns(old => [...old, result.usage]);
        try { await recordUsage(result.usage); }
        catch { notes.push('本次用量保存失败，请保留当前窗口中的用量信息。'); }
        if (!mounted.current) return;
        if (result.messages?.length) chunks.push(screenshotChatText(result.messages));
        notes.push(...(result.warnings ?? []).map(note => `第 ${index + 1} 张：${note}`));
        setText(chunks.join('\n')); setWarnings([...notes]);
        if (result.error) { setError(result.error); break; }
        if (!result.messages?.length) { setError(`第 ${index + 1} 张没有识别到双人聊天。已完成的内容保留。`); break; }
      }
    } finally {
      controller.current = null;
      if (mounted.current) { setWorking(false); setProgress(''); }
    }
  }
  const usage = combineAnalysisUsage(runs);
  return <section className="screenshot-import" aria-label="截图识别导入" onPaste={event => {
    const files = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));
    if (files.length) { event.preventDefault(); void addFiles(files); }
  }}>
    <p>选择或粘贴聊天截图，识别后校对原文和身份，再保存或分析。多张截图请按聊天顺序排列，重叠部分可在下一步校对。</p>
    <label className="field">截图识别模型<ToggleSelect aria-label="截图识别模型" value={provider} disabled={working} onChange={value => {
      const selected = value as ScreenshotProvider; setProvider(selected); invalidateTranscript();
      try { window.localStorage.setItem(SCREENSHOT_PREFERENCE, selected); } catch { /* This session still works. */ }
    }}>{Object.entries(SCREENSHOT_PROVIDERS).map(([id, option]) => <option key={id} value={id}>{option.label}</option>)}</ToggleSelect></label>
    <p className="secure-note">点击“识别截图”才会把图片发送至 {SCREENSHOT_PROVIDERS[provider].label}，使用本机保存的对应 Key，单独统计耗时和费用。此选择不改变判断模型。截图不写入手记或备份。</p>
    {!configured && <p>请先保存 {provider === 'deepseek' ? 'DeepSeek' : 'OpenRouter'} 配置。<button className="text-button" onClick={() => configure(provider)}>打开 API 配置</button></p>}
    <input ref={picker} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label="选择聊天截图" onChange={e => {
      const files = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; void addFiles(files);
    }} />
    <button className="secondary" disabled={working || loading || images.length >= 6} onClick={() => picker.current?.click()}><ImagePlus size={18} />{loading ? '正在读取截图…' : '选择截图（最多 6 张）'}</button>
    {!!images.length && <ol className="screenshot-list">{images.map((image, index) => <li key={image.id}>
      <img src={image.image} alt={`第 ${index + 1} 张聊天截图预览`} /><span>{index + 1}. {image.name}</span>
      <div><IconButton label={`上移第 ${index + 1} 张截图`} disabled={working || loading || index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></IconButton>
        <IconButton label={`下移第 ${index + 1} 张截图`} disabled={working || loading || index === images.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></IconButton>
        <IconButton label={`移除第 ${index + 1} 张截图`} disabled={working || loading} onClick={() => { setImages(old => old.filter(item => item.id !== image.id)); invalidateTranscript(); }}><X size={16} /></IconButton></div>
    </li>)}</ol>}
    <label className="field">我的气泡位置<ToggleSelect aria-label="我的气泡位置" value={side} disabled={working} onChange={value => { setSide(value); invalidateTranscript(); }}><option value="right">右侧是我</option><option value="left">左侧是我</option></ToggleSelect></label>
    <div className="api-actions"><button className="primary" disabled={!configured || !images.length || working || loading} onClick={() => void recognize()}><ScanText size={18} />{runs.length ? '重新识别（产生新用量）' : '识别截图'}</button>
      {working && <button className="secondary" onClick={() => controller.current?.abort()}><Square size={16} />停止识别</button>}</div>
    {progress && <p role="status">{progress}</p>}{error && <p className="error" role="alert">{error}</p>}
    {!!warnings.length && <ul className="screenshot-warnings">{warnings.map((note, index) => <li key={index}>{note}</li>)}</ul>}
    {!!text && <><label className="field">识别原文（可编辑）<textarea className="screenshot-text" aria-label="截图识别原文" value={text} disabled={working} onChange={e => setText(e.target.value)} /></label>
      <button className="primary" disabled={working || !text.trim()} onClick={() => imported(text)}><ScanText size={18} />校对并预览导入</button></>}
    {usage && <details className="usage-history"><summary>本次截图识别用量</summary><AnalysisUsage usage={usage} runs={runs} description="截图文字提取，与决策分析分别计量；关闭后仍可在历史用量中查看。" /></details>}
  </section>;
}

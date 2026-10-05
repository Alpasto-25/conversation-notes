import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCheck, ChevronLeft, ChevronRight, Download, Eye, FileText, Image, ListChecks, LoaderCircle, Share2, Square, X } from "lucide-react";
import { exportNotes, isMobile } from "./platform";
import { ChatMessage } from "./ChatMessage";
import { IconButton } from "./IconButton";
import { lockOverlayBackground } from "./overlay-lock";
import { useDismissMotion } from "./useDismissMotion";
import { prepareImages } from "./share-image";
import { shareText, type ShareSource } from "./share-content";

export type ShareDialogHandle = { back: () => boolean };
type ImageSession = Awaited<ReturnType<typeof prepareImages>>;

export function ShareDialog({ source, close, ref }: { source: ShareSource; close: () => void; ref?: Ref<ShareDialogHandle> }) {
  const c = source.conversation, messages = c.messages;
  const [selected, setSelected] = useState<string[]>([]), [selecting, setSelecting] = useState(false);
  const [format, setFormat] = useState<"png" | "txt">("png"), [previewImage, setPreviewImage] = useState(false);
  const [cardPage, setCardPage] = useState(0), [pageCount, setPageCount] = useState(0), [image, setImage] = useState("");
  const [imageBusy, setImageBusy] = useState(false), [imageError, setImageError] = useState("");
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [width, setWidth] = useState(0);
  const [noticeError, setNoticeError] = useState(false);
  const { closing, dismiss } = useDismissMotion(close);
  const [appearanceRevision, setAppearanceRevision] = useState(0);
  const panel = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const session = useRef<ImageSession | null>(null), generation = useRef(0);
  const press = useRef<{ id: string; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null), ignoreClick = useRef("");
  const text = useMemo(() => shareText(source, selected), [source, selected]);
  const virtual = useVirtualizer({ count: messages.length, getScrollElement: () => scroller.current,
    getItemKey: useCallback((index: number) => messages[index].id, [messages]), estimateSize: () => 150, overscan: 8 });
  const back = useCallback(() => {
    if (busy || closing) return true;
    if (format === "txt" || previewImage) { setFormat("png"); setPreviewImage(false); }
    else if (selecting) { setSelecting(false); setSelected([]); }
    else dismiss();
    return true;
  }, [busy, closing, format, previewImage, selecting, dismiss]);
  useImperativeHandle(ref, () => ({ back }), [back]);
  const backRef = useRef(back); backRef.current = back;
  function cancelPress() { if (press.current) clearTimeout(press.current.timer); press.current = null; }
  function toggle(id: string) { setSelected(old => old.includes(id) ? old.filter(value => value !== id) : [...old, id]); setNotice(""); }
  useLayoutEffect(() => {
    const old = document.activeElement as HTMLElement;
    const unlock = lockOverlayBackground(document.querySelector<HTMLElement>(".workspace"));
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); backRef.current(); }
      if (event.key === "Tab") {
        const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled),textarea,[data-share-id]") || []).filter(node => node.getClientRects().length);
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { cancelPress(); document.removeEventListener("keydown", onKey); unlock(); if (old?.isConnected && !old.closest("[inert]")) old.focus(); };
  }, []);
  useLayoutEffect(() => {
    const node = panel.current; if (!node) return;
    const resize = () => setWidth(Math.min(1080, node.clientWidth));
    resize(); const observer = new ResizeObserver(resize); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const observer = new MutationObserver(() => setAppearanceRevision(revision => revision + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const current = ++generation.current;
    let local: ImageSession | null = null, live = true;
    session.current = null; setImage(""); setCardPage(0); setPageCount(0); setImageError("");
    setImageBusy(selected.length > 0 && width > 0);
    const timer = setTimeout(async () => {
      if (!selected.length || !width) return;
      try {
        local = await prepareImages(source, selected, width);
        if (!live) { local.dispose(); return; }
        session.current = local;
        const data = await local.render(0);
        if (live && generation.current === current) { setPageCount(local.pages.length); setImage(data); }
      } catch (error) { if (live) setImageError(error instanceof Error ? error.message : "图片生成失败，请重试。"); }
      finally { if (live && generation.current === current) setImageBusy(false); }
    }, 220);
    return () => { live = false; clearTimeout(timer); local?.dispose(); if (session.current === local) session.current = null; };
  }, [source, selected, width, appearanceRevision]);
  async function changePage(page: number) {
    if (!session.current || busy || imageBusy) return;
    const current = ++generation.current; setImageBusy(true); setImageError("");
    try { const data = await session.current.render(page); if (generation.current === current) { setImage(data); setCardPage(page); } }
    catch (error) { if (generation.current === current) setImageError(error instanceof Error ? error.message : "图片生成失败。"); }
    finally { if (generation.current === current) setImageBusy(false); }
  }
  async function output(share: boolean) {
    setBusy(true); setNotice(""); setNoticeError(false);
    try {
      const result = await exportNotes(format, format === "png" ? image : text, cardPage + 1, share);
      setNotice(result.cancelled ? "已取消" : result.opened ? "已打开系统分享" : "已保存");
    } catch (error) { setNoticeError(true); setNotice(error instanceof Error ? error.message : "导出失败，请重试。"); }
    finally { setBusy(false); }
  }
  return createPortal(<div className={`share-fullscreen${closing ? " is-closing" : ""}`} inert={closing} ref={panel} role="dialog" aria-modal="true" aria-label="分享对话片段">
    <header className="share-head">
      <IconButton ref={closeButton} label="关闭分享预览" disabled={busy} onClick={dismiss}><X size={20} /></IconButton>
      <h2>分享</h2><span role="status" className="share-count">{selecting ? `已选 ${selected.length} 条` : `${messages.length} 条消息`}</span>
      <IconButton label={selecting ? "退出多选" : "选择消息"} aria-pressed={selecting} disabled={busy} onClick={() => { setSelecting(!selecting); if (selecting) setSelected([]); }}><ListChecks size={19} /></IconButton>
      {selecting && <>
        <IconButton label="全选消息" disabled={busy} onClick={() => setSelected(messages.map(message => message.id))}><CheckCheck size={19} /></IconButton>
        <IconButton label="取消选择" disabled={busy || !selected.length} onClick={() => setSelected([])}><Square size={18} /></IconButton>
      </>}
    </header>
    <div className="share-body">
      <div className="share-chat" ref={scroller} hidden={format !== "png" || previewImage} onScroll={cancelPress} onContextMenu={event => event.preventDefault()}>
        <div className="share-chat-rows" style={{ height: virtual.getTotalSize(), position: "relative" }}>
          {virtual.getVirtualItems().map(row => {
            const m = messages[row.index], checked = selected.includes(m.id);
            return <div key={m.id} data-index={row.index} data-share-id={m.id} ref={virtual.measureElement}
              className={`message ${m.sender} share-message${checked ? " is-selected" : ""}`} role="button" tabIndex={0}
              aria-label={`分享消息 #${row.index + 1}`} aria-pressed={checked}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${row.start}px)` }}
              onPointerDown={event => {
                if (busy || !event.isPrimary || event.button !== 0) return;
                cancelPress(); ignoreClick.current = "";
                const id = m.id, x = event.clientX, y = event.clientY;
                press.current = { id, x, y, timer: setTimeout(() => { press.current = null; ignoreClick.current = id; setSelecting(true); toggle(id); }, 450) };
              }} onPointerMove={event => { const p = press.current; if (p && Math.hypot(event.clientX - p.x, event.clientY - p.y) > 9) cancelPress(); }}
              onPointerUp={cancelPress} onPointerCancel={cancelPress} onPointerLeave={cancelPress}
              onClick={() => { if (ignoreClick.current === m.id) { ignoreClick.current = ""; return; } if (selecting && !busy) toggle(m.id); }}
              onKeyDown={event => { if ((event.key === "Enter" || event.key === " ") && !busy) { event.preventDefault(); setSelecting(true); toggle(m.id); } }}>
              <ChatMessage message={m} result={c.lines[m.id]} self={c.self} other={c.other}
                showTime={row.index === 0 || m.timestamp !== messages[row.index - 1].timestamp} />
              {selecting && <span className="share-message-check" aria-hidden="true">{checked && <Check size={14} />}</span>}
            </div>;
          })}
        </div>
      </div>
      {format === "png" && previewImage && <div className="share-image-view">{image && <img src={image} alt={`分享图片 ${cardPage + 1}/${pageCount}`} />}</div>}
      {format === "txt" && <textarea className="share-text-preview" aria-label="分享文本预览" value={text} readOnly />}
    </div>
    <footer className="share-footer">
      <div className="share-actions">
        <IconButton label="图片" aria-pressed={format === "png"} disabled={busy} onClick={() => { setFormat("png"); setPreviewImage(false); }}><Image size={20} /></IconButton>
        <IconButton label="TXT 文本" aria-pressed={format === "txt"} disabled={busy || !selected.length} onClick={() => setFormat("txt")}><FileText size={20} /></IconButton>
        {format === "png" && <IconButton label={previewImage ? "返回聊天预览" : "预览所选图片"} aria-pressed={previewImage} disabled={busy || !image || imageBusy} onClick={() => setPreviewImage(!previewImage)}><Eye size={20} /></IconButton>}
        <span className="share-action-spacer" />
        {format === "png" && pageCount > 1 && <div className="share-pagination">
          <IconButton label="上一张图片" disabled={busy || imageBusy || !cardPage} onClick={() => void changePage(cardPage - 1)}><ChevronLeft size={18} /></IconButton>
          <span>{cardPage + 1}/{pageCount}</span><IconButton label="下一张图片" disabled={busy || imageBusy || cardPage + 1 >= pageCount} onClick={() => void changePage(cardPage + 1)}><ChevronRight size={18} /></IconButton>
        </div>}
        <IconButton label={format === "png" ? "保存图片" : "保存 TXT"} className="primary" disabled={busy || !selected.length || (format === "png" && (imageBusy || !image || !!imageError))} onClick={() => void output(false)}>
          {busy ? <LoaderCircle className="spin" size={20} /> : <Download size={20} />}
        </IconButton>
        {isMobile && <IconButton label={format === "png" ? "分享图片" : "分享文本"} disabled={busy || !selected.length || (format === "png" && (imageBusy || !image || !!imageError))} onClick={() => void output(true)}><Share2 size={20} /></IconButton>}
      </div>
      <p className="share-hint">{format === "txt" ? "TXT 适合交给其他 AI 做深入分析。" : !selecting ? "长按选择 · 点按可多选或取消" : imageBusy ? "正在生成图片…" : pageCount > 1 ? "长内容已分页，保存或分享当前图片。" : "仅分享所选消息和已有分析。"}</p>
      {(notice || imageError) && <p className={`share-notice${noticeError || imageError ? " error" : ""}`} role={noticeError || imageError ? "alert" : "status"}>{imageError || notice}</p>}
    </footer>
  </div>, document.body);
}

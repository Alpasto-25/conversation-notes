import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { toCanvas } from "html-to-image";
import { ChatMessage } from "./ChatMessage";
import type { ShareSource } from "./share-content";
import { IMAGE_WIDTH, IMAGE_MAX_HEIGHT, IMAGE_MIN_HEIGHT, imagePages, type ImagePage } from "./share-image-pages";

// Keep the browser's measured line breaks when the SVG image uses different font metrics.
function preserveBubbleLines(stage: HTMLElement) {
  for (const bubble of stage.querySelectorAll<HTMLElement>(".bubble")) {
    const text = bubble.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) continue;
    const box = bubble.getBoundingClientRect(), range = document.createRange();
    const lines: { top: number; text: string }[] = [];
    for (const part of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text.textContent || "")) {
      range.setStart(text, part.index); range.setEnd(text, part.index + part.segment.length);
      const rect = range.getClientRects()[0], last = lines.at(-1);
      if (rect && (!last || Math.abs(rect.top - last.top) > 0.5)) lines.push({ top: rect.top, text: part.segment });
      else if (last) last.text += part.segment;
    }
    if (!lines.length) continue;
    const fragment = document.createDocumentFragment();
    for (const line of lines) {
      const span = document.createElement("span");
      span.style.display = "block"; span.style.whiteSpace = "pre";
      span.textContent = line.text.replace(/[\r\n]/g, "") || "\u200b";
      fragment.append(span);
    }
    bubble.style.width = `${box.width}px`; bubble.style.height = `${box.height}px`;
    bubble.style.flexShrink = "0";
    bubble.replaceChildren(fragment);
  }
}

// SVG style copying rounds widths and can push a chip onto an unmeasured extra row.
function preserveAnalysisLayout(stage: HTMLElement) {
  for (const chips of stage.querySelectorAll<HTMLElement>(".analysis-chips")) {
    const box = chips.getBoundingClientRect();
    const children = Array.from(chips.children).map(node => ({ node: node as HTMLElement, box: node.getBoundingClientRect() }));
    Object.assign(chips.style, { position: "relative", display: "block", width: `${box.width}px`, height: `${box.height}px` });
    for (const child of children) {
      Object.assign(child.node.style, {
        position: "absolute", left: `${child.box.left - box.left}px`, top: `${child.box.top - box.top}px`,
        width: `${child.box.width}px`, height: `${child.box.height}px`,
      });
    }
  }
}

export async function prepareImages(source: ShareSource, ids: readonly string[], width: number) {
  const c = source.conversation, chosen = new Set(ids);
  const messages = c.messages.flatMap((message, index) => chosen.has(message.id) ? [{ message, index }] : []);
  const entries = new Map(messages.map(entry => [entry.message.id, entry]));
  const host = document.createElement("div");
  host.className = "share-render-host"; host.setAttribute("aria-hidden", "true"); host.inert = true;
  document.body.append(host);
  const root = createRoot(host), scale = IMAGE_WIDTH / width, capacity = Math.floor(IMAGE_MAX_HEIGHT / scale);
  const content = (id: string) => {
    const entry = entries.get(id)!;
    return <div className={`message ${entry.message.sender}`}><ChatMessage message={entry.message} result={c.lines[id]}
      self={c.self} other={c.other} showTime={entry.index === 0 || entry.message.timestamp !== c.messages[entry.index - 1].timestamp} /></div>;
  };
  let disposed = false;
  function dispose() { if (!disposed) { disposed = true; root.unmount(); host.remove(); } }
  try {
    await document.fonts.ready;
    flushSync(() => root.render(<div className="share-render-stage" style={{ width }}>{messages.map(({ message }) => <div key={message.id} data-render-id={message.id}>{content(message.id)}</div>)}</div>));
    const measured = Array.from(host.querySelectorAll<HTMLElement>("[data-render-id]")).map(node => {
      const top = node.getBoundingClientRect().top, height = Math.ceil(node.getBoundingClientRect().height), breaks: number[] = [];
      if (height > capacity) {
        const bubble = node.querySelector(".bubble")!, range = document.createRange(); range.selectNodeContents(bubble);
        const lines = Array.from(range.getClientRects()).filter(rect => rect.height > 0);
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].top >= lines[i - 1].bottom) breaks.push(Math.floor((lines[i].top + lines[i - 1].bottom) / 2 - top));
        }
        for (const child of node.querySelectorAll(".bubble,.analysis-row,.analysis-chip,.reply-tag,.pending-tag")) breaks.push(Math.ceil(child.getBoundingClientRect().bottom - top));
      }
      return { id: node.dataset.renderId!, height, breaks: [...new Set(breaks)].sort((a, b) => a - b) };
    });
    const pages = imagePages(measured, capacity);
    return { pages, dispose, async render(page: number) {
      if (disposed) throw new Error("图片预览已更新，请重试。");
      const plan: ImagePage = pages[page];
      const height = Math.min(IMAGE_MAX_HEIGHT, Math.max(IMAGE_MIN_HEIGHT, Math.ceil(plan.height * scale)));
      flushSync(() => root.render(<div className="share-render-stage" style={{ width, height: height / scale }}>
        {plan.slices.map((slice, i) => <div className="share-render-slice" key={`${slice.id}-${i}`} style={{ height: slice.height }}>
          <div style={{ transform: `translateY(${-slice.offset}px)` }}>{content(slice.id)}</div>
        </div>)}
      </div>));
      const stage = host.firstElementChild as HTMLElement;
      preserveBubbleLines(stage);
      preserveAnalysisLayout(stage);
      const canvas = await toCanvas(stage, { pixelRatio: 1, canvasWidth: IMAGE_WIDTH, canvasHeight: height,
        // Copy the font shorthand last so html-to-image keeps the exact font size, including decimals.
        includeStyleProperties: [...getComputedStyle(stage), "font"],
        skipFonts: true, backgroundColor: getComputedStyle(stage).backgroundColor });
      // Native bridges accept a bounded PNG. Never silently replace it with JPEG or drop content.
      const data = canvas.toDataURL("image/png"); canvas.width = 0; canvas.height = 0;
      if (data.length > 1_866_668) throw new Error("这张图片内容过多，请减少所选消息，或导出 TXT。");
      return data;
    } };
  } catch (error) { dispose(); throw error; }
}

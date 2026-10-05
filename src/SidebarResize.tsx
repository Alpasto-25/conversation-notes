import { useEffect, useRef, useState, type RefObject } from "react";

const key = "conversation-notes-sidebar-width-v1", minimum = 224;
const defaultWidth = () => Math.max(minimum, Math.min(308, innerWidth * .16));
function readWidth() {
  try { const value = Number(localStorage.getItem(key)); return Number.isFinite(value) && value >= minimum ? Math.min(640, value) : defaultWidth(); }
  catch { return defaultWidth(); }
}
export function SidebarResize({ container }: { container: RefObject<HTMLElement | null> }) {
  const preferred = useRef(readWidth()), dragging = useRef<number | null>(null);
  const currentWidth = useRef(preferred.current);
  const [width, setWidth] = useState(preferred.current), [maximum, setMaximum] = useState(640), [active, setActive] = useState(false);
  const bounds = () => Math.max(minimum, Math.min(640, (container.current?.clientWidth ?? innerWidth) - 480));
  function apply(value: number, save = false) {
    const max = bounds(), next = Math.round(Math.max(minimum, Math.min(max, value)));
    container.current?.style.setProperty("--sidebar-width", `${next}px`);
    currentWidth.current = next;
    setWidth(next); setMaximum(max);
    if (save) { preferred.current = next; try { localStorage.setItem(key, String(next)); } catch { /* Session resizing remains available. */ } }
    return next;
  }
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    apply(preferred.current);
    const observer = new ResizeObserver(() => apply(preferred.current));
    observer.observe(element);
    return () => observer.disconnect();
  }, [container]);
  return <div role="separator" aria-label="调整侧边栏宽度" aria-orientation="vertical" aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={width}
    tabIndex={0} className={`sidebar-resize${active ? " is-dragging" : ""}`} data-tooltip="拖动调整宽度；方向键微调，双击恢复默认"
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); dragging.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); setActive(true); }}
    onPointerMove={event => { if (dragging.current === event.pointerId && container.current) apply(event.clientX - container.current.getBoundingClientRect().left); }}
    onLostPointerCapture={() => { dragging.current = null; setActive(false); }}
    onPointerUp={event => { if (dragging.current !== event.pointerId) return; apply(currentWidth.current, true); dragging.current = null; setActive(false); }}
    onPointerCancel={() => { apply(preferred.current); dragging.current = null; setActive(false); }}
    onDoubleClick={() => apply(defaultWidth(), true)}
    onKeyDown={event => {
      const step = event.shiftKey ? 32 : 16;
      const value = event.key === "ArrowLeft" ? currentWidth.current - step : event.key === "ArrowRight" ? currentWidth.current + step : event.key === "Home" ? minimum : event.key === "End" ? bounds() : null;
      if (value !== null) { event.preventDefault(); apply(value, true); }
    }} />;
}

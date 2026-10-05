import { useRef, useState, type ReactNode, type PointerEvent } from "react";
import { FolderInput } from "lucide-react";
import { isMobile } from "./platform";

export function NotebookRow({ children, selected, canMove, move, title, hold, dragging, cancelHold }: {
  children: ReactNode; selected: boolean; canMove: boolean; move: () => void; title: string;
  hold?: (event: PointerEvent<HTMLDivElement>, activated: () => void) => void; dragging?: () => boolean; cancelHold?: () => void;
}) {
  const [revealed, setRevealed] = useState(false), [offset, setOffset] = useState<number | null>(null);
  const gesture = useRef<{ x: number; y: number; horizontal: boolean; vertical: boolean } | null>(null), suppress = useRef(false);
  return <div className={`notebook-swipe ${selected ? "selected" : ""}`} onPointerDown={event => {
    suppress.current = false;
    if (canMove) hold?.(event, () => { suppress.current = true; gesture.current = null; setOffset(null); setRevealed(false); });
    if (!isMobile || !canMove || event.pointerType !== "touch") return;
    gesture.current = { x: event.clientX, y: event.clientY, horizontal: false, vertical: false };
  }} onPointerMove={event => {
    if (dragging?.()) return;
    const g = gesture.current; if (!g || g.vertical) return;
    const dx = event.clientX - g.x, dy = event.clientY - g.y;
    if (!g.horizontal && Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { g.vertical = true; return; }
    if (!g.horizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) { g.horizontal = true; event.currentTarget.setPointerCapture(event.pointerId); }
    if (g.horizontal) { suppress.current = true; setOffset(Math.max(-76, Math.min(0, (revealed ? -76 : 0) + dx))); }
  }} onPointerUp={() => { cancelHold?.(); if (gesture.current?.horizontal) setRevealed((offset ?? 0) < -36); gesture.current = null; setOffset(null); }}
    onPointerCancel={() => { cancelHold?.(); gesture.current = null; setOffset(null); }}
    onContextMenu={event => { if (canMove) event.preventDefault(); }}
    onKeyDownCapture={() => { suppress.current = false; }}
    onClickCapture={event => { if (suppress.current) { event.preventDefault(); event.stopPropagation(); suppress.current = false; } }}>
    {isMobile && canMove && <button className="swipe-move" tabIndex={revealed ? 0 : -1} aria-hidden={!revealed} aria-label={`移动手记：${title}（滑动）`}
      onClick={() => { setRevealed(false); move(); }}><FolderInput size={18} /></button>}
    <div className={`notebook-row ${selected ? "selected" : ""}`} style={isMobile ? { transform: `translateX(${offset ?? (revealed && canMove ? -76 : 0)}px)` } : undefined}>{children}</div>
  </div>;
}

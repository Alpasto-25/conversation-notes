import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { Relation } from "../shared/types";
import type { NotebookSummary } from "./notebooks";

type Target = { relation: Relation; contact: string; node: HTMLElement };
type Drag = { note: NotebookSummary; x: number; y: number; pointer: number; node: HTMLElement; target: Target | null };
let cancelActive: (() => void) | null = null;
export function dismissNotebookDrag() { if (!cancelActive) return false; cancelActive(); return true; }

export function useNotebookDrag(root: RefObject<HTMLDivElement | null>, disabled: boolean,
  move: (notes: NotebookSummary[], scene: Relation, contact: string) => void, expand: (scene: Relation, contact?: string) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const active = useRef<Drag | null>(null), candidate = useRef<{ x: number; y: number; pointer: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const callbacks = useRef({ move, expand }); callbacks.current = { move, expand };
  const hover = useRef<{ node: HTMLElement; timer: ReturnType<typeof setTimeout> } | null>(null);
  const frame = useRef(0);
  function clearCandidate() { if (candidate.current) clearTimeout(candidate.current.timer); candidate.current = null; }
  function clearTarget() { active.current?.target?.node.classList.remove("is-drop-target"); if (hover.current) clearTimeout(hover.current.timer); hover.current = null; }
  function finish(commit = false) {
    const value = active.current; clearCandidate(); clearTarget(); active.current = null; setDrag(null);
    cancelAnimationFrame(frame.current);
    if (!value) return;
    cancelActive = null; document.body.classList.remove("is-notebook-dragging");
    try { value.node.releasePointerCapture(value.pointer); } catch { /* A moved row may already be detached. */ }
    if (commit && value.target && (value.target.relation !== value.note.relation || value.target.contact !== value.note.contact)) {
      callbacks.current.move([value.note], value.target.relation, value.target.contact);
    }
  }
  function locate() {
    const value = active.current; if (!value) return;
    const node = document.elementFromPoint(value.x, value.y)?.closest<HTMLElement>("[data-drop-scene]") ?? null;
    const valid = node && root.current?.contains(node) && !node.closest("[inert]") ? node : null;
    if (valid === value.target?.node) return;
    clearTarget(); value.target = valid ? { node: valid, relation: valid.dataset.dropScene as Relation, contact: valid.dataset.dropContact ?? value.note.contact } : null;
    if (valid) {
      valid.classList.add("is-drop-target");
      hover.current = { node: valid, timer: setTimeout(() => {
        callbacks.current.expand(valid.dataset.dropScene as Relation, valid.dataset.dropContact);
      }, 400) };
    }
    setDrag({ ...value });
  }
  function autoscroll() {
    const value = active.current; if (!value) return;
    const tree = root.current?.querySelector<HTMLElement>(".folder-tree");
    if (tree) {
      const bounds = tree.getBoundingClientRect();
      if (value.x >= bounds.left - 24 && value.x <= bounds.right + 24) {
        const direction = value.y < bounds.top + 40 ? -1 : value.y > bounds.bottom - 40 ? 1 : 0;
        if (direction) { tree.scrollTop += direction * 9; locate(); }
      }
    }
    frame.current = requestAnimationFrame(autoscroll);
  }
  useEffect(() => {
    const movePointer = (event: PointerEvent) => {
      const pending = candidate.current;
      if (pending && event.pointerId === pending.pointer && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 9) clearCandidate();
      const value = active.current; if (!value || value.pointer !== event.pointerId) return;
      event.preventDefault(); value.x = event.clientX; value.y = event.clientY; locate(); setDrag({ ...value });
    };
    const up = (event: PointerEvent) => { if (event.pointerId === candidate.current?.pointer) clearCandidate(); if (event.pointerId === active.current?.pointer) finish(true); };
    const cancel = (event: PointerEvent) => { if (event.pointerId === candidate.current?.pointer) clearCandidate(); if (event.pointerId === active.current?.pointer) finish(); };
    const touchMove = (event: TouchEvent) => { if (active.current && event.cancelable) event.preventDefault(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && active.current) { event.preventDefault(); event.stopImmediatePropagation(); finish(); } };
    const blur = () => finish();
    document.addEventListener("pointermove", movePointer, { passive: false });
    document.addEventListener("pointerup", up); document.addEventListener("pointercancel", cancel);
    // Cancel native panning only after the hold has activated a drag; ordinary scrolling remains native.
    document.addEventListener("touchmove", touchMove, { passive: false }); document.addEventListener("keydown", key, true);
    window.addEventListener("blur", blur);
    return () => {
      finish(); document.removeEventListener("pointermove", movePointer); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("touchmove", touchMove); document.removeEventListener("keydown", key, true); window.removeEventListener("blur", blur);
    };
  }, []);
  useEffect(() => { if (disabled) finish(); }, [disabled]);
  return { drag, isDragging: () => !!active.current,
    arm(note: NotebookSummary, event: ReactPointerEvent<HTMLElement>, activated: () => void) {
      if (disabled || event.button !== 0 || !event.isPrimary || event.target instanceof Element && event.target.closest(".notebook-actions,.notebook-check,.swipe-move")) return;
      clearCandidate(); const node = event.currentTarget, pointer = event.pointerId, x = event.clientX, y = event.clientY;
      candidate.current = { x, y, pointer, timer: setTimeout(() => {
        candidate.current = null; if (!node.isConnected || node.closest("[inert]")) return;
        activated(); active.current = { note, x, y, pointer, node, target: null };
        node.setPointerCapture(pointer); document.body.classList.add("is-notebook-dragging"); cancelActive = () => finish();
        setDrag({ ...active.current }); locate(); frame.current = requestAnimationFrame(autoscroll);
      }, 450) };
    }, cancelPending: clearCandidate };
}

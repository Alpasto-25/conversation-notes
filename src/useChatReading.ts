import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { Virtualizer } from '@tanstack/react-virtual';

gsap.registerPlugin(useGSAP);
type ReadingAnchor = { index: number; offset: number; width: number };

// Keep the same scrolling element and anchor a message when the reading viewport changes.
export function useChatReading(scroller: RefObject<HTMLDivElement | null>, virtual: Virtualizer<HTMLDivElement, Element>, notebookId?: string) {
  const [expanded, setExpanded] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const control = useRef<HTMLButtonElement>(null);
  const [controlPosition, setControlPosition] = useState({ top: 0, right: 0 });
  const changing = useRef(false), normalAnchor = useRef<ReadingAnchor | null>(null);
  const pending = useRef<{ top: number; anchor: ReadingAnchor | null } | null>(null);
  const capture = useCallback((): ReadingAnchor | null => {
    const element = scroller.current;
    if (!element) return null;
    const top = element.getBoundingClientRect().top;
    const message = Array.from(element.querySelectorAll<HTMLElement>('.message[data-index]'))
      .find(node => node.getBoundingClientRect().bottom > top);
    return message ? { index: Number(message.dataset.index), offset: top - message.getBoundingClientRect().top, width: element.clientWidth } : null;
  }, [scroller]);
  const change = useCallback((next: boolean) => {
    if (changing.current || next === expanded) return;
    const current = capture();
    if (next) {
      normalAnchor.current = current;
      const bounds = control.current?.getBoundingClientRect();
      if (bounds) setControlPosition({ top: bounds.top, right: innerWidth - bounds.right });
    }
    pending.current = { top: container.current?.getBoundingClientRect().top || 0, anchor: next ? current : normalAnchor.current };
    changing.current = true; setTransitioning(true); setExpanded(next);
  }, [expanded, capture]);
  const close = useCallback(() => change(false), [change]);
  const toggle = useCallback(() => change(!expanded), [change, expanded]);
  const { contextSafe } = useGSAP({ scope: container });
  useGSAP(() => {
    const transition = pending.current, element = scroller.current, panel = container.current;
    if (!transition || !element || !panel) return;
    pending.current = null;
    let frame = 0, passes = 0;
    const anchor = transition.anchor;
    const restore = () => {
      if (anchor) {
        const message = element.querySelector<HTMLElement>(`.message[data-index="${anchor.index}"]`);
        if (message) {
          const offset = element.clientWidth !== anchor.width
            ? Math.min(anchor.offset, Math.max(0, message.offsetHeight - 28)) : anchor.offset;
          const delta = message.getBoundingClientRect().top - element.getBoundingClientRect().top + offset;
          if (Math.abs(delta) > .5) virtual.scrollToOffset(element.scrollTop + delta, { behavior: 'auto' });
        } else virtual.scrollToIndex(anchor.index, { align: 'start', behavior: 'auto' });
      }
      if (++passes < 12) frame = requestAnimationFrame(restore);
    };
    frame = requestAnimationFrame(restore);
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0
      : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-panel'));
    const movement = Math.max(-12, Math.min(12, transition.top - panel.getBoundingClientRect().top));
    gsap.fromTo(element, { y: movement, opacity: .65 }, {
      y: 0, opacity: 1, duration, ease: 'power2.out', clearProps: 'transform,opacity',
      onComplete: contextSafe(() => { changing.current = false; setTransitioning(false); }),
    });
    return () => cancelAnimationFrame(frame);
  }, { scope: container, dependencies: [expanded], revertOnUpdate: true });
  useEffect(() => {
    setExpanded(false); setTransitioning(false); changing.current = false;
    normalAnchor.current = null; pending.current = null;
  }, [notebookId]);
  useEffect(() => {
    if (!expanded) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('.overlay')) { event.preventDefault(); close(); }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [expanded, close]);
  const controlStyle = expanded ? { position: 'fixed' as const, right: controlPosition.right,
    top: `min(${controlPosition.top}px, calc(100dvh - var(--touch-height) - env(safe-area-inset-bottom, 0px)))`, bottom: 'auto' } : undefined;
  return { expanded, transitioning, container, control, controlStyle, close, toggle };
}

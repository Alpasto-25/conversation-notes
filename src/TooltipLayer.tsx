import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** A single portal prevents hints from being clipped by scrollable notebooks or dialogs. */
export function TooltipLayer() {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ target: HTMLElement | null; text: string }>({ target: null, text: "" });
  const [position, setPosition] = useState<{ target: HTMLElement | null; left: number; top: number }>({ target: null, left: 0, top: 0 });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLElement | null = null;
    const hide = () => {
      clearTimeout(timer);
      if (current) {
        const descriptions = (current.getAttribute("aria-describedby") || "").split(/\s+/).filter(value => value && value !== id);
        if (descriptions.length) current.setAttribute("aria-describedby", descriptions.join(" "));
        else current.removeAttribute("aria-describedby");
      }
      current = null;
      setTip(previous => ({ ...previous, target: null }));
    };
    const targetOf = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>("[data-tooltip]") : null;
    const schedule = (target: HTMLElement) => {
      hide();
      const delay = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion-fast")) * 1000;
      timer = setTimeout(() => {
        const text = target.dataset.tooltip;
        if (!text || !target.isConnected || target.closest("[inert]")) return;
        current = target;
        const descriptions = target.getAttribute("aria-describedby");
        target.setAttribute("aria-describedby", [descriptions, id].filter(Boolean).join(" "));
        setTip({ target, text });
      }, Number.isFinite(delay) ? delay : 140);
    };
    const pointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      const target = targetOf(event.target);
      if (target && !(event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) schedule(target);
    };
    const pointerOut = (event: PointerEvent) => {
      const target = targetOf(event.target);
      if (target && !(event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) hide();
    };
    const focusIn = (event: FocusEvent) => {
      const target = targetOf(event.target);
      if (target?.matches(":focus-visible")) schedule(target);
    };
    const keyDown = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    document.addEventListener("pointerover", pointerOver);
    document.addEventListener("pointerout", pointerOut);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", keyDown);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", pointerOver);
      document.removeEventListener("pointerout", pointerOut);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", keyDown);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [id]);
  useLayoutEffect(() => {
    if (!tip.target || !ref.current) return;
    const target = tip.target.getBoundingClientRect(), box = ref.current.getBoundingClientRect();
    const top = target.top - box.height - 8;
    setPosition({ target: tip.target,
      left: Math.max(8, Math.min(innerWidth - box.width - 8, target.left + (target.width - box.width) / 2)),
      top: Math.max(8, Math.min(innerHeight - box.height - 8, top >= 8 ? top : target.bottom + 8)),
    });
  }, [tip]);
  const open = !!tip.target && position.target === tip.target;
  return createPortal(<div ref={ref} id={id} role="tooltip" aria-hidden={!open}
    className={`ui-tooltip${open ? " is-open" : ""}`} style={{ left: position.left, top: position.top }}>{tip.text}</div>, document.body);
}

import { Children, isValidElement, useId, useLayoutEffect, useRef, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { isMobile } from "./platform";
import { useDismissMotion } from "./useDismissMotion";

let closeCurrent: (() => void) | undefined;
export function dismissSelect() { if (!closeCurrent) return false; closeCurrent(); return true; }
type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value" | "multiple"> & {
  value: string; onChange: (value: string) => void; children: ReactNode;
};
export function ToggleSelect({ value, onChange, children, ...props }: Props) {
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 0, top: 0, width: 180, maxHeight: 240 });
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null), id = useId();
  const options = Children.toArray(children).filter(child => isValidElement<{ value: string; disabled?: boolean; children: ReactNode }>(child) && child.type === "option")
    .map(child => { const option = child as React.ReactElement<{ value: string; disabled?: boolean; children: ReactNode }>; return option.props; });
  const selected = options.find(option => String(option.value) === value);
  const { closing, dismiss, reset } = useDismissMotion(() => setOpen(false), "--motion-normal");
  useLayoutEffect(() => {
    if (!open || props.disabled) { setOpen(false); reset(); return; }
    closeCurrent?.();
    const close = () => { dismiss(); trigger.current?.focus({ preventScroll: true }); };
    closeCurrent = close;
    const rect = trigger.current!.getBoundingClientRect(), width = Math.min(innerWidth - 24, Math.max(180, rect.width));
    const below = innerHeight - rect.bottom - 12, above = rect.top - 12;
    const height = Math.min(280, Math.max(below, above), options.length * 44 + 12);
    setPosition({ left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)), top: below >= height ? rect.bottom + 4 : Math.max(12, rect.top - height - 4), width, maxHeight: height });
    popup.current?.querySelector<HTMLButtonElement>("[aria-selected=true]")?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) dismiss(); };
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); } };
    const scroll = (event: Event) => {
      if (popup.current?.contains(event.target as Node)) return;
      const current = trigger.current?.getBoundingClientRect();
      // Focusing a lower field can queue a scroll event before its menu opens.
      if (!current || Math.abs(current.top - rect.top) > 1 || Math.abs(current.left - rect.left) > 1) dismiss();
    };
    document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", keyboard, true);
    document.addEventListener("scroll", scroll, true); window.addEventListener("resize", close);
    return () => {
      if (closeCurrent === close) closeCurrent = undefined;
      document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", close);
    };
  }, [open, props.disabled, dismiss, reset]);
  if (!isMobile) return <select {...props} value={value} onChange={event => onChange(event.target.value)}>{children}</select>;
  return <span className="toggle-select">
    <button type="button" ref={trigger} id={props.id} className={`toggle-select-trigger ${props.className || ""}`} aria-label={props["aria-label"]}
      aria-labelledby={props["aria-labelledby"]} aria-haspopup="listbox" aria-controls={open ? id : undefined} aria-expanded={open && !closing} role="combobox" disabled={props.disabled}
      onClick={() => open ? dismiss() : setOpen(true)} onKeyDown={event => { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); if (open && !event.key.startsWith("Arrow")) dismiss(); else setOpen(true); } }}>
      <span className="toggle-select-label">{selected?.children ?? value}</span><ChevronDown className="toggle-select-arrow" size={16} strokeWidth={1.8} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={popup} id={id} role="listbox" aria-label={props["aria-label"] || "选择选项"} className={`toggle-select-popup${closing ? " is-closing" : ""}`} inert={closing} style={position}
      onKeyDown={event => {
        const buttons = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []), current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const index = event.key === "ArrowDown" ? (current + 1) % buttons.length : event.key === "ArrowUp" ? (current - 1 + buttons.length) % buttons.length : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : null;
        if (index !== null) { event.preventDefault(); buttons[index]?.focus(); }
        if (event.key === "Tab") dismiss();
      }}>{options.map(option => <button type="button" role="option" key={option.value} aria-selected={String(option.value) === value} disabled={option.disabled}
        onClick={() => { dismiss(); trigger.current?.focus({ preventScroll: true }); onChange(String(option.value)); }}>{option.children}</button>)}</div>, document.body)}
  </span>;
}

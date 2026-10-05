import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Menu, ShieldCheck } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { lockOverlayBackground } from "./overlay-lock";

gsap.registerPlugin(useGSAP);

export type MobileDrawerHandle = { toggle: () => void; close: () => void; isOpen: () => boolean };
export function MobileDrawer({ ref, background, trigger, children, onOpenChange }: {
  ref: Ref<MobileDrawerHandle>; background: RefObject<HTMLDivElement | null>;
  trigger: RefObject<HTMLButtonElement | null>; children: ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [small, setSmall] = useState(() => window.matchMedia("(max-width: 800px)").matches);
  const [reduce, setReduce] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [present, setPresent] = useState(false);
  const [togglePosition, setTogglePosition] = useState({ left: 16, top: 4, width: 44, height: 44 });
  useEffect(() => { onOpenChange?.(present); }, [present, onOpenChange]);
  const root = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null), shade = useRef<HTMLDivElement>(null);
  const animation = useRef<gsap.core.Timeline | null>(null);
  const currentOpen = useRef(open);
  currentOpen.current = open;
  useImperativeHandle(ref, () => ({ toggle: () => setOpen(value => !value), close, isOpen: () => currentOpen.current }), [close]);
  useLayoutEffect(() => { trigger.current?.setAttribute('aria-expanded', String(open)); }, [open, trigger]);

  useEffect(() => {
    const screen = window.matchMedia("(max-width: 800px)"), motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const resize = () => { setSmall(screen.matches); if (!screen.matches) close(); };
    const preference = () => setReduce(motion.matches);
    screen.addEventListener("change", resize);
    motion.addEventListener("change", preference);
    return () => { screen.removeEventListener("change", resize); motion.removeEventListener("change", preference); };
  }, [close]);

  useLayoutEffect(() => {
    if (open && small) setPresent(true);
    if (!small) setPresent(false);
  }, [open, small]);

  const { contextSafe } = useGSAP(() => {
    gsap.set(panel.current, { xPercent: -100, x: 0, force3D: true });
    gsap.set(shade.current, { autoAlpha: 0 });
  }, { scope: root });

  useGSAP(() => {
    animation.current?.kill();
    if (!present || !small) {
      gsap.set(panel.current, { xPercent: -100, x: 0, force3D: true });
      gsap.set(shade.current, { autoAlpha: 0 });
      return;
    }
    // Continue from the current position when an opening animation is interrupted.
    const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion-panel"));
    animation.current = gsap.timeline({
      defaults: { duration: reduce ? 0 : duration, ease: "power2.out" },
      onComplete: contextSafe(() => { if (!currentOpen.current) setPresent(false); }),
    }).to(panel.current, { xPercent: open ? 0 : -100, force3D: true }, 0)
      .to(shade.current, { autoAlpha: open ? 1 : 0 }, 0);
  }, { scope: root, dependencies: [open, present, small, reduce] });

  useLayoutEffect(() => {
    if (!present || !small) return;
    const workspace = background.current, drawer = root.current;
    if (!workspace || !drawer) return;
    const bounds = trigger.current?.getBoundingClientRect();
    if (bounds) setTogglePosition({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height });
    drawer.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const unlock = lockOverlayBackground(workspace);
    const keydown = (event: KeyboardEvent) => {
      if (!currentOpen.current || !drawer.contains(document.activeElement)) return;
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const nodes = Array.from(drawer.querySelectorAll<HTMLElement>("button:not(:disabled),a[href]"))
        .filter(node => node.getClientRects().length > 0 && !node.closest("[inert]"));
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === drawer)) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      unlock();
      // A menu action may already have focused an existing business dialog.
      if (drawer.contains(document.activeElement) || document.activeElement === document.body)
        trigger.current?.focus({ preventScroll: true });
    };
  }, [present, small, background, trigger, close]);

  return createPortal(
    <div ref={root} className="mobile-drawer-layer" hidden={!present || !small} role="dialog" aria-modal="true" aria-label="工作空间菜单" tabIndex={-1}>
      <div ref={shade} className="mobile-drawer-backdrop" aria-hidden="true" onClick={close} />
      <button className="icon mobile-drawer-toggle" aria-label="关闭菜单" aria-expanded={open} style={togglePosition} onClick={() => setOpen(value => !value)}><Menu size={22} /></button>
      <div ref={panel} id="mobile-workspace-menu" className="mobile-drawer">
        <header className="mobile-drawer-head">
          <span className="mobile-drawer-toggle-space" aria-hidden="true" />
          <strong>对话手记</strong>
        </header>
        <nav className="mobile-drawer-nav" aria-label="手机工作空间工具" inert={!open}>{children}</nav>
        <footer className="rail-footer"><ShieldCheck size={18} aria-hidden="true" />
          <div><strong>留住对话，也留一点思考的空间。</strong><span>记录保存在本机，由你决定分享什么</span></div>
        </footer>
      </div>
    </div>, document.body,
  );
}

import { useEffect, useId, useRef, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function FolderGroup({ label, icon, count, open, toggle, children, className = "" }: {
  label: string; icon: ReactNode; count?: number; open: boolean; toggle: () => void; children: ReactNode; className?: string;
}) {
  const root = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const currentOpen = useRef(open), previousOpen = useRef(open), id = useId();
  currentOpen.current = open;
  const { contextSafe } = useGSAP(() => {
    const media = gsap.matchMedia();
    media.add({ reduce: "(prefers-reduced-motion: reduce)", normal: "(prefers-reduced-motion: no-preference)" }, () => {
      const nodes = Array.from(content.current?.children || []);
      gsap.killTweensOf([content.current, ...nodes]);
      gsap.set(nodes, { y: 0, autoAlpha: 1, clearProps: "transform,opacity,visibility" });
      gsap.set(content.current, { height: currentOpen.current ? "auto" : 0, autoAlpha: currentOpen.current ? 1 : 0 });
    });
    return () => media.revert();
  }, { scope: root });
  const animate = contextSafe((expanded: boolean) => {
    const node = content.current; if (!node) return;
    const nodes = Array.from(node.children).slice(0, 6);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.killTweensOf([node, ...nodes]);
    // Height is needed for document flow; child movement uses compositor transforms only.
    gsap.to(node, { height: expanded ? "auto" : 0, autoAlpha: expanded ? 1 : 0,
      duration: reduce ? 0 : expanded ? 0.22 : 0.16, ease: "power2.out", overwrite: true });
    if (expanded) gsap.fromTo(nodes, { autoAlpha: reduce ? 1 : 0, y: reduce ? 0 : -4 },
      { autoAlpha: 1, y: 0, duration: reduce ? 0 : 0.18, stagger: reduce ? 0 : { amount: Math.min(0.1, nodes.length * 0.025) },
        ease: "power2.out", overwrite: true, clearProps: "transform,opacity,visibility" });
  });
  useEffect(() => {
    if (previousOpen.current === open) return;
    previousOpen.current = open; animate(open);
  }, [open, animate]);
  return <div ref={root} className={`folder-group ${className}`}>
    <button className="folder-toggle" aria-label={`展开或收起：${label}`} aria-expanded={open} aria-controls={id} onClick={toggle}>
      <ChevronRight className={`folder-chevron ${open ? "expanded" : ""}`} size={16} strokeWidth={1.75} aria-hidden="true" />
      {icon}<span>{label}</span>{count !== undefined && <small>{count}</small>}
    </button>
    <div ref={content} id={id} className="folder-group-content" role="group" aria-label={label} aria-hidden={!open} inert={!open}>{children}</div>
  </div>;
}

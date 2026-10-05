import type { ButtonHTMLAttributes, Ref } from "react";

export function IconButton({ label, className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; ref?: Ref<HTMLButtonElement> }) {
  return <button type="button" className={`icon action-icon ${className}`} aria-label={label} data-tooltip={label} {...props}>{children}</button>;
}

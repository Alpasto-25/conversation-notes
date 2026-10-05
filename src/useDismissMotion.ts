import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Dialogs and menus share the existing theme timing and reduced-motion behavior. */
export function useDismissMotion(close: () => void, token: "--motion-panel" | "--motion-normal" = "--motion-panel") {
  const callback = useRef(close), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [closing, setClosing] = useState(false);
  callback.current = close;
  const reset = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    setClosing(false);
  }, []);
  const dismiss = useCallback(() => {
    if (timer.current) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { callback.current(); return; }
    setClosing(true);
    const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(token));
    timer.current = setTimeout(() => callback.current(), duration * 1000);
  }, [token]);
  useLayoutEffect(() => () => clearTimeout(timer.current), []);
  return { closing, dismiss, reset };
}

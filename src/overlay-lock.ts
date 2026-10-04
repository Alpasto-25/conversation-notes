const backgrounds = new WeakMap<HTMLElement, { count: number; inert: boolean }>();
let scrollLocks = 0, previousOverflow = "";

// A drawer can hand off to a dialog while its exit animation is still running.
export function lockOverlayBackground(background: HTMLElement | null) {
  if (background) {
    const lock = backgrounds.get(background) || { count: 0, inert: background.inert };
    lock.count++;
    backgrounds.set(background, lock);
    background.inert = true;
  }
  if (scrollLocks++ === 0) previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (background) {
      const lock = backgrounds.get(background);
      if (lock && --lock.count === 0) { background.inert = lock.inert; backgrounds.delete(background); }
    }
    if (--scrollLocks === 0) document.body.style.overflow = previousOverflow;
  };
}

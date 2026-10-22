// Editable fields that should raise the soft keyboard. Checkboxes, radios and
// buttons never need it, and a disabled or read-only field must stay silent.
const EDITABLE = "input, textarea, [contenteditable=''], [contenteditable='true']";
const NO_KEYBOARD = ["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"];

type NativeBridge = { call(id: string, method: string, payload: string): void };

export function editableTarget(node: unknown): HTMLElement | undefined {
  const element = node as HTMLElement | null;
  if (!element || typeof element.closest !== "function") return undefined;
  const target = element.closest<HTMLElement>(EDITABLE);
  if (!target) return undefined;
  const tag = target.tagName;
  if (tag === "INPUT") {
    const type = (target.getAttribute("type") || "text").toLowerCase();
    if (NO_KEYBOARD.includes(type)) return undefined;
    if ((target as HTMLInputElement).disabled || (target as HTMLInputElement).readOnly) return undefined;
  }
  if (tag === "TEXTAREA" && ((target as HTMLTextAreaElement).disabled || (target as HTMLTextAreaElement).readOnly)) return undefined;
  if (target.getAttribute("contenteditable") === "false") return undefined;
  return target;
}

// Android hides the soft keyboard when a hardware keyboard is attached or the
// IME was dismissed once. Ask the native layer on every new focus instead of
// relying on the tap alone; ids are fire-and-forget because nothing waits.
let lastAt = 0;
export function requestSoftKeyboard(bridge: NativeBridge | undefined, now = Date.now()) {
  if (!bridge) return false;
  if (now - lastAt < 300) return false;
  lastAt = now;
  try {
    bridge.call(globalThis.crypto.randomUUID(), "showKeyboard", "{}");
    return true;
  } catch {
    return false;
  }
}

export function watchSoftKeyboard(enabled: boolean, doc: Document = document, bridge?: NativeBridge) {
  if (!enabled) return () => {};
  const native = bridge ?? (globalThis as { DialogueNative?: NativeBridge }).DialogueNative;
  const onFocus = (event: Event) => { if (editableTarget(event.target)) requestSoftKeyboard(native); };
  // Dismissing the IME keeps DOM focus. A second tap must request it again.
  const onClick = (event: Event) => {
    const target = editableTarget(event.target);
    if (target && (target === doc.activeElement || target.contains(doc.activeElement))) requestSoftKeyboard(native);
  };
  doc.addEventListener("focusin", onFocus);
  doc.addEventListener("click", onClick);
  return () => {
    doc.removeEventListener("focusin", onFocus);
    doc.removeEventListener("click", onClick);
  };
}

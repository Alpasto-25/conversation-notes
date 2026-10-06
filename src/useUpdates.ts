import { useCallback, useEffect, useRef, useState } from "react";
import { inspectRelease, shouldShowInstalledChanges, UPDATE_INTERVAL, type UpdateResult } from "../shared/updates";
import { APP_BUILD, checkUpdates } from "./platform";
import { shouldShowOnboarding } from "../shared/provider-guides";

const PREF = "conversation-notes-auto-updates-v1";
const DISMISSED = "conversation-notes-dismissed-update-v1";
const SEEN_BUILD = "conversation-notes-seen-build-v1";
function stored(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function store(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Preferences are optional. */ } }

export function useUpdates() {
  const [showInstalledChanges, setShowInstalledChanges] = useState(() => {
    let hasUsedApp = false;
    try { hasUsedApp = !shouldShowOnboarding(localStorage); } catch { /* First use remains quiet. */ }
    return shouldShowInstalledChanges(APP_BUILD, stored(SEEN_BUILD), hasUsedApp);
  });
  useEffect(() => {
    if (!showInstalledChanges) store(SEEN_BUILD, APP_BUILD.buildId);
  }, [showInstalledChanges]);
  const [automatic, setAutomatic] = useState(() => stored(PREF) !== "off");
  const [dismissed, setDismissed] = useState(() => stored(DISMISSED));
  const [snoozed, setSnoozed] = useState<string>();
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const running = useRef<AbortController | null>(null);
  const lastAttempt = useRef(0);
  const check = useCallback(async (fresh = false) => {
    if (running.current) return;
    const controller = new AbortController();
    running.current = controller;
    lastAttempt.current = Date.now();
    setChecking(true);
    setError("");
    try {
      const value = inspectRelease(await checkUpdates(controller.signal, fresh), APP_BUILD);
      if (!controller.signal.aborted) { setResult(value); setCheckedAt(Date.now()); }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "更新检查暂不可用，请稍后重试。");
    } finally {
      if (running.current === controller) running.current = null;
      if (!controller.signal.aborted) setChecking(false);
    }
  }, []);
  useEffect(() => {
    if (!automatic) return;
    void check();
    const due = () => {
      if (document.visibilityState === "visible" && Date.now() - lastAttempt.current >= UPDATE_INTERVAL) void check();
    };
    const timer = setInterval(due, UPDATE_INTERVAL);
    window.addEventListener("focus", due);
    document.addEventListener("visibilitychange", due);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", due);
      document.removeEventListener("visibilitychange", due);
    };
  }, [automatic, check]);
  useEffect(() => () => { const job = running.current; running.current = null; job?.abort(); }, []);
  return {
    automatic, result, error, checking, checkedAt, check,
    showInstalledChanges,
    acknowledgeInstalledChanges() { store(SEEN_BUILD, APP_BUILD.buildId); setShowInstalledChanges(false); },
    hasUpdate: result?.status === "available",
    showReminder: result?.status === "available" && result.reminderId !== dismissed && result.reminderId !== snoozed,
    snooze() { setSnoozed(result?.reminderId); },
    setAutomatic(value: boolean) { store(PREF, value ? "on" : "off"); setAutomatic(value); },
    dismiss() {
      if (result?.reminderId) { store(DISMISSED, result.reminderId); setDismissed(result.reminderId); }
    },
  };
}

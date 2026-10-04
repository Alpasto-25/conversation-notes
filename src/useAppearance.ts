import { useEffect, useState } from "react";
import { APPEARANCE_KEY, appearancePreference, resolvedAppearance, type Appearance } from "../shared/appearance";
import { isNative, setNativeAppearance } from "./platform";

function storedAppearance() {
  try { return appearancePreference(localStorage.getItem(APPEARANCE_KEY)); }
  catch { return "system" as const; }
}
export function initializeAppearance(preference = storedAppearance()) {
  document.documentElement.dataset.theme = resolvedAppearance(preference, matchMedia("(prefers-color-scheme: dark)").matches);
}
export function useAppearance() {
  const [preference, setPreference] = useState<Appearance>(storedAppearance);
  const [error, setError] = useState("");
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => initializeAppearance(preference);
    apply();
    media.addEventListener("change", apply);
    let active = true;
    if (isNative) void setNativeAppearance(preference).catch(() => {
      if (active) setError("页面外观已切换，应用窗口外观暂未保存，请稍后重新选择。");
    });
    return () => { active = false; media.removeEventListener("change", apply); };
  }, [preference]);
  return { preference, error, change(value: Appearance) {
    setError("");
    try { localStorage.setItem(APPEARANCE_KEY, value); }
    catch { setError("外观已切换，本次偏好无法保存，重新打开后将跟随系统。"); }
    initializeAppearance(value);
    setPreference(value);
  } };
}

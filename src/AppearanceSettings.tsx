import { Moon } from "lucide-react";
import type { useAppearance } from "./useAppearance";
import type { Appearance } from "../shared/appearance";

export function AppearanceSettings({ appearance }: { appearance: ReturnType<typeof useAppearance> }) {
  return <section className="appearance-settings" aria-label="外观设置">
    <label className="field"><span><Moon size={16} aria-hidden="true" /> 外观模式</span>
      <select aria-label="外观模式" value={appearance.preference} onChange={event => appearance.change(event.target.value as Appearance)}>
        <option value="system">跟随系统</option><option value="light">浅色模式</option><option value="dark">暗色模式</option>
      </select>
    </label>
    <p>选择后立即生效，重新打开应用会保留你的选择。跟随系统会随设备外观自动切换。</p>
    {appearance.error && <p className="error" role="alert">{appearance.error}</p>}
  </section>;
}

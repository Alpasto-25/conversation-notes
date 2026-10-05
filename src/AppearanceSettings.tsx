import { Moon } from "lucide-react";
import type { useAppearance } from "./useAppearance";
import type { Appearance } from "../shared/appearance";
import { ToggleSelect } from "./ToggleSelect";

export function AppearanceSettings({ appearance }: { appearance: ReturnType<typeof useAppearance> }) {
  return <section className="appearance-settings" aria-label="外观设置">
    <label className="field"><span><Moon size={16} aria-hidden="true" /> 外观模式</span>
      <ToggleSelect aria-label="外观模式" value={appearance.preference} onChange={value => appearance.change(value as Appearance)}>
        <option value="system">跟随系统</option><option value="light">浅色模式</option><option value="dark">暗色模式</option>
      </ToggleSelect>
    </label>
    <p>立即生效，自动记住选择。</p>
    {appearance.error && <p className="error" role="alert">{appearance.error}</p>}
  </section>;
}

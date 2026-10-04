export const APPEARANCE_KEY = "conversation-notes-appearance-v1";
export type Appearance = "system" | "light" | "dark";
export function appearancePreference(value: unknown): Appearance {
  return value === "light" || value === "dark" ? value : "system";
}
export function resolvedAppearance(preference: Appearance, systemDark: boolean): "light" | "dark" {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

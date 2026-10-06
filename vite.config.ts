import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { updateChangesSchema } from "./shared/updates";
const appVersion: string = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
const notes = JSON.parse(readFileSync(new URL("./release-notes.json", import.meta.url), "utf8"));
if (notes.version !== appVersion) throw new Error("Update release-notes.json for this app version before building.");
const changes = updateChangesSchema.parse(notes.changes);
export default defineConfig(({ mode }) => {
  const info = { schema: 1, platform: mode === "desktop" ? "windows" : mode === "mobile" ? "android" : "web",
    version: appVersion, buildId: `${new Date().toISOString().replace(/[^0-9]/g, "")}-${randomUUID().slice(0, 8)}`,
    builtAt: new Date().toISOString(), changes };
  return ({
  define: { __APP_BUILD_INFO__: JSON.stringify(info) },
  plugins: [react(), {
    name: "app-build-info",
    generateBundle() { this.emitFile({ type: "asset", fileName: "build-info.json", source: JSON.stringify(info, null, 2) + "\n" }); },
  }, {
    name: "desktop-content-security",
    transformIndexHtml(html) {
      if (mode !== "desktop") return html;
      return html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`);
    },
  }],
  build: { outDir: mode === "mobile" ? "dist-mobile" : mode === "desktop" ? "dist-desktop" : "dist" },
  server: {
    port: 5178,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3178" },
  },
}); });

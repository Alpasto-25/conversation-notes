import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  plugins: [react(), {
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
}));

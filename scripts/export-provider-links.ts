import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { OFFICIAL_PROVIDER_URLS } from "../shared/provider-guides";

const folder = resolve(process.argv[2]);
for (const value of OFFICIAL_PROVIDER_URLS) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port)
    throw new Error("Unsafe provider link in package");
}
await mkdir(folder, { recursive: true });
await writeFile(join(folder, "official-links.json"), JSON.stringify(OFFICIAL_PROVIDER_URLS, null, 2));
console.log(`Official provider allowlist: ${OFFICIAL_PROVIDER_URLS.length} fixed HTTPS links`);

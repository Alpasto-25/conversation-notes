import { readFile, readdir } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { parse } from "dotenv";
import assert from "node:assert/strict";
import { OFFICIAL_PROVIDER_URLS } from "../shared/provider-guides.ts";

const root = resolve(import.meta.dirname, "..");
const folder = resolve(process.argv[2]);
const env = parse(await readFile(join(root, ".env"), "utf8").catch(() => ""));
const secrets = ["JEV_API_KEY", "TYPESAFE_API_KEY", "AI_GATEWAY_API_KEY", "OPENROUTER_API_KEY", "DEEPSEEK_API_KEY"]
  .flatMap((name) => [env[name], process.env[name]])
  .filter((value) => value && value.length > 8);
let count = 0;
async function audit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!["www", "assets"].includes(entry.name) && file !== join(folder, "www", "licenses")) throw new Error("Unexpected payload directory");
      await audit(file);
      continue;
    }
    // Vite asset hashes can contain "QA"; reject development file names by extension.
    if (/(?:^|\.)env(?:\.|$)|\.(?:dpapi|jks|keystore|pdb|map)$|(?:QA|Tests)\.(?:exe|dll)(?:\.config)?$/i.test(entry.name)) throw new Error("Private or development file in payload");
    const data = await readFile(file);
    if (directory === join(folder, "www", "licenses") && entry.name !== "html-to-image-LICENSE.txt") throw new Error("Unexpected dependency license file");
    if (secrets.some((secret) => data.includes(Buffer.from(secret)) || data.includes(Buffer.from(secret, "utf16le"))))
      throw new Error("Build blocked: credential detected");
    if (data.includes(Buffer.from("127.0.0.1:3178"))) throw new Error("Build depends on the old desktop server");
    count++;
  }
}
await audit(folder);
assert.deepEqual(await readFile(join(folder, "www", "licenses", "html-to-image-LICENSE.txt")), await readFile(join(root, "public", "licenses", "html-to-image-LICENSE.txt")),
  "Packaged image export dependency license must be preserved");
assert.deepEqual(JSON.parse(await readFile(join(folder, "official-links.json"), "utf8")), OFFICIAL_PROVIDER_URLS,
  "Packaged provider links must match the fixed official allowlist");
const html = await readFile(join(folder, "www", "index.html"), "utf8");
if (!html.includes("connect-src 'none'")) throw new Error("Missing desktop content security policy");
console.log(`Desktop payload audit passed: ${count} files · ${basename(folder)} · no keys, records or test harness`);

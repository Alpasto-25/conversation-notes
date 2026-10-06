import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { buildInfoSchema, updateManifestSchema, UPDATE_MARKER } from "../shared/updates";

// Use metadata inside the packages, not the last (possibly unrelated) Vite build.
function buildInfo(zip: Buffer, path: string) {
  let end = zip.length - 22;
  const minimum = Math.max(0, zip.length - 65557);
  while (end >= minimum && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < minimum) throw new Error("Invalid ZIP archive");
  let cursor = zip.readUInt32LE(end + 16);
  const count = zip.readUInt16LE(end + 10);
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid ZIP directory");
    const length = zip.readUInt16LE(cursor + 28), extra = zip.readUInt16LE(cursor + 30), comment = zip.readUInt16LE(cursor + 32);
    const name = zip.subarray(cursor + 46, cursor + 46 + length).toString("utf8").replaceAll("\\", "/");
    if (name === path) {
      const offset = zip.readUInt32LE(cursor + 42), method = zip.readUInt16LE(cursor + 10), size = zip.readUInt32LE(cursor + 20);
      if (size > 8192 || zip.readUInt32LE(cursor + 24) > 8192) throw new Error("Oversized build metadata");
      const start = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
      const compressed = zip.subarray(start, start + size);
      const content = method === 8 ? inflateRawSync(compressed, { maxOutputLength: 8192 }) : method === 0 ? compressed : null;
      if (!content) throw new Error("Unsupported ZIP entry");
      return buildInfoSchema.parse(JSON.parse(content.toString("utf8")));
    }
    cursor += 46 + length + extra + comment;
  }
  throw new Error("Package lacks build-info.json");
}

if (!process.argv[2] || !process.argv[3]) throw new Error("Usage: node --import tsx scripts/prepare-release.ts <outputs-directory> <reviewed-notes-file>");
const folder = resolve(process.argv[2]), notesPath = resolve(process.argv[3]);
const version: string = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
const installerName = `ConversationNotes-Setup-${version}-x64.exe`, portableName = `ConversationNotes-Portable-${version}-x64.zip`, apkName = `conversation-notes-${version}.apk`;
const [installer, portable, apk] = await Promise.all([installerName, portableName, apkName].map(name => readFile(join(folder, name))));
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const windows = buildInfo(portable, "www/build-info.json"), android = buildInfo(apk, "assets/www/build-info.json");
if (windows.platform !== "windows" || android.platform !== "android" || windows.version !== version || android.version !== version)
  throw new Error("Package platforms/versions do not match this Release");
if (!windows.changes?.length || !android.changes?.length) throw new Error("Build both packages with this update's release notes before publication.");
const manifest = updateManifestSchema.parse({ schema: 1, platforms: {
  windows: { ...windows, asset: installerName, sha256: sha(installer) },
  android: { ...android, asset: apkName, sha256: sha(apk) },
} });
const reviewed = (await readFile(notesPath, "utf8")).replace(/\n?<!--\s*conversation-notes-update:.*?\s*-->\s*/gs, "\n").trimEnd();
if (!reviewed.includes("FerryCorleone") || !reviewed.includes(version)) throw new Error("Review Release notes and preserve upstream attribution first");
await writeFile(notesPath, `${reviewed}\n\n<!-- ${UPDATE_MARKER}${JSON.stringify(manifest)} -->\n`);
await writeFile(join(folder, `SHA256SUMS-${version}.txt`), [
  `${sha(installer)}  ${installerName}`, `${sha(portable)}  ${portableName}`, `${sha(apk)}  ${apkName}`,
].join("\n") + "\n");
console.log(`Release metadata verified from packages: Windows ${windows.buildId}; Android ${android.buildId}. Checksums generated; nothing uploaded.`);

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
test("Windows and Android versions and package filenames align with the app version", async () => {
  const { version } = JSON.parse(await source("package.json"));
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const native = await source("desktop/Main.cs");
  const versions = [...native.matchAll(/Assembly(?:File)?Version\("([^"]+)"\)/g)];
  assert.equal(versions.length, 2);
  for (const match of versions) assert.equal(match[1], `${version}.0`);
  const installer = await source("desktop/installer.iss");
  assert.equal(installer.match(/^AppVersion=([^\r\n]+)/m)?.[1], version);
  assert.ok(installer.includes(`OutputBaseFilename=ConversationNotes-Setup-${version}-x64`));
  const manifest = await source("android/AndroidManifest.xml");
  assert.ok(manifest.includes(`android:versionName="${version}"`));
  assert.ok(Number(manifest.match(/android:versionCode="(\d+)"/)?.[1]) >= 3);
  assert.ok((await source("desktop/build.ps1")).includes(`ConversationNotes-Portable-${version}-x64.zip`));
  assert.ok((await source("android/build.ps1")).includes(`conversation-notes-${version}.apk`));
});

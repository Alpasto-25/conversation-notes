import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInfoSchema, compareVersions, inspectRelease, RELEASES_URL, QUARK_DOWNLOAD_URL, QUARK_EXTRACTION_CODE, UPDATE_MARKER, type BuildInfo } from "../shared/updates";
import { readFile } from "node:fs/promises";
import { createReleaseChecker } from "../server/updates";

const current: BuildInfo = { schema: 1, platform: "windows", version: "1.1.0", buildId: "local-build-0001", builtAt: "2026-01-01T00:00:00.000Z" };
const android = { ...current, platform: "android" as const };
function fixture(options: { platform?: "windows" | "android"; version?: string; id?: string; at?: string } = {}) {
  const platform = options.platform ?? "windows", version = options.version ?? "1.1.0";
  const asset = platform === "windows" ? `ConversationNotes-Setup-${version}-x64.exe` : `conversation-notes-${version}.apk`;
  const remote = { ...current, platform, version, buildId: options.id ?? "remote-build-0002", builtAt: options.at ?? "2026-01-02T00:00:00.000Z", asset, sha256: "a".repeat(64) };
  return { tag_name: `v${version}`, html_url: RELEASES_URL.replace("latest", `tag/v${version}`), draft: false, prerelease: false,
    published_at: "2026-01-01T10:00:00Z", body: `Release\n<!-- ${UPDATE_MARKER}${JSON.stringify({ schema: 1, platforms: { [platform]: remote } })} -->`,
    assets: [{ name: asset, state: "uploaded", size: 100, digest: `sha256:${remote.sha256}`,
      browser_download_url: RELEASES_URL.replace("latest", `download/v${version}/${asset}`) }] };
}
test("same version with a newer internal build triggers an identifiable reminder", () => {
  const result = inspectRelease(fixture(), current);
  assert.equal(result.status, "available");
  assert.match(result.message, /同版本/);
  assert.equal(result.reminderId, "windows:1.1.0:remote-build-0002");
});
test("1.1.1 patch publication updates 1.1.0 on each platform but never suggests updating itself", () => {
  for (const platform of ["windows", "android"] as const) {
    const release = fixture({ platform, version: "1.1.1" });
    const previous = { ...current, platform };
    const result = inspectRelease(release, previous);
    assert.equal(result.status, "available");
    assert.equal(result.version, "1.1.1");
    assert.equal(result.reminderId, `${platform}:1.1.1:remote-build-0002`);
    assert.equal(inspectRelease(release, { ...previous, version: "1.1.1", buildId: "remote-build-0002", builtAt: "2026-01-02T00:00:00.000Z" }).status, "current");
  }
});
test("identical build and older build never trigger an update", () => {
  assert.equal(inspectRelease(fixture({ id: current.buildId }), current).status, "current");
  assert.equal(inspectRelease(fixture({ at: "2025-12-31T00:00:00.000Z" }), current).status, "current");
});
test("Windows-only publication does not mark Android as current or needing update", () => {
  assert.equal(inspectRelease(fixture(), android).status, "unknown");
  assert.equal(inspectRelease(fixture({ platform: "android" }), android).status, "available");
});
test("each new build has a different dismissal identity", () => {
  assert.notEqual(inspectRelease(fixture(), current).reminderId, inspectRelease(fixture({ id: "next-build-0003" }), current).reminderId);
});
test("new version supports a legacy release without metadata", () => {
  const release = fixture({ version: "1.2.0" }); release.body = "Legacy release";
  assert.equal(inspectRelease(release, current).status, "available");
  assert.equal(inspectRelease({ ...release, tag_name: "v1.1.0", html_url: RELEASES_URL.replace("latest", "tag/v1.1.0"), assets: fixture().assets }, current).status, "unknown");
});
test("semver ordering is numeric and never recommends an older release", () => {
  assert.equal(compareVersions("1.10.0", "1.9.0"), 1);
  assert.equal(compareVersions("1.1.0", "1.1.0"), 0);
  assert.equal(inspectRelease(fixture({ version: "1.0.0" }), current).status, "current");
});
test("metadata errors, duplicates, hashes, and missing/unuploaded artifacts fail closed", () => {
  const release = fixture();
  for (const altered of [
    { ...release, body: `<!-- ${UPDATE_MARKER}invalid -->` },
    { ...release, body: release.body + release.body },
    { ...release, body: release.body.replace('"schema":1', '"schema":9') },
    { ...release, body: release.body.replace('"platform":"windows"', '"platform":"android"') },
    { ...release, body: release.body.replace('"version":"1.1.0"', '"version":"1.2.0"') },
    { ...release, assets: [] },
    { ...release, assets: [{ ...release.assets[0], digest: null }] },
    { ...release, assets: [{ ...release.assets[0], state: "new" }] },
    { ...release, assets: [{ ...release.assets[0], browser_download_url: "https://evil.example/install" }] },
  ]) assert.equal(inspectRelease(altered, current).status, "unknown");
});
test("draft, prerelease, unsupported tags and foreign URLs are not accepted", () => {
  const release = fixture();
  for (const altered of [{ ...release, draft: true }, { ...release, prerelease: true }, { ...release, html_url: "https://evil.example" }, { ...release, tag_name: "nightly" }, null])
    assert.throws(() => inspectRelease(altered, current));
});
test("malformed build info is rejected and web instructions do not claim newest", () => {
  assert.equal(buildInfoSchema.safeParse({ ...current, builtAt: "invalid" }).success, false);
  assert.equal(inspectRelease(fixture(), { ...current, platform: "web" }).status, "unknown");
});
test("update transport uses fixed unauthenticated GET and coalesces/caches requests", async () => {
  let count = 0, time = 0;
  const checker = createReleaseChecker((async (url, options) => {
    count++;
    assert.equal(url, "https://api.github.com/repos/Alpasto-25/conversation-notes/releases/latest");
    assert.equal(options?.method, "GET");
    assert.equal(options?.body, undefined);
    assert.equal(options?.credentials, "omit");
    assert.equal(options?.redirect, "error");
    assert.equal(new Headers(options?.headers).get("Authorization"), null);
    assert.ok(options?.signal);
    return Response.json(fixture());
  }) as typeof fetch, () => time);
  await Promise.all([checker(), checker(), checker()]);
  assert.equal(count, 1);
  time = 60_001; await checker(); assert.equal(count, 2);
});
test("upstream failures, oversized bodies and invalid JSON are safe, bounded and cached", async () => {
  for (const response of [new Response("synthetic-private-body", { status: 403 }), new Response("not-json"), new Response("x".repeat(131073))]) {
    let count = 0;
    const checker = createReleaseChecker((async () => { count++; return response; }) as typeof fetch);
    await assert.rejects(checker(), error => error instanceof Error && !error.message.includes("synthetic-private-body"));
    await assert.rejects(checker());
    assert.equal(count, 1);
  }
});
test("a manual update check bypasses settled success and failure caches, but joins an active request", async () => {
  let calls = 0;
  const checker = createReleaseChecker((async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return calls === 1 ? new Response("not available", {status:503}) : Response.json(fixture({version:`1.1.${calls}`}));
  }) as typeof fetch);
  await assert.rejects(checker());
  await assert.rejects(checker());
  assert.equal(calls, 1);
  const [manual, concurrent] = await Promise.all([checker(true), checker(true)]);
  assert.deepEqual(manual, concurrent);
  assert.equal(calls, 2);
  assert.equal((manual as {tag_name:string}).tag_name, 'v1.1.2');
  await checker();
  assert.equal(calls, 2);
  assert.equal((await checker(true) as {tag_name:string}).tag_name, 'v1.1.3');
  assert.equal(calls, 3);
});
test("native download methods and UI point at the same fixed Quark share", async () => {
  const url = new URL(QUARK_DOWNLOAD_URL);
  assert.equal(url.origin, 'https://pan.quark.cn');
  assert.equal(url.searchParams.get('pwd'), QUARK_EXTRACTION_CODE);
  for (const file of ['../desktop/Main.cs','../android/src/local/conversation/notes/MainActivity.java']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert(source.includes(`\"${QUARK_DOWNLOAD_URL}\"`));
    assert(source.includes('\"openQuark\"'));
  }
});

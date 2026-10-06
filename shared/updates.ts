import { z } from "zod";

export const RELEASES_URL = "https://github.com/Alpasto-25/conversation-notes/releases/latest";
export const QUARK_DOWNLOAD_URL = "https://pan.quark.cn/s/7894e2647abc?pwd=LQxA";
export const QUARK_EXTRACTION_CODE = "LQxA";
export const RELEASE_API = "https://api.github.com/repos/Alpasto-25/conversation-notes/releases/latest";
export const UPDATE_MARKER = "conversation-notes-update:";
export const UPDATE_INTERVAL = 6 * 60 * 60 * 1000;
export const UPDATE_LIMIT = 128 * 1024;
const version = z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/);
export const updateChangesSchema = z.array(z.string().trim().min(1).max(180)).min(1).max(8);
export const buildInfoSchema = z.object({
  schema: z.literal(1),
  platform: z.enum(["windows", "android", "web"]),
  version,
  buildId: z.string().regex(/^[a-zA-Z0-9-]{8,80}$/),
  builtAt: z.string().datetime(),
  changes: updateChangesSchema.optional(),
});
export type BuildInfo = z.infer<typeof buildInfoSchema>;
const artifactSchema = buildInfoSchema.extend({
  asset: z.string().max(120),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const updateManifestSchema = z.object({
  schema: z.literal(1),
  platforms: z.object({
    windows: artifactSchema.optional(),
    android: artifactSchema.optional(),
  }),
});
const releaseSchema = z.object({
  tag_name: z.string().regex(/^v\d{1,4}\.\d{1,4}\.\d{1,4}$/),
  html_url: z.string(),
  draft: z.literal(false),
  prerelease: z.literal(false),
  body: z.string().max(UPDATE_LIMIT),
  published_at: z.string().datetime(),
  assets: z.array(z.object({
    name: z.string(),
    state: z.string(),
    size: z.number().int().positive(),
    digest: z.string().nullable().optional(),
    browser_download_url: z.string(),
  })).max(100),
});
export type UpdateResult = {
  status: "available" | "current" | "unknown";
  version: string;
  buildId?: string;
  publishedAt: string;
  message: string;
  reminderId?: string;
  changes?: string[];
};
// Old releases can supply a short plain-text list without changing their package metadata.
export function releaseChanges(body: string): string[] {
  const section = body.replace(/<!--.*?-->/gs, "").match(/^##\s+(?:本次更新|What's new|Changes)\s*\r?\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/mi)?.[1];
  if (!section) return [];
  return section.split(/\r?\n/).flatMap(line => {
    const bullet = line.match(/^[-*]\s+(.+)$/)?.[1];
    if (!bullet) return [];
    const plain = bullet.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*`]/g, "").trim();
    return plain ? [plain.slice(0, 180)] : [];
  }).slice(0, 8);
}
export function shouldShowInstalledChanges(current: BuildInfo, lastSeen: string | null, hasUsedApp: boolean) {
  return hasUsedApp && !!current.changes?.length && lastSeen !== current.buildId;
}
export function compareVersions(a: string, b: string) {
  const aa = a.split(".").map(Number), bb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] > bb[i] ? 1 : -1;
  return 0;
}
export function inspectRelease(raw: unknown, current: BuildInfo): UpdateResult {
  const parsed = releaseSchema.safeParse(raw);
  if (!parsed.success) throw new Error("发布信息格式不受支持，请稍后重试或直接查看 Release 页。");
  const release = parsed.data;
  const root = "https://github.com/Alpasto-25/conversation-notes/releases/";
  if (release.html_url !== `${root}tag/${release.tag_name}`)
    throw new Error("发布信息来源不符，已停止检查。");
  const latest = release.tag_name.slice(1);
  const bodyChanges = releaseChanges(release.body);
  const base = { version: latest, publishedAt: release.published_at, ...(bodyChanges.length ? { changes: bodyChanges } : {}) };
  const unknown: UpdateResult = { ...base, status: "unknown", message: "此发布没有可核验的本平台构建信息，请在 Release 页查看下载说明。" };
  const comments = [...release.body.matchAll(/<!--\s*conversation-notes-update:(.*?)\s*-->/gs)];
  if (comments.length > 1) return unknown;
  let manifest: z.infer<typeof updateManifestSchema> | undefined;
  if (comments.length === 1) {
    try { manifest = updateManifestSchema.parse(JSON.parse(comments[0][1])); }
    catch { return unknown; }
  }
  if (current.platform === "web") return { ...unknown, message: "网页版请从最新源码重新部署；电脑和手机安装包可在 Release 页下载。" };
  const expected = current.platform === "windows"
    ? `ConversationNotes-Setup-${latest}-x64.exe` : `conversation-notes-${latest}.apk`;
  const asset = release.assets.find(a => a.name === expected && a.state === "uploaded"
    && a.browser_download_url === `${root}download/${release.tag_name}/${expected}`);
  if (!asset) return unknown;
  const remote = manifest?.platforms[current.platform];
  if (comments.length && (!remote || remote.platform !== current.platform || remote.version !== latest
    || remote.asset !== expected || asset.digest !== `sha256:${remote.sha256}`)) return unknown;
  if (remote?.changes) base.changes = remote.changes;
  const comparison = compareVersions(latest, current.version);
  const newerBuild = remote && remote.buildId !== current.buildId
    && Date.parse(remote.builtAt) > Date.parse(current.builtAt);
  if (comparison > 0 || (comparison === 0 && newerBuild)) {
    return { ...base, status: "available", buildId: remote?.buildId,
      reminderId: `${current.platform}:${latest}:${remote?.buildId ?? asset.digest ?? release.published_at}`,
      message: comparison === 0 ? "发现同版本的新构建，请下载新版覆盖安装。" : "有新的应用版本可下载。" };
  }
  if (comparison < 0 || remote) return { ...base, status: "current", buildId: remote?.buildId,
    message: "当前应用未早于最新发布的本平台构建。" };
  return unknown;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, copyFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { OFFICIAL_PROVIDER_URLS } from '../shared/provider-guides';

const root = fileURLToPath(new URL('../', import.meta.url));
async function fixture(run: (folder: string) => Promise<void>) {
  const folder = await mkdtemp(join(tmpdir(), 'conversation-notes-audit-'));
  await mkdir(join(folder, 'www', 'assets'), { recursive: true });
  await mkdir(join(folder, 'www', 'licenses'), { recursive: true });
  await writeFile(join(folder, 'www', 'index.html'), '<meta http-equiv="Content-Security-Policy" content="connect-src \'none\'">');
  await writeFile(join(folder, 'official-links.json'), JSON.stringify(OFFICIAL_PROVIDER_URLS));
  await copyFile(join(root, 'public', 'licenses', 'html-to-image-LICENSE.txt'), join(folder, 'www', 'licenses', 'html-to-image-LICENSE.txt'));
  try { await run(folder); }
  finally {
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
    assert.ok(basename(folder).startsWith('conversation-notes-audit-'));
    await rm(folder, { recursive: true, force: true });
  }
}
function audit(folder: string, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, ['--import', 'tsx', join(root, 'scripts', 'audit-desktop.mjs'), folder], { cwd: root, env, encoding: 'utf8' });
}
test('Windows 打包审计接受带 QA 片段的正常 Vite 哈希文件', async () => fixture(async folder => {
  await writeFile(join(folder, 'www', 'assets', 'index-DqGkxXqA.css'), ':root { color: black; }');
  const result = audit(folder);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Desktop payload audit passed/);
}));
test('Windows 打包审计仍拒绝测试程序、密钥容器、环境文件和调试映射', async () => fixture(async folder => {
  for (const name of ['ConversationNotes-QA.exe', 'DesktopTests.exe', 'ConversationNotes-QA.exe.config', '.env', '.env.local', 'config.dpapi', 'notebook.jks', 'local.keystore', 'index.js.map', 'app.pdb']) {
    const file = join(folder, name); await writeFile(file, 'synthetic development file');
    const result = audit(folder);
    assert.notEqual(result.status, 0, name); assert.match(result.stderr, /Private or development file/);
    await unlink(file);
  }
}));
test('Windows 打包审计继续检查普通哈希资源中的配置密钥内容', async () => fixture(async folder => {
  const placeholder = 'synthetic-audit-key-never-a-real-secret';
  await writeFile(join(folder, 'www', 'assets', 'index-hash.js'), `const value = '${placeholder}';`);
  const result = audit(folder, { ...process.env, DEEPSEEK_API_KEY: placeholder });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /credential detected/);
  assert.ok(!result.stderr.includes(placeholder) && !result.stdout.includes(placeholder));
}));

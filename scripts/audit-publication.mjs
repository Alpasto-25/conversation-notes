import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'dotenv';

const projectRoot = resolve(import.meta.dirname, '..');
const allowedRoots = new Set([
  'src', 'shared', 'server', 'tests', 'public', 'android', 'desktop', 'docs', 'scripts',
  'README.md', 'README.en.md', 'ACKNOWLEDGEMENTS.md', 'CHANGELOG.md', 'SECURITY.md',
  'LICENSE', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
  'index.html', '.gitignore', '.env.example',
  'UI_STYLE.md',
]);
const credentialPatterns = [
  /apikey_[a-f0-9]{32}_[a-f0-9]{64}/i,
  /sk-or-v1-[a-z0-9]{32,}/i,
  /\bgh[opusr]_[a-z0-9]{30,}/i,
  /\bgithub_pat_[a-z0-9_]{40,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

export async function auditPublication(folder) {
  const directory = resolve(folder);
  const env = parse(await readFile(join(projectRoot, '.env'), 'utf8').catch(() => ''));
  const secrets = ['JEV_API_KEY', 'TYPESAFE_API_KEY', 'AI_GATEWAY_API_KEY', 'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN']
    .flatMap(name => [env[name], process.env[name]]).filter(value => value && value.length > 8);
  let count = 0;
  async function scan(current, topLevel = false) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (topLevel && entry.name === '.git') continue; // Git metadata is never part of the public tree.
      if (entry.isSymbolicLink()) throw new Error('Publication blocked: symbolic link in source export');
      if (topLevel && !allowedRoots.has(entry.name)) throw new Error('Publication blocked: unexpected root entry');
      if ((entry.name.startsWith('.env') && entry.name !== '.env.example') ||
          /\.(?:jks|keystore|dpapi|apk|exe|zip|log|pdb|map)$/i.test(entry.name) ||
          ['node_modules', '.runtime', '.build', 'work', 'outputs', 'artifacts', 'dist', 'dist-mobile', 'dist-desktop'].includes(entry.name))
        throw new Error('Publication blocked: private or generated artifact in source export');
      const file = join(current, entry.name);
      if (entry.isDirectory()) { await scan(file); continue; }
      const data = await readFile(file);
      if (secrets.some(secret => data.includes(Buffer.from(secret)) || data.includes(Buffer.from(secret, 'utf16le'))))
        throw new Error('Publication blocked: configured credential detected (not printed)');
      const text = data.toString('utf8');
      if (credentialPatterns.some(pattern => pattern.test(text)))
        throw new Error('Publication blocked: credential-shaped content detected (not printed)');
      if (/C:[\\/]+Users[\\/]+[^\\/\r\n"']+[\\/]/i.test(text))
        throw new Error('Publication blocked: user-specific local path detected');
      count++;
    }
  }
  await scan(directory, true);
  const license = await readFile(join(directory, 'LICENSE'));
  if (!license.equals(await readFile(join(projectRoot, 'LICENSE'))))
    throw new Error('Publication blocked: upstream MIT license changed');
  console.log(`Publication source audit passed: ${count} files, no configured credentials or private runtime files; upstream license preserved.`);
  return count;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (!process.argv[2]) throw new Error('Provide the isolated publication directory');
  await auditPublication(process.argv[2]);
}

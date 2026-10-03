import { readFile } from 'node:fs/promises';
import { resolve, join, basename, dirname } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { parse } from 'dotenv';
import assert from 'node:assert/strict';
import { OFFICIAL_PROVIDER_URLS } from '../shared/provider-guides.ts';

const root = resolve(import.meta.dirname, '..');
const config = parse(await readFile(join(root, '.env'), 'utf8').catch(() => ''));
const secrets = ['JEV_API_KEY', 'TYPESAFE_API_KEY', 'AI_GATEWAY_API_KEY', 'OPENROUTER_API_KEY']
  .map(name => config[name]).filter(value => value && value.length > 8);
const outputRoot = basename(dirname(root)) === 'outputs' ? dirname(root) : join(root, 'outputs');
const apk = await readFile(process.argv[2] ? resolve(process.argv[2]) : join(outputRoot, 'conversation-notes-1.1.0.apk'));
// Read the central directory, including entries that use data descriptors.
let end = apk.length - 22;
while (end >= Math.max(0, apk.length - 65557) && apk.readUInt32LE(end) !== 0x06054b50) end--;
if (end < 0) throw new Error('Invalid APK archive');
const entries = apk.readUInt16LE(end + 10);
let cursor = apk.readUInt32LE(end + 16), checked = 0, officialLinks, license, acknowledgements;
for (let index = 0; index < entries; index++) {
  if (apk.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP directory');
  const method = apk.readUInt16LE(cursor + 10);
  const size = apk.readUInt32LE(cursor + 20);
  const nameLength = apk.readUInt16LE(cursor + 28);
  const extraLength = apk.readUInt16LE(cursor + 30);
  const commentLength = apk.readUInt16LE(cursor + 32);
  const offset = apk.readUInt32LE(cursor + 42);
  const name = apk.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
  if (name.includes('\\')) throw new Error('APK asset path contains Windows separators');
  if (/(^|\/)\.env($|[^a-z])|provision-public|secure-config/i.test(name)) throw new Error('Private configuration included in APK');
  const start = offset + 30 + apk.readUInt16LE(offset + 26) + apk.readUInt16LE(offset + 28);
  const compressed = apk.subarray(start, start + size);
  const content = method === 8 ? inflateRawSync(compressed) : method === 0 ? compressed : null;
  if (!content) throw new Error('Unsupported ZIP entry');
  if (name === 'assets/official-links.json') officialLinks = JSON.parse(content.toString('utf8'));
  if (name === 'assets/LICENSE.txt') license = content.toString('utf8');
  if (name === 'assets/ACKNOWLEDGEMENTS.md') acknowledgements = content.toString('utf8');
  if (secrets.some(secret => content.includes(Buffer.from(secret)))) throw new Error('Secret audit failed (contents not printed)');
  if (name.startsWith('assets/www/') && /127\.0\.0\.1:3178|localhost:3178/.test(content.toString('utf8')))
    throw new Error('Phone assets depend on the desktop server');
  checked++;
  cursor += 46 + nameLength + extraLength + commentLength;
}
assert.deepEqual(officialLinks, OFFICIAL_PROVIDER_URLS, 'Packaged provider links must match the fixed official allowlist');
assert.equal(license, await readFile(join(root, 'LICENSE'), 'utf8'), 'APK must preserve the complete upstream MIT license');
assert.equal(acknowledgements, await readFile(join(root, 'ACKNOWLEDGEMENTS.md'), 'utf8'), 'APK must include original-author acknowledgements');
console.log(`APK audit passed: ${checked} extracted entries, no configured key or .env included, no desktop-server dependency.`);

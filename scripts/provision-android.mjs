// Transfers the existing configuration only to the explicitly connected phone.
// Secrets stay in memory: RSA-OAEP + AES-GCM over an ADB-forwarded local socket.
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { createPublicKey, publicEncrypt, randomBytes, createCipheriv } from 'node:crypto';
import { resolve, join } from 'node:path';
import { parse } from 'dotenv';

const root = resolve(import.meta.dirname, '..');
const adb = join(process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA, 'Android', 'Sdk'), 'platform-tools', 'adb.exe');
const run = (...args) => execFileSync(adb, ['-d', ...args], { encoding: 'utf8', windowsHide: true, timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
let localPort;
try {
  const env = parse(await readFile(join(root, '.env'), 'utf8'));
  const provider = (env.JEV_PROVIDER || 'typesafe').trim().toLowerCase();
  const names = { typesafe: 'TYPESAFE_API_KEY', vercel: 'AI_GATEWAY_API_KEY', openrouter: 'OPENROUTER_API_KEY' };
  if (!(provider in names)) throw new Error('Unsupported configured provider');
  const apiKey = (env.JEV_API_KEY || env[names[provider]] || '').trim();
  if (!apiKey) throw new Error('No API key is configured on the computer');
  const info = JSON.parse(run('shell', 'run-as', 'local.conversation.notes', 'cat', 'files/provision-public.json'));
  if (!Number.isInteger(info.port) || info.port < 1024 || info.port > 65535 || !['sha256', 'sha1'].includes(info.oaepHash))
    throw new Error('Invalid phone provisioning endpoint');
  const transferKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', transferKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ provider, apiKey }), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  const publicKey = createPublicKey({ key: Buffer.from(info.publicKey, 'base64'), type: 'spki', format: 'der' });
  const envelope = JSON.stringify({
    version: 1, iv: iv.toString('base64'), data: ciphertext.toString('base64'),
    wrappedKey: publicEncrypt({ key: publicKey, oaepHash: info.oaepHash }, transferKey).toString('base64'),
  });
  transferKey.fill(0);
  localPort = run('forward', 'tcp:0', `tcp:${info.port}`);
  if (!/^\d+$/.test(localPort)) throw new Error('USB forwarding failed');
  const result = await new Promise((accept, reject) => {
    const connection = createConnection({ host: '127.0.0.1', port: Number(localPort) });
    let reply = '';
    connection.setTimeout(15000, () => connection.destroy(new Error('Phone setup timed out')));
    connection.on('connect', () => connection.write(envelope + '\n'));
    connection.on('error', reject);
    connection.on('data', (chunk) => {
      reply += chunk.toString('utf8');
      if (reply.length > 1000) { connection.destroy(new Error('Invalid phone reply')); return; }
      if (reply.includes('\n')) { connection.end(); try { accept(JSON.parse(reply)); } catch { reject(new Error('Invalid phone reply')); } }
    });
    connection.on('end', () => { if (!reply.includes('\n')) reject(new Error('Phone closed setup connection')); });
  });
  if (!result.ok) throw new Error('Phone rejected the encrypted configuration');
  console.log('API configuration securely transferred and encrypted on the connected phone. No key printed or saved in temporary files.');
} catch (error) {
  // Never echo child process output or provider/credential payloads.
  console.error(error?.message?.startsWith('Command failed') ? 'Phone setup unavailable. Open the app and retry, or enter the key in its settings.' : error.message);
  process.exitCode = 1;
} finally {
  if (localPort) { try { run('forward', '--remove', `tcp:${localPort}`); } catch {} }
}

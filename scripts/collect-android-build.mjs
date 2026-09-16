import { execFile } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createWriteStream } from 'node:fs';
import { access, mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import QRCode from 'qrcode';

const buildId = process.argv[2];
if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(buildId ?? '')) {
  throw new Error('Usage: node scripts/collect-android-build.mjs <EAS build UUID>');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'downloads');
const run = promisify(execFile);
const deadline = Date.now() + 60 * 60 * 1000;

async function inspectBuild() {
  const args = ['--yes', 'eas-cli@24.5.0', 'build:view', buildId, '--json'];
  const windows = process.platform === 'win32';
  const result = await run(windows ? 'cmd.exe' : 'npx', windows ? ['/d', '/s', '/c', `npx ${args.join(' ')}`] : args, {
    cwd: root, windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, CI: '1', NO_COLOR: '1' },
  });
  const build = JSON.parse(result.stdout);
  if (build.id !== buildId || build.platform !== 'ANDROID') throw new Error('Unexpected build identity.');
  return build;
}

let build;
while (Date.now() < deadline) {
  try {
    build = await inspectBuild();
  } catch (error) {
    // Short-lived Expo/network errors should not lose a successfully queued build.
    console.log(`Could not read build status: ${error.message.split('\n')[0]}. Retrying in one minute.`);
    await new Promise(resolve => setTimeout(resolve, 60_000));
    continue;
  }
  console.log(`${new Date().toISOString()} ${build.status}`);
  if (build.status === 'FINISHED') break;
  if (['ERRORED', 'CANCELED'].includes(build.status)) throw new Error(`Build ${build.status}: ${build.error?.message ?? 'See the EAS build logs.'}`);
  await new Promise(resolve => setTimeout(resolve, 60_000));
}
if (build?.status !== 'FINISHED') throw new Error('Build is still pending. Run this command again to collect it.');
const artifact = new URL(build.artifacts?.applicationArchiveUrl || build.artifacts?.buildUrl || '');
if (artifact.protocol !== 'https:') throw new Error('The build did not return a secure APK download.');
await mkdir(output, { recursive: true });
const version = String(build.appVersion ?? '1.0.0').replace(/[^a-zA-Z0-9._-]/g, '');
const filename = `HOUSEWIRE-${version}-${buildId.slice(0, 8)}.apk`;
const target = path.join(output, filename);
let exists = false;
try { await access(target); exists = true; } catch { /* New artifact. */ }

if (!exists) {
  console.log('Downloading completed APK…');
  const response = await fetch(artifact, { signal: AbortSignal.timeout(600_000) });
  if (!response.ok || !response.body) throw new Error(`Download returned HTTP ${response.status}.`);
  const temporary = `${target}.${randomUUID()}.part`;
  let received = 0;
  const sizeGuard = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > 600 * 1024 * 1024) callback(new Error('Unexpectedly large APK; download stopped.'));
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), sizeGuard, createWriteStream(temporary, { flags: 'wx' }));
    const file = await open(temporary, 'r');
    const header = Buffer.alloc(4);
    try { await file.read(header, 0, 4, 0); } finally { await file.close(); }
    if (!header.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error('Downloaded file is not an APK/ZIP archive.');
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

const file = await open(target, 'r');
const hash = createHash('sha256');
try { for await (const chunk of file.createReadStream()) hash.update(chunk); }
finally { await file.close(); }
const sha256 = hash.digest('hex');
const metadata = {
  buildId, version, filename, sha256,
  downloadUrl: artifact.toString(),
  buildPage: `https://expo.dev/accounts/osama_366/projects/housewire/builds/${buildId}`,
  expiresAt: build.expirationDate,
};
await writeFile(path.join(output, 'android-build.json'), `${JSON.stringify(metadata, null, 2)}\n`);
await writeFile(path.join(output, `${filename}.sha256`), `${sha256}  ${filename}\n`);
await QRCode.toFile(path.join(output, 'HOUSEWIRE-ANDROID-INSTALL-QR.png'), artifact.toString(), {
  width: 800, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#15223A', light: '#FFFFFF' },
});
console.log(JSON.stringify(metadata, null, 2));
console.log(`APK and installation QR saved in ${output}`);

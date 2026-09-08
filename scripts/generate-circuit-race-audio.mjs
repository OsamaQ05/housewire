import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'assets', 'audio');
await mkdir(output, { recursive: true });

for (const [name, durationMs] of [['circuit-short.wav', 170], ['circuit-long.wav', 480]]) {
  await writeFile(resolve(output, name), makePulse(durationMs));
}

function makePulse(durationMs) {
  const sampleRate = 44_100;
  const sampleCount = Math.floor((durationMs / 1_000) * sampleRate);
  const bytes = Buffer.alloc(44 + sampleCount * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + sampleCount * 2, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(sampleCount * 2, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const attack = Math.min(1, index / (sampleRate * 0.008));
    const release = Math.min(1, (sampleCount - index) / (sampleRate * 0.025));
    const envelope = Math.min(attack, release) * Math.exp(-time * 1.4);
    const carrier = Math.sin(2 * Math.PI * 238 * time) * 0.72 + Math.sin(2 * Math.PI * 476 * time) * 0.18;
    bytes.writeInt16LE(Math.round(carrier * envelope * 24_000), 44 + index * 2);
  }
  return bytes;
}

/** Original Housewire score, authored for this project. No samples or third-party music.
 * Rebuild: node scripts/generate-game-music.mjs
 * Eight-bar loops; note tails wrap into the start, so there is no artificial fade/gap.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
const destination = fileURLToPath(new URL('../assets/audio/music/', import.meta.url));
mkdirSync(destination, { recursive: true });
const RATE = 22050;
const pieces = [
  ['switchboard', 84, 57, 'keys', [0, 7, 3, 10], [0, 7, 10, 7, 3, 7, 12, 10], .17],
  ['delivery', 96, 60, 'pluck', [0, 5, 9, 7], [0, 4, 7, 9, 7, 4, 2, 7], .3],
  ['workshop', 92, 55, 'wood', [0, 5, 2, 7], [0, 7, 2, 9, 4, 7, 11, 7], .28],
  ['crane', 76, 50, 'keys', [0, 5, 10, 7], [0, 7, 12, 7, 5, 9, 14, 9], .17],
  ['clockwork', 108, 60, 'bell', [0, 9, 5, 7], [0, 7, 12, 11, 9, 7, 4, 2], .23],
  ['courtyard', 78, 50, 'oud', [0, 5, 3, 7], [0, 2, 3, 7, 5, 3, 2, 0], .19],
  ['search', 90, 50, 'oud', [0, 7, 5, 0], [7, 3, 2, 0, 2, 5, 3, 2], .23],
  ['timehouse', 72, 50, 'oud', [0, 3, 5, 7], [0, 7, 3, 10, 5, 12, 7, 14], .1],
  ['daylight', 88, 62, 'oud', [0, 5, 7, 0], [0, 4, 7, 12, 9, 7, 4, 2], .16],
  ['table', 76, 60, 'keys', [0, 9, 5, 7], [7, 4, 0, 2, 4, 9, 7, 4], .08],
  ['marble', 106, 60, 'wood', [0, 5, 9, 7], [0, 7, 12, 7, 4, 9, 14, 9], .29],
  ['tray', 96, 65, 'pluck', [0, 5, 2, 7], [0, 4, 7, 4, 2, 5, 9, 5], .22],
  ['shadow', 70, 57, 'glass', [0, 5, 3, 7], [0, 7, 12, 10, 7, 3, 5, 7], .02],
  ['frequency', 112, 60, 'wood', [0, 5, 9, 7], [0, 4, 7, 9, 12, 9, 7, 4], .37],
  ['race', 120, 50, 'pulse', [0, 3, 5, 7], [0, 0, 7, 10, 0, 3, 12, 7], .34],
  ['lastlight', 72, 45, 'pulse', [0, 3, 5, 0], [0, 7, 12, 7, 0, 3, 10, 7], .13],
  ['forge', 82, 57, 'glass', [0, 5, 3, 7], [0, 3, 7, 10, 7, 5, 3, 2], .14],
];

function compose([id, tempo, root, timbre, progression, melody, percussion]) {
  const beat = 60 / tempo;
  const duration = beat * 32;
  const total = Math.round(duration * RATE);
  const mix = new Float64Array(total);
  const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
  const add = (at, midi, length, gain, instrument = timbre) => {
    const start = Math.round(at * RATE), count = Math.round(length * RATE), f = frequency(midi);
    for (let index = 0; index < count; index++) {
      const t = index / RATE, p = 2 * Math.PI * f * t;
      const attack = Math.min(1, t / (instrument === 'pad' ? .2 : .008));
      const release = Math.min(1, (length - t) / .055);
      const decay = Math.exp(-t * (instrument === 'pad' ? .6 : instrument === 'glass' ? 1.25 : 3));
      let tone = Math.sin(p);
      if (instrument === 'wood') tone += .4 * Math.sin(p * 3) * Math.exp(-t * 12) + .13 * Math.sin(p * 7) * Math.exp(-t * 16);
      if (instrument === 'oud' || instrument === 'pluck') tone += .4 * Math.sin(2 * p) * Math.exp(-t * 5) + .22 * Math.sin(3 * p) * Math.exp(-t * 7) + .1 * Math.sin(4 * p) * Math.exp(-t * 10);
      if (instrument === 'keys') tone += .27 * Math.sin(2 * p) * Math.exp(-t * 3) + .13 * Math.sin(3 * p) * Math.exp(-t * 8);
      if (instrument === 'bell' || instrument === 'glass') tone += .2 * Math.sin(2.01 * p) * Math.exp(-t * 1.8) + .08 * Math.sin(3.98 * p) * Math.exp(-t * 3);
      if (instrument === 'pad') tone = .68 * Math.sin(p) + .23 * Math.sin(p * 1.002) + .09 * Math.sin(2 * p);
      if (instrument === 'pulse') tone += .15 * Math.sin(2 * p) + .08 * Math.sin(3 * p);
      mix[(start + index) % total] += tone * attack * release * decay * gain;
    }
  };
  const drum = (at, gain, high) => {
    const start = Math.round(at * RATE);
    for (let index = 0; index < RATE * .17; index++) {
      const t = index / RATE;
      const signal = high ? Math.sin(t * 2 * Math.PI * 1180) * Math.sin(t * 2 * Math.PI * 327) : Math.sin(2 * Math.PI * (70 * t + 6 * (1 - Math.exp(-t * 32))));
      mix[(start + index) % total] += signal * Math.exp(-t * (high ? 65 : 30)) * Math.min(1, t / .002) * gain;
    }
  };
  for (let bar = 0; bar < 8; bar++) {
    const chord = root + progression[bar % 4];
    add(bar * 4 * beat, chord - 12, beat * 3.5, .15, 'keys');
    add((bar * 4 + 2) * beat, chord - 5, beat * 1.7, .075, 'pluck');
    add(bar * 4 * beat, chord, beat * 4.7, .038, 'pad');
    add(bar * 4 * beat, chord + 7, beat * 4.5, .025, 'pad');
    for (let note = 0; note < 4; note++) {
      const step = bar % 2 === 0 ? note : note + 4;
      const swing = (id === 'tray' || id === 'clockwork') && note % 2 ? .15 : 0;
      const position = (bar * 4 + note + swing) * beat;
      const pitch = root + 12 + melody[step];
      add(position, pitch, beat * (timbre === 'glass' ? 3 : 1.65), .16 + (note === 0 ? .025 : 0));
      if (bar % 2 && note === 3 && id !== 'shadow') add(position + beat * .5, root + 12 + melody[(step + 1) % 8], beat * .8, .07);
      if (id === 'timehouse') add(position + beat * .5, pitch - 12, beat * 2, .07, 'glass');
      drum((bar * 4 + note) * beat, percussion * (note % 2 ? .17 : .4), note % 2 === 1);
      if (id === 'race' || id === 'frequency') drum((bar * 4 + note + .5) * beat, percussion * .09, true);
    }
  }
  // A short circular room reflection preserves tails across a seamless loop.
  const wet = new Float64Array(total);
  for (let index = 0; index < total; index++) wet[index] = mix[index] + mix[(index - Math.round(RATE * .117) + total) % total] * .14 + mix[(index - Math.round(RATE * .241) + total) % total] * .075;
  let peak = 0; for (const sample of wet) peak = Math.max(peak, Math.abs(sample));
  const buffer = Buffer.alloc(44 + total * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(RATE, 24); buffer.writeUInt32LE(RATE * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(total * 2, 40);
  let sum = 0;
  for (let index = 0; index < total; index++) { const sample = wet[index] / peak * .72; sum += sample * sample; buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2); }
  writeFileSync(`${destination}/${id}.wav`, buffer);
  return { id, seconds: Number(duration.toFixed(2)), bytes: buffer.length, peak: .72, rms: Number(Math.sqrt(sum / total).toFixed(4)) };
}
const report = pieces.map(compose);
writeFileSync(`${destination}/manifest.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

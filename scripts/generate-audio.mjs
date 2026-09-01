import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(currentDir, '..', 'assets', 'audio');
fs.mkdirSync(outputDir, { recursive: true });

const sampleRate = 44_100;
const tau = Math.PI * 2;
const clamp = (value) => Math.max(-1, Math.min(1, value));

function writeWav(name, durationSeconds, generator) {
  const frameCount = Math.floor(durationSeconds * sampleRate);
  const dataSize = frameCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRate;
    buffer.writeInt16LE(Math.round(clamp(generator(time, durationSeconds)) * 32767), 44 + index * 2);
  }

  fs.writeFileSync(path.join(outputDir, name), buffer);
}

const sine = (frequency, time) => Math.sin(tau * frequency * time);
const decay = (time, rate) => Math.exp(-time * rate);
const attackRelease = (time, duration, attack = 0.02, release = 0.12) =>
  Math.min(1, time / attack) * Math.min(1, (duration - time) / release);

function knockAt(time, startsAt) {
  const local = time - startsAt;
  if (local < 0 || local > 0.16) return 0;
  const woodenBody = sine(118, local) * decay(local, 28);
  const contact = sine(1_460, local) * decay(local, 62);
  return woodenBody * 0.48 + contact * 0.16;
}

writeWav('switch.wav', 0.13, (time) => {
  const impulse = (Math.random() * 2 - 1) * decay(time, 58);
  const contact = sine(1260, time) * decay(time, 42);
  return (impulse * 0.44 + contact * 0.22) * attackRelease(time, 0.13, 0.001, 0.05);
});

writeWav('relay.wav', 0.36, (time) => {
  const first = time < 0.1 ? (Math.random() * 2 - 1) * decay(time, 38) : 0;
  const secondTime = Math.max(0, time - 0.15);
  const second = time > 0.15 ? (Math.random() * 2 - 1) * decay(secondTime, 45) : 0;
  return first * 0.25 + second * 0.18 + sine(105, time) * decay(time, 10) * 0.12;
});

writeWav('pulse.wav', 0.48, (time, duration) => {
  const frequency = 190 + time * 620;
  return (sine(frequency, time) * 0.34 + sine(frequency * 2, time) * 0.08) *
    attackRelease(time, duration, 0.01, 0.2);
});

writeWav('accept.wav', 0.7, (time, duration) => {
  const notes = [262, 392];
  const note = notes[Math.min(notes.length - 1, Math.floor(time / 0.28))];
  const local = time % 0.28;
  return (sine(note, time) * 0.3 + sine(note * 2, time) * 0.05) *
    decay(local, 5) * attackRelease(time, duration, 0.01, 0.16);
});

writeWav('warning.wav', 0.78, (time, duration) => {
  const wobble = 162 + Math.sin(time * tau * 5) * 18;
  return (sine(wobble, time) * 0.3 + sine(wobble * 1.5, time) * 0.08) *
    attackRelease(time, duration, 0.015, 0.18);
});

writeWav('ring.wav', 2.4, (time, duration) => {
  const gate = (time % 0.72) < 0.38 ? 1 : 0;
  const tremolo = 0.78 + Math.sin(time * tau * 9) * 0.22;
  return gate * tremolo * (sine(440, time) * 0.18 + sine(480, time) * 0.15) *
    attackRelease(time, duration, 0.03, 0.2);
});

writeWav('complete.wav', 2.3, (time, duration) => {
  const notes = [196, 247, 294, 392, 494];
  const slot = Math.min(notes.length - 1, Math.floor(time / 0.34));
  const local = time - slot * 0.34;
  const note = notes[slot];
  const chord = slot === notes.length - 1 ? sine(294, time) * 0.09 + sine(392, time) * 0.09 : 0;
  return (sine(note, time) * 0.24 * decay(Math.max(0, local), 3.8) + chord) *
    attackRelease(time, duration, 0.008, 0.35);
});

writeWav('house-hum.wav', 8, (time, duration) => {
  const drift = Math.sin(time * tau * 0.07) * 1.8;
  const mains = sine(55 + drift, time) * 0.055 + sine(110 + drift, time) * 0.018;
  const relayBed = sine(187, time) * (0.006 + Math.sin(time * tau * 0.19) * 0.003);
  return (mains + relayBed) * attackRelease(time, duration, 1.2, 1.5);
});

const nodeFrequencies = [196, 247, 294, 392];
nodeFrequencies.forEach((frequency, index) => {
  writeWav(`node-${index + 1}.wav`, 2, (time, duration) =>
    (sine(frequency, time) * 0.23 + sine(frequency * 2, time) * 0.035) *
      attackRelease(time, duration, 0.08, 0.42),
  );
});

for (let count = 1; count <= 4; count += 1) {
  const spacing = 0.36;
  const duration = count * spacing + 0.22;
  writeWav(`knock-${count}.wav`, duration, (time, totalDuration) => {
    let signal = 0;
    for (let index = 0; index < count; index += 1) {
      signal += knockAt(time, 0.06 + index * spacing);
    }
    return signal * attackRelease(time, totalDuration, 0.004, 0.08);
  });
}

console.log(`Generated Housewire audio in ${outputDir}`);

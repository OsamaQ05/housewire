import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { STORY_ROOMS } from '../src/features/story-rooms/catalog';
import { MUSIC_TRACKS, musicMayPlay, routeMusic, storyMusic } from '../src/features/music/music-catalog';
import { createMusicFocus, musicFocus, silenceMusicFor } from '../src/features/music/music-focus';

describe('contextual game music', () => {
  it('gives every authored chapter its own actual score', () => {
    const tracks = STORY_ROOMS.flatMap(room => room.stages.map(stage => storyMusic(room.id, stage.id, stage.interaction?.kind)));
    expect(tracks).toHaveLength(13);
    expect(new Set(tracks).size).toBe(13);
    tracks.forEach(track => expect(MUSIC_TRACKS[track]).toBeDefined());
  });
  it('gives the other modes distinct scores, and keeps home / settings quiet', () => {
    expect(routeMusic('/trivia-play')).toBe('frequency');
    expect(routeMusic('/race-play')).toBe('race');
    expect(routeMusic('/defusal')).toBe('lastlight');
    expect(routeMusic('/forge-live')).toBe('forge');
    expect(routeMusic('/home')).toBeNull();
    expect(routeMusic('/settings')).toBeNull();
    expect(routeMusic('/mission')).toBeNull();
  });
  it('requires the independent music switch, active foreground and no foreground audio', () => {
    expect(musicMayPlay(true, true, false, 'marble')).toBe(true);
    expect(musicMayPlay(false, true, false, 'marble')).toBe(false);
    expect(musicMayPlay(true, false, false, 'marble')).toBe(false);
    expect(musicMayPlay(true, true, true, 'marble')).toBe(false);
    expect(musicMayPlay(true, true, false, null)).toBe(false);
  });
  it('does not unmute a recording when a simultaneous narrator finishes', () => {
    const focus = createMusicFocus();
    const listener = vi.fn();
    const unsubscribe = focus.subscribe(listener);
    const stopRecording = focus.acquire();
    const stopNarrating = focus.acquire();
    expect(focus.getSnapshot()).toBe(true);
    stopNarrating(); stopNarrating();
    expect(focus.getSnapshot()).toBe(true);
    stopRecording();
    expect(focus.getSnapshot()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe(); focus.acquire();
    expect(listener).toHaveBeenCalledTimes(4);
  });
  it('expires effect ducking and permits cancellation without leaking a silence lease', () => {
    vi.useFakeTimers();
    const cancel = silenceMusicFor(2_000);
    expect(musicFocus.getSnapshot()).toBe(true);
    cancel(); expect(musicFocus.getSnapshot()).toBe(false);
    silenceMusicFor(1_000);
    vi.advanceTimersByTime(999); expect(musicFocus.getSnapshot()).toBe(true);
    vi.advanceTimersByTime(1); expect(musicFocus.getSnapshot()).toBe(false);
    vi.useRealTimers();
  });
  it('ships 17 distinct, non-silent PCM loops with conservative peaks and valid headers', () => {
    const hashes = new Set<string>();
    for (const id of Object.keys(MUSIC_TRACKS)) {
      const wav = readFileSync(new URL(`../assets/audio/music/${id}.wav`, import.meta.url));
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
      expect(wav.readUInt16LE(22)).toBe(1);
      expect(wav.readUInt32LE(24)).toBe(22_050);
      expect(wav.readUInt16LE(34)).toBe(16);
      expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
      const seconds = (wav.length - 44) / 44_100;
      expect(seconds).toBeGreaterThanOrEqual(16);
      expect(seconds).toBeLessThan(28);
      let peak = 0, square = 0;
      for (let offset = 44; offset < wav.length; offset += 2) {
        const sample = wav.readInt16LE(offset) / 32768;
        peak = Math.max(peak, Math.abs(sample)); square += sample * sample;
      }
      expect(peak).toBeLessThan(.73);
      expect(Math.sqrt(square / ((wav.length - 44) / 2))).toBeGreaterThan(.05);
      hashes.add(createHash('sha256').update(wav).digest('hex'));
    }
    expect(hashes.size).toBe(17);
  });
});

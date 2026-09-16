import { describe, expect, it } from 'vitest';
import { VOICE_NOTE_MAX_BYTES, VOICE_NOTE_MAX_DURATION_MS, validateVoiceNote, voiceNoteDurationMs, voiceNoteMimeType, type VoiceNotePayload } from '../src/domain/voice-note';

describe('voice note capture', () => {
  it('preserves full recordings rather than silently labelling every note as 1.9 seconds', () => {
    expect(voiceNoteDurationMs(8_720, 8_755, 9_000)).toBe(8_755);
    expect(voiceNoteDurationMs(22_570, 0, 23_000)).toBe(22_570);
    expect(voiceNoteDurationMs(0, 30_000, 30_140)).toBe(30_000);
  });
  it('handles recorder reset on automatic stop without counting permission setup time', () => {
    expect(voiceNoteDurationMs(0, 0, 30_140)).toBe(30_000);
    expect(voiceNoteDurationMs(0, 0, 6_050, 6_000)).toBe(6_000);
    expect(voiceNoteDurationMs(2_473.5, 0, 2_700)).toBe(2_474);
  });
  it('rejects empty or huge audio and keeps a bounded 30-second note', () => {
    const note: VoiceNotePayload = { base64: 'YWJj', byteSize: 3, durationMs: 30_000, mimeType: 'audio/mp4' };
    expect(validateVoiceNote(note)).toEqual(note);
    expect(() => validateVoiceNote({ ...note, byteSize: 0 })).toThrow();
    expect(() => validateVoiceNote({ ...note, byteSize: VOICE_NOTE_MAX_BYTES + 1 })).toThrow();
    expect(() => validateVoiceNote({ ...note, durationMs: 119 })).toThrow();
    expect(() => validateVoiceNote({ ...note, durationMs: VOICE_NOTE_MAX_DURATION_MS + 1 })).toThrow();
  });
  it('keeps real web codec metadata instead of labelling WebM as MP4', () => {
    expect(voiceNoteMimeType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(voiceNoteMimeType('audio/mp4')).toBe('audio/mp4');
    expect(voiceNoteMimeType('audio/x-m4a')).toBe('audio/mp4');
    expect(() => voiceNoteMimeType('text/plain')).toThrow();
  });
});

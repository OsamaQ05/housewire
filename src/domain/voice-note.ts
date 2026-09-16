export const VOICE_NOTE_MAX_DURATION_MS = 30_000;
export const VOICE_NOTE_MAX_BYTES = 512 * 1024;
export const VOICE_NOTE_MIN_DURATION_MS = 120;
export const VOICE_NOTE_MIME_TYPES = ['audio/mp4', 'audio/webm', 'audio/ogg'] as const;
export type VoiceNoteMimeType = (typeof VOICE_NOTE_MIME_TYPES)[number];

export interface VoiceNotePayload {
  base64: string;
  byteSize: number;
  durationMs: number;
  mimeType: VoiceNoteMimeType;
}

/** Some recorders reset their duration to zero on stop (including Expo web).
 * Capture it before stopping, prefer an authoritative final duration, and use
 * elapsed capture time only when neither recorder value is available. */
export function voiceNoteDurationMs(beforeStop: number, afterStop: number, elapsedMs: number, limitMs = VOICE_NOTE_MAX_DURATION_MS): number {
  const valid = (value: number) => Number.isFinite(value) && value > 0 ? value : 0;
  const measured = Math.max(valid(beforeStop), valid(afterStop)) || valid(elapsedMs);
  return Math.min(limitMs, Math.max(0, Math.round(measured)));
}

export function voiceNoteMimeType(value: string): VoiceNoteMimeType {
  const mime = value.split(';')[0].trim().toLowerCase();
  if (mime === 'audio/webm') return mime;
  if (mime === 'audio/ogg') return mime;
  if (mime === 'audio/mp4' || mime === 'audio/m4a' || mime === 'audio/x-m4a') return 'audio/mp4';
  throw new Error('This browser produced an unsupported voice format. Use Expo Go to record.');
}

export function validateVoiceNote(payload: VoiceNotePayload): VoiceNotePayload {
  if (!Number.isInteger(payload.byteSize) || payload.byteSize <= 0 || payload.byteSize > VOICE_NOTE_MAX_BYTES) {
    throw new Error('That voice note could not fit. Try recording a shorter note.');
  }
  if (!Number.isInteger(payload.durationMs) || payload.durationMs < VOICE_NOTE_MIN_DURATION_MS || payload.durationMs > VOICE_NOTE_MAX_DURATION_MS) {
    throw new Error('The note was too short. Tap Record, speak, then tap Stop & send.');
  }
  return payload;
}

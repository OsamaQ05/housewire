import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { classifyRelativeLevel } from '@/src/domain/acoustic-envelope';
import { musicFocus } from '@/src/features/music/music-focus';
import { VOICE_NOTE_MAX_DURATION_MS, validateVoiceNote, voiceNoteDurationMs, voiceNoteMimeType, type VoiceNotePayload } from '@/src/domain/voice-note';

export interface AcousticSample {
  at: number;
  decibels: number;
}

export type WhisperPayload = VoiceNotePayload;

const meterOptions = {
  ...RecordingPresets.LOW_QUALITY,
  sampleRate: 24_000,
  numberOfChannels: 1,
  bitRate: 32_000,
  android: {
    ...RecordingPresets.LOW_QUALITY.android,
    extension: '.m4a',
    outputFormat: 'mpeg4' as const,
    audioEncoder: 'aac' as const,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32_000 },
  isMeteringEnabled: true,
};

function median(values: readonly number[]): number {
  if (values.length === 0) return -48;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Expo Go-safe microphone adapter. Metering and recordings stay local until a
 * caller explicitly asks for a capped one-time whisper payload. Raw traces are
 * held only in memory and reset for every game action.
 */
export function useAcousticMeter() {
  const recorder = useAudioRecorder(meterOptions);
  const recorderState = useAudioRecorderState(recorder, 80);
  const samplesRef = useRef<AcousticSample[]>([]);
  const baselineRef = useRef(-48);
  const startedAtRef = useRef(0);
  const durationLimitRef = useRef(VOICE_NOTE_MAX_DURATION_MS);
  const stopPromiseRef = useRef<Promise<AcousticSample[]> | undefined>(undefined);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stopRef = useRef<() => Promise<AcousticSample[]>>(async () => []);
  const releaseMusicRef = useRef<(() => void) | undefined>(undefined);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!recorderState.isRecording || recorderState.metering === undefined) return;
    const sample = { at: Date.now(), decibels: recorderState.metering };
    samplesRef.current.push(sample);
    if (samplesRef.current.length > 180) samplesRef.current.shift();
    const calibration = samplesRef.current.slice(0, 10).map((item) => item.decibels);
    if (calibration.length >= 5) baselineRef.current = median(calibration);
  }, [recorderState.isRecording, recorderState.metering]);

  const start = useCallback(async (maximumDurationSeconds?: number) => {
    setError(undefined);
    try {
      if (recorder.getStatus().isRecording) return false;
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPermissionDenied(true);
        return false;
      }
      setPermissionDenied(false);
      releaseMusicRef.current?.();
      releaseMusicRef.current = musicFocus.acquire();
      samplesRef.current = [];
      baselineRef.current = -48;
      await setAudioModeAsync({
        allowsRecording: true,
        interruptionMode: 'doNotMix',
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
      await recorder.prepareToRecordAsync();
      startedAtRef.current = Date.now();
      durationLimitRef.current = maximumDurationSeconds ? Math.min(VOICE_NOTE_MAX_DURATION_MS, maximumDurationSeconds * 1000) : VOICE_NOTE_MAX_DURATION_MS;
      recorder.record(
        // Web's native forDuration timer can call stop twice after manual stop.
        Platform.OS !== 'web' && maximumDurationSeconds ? { forDuration: durationLimitRef.current / 1000 } : undefined,
      );
      if (maximumDurationSeconds) {
        clearTimeout(limitTimerRef.current);
        limitTimerRef.current = setTimeout(() => void stopRef.current().catch(() => undefined), durationLimitRef.current);
      }
      return true;
    } catch (cause: unknown) {
      releaseMusicRef.current?.(); releaseMusicRef.current = undefined;
      setError(cause instanceof Error ? cause.message : 'The microphone could not start.');
      return false;
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    if (stopPromiseRef.current) return stopPromiseRef.current;
    clearTimeout(limitTimerRef.current);
    const attempt = (async () => {
      try {
        if (recorder.getStatus().isRecording) await recorder.stop();
      } finally {
        await setAudioModeAsync({
          allowsRecording: false,
          interruptionMode: 'mixWithOthers',
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        }).catch(() => undefined);
        releaseMusicRef.current?.(); releaseMusicRef.current = undefined;
      }
      return [...samplesRef.current];
    })();
    stopPromiseRef.current = attempt;
    try { return await attempt; } finally { stopPromiseRef.current = undefined; }
  }, [recorder]);
  stopRef.current = stop;

  useEffect(() => () => {
    clearTimeout(limitTimerRef.current);
    releaseMusicRef.current?.();
  }, []);

  const finishWhisper = useCallback(async (): Promise<WhisperPayload | undefined> => {
    let file: File | undefined;
    let objectUrl: string | undefined;
    try {
      const beforeStop = recorder.getStatus().durationMillis;
      const elapsedMs = Date.now() - startedAtRef.current;
      await stop();
      const durationMs = voiceNoteDurationMs(beforeStop, recorder.getStatus().durationMillis, elapsedMs, durationLimitRef.current);
      const uri = recorder.uri;
      if (!uri) throw new Error('The microphone did not produce a voice note. Please try again.');
      if (Platform.OS === 'web') {
        objectUrl = uri;
        const blob = await (await fetch(uri)).blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
          reader.onerror = () => reject(new Error('The voice note could not be read.'));
          reader.readAsDataURL(blob);
        });
        return validateVoiceNote({ base64, byteSize: blob.size, durationMs, mimeType: voiceNoteMimeType(blob.type) });
      }
      file = new File(uri);
      const info = file.info();
      const byteSize = info.size ?? 0;
      return validateVoiceNote({
        base64: await file.base64(),
        byteSize,
        durationMs,
        mimeType: 'audio/mp4',
      });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The voice note could not be finished.');
      return undefined;
    } finally {
      if (objectUrl?.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
      try { if (file?.exists) file.delete(); } catch { /* The cache may already have been cleared. */ }
    }
  }, [recorder, stop]);

  const level = recorderState.metering ?? baselineRef.current;
  return {
    active: recorderState.isRecording,
    band: classifyRelativeLevel(level, baselineRef.current),
    baselineDecibels: baselineRef.current,
    durationMs: recorderState.durationMillis,
    error,
    finishWhisper,
    levelDecibels: level,
    permissionDenied,
    samples: samplesRef.current,
    start,
    stop,
  };
}

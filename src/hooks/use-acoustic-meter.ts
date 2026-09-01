import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';

import { classifyRelativeLevel } from '@/src/domain/acoustic-envelope';

export interface AcousticSample {
  at: number;
  decibels: number;
}

export interface WhisperPayload {
  base64: string;
  byteSize: number;
  durationMs: number;
  mimeType: 'audio/mp4';
}

const meterOptions = {
  ...RecordingPresets.LOW_QUALITY,
  android: {
    ...RecordingPresets.LOW_QUALITY.android,
    extension: '.m4a',
    outputFormat: 'mpeg4' as const,
    audioEncoder: 'aac' as const,
  },
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
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setPermissionDenied(true);
      return false;
    }
    try {
      setPermissionDenied(false);
      samplesRef.current = [];
      baselineRef.current = -48;
      await setAudioModeAsync({
        allowsRecording: true,
        interruptionMode: 'doNotMix',
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
      await recorder.prepareToRecordAsync();
      recorder.record(
        maximumDurationSeconds ? { forDuration: maximumDurationSeconds } : undefined,
      );
      return true;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The microphone could not start.');
      return false;
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    try {
      if (recorder.getStatus().isRecording) await recorder.stop();
    } finally {
      await setAudioModeAsync({
        allowsRecording: false,
        interruptionMode: 'mixWithOthers',
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      }).catch(() => undefined);
    }
    return [...samplesRef.current];
  }, [recorder]);

  const finishWhisper = useCallback(async (): Promise<WhisperPayload | undefined> => {
    const durationMs = recorder.getStatus().durationMillis;
    await stop();
    const uri = recorder.uri;
    if (!uri) {
      setError('The one-time whisper did not produce an audio file.');
      return undefined;
    }
    const file = new File(uri);
    try {
      const info = file.info();
      const byteSize = info.size ?? 0;
      if (byteSize <= 0 || byteSize > 96 * 1024) {
        setError('The whisper was too large. Hold for less than two seconds.');
        return undefined;
      }
      return {
        base64: await file.base64(),
        byteSize,
        durationMs: Math.min(1_900, Math.max(0, durationMs)),
        mimeType: 'audio/mp4',
      };
    } finally {
      if (file.exists) file.delete();
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

import { useCallback, useEffect, useRef, useState } from 'react';

import type { EvidenceKind } from '@/src/domain';
import {
  classifyMotionTrace,
  ExpoSensorProvider,
  selectExpectedMotionEvidence,
  type Classification,
  type MotionSample,
} from '@/src/services/sensors';

export interface TerminalMotionSnapshot {
  available: boolean | null;
  active: boolean;
  denied: boolean;
  flatness: number;
  steadiness: number;
  tiltX: number;
  tiltY: number;
  lastEvidence?: Classification;
}

const initialSnapshot: TerminalMotionSnapshot = {
  available: null,
  active: false,
  denied: false,
  flatness: 0,
  steadiness: 0,
  tiltX: 0,
  tiltY: 0,
};

/**
 * Converts Expo DeviceMotion samples into stable UI telemetry and semantic
 * evidence. Raw readings stay on-device and are discarded after 2.4 seconds.
 */
export function useTerminalMotion(
  onEvidence?: (evidence: Classification) => void,
  expectedKinds: readonly EvidenceKind[] = [],
) {
  const providerRef = useRef<ExpoSensorProvider | null>(null);
  const samplesRef = useRef<MotionSample[]>([]);
  const lastEvidenceRef = useRef<Record<string, number>>({});
  const expectedKindsRef = useRef<readonly EvidenceKind[]>(expectedKinds);
  const onEvidenceRef = useRef(onEvidence);
  const lastUiUpdateRef = useRef(0);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const expectedKindsKey = expectedKinds.join('|');
  expectedKindsRef.current = expectedKinds;

  useEffect(() => {
    onEvidenceRef.current = onEvidence;
  }, [onEvidence]);

  useEffect(() => {
    samplesRef.current = [];
    lastEvidenceRef.current = {};
    setSnapshot((current) => ({ ...current, lastEvidence: undefined }));
  }, [expectedKindsKey]);

  useEffect(() => {
    const provider = new ExpoSensorProvider({
      updateIntervalMs: 50,
      declareCameraQr: true,
      declareHaptics: true,
    });
    providerRef.current = provider;
    let disposed = false;

    void provider.probe().then((availability) => {
      if (!disposed) {
        setSnapshot((current) => ({
          ...current,
          available: availability.capabilities.includes('motion'),
        }));
      }
    });

    const unsubscribe = provider.subscribe((event) => {
      if (event.stream !== 'motion') return;
      const sample = event.sample;
      const samples = samplesRef.current;
      samples.push(sample);
      const cutoff = sample.timestampMs - 2_400;
      while (samples.length > 0 && samples[0].timestampMs < cutoff) samples.shift();

      const magnitude = Math.max(0.001, Math.hypot(sample.x, sample.y, sample.z));
      const flatness = Math.min(1, Math.abs(sample.z) / magnitude);
      const recent = samples.slice(-12);
      const magnitudes = recent.map((item) => Math.hypot(item.x, item.y, item.z));
      const mean = magnitudes.reduce((sum, value) => sum + value, 0) / Math.max(1, magnitudes.length);
      const deviation = Math.sqrt(
        magnitudes.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
          Math.max(1, magnitudes.length),
      );
      const steadiness = Math.max(0, Math.min(1, 1 - deviation / 1.4));
      const classifications = classifyMotionTrace(samples);
      const evidence = selectExpectedMotionEvidence(classifications, expectedKindsRef.current);

      if (evidence) {
        const previous = lastEvidenceRef.current[evidence.kind] ?? 0;
        if (evidence.observedAt - previous >= 800) {
          lastEvidenceRef.current[evidence.kind] = evidence.observedAt;
          onEvidenceRef.current?.(evidence);
        }
      }

      // Classification keeps the 20 Hz trace, while visual telemetry is capped
      // near 10 Hz so a sensor puzzle does not rerender the entire mission tree.
      if (evidence || sample.timestampMs - lastUiUpdateRef.current >= 100) {
        lastUiUpdateRef.current = sample.timestampMs;
        setSnapshot((current) => ({
          ...current,
          active: true,
          flatness,
          steadiness,
          tiltX: Math.max(-1, Math.min(1, sample.x / 7)),
          tiltY: Math.max(-1, Math.min(1, sample.y / 7)),
          lastEvidence: evidence ?? current.lastEvidence,
        }));
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
      void provider.stop();
    };
  }, []);

  const start = useCallback(async () => {
    try {
      await providerRef.current?.start(['motion']);
      setSnapshot((current) => ({ ...current, active: true, denied: false }));
      return true;
    } catch {
      setSnapshot((current) => ({ ...current, active: false, denied: true }));
      return false;
    }
  }, []);

  const stop = useCallback(async () => {
    await providerRef.current?.stop();
    samplesRef.current = [];
    setSnapshot((current) => ({ ...current, active: false }));
  }, []);

  const matches = useCallback(
    (kind: EvidenceKind, minimumConfidence = 0.6) =>
      snapshot.lastEvidence?.kind === kind &&
      snapshot.lastEvidence.confidence >= minimumConfidence,
    [snapshot.lastEvidence],
  );

  return { ...snapshot, matches, start, stop };
}

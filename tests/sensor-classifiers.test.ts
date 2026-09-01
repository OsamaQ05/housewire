import { describe, expect, it } from 'vitest';
import {
  classifyAudioTrace,
  classifyLightTrace,
  classifyMotionTrace,
  selectExpectedMotionEvidence,
} from '../src/services/sensors/classifiers';
import type { AudioLevelSample, MotionSample } from '../src/services/sensors/types';

const motionSample = (
  index: number,
  values: Partial<Omit<MotionSample, 'timestampMs'>> = {},
): MotionSample => ({
  timestampMs: index * 50,
  x: 0,
  y: 0,
  z: 9.80665,
  alpha: 0,
  beta: 0,
  gamma: 0,
  ...values,
});

describe('sensor trace classifiers', () => {
  it('recognizes a deliberate receiver lift', () => {
    const samples = Array.from({ length: 36 }, (_, index) => {
      if (index < 8) return motionSample(index);
      if (index < 26) {
        return motionSample(index, {
          x: Math.sin(index * 0.7) * 1.6,
          y: Math.cos(index * 0.5) * 0.8,
          z: 9.80665 + Math.sin(index * 0.45) * 1.1,
          alpha: (index - 8) / 20,
        });
      }
      return motionSample(index, { alpha: 0.9 });
    });
    const classifications = classifyMotionTrace(samples);
    expect(classifications).toContainEqual(expect.objectContaining({ kind: 'LIFTED' }));
    expect(selectExpectedMotionEvidence(classifications, ['LIFTED'])).toMatchObject({ kind: 'LIFTED' });
  });

  it('selects the stage-requested class when another plausible motion ranks higher', () => {
    const candidates = [
      { kind: 'PLACED_FLAT', confidence: 0.95, startedAt: 0, observedAt: 1, features: {} },
      { kind: 'LIFTED', confidence: 0.79, startedAt: 0, observedAt: 1, features: {} },
    ] as const;
    expect(selectExpectedMotionEvidence(candidates, ['LIFTED'])).toMatchObject({ kind: 'LIFTED' });
    expect(selectExpectedMotionEvidence(candidates, ['CARRY_STEADY'])).toBeUndefined();
  });

  it('distinguishes steady carrying from violent shaking', () => {
    const carry = Array.from({ length: 42 }, (_, index) =>
      motionSample(index, {
        x: Math.sin(index * 0.38) * 0.85,
        y: Math.cos(index * 0.31) * 0.42,
        z: 9.80665 + Math.sin(index * 0.27) * 0.55,
      }),
    );
    const shake = Array.from({ length: 24 }, (_, index) =>
      motionSample(index, {
        x: (index % 2 === 0 ? 1 : -1) * 5.5,
        y: (index % 3 === 0 ? 1 : -1) * 2,
        z: 9.80665,
      }),
    );
    expect(classifyMotionTrace(carry)).toContainEqual(expect.objectContaining({ kind: 'CARRY_STEADY' }));
    expect(classifyMotionTrace(shake)).toContainEqual(expect.objectContaining({ kind: 'SHAKE_PATTERN' }));
    expect(classifyMotionTrace(shake).some((item) => item.kind === 'CARRY_STEADY')).toBe(false);
  });

  it('emits epoch evidence time while preserving monotonic motion-window math', () => {
    const uptimeStart = 4_500_000;
    const currentEpoch = 1_800_000_000_000;
    const carry = Array.from({ length: 42 }, (_, index) => ({
      ...motionSample(index, {
        x: Math.sin(index * 0.38) * 0.85,
        y: Math.cos(index * 0.31) * 0.42,
        z: 9.80665 + Math.sin(index * 0.27) * 0.55,
      }),
      timestampMs: uptimeStart + index * 50,
    }));

    const evidence = classifyMotionTrace(carry, { now: () => currentEpoch }).find(
      (candidate) => candidate.kind === 'CARRY_STEADY',
    );

    expect(evidence).toBeDefined();
    expect(evidence?.observedAt).toBe(currentEpoch);
    expect(evidence?.observedAt).toBeGreaterThan(1_000_000_000_000);
    expect(evidence?.startedAt).toBe(uptimeStart);
    expect(evidence?.features.durationMs).toBe((carry.length - 1) * 50);
  });

  it('recognizes synchronized hang-up placement and stillness', () => {
    const placed = Array.from({ length: 34 }, (_, index) => {
      if (index < 15) {
        return motionSample(index, { x: 2 * Math.sin(index), z: 7.5 + Math.cos(index) });
      }
      return motionSample(index, { x: 0.01 * Math.sin(index), y: 0.01 * Math.cos(index), z: 9.80665 });
    });
    const kinds = classifyMotionTrace(placed).map((item) => item.kind);
    expect(kinds).toContain('PLACED_FLAT');
  });

  it('detects quiet windows and isolated claps from metering without recording speech', () => {
    const quiet: AudioLevelSample[] = Array.from({ length: 28 }, (_, index) => ({
      timestampMs: index * 100,
      decibels: -52 + Math.sin(index) * 0.5,
    }));
    const clap: AudioLevelSample[] = quiet.map((sample, index) => ({
      ...sample,
      decibels: index === 14 ? -21 : sample.decibels,
    }));
    expect(classifyAudioTrace(quiet)).toContainEqual(expect.objectContaining({ kind: 'QUIET_WINDOW' }));
    expect(classifyAudioTrace(clap)).toContainEqual(expect.objectContaining({ kind: 'CLAP_PATTERN' }));
  });

  it('uses logarithmic lux change so device ranges do not dominate', () => {
    const samples = Array.from({ length: 12 }, (_, index) => ({
      timestampMs: index * 100,
      illuminance: index < 6 ? 12 + index * 0.1 : 180 + index,
    }));
    expect(classifyLightTrace(samples)[0]).toMatchObject({ kind: 'LIGHT_CHANGED' });
  });

  it('rejects traces with reversed timestamps', () => {
    const invalid = [motionSample(0), motionSample(2), motionSample(1), ...Array.from({ length: 5 }, (_, index) => motionSample(index + 3))];
    expect(classifyMotionTrace(invalid)).toEqual([]);
  });
});

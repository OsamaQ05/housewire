import { describe, expect, it } from 'vitest';
import { classifyMotionTrace, extractMotionFeatures } from '../src/services/sensors/classifiers';
import { inferMotionIntent, MOTION_INTENTS } from '../src/services/sensors/motion-intent-model';
import type { MotionSample } from '../src/services/sensors/types';

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

function liftTrace(): MotionSample[] {
  return Array.from({ length: 36 }, (_, index) => {
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
}

function carryTrace(): MotionSample[] {
  return Array.from({ length: 42 }, (_, index) =>
    motionSample(index, {
      x: Math.sin(index * 0.38) * 0.85,
      y: Math.cos(index * 0.31) * 0.42,
      z: 9.80665 + Math.sin(index * 0.27) * 0.55,
    }),
  );
}

function placeTrace(): MotionSample[] {
  return Array.from({ length: 34 }, (_, index) =>
    index < 15
      ? motionSample(index, { x: 2 * Math.sin(index), z: 7.5 + Math.cos(index) })
      : motionSample(index, {
          x: 0.01 * Math.sin(index),
          y: 0.01 * Math.cos(index),
          z: 9.80665,
        }),
  );
}

function shakeTrace(): MotionSample[] {
  return Array.from({ length: 24 }, (_, index) =>
    motionSample(index, {
      x: (index % 2 === 0 ? 1 : -1) * 5.5,
      y: (index % 3 === 0 ? 1 : -1) * 2,
      z: 9.80665,
    }),
  );
}

describe('physics-authored motion intent model', () => {
  it.each([
    ['LIFTED', liftTrace()],
    ['CARRY_STEADY', carryTrace()],
    ['PLACED_FLAT', placeTrace()],
  ] as const)('ranks %s above the other known intents', (expectedIntent, trace) => {
    const inference = inferMotionIntent(extractMotionFeatures(trace));
    const expectedScore = inference.scores[expectedIntent];
    const competitorScores = MOTION_INTENTS.filter((intent) => intent !== expectedIntent).map(
      (intent) => inference.scores[intent],
    );

    expect(inference.winner).toBe(expectedIntent);
    expect(expectedScore.probability).toBeGreaterThan(Math.max(...competitorScores.map((score) => score.probability)));
    expect(expectedScore.similarity).toBeGreaterThan(Math.max(...competitorScores.map((score) => score.similarity)));
    expect(expectedScore.margin).toBeGreaterThan(0);
  });

  it.each([[liftTrace()], [carryTrace()], [placeTrace()], [shakeTrace()]])(
    'keeps every open-set probability and similarity bounded',
    (trace) => {
      const inference = inferMotionIntent(extractMotionFeatures(trace));
      const knownProbability = MOTION_INTENTS.reduce(
        (sum, intent) => sum + inference.scores[intent].probability,
        0,
      );

      for (const intent of MOTION_INTENTS) {
        const score = inference.scores[intent];
        expect(score.probability).toBeGreaterThanOrEqual(0);
        expect(score.probability).toBeLessThanOrEqual(1);
        expect(score.similarity).toBeGreaterThanOrEqual(0);
        expect(score.similarity).toBeLessThanOrEqual(1);
        expect(score.distance).toBeGreaterThanOrEqual(0);
      }
      expect(inference.unknownProbability).toBeGreaterThanOrEqual(0);
      expect(inference.unknownProbability).toBeLessThanOrEqual(1);
      expect(knownProbability + inference.unknownProbability).toBeCloseTo(1, 12);
    },
  );

  it('materially calibrates accepted classifications and exposes local model diagnostics', () => {
    for (const [kind, trace] of [
      ['LIFTED', liftTrace()],
      ['CARRY_STEADY', carryTrace()],
      ['PLACED_FLAT', placeTrace()],
    ] as const) {
      const candidate = classifyMotionTrace(trace).find((item) => item.kind === kind);
      expect(candidate).toBeDefined();
      expect(candidate!.features.intentModelSelectedProbability).toBeGreaterThan(0);
      expect(candidate!.features.intentModelSelectedSimilarity).toBeGreaterThan(0);
      expect(candidate!.features.intentModelSelectedMargin).toBeGreaterThan(0);
      expect(candidate!.confidence).not.toBe(candidate!.features.intentModelHeuristicConfidence);
    }
  });

  it('treats violent alternating motion as out-of-distribution instead of lift/carry/place', () => {
    const trace = shakeTrace();
    const inference = inferMotionIntent(extractMotionFeatures(trace));
    const classifications = classifyMotionTrace(trace);

    expect(inference.unknownProbability).toBeGreaterThan(
      Math.max(...MOTION_INTENTS.map((intent) => inference.scores[intent].probability)),
    );
    expect(inference.winner).toBe('UNKNOWN');
    expect(classifications).toContainEqual(expect.objectContaining({ kind: 'SHAKE_PATTERN' }));
    expect(classifications[0].features.intentModelUnknownWins).toBe(1);
    expect(classifications.some((item) => MOTION_INTENTS.includes(item.kind as (typeof MOTION_INTENTS)[number]))).toBe(false);
  });
});

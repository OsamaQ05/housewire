import type { EvidenceKind } from '../../domain/types';
import {
  clamp01,
  countSignChanges,
  mean,
  median,
  medianAbsoluteDeviation,
  percentile,
  rootMeanSquare,
  standardDeviation,
  unwrapAngles,
  vectorMagnitude,
} from './signal-math';
import {
  calibrateMotionIntentConfidence,
  inferMotionIntent,
  motionIntentDiagnostics,
  type MotionIntent,
} from './motion-intent-model';
import type { AudioLevelSample, Classification, LightSample, MotionSample } from './types';

const GRAVITY = 9.80665;

function validTimestamps(samples: readonly { timestampMs: number }[]): boolean {
  return samples.every((sample, index) => index === 0 || sample.timestampMs > samples[index - 1].timestampMs);
}

function classification(
  kind: EvidenceKind,
  confidence: number,
  samples: readonly { timestampMs: number }[],
  features: Readonly<Record<string, number>>,
): Classification {
  return {
    kind,
    confidence: clamp01(confidence),
    startedAt: samples[0]?.timestampMs ?? 0,
    observedAt: samples.at(-1)?.timestampMs ?? 0,
    features,
  };
}

export interface MotionFeatures {
  durationMs: number;
  magnitudeMean: number;
  magnitudeStd: number;
  accelerationEnergy: number;
  jerkRms: number;
  axisSignChanges: number;
  rotationDelta: number;
  rotationJitter: number;
  finalFlatness: number;
  earlyStillness: number;
  lateStillness: number;
}

export function extractMotionFeatures(samples: readonly MotionSample[]): MotionFeatures {
  if (samples.length < 2 || !validTimestamps(samples)) {
    return {
      durationMs: 0,
      magnitudeMean: 0,
      magnitudeStd: 0,
      accelerationEnergy: 0,
      jerkRms: 0,
      axisSignChanges: 0,
      rotationDelta: 0,
      rotationJitter: 0,
      finalFlatness: 0,
      earlyStillness: 0,
      lateStillness: 0,
    };
  }

  const magnitudes = samples.map((sample) => vectorMagnitude(sample.x, sample.y, sample.z));
  const adjusted = magnitudes.map((value) => value - GRAVITY);
  const jerks: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const deltaSeconds = Math.max(0.001, (samples[index].timestampMs - samples[index - 1].timestampMs) / 1_000);
    const dx = (samples[index].x - samples[index - 1].x) / deltaSeconds;
    const dy = (samples[index].y - samples[index - 1].y) / deltaSeconds;
    const dz = (samples[index].z - samples[index - 1].z) / deltaSeconds;
    jerks.push(vectorMagnitude(dx, dy, dz));
  }

  const rotationAxes = [
    unwrapAngles(samples.map((sample) => sample.alpha ?? 0)),
    unwrapAngles(samples.map((sample) => sample.beta ?? 0)),
    unwrapAngles(samples.map((sample) => sample.gamma ?? 0)),
  ];
  const rotationDeltas = rotationAxes.map((axis) => Math.abs((axis.at(-1) ?? 0) - (axis[0] ?? 0)));
  const rotationSteps = rotationAxes.flatMap((axis) => axis.slice(1).map((value, index) => value - axis[index]));
  const tailCount = Math.max(2, Math.floor(samples.length * 0.22));
  const final = samples.slice(-tailCount);
  const finalGravity = mean(final.map((sample) => vectorMagnitude(sample.x, sample.y, sample.z))) || GRAVITY;
  const finalFlatness = mean(final.map((sample) => Math.abs(sample.z) / finalGravity));
  const windowCount = Math.max(2, Math.floor(samples.length * 0.2));
  const earlyStillness = 1 - clamp01(standardDeviation(magnitudes.slice(0, windowCount)) / 0.75);
  const lateStillness = 1 - clamp01(standardDeviation(magnitudes.slice(-windowCount)) / 0.75);

  return {
    durationMs: samples.at(-1)!.timestampMs - samples[0].timestampMs,
    magnitudeMean: mean(magnitudes),
    magnitudeStd: standardDeviation(magnitudes),
    accelerationEnergy: rootMeanSquare(adjusted),
    jerkRms: rootMeanSquare(jerks),
    axisSignChanges: Math.max(
      countSignChanges(samples.map((sample) => sample.x), 1.25),
      countSignChanges(samples.map((sample) => sample.y), 1.25),
      countSignChanges(samples.map((sample) => sample.z - GRAVITY), 1.25),
    ),
    rotationDelta: Math.max(...rotationDeltas),
    rotationJitter: medianAbsoluteDeviation(rotationSteps),
    finalFlatness,
    earlyStillness,
    lateStillness,
  };
}

export interface MotionClassifierOptions {
  /** Wall-clock boundary for emitted mission evidence; injectable for deterministic tests. */
  now?: () => number;
}

/** Returns every plausible semantic event, strongest first. Consumers select the expected kind. */
export function classifyMotionTrace(
  samples: readonly MotionSample[],
  options: MotionClassifierOptions = {},
): readonly Classification[] {
  if (samples.length < 6 || !validTimestamps(samples)) return [];
  const features = extractMotionFeatures(samples);
  const intentInference = inferMotionIntent(features);
  const featureRecord = { ...features, ...motionIntentDiagnostics(intentInference) };
  const candidates: Classification[] = [];

  const intentClassification = (kind: MotionIntent, heuristicConfidence: number): Classification => {
    const score = intentInference.scores[kind];
    return classification(kind, calibrateMotionIntentConfidence(heuristicConfidence, score), samples, {
      ...featureRecord,
      intentModelHeuristicConfidence: clamp01(heuristicConfidence),
      intentModelSelectedDistance: score.distance,
      intentModelSelectedSimilarity: score.similarity,
      intentModelSelectedProbability: score.probability,
      intentModelSelectedMargin: score.margin,
    });
  };

  if (features.durationMs >= 1_100 && features.magnitudeStd <= 0.34 && features.jerkRms <= 7.5) {
    const confidence =
      0.55 +
      (1 - clamp01(features.magnitudeStd / 0.34)) * 0.25 +
      (1 - clamp01(features.jerkRms / 7.5)) * 0.2;
    candidates.push(classification('STILL_HOLD', confidence, samples, featureRecord));
  }

  if (features.rotationDelta >= 0.62 && features.rotationJitter <= 0.32 && features.lateStillness >= 0.55) {
    const confidence =
      0.55 + clamp01((features.rotationDelta - 0.62) / 0.95) * 0.3 + features.lateStillness * 0.15;
    candidates.push(classification('ROTATED_TO_TARGET', confidence, samples, featureRecord));
  }

  if (
    features.durationMs >= 900 &&
    features.earlyStillness >= 0.62 &&
    features.lateStillness >= 0.58 &&
    (features.rotationDelta >= 0.35 || features.accelerationEnergy >= 0.55)
  ) {
    const confidence =
      0.48 +
      features.earlyStillness * 0.14 +
      features.lateStillness * 0.14 +
      clamp01((features.accelerationEnergy - 0.35) / 1.8) * 0.24;
    candidates.push(intentClassification('LIFTED', confidence));
  }

  if (
    features.durationMs >= 1_200 &&
    features.accelerationEnergy >= 0.28 &&
    features.accelerationEnergy <= 3.2 &&
    features.jerkRms >= 3 &&
    features.jerkRms <= 48 &&
    features.axisSignChanges <= 9
  ) {
    const energyCenterFit = 1 - clamp01(Math.abs(features.accelerationEnergy - 1.15) / 2.1);
    const confidence = 0.52 + energyCenterFit * 0.3 + features.lateStillness * 0.1;
    candidates.push(intentClassification('CARRY_STEADY', confidence));
  }

  if (features.durationMs >= 450 && features.jerkRms >= 25 && features.axisSignChanges >= 4) {
    const confidence =
      0.5 + clamp01((features.jerkRms - 25) / 65) * 0.25 + clamp01((features.axisSignChanges - 4) / 8) * 0.25;
    candidates.push(classification('SHAKE_PATTERN', confidence, samples, featureRecord));
  }

  if (features.finalFlatness >= 0.9 && features.lateStillness >= 0.72 && features.accelerationEnergy >= 0.22) {
    const confidence = 0.52 + clamp01((features.finalFlatness - 0.9) / 0.1) * 0.25 + features.lateStillness * 0.18;
    candidates.push(intentClassification('PLACED_FLAT', confidence));
  }

  const emittedObservedAt = (options.now ?? Date.now)();
  return candidates
    .filter((item) => item.confidence >= 0.5)
    .sort((a, b) => b.confidence - a.confidence)
    .map((candidate) => ({ ...candidate, observedAt: emittedObservedAt }));
}

/**
 * A mission stage asks for one semantic action. Selecting that class explicitly
 * prevents a different, simultaneously plausible motion (for example a flat
 * phone at the end of a lift) from hiding the evidence the stage requested.
 */
export function selectExpectedMotionEvidence(
  classifications: readonly Classification[],
  expectedKinds: readonly EvidenceKind[],
): Classification | undefined {
  if (expectedKinds.length === 0) return classifications[0];
  return classifications.find((candidate) => expectedKinds.includes(candidate.kind));
}

export interface AudioClassifierOptions {
  baselineDecibels?: number;
  minimumQuietDurationMs?: number;
}

export function classifyAudioTrace(
  samples: readonly AudioLevelSample[],
  options: AudioClassifierOptions = {},
): readonly Classification[] {
  if (samples.length < 8 || !validTimestamps(samples)) return [];
  const levels = samples.map((sample) => sample.decibels);
  const baselineCount = Math.max(4, Math.floor(samples.length * 0.2));
  const baseline = options.baselineDecibels ?? median(levels.slice(0, baselineCount));
  const peak = Math.max(...levels);
  const peakDelta = peak - baseline;
  const peakThreshold = peak - 6;
  const peakSamples = samples.filter((sample) => sample.decibels >= peakThreshold);
  const peakWidthMs = peakSamples.length < 2 ? 0 : peakSamples.at(-1)!.timestampMs - peakSamples[0].timestampMs;
  const p90 = percentile(levels, 0.9);
  const variability = medianAbsoluteDeviation(levels);
  const durationMs = samples.at(-1)!.timestampMs - samples[0].timestampMs;
  const features = { baseline, peak, peakDelta, peakWidthMs, p90, variability, durationMs };
  const candidates: Classification[] = [];

  if (peakDelta >= 15 && peakWidthMs <= 320) {
    const confidence = 0.58 + clamp01((peakDelta - 15) / 22) * 0.3 + (1 - clamp01(peakWidthMs / 320)) * 0.12;
    candidates.push(classification('CLAP_PATTERN', confidence, samples, features));
  }

  const quietDuration = options.minimumQuietDurationMs ?? 2_000;
  if (durationMs >= quietDuration && p90 <= baseline + 5 && variability <= 2.8) {
    const confidence =
      0.58 + (1 - clamp01((p90 - baseline) / 5)) * 0.22 + (1 - clamp01(variability / 2.8)) * 0.2;
    candidates.push(classification('QUIET_WINDOW', confidence, samples, features));
  }

  const peakIndexes = levels
    .map((level, index) => ({ level, index }))
    .filter(({ level, index }) => index > 0 && index < levels.length - 1 && level > baseline + 11 && level >= levels[index - 1] && level > levels[index + 1])
    .map(({ index }) => index);
  if (peakIndexes.length >= 3) {
    const intervals = peakIndexes.slice(1).map((index, offset) => samples[index].timestampMs - samples[peakIndexes[offset]].timestampMs);
    const intervalMean = mean(intervals);
    const intervalVariation = intervalMean === 0 ? 1 : standardDeviation(intervals) / intervalMean;
    if (intervalVariation <= 0.22) {
      candidates.push(
        classification('RHYTHM_MATCHED', 0.62 + (1 - clamp01(intervalVariation / 0.22)) * 0.3, samples, {
          ...features,
          peakCount: peakIndexes.length,
          intervalMean,
          intervalVariation,
        }),
      );
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

export function classifyLightTrace(samples: readonly LightSample[]): readonly Classification[] {
  if (samples.length < 6 || !validTimestamps(samples)) return [];
  const split = Math.floor(samples.length / 2);
  const before = median(samples.slice(0, split).map((sample) => Math.log1p(Math.max(0, sample.illuminance))));
  const after = median(samples.slice(split).map((sample) => Math.log1p(Math.max(0, sample.illuminance))));
  const logLuxDelta = Math.abs(after - before);
  if (logLuxDelta < 0.8) return [];
  return [
    classification('LIGHT_CHANGED', 0.6 + clamp01((logLuxDelta - 0.8) / 2.2) * 0.38, samples, {
      beforeLogLux: before,
      afterLogLux: after,
      logLuxDelta,
    }),
  ];
}

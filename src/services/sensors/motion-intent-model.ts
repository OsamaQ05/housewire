import type { MotionFeatures } from './classifiers';

export const MOTION_INTENTS = ['LIFTED', 'CARRY_STEADY', 'PLACED_FLAT'] as const;

export type MotionIntent = (typeof MOTION_INTENTS)[number];

interface PrototypeDimension {
  readonly feature: keyof MotionFeatures;
  readonly center: number;
  readonly scale: number;
  readonly weight: number;
}

/**
 * These compact reference profiles are authored from phone-motion physics and
 * calibrated against deterministic traces. They are not learned parameters or
 * a claim of model training.
 */
const PHYSICS_AUTHORED_PROTOTYPES: Readonly<Record<MotionIntent, readonly PrototypeDimension[]>> = {
  LIFTED: [
    { feature: 'durationMs', center: 1_700, scale: 850, weight: 0.45 },
    { feature: 'magnitudeStd', center: 0.58, scale: 0.48, weight: 0.7 },
    { feature: 'accelerationEnergy', center: 0.72, scale: 0.72, weight: 0.8 },
    { feature: 'jerkRms', center: 15, scale: 13, weight: 1.05 },
    { feature: 'axisSignChanges', center: 3, scale: 3.5, weight: 0.65 },
    { feature: 'rotationDelta', center: 0.86, scale: 0.42, weight: 2.25 },
    { feature: 'finalFlatness', center: 0.9, scale: 0.3, weight: 0.25 },
    { feature: 'earlyStillness', center: 0.94, scale: 0.3, weight: 0.85 },
    { feature: 'lateStillness', center: 0.9, scale: 0.3, weight: 0.85 },
  ],
  CARRY_STEADY: [
    { feature: 'durationMs', center: 2_200, scale: 1_050, weight: 0.5 },
    { feature: 'magnitudeStd', center: 0.44, scale: 0.38, weight: 1.05 },
    { feature: 'accelerationEnergy', center: 0.62, scale: 0.62, weight: 1.05 },
    { feature: 'jerkRms', center: 8.5, scale: 9.5, weight: 1.3 },
    { feature: 'axisSignChanges', center: 1.5, scale: 4, weight: 1.1 },
    { feature: 'rotationDelta', center: 0.12, scale: 0.34, weight: 1.05 },
    { feature: 'finalFlatness', center: 0.82, scale: 0.38, weight: 0.15 },
    { feature: 'earlyStillness', center: 0.58, scale: 0.42, weight: 0.3 },
    { feature: 'lateStillness', center: 0.58, scale: 0.42, weight: 0.3 },
  ],
  PLACED_FLAT: [
    { feature: 'durationMs', center: 1_600, scale: 900, weight: 0.4 },
    { feature: 'magnitudeStd', center: 1.05, scale: 0.72, weight: 0.65 },
    { feature: 'accelerationEnergy', center: 1.35, scale: 0.85, weight: 0.8 },
    { feature: 'jerkRms', center: 20, scale: 15, weight: 0.8 },
    { feature: 'axisSignChanges', center: 3, scale: 4.5, weight: 0.45 },
    { feature: 'rotationDelta', center: 0.25, scale: 0.72, weight: 0.25 },
    { feature: 'finalFlatness', center: 0.985, scale: 0.1, weight: 1.45 },
    { feature: 'earlyStillness', center: 0.22, scale: 0.3, weight: 1.9 },
    { feature: 'lateStillness', center: 0.96, scale: 0.12, weight: 2.05 },
  ],
};

const UNKNOWN_RBF_MASS = 0.12;
const MAX_STANDARDIZED_RESIDUAL = 6;

export interface MotionIntentScore {
  readonly intent: MotionIntent;
  /** Weighted, scale-normalized Euclidean distance from the intent prototype. */
  readonly distance: number;
  /** Radial-basis similarity in [0, 1]. */
  readonly similarity: number;
  /** Open-set probability in [0, 1]; remaining mass can belong to unknown motion. */
  readonly probability: number;
  /** This class probability minus the strongest competing known class. */
  readonly margin: number;
}

export interface MotionIntentInference {
  readonly winner: MotionIntent | 'UNKNOWN';
  readonly unknownProbability: number;
  readonly scores: Readonly<Record<MotionIntent, MotionIntentScore>>;
}

function prototypeDistance(features: MotionFeatures, dimensions: readonly PrototypeDimension[]): number {
  let weightedSquaredDistance = 0;
  let totalWeight = 0;

  for (const dimension of dimensions) {
    const value = features[dimension.feature];
    const residual = Math.min(
      MAX_STANDARDIZED_RESIDUAL,
      Math.abs(value - dimension.center) / Math.max(0.0001, dimension.scale),
    );
    weightedSquaredDistance += residual ** 2 * dimension.weight;
    totalWeight += dimension.weight;
  }

  return Math.sqrt(weightedSquaredDistance / Math.max(0.0001, totalWeight));
}

/** Runs a tiny nearest-prototype / radial-basis intent model entirely on device. */
export function inferMotionIntent(features: MotionFeatures): MotionIntentInference {
  const raw = MOTION_INTENTS.map((intent) => {
    const distance = prototypeDistance(features, PHYSICS_AUTHORED_PROTOTYPES[intent]);
    return { intent, distance, similarity: Math.exp(-0.5 * distance ** 2) };
  });
  const normalization = UNKNOWN_RBF_MASS + raw.reduce((sum, item) => sum + item.similarity, 0);
  const probabilities = raw.map((item) => ({ ...item, probability: item.similarity / normalization }));
  const knownWinner = [...probabilities].sort((a, b) => b.probability - a.probability)[0];
  const unknownProbability = UNKNOWN_RBF_MASS / normalization;
  const winner = unknownProbability > knownWinner.probability ? 'UNKNOWN' : knownWinner.intent;

  const entries = probabilities.map((item) => {
    const strongestCompetitor = Math.max(
      ...probabilities.filter((other) => other.intent !== item.intent).map((other) => other.probability),
      unknownProbability,
    );
    return [
      item.intent,
      {
        ...item,
        margin: item.probability - strongestCompetitor,
      } satisfies MotionIntentScore,
    ] as const;
  });

  return {
    winner,
    unknownProbability,
    scores: Object.fromEntries(entries) as Record<MotionIntent, MotionIntentScore>,
  };
}

/** Numeric diagnostic fields travel with accepted evidence for local inspection. */
export function motionIntentDiagnostics(inference: MotionIntentInference): Readonly<Record<string, number>> {
  return {
    intentModelLiftedDistance: inference.scores.LIFTED.distance,
    intentModelLiftedSimilarity: inference.scores.LIFTED.similarity,
    intentModelLiftedProbability: inference.scores.LIFTED.probability,
    intentModelCarrySteadyDistance: inference.scores.CARRY_STEADY.distance,
    intentModelCarrySteadySimilarity: inference.scores.CARRY_STEADY.similarity,
    intentModelCarrySteadyProbability: inference.scores.CARRY_STEADY.probability,
    intentModelPlacedFlatDistance: inference.scores.PLACED_FLAT.distance,
    intentModelPlacedFlatSimilarity: inference.scores.PLACED_FLAT.similarity,
    intentModelPlacedFlatProbability: inference.scores.PLACED_FLAT.probability,
    intentModelUnknownProbability: inference.unknownProbability,
    intentModelUnknownWins: inference.winner === 'UNKNOWN' ? 1 : 0,
  };
}

/** Blends rule confidence with prototype evidence; physical guards still decide eligibility. */
export function calibrateMotionIntentConfidence(
  heuristicConfidence: number,
  score: MotionIntentScore,
): number {
  const positiveMargin = Math.max(0, score.margin);
  const modelSupport = score.similarity * 0.5 + score.probability * 0.38 + positiveMargin * 0.12;
  return Math.max(0, Math.min(1, heuristicConfidence * 0.5 + modelSupport * 0.5));
}

export interface CompletedRunSignal {
  durationSeconds: number;
  retries: number;
}

export interface DifficultyInferenceInput {
  attempts: number;
  secondsSinceProgress: number;
  sensorAvailable: boolean;
  meanRejectedConfidence?: number;
  expectedConfidence?: number;
  stageIndex?: number;
  history?: readonly CompletedRunSignal[];
}

export interface DifficultyInference {
  struggleProbability: number;
  learnedSkill: number;
  hintAfterSeconds: number;
  preferManualFallback: boolean;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value));

/**
 * Learns a bounded skill prior from completed household runs. A Beta posterior
 * keeps one unusually good or bad game from over-personalizing the next one.
 */
export function learnHouseholdSkill(history: readonly CompletedRunSignal[] = []): number {
  let successMass = 2;
  let struggleMass = 2;
  for (const run of history.slice(0, 12)) {
    const pace = clamp01(1 - (run.durationSeconds - 240) / 720);
    const recovery = clamp01(1 - run.retries / 8);
    const quality = pace * 0.62 + recovery * 0.38;
    successMass += quality;
    struggleMass += 1 - quality;
  }
  return successMass / (successMass + struggleMass);
}

/**
 * Small explainable on-device inference model. It predicts current struggle
 * from implicit play telemetry and the learned household prior. The model may
 * reveal help or switch input modality; it can never solve a puzzle for users.
 */
export function inferDifficulty(input: DifficultyInferenceInput): DifficultyInference {
  const expected = input.expectedConfidence ?? 0.72;
  const learnedSkill = learnHouseholdSkill(input.history);
  const attemptFeature = clamp01(input.attempts / 4);
  const stallFeature = clamp01((input.secondsSinceProgress - 8) / 56);
  const confidenceGap = input.meanRejectedConfidence === undefined
    ? 0
    : clamp01((expected - input.meanRejectedConfidence) / 0.34);
  const stageFeature = clamp01((input.stageIndex ?? 0) / 4);
  const sensorLoss = input.sensorAvailable ? 0 : 1;

  const logOdds =
    -2.05 +
    attemptFeature * 2.45 +
    stallFeature * 2.7 +
    confidenceGap * 1.35 +
    stageFeature * 0.2 +
    sensorLoss * 3.6 +
    (0.52 - learnedSkill) * 1.5;
  const struggleProbability = clamp01(sigmoid(logOdds));
  const hintAfterSeconds = Math.round(30 + learnedSkill * 24);
  const fallbackAfterSeconds = Math.round(52 + learnedSkill * 24);

  return {
    struggleProbability,
    learnedSkill,
    hintAfterSeconds,
    preferManualFallback:
      !input.sensorAvailable ||
      input.secondsSinceProgress >= fallbackAfterSeconds ||
      (struggleProbability >= 0.68 && input.attempts >= 3),
  };
}

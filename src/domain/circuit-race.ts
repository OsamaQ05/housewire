export const CIRCUIT_RACE_VERSION = 1 as const;
export const CIRCUIT_RACE_OPENING_STAGE_IDS = [
  'relay-order',
  'knock-line',
  'ground-plane',
] as const;
export const CIRCUIT_RACE_STAGE_IDS = [
  ...CIRCUIT_RACE_OPENING_STAGE_IDS,
  'breaker-code',
] as const;

export type CircuitRaceStageId = (typeof CIRCUIT_RACE_STAGE_IDS)[number];
export type CircuitRaceOpeningStageId = (typeof CIRCUIT_RACE_OPENING_STAGE_IDS)[number];
export type CircuitRaceOpeningStageIndex = 0 | 1 | 2;
export type CircuitRaceStageIndex = CircuitRaceOpeningStageIndex | 3;
export type CircuitRaceCourseTemplateId =
  | 'riddle-spark'
  | 'gravity-breach'
  | 'echo-first'
  | 'crossed-wires'
  | 'falling-signal'
  | 'ghost-current';
export type CircuitRaceMechanic =
  | 'sequence-cipher'
  | 'knock-pattern'
  | 'flat-phone'
  | 'breaker-code';
export type CircuitRaceDifficulty = 1 | 2 | 3 | 4 | 5;
export type CircuitGlyph = 'ARC' | 'BELL' | 'COIL' | 'DOOR' | 'EYE' | 'FORK' | 'KEY' | 'WAVE';
export type CircuitKnock = 'SHORT' | 'LONG';
export type CircuitBreakerLine = 'ODD' | 'EVEN';
export type CircuitMotionMove = 'TILT_LEFT' | 'TILT_RIGHT' | 'TIP_FORWARD' | 'TIP_BACK';
export type CircuitSwipeDirection = 'UP' | 'RIGHT' | 'DOWN' | 'LEFT';

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const GLYPHS: readonly CircuitGlyph[] = ['ARC', 'BELL', 'COIL', 'DOOR', 'EYE', 'FORK', 'KEY', 'WAVE'];
const SHORT_KNOCK_MS = 170;
const LONG_KNOCK_MS = 480;
const KNOCK_CLASSIFICATION_MIDPOINT_MS = 320;
const MINIMUM_KNOCK_MS = 40;
const MAXIMUM_KNOCK_MS = 2_000;

export interface CircuitRaceCourseTemplate {
  id: CircuitRaceCourseTemplateId;
  openingStageIds: readonly [
    CircuitRaceOpeningStageId,
    CircuitRaceOpeningStageId,
    CircuitRaceOpeningStageId,
  ];
  premise: string;
}

/**
 * Six complete opening routes keep repeat races unpredictable while preserving
 * the same final regroup. Selection is seeded, so rival crews always receive
 * the exact same route.
 */
export const CIRCUIT_RACE_COURSE_TEMPLATES: readonly CircuitRaceCourseTemplate[] = [
  {
    id: 'riddle-spark',
    openingStageIds: ['relay-order', 'knock-line', 'ground-plane'],
    premise: 'A voice in the dead switchboard left object clues, a trapped pulse and one private signal. Recover all three before the master breaker seals.',
  },
  {
    id: 'gravity-breach',
    openingStageIds: ['ground-plane', 'relay-order', 'knock-line'],
    premise: 'The station broke loose in a power surge. Restore the private signal, identify the missing controls, then wake the final line before the master breaker seals.',
  },
  {
    id: 'echo-first',
    openingStageIds: ['knock-line', 'ground-plane', 'relay-order'],
    premise: 'A pulse is still moving through the dark wing. Catch it, rebuild its broken signal, then find the objects it is trying to name.',
  },
  {
    id: 'crossed-wires',
    openingStageIds: ['relay-order', 'ground-plane', 'knock-line'],
    premise: 'The repair map has split into words, symbols and sound. Rebuild those three signals in the only order that can wake the master breaker.',
  },
  {
    id: 'falling-signal',
    openingStageIds: ['ground-plane', 'knock-line', 'relay-order'],
    premise: 'A falling signal scattered itself across symbols, rhythm and riddles. Catch every piece, then join the crew lines at the master breaker.',
  },
  {
    id: 'ghost-current',
    openingStageIds: ['knock-line', 'relay-order', 'ground-plane'],
    premise: 'A ghost current is tapping from inside the walls. Echo its pulse, decode what it saw, and carry the recovered key into the master breaker.',
  },
] as const;

export interface CircuitRaceHint {
  id: string;
  penaltyMs: number;
  text: string;
}

export interface CircuitRaceStageBase {
  difficulty: CircuitRaceDifficulty;
  estimatedSeconds: number;
  hints: readonly CircuitRaceHint[];
  id: CircuitRaceStageId;
  index: CircuitRaceStageIndex;
  instruction: string;
  kicker: string;
  mechanic: CircuitRaceMechanic;
  proofId: string;
  title: string;
}

export interface CircuitSequencePanel {
  clue: string;
  glyph: CircuitGlyph;
  panelId: string;
  pulseOrder: 1 | 2 | 3 | 4;
}

export interface CircuitCipherWheelEntry {
  digit: number;
  glyph: CircuitGlyph;
}

export interface CircuitSequenceStage extends CircuitRaceStageBase {
  challenge: {
    answerLength: 4;
    cipherWheel: readonly CircuitCipherWheelEntry[];
    panels: readonly CircuitSequencePanel[];
    readingRule: 'LOWEST_PULSE_FIRST';
  };
  id: 'relay-order';
  index: CircuitRaceOpeningStageIndex;
  mechanic: 'sequence-cipher';
}

export interface CircuitKnockStage extends CircuitRaceStageBase {
  challenge: {
    accessibleChoices: readonly CircuitKnock[];
    longReferenceMs: number;
    pulseDurationsMs: readonly number[];
    replayLimit: number;
    shortReferenceMs: number;
    timingToleranceMs: number;
  };
  id: 'knock-line';
  index: CircuitRaceOpeningStageIndex;
  mechanic: 'knock-pattern';
}

export type CircuitFlatFace = 'FACE_UP' | 'FACE_DOWN';

export interface CircuitFlatPhoneStage extends CircuitRaceStageBase {
  challenge: {
    fallback: {
      instruction: string;
      minimumHoldMs: number;
      penaltyMs: number;
    };
    holdMs: number;
    maxTiltDegrees: number;
    minimumSamples: number;
    moveCount: 3;
    requiredFace: CircuitFlatFace;
    tiltSequence: readonly [CircuitMotionMove, CircuitMotionMove, CircuitMotionMove];
  };
  id: 'ground-plane';
  index: CircuitRaceOpeningStageIndex;
  mechanic: 'flat-phone';
}

export interface CircuitBreakerSlot {
  line: CircuitBreakerLine;
  position: 1 | 2 | 3 | 4;
}

export interface CircuitBreakerStage extends CircuitRaceStageBase {
  challenge: {
    codeLength: 4;
    slots: readonly CircuitBreakerSlot[];
  };
  id: 'breaker-code';
  index: 3;
  mechanic: 'breaker-code';
}

export type CircuitRaceStage =
  | CircuitSequenceStage
  | CircuitKnockStage
  | CircuitFlatPhoneStage
  | CircuitBreakerStage;
export type CircuitRaceOpeningStage = Exclude<CircuitRaceStage, CircuitBreakerStage>;

export interface CircuitBreakerFragment {
  digits: readonly [number, number];
  fragmentId: string;
  line: CircuitBreakerLine;
  ownerSlot: 0 | 1;
  positions: readonly [1 | 2, 3 | 4];
  revealAfterStageIndex: 2;
}

export interface CompiledCircuitRace {
  breakerFragments: readonly [CircuitBreakerFragment, CircuitBreakerFragment];
  contentId: string;
  courseTemplateId: CircuitRaceCourseTemplateId;
  seed: number;
  stages: readonly [
    CircuitRaceOpeningStage,
    CircuitRaceOpeningStage,
    CircuitRaceOpeningStage,
    CircuitBreakerStage,
  ];
  teamId: string;
  theme: {
    premise: string;
    title: 'THE LAST CIRCUIT';
    visualMotif: 'ceramic fuseboard and live copper traces';
  };
  version: typeof CIRCUIT_RACE_VERSION;
}

export type CircuitSequenceSubmission = {
  code: string;
  mechanic: 'sequence-cipher';
};

export type CircuitKnockSubmission =
  | {
      mechanic: 'knock-pattern';
      mode: 'timed';
      pressDurationsMs: readonly number[];
    }
  | {
      mechanic: 'knock-pattern';
      mode: 'accessible';
      pattern: readonly CircuitKnock[];
    };

export interface CircuitFlatPhoneSample {
  at: number;
  gravityZ: number;
  pitchDegrees: number;
  rollDegrees: number;
}

export type CircuitFlatPhoneSubmission =
  | {
      mechanic: 'flat-phone';
      mode: 'sensor';
      samples: readonly CircuitFlatPhoneSample[];
    }
  | {
      heldMs: number;
      mechanic: 'flat-phone';
      mode: 'manual-hold';
      signalSequence: readonly CircuitMotionMove[];
    };

export type CircuitBreakerSubmission = {
  code: string;
  mechanic: 'breaker-code';
};

export type CircuitRaceSubmission =
  | CircuitSequenceSubmission
  | CircuitKnockSubmission
  | CircuitFlatPhoneSubmission
  | CircuitBreakerSubmission;

export interface CircuitFlatPhoneValidator {
  validateFallback(
    challenge: CircuitFlatPhoneStage['challenge'],
    evidence: Extract<CircuitFlatPhoneSubmission, { mode: 'manual-hold' }>,
  ): boolean;
  validateSensor(
    challenge: CircuitFlatPhoneStage['challenge'],
    evidence: Extract<CircuitFlatPhoneSubmission, { mode: 'sensor' }>,
  ): boolean;
}

export interface CircuitRaceValidationAdapters {
  flatPhone?: CircuitFlatPhoneValidator;
}

export interface CircuitRaceValidationOptions {
  adapters?: CircuitRaceValidationAdapters;
  revealedHintCount?: number;
}

export interface CircuitRaceValidationResult {
  hintPenaltyMs: number;
  inputPenaltyMs: number;
  proofId: string;
  reason: 'accepted' | 'wrong-answer' | 'wrong-input' | 'insufficient-evidence';
  stageId: CircuitRaceStageId;
  totalPenaltyMs: number;
  valid: boolean;
}

interface CircuitRaceAnswers {
  breakerCode: string;
  knockPattern: readonly CircuitKnock[];
  sequenceCode: string;
}

interface CircuitRaceContent {
  answers: CircuitRaceAnswers;
  breakerFragments: readonly [CircuitBreakerFragment, CircuitBreakerFragment];
  flatChallenge: CircuitFlatPhoneStage['challenge'];
  knockChallenge: CircuitKnockStage['challenge'];
  sequenceChallenge: CircuitSequenceStage['challenge'];
}

/**
 * Compiles a team course. `teamId` is intentionally excluded from every
 * seeded content decision, so two teams get byte-for-byte equal challenges.
 */
export function compileCircuitRace(seedInput: number, teamId: string): CompiledCircuitRace {
  if (!SAFE_ID.test(teamId)) throw new Error('Circuit Race needs a relay-safe team id.');
  if (!Number.isSafeInteger(seedInput)) throw new Error('Circuit Race seed must be a safe integer.');
  const seed = seedInput >>> 0;
  const content = deriveCircuitRaceContent(seed);
  const template = courseTemplateForSeed(seed);
  const openingStages = template.openingStageIds.map((stageId, index) =>
    openingStage(seed, stageId, index as CircuitRaceOpeningStageIndex, content)
  );
  const [first, second, third] = openingStages;
  if (!first || !second || !third) throw new Error('Circuit Race template needs three opening stages.');
  const stages: CompiledCircuitRace['stages'] = [
    first,
    second,
    third,
    breakerStage(seed),
  ];
  return {
    breakerFragments: content.breakerFragments,
    contentId: `circuit-${shortHash(`content:${seed}`)}`,
    courseTemplateId: template.id,
    seed,
    stages,
    teamId,
    theme: {
      premise: template.premise,
      title: 'THE LAST CIRCUIT',
      visualMotif: 'ceramic fuseboard and live copper traces',
    },
    version: CIRCUIT_RACE_VERSION,
  };
}

export function validateCircuitRaceStage(
  course: CompiledCircuitRace,
  stageId: CircuitRaceStageId,
  submission: CircuitRaceSubmission,
  options: CircuitRaceValidationOptions = {},
): CircuitRaceValidationResult {
  const stage = circuitRaceStageForId(course, stageId);
  const hintPenaltyMs = circuitRaceHintPenaltyMs(course, stageId, options.revealedHintCount ?? 0);
  const base = {
    hintPenaltyMs,
    inputPenaltyMs: 0,
    proofId: stage.proofId,
    stageId,
  };
  const wrongInput = (): CircuitRaceValidationResult => ({
    ...base,
    reason: 'wrong-input',
    totalPenaltyMs: hintPenaltyMs,
    valid: false,
  });
  const result = validateSubmission(course, stage, submission, options.adapters);
  if (result === 'wrong-input') return wrongInput();
  const inputPenaltyMs = result.inputPenaltyMs;
  return {
    ...base,
    inputPenaltyMs,
    reason: result.valid ? 'accepted' : result.reason,
    totalPenaltyMs: hintPenaltyMs + inputPenaltyMs,
    valid: result.valid,
  };
}

export function circuitRaceHintPenaltyMs(
  course: CompiledCircuitRace,
  stageId: CircuitRaceStageId,
  revealedHintCount: number,
): number {
  const stage = circuitRaceStageForId(course, stageId);
  const count = Math.max(0, Math.min(stage.hints.length, Math.floor(revealedHintCount)));
  return stage.hints.slice(0, count).reduce((total, hint) => total + hint.penaltyMs, 0);
}

/** Returns only the private strip meant for one of the team's two line holders. */
export function circuitRaceBreakerFragmentForSlot(
  course: CompiledCircuitRace,
  ownerSlot: 0 | 1,
): CircuitBreakerFragment {
  return course.breakerFragments[ownerSlot];
}

export const defaultCircuitFlatPhoneValidator: CircuitFlatPhoneValidator = {
  validateFallback(challenge, evidence) {
    return Number.isFinite(evidence.heldMs) &&
      evidence.heldMs >= challenge.fallback.minimumHoldMs &&
      sameValues(evidence.signalSequence, challenge.tiltSequence);
  },
  validateSensor(challenge, evidence) {
    if (evidence.samples.length < challenge.minimumSamples) return false;
    const samples = [...evidence.samples].sort((left, right) => left.at - right.at);
    if (samples.some((sample, index) =>
      !Number.isFinite(sample.at) ||
      !Number.isFinite(sample.pitchDegrees) ||
      !Number.isFinite(sample.rollDegrees) ||
      !Number.isFinite(sample.gravityZ) ||
      (index > 0 && sample.at <= samples[index - 1].at),
    )) return false;
    const sequenceCompletedAt = findCompletedMotionSequence(samples, challenge.tiltSequence);
    if (sequenceCompletedAt === undefined) return false;
    // The player may still need to turn the phone over after returning through
    // center. Transition samples are expected; accept only a final consecutive
    // flat/correct-face window instead of requiring the entire landing motion
    // to have already been stable.
    return hasStableLandingWindow(samples.slice(sequenceCompletedAt), challenge);
  },
};

function hasStableLandingWindow(
  samples: readonly CircuitFlatPhoneSample[],
  challenge: CircuitFlatPhoneStage['challenge'],
): boolean {
  let stableStartedAt: number | undefined;
  let stableSamples = 0;
  for (const sample of samples) {
    const flat = Math.abs(sample.pitchDegrees) <= challenge.maxTiltDegrees &&
      Math.abs(sample.rollDegrees) <= challenge.maxTiltDegrees;
    const faceCorrect = challenge.requiredFace === 'FACE_UP'
      ? sample.gravityZ >= 0.72
      : sample.gravityZ <= -0.72;
    if (!flat || !faceCorrect) {
      stableStartedAt = undefined;
      stableSamples = 0;
      continue;
    }
    stableStartedAt ??= sample.at;
    stableSamples += 1;
    if (stableSamples >= challenge.minimumSamples && sample.at - stableStartedAt >= challenge.holdMs) {
      return true;
    }
  }
  return false;
}

function validateSubmission(
  course: CompiledCircuitRace,
  stage: CircuitRaceStage,
  submission: CircuitRaceSubmission,
  adapters?: CircuitRaceValidationAdapters,
):
  | 'wrong-input'
  | { inputPenaltyMs: number; reason: 'wrong-answer' | 'insufficient-evidence'; valid: false }
  | { inputPenaltyMs: number; valid: true } {
  const answers = deriveCircuitRaceContent(course.seed).answers;
  if (stage.mechanic === 'sequence-cipher') {
    if (submission.mechanic !== stage.mechanic) return 'wrong-input';
    const code = normalizeCode(submission.code);
    // Validate the code against the exact plates and wheel rendered to players.
    // This makes the visible challenge the source of truth even if generation or
    // transport code is refactored independently later.
    return code === circuitSequenceCode(stage.challenge)
      ? { inputPenaltyMs: 0, valid: true }
      : { inputPenaltyMs: 0, reason: 'wrong-answer', valid: false };
  }
  if (stage.mechanic === 'knock-pattern') {
    if (submission.mechanic !== stage.mechanic) return 'wrong-input';
    const pattern = submission.mode === 'accessible'
      ? [...submission.pattern]
      : classifyTimedKnocks(submission.pressDurationsMs);
    if (!pattern || pattern.length !== answers.knockPattern.length) {
      return { inputPenaltyMs: 0, reason: 'insufficient-evidence', valid: false };
    }
    return sameValues(pattern, answers.knockPattern)
      ? { inputPenaltyMs: 0, valid: true }
      : { inputPenaltyMs: 0, reason: 'wrong-answer', valid: false };
  }
  if (stage.mechanic === 'flat-phone') {
    if (submission.mechanic !== stage.mechanic) return 'wrong-input';
    const validator = adapters?.flatPhone ?? defaultCircuitFlatPhoneValidator;
    if (submission.mode === 'manual-hold') {
      const valid = validator.validateFallback(stage.challenge, submission);
      return valid
        ? { inputPenaltyMs: stage.challenge.fallback.penaltyMs, valid: true }
        : { inputPenaltyMs: 0, reason: 'insufficient-evidence', valid: false };
    }
    return validator.validateSensor(stage.challenge, submission)
      ? { inputPenaltyMs: 0, valid: true }
      : { inputPenaltyMs: 0, reason: 'insufficient-evidence', valid: false };
  }
  if (submission.mechanic !== stage.mechanic) return 'wrong-input';
  return normalizeCode(submission.code) === answers.breakerCode
    ? { inputPenaltyMs: 0, valid: true }
    : { inputPenaltyMs: 0, reason: 'wrong-answer', valid: false };
}

function sequenceStage(
  seed: number,
  index: CircuitRaceOpeningStageIndex,
  challenge: CircuitSequenceStage['challenge'],
): CircuitSequenceStage {
  const copy = seededCopy(SEQUENCE_STAGE_COPY, seed, 'relay-order');
  return {
    challenge,
    difficulty: 2,
    estimatedSeconds: 75,
    hints: copy.hints,
    id: 'relay-order',
    index,
    instruction: copy.instruction,
    kicker: `CIRCUIT ${String(index + 1).padStart(2, '0')} · ${copy.kicker}`,
    mechanic: 'sequence-cipher',
    proofId: proofId(seed, 'relay-order'),
    title: copy.title,
  };
}

function knockStage(
  seed: number,
  index: CircuitRaceOpeningStageIndex,
  challenge: CircuitKnockStage['challenge'],
): CircuitKnockStage {
  const copy = seededCopy(KNOCK_STAGE_COPY, seed, 'knock-line');
  return {
    challenge,
    difficulty: 3,
    estimatedSeconds: 70,
    hints: copy.hints,
    id: 'knock-line',
    index,
    instruction: copy.instruction,
    kicker: `CIRCUIT ${String(index + 1).padStart(2, '0')} · ${copy.kicker}`,
    mechanic: 'knock-pattern',
    proofId: proofId(seed, 'knock-line'),
    title: copy.title,
  };
}

function flatStage(
  seed: number,
  index: CircuitRaceOpeningStageIndex,
  challenge: CircuitFlatPhoneStage['challenge'],
): CircuitFlatPhoneStage {
  const copy = seededCopy(FLAT_STAGE_COPY, seed, 'ground-plane');
  return {
    challenge,
    difficulty: 2,
    estimatedSeconds: 35,
    hints: [
      { id: 'ground-plane-h1', penaltyMs: 6_000, text: copy.firstHint },
      { id: 'ground-plane-h2', penaltyMs: 10_000, text: 'After all three symbols, keep one finger on the seal until it locks.' },
    ],
    id: 'ground-plane',
    index,
    instruction: copy.instruction,
    kicker: `CIRCUIT ${String(index + 1).padStart(2, '0')} · ${copy.kicker}`,
    mechanic: 'flat-phone',
    proofId: proofId(seed, 'ground-plane'),
    title: copy.title,
  };
}

function breakerStage(seed: number): CircuitBreakerStage {
  const copy = seededCopy(BREAKER_STAGE_COPY, seed, 'breaker-code');
  return {
    challenge: {
      codeLength: 4,
      slots: [
        { line: 'ODD', position: 1 },
        { line: 'EVEN', position: 2 },
        { line: 'ODD', position: 3 },
        { line: 'EVEN', position: 4 },
      ],
    },
    difficulty: 2,
    estimatedSeconds: 45,
    hints: copy.hints,
    id: 'breaker-code',
    index: 3,
    instruction: copy.instruction,
    kicker: `CIRCUIT 04 · ${copy.kicker}`,
    mechanic: 'breaker-code',
    proofId: proofId(seed, 'breaker-code'),
    title: copy.title,
  };
}

function deriveCircuitRaceContent(seed: number): CircuitRaceContent {
  const random = mulberry32(seed ^ 0x7c1c_017);
  const wheelGlyphs = shuffle(GLYPHS, random).slice(0, 6);
  const wheelDigits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random).slice(0, 6);
  const cipherWheel = wheelGlyphs.map((glyph, index) => ({ glyph, digit: wheelDigits[index] }));
  const answerGlyphs = shuffle(wheelGlyphs, random).slice(0, 4);
  const panels = shuffle(answerGlyphs.map((glyph, index) => ({
    clue: circuitRiddle(seed, glyph, index),
    glyph,
    panelId: `plate-${index + 1}-${shortHash(`${seed}:${glyph}`)}`,
    pulseOrder: (index + 1) as 1 | 2 | 3 | 4,
  })), random);
  const sequenceChallenge: CircuitSequenceStage['challenge'] = {
    answerLength: 4,
    cipherWheel,
    panels,
    readingRule: 'LOWEST_PULSE_FIRST',
  };
  const sequenceCode = circuitSequenceCode(sequenceChallenge);

  const knocks = shuffle<CircuitKnock>(['SHORT', 'SHORT', 'LONG', 'LONG'], random);
  knocks.push(random() < 0.5 ? 'SHORT' : 'LONG');
  const knockPattern = [...knocks];
  const pulseDurationsMs = knockPattern.map((knock) => {
    const base = knock === 'SHORT' ? SHORT_KNOCK_MS : LONG_KNOCK_MS;
    return base + Math.floor(random() * 25) - 12;
  });
  const requiredFace: CircuitFlatFace = random() < 0.5 ? 'FACE_UP' : 'FACE_DOWN';
  const tiltSequence = shuffle<CircuitMotionMove>(
    ['TILT_LEFT', 'TILT_RIGHT', 'TIP_FORWARD', 'TIP_BACK'],
    random,
  ).slice(0, 3) as [CircuitMotionMove, CircuitMotionMove, CircuitMotionMove];
  const holdMs = 1_800 + Math.floor(random() * 5) * 100;
  const longCount = knockPattern.filter((knock) => knock === 'LONG').length;
  const binaryKnocks = Number.parseInt(knockPattern.map((knock) => knock === 'LONG' ? '1' : '0').join(''), 2);
  const breakerDigits: [number, number, number, number] = [
    Number(sequenceCode[0]) % 4,
    longCount % 4,
    Number(sequenceCode.at(-1)) % 4,
    (binaryKnocks + (requiredFace === 'FACE_UP' ? 3 : 7)) % 4,
  ];
  const breakerCode = breakerDigits.join('');
  const breakerFragments: readonly [CircuitBreakerFragment, CircuitBreakerFragment] = [
    {
      digits: [breakerDigits[0], breakerDigits[2]],
      fragmentId: `odd-${shortHash(`${seed}:odd`)}`,
      line: 'ODD',
      ownerSlot: 0,
      positions: [1, 3],
      revealAfterStageIndex: 2,
    },
    {
      digits: [breakerDigits[1], breakerDigits[3]],
      fragmentId: `even-${shortHash(`${seed}:even`)}`,
      line: 'EVEN',
      ownerSlot: 1,
      positions: [2, 4],
      revealAfterStageIndex: 2,
    },
  ];
  return {
    answers: { breakerCode, knockPattern, sequenceCode },
    breakerFragments,
    flatChallenge: {
      fallback: {
        instruction: 'Enter the three called symbols, then hold the copper seal without releasing.',
        minimumHoldMs: holdMs + 800,
        penaltyMs: 5_000,
      },
      holdMs,
      maxTiltDegrees: 11,
      minimumSamples: 5,
      moveCount: 3,
      requiredFace,
      tiltSequence,
    },
    knockChallenge: {
      accessibleChoices: ['SHORT', 'LONG'],
      longReferenceMs: LONG_KNOCK_MS,
      pulseDurationsMs,
      replayLimit: 2,
      shortReferenceMs: SHORT_KNOCK_MS,
      timingToleranceMs: 260,
    },
    sequenceChallenge,
  };
}

const CIRCUIT_RIDDLES: Readonly<Record<CircuitGlyph, readonly [string, string, string]>> = {
  ARC: [
    'I am a piece of a circle, but never the whole. What am I?',
    'I bend between two points without becoming a corner. What am I?',
    'Lightning draws me; a compass traces me. Name my curve.',
  ],
  BELL: [
    'Strike me and I speak, though I have no mouth. What am I?',
    'I wear a metal skirt and call a room without words. What am I?',
    'I stay silent until a blow gives me a voice. Name me.',
  ],
  COIL: [
    'I wind around myself and store a sudden force. What am I?',
    'The tighter I curl, the more energy I keep. What am I?',
    'I circle without travelling and spring when released. Name me.',
  ],
  DOOR: [
    'I turn a wall into a choice: stay or pass. What am I?',
    'I am part of a wall, yet I exist so walls can be crossed. What am I?',
    'I swing but never dance, and divide here from there. Name me.',
  ],
  EYE: [
    'I close for sleep and open to let the world in. What am I?',
    'I take in a whole room but keep nothing I see. What am I?',
    'Behind a lid I watch, though I am no camera. Name me.',
  ],
  FORK: [
    'I split one road into several, and also sit beside a plate. What am I?',
    'At dinner I have teeth; on a road I offer choices. What am I?',
    'I make one path become two, yet I can lift a bite. Name me.',
  ],
  KEY: [
    'I have teeth but never bite; locks surrender to me. What am I?',
    'I am small enough for a pocket but can open an entire room. What am I?',
    'Turn me once and a barrier forgets how to stay shut. Name me.',
  ],
  WAVE: [
    'I travel without feet and can break without falling. What am I?',
    'I cross an ocean or carry a voice, but I own no boat. What am I?',
    'You can see me on water and hear what I carry through air. Name me.',
  ],
};

/** Maps the protected 0–3 finale values to the four neutral fuse symbols. */
export function circuitBreakerGestureForDigit(digit: number): CircuitSwipeDirection {
  return (['UP', 'RIGHT', 'DOWN', 'LEFT'] as const)[Math.abs(Math.trunc(digit)) % 4];
}

export function circuitBreakerDigitForGesture(direction: CircuitSwipeDirection): number {
  return (['UP', 'RIGHT', 'DOWN', 'LEFT'] as const).indexOf(direction);
}

function findCompletedMotionSequence(
  samples: readonly CircuitFlatPhoneSample[],
  sequence: readonly CircuitMotionMove[],
): number | undefined {
  let step = 0;
  let mustCenter = false;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const centered = Math.abs(sample.pitchDegrees) <= 9 && Math.abs(sample.rollDegrees) <= 9;
    if (mustCenter) {
      if (!centered) continue;
      mustCenter = false;
      if (step === sequence.length) return index;
      continue;
    }
    if (centered) continue;
    const move = classifyMotionMove(sample);
    if (!move) continue;
    if (move === sequence[step]) {
      step += 1;
      mustCenter = true;
      continue;
    }
    step = move === sequence[0] ? 1 : 0;
    mustCenter = step === 1;
  }
  return undefined;
}

function classifyMotionMove(sample: CircuitFlatPhoneSample): CircuitMotionMove | undefined {
  const pitch = sample.pitchDegrees;
  const roll = sample.rollDegrees;
  if (Math.max(Math.abs(pitch), Math.abs(roll)) < 18) return undefined;
  if (Math.abs(roll) >= Math.abs(pitch)) return roll < 0 ? 'TILT_LEFT' : 'TILT_RIGHT';
  return pitch < 0 ? 'TIP_FORWARD' : 'TIP_BACK';
}

/** Solves only the visible relay contract: STEP 1→4, then glyph→wheel digit. */
export function circuitSequenceCode(challenge: CircuitSequenceStage['challenge']): string {
  const digitByGlyph = new Map(challenge.cipherWheel.map((entry) => [entry.glyph, entry.digit]));
  return [...challenge.panels]
    .sort((left, right) => left.pulseOrder - right.pulseOrder)
    .map((panel) => {
      const digit = digitByGlyph.get(panel.glyph);
      if (digit === undefined) throw new Error(`Circuit wheel is missing the ${panel.glyph} plate.`);
      return digit;
    })
    .join('');
}

function classifyTimedKnocks(durations: readonly number[]): CircuitKnock[] | undefined {
  const pattern: CircuitKnock[] = [];
  for (const duration of durations) {
    if (
      !Number.isFinite(duration) ||
      duration < MINIMUM_KNOCK_MS ||
      duration > MAXIMUM_KNOCK_MS
    ) return undefined;
    const classification: CircuitKnock = duration < KNOCK_CLASSIFICATION_MIDPOINT_MS ? 'SHORT' : 'LONG';
    pattern.push(classification);
  }
  return pattern;
}

function circuitRaceStageForId(
  course: CompiledCircuitRace,
  stageId: CircuitRaceStageId,
): CircuitRaceStage {
  const stage = course.stages.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error(`Circuit Race course is missing stage ${stageId}.`);
  return stage;
}

function courseTemplateForSeed(seed: number): CircuitRaceCourseTemplate {
  return CIRCUIT_RACE_COURSE_TEMPLATES[
    seededIndex(seed, 'course-template', CIRCUIT_RACE_COURSE_TEMPLATES.length)
  ];
}

function openingStage(
  seed: number,
  stageId: CircuitRaceOpeningStageId,
  index: CircuitRaceOpeningStageIndex,
  content: CircuitRaceContent,
): CircuitRaceOpeningStage {
  if (stageId === 'relay-order') return sequenceStage(seed, index, content.sequenceChallenge);
  if (stageId === 'knock-line') return knockStage(seed, index, content.knockChallenge);
  return flatStage(seed, index, content.flatChallenge);
}

function circuitRiddle(seed: number, glyph: CircuitGlyph, position: number): string {
  const variants = CIRCUIT_RIDDLES[glyph];
  return variants[seededIndex(seed, `riddle:${glyph}:${position}`, variants.length)];
}

interface CircuitStageCopy {
  hints: readonly [CircuitRaceHint, CircuitRaceHint];
  instruction: string;
  kicker: string;
  title: string;
}

interface CircuitFlatStageCopy {
  firstHint: string;
  instruction: string;
  kicker: string;
  title: string;
}

const SEQUENCE_STAGE_COPY: readonly CircuitStageCopy[] = [
  {
    hints: [
      { id: 'relay-order-h1', penaltyMs: 8_000, text: 'Solve the clue cards from STEP 1 through STEP 4.' },
      { id: 'relay-order-h2', penaltyMs: 14_000, text: 'Each riddle names one object on the switchboard.' },
    ],
    instruction: 'One player reads four riddles in order. The other races to hit the four objects they describe.',
    kicker: 'RIDDLE RELAY',
    title: 'Who Am I?',
  },
  {
    hints: [
      { id: 'relay-order-h1', penaltyMs: 8_000, text: 'Treat each witness line as a riddle, in numbered order.' },
      { id: 'relay-order-h2', penaltyMs: 14_000, text: 'The answer to every witness line exists on the board.' },
    ],
    instruction: 'One player reads the four witness statements. Their partner identifies each missing control on the object board.',
    kicker: 'OBJECT HUNT',
    title: 'The Witness Board',
  },
  {
    hints: [
      { id: 'relay-order-h1', penaltyMs: 8_000, text: 'The voices describe objects; solve them from 1 to 4.' },
      { id: 'relay-order-h2', penaltyMs: 14_000, text: 'Call only the clue aloud. Your partner owns the controls.' },
    ],
    instruction: 'Four lost voices describe what they saw. Read them aloud while your partner wakes the matching controls in order.',
    kicker: 'LOST VOICES',
    title: 'Voices in Copper',
  },
];

const KNOCK_STAGE_COPY: readonly CircuitStageCopy[] = [
  {
    hints: [
      { id: 'knock-line-h1', penaltyMs: 8_000, text: 'Listen to length, not pitch.' },
      { id: 'knock-line-h2', penaltyMs: 16_000, text: 'Press and hold for long beats; tap for short beats.' },
    ],
    instruction: 'Hear the trapped rhythm, then perform it back on the phone with your own taps and holds.',
    kicker: 'RHYTHM',
    title: 'Echo Chamber',
  },
  {
    hints: [
      { id: 'knock-line-h1', penaltyMs: 8_000, text: 'A quick beat is a tap; a stretched beat is a hold.' },
      { id: 'knock-line-h2', penaltyMs: 16_000, text: 'Replay it, speak the five beats, then perform them.' },
    ],
    instruction: 'A machine is fading. Listen to its five-beat heartbeat and keep it alive by performing the same taps and holds.',
    kicker: 'PULSE',
    title: 'Heartbeat Lock',
  },
  {
    hints: [
      { id: 'knock-line-h1', penaltyMs: 8_000, text: 'Count five sounds and compare how long each one lasts.' },
      { id: 'knock-line-h2', penaltyMs: 16_000, text: 'Tap the short sounds; hold through the long sounds.' },
    ],
    instruction: 'Something inside the wall knocks five times. Catch its rhythm together, then answer it with real taps and holds.',
    kicker: 'WALL SIGNAL',
    title: 'Ghost in the Pipe',
  },
];

const FLAT_STAGE_COPY: readonly CircuitFlatStageCopy[] = [
  {
    firstHint: 'The keeper should call each symbol and its position clearly.',
    instruction: 'Your teammate owns a secret three-symbol signal. Listen, enter the symbols in order, then hold the shared seal.',
    kicker: 'PRIVATE SIGNAL',
    title: 'Blind Switchboard',
  },
  {
    firstHint: 'Repeat all three symbols aloud before touching the board.',
    instruction: 'The keeper can see a private seal. Rebuild its three symbols on the other phone, then maintain contact to transmit it.',
    kicker: 'SEALED LINE',
    title: "Smuggler's Seal",
  },
  {
    firstHint: 'Do not show the private screen—communication is the puzzle.',
    instruction: 'A damaged relay split its symbol key across two phones. Call it, rebuild it, and close the contact together.',
    kicker: 'BROKEN RELAY',
    title: 'Signal Vault',
  },
];

const BREAKER_STAGE_COPY: readonly CircuitStageCopy[] = [
  {
    hints: [
      { id: 'breaker-code-h1', penaltyMs: 10_000, text: 'Each teammate holds alternating fuse symbols.' },
      { id: 'breaker-code-h2', penaltyMs: 18_000, text: 'Combine A and B from beat 1 to beat 4.' },
    ],
    instruction: 'Combine the two private fuse strips, then enter the four symbols in beat order.',
    kicker: 'FUSE CODE',
    title: 'Live-Wire Fuse',
  },
  {
    hints: [
      { id: 'breaker-code-h1', penaltyMs: 10_000, text: 'Neither strip is complete; alternate the marked positions.' },
      { id: 'breaker-code-h2', penaltyMs: 18_000, text: 'Call positions 1 to 4, then enter the joined sequence.' },
    ],
    instruction: 'Lay both private symbol strips side by side, call the four positions, and enter the combined fuse code.',
    kicker: 'FINAL FUSE',
    title: 'The Final Contact',
  },
  {
    hints: [
      { id: 'breaker-code-h1', penaltyMs: 10_000, text: 'Your two strips own alternating symbols in the same sequence.' },
      { id: 'breaker-code-h2', penaltyMs: 18_000, text: 'Read 1, 2, 3, 4 across both strips before entering.' },
    ],
    instruction: 'The fuseboard accepts one four-symbol code. Merge both teammates’ private strips and enter the seal.',
    kicker: 'MASTER SEAL',
    title: 'Fuseboard Seal',
  },
];

function seededCopy<T>(values: readonly T[], seed: number, scope: CircuitRaceStageId): T {
  return values[seededIndex(seed, `copy:${scope}`, values.length)];
}

function seededIndex(seed: number, scope: string, length: number): number {
  if (length <= 0) throw new Error('Circuit Race cannot select from an empty set.');
  return Number.parseInt(shortHash(`${seed}:${scope}`), 36) % length;
}

function normalizeCode(value: string): string {
  return value.replace(/[\s-]/g, '');
}

function proofId(seed: number, stageId: CircuitRaceStageId): string {
  return `circuit-${stageId}-${shortHash(`${seed}:${stageId}`)}`;
}

function sameValues<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b_79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shortHash(value: string): string {
  let result = 2_166_136_261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16_777_619);
  }
  return (result >>> 0).toString(36);
}

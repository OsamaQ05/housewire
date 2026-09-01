import type { Capability } from '../types';

export const FORGE_THEME_IDS = [
  'abyssal-relay',
  'clockwork-manor',
  'museum-afterlight',
  'stormbound-express',
] as const;

export type ForgeThemeId = (typeof FORGE_THEME_IDS)[number];
export type ForgeTone = 'eerie' | 'adventure' | 'mystery';
export type ForgeIntensity = 'gentle' | 'balanced' | 'intense';
export type ForgeDifficulty = 1 | 2 | 3 | 4 | 5;
export type ForgeDuration = 20 | 30 | 45;

export interface ForgeGenerationRequest {
  seed: string | number;
  generatedAt: number;
  playerIds: readonly string[];
  playerNames?: Readonly<Record<string, string>>;
  difficulty: ForgeDifficulty;
  targetMinutes: ForgeDuration;
  tone: ForgeTone;
  intensity: ForgeIntensity;
  safeMovement: boolean;
  noiseAllowed: boolean;
  replayIndex?: number;
  themeId?: ForgeThemeId;
  /** Optional family-safe theme direction. Local mode maps it to the nearest authored world. */
  customThemePrompt?: string;
  capabilitiesByPlayer?: Readonly<Record<string, readonly Capability[]>>;
}

export interface ForgeRole {
  id: string;
  playerId: string;
  playerName: string;
  title: string;
  brief: string;
  responsibility: string;
  accent: string;
}

export type ForgeCluePayload =
  | { kind: 'text'; text: string }
  | { kind: 'sequence'; items: readonly string[] }
  | { kind: 'mapping'; pairs: readonly { left: string; right: string }[] }
  | { kind: 'grid-edges'; edges: readonly (readonly [number, number])[] }
  | { kind: 'audio-token'; spokenText: string; fallbackText: string }
  | { kind: 'camera-marker'; markerToken: string; symbol: string }
  | { kind: 'camera-display'; markerToken: string }
  | { kind: 'camera-scanner'; markerToken: string; symbol: string }
  | { kind: 'pose'; pose: ForgePose; holdMs: number };

export interface ForgeClue {
  id: string;
  title: string;
  /** Empty only for invalid imported data. Generated clues always name their audience. */
  audiencePlayerIds: readonly string[];
  private: boolean;
  payload: ForgeCluePayload;
}

export interface ForgeHint {
  level: 1 | 2 | 3;
  text: string;
  penaltySeconds: number;
}

export type ForgePose =
  | 'PLACE_FLAT'
  | 'HOLD_UPRIGHT'
  | 'TILT_LEFT'
  | 'TILT_RIGHT'
  | 'FACE_DOWN'
  | 'HOLD_STILL';

export interface DistributedOrderMechanic {
  kind: 'distributed-order';
  tokens: readonly { id: string; label: string }[];
  adjacentConstraints: readonly (readonly [string, string])[];
}

export interface SymbolLockMechanic {
  kind: 'symbol-lock';
  symbols: readonly string[];
  encodedSequence: readonly string[];
  preferredCapability: 'cameraQr';
  revealMode: 'camera' | 'manual';
}

export interface PrivateRelayRound {
  round: number;
  senderPlayerId: string;
  recipientPlayerId: string;
  excludedPlayerIds: readonly string[];
  gate: string;
}

export interface PrivateRelayMechanic {
  kind: 'private-relay';
  rounds: readonly PrivateRelayRound[];
  preferredCapability: 'microphoneLevel';
  deliveryMode: 'audio' | 'text';
  memoryMode: boolean;
}

export interface RouteGridMechanic {
  kind: 'route-grid';
  width: 3 | 4;
  height: 3 | 4;
  cells: readonly number[];
  openEdges: readonly (readonly [number, number])[];
  startCell: number;
  exitCell: number;
}

export interface MotionSyncAssignment {
  playerId: string;
  pose: ForgePose;
  vocalCue: 'NONE' | 'LOW_HUM' | 'SHORT_TONE';
}

export interface MotionSyncMechanic {
  kind: 'motion-sync';
  assignments: readonly MotionSyncAssignment[];
  inputMode: 'motion' | 'touch';
  windowMs: number;
  preferredCapability: 'motion';
}

export type ForgeMechanic =
  | DistributedOrderMechanic
  | SymbolLockMechanic
  | PrivateRelayMechanic
  | RouteGridMechanic
  | MotionSyncMechanic;

export type ForgePlayerMechanic =
  | Omit<DistributedOrderMechanic, 'adjacentConstraints'>
  | SymbolLockMechanic
  | PrivateRelayMechanic
  | Omit<RouteGridMechanic, 'openEdges'>
  | (Omit<MotionSyncMechanic, 'assignments'> & {
      assignments: readonly MotionSyncAssignment[];
      participantCount: number;
    });

export type ForgeStageSolution =
  | { kind: 'sequence'; answer: readonly string[] }
  | { kind: 'code'; answer: string }
  | {
      kind: 'relay';
      rounds: readonly { round: number; recipientPlayerId: string; token: string }[];
    }
  | { kind: 'route'; answer: readonly number[] }
  | {
      kind: 'sync';
      windowMs: number;
      assignments: readonly MotionSyncAssignment[];
    };

export interface ForgeFallback {
  reason: string;
  instruction: string;
  preservesAnswer: true;
}

export interface ForgeStage {
  id: string;
  index: number;
  title: string;
  storyBeat: string;
  instruction: string;
  durationMinutes: number;
  mechanic: ForgeMechanic;
  clues: readonly ForgeClue[];
  hints: readonly ForgeHint[];
  solution: ForgeStageSolution;
  requiredPlayerIds: readonly string[];
  submitterPlayerIds: readonly string[];
  fallback: ForgeFallback;
}

export interface ForgeValidationStamp {
  validatorVersion: 1;
  status: 'playable';
  checkedAt: number;
  checks: readonly string[];
}

export interface ForgeRecipe {
  seed: string | number;
  playerIds: readonly string[];
  playerNames?: Readonly<Record<string, string>>;
  difficulty: ForgeDifficulty;
  targetMinutes: ForgeDuration;
  tone: ForgeTone;
  intensity: ForgeIntensity;
  safeMovement: boolean;
  noiseAllowed: boolean;
  replayIndex: number;
  themeId: ForgeThemeId;
  customThemePrompt?: string;
  capabilitiesByPlayer?: Readonly<Record<string, readonly Capability[]>>;
}

export interface ForgeCase {
  id: string;
  schemaVersion: 1;
  generatorVersion: 'housewire-local-forge-v1';
  providerId: string;
  seed: string | number;
  effectiveSeed: number;
  replayIndex: number;
  createdAt: number;
  title: string;
  tagline: string;
  theme: ForgeThemeId;
  accent: string;
  durationMinutes: ForgeDuration;
  playerCount: number;
  difficulty: ForgeDifficulty;
  tone: ForgeTone;
  intensity: ForgeIntensity;
  premise: string;
  objective: string;
  ending: string;
  safetyNotice: string;
  roles: readonly ForgeRole[];
  stages: readonly ForgeStage[];
  recipe: ForgeRecipe;
  validation: ForgeValidationStamp;
}

export type ForgeStageSubmission =
  | { kind: 'sequence'; value: readonly string[] }
  | { kind: 'code'; value: string }
  | {
      kind: 'relay';
      rounds: readonly { round: number; recipientPlayerId: string; token: string }[];
    }
  | { kind: 'route'; value: readonly number[] }
  | {
      kind: 'sync';
      startedAt: number;
      completedAt: number;
      proofs: readonly {
        playerId: string;
        pose: ForgePose;
        vocalCue: 'NONE' | 'LOW_HUM' | 'SHORT_TONE';
        evidenceMode: 'sensor' | 'manual';
      }[];
    };

export type ForgeSubmissionCode =
  | 'ACCEPTED'
  | 'INVALID_STAGE'
  | 'WRONG_SUBMISSION_KIND'
  | 'INCOMPLETE'
  | 'WRONG_VALUE'
  | 'WRONG_RECIPIENT'
  | 'WRONG_ACTOR'
  | 'TIMING_WINDOW';

export interface ForgeSubmissionResult {
  accepted: boolean;
  code: ForgeSubmissionCode;
  stageId?: string;
  acceptedPrefixLength?: number;
  expectedLength?: number;
}

export interface ForgeValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ForgeCaseValidation {
  playable: boolean;
  issues: readonly ForgeValidationIssue[];
}

export interface ForgePlayerStage extends Omit<ForgeStage, 'clues' | 'mechanic' | 'solution'> {
  clues: readonly ForgeClue[];
  mechanic: ForgePlayerMechanic;
}

export interface ForgePlayerCase
  extends Omit<ForgeCase, 'roles' | 'stages' | 'recipe' | 'validation' | 'seed' | 'effectiveSeed' | 'replayIndex'> {
  role: ForgeRole;
  crew: readonly Pick<ForgeRole, 'playerId' | 'playerName' | 'title' | 'accent'>[];
  stages: readonly ForgePlayerStage[];
}

export interface ForgeCaseSummary {
  id: string;
  title: string;
  tagline: string;
  theme: ForgeThemeId;
  accent: string;
  durationMinutes: ForgeDuration;
  playerCount: number;
  difficulty: ForgeDifficulty;
  createdAt: number;
  replayIndex: number;
  providerId: string;
}

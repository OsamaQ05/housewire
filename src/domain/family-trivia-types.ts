export const FAMILY_TRIVIA_ROUND_KINDS = [
  'preference-match',
  'family-lore-ordering',
  'who-knows-who',
  'shared-memory-detail',
  'spectrum-read',
  'same-wavelength',
] as const;

export type FamilyTriviaRoundKind = (typeof FAMILY_TRIVIA_ROUND_KINDS)[number];

export interface FamilyTriviaPlayer {
  id: string;
  name: string;
  teamId?: string;
}

export interface FamilyTriviaTeam {
  id: string;
  name: string;
  memberPlayerIds: readonly string[];
}

export interface FamilyTriviaSetup {
  hostPlayerId: string;
  players: readonly FamilyTriviaPlayer[];
  teams: readonly FamilyTriviaTeam[];
}

export interface FamilyTriviaOption {
  id: string;
  label: string;
}

interface FamilyTriviaQuestionBase {
  id: string;
  authorityPlayerId: string;
  respondentPlayerIds: readonly string[];
  prompt: string;
  afterRevealPrompt: string;
  canSkip: boolean;
  /** Empty for answer formats that do not use a fixed set of choices. */
  options: readonly FamilyTriviaOption[];
}

export interface FamilyTriviaChoiceQuestion extends FamilyTriviaQuestionBase {
  kind: 'preference-match' | 'who-knows-who' | 'shared-memory-detail';
  answerKind: 'choice';
  options: readonly FamilyTriviaOption[];
}

export interface FamilyTriviaOrderingQuestion extends FamilyTriviaQuestionBase {
  kind: 'family-lore-ordering';
  answerKind: 'ordering';
  options: readonly FamilyTriviaOption[];
}

export interface FamilyTriviaSpectrumQuestion extends FamilyTriviaQuestionBase {
  kind: 'spectrum-read';
  answerKind: 'spectrum';
  options: readonly [];
  scale: {
    min: 0;
    max: 100;
    step: 5;
    minLabel: string;
    maxLabel: string;
  };
}

export interface FamilyTriviaTextQuestion extends FamilyTriviaQuestionBase {
  kind: 'same-wavelength';
  answerKind: 'text';
  options: readonly [];
  inputHint: string;
  maxLength: 40;
}

export type FamilyTriviaQuestion =
  | FamilyTriviaChoiceQuestion
  | FamilyTriviaOrderingQuestion
  | FamilyTriviaSpectrumQuestion
  | FamilyTriviaTextQuestion;

export type FamilyTriviaAnswer =
  | { kind: 'choice'; optionId: string }
  | { kind: 'ordering'; optionIds: readonly string[] }
  | { kind: 'spectrum'; value: number }
  | { kind: 'text'; value: string };

export type FamilyTriviaPackSource =
  | { kind: 'offline'; generatorVersion: 1 }
  | { kind: 'ai'; providerId: string; model?: string };

export interface FamilyTriviaQuestionPack {
  protocolVersion: 1;
  id: string;
  title: string;
  seed: number;
  source: FamilyTriviaPackSource;
  questions: readonly FamilyTriviaQuestion[];
}

export interface FamilyTriviaPlayerScore {
  playerId: string;
  points: number;
  exactMatches: number;
}

export interface FamilyTriviaTeamScore {
  teamId: string;
  /** Normalized exact-lock rate in basis points, always 0–10,000. */
  points: number;
  exactMatches: number;
  opportunities: number;
}

export interface FamilyTriviaQuestionResult {
  questionId: string;
  skipped: boolean;
  playerPoints: readonly {
    playerId: string;
    points: number;
    exact: boolean;
    /** Present only when the answer owner has replaced the automatic text match. */
    authorityReviewed?: true;
  }[];
}

export type FamilyTriviaOwnerVerdict = 'exact' | 'close' | 'miss';

export type FamilyTriviaPhase = 'reference' | 'guessing' | 'revealed' | 'complete';

/**
 * Host-authoritative state. `referenceAnswers` and `guesses` are secrets and
 * must only be transported through private/direct messages or kept by the host.
 * Always use a projection function before broadcasting session state.
 */
export interface FamilyTriviaSessionState {
  id: string;
  pack: FamilyTriviaQuestionPack;
  setup: FamilyTriviaSetup;
  phase: FamilyTriviaPhase;
  questionIndex: number;
  revision: number;
  referenceAnswers: Readonly<Record<string, FamilyTriviaAnswer>>;
  guesses: Readonly<Record<string, Readonly<Record<string, FamilyTriviaAnswer>>>>;
  playerScores: readonly FamilyTriviaPlayerScore[];
  teamScores: readonly FamilyTriviaTeamScore[];
  results: readonly FamilyTriviaQuestionResult[];
}

export type FamilyTriviaActionCode =
  | 'ACCEPTED'
  | 'SESSION_COMPLETE'
  | 'WRONG_PHASE'
  | 'UNKNOWN_PLAYER'
  | 'NOT_AUTHORITY'
  | 'NOT_RESPONDENT'
  | 'NOT_HOST'
  | 'INVALID_ANSWER'
  | 'ALREADY_SUBMITTED'
  | 'WAITING_FOR_GUESSES'
  | 'CANNOT_SKIP';

export interface FamilyTriviaActionResult {
  accepted: boolean;
  code: FamilyTriviaActionCode;
  state: FamilyTriviaSessionState;
}

export interface FamilyTriviaPublicProjection {
  sessionId: string;
  packId: string;
  phase: FamilyTriviaPhase;
  revision: number;
  questionIndex: number;
  questionCount: number;
  question?: FamilyTriviaQuestion;
  referenceSubmitted: boolean;
  submittedRespondentPlayerIds: readonly string[];
  waitingRespondentPlayerIds: readonly string[];
  readyToReveal: boolean;
  playerScores: readonly FamilyTriviaPlayerScore[];
  teamScores: readonly FamilyTriviaTeamScore[];
  latestResult?: FamilyTriviaQuestionResult;
}

export interface FamilyTriviaPlayerProjection extends FamilyTriviaPublicProjection {
  viewerPlayerId: string;
  viewerIsAuthority: boolean;
  viewerIsRespondent: boolean;
  viewerHasSubmitted: boolean;
  ownGuess?: FamilyTriviaAnswer;
  reveal?: {
    referenceAnswer: FamilyTriviaAnswer;
    ownPoints: number;
    ownExact: boolean;
  };
}

export interface FamilyTriviaAiPackRequest {
  protocolVersion: 1;
  seed: number;
  questionCount: number;
  playerIds: readonly string[];
  allowedKinds: readonly FamilyTriviaRoundKind[];
  constraints: {
    answersMustBePrivate: true;
    answersStayOnDevice: true;
    supportedAnswerKinds: readonly ['choice', 'ordering', 'spectrum', 'text'];
    noTherapyOrConflictPrompts: true;
    noSensitiveAttributes: true;
  };
}

export interface FamilyTriviaQuestionPackProvider {
  readonly id: string;
  readonly model?: string;
  generateQuestionPack(request: FamilyTriviaAiPackRequest): Promise<unknown>;
}

export interface FamilyTriviaPackLoadResult {
  pack: FamilyTriviaQuestionPack;
  usedFallback: boolean;
  rejectionReason?: string;
}

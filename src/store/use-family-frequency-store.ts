import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { z } from 'zod';
import { useFamilyClubStore } from './use-family-club-store';
import { frequencyRecord } from '../features/family-club/records';

import {
  advanceFamilyTriviaQuestion,
  answerFitsFamilyTriviaQuestion,
  createFamilyTriviaSession,
  familyTriviaTeamRateBasisPoints,
  familyTriviaAnswerSchema,
  familyTriviaQuestionPackSchema,
  familyTriviaSetupSchema,
  revealFamilyTriviaQuestion,
  reviewFamilyTriviaTextGuess,
  skipFamilyTriviaQuestion,
  submitFamilyTriviaGuess,
  submitFamilyTriviaReference,
  validateFamilyTriviaPackForSetup,
  type FamilyTriviaAnswer,
  type FamilyTriviaQuestionPack,
  type FamilyTriviaOwnerVerdict,
  type FamilyTriviaSessionState,
  type FamilyTriviaSetup,
} from '../domain/family-trivia';
import type { FamilyFrequencyStyle } from '../features/trivia/family-frequency-ai-client';
import { buildFrequencyScoreboard } from '../features/trivia/frequency-scoreboard';
import {
  emptyFamilyFrequencyVarietyLedger,
  parseFamilyFrequencyVarietyLedger,
  recordFamilyFrequencyPack,
  type FamilyFrequencyVarietyLedger,
} from '../features/trivia/family-frequency-variety';

export type FamilyFrequencyFormat = 'everyone' | 'teams';

export interface FamilyFrequencyResult {
  id: string;
  playedAt: string;
  format: FamilyFrequencyFormat;
  roundCount: number;
  source: 'ai' | 'offline';
  winners: readonly string[];
  scores: readonly {
    exactMatches?: number;
    label: string;
    opportunities?: number;
    points: number;
  }[];
}

interface FamilyFrequencyState {
  hydrated: boolean;
  names: string[];
  format: FamilyFrequencyFormat;
  questionCount: 4 | 8 | 12;
  session?: FamilyTriviaSessionState;
  gameStartedAt?: number;
  source: 'ai' | 'offline';
  history: FamilyFrequencyResult[];
  activeStyle: FamilyFrequencyStyle;
  varietyLedger: FamilyFrequencyVarietyLedger;
  setNames(names: string[]): void;
  setFormat(format: FamilyFrequencyFormat): void;
  setQuestionCount(questionCount: 4 | 8 | 12): void;
  startGame(setup: FamilyTriviaSetup, pack: FamilyTriviaQuestionPack, style?: FamilyFrequencyStyle): void;
  submitReference(playerId: string, answer: FamilyTriviaAnswer): boolean;
  submitGuess(playerId: string, answer: FamilyTriviaAnswer): boolean;
  reveal(): boolean;
  reviewTextGuess(respondentPlayerId: string, verdict: FamilyTriviaOwnerVerdict): boolean;
  advance(): boolean;
  skip(playerId: string): boolean;
  clearGame(): void;
}

const DEFAULT_NAMES = ['Noor', 'Mara', 'Samir'];
const STORAGE_KEY = 'housewire-family-frequency-v1';

const safeId = z.string().min(1).max(96).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const scoreSchema = z.object({
  points: z.number().int().min(0).max(10_000),
  exactMatches: z.number().int().min(0).max(100),
}).strict();
const playerScoreSchema = scoreSchema.extend({ playerId: safeId });
const teamScoreSchema = scoreSchema.extend({
  teamId: safeId,
  opportunities: z.number().int().min(0).max(100).default(0),
});
const questionResultSchema = z.object({
  questionId: safeId,
  skipped: z.boolean(),
  playerPoints: z.array(z.object({
    playerId: safeId,
    points: z.number().int().min(0).max(4),
    exact: z.boolean(),
    authorityReviewed: z.literal(true).optional(),
  }).strict()).max(3),
}).strict();
const sessionSchema = z.object({
  id: safeId,
  pack: familyTriviaQuestionPackSchema,
  setup: familyTriviaSetupSchema,
  phase: z.enum(['reference', 'guessing', 'revealed', 'complete']),
  questionIndex: z.number().int().min(0).max(15),
  revision: z.number().int().min(0).max(100_000),
  referenceAnswers: z.record(safeId, familyTriviaAnswerSchema),
  guesses: z.record(safeId, z.record(safeId, familyTriviaAnswerSchema)),
  playerScores: z.array(playerScoreSchema).min(2).max(4),
  teamScores: z.array(teamScoreSchema).max(2),
  results: z.array(questionResultSchema).max(16),
}).strict();
const historyResultSchema = z.object({
  id: safeId,
  playedAt: z.string().min(1).max(40).refine((value) => Number.isFinite(Date.parse(value))),
  format: z.enum(['everyone', 'teams']),
  roundCount: z.number().int().min(1).max(12),
  source: z.enum(['ai', 'offline']),
  winners: z.array(z.string().trim().min(1).max(24)).max(4),
  scores: z.array(z.object({
    exactMatches: z.number().int().min(0).max(100).optional(),
    label: z.string().trim().min(1).max(24),
    opportunities: z.number().int().min(0).max(100).optional(),
    points: z.number().int().min(0).max(10_000),
  }).strict()).min(1).max(4),
}).strict();

let mutationVersion = 0;

export function familyFrequencySetupIssue(
  names: readonly string[],
  format: FamilyFrequencyFormat,
): string | undefined {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length < 2 || clean.length > 4 || clean.length !== names.length) {
    return 'Use 2–4 different names.';
  }
  if (new Set(clean.map((name) => name.toLocaleLowerCase())).size !== clean.length) {
    return 'Use 2–4 different names.';
  }
  if (format === 'teams' && clean.length !== 4) {
    return 'Team Frequency needs 4 players: two real partners on each side.';
  }
  return undefined;
}

export const useFamilyFrequencyStore = create<FamilyFrequencyState>()((set, get) => ({
  hydrated: false,
  names: [...DEFAULT_NAMES],
  format: 'everyone',
  questionCount: 8,
  source: 'offline',
  history: [],
  activeStyle: 'mixed',
  varietyLedger: emptyFamilyFrequencyVarietyLedger(),
  setNames: (names) => {
    mutationVersion += 1;
    set({ names: sanitiseNames(names) });
  },
  setFormat: (format) => {
    mutationVersion += 1;
    set({ format });
  },
  setQuestionCount: (questionCount) => {
    mutationVersion += 1;
    set({ questionCount });
  },
  startGame: (setup, pack, style = 'mixed') => {
    mutationVersion += 1;
    set({
      session: createFamilyTriviaSession(setup, pack, `frequency-${pack.seed.toString(36)}-${Date.now().toString(36)}`),
      gameStartedAt: Date.now(),
      source: pack.source.kind === 'ai' ? 'ai' : 'offline',
      activeStyle: style,
      varietyLedger: recordFamilyFrequencyPack(
        get().varietyLedger,
        pack,
        style,
        setup.players.map((player) => player.name),
      ),
    });
  },
  submitReference: (playerId, answer) => {
    const session = get().session;
    if (!session) return false;
    const result = submitFamilyTriviaReference(session, playerId, answer);
    if (result.accepted) {
      mutationVersion += 1;
      set({ session: result.state });
    }
    return result.accepted;
  },
  submitGuess: (playerId, answer) => {
    const session = get().session;
    if (!session) return false;
    const result = submitFamilyTriviaGuess(session, playerId, answer);
    if (result.accepted) {
      mutationVersion += 1;
      set({ session: result.state });
    }
    return result.accepted;
  },
  reveal: () => {
    const session = get().session;
    if (!session) return false;
    const result = revealFamilyTriviaQuestion(session, session.setup.hostPlayerId);
    if (result.accepted) {
      mutationVersion += 1;
      set({ session: result.state });
    }
    return result.accepted;
  },
  reviewTextGuess: (respondentPlayerId, verdict) => {
    const session = get().session;
    const question = session ? session.pack.questions[session.questionIndex] : undefined;
    if (!session || !question) return false;
    const result = reviewFamilyTriviaTextGuess(
      session,
      question.authorityPlayerId,
      respondentPlayerId,
      verdict,
    );
    if (result.accepted) {
      mutationVersion += 1;
      set({ session: result.state });
    }
    return result.accepted;
  },
  advance: () => {
    const current = get();
    if (!current.session) return false;
    const result = advanceFamilyTriviaQuestion(current.session, current.session.setup.hostPlayerId);
    if (!result.accepted) return false;
    mutationVersion += 1;
    if (result.state.phase === 'complete') {
      const summary = summariseResult(result.state, current.source);
      useFamilyClubStore.getState().record(frequencyRecord(result.state, current.source, current.gameStartedAt));
      set({
        session: result.state,
        history: [summary, ...current.history.filter((entry) => entry.id !== summary.id)].slice(0, 20),
      });
    } else {
      set({ session: result.state });
    }
    return true;
  },
  skip: (playerId) => {
    const current = get();
    if (!current.session) return false;
    const result = skipFamilyTriviaQuestion(current.session, playerId);
    if (!result.accepted) return false;
    mutationVersion += 1;
    if (result.state.phase === 'complete') {
      const summary = summariseResult(result.state, current.source);
      useFamilyClubStore.getState().record(frequencyRecord(result.state, current.source, current.gameStartedAt));
      set({
        session: result.state,
        history: [summary, ...current.history.filter((entry) => entry.id !== summary.id)].slice(0, 20),
      });
    } else {
      set({ session: result.state });
    }
    return true;
  },
  clearGame: () => {
    mutationVersion += 1;
    set({ session: undefined, gameStartedAt: undefined, source: 'offline' });
  },
}));

function sanitiseNames(names: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const value of names) {
    if (typeof value !== 'string') continue;
    const name = value.trim().slice(0, 24);
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    clean.push(name);
    if (clean.length === 4) break;
  }
  return clean.length >= 2 ? clean : [...DEFAULT_NAMES];
}

function summariseResult(
  state: FamilyTriviaSessionState,
  source: 'ai' | 'offline',
): FamilyFrequencyResult {
  const teams = state.setup.teams;
  const scores = teams.length
    ? state.teamScores.map((score) => ({
        exactMatches: score.exactMatches,
        label: teams.find((team) => team.id === score.teamId)?.name ?? score.teamId,
        opportunities: score.opportunities,
        points: familyTriviaTeamRateBasisPoints(score),
      }))
    : state.playerScores.map((score) => ({
        label: state.setup.players.find((player) => player.id === score.playerId)?.name ?? score.playerId,
        points: score.points,
        exactMatches: score.exactMatches,
      }));
  // The final screen, saved history, and Family Club share one ranking policy.
  // Equal individual points stay tied; an all-zero board has no winner.
  const winners = buildFrequencyScoreboard(state).entries.filter((entry) => entry.rank === 1).map((entry) => entry.label);
  return {
    id: state.id,
    playedAt: new Date().toISOString(),
    format: teams.length ? 'teams' : 'everyone',
    roundCount: state.results.length,
    source,
    winners,
    scores,
  };
}

interface PersistedFamilyFrequency {
  version: 1;
  format: FamilyFrequencyFormat;
  history: FamilyFrequencyResult[];
  names: string[];
  questionCount: 4 | 8 | 12;
  session?: FamilyTriviaSessionState;
  gameStartedAt?: number;
  source: 'ai' | 'offline';
  activeStyle?: FamilyFrequencyStyle;
  varietyLedger?: FamilyFrequencyVarietyLedger;
}

const hydrationMutationVersion = mutationVersion;
let lastPersistedSuccessfully = '';
let lastQueued = '';
let persistenceQueue = Promise.resolve();

void AsyncStorage.getItem(STORAGE_KEY)
  .then((serialized) => {
    if (mutationVersion !== hydrationMutationVersion) return;
    const restored = parsePersistedFamilyFrequency(serialized);
    useFamilyFrequencyStore.setState({ ...restored, hydrated: true });
  })
  .catch(() => undefined)
  .finally(() => {
    if (!useFamilyFrequencyStore.getState().hydrated) {
      useFamilyFrequencyStore.setState({ hydrated: true });
    }
  });

useFamilyFrequencyStore.subscribe((state) => {
  if (!state.hydrated) return;
  const persisted: PersistedFamilyFrequency = {
    version: 1,
    format: state.format,
    history: state.history,
    names: state.names,
    questionCount: state.questionCount,
    session: state.session,
    gameStartedAt: state.gameStartedAt,
    source: state.source,
    activeStyle: state.activeStyle,
    varietyLedger: state.varietyLedger,
  };
  const serialized = JSON.stringify(persisted);
  queuePersistence(serialized);
});

function parsePersistedFamilyFrequency(serialized: string | null): Partial<FamilyFrequencyState> {
  if (!serialized) return {};
  const value = JSON.parse(serialized) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const session = parsePersistedSession(record.session);
  const history = Array.isArray(record.history)
    ? record.history.flatMap((entry) => {
        const parsed = historyResultSchema.safeParse(entry);
        return parsed.success ? [parsed.data as FamilyFrequencyResult] : [];
      }).slice(0, 20)
    : [];
  return {
    format: record.format === 'teams' ? 'teams' : 'everyone',
    history,
    names: Array.isArray(record.names) ? restorePersistedNames(record.names) : [...DEFAULT_NAMES],
    questionCount: record.questionCount === 4 || record.questionCount === 12 ? record.questionCount : 8,
    session,
    gameStartedAt: typeof record.gameStartedAt === 'number' && Number.isFinite(record.gameStartedAt) && record.gameStartedAt > 0 ? record.gameStartedAt : undefined,
    source: session?.pack.source.kind === 'ai' ? 'ai' : 'offline',
    activeStyle: record.activeStyle === 'everyday' || record.activeStyle === 'playful' ? record.activeStyle : 'mixed',
    varietyLedger: parseFamilyFrequencyVarietyLedger(record.varietyLedger),
  };
}

function restorePersistedNames(values: readonly unknown[]): string[] {
  const legacyDefaults = values.length === 3 && values.every((value, index) =>
    typeof value === 'string' && value.trim().toLocaleLowerCase() === ['you', 'mara', 'samir'][index],
  );
  return legacyDefaults ? [...DEFAULT_NAMES] : sanitiseNames(values);
}

function parsePersistedSession(value: unknown): FamilyTriviaSessionState | undefined {
  const parsed = sessionSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const session = parsed.data as FamilyTriviaSessionState;
  try {
    validateFamilyTriviaPackForSetup(session.pack, session.setup);
    if (session.questionIndex >= session.pack.questions.length) return undefined;
    const expectedResults = session.phase === 'complete'
      ? session.pack.questions.length
      : session.phase === 'revealed'
        ? session.questionIndex + 1
        : session.questionIndex;
    if (session.results.length !== expectedResults) return undefined;
    if (session.results.some((result, index) => result.questionId !== session.pack.questions[index]?.id)) return undefined;

    const questions = new Map(session.pack.questions.map((question) => [question.id, question]));
    for (const [questionId, answer] of Object.entries(session.referenceAnswers)) {
      const question = questions.get(questionId);
      if (!question || !answerFitsFamilyTriviaQuestion(answer, question)) return undefined;
    }
    for (const [questionId, guesses] of Object.entries(session.guesses)) {
      const question = questions.get(questionId);
      if (!question) return undefined;
      for (const [playerId, answer] of Object.entries(guesses)) {
        if (!question.respondentPlayerIds.includes(playerId) || !answerFitsFamilyTriviaQuestion(answer, question)) return undefined;
      }
    }
    if (!scoresMatchResults(session)) return undefined;
    return session;
  } catch {
    return undefined;
  }
}

function scoresMatchResults(session: FamilyTriviaSessionState): boolean {
  const expectedPlayers = new Map(session.setup.players.map((player) => [player.id, { points: 0, exactMatches: 0 }]));
  for (const result of session.results) {
    if (result.skipped && result.playerPoints.length) return false;
    const question = session.pack.questions.find((candidate) => candidate.id === result.questionId);
    if (!question) return false;
    const seen = new Set<string>();
    for (const score of result.playerPoints) {
      if (seen.has(score.playerId) || !question.respondentPlayerIds.includes(score.playerId)) return false;
      seen.add(score.playerId);
      const total = expectedPlayers.get(score.playerId);
      if (!total) return false;
      total.points += score.points;
      total.exactMatches += score.exact ? 1 : 0;
    }
    if (!session.setup.teams.length && !result.skipped) {
      const owner = expectedPlayers.get(question.authorityPlayerId);
      if (!owner) return false;
      owner.points += result.playerPoints.filter((entry) => entry.exact).length;
    }
  }
  if (session.playerScores.length !== expectedPlayers.size || session.playerScores.some((score) => {
    const expected = expectedPlayers.get(score.playerId);
    return !expected || score.points !== expected.points || score.exactMatches !== expected.exactMatches;
  })) return false;

  const expectedTeams = new Map(session.setup.teams.map((team) => [team.id, {
    points: 0,
    exactMatches: 0,
    opportunities: 0,
  }]));
  for (const result of session.results) {
    if (result.skipped) continue;
    for (const team of session.setup.teams) {
      const expected = expectedTeams.get(team.id);
      if (!expected) return false;
      const entries = result.playerPoints.filter((entry) => team.memberPlayerIds.includes(entry.playerId));
      expected.opportunities += entries.length;
      expected.exactMatches += entries.filter((entry) => entry.exact).length;
      expected.points = familyTriviaTeamRateBasisPoints(expected);
    }
  }
  return session.teamScores.length === expectedTeams.size && session.teamScores.every((score) => {
    const expected = expectedTeams.get(score.teamId);
    return Boolean(expected && score.points === expected.points && score.exactMatches === expected.exactMatches &&
      score.opportunities === expected.opportunities);
  });
}

function queuePersistence(serialized: string): void {
  if (serialized === lastQueued || serialized === lastPersistedSuccessfully) return;
  lastQueued = serialized;
  persistenceQueue = persistenceQueue.then(async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, serialized);
        lastPersistedSuccessfully = serialized;
        return;
      } catch {
        // One immediate retry prevents a transient storage failure from silently
        // dropping the completed round. Later state changes remain serialized.
      }
    }
  });
}

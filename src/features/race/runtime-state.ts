import { z } from 'zod';

import type { CompiledCircuitRace } from '../../domain/circuit-race';
import type { TeamEscapeRaceStageInput } from '../../domain/team-escape-race';
import { isTeamEscapeRaceTerminal } from '../../domain/team-escape-race';
import { circuitRaceAnswerReviewSchema } from './protocol';
import type { CircuitRacePlayerSnapshot } from './protocol';

const safeIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const playedAtSchema = z.string().min(20).max(40).refine((value) => Number.isFinite(Date.parse(value)));

const circuitRaceResultSchema = z.object({
  id: safeIdSchema,
  playedAt: playedAtSchema,
  mode: z.enum(['live', 'practice']),
  winningTeamIds: z.array(safeIdSchema).max(4),
  standings: z.array(z.object({
    teamId: safeIdSchema,
    elapsedMs: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    failed: z.boolean().optional(),
    failureReason: z.enum(['attempts', 'time']).optional(),
  }).strict()).min(2).max(4),
  answerReview: circuitRaceAnswerReviewSchema.optional(),
}).strict().superRefine((result, context) => {
  const teamIds = result.standings.map((standing) => standing.teamId);
  if (new Set(teamIds).size !== teamIds.length) {
    context.addIssue({ code: 'custom', message: 'Race result teams must be unique.', path: ['standings'] });
  }
  if (
    new Set(result.winningTeamIds).size !== result.winningTeamIds.length ||
    result.winningTeamIds.some((teamId) => !teamIds.includes(teamId) || result.standings.find((row) => row.teamId === teamId)?.failed)
  ) {
    context.addIssue({ code: 'custom', message: 'Race winners must be unique result teams.', path: ['winningTeamIds'] });
  }
});

const persistedSchema = z.object({
  version: z.literal(1),
  launchMode: z.enum(['live', 'practice']),
  seed: z.number().int().min(0).max(0xffff_ffff),
  history: z.array(circuitRaceResultSchema).max(20),
}).strict();

const legacyPersistedSchema = z.object({
  history: z.array(circuitRaceResultSchema).max(20).optional(),
}).strict();

export type CircuitRaceResult = z.infer<typeof circuitRaceResultSchema>;

export interface PersistedCircuitRaceState {
  version: 1;
  launchMode: 'live' | 'practice';
  seed: number;
  history: CircuitRaceResult[];
}

/** Uses the platform CSPRNG when exposed and never derives puzzle content from the wall clock. */
export function createCircuitRaceContentSeed(): number {
  const values = new Uint32Array(1);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(values);
    return values[0];
  }
  // Older Expo runtimes may not expose Web Crypto. Math.random keeps the
  // fallback seed independent of the visible creation timestamp.
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

export function circuitRaceStageInputs(
  course: CompiledCircuitRace,
): TeamEscapeRaceStageInput[] {
  return course.stages.map((stage) => ({
    id: stage.id,
    label: stage.title,
    proofIds: [stage.proofId],
  }));
}

export function circuitRaceResultFromSnapshot(
  snapshot: CircuitRacePlayerSnapshot,
  playedAt: number | Date = Date.now(),
): CircuitRaceResult | undefined {
  const progress = [
    {
      teamId: snapshot.ownTeam.teamId,
      finishedAt: snapshot.ownTeam.finishedAt,
      failedAt: snapshot.ownTeam.failedAt,
      failureReason: snapshot.ownTeam.failureReason,
    },
    ...snapshot.opponents,
  ];
  if (!progress.every(isTeamEscapeRaceTerminal)) return undefined;
  const firstAt = Math.min(...progress.filter((team) => team.finishedAt !== undefined).map((team) => team.finishedAt!));
  const date = playedAt instanceof Date ? playedAt : new Date(playedAt);
  if (!Number.isFinite(date.getTime())) return undefined;
  return circuitRaceResultSchema.parse({
    id: snapshot.operationId,
    playedAt: date.toISOString(),
    mode: snapshot.mode,
    winningTeamIds: progress
      .filter((team) => team.finishedAt !== undefined && team.finishedAt - firstAt <= snapshot.tieWindowMs)
      .map((team) => team.teamId),
    standings: progress.map((team) => ({
      teamId: team.teamId,
      elapsedMs: Math.max(0, (team.finishedAt ?? team.failedAt!) - snapshot.startsAt),
      ...(team.failedAt !== undefined ? { failed: true, failureReason: team.failureReason } : {}),
    })),
    answerReview: snapshot.answerReview,
  });
}

export function parsePersistedCircuitRaceState(serialized: string): PersistedCircuitRaceState | undefined {
  try {
    const value = JSON.parse(serialized) as unknown;
    const parsed = persistedSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    const legacy = legacyPersistedSchema.safeParse(value);
    if (!legacy.success) return undefined;
    return {
      version: 1,
      launchMode: 'practice',
      seed: 1,
      history: legacy.data.history ?? [],
    };
  } catch {
    return undefined;
  }
}

export function serializeCircuitRaceState(value: {
  launchMode: 'live' | 'practice';
  seed: number;
  history: readonly CircuitRaceResult[];
}): string {
  return JSON.stringify(persistedSchema.parse({
    version: 1,
    launchMode: value.launchMode,
    seed: value.seed,
    history: [...value.history].slice(0, 20),
  }));
}

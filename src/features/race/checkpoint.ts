import { z } from 'zod';
import { teamEscapeRaceParticipantSchema, teamEscapeRaceStageSchema, type TeamEscapeRaceState } from '../../domain/team-escape-race';
import { circuitRacePlayerSnapshotSchema, type CircuitRacePlayerSnapshot } from './protocol';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const timestamp = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const authoritySchema = z.object({
  acceptedEventIds: z.array(id).max(128), hostNodeId: id, mode: z.enum(['live', 'practice']), operationId: id,
  participants: z.array(teamEscapeRaceParticipantSchema).min(2).max(4), revision: timestamp, seed: z.number().int().min(0).max(0xffff_ffff),
  stages: z.array(teamEscapeRaceStageSchema).length(4), startsAt: timestamp, tieWindowMs: z.number().int().min(0).max(5000),
  teams: z.array(z.object({
    teamId: id, memberNodeIds: z.array(id).min(1).max(2), stageIndex: z.number().int().min(0).max(3), stageStartedAt: timestamp,
    finishedAt: timestamp.optional(), failedAt: timestamp.optional(), failureReason: z.enum(['attempts', 'time']).optional(),
    mistakes: z.number().int().min(0).max(4).optional(), missedStageIds: z.array(id).max(4).optional(), rejectedRequestIds: z.array(id).max(4).optional(),
    acceptedProofs: z.array(z.object({ acceptedAt: timestamp, eventId: id, nodeId: id, proofId: id }).strict()).max(8),
  }).strict()).length(2),
}).strict().superRefine((state, context) => {
  const members = state.teams.flatMap((team) => team.memberNodeIds);
  if (new Set(members).size !== members.length || state.participants.some((player) => !members.includes(player.nodeId)) || !members.includes(state.hostNodeId)) {
    context.addIssue({ code: 'custom', message: 'Checkpoint participants must match its crews.' });
  }
  for (const team of state.teams) {
    if ((team.failedAt !== undefined && team.finishedAt !== undefined) || (team.failedAt === undefined) !== (team.failureReason === undefined) || team.failureReason === 'attempts' && team.mistakes !== 4 || team.finishedAt !== undefined && team.stageIndex !== 3) {
      context.addIssue({ code: 'custom', message: 'Invalid terminal checkpoint.' });
    }
    if ((team.rejectedRequestIds?.length ?? 0) !== (team.mistakes ?? 0)) context.addIssue({ code: 'custom', message: 'Checkpoint cannot erase spent tries.' });
  }
});

const checkpointSchema = z.object({
  version: z.literal(1), key: z.string().min(1).max(250),
  authority: authoritySchema.optional(), snapshot: circuitRacePlayerSnapshotSchema,
}).strict().superRefine((value, context) => {
  if (value.authority && (value.authority.operationId !== value.snapshot.operationId || value.authority.revision !== value.snapshot.revision)) {
    context.addIssue({ code: 'custom', message: 'Checkpoint authority and private view must agree.' });
  }
});

export interface CircuitRaceCheckpoint { version: 1; key: string; authority?: TeamEscapeRaceState; snapshot: CircuitRacePlayerSnapshot }

export function serializeCircuitRaceCheckpoint(value: CircuitRaceCheckpoint): string {
  return JSON.stringify(checkpointSchema.parse(value));
}

export function parseCircuitRaceCheckpoint(serialized: string, expectedKey: string): CircuitRaceCheckpoint | undefined {
  try {
    const result = checkpointSchema.safeParse(JSON.parse(serialized));
    return result.success && result.data.key === expectedKey ? result.data : undefined;
  } catch { return undefined; }
}

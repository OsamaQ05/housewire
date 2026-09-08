import { z } from 'zod';

import {
  teamEscapeRaceProofEventSchema,
  teamEscapeRaceStageSchema,
  teamEscapeRaceStartEventSchema,
  type TeamEscapeRaceAcceptedProof,
  type TeamEscapeRaceProofEvent,
  type TeamEscapeRaceProofRejectionReason,
  type TeamEscapeRaceStage,
  type TeamEscapeRaceStartEvent,
} from '../../domain/team-escape-race';
import type { CircuitRaceMechanic, CircuitRaceSubmission } from '../../domain/circuit-race';

import { circuitRaceDisplayCourseSchema } from './course-projection';

export const CIRCUIT_RACE_DIRECT_PROTOCOL_VERSION = 1 as const;
export const CIRCUIT_RACE_MINIMUM_LIVE_PLAYERS = 2;
export const CIRCUIT_RACE_MAXIMUM_LIVE_PLAYERS = 4;

/** Circuit Race is intentionally symmetric: 1v1 or 2v2, never 2v1. */
export function isCircuitRaceLivePlayerCount(count: number): boolean {
  return count === CIRCUIT_RACE_MINIMUM_LIVE_PLAYERS || count === CIRCUIT_RACE_MAXIMUM_LIVE_PLAYERS;
}

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const safeIdSchema = z.string().regex(SAFE_ID, 'Use a relay-safe identifier.');
const timestampSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const signatureSchema = z.string().regex(/^cr1_[a-z0-9]{7}$/);

const circuitRaceCodeSubmissionSchema = z.object({
  code: z.string().regex(/^\d{4}$/),
  mechanic: z.enum(['sequence-cipher', 'breaker-code']),
}).strict();

const circuitRaceKnockSubmissionSchema = z.union([
  z.object({
    mechanic: z.literal('knock-pattern'),
    mode: z.literal('timed'),
    pressDurationsMs: z.array(z.number().int().min(20).max(2_000)).length(5),
  }).strict(),
  z.object({
    mechanic: z.literal('knock-pattern'),
    mode: z.literal('accessible'),
    pattern: z.array(z.enum(['SHORT', 'LONG'])).length(5),
  }).strict(),
]);

const circuitRaceFlatSubmissionSchema = z.union([
  z.object({
    mechanic: z.literal('flat-phone'),
    mode: z.literal('sensor'),
    samples: z.array(z.object({
      at: timestampSchema,
      gravityZ: z.number().finite().min(-1.5).max(1.5),
      pitchDegrees: z.number().finite().min(-180).max(180),
      rollDegrees: z.number().finite().min(-180).max(180),
    }).strict()).min(5).max(80),
  }).strict(),
  z.object({
    heldMs: z.number().int().min(0).max(30_000),
    mechanic: z.literal('flat-phone'),
    mode: z.literal('manual-hold'),
  }).strict(),
]);

export const circuitRaceSubmissionSchema: z.ZodType<CircuitRaceSubmission> = z.union([
  circuitRaceCodeSubmissionSchema,
  circuitRaceKnockSubmissionSchema,
  circuitRaceFlatSubmissionSchema,
]);

const publicParticipantSchema = z.object({
  nodeId: safeIdSchema,
  label: z.string().trim().min(1).max(40),
  simulated: z.boolean(),
  teamId: safeIdSchema,
}).strict();

const acceptedProofSchema = z.object({
  acceptedAt: timestampSchema,
  eventId: safeIdSchema,
  nodeId: safeIdSchema,
  proofId: safeIdSchema,
}).strict();

const ownTeamSchema = z.object({
  teamId: safeIdSchema,
  stageIndex: z.number().int().min(0).max(11),
  stageStartedAt: timestampSchema,
  finishedAt: timestampSchema.optional(),
  acceptedProofs: z.array(acceptedProofSchema).max(8),
}).strict();

const opponentProgressSchema = z.object({
  teamId: safeIdSchema,
  stageIndex: z.number().int().min(0).max(11),
  acceptedProofCount: z.number().int().min(0).max(8),
  finishedAt: timestampSchema.optional(),
}).strict();

const unsignedPlayerSnapshotSchema = z.object({
  raceId: safeIdSchema,
  operationId: safeIdSchema,
  recipientNodeId: safeIdSchema,
  hostNodeId: safeIdSchema,
  mode: z.enum(['live', 'practice']),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  assignmentSeed: z.number().int().min(0).max(0xffff_ffff),
  startsAt: timestampSchema,
  tieWindowMs: z.number().int().min(0).max(5_000),
  participants: z.array(publicParticipantSchema).min(2).max(CIRCUIT_RACE_MAXIMUM_LIVE_PLAYERS),
  stages: z.array(teamEscapeRaceStageSchema).min(1).max(12),
  course: circuitRaceDisplayCourseSchema,
  ownTeam: ownTeamSchema,
  opponents: z.array(opponentProgressSchema).length(1),
}).strict();

export const circuitRacePlayerSnapshotSchema = unsignedPlayerSnapshotSchema.extend({
  authoritySignature: signatureSchema,
}).strict().superRefine((snapshot, context) => {
  if (snapshot.authoritySignature !== signCircuitRacePlayerSnapshot(snapshot)) {
    context.addIssue({ code: 'custom', message: 'The race snapshot signature is invalid.', path: ['authoritySignature'] });
  }
  validateSnapshotShape(snapshot, context);
});

const unsignedStartMessageSchema = z.object({
  kind: z.literal('circuit-race.start'),
  protocolVersion: z.literal(CIRCUIT_RACE_DIRECT_PROTOCOL_VERSION),
  raceId: safeIdSchema,
  event: teamEscapeRaceStartEventSchema,
  course: circuitRaceDisplayCourseSchema,
}).strict();

const startMessageSchema = unsignedStartMessageSchema.extend({
  authoritySignature: signatureSchema,
}).strict().superRefine((message, context) => {
  if (message.authoritySignature !== signCircuitRaceStart(message.raceId, message.event, message.course)) {
    context.addIssue({ code: 'custom', message: 'The race start signature is invalid.', path: ['authoritySignature'] });
  }
  if (message.event.mode !== 'live') {
    context.addIssue({ code: 'custom', message: 'Direct race starts must use live mode.', path: ['event', 'mode'] });
  }
  if (
    !isCircuitRaceLivePlayerCount(message.event.participants.length)
  ) {
    context.addIssue({ code: 'custom', message: 'A live Circuit Race needs exactly two or four phones.', path: ['event', 'participants'] });
  }
  if (message.event.teamIds.length !== 2 || message.event.assignments.length !== 2) {
    context.addIssue({ code: 'custom', message: 'Circuit Race always has exactly two crews.', path: ['event', 'teamIds'] });
  } else {
    const expectedCrewSize = message.event.participants.length / 2;
    if (message.event.assignments.some((assignment) => assignment.memberNodeIds.length !== expectedCrewSize)) {
      context.addIssue({ code: 'custom', message: 'Circuit Race crews must be symmetric 1v1 or 2v2.', path: ['event', 'assignments'] });
    }
  }
  if (message.event.participants.some((participant) => participant.simulated)) {
    context.addIssue({ code: 'custom', message: 'A live start cannot contain simulated phones.', path: ['event', 'participants'] });
  }
  if (message.event.participants.some((participant) => participant.skill !== 5)) {
    context.addIssue({
      code: 'custom',
      message: 'Live starts use a neutral public skill value; private player ratings are never transmitted.',
      path: ['event', 'participants'],
    });
  }
});

const proofSubmissionMessageSchema = z.object({
  kind: z.literal('circuit-race.proof.submit'),
  protocolVersion: z.literal(CIRCUIT_RACE_DIRECT_PROTOCOL_VERSION),
  raceId: safeIdSchema,
  operationId: safeIdSchema,
  requestId: safeIdSchema,
  event: teamEscapeRaceProofEventSchema,
  submission: circuitRaceSubmissionSchema,
  revealedHintCount: z.number().int().min(0).max(2),
}).strict().superRefine((message, context) => {
  if (message.event.operationId !== message.operationId) {
    context.addIssue({ code: 'custom', message: 'The proof operation does not match its envelope.', path: ['event', 'operationId'] });
  }
  if (message.event.submissionId !== message.requestId) {
    context.addIssue({ code: 'custom', message: 'The proof request id does not match its submission.', path: ['event', 'submissionId'] });
  }
});

const proofRejectionReasonSchema = z.enum([
  'MALFORMED',
  'NOT_AUTHORITY',
  'WRONG_OPERATION',
  'NOT_STARTED',
  'UNTRUSTED_SENDER',
  'TEAM_MISMATCH',
  'TEAM_FINISHED',
  'WRONG_STAGE',
  'UNKNOWN_PROOF',
  'INVALID_PROOF',
  'CLOCK_SKEW',
] satisfies readonly TeamEscapeRaceProofRejectionReason[]);

const proofResultMessageSchema = z.object({
  kind: z.literal('circuit-race.proof.result'),
  protocolVersion: z.literal(CIRCUIT_RACE_DIRECT_PROTOCOL_VERSION),
  raceId: safeIdSchema,
  operationId: safeIdSchema,
  requestId: safeIdSchema,
  accepted: z.boolean(),
  changed: z.boolean(),
  reason: proofRejectionReasonSchema.optional(),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict().superRefine((message, context) => {
  if (message.accepted && message.reason !== undefined) {
    context.addIssue({ code: 'custom', message: 'Accepted proofs cannot carry a rejection reason.', path: ['reason'] });
  }
  if (!message.accepted && message.reason === undefined) {
    context.addIssue({ code: 'custom', message: 'Rejected proofs require a reason.', path: ['reason'] });
  }
  if (message.changed && !message.accepted) {
    context.addIssue({ code: 'custom', message: 'A rejected proof cannot change race state.', path: ['changed'] });
  }
});

const snapshotMessageSchema = z.object({
  kind: z.literal('circuit-race.snapshot'),
  protocolVersion: z.literal(CIRCUIT_RACE_DIRECT_PROTOCOL_VERSION),
  raceId: safeIdSchema,
  operationId: safeIdSchema,
  snapshot: circuitRacePlayerSnapshotSchema,
}).strict().superRefine((message, context) => {
  if (message.raceId !== message.snapshot.raceId) {
    context.addIssue({ code: 'custom', message: 'The snapshot race does not match its envelope.', path: ['snapshot', 'raceId'] });
  }
  if (message.operationId !== message.snapshot.operationId) {
    context.addIssue({ code: 'custom', message: 'The snapshot operation does not match its envelope.', path: ['snapshot', 'operationId'] });
  }
});

const snapshotRequestMessageSchema = z.object({
  kind: z.literal('circuit-race.snapshot.request'),
  protocolVersion: z.literal(CIRCUIT_RACE_DIRECT_PROTOCOL_VERSION),
  raceId: safeIdSchema,
  requestId: safeIdSchema,
  knownOperationId: safeIdSchema.optional(),
  knownRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
}).strict().superRefine((message, context) => {
  if (message.knownRevision !== undefined && message.knownOperationId === undefined) {
    context.addIssue({ code: 'custom', message: 'A known revision requires its operation id.', path: ['knownOperationId'] });
  }
});

export const circuitRaceDirectMessageSchema = z.discriminatedUnion('kind', [
  startMessageSchema,
  proofSubmissionMessageSchema,
  proofResultMessageSchema,
  snapshotMessageSchema,
  snapshotRequestMessageSchema,
]);

export type CircuitRacePublicParticipant = z.infer<typeof publicParticipantSchema>;
export type CircuitRaceOwnTeamSnapshot = z.infer<typeof ownTeamSchema>;
export type CircuitRaceOpponentProgress = z.infer<typeof opponentProgressSchema>;
export type CircuitRacePlayerSnapshot = z.infer<typeof circuitRacePlayerSnapshotSchema>;
export type CircuitRaceStartMessage = z.infer<typeof startMessageSchema>;
export type CircuitRaceProofSubmissionMessage = z.infer<typeof proofSubmissionMessageSchema>;
export type CircuitRaceProofResultMessage = z.infer<typeof proofResultMessageSchema>;
export type CircuitRaceSnapshotMessage = z.infer<typeof snapshotMessageSchema>;
export type CircuitRaceSnapshotRequestMessage = z.infer<typeof snapshotRequestMessageSchema>;
export type CircuitRaceDirectMessage = z.infer<typeof circuitRaceDirectMessageSchema>;

export function makeCircuitRaceStartMessage(
  raceId: string,
  event: TeamEscapeRaceStartEvent,
  course: z.infer<typeof circuitRaceDisplayCourseSchema>,
): CircuitRaceStartMessage {
  const unsigned = unsignedStartMessageSchema.parse({
    kind: 'circuit-race.start',
    protocolVersion: CIRCUIT_RACE_DIRECT_PROTOCOL_VERSION,
    raceId,
    event,
    course,
  });
  return startMessageSchema.parse({
    ...unsigned,
    authoritySignature: signCircuitRaceStart(unsigned.raceId, unsigned.event, unsigned.course),
  });
}

export function makeCircuitRaceSnapshotMessage(
  snapshot: CircuitRacePlayerSnapshot,
): CircuitRaceSnapshotMessage {
  const parsed = circuitRacePlayerSnapshotSchema.parse(snapshot);
  return snapshotMessageSchema.parse({
    kind: 'circuit-race.snapshot',
    protocolVersion: CIRCUIT_RACE_DIRECT_PROTOCOL_VERSION,
    raceId: parsed.raceId,
    operationId: parsed.operationId,
    snapshot: parsed,
  });
}

export function makeCircuitRaceProofSubmissionMessage(input: {
  raceId: string;
  operationId: string;
  requestId: string;
  event: TeamEscapeRaceProofEvent;
  submission: CircuitRaceSubmission;
  revealedHintCount: number;
}): CircuitRaceProofSubmissionMessage {
  return proofSubmissionMessageSchema.parse({
    kind: 'circuit-race.proof.submit',
    protocolVersion: CIRCUIT_RACE_DIRECT_PROTOCOL_VERSION,
    ...input,
  });
}

export function makeCircuitRaceProofResultMessage(input: {
  raceId: string;
  operationId: string;
  requestId: string;
  accepted: boolean;
  changed: boolean;
  reason?: TeamEscapeRaceProofRejectionReason;
  revision: number;
}): CircuitRaceProofResultMessage {
  return proofResultMessageSchema.parse({
    kind: 'circuit-race.proof.result',
    protocolVersion: CIRCUIT_RACE_DIRECT_PROTOCOL_VERSION,
    ...input,
  });
}

export function makeCircuitRaceSnapshotRequestMessage(input: {
  raceId: string;
  requestId: string;
  knownOperationId?: string;
  knownRevision?: number;
}): CircuitRaceSnapshotRequestMessage {
  return snapshotRequestMessageSchema.parse({
    kind: 'circuit-race.snapshot.request',
    protocolVersion: CIRCUIT_RACE_DIRECT_PROTOCOL_VERSION,
    ...input,
  });
}

export function parseCircuitRaceDirectMessage(value: unknown): CircuitRaceDirectMessage | undefined {
  const parsed = circuitRaceDirectMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function createSignedCircuitRacePlayerSnapshot(
  value: Omit<CircuitRacePlayerSnapshot, 'authoritySignature'>,
): CircuitRacePlayerSnapshot {
  const unsigned = unsignedPlayerSnapshotSchema.parse(value);
  return circuitRacePlayerSnapshotSchema.parse({
    ...unsigned,
    authoritySignature: signCircuitRacePlayerSnapshot(unsigned),
  });
}

/**
 * This deterministic signature protects the bounded payload from accidental
 * mutation. Authority comes from the relay-authenticated direct-frame sender;
 * callers must always check that sender separately.
 */
export function signCircuitRaceStart(
  raceId: string,
  event: TeamEscapeRaceStartEvent,
  course: z.infer<typeof circuitRaceDisplayCourseSchema>,
): string {
  const parsedRaceId = safeIdSchema.parse(raceId);
  const parsedEvent = teamEscapeRaceStartEventSchema.parse(event);
  const parsedCourse = circuitRaceDisplayCourseSchema.parse(course);
  return signatureFor('start', { raceId: parsedRaceId, event: parsedEvent, course: parsedCourse });
}

export function signCircuitRacePlayerSnapshot(
  snapshot: Omit<CircuitRacePlayerSnapshot, 'authoritySignature'> | CircuitRacePlayerSnapshot,
): string {
  const { authoritySignature: _ignored, ...unsigned } = snapshot as CircuitRacePlayerSnapshot;
  const parsed = unsignedPlayerSnapshotSchema.parse(unsigned);
  return signatureFor('snapshot', parsed);
}

function validateSnapshotShape(
  snapshot: z.infer<typeof unsignedPlayerSnapshotSchema>,
  context: z.RefinementCtx,
): void {
  const participantIds = snapshot.participants.map((participant) => participant.nodeId);
  const teamIds = [...new Set(snapshot.participants.map((participant) => participant.teamId))];
  const stateStageIds = snapshot.stages.map((stage) => stage.id);
  const courseStageIds = snapshot.course.stages.map((stage) => stage.id);
  if (new Set(participantIds).size !== participantIds.length) {
    context.addIssue({ code: 'custom', message: 'Snapshot participant ids must be unique.', path: ['participants'] });
  }
  if (!participantIds.includes(snapshot.hostNodeId)) {
    context.addIssue({ code: 'custom', message: 'The host must be a race participant.', path: ['hostNodeId'] });
  }
  const recipient = snapshot.participants.find((participant) => participant.nodeId === snapshot.recipientNodeId);
  if (!recipient || recipient.teamId !== snapshot.ownTeam.teamId) {
    context.addIssue({ code: 'custom', message: 'The private team must belong to the snapshot recipient.', path: ['ownTeam', 'teamId'] });
  }
  const opponentIds = snapshot.opponents.map((opponent) => opponent.teamId);
  if (new Set(opponentIds).size !== opponentIds.length || opponentIds.includes(snapshot.ownTeam.teamId)) {
    context.addIssue({ code: 'custom', message: 'Opponent progress must contain unique rival teams only.', path: ['opponents'] });
  }
  const projectedTeamIds = [snapshot.ownTeam.teamId, ...opponentIds].sort();
  if (teamIds.sort().join('|') !== projectedTeamIds.join('|')) {
    context.addIssue({ code: 'custom', message: 'Snapshot progress must cover every assigned team exactly once.', path: ['opponents'] });
  }
  const teamSizes = projectedTeamIds.map((teamId) =>
    snapshot.participants.filter((participant) => participant.teamId === teamId).length
  );
  const expectedTeamSize = snapshot.participants.length / 2;
  if (
    projectedTeamIds.length !== 2 ||
    snapshot.opponents.length !== 1 ||
    teamSizes.some((size) => size !== expectedTeamSize)
  ) {
    context.addIssue({ code: 'custom', message: 'Snapshot crews must be symmetric 1v1 or 2v2.', path: ['participants'] });
  }
  if (snapshot.mode === 'live' && snapshot.participants.some((participant) => participant.simulated)) {
    context.addIssue({ code: 'custom', message: 'Live snapshots cannot contain simulated phones.', path: ['participants'] });
  }
  if (snapshot.mode === 'live' && !isCircuitRaceLivePlayerCount(snapshot.participants.length)) {
    context.addIssue({ code: 'custom', message: 'A live Circuit Race needs exactly two or four phones.', path: ['participants'] });
  }
  if (stateStageIds.join('|') !== courseStageIds.join('|')) {
    context.addIssue({ code: 'custom', message: 'Display course stages must match race stages.', path: ['course', 'stages'] });
  }
  const ownMemberIds = snapshot.participants
    .filter((participant) => participant.teamId === snapshot.ownTeam.teamId)
    .map((participant) => participant.nodeId)
    .sort((left, right) => left.localeCompare(right));
  const recipientSlot = ownMemberIds.indexOf(snapshot.recipientNodeId);
  const stations = snapshot.course.stages.map((stage) => stage.challenge.station);
  const expectedStations = snapshot.mode === 'practice' || ownMemberIds.length === 1
    ? snapshot.course.stages.map(() => 'FULL')
    : snapshot.course.stages.map((stage) =>
        privateStationForMechanic(stage.mechanic, recipientSlot === 0 ? 0 : 1)
      );
  if (stations.join('|') !== expectedStations.join('|')) {
    context.addIssue({ code: 'custom', message: 'Display stations do not match the snapshot recipient role.', path: ['course', 'stages'] });
  }
  const fragments = snapshot.course.breakerFragments;
  const breakerIsActive = snapshot.ownTeam.stageIndex === snapshot.stages.length - 1;
  if (snapshot.mode === 'practice' || ownMemberIds.length === 1) {
    if (fragments.length !== (breakerIsActive ? 2 : 0)) {
      context.addIssue({ code: 'custom', message: 'Solo and practice breaker strips must appear only on the breaker stage.', path: ['course', 'breakerFragments'] });
    }
  } else if (
    ownMemberIds.length !== 2 ||
    fragments.length !== (breakerIsActive ? 1 : 0) ||
    (breakerIsActive && fragments[0]?.ownerSlot !== recipientSlot)
  ) {
    context.addIssue({ code: 'custom', message: 'A 2v2 breaker strip must appear only for its owner on the breaker stage.', path: ['course', 'breakerFragments'] });
  }
  validateTeamProgress(snapshot.ownTeam, snapshot.stages, context, ['ownTeam']);
  snapshot.opponents.forEach((opponent, index) => {
    validateTeamProgress(opponent, snapshot.stages, context, ['opponents', index]);
  });
  const ownMembers = new Set(
    snapshot.participants
      .filter((participant) => participant.teamId === snapshot.ownTeam.teamId)
      .map((participant) => participant.nodeId),
  );
  if (snapshot.ownTeam.acceptedProofs.some((proof) => !ownMembers.has(proof.nodeId))) {
    context.addIssue({ code: 'custom', message: 'Private proof history may contain only the recipient team.', path: ['ownTeam', 'acceptedProofs'] });
  }
  if (new Set(snapshot.ownTeam.acceptedProofs.map((proof) => proof.eventId)).size !== snapshot.ownTeam.acceptedProofs.length) {
    context.addIssue({ code: 'custom', message: 'Accepted proof event ids must be unique.', path: ['ownTeam', 'acceptedProofs'] });
  }
  if (new Set(snapshot.ownTeam.acceptedProofs.map((proof) => proof.proofId)).size !== snapshot.ownTeam.acceptedProofs.length) {
    context.addIssue({ code: 'custom', message: 'Accepted proof ids must be unique within a stage.', path: ['ownTeam', 'acceptedProofs'] });
  }
  const activeStage = snapshot.stages[snapshot.ownTeam.stageIndex];
  if (activeStage && snapshot.ownTeam.acceptedProofs.some((proof) => !activeStage.proofIds.includes(proof.proofId))) {
    context.addIssue({ code: 'custom', message: 'Private proof history must match the active stage.', path: ['ownTeam', 'acceptedProofs'] });
  }
}

function privateStationForMechanic(
  mechanic: CircuitRaceMechanic,
  slot: 0 | 1,
): 'PLATES' | 'WHEEL' | 'PLAYBACK' | 'CONSOLE' | 'ORIENTATION' | 'GROUND' | 'ODD' | 'EVEN' {
  if (mechanic === 'sequence-cipher') return slot === 0 ? 'PLATES' : 'WHEEL';
  if (mechanic === 'knock-pattern') return slot === 0 ? 'PLAYBACK' : 'CONSOLE';
  if (mechanic === 'flat-phone') return slot === 0 ? 'ORIENTATION' : 'GROUND';
  return slot === 0 ? 'ODD' : 'EVEN';
}

function validateTeamProgress(
  team: { stageIndex: number; finishedAt?: number; acceptedProofCount?: number; acceptedProofs?: readonly TeamEscapeRaceAcceptedProof[] },
  stages: readonly TeamEscapeRaceStage[],
  context: z.RefinementCtx,
  path: PropertyKey[],
): void {
  if (team.stageIndex >= stages.length) {
    context.addIssue({ code: 'custom', message: 'Team progress points past the final stage.', path: [...path, 'stageIndex'] });
    return;
  }
  const count = team.acceptedProofCount ?? team.acceptedProofs?.length ?? 0;
  if (count > stages[team.stageIndex].proofIds.length) {
    context.addIssue({ code: 'custom', message: 'Accepted proof count exceeds the active stage.', path: [...path, 'acceptedProofCount'] });
  }
  if (team.finishedAt !== undefined && team.stageIndex !== stages.length - 1) {
    context.addIssue({ code: 'custom', message: 'A finished team must be on the final stage.', path: [...path, 'finishedAt'] });
  }
}

function signatureFor(scope: string, value: unknown): string {
  let hash = 2_166_136_261;
  const input = `${scope}|${stableSerialize(value)}`;
  for (const character of input) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return `cr1_${(hash >>> 0).toString(36).padStart(7, '0')}`;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
}

export type { TeamEscapeRaceProofRejectionReason };

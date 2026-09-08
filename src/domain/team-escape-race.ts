import { z } from 'zod';

export const TEAM_ESCAPE_RACE_PROTOCOL_VERSION = 1 as const;
export const TEAM_ESCAPE_RACE_DEFAULT_TIE_WINDOW_MS = 750;
export const TEAM_ESCAPE_RACE_MAX_CLOCK_SKEW_MS = 30_000;

const MAXIMUM_PARTICIPANTS = 12;
const MAXIMUM_TEAMS = 4;
const MAXIMUM_STAGES = 12;
const MAXIMUM_PROOFS_PER_STAGE = 8;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

const safeIdSchema = z.string().regex(SAFE_ID, 'Use a relay-safe identifier.');
const timestampSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const uniqueIds = (ids: readonly string[]) => new Set(ids).size === ids.length;

export const teamEscapeRaceParticipantSchema = z
  .object({
    nodeId: safeIdSchema,
    label: z.string().trim().min(1).max(40),
    skill: z.number().finite().min(0).max(10),
    simulated: z.boolean(),
  })
  .strict();

export const teamEscapeRaceStageSchema = z
  .object({
    id: safeIdSchema,
    label: z.string().trim().min(1).max(60),
    proofIds: z.array(safeIdSchema).min(1).max(MAXIMUM_PROOFS_PER_STAGE),
  })
  .strict()
  .refine((stage) => uniqueIds(stage.proofIds), 'Stage proof ids must be unique.');

export const teamEscapeRaceAssignmentSchema = z
  .object({
    teamId: safeIdSchema,
    memberNodeIds: z.array(safeIdSchema).min(1).max(MAXIMUM_PARTICIPANTS),
  })
  .strict()
  .refine((assignment) => uniqueIds(assignment.memberNodeIds), 'A player can appear only once per team.');

export const teamEscapeRaceStartEventSchema = z
  .object({
    kind: z.literal('team-race.start'),
    protocolVersion: z.literal(TEAM_ESCAPE_RACE_PROTOCOL_VERSION),
    operationId: safeIdSchema,
    hostNodeId: safeIdSchema,
    mode: z.enum(['live', 'practice']),
    seed: z.number().int().min(0).max(0xffff_ffff),
    startsAt: timestampSchema,
    tieWindowMs: z.number().int().min(0).max(5_000),
    participants: z
      .array(teamEscapeRaceParticipantSchema)
      .min(2)
      .max(MAXIMUM_PARTICIPANTS),
    teamIds: z.array(safeIdSchema).min(2).max(MAXIMUM_TEAMS),
    assignments: z
      .array(teamEscapeRaceAssignmentSchema)
      .min(2)
      .max(MAXIMUM_TEAMS),
    stages: z.array(teamEscapeRaceStageSchema).min(1).max(MAXIMUM_STAGES),
  })
  .strict()
  .superRefine((event, context) => {
    if (!uniqueIds(event.participants.map((participant) => participant.nodeId))) {
      context.addIssue({ code: 'custom', message: 'Participant ids must be unique.', path: ['participants'] });
    }
    if (!uniqueIds(event.teamIds)) {
      context.addIssue({ code: 'custom', message: 'Team ids must be unique.', path: ['teamIds'] });
    }
    if (!uniqueIds(event.stages.map((stage) => stage.id))) {
      context.addIssue({ code: 'custom', message: 'Stage ids must be unique.', path: ['stages'] });
    }
  });

export const teamEscapeRaceProofEventSchema = z
  .object({
    kind: z.literal('team-race.proof'),
    protocolVersion: z.literal(TEAM_ESCAPE_RACE_PROTOCOL_VERSION),
    operationId: safeIdSchema,
    submissionId: safeIdSchema,
    teamId: safeIdSchema,
    stageId: safeIdSchema,
    stageIndex: z.number().int().min(0).max(MAXIMUM_STAGES - 1),
    proofId: safeIdSchema,
    nodeId: safeIdSchema,
    proofToken: safeIdSchema,
    observedAt: timestampSchema,
  })
  .strict();

export type TeamEscapeRaceParticipant = z.infer<typeof teamEscapeRaceParticipantSchema>;
export type TeamEscapeRaceStage = z.infer<typeof teamEscapeRaceStageSchema>;
export type TeamEscapeRaceAssignment = z.infer<typeof teamEscapeRaceAssignmentSchema>;
export type TeamEscapeRaceStartEvent = z.infer<typeof teamEscapeRaceStartEventSchema>;
export type TeamEscapeRaceProofEvent = z.infer<typeof teamEscapeRaceProofEventSchema>;
export type TeamEscapeRaceMode = TeamEscapeRaceStartEvent['mode'];

export interface TeamEscapeRaceParticipantInput {
  nodeId: string;
  label?: string;
  skill?: number;
  simulated?: boolean;
}

export interface TeamEscapeRaceStageInput {
  id: string;
  label?: string;
  proofIds: readonly string[];
}

export interface CreateTeamEscapeRaceStartInput {
  hostNodeId: string;
  mode?: TeamEscapeRaceMode;
  operationId: string;
  participants: readonly TeamEscapeRaceParticipantInput[];
  seed: number;
  stages: readonly TeamEscapeRaceStageInput[];
  startsAt: number;
  teamIds?: readonly string[];
  tieWindowMs?: number;
}

export interface TeamEscapeRaceAcceptedProof {
  acceptedAt: number;
  eventId: string;
  nodeId: string;
  proofId: string;
}

export interface TeamEscapeRaceTeamState extends TeamEscapeRaceAssignment {
  acceptedProofs: readonly TeamEscapeRaceAcceptedProof[];
  stageIndex: number;
  stageStartedAt: number;
  finishedAt?: number;
}

export interface TeamEscapeRaceState {
  acceptedEventIds: readonly string[];
  hostNodeId: string;
  mode: TeamEscapeRaceMode;
  operationId: string;
  participants: readonly TeamEscapeRaceParticipant[];
  revision: number;
  seed: number;
  stages: readonly TeamEscapeRaceStage[];
  startsAt: number;
  teams: readonly TeamEscapeRaceTeamState[];
  tieWindowMs: number;
}

export interface TeamEscapeRaceFrame<E> {
  event: E;
  eventId: string;
  senderId: string;
  serverTime: number;
}

export type TeamEscapeRaceStartRejectionReason =
  | 'MALFORMED'
  | 'UNTRUSTED_HOST'
  | 'UNFAIR_ASSIGNMENT';

export type TeamEscapeRaceStartAcceptance =
  | { accepted: true; state: TeamEscapeRaceState }
  | { accepted: false; reason: TeamEscapeRaceStartRejectionReason };

export interface TeamEscapeRaceAuthorityContext {
  isAuthority: boolean;
  localNodeId: string;
}

export type TeamEscapeRaceProofRejectionReason =
  | 'MALFORMED'
  | 'NOT_AUTHORITY'
  | 'WRONG_OPERATION'
  | 'NOT_STARTED'
  | 'UNTRUSTED_SENDER'
  | 'TEAM_MISMATCH'
  | 'TEAM_FINISHED'
  | 'WRONG_STAGE'
  | 'UNKNOWN_PROOF'
  | 'INVALID_PROOF'
  | 'CLOCK_SKEW';

export interface TeamEscapeRaceProofReduction {
  accepted: boolean;
  changed: boolean;
  reason?: TeamEscapeRaceProofRejectionReason;
  state: TeamEscapeRaceState;
}

export type TeamEscapeRacePhase = 'countdown' | 'running' | 'complete';
export type TeamEscapeRaceConnectionStatus = 'online' | 'degraded' | 'offline';

export interface TeamEscapeRaceStanding {
  acceptedProofCount: number;
  completedStageCount: number;
  finishedAt?: number;
  provisional: boolean;
  rank?: number;
  teamId: string;
  tied: boolean;
}

export interface TeamEscapeRaceTeamProjection {
  acceptedProofCount: number;
  canSubmit: boolean;
  connectedNodeIds: readonly string[];
  connectionStatus: TeamEscapeRaceConnectionStatus;
  finishedAt?: number;
  offlineNodeIds: readonly string[];
  stageId?: string;
  stageIndex: number;
  teamId: string;
}

export interface TeamEscapeRaceProjection {
  authorityConnected: boolean;
  phase: TeamEscapeRacePhase;
  serverNow: number;
  standings: readonly TeamEscapeRaceStanding[];
  startsInMs: number;
  teams: readonly TeamEscapeRaceTeamProjection[];
}

const DEFAULT_TEAM_IDS = ['amber', 'cyan'] as const;

/**
 * Assigns each player exactly once. Roster sizes differ by at most one, then
 * known skill estimates and a seeded tie-breaker are used to avoid stacked teams.
 */
export function assignFairEscapeRaceTeams(
  participantInputs: readonly TeamEscapeRaceParticipantInput[],
  teamIdInputs: readonly string[] = DEFAULT_TEAM_IDS,
  seed = 0,
): TeamEscapeRaceAssignment[] {
  const participants = normalizeParticipants(participantInputs);
  const teamIds = [...teamIdInputs];
  assertTeamIds(teamIds, participants.length);

  const orderedParticipants = [...participants].sort((left, right) =>
    right.skill - left.skill ||
    seededOrder(seed, `player:${left.nodeId}`) - seededOrder(seed, `player:${right.nodeId}`) ||
    left.nodeId.localeCompare(right.nodeId),
  );
  const working = teamIds.map((teamId) => ({ teamId, memberNodeIds: [] as string[], totalSkill: 0 }));

  for (let index = 0; index < orderedParticipants.length; index += 1) {
    const participant = orderedParticipants[index];
    const smallestRoster = Math.min(...working.map((team) => team.memberNodeIds.length));
    const available = working
      .filter((team) => team.memberNodeIds.length === smallestRoster)
      .sort((left, right) =>
        left.totalSkill - right.totalSkill ||
        seededOrder(seed, `team:${index}:${left.teamId}`) - seededOrder(seed, `team:${index}:${right.teamId}`) ||
        left.teamId.localeCompare(right.teamId),
      );
    const selected = available[0];
    selected.memberNodeIds.push(participant.nodeId);
    selected.totalSkill += participant.skill;
  }

  return working.map(({ teamId, memberNodeIds }) => ({
    teamId,
    memberNodeIds: [...memberNodeIds].sort((left, right) => left.localeCompare(right)),
  }));
}

export function createTeamEscapeRaceStartEvent(
  input: CreateTeamEscapeRaceStartInput,
): TeamEscapeRaceStartEvent {
  const participants = normalizeParticipants(input.participants);
  const teamIds = [...(input.teamIds ?? DEFAULT_TEAM_IDS)];
  const stages = input.stages.map((stage) => ({
    id: stage.id,
    label: stage.label?.trim() || stage.id,
    proofIds: [...stage.proofIds],
  }));
  const assignments = assignFairEscapeRaceTeams(participants, teamIds, input.seed);
  return teamEscapeRaceStartEventSchema.parse({
    kind: 'team-race.start',
    protocolVersion: TEAM_ESCAPE_RACE_PROTOCOL_VERSION,
    operationId: input.operationId,
    hostNodeId: input.hostNodeId,
    mode: input.mode ?? 'live',
    seed: input.seed >>> 0,
    startsAt: input.startsAt,
    tieWindowMs: input.tieWindowMs ?? TEAM_ESCAPE_RACE_DEFAULT_TIE_WINDOW_MS,
    participants,
    teamIds,
    assignments,
    stages,
  });
}

/** Accepts a start only from the expected host and only with canonical fair teams. */
export function acceptTeamEscapeRaceStart(
  frame: TeamEscapeRaceFrame<unknown>,
  expectedHostNodeId: string,
): TeamEscapeRaceStartAcceptance {
  if (!SAFE_ID.test(frame.eventId) || !isSafeTimestamp(frame.serverTime)) {
    return { accepted: false, reason: 'MALFORMED' };
  }
  const parsed = teamEscapeRaceStartEventSchema.safeParse(frame.event);
  if (!parsed.success) return { accepted: false, reason: 'MALFORMED' };
  const event = parsed.data;
  if (frame.senderId !== event.hostNodeId || event.hostNodeId !== expectedHostNodeId) {
    return { accepted: false, reason: 'UNTRUSTED_HOST' };
  }
  if (!event.participants.some((participant) => participant.nodeId === event.hostNodeId)) {
    return { accepted: false, reason: 'MALFORMED' };
  }
  const canonical = assignFairEscapeRaceTeams(event.participants, event.teamIds, event.seed);
  if (!sameAssignments(canonical, event.assignments)) {
    return { accepted: false, reason: 'UNFAIR_ASSIGNMENT' };
  }

  return {
    accepted: true,
    state: {
      acceptedEventIds: [frame.eventId],
      hostNodeId: event.hostNodeId,
      mode: event.mode,
      operationId: event.operationId,
      participants: event.participants.map((participant) => ({ ...participant })),
      revision: 0,
      seed: event.seed,
      stages: event.stages.map((stage) => ({ ...stage, proofIds: [...stage.proofIds] })),
      startsAt: event.startsAt,
      teams: event.assignments.map((assignment) => ({
        ...assignment,
        memberNodeIds: [...assignment.memberNodeIds],
        acceptedProofs: [],
        stageIndex: 0,
        stageStartedAt: event.startsAt,
      })),
      tieWindowMs: event.tieWindowMs,
    },
  };
}

/** Creates a proof for the submitter's own team and current authoritative stage. */
export function createTeamEscapeRaceProofEvent(
  state: TeamEscapeRaceState,
  nodeId: string,
  proofId: string,
  observedAt: number,
  submissionId = `race-proof-${shortHash(`${state.operationId}:${nodeId}:${proofId}:${observedAt}`)}`,
): TeamEscapeRaceProofEvent | undefined {
  const team = state.teams.find((candidate) => candidate.memberNodeIds.includes(nodeId));
  if (!team || team.finishedAt !== undefined) return undefined;
  const stage = state.stages[team.stageIndex];
  if (!stage?.proofIds.includes(proofId)) return undefined;
  const parsed = teamEscapeRaceProofEventSchema.safeParse({
    kind: 'team-race.proof',
    protocolVersion: TEAM_ESCAPE_RACE_PROTOCOL_VERSION,
    operationId: state.operationId,
    submissionId,
    teamId: team.teamId,
    stageId: stage.id,
    stageIndex: team.stageIndex,
    proofId,
    nodeId,
    proofToken: teamEscapeRaceProofToken(state, team.teamId, stage.id, proofId),
    observedAt,
  });
  return parsed.success ? parsed.data : undefined;
}

/**
 * Host-only reducer. `serverTime` is the accepted proof time, so phone clocks
 * cannot win a race by claiming an earlier finish.
 */
export function reduceTeamEscapeRaceProof(
  state: TeamEscapeRaceState,
  frame: TeamEscapeRaceFrame<unknown>,
  context: TeamEscapeRaceAuthorityContext,
): TeamEscapeRaceProofReduction {
  const reject = (reason: TeamEscapeRaceProofRejectionReason): TeamEscapeRaceProofReduction => ({
    accepted: false,
    changed: false,
    reason,
    state,
  });
  if (!context.isAuthority || context.localNodeId !== state.hostNodeId) return reject('NOT_AUTHORITY');
  if (!SAFE_ID.test(frame.eventId) || !isSafeTimestamp(frame.serverTime)) return reject('MALFORMED');
  const parsed = teamEscapeRaceProofEventSchema.safeParse(frame.event);
  if (!parsed.success) return reject('MALFORMED');
  const event = parsed.data;
  if (event.operationId !== state.operationId) return reject('WRONG_OPERATION');
  if (frame.serverTime < state.startsAt) return reject('NOT_STARTED');
  if (event.nodeId !== frame.senderId) return reject('UNTRUSTED_SENDER');
  if (Math.abs(event.observedAt - frame.serverTime) > TEAM_ESCAPE_RACE_MAX_CLOCK_SKEW_MS) {
    return reject('CLOCK_SKEW');
  }
  if (state.acceptedEventIds.includes(frame.eventId)) {
    return { accepted: true, changed: false, state };
  }

  const ownedTeam = state.teams.find((team) => team.memberNodeIds.includes(frame.senderId));
  if (!ownedTeam) return reject('UNTRUSTED_SENDER');
  if (ownedTeam.teamId !== event.teamId) return reject('TEAM_MISMATCH');
  if (ownedTeam.finishedAt !== undefined) return reject('TEAM_FINISHED');
  const stage = state.stages[ownedTeam.stageIndex];
  if (!stage || event.stageIndex !== ownedTeam.stageIndex || event.stageId !== stage.id) {
    return reject('WRONG_STAGE');
  }
  if (!stage.proofIds.includes(event.proofId)) return reject('UNKNOWN_PROOF');
  if (event.proofToken !== teamEscapeRaceProofToken(state, ownedTeam.teamId, stage.id, event.proofId)) {
    return reject('INVALID_PROOF');
  }
  if (ownedTeam.acceptedProofs.some((proof) => proof.proofId === event.proofId)) {
    return { accepted: true, changed: false, state };
  }

  const acceptedProofs = [...ownedTeam.acceptedProofs, {
    acceptedAt: frame.serverTime,
    eventId: frame.eventId,
    nodeId: event.nodeId,
    proofId: event.proofId,
  }].sort((left, right) => left.proofId.localeCompare(right.proofId));
  const completedStage = stage.proofIds.every((proofId) =>
    acceptedProofs.some((proof) => proof.proofId === proofId),
  );
  let updatedTeam: TeamEscapeRaceTeamState = { ...ownedTeam, acceptedProofs };
  if (completedStage) {
    if (ownedTeam.stageIndex >= state.stages.length - 1) {
      updatedTeam = { ...updatedTeam, finishedAt: frame.serverTime };
    } else {
      updatedTeam = {
        ...updatedTeam,
        acceptedProofs: [],
        stageIndex: ownedTeam.stageIndex + 1,
        stageStartedAt: frame.serverTime,
      };
    }
  }

  return {
    accepted: true,
    changed: true,
    state: {
      ...state,
      acceptedEventIds: [...state.acceptedEventIds, frame.eventId],
      revision: state.revision + 1,
      teams: state.teams.map((team) => team.teamId === updatedTeam.teamId ? updatedTeam : team),
    },
  };
}

export function teamEscapeRaceProofToken(
  state: Pick<TeamEscapeRaceState, 'operationId' | 'seed'>,
  teamId: string,
  stageId: string,
  proofId: string,
): string {
  return `T${shortHash(`${state.operationId}|${state.seed >>> 0}|${teamId}|${stageId}|${proofId}`)}`;
}

export function teamEscapeRacePhaseAt(
  state: TeamEscapeRaceState,
  serverNow: number,
): TeamEscapeRacePhase {
  if (serverNow < state.startsAt) return 'countdown';
  return state.teams.every((team) => team.finishedAt !== undefined) ? 'complete' : 'running';
}

export function rankTeamEscapeRace(
  state: TeamEscapeRaceState,
  serverNow: number,
): TeamEscapeRaceStanding[] {
  const finished = state.teams
    .filter((team) => team.finishedAt !== undefined)
    .sort((left, right) => left.finishedAt! - right.finishedAt! || left.teamId.localeCompare(right.teamId));
  const rankByTeam = new Map<string, { rank: number; tied: boolean }>();
  let groupStart = -1;
  let groupMembers: TeamEscapeRaceTeamState[] = [];
  const closeGroup = () => {
    const tied = groupMembers.length > 1;
    const rank = groupStart + 1;
    for (const team of groupMembers) rankByTeam.set(team.teamId, { rank, tied });
  };
  for (let index = 0; index < finished.length; index += 1) {
    const team = finished[index];
    if (
      groupStart < 0 ||
      team.finishedAt! - finished[groupStart].finishedAt! > state.tieWindowMs
    ) {
      if (groupMembers.length) closeGroup();
      groupStart = index;
      groupMembers = [team];
    } else {
      groupMembers.push(team);
    }
  }
  if (groupMembers.length) closeGroup();

  const standings = state.teams.map<TeamEscapeRaceStanding>((team) => {
    const ranked = rankByTeam.get(team.teamId);
    const unfinishedCompetitor = state.teams.some((candidate) => candidate.finishedAt === undefined);
    return {
      acceptedProofCount: team.acceptedProofs.length,
      completedStageCount: team.finishedAt === undefined ? team.stageIndex : state.stages.length,
      finishedAt: team.finishedAt,
      provisional: team.finishedAt !== undefined && unfinishedCompetitor && serverNow <= team.finishedAt + state.tieWindowMs,
      rank: ranked?.rank,
      teamId: team.teamId,
      tied: ranked?.tied ?? false,
    };
  });

  return standings.sort((left, right) => {
    if (left.rank !== undefined || right.rank !== undefined) {
      if (left.rank === undefined) return 1;
      if (right.rank === undefined) return -1;
      return left.rank - right.rank || left.teamId.localeCompare(right.teamId);
    }
    return right.completedStageCount - left.completedStageCount ||
      right.acceptedProofCount - left.acceptedProofCount ||
      left.teamId.localeCompare(right.teamId);
  });
}

/** Connectivity is projected, never written into authoritative race progress. */
export function projectTeamEscapeRace(
  state: TeamEscapeRaceState,
  serverNow: number,
  connectedNodeIds: readonly string[],
): TeamEscapeRaceProjection {
  const connected = new Set(connectedNodeIds);
  const phase = teamEscapeRacePhaseAt(state, serverNow);
  return {
    authorityConnected: connected.has(state.hostNodeId),
    phase,
    serverNow,
    standings: rankTeamEscapeRace(state, serverNow),
    startsInMs: Math.max(0, state.startsAt - serverNow),
    teams: state.teams.map((team) => {
      const online = team.memberNodeIds.filter((nodeId) => connected.has(nodeId));
      const offline = team.memberNodeIds.filter((nodeId) => !connected.has(nodeId));
      const connectionStatus: TeamEscapeRaceConnectionStatus = online.length === 0
        ? 'offline'
        : offline.length > 0
          ? 'degraded'
          : 'online';
      return {
        acceptedProofCount: team.acceptedProofs.length,
        canSubmit: phase === 'running' && team.finishedAt === undefined && online.length > 0,
        connectedNodeIds: online,
        connectionStatus,
        finishedAt: team.finishedAt,
        offlineNodeIds: offline,
        stageId: team.finishedAt === undefined ? state.stages[team.stageIndex]?.id : undefined,
        stageIndex: team.stageIndex,
        teamId: team.teamId,
      };
    }),
  };
}

export interface CreatePracticeTeamEscapeRaceInput {
  localNodeId: string;
  operationId?: string;
  seed: number;
  simulatedPlayerCount?: number;
  stages: readonly TeamEscapeRaceStageInput[];
  startsAt: number;
  teamIds?: readonly string[];
  tieWindowMs?: number;
}

export function createPracticeTeamEscapeRace(
  input: CreatePracticeTeamEscapeRaceInput,
): TeamEscapeRaceState {
  const simulatedPlayerCount = input.simulatedPlayerCount ?? 3;
  if (!Number.isInteger(simulatedPlayerCount) || simulatedPlayerCount < 1 || simulatedPlayerCount >= MAXIMUM_PARTICIPANTS) {
    throw new Error(`Practice requires between 1 and ${MAXIMUM_PARTICIPANTS - 1} simulated players.`);
  }
  const participants: TeamEscapeRaceParticipantInput[] = [
    { nodeId: input.localNodeId, label: 'You', skill: 5, simulated: false },
    ...Array.from({ length: simulatedPlayerCount }, (_, index) => ({
      nodeId: `practice-bot-${index + 1}`,
      label: `Practice phone ${index + 2}`,
      skill: 5,
      simulated: true,
    })),
  ];
  const event = createTeamEscapeRaceStartEvent({
    hostNodeId: input.localNodeId,
    mode: 'practice',
    operationId: input.operationId ?? `practice-${shortHash(`${input.seed}:${input.startsAt}:${input.localNodeId}`)}`,
    participants,
    seed: input.seed,
    stages: input.stages,
    startsAt: input.startsAt,
    teamIds: input.teamIds,
    tieWindowMs: input.tieWindowMs,
  });
  const accepted = acceptTeamEscapeRaceStart({
    event,
    eventId: `practice-start-${shortHash(event.operationId)}`,
    senderId: input.localNodeId,
    serverTime: Math.max(0, input.startsAt - 1_000),
  }, input.localNodeId);
  if (!accepted.accepted) throw new Error(`Could not create practice race: ${accepted.reason}`);
  return accepted.state;
}

export interface PracticeTeamEscapeRaceTickOptions {
  includeLocalTeamBots?: boolean;
  paceMs?: number;
}

export interface PracticeTeamEscapeRaceTickResult {
  generatedFrames: readonly TeamEscapeRaceFrame<TeamEscapeRaceProofEvent>[];
  state: TeamEscapeRaceState;
}

/** Deterministically advances simulated opponents; repeated ticks are idempotent. */
export function simulatePracticeTeamEscapeRace(
  initialState: TeamEscapeRaceState,
  serverNow: number,
  options: PracticeTeamEscapeRaceTickOptions = {},
): PracticeTeamEscapeRaceTickResult {
  if (initialState.mode !== 'practice' || serverNow < initialState.startsAt) {
    return { generatedFrames: [], state: initialState };
  }
  const paceMs = options.paceMs ?? 6_000;
  if (!Number.isFinite(paceMs) || paceMs < 250) throw new Error('Practice pace must be at least 250ms.');
  const localTeamId = initialState.teams.find((team) =>
    team.memberNodeIds.includes(initialState.hostNodeId),
  )?.teamId;
  const participantMap = new Map(initialState.participants.map((participant) => [participant.nodeId, participant]));
  const generatedFrames: TeamEscapeRaceFrame<TeamEscapeRaceProofEvent>[] = [];
  let state = initialState;
  let safety = MAXIMUM_TEAMS * MAXIMUM_STAGES * MAXIMUM_PROOFS_PER_STAGE;

  while (safety > 0) {
    safety -= 1;
    let nextCandidate: { actorId: string; dueAt: number; proofId: string; teamId: string } | undefined;
    for (const team of state.teams) {
      if (team.finishedAt !== undefined) continue;
      if (!options.includeLocalTeamBots && team.teamId === localTeamId) continue;
      const actorId = team.memberNodeIds.find((nodeId) => participantMap.get(nodeId)?.simulated);
      const stage = state.stages[team.stageIndex];
      const proofId = stage?.proofIds.find((candidate) =>
        !team.acceptedProofs.some((proof) => proof.proofId === candidate),
      );
      if (!actorId || !stage || !proofId) continue;
      const dueAt = Math.round(
        team.stageStartedAt +
        paceMs * (team.acceptedProofs.length + 1) +
        seededOrder(state.seed, `${team.teamId}:${stage.id}:${proofId}`) % Math.max(1, Math.round(paceMs * 0.18)),
      );
      if (dueAt > serverNow) continue;
      if (!nextCandidate || dueAt < nextCandidate.dueAt || (dueAt === nextCandidate.dueAt && team.teamId < nextCandidate.teamId)) {
        nextCandidate = { actorId, dueAt, proofId, teamId: team.teamId };
      }
    }
    if (!nextCandidate) break;

    const event = createTeamEscapeRaceProofEvent(
      state,
      nextCandidate.actorId,
      nextCandidate.proofId,
      nextCandidate.dueAt,
      `practice-proof-${shortHash(`${state.operationId}:${nextCandidate.teamId}:${state.revision}`)}`,
    );
    if (!event) break;
    const frame = {
      event,
      eventId: event.submissionId,
      senderId: nextCandidate.actorId,
      serverTime: nextCandidate.dueAt,
    } satisfies TeamEscapeRaceFrame<TeamEscapeRaceProofEvent>;
    const reduction = reduceTeamEscapeRaceProof(state, frame, {
      isAuthority: true,
      localNodeId: state.hostNodeId,
    });
    if (!reduction.accepted || !reduction.changed) break;
    generatedFrames.push(frame);
    state = reduction.state;
  }

  return { generatedFrames, state };
}

function normalizeParticipants(
  participantInputs: readonly TeamEscapeRaceParticipantInput[],
): TeamEscapeRaceParticipant[] {
  const participants = participantInputs.map((participant) => teamEscapeRaceParticipantSchema.parse({
    nodeId: participant.nodeId,
    label: participant.label?.trim() || participant.nodeId,
    skill: participant.skill ?? 5,
    simulated: participant.simulated ?? false,
  }));
  if (participants.length < 2 || participants.length > MAXIMUM_PARTICIPANTS) {
    throw new Error(`A team race requires between 2 and ${MAXIMUM_PARTICIPANTS} players.`);
  }
  if (!uniqueIds(participants.map((participant) => participant.nodeId))) {
    throw new Error('A player can be assigned only once.');
  }
  return participants;
}

function assertTeamIds(teamIds: readonly string[], participantCount: number): void {
  if (
    teamIds.length < 2 ||
    teamIds.length > MAXIMUM_TEAMS ||
    teamIds.length > participantCount ||
    !uniqueIds(teamIds) ||
    !teamIds.every((teamId) => SAFE_ID.test(teamId))
  ) {
    throw new Error('Use two to four unique relay-safe teams, with at least one player per team.');
  }
}

function sameAssignments(
  left: readonly TeamEscapeRaceAssignment[],
  right: readonly TeamEscapeRaceAssignment[],
): boolean {
  return left.length === right.length && left.every((assignment, index) => {
    const candidate = right[index];
    return candidate?.teamId === assignment.teamId &&
      candidate.memberNodeIds.length === assignment.memberNodeIds.length &&
      assignment.memberNodeIds.every((nodeId, nodeIndex) => candidate.memberNodeIds[nodeIndex] === nodeId);
  });
}

function isSafeTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function seededOrder(seed: number, value: string): number {
  return hash(`${seed >>> 0}:${value}`);
}

function shortHash(value: string): string {
  return hash(value).toString(36);
}

function hash(value: string): number {
  let result = 2_166_136_261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

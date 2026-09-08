import {
  CIRCUIT_RACE_STAGE_IDS,
  validateCircuitRaceStage,
  type CircuitRaceSubmission,
  type CompiledCircuitRace,
} from '../../domain/circuit-race';
import {
  acceptTeamEscapeRaceStart,
  createTeamEscapeRaceProofEvent,
  reduceTeamEscapeRaceProof,
  teamEscapeRacePhaseAt,
  teamEscapeRaceProofEventSchema,
  teamEscapeRaceProofToken,
  type TeamEscapeRaceProofReduction,
  type TeamEscapeRaceState,
  type TeamEscapeRaceStanding,
} from '../../domain/team-escape-race';

import {
  createSignedCircuitRacePlayerSnapshot,
  makeCircuitRaceProofSubmissionMessage,
  parseCircuitRaceDirectMessage,
  type CircuitRacePlayerSnapshot,
  type CircuitRaceProofSubmissionMessage,
} from './protocol';
import {
  circuitRaceDisplayCourseSchema,
  projectCircuitRaceCourseForPlayer,
  type CircuitRaceDisplayCourse,
} from './course-projection';

export interface CircuitRaceDirectFrame {
  messageId: string;
  payload: unknown;
  recipientId: string;
  senderId: string;
  serverTime: number;
}

export type CircuitRaceStartFrameRejectionReason =
  | 'MALFORMED'
  | 'WRONG_RACE'
  | 'WRONG_RECIPIENT'
  | 'UNTRUSTED_HOST'
  | 'NOT_PARTICIPANT'
  | 'UNFAIR_ASSIGNMENT';

export type CircuitRaceStartFrameAcceptance =
  | { accepted: true; snapshot: CircuitRacePlayerSnapshot }
  | { accepted: false; reason: CircuitRaceStartFrameRejectionReason };

export type CircuitRaceSnapshotFrameRejectionReason =
  | 'MALFORMED'
  | 'WRONG_RACE'
  | 'WRONG_RECIPIENT'
  | 'UNTRUSTED_HOST'
  | 'STALE_OPERATION';

export type CircuitRaceSnapshotFrameAcceptance =
  | { accepted: true; changed: true; snapshot: CircuitRacePlayerSnapshot }
  | { accepted: true; changed: false; snapshot: CircuitRacePlayerSnapshot }
  | { accepted: false; changed: false; reason: CircuitRaceSnapshotFrameRejectionReason };

export interface CircuitRaceProofFrameReduction {
  reduction: TeamEscapeRaceProofReduction;
  requestId: string;
}

export interface CircuitRacePendingProofCheckpoint {
  operationId: string;
  revision: number;
  stageIndex: number;
}

/** A newer host snapshot can acknowledge progress even if its result frame was lost. */
export function isCircuitRacePendingProofAcknowledged(
  checkpoint: CircuitRacePendingProofCheckpoint,
  snapshot: CircuitRacePlayerSnapshot,
): boolean {
  return snapshot.operationId === checkpoint.operationId &&
    snapshot.revision > checkpoint.revision &&
    (snapshot.ownTeam.finishedAt !== undefined || snapshot.ownTeam.stageIndex > checkpoint.stageIndex);
}

export interface CircuitRaceTeamView {
  acceptedProofCount: number;
  /** Present only for the local team. Rival proof identity remains private. */
  acceptedProofIds?: readonly string[];
  canSubmit: boolean;
  connectedNodeIds: readonly string[];
  connectionStatus: 'online' | 'degraded' | 'offline';
  finishedAt?: number;
  isLocalTeam: boolean;
  memberNodeIds: readonly string[];
  offlineNodeIds: readonly string[];
  stageId?: string;
  stageIndex: number;
  /** Present only for the local team; rival timing remains host-private. */
  stageStartedAt?: number;
  teamId: string;
}

export interface CircuitRacePlayerView {
  authorityConnected: boolean;
  hostNodeId: string;
  localTeamId: string;
  mode: 'live' | 'practice';
  operationId: string;
  participants: CircuitRacePlayerSnapshot['participants'];
  phase: 'countdown' | 'running' | 'complete';
  raceId: string;
  revision: number;
  serverNow: number;
  standings: readonly TeamEscapeRaceStanding[];
  startsAt: number;
  startsInMs: number;
  teams: readonly CircuitRaceTeamView[];
}

/** Builds the only reconnect payload a player may receive. Rival details are counts, never proof records. */
export function createCircuitRacePlayerSnapshot(
  state: TeamEscapeRaceState,
  raceId: string,
  recipientNodeId: string,
  course: CompiledCircuitRace | CircuitRaceDisplayCourse,
): CircuitRacePlayerSnapshot {
  const ownTeam = state.teams.find((team) => team.memberNodeIds.includes(recipientNodeId));
  if (!ownTeam) throw new Error('The snapshot recipient is not assigned to this race.');
  const teamByNode = new Map(
    state.teams.flatMap((team) => team.memberNodeIds.map((nodeId) => [nodeId, team.teamId] as const)),
  );
  return createSignedCircuitRacePlayerSnapshot({
    raceId,
    operationId: state.operationId,
    recipientNodeId,
    hostNodeId: state.hostNodeId,
    mode: state.mode,
    revision: state.revision,
    assignmentSeed: state.seed,
    startsAt: state.startsAt,
    tieWindowMs: state.tieWindowMs,
    participants: state.participants.map((participant) => ({
      nodeId: participant.nodeId,
      label: participant.label,
      simulated: participant.simulated,
      teamId: teamByNode.get(participant.nodeId) ?? '',
    })),
    stages: state.stages.map((stage) => ({ ...stage, proofIds: [...stage.proofIds] })),
    course: 'seed' in course
      ? projectCircuitRaceCourseForPlayer(course, state, recipientNodeId)
      : circuitRaceDisplayCourseSchema.parse(course),
    ownTeam: {
      teamId: ownTeam.teamId,
      stageIndex: ownTeam.stageIndex,
      stageStartedAt: ownTeam.stageStartedAt,
      finishedAt: ownTeam.finishedAt,
      acceptedProofs: ownTeam.acceptedProofs.map((proof) => ({ ...proof })),
    },
    opponents: state.teams
      .filter((team) => team.teamId !== ownTeam.teamId)
      .map((team) => ({
        teamId: team.teamId,
        stageIndex: team.stageIndex,
        acceptedProofCount: team.acceptedProofs.length,
        finishedAt: team.finishedAt,
      })),
  });
}

/**
 * Validates the strict start envelope, relay-authenticated host identity, relay
 * timestamp, and the domain's canonical fair assignment before adopting it.
 */
export function acceptCircuitRaceStartFrame(
  frame: CircuitRaceDirectFrame,
  input: { expectedHostNodeId: string; localNodeId: string; raceId: string },
): CircuitRaceStartFrameAcceptance {
  const message = parseCircuitRaceDirectMessage(frame.payload);
  if (!message || message.kind !== 'circuit-race.start') return { accepted: false, reason: 'MALFORMED' };
  if (message.raceId !== input.raceId) return { accepted: false, reason: 'WRONG_RACE' };
  if (frame.recipientId !== input.localNodeId) return { accepted: false, reason: 'WRONG_RECIPIENT' };
  if (frame.senderId !== input.expectedHostNodeId || message.event.hostNodeId !== input.expectedHostNodeId) {
    return { accepted: false, reason: 'UNTRUSTED_HOST' };
  }
  if (!message.event.participants.some((participant) => participant.nodeId === input.localNodeId)) {
    return { accepted: false, reason: 'NOT_PARTICIPANT' };
  }
  const accepted = acceptTeamEscapeRaceStart({
    event: message.event,
    eventId: frame.messageId,
    senderId: frame.senderId,
    serverTime: frame.serverTime,
  }, input.expectedHostNodeId);
  if (!accepted.accepted) {
    return {
      accepted: false,
      reason: accepted.reason === 'UNFAIR_ASSIGNMENT' ? 'UNFAIR_ASSIGNMENT' :
        accepted.reason === 'UNTRUSTED_HOST' ? 'UNTRUSTED_HOST' : 'MALFORMED',
    };
  }
  try {
    return {
      accepted: true,
      snapshot: createCircuitRacePlayerSnapshot(accepted.state, message.raceId, input.localNodeId, message.course),
    };
  } catch {
    return { accepted: false, reason: 'MALFORMED' };
  }
}

/** Accepts only host-authored, recipient-bound, monotonic reconnect state. */
export function acceptCircuitRaceSnapshotFrame(
  frame: CircuitRaceDirectFrame,
  input: {
    current?: CircuitRacePlayerSnapshot;
    expectedHostNodeId: string;
    localNodeId: string;
    raceId: string;
  },
): CircuitRaceSnapshotFrameAcceptance {
  const message = parseCircuitRaceDirectMessage(frame.payload);
  if (!message || message.kind !== 'circuit-race.snapshot') {
    return { accepted: false, changed: false, reason: 'MALFORMED' };
  }
  if (message.raceId !== input.raceId) {
    return { accepted: false, changed: false, reason: 'WRONG_RACE' };
  }
  if (frame.recipientId !== input.localNodeId || message.snapshot.recipientNodeId !== input.localNodeId) {
    return { accepted: false, changed: false, reason: 'WRONG_RECIPIENT' };
  }
  if (
    frame.senderId !== input.expectedHostNodeId ||
    message.snapshot.hostNodeId !== input.expectedHostNodeId
  ) {
    return { accepted: false, changed: false, reason: 'UNTRUSTED_HOST' };
  }
  const current = input.current;
  if (current && current.operationId !== message.snapshot.operationId) {
    if (message.snapshot.startsAt <= current.startsAt) {
      return { accepted: false, changed: false, reason: 'STALE_OPERATION' };
    }
    return { accepted: true, changed: true, snapshot: message.snapshot };
  }
  if (current && !isMonotonicSameOperationSnapshot(current, message.snapshot)) {
    return { accepted: false, changed: false, reason: 'STALE_OPERATION' };
  }
  if (current && message.snapshot.revision <= current.revision) {
    return { accepted: true, changed: false, snapshot: current };
  }
  return { accepted: true, changed: true, snapshot: message.snapshot };
}

function isMonotonicSameOperationSnapshot(
  current: CircuitRacePlayerSnapshot,
  next: CircuitRacePlayerSnapshot,
): boolean {
  const { breakerFragments: _currentFragments, ...currentCourse } = current.course;
  const { breakerFragments: _nextFragments, ...nextCourse } = next.course;
  if (
    current.raceId !== next.raceId ||
    current.recipientNodeId !== next.recipientNodeId ||
    current.hostNodeId !== next.hostNodeId ||
    current.mode !== next.mode ||
    current.assignmentSeed !== next.assignmentSeed ||
    current.startsAt !== next.startsAt ||
    current.tieWindowMs !== next.tieWindowMs ||
    JSON.stringify(current.participants) !== JSON.stringify(next.participants) ||
    JSON.stringify(current.stages) !== JSON.stringify(next.stages) ||
    JSON.stringify(currentCourse) !== JSON.stringify(nextCourse) ||
    (current.course.breakerFragments.length > 0 &&
      JSON.stringify(current.course.breakerFragments) !== JSON.stringify(next.course.breakerFragments)) ||
    current.ownTeam.teamId !== next.ownTeam.teamId ||
    JSON.stringify(current.opponents.map((team) => team.teamId)) !==
      JSON.stringify(next.opponents.map((team) => team.teamId))
  ) return false;
  if (
    next.ownTeam.stageIndex < current.ownTeam.stageIndex ||
    next.ownTeam.stageStartedAt < current.ownTeam.stageStartedAt ||
    (next.ownTeam.stageIndex === current.ownTeam.stageIndex &&
      next.ownTeam.stageStartedAt !== current.ownTeam.stageStartedAt) ||
    (current.ownTeam.finishedAt !== undefined && next.ownTeam.finishedAt !== current.ownTeam.finishedAt)
  ) return false;
  if (next.ownTeam.stageIndex === current.ownTeam.stageIndex) {
    const nextProofIds = new Set(next.ownTeam.acceptedProofs.map((proof) => proof.proofId));
    if (current.ownTeam.acceptedProofs.some((proof) => !nextProofIds.has(proof.proofId))) return false;
  }
  return current.opponents.every((team, index) => {
    const candidate = next.opponents[index];
    if (!candidate || candidate.stageIndex < team.stageIndex) return false;
    if (team.finishedAt !== undefined && candidate.finishedAt !== team.finishedAt) return false;
    return candidate.stageIndex !== team.stageIndex || candidate.acceptedProofCount >= team.acceptedProofCount;
  });
}

export function createCircuitRaceProofSubmissionFromSnapshot(input: {
  snapshot: CircuitRacePlayerSnapshot;
  nodeId: string;
  proofId: string;
  observedAt: number;
  requestId: string;
  submission: CircuitRaceSubmission;
  revealedHintCount: number;
}): CircuitRaceProofSubmissionMessage | undefined {
  const { snapshot } = input;
  if (
    input.nodeId !== snapshot.recipientNodeId ||
    snapshot.ownTeam.finishedAt !== undefined ||
    !snapshot.participants.some((participant) =>
      participant.nodeId === input.nodeId && participant.teamId === snapshot.ownTeam.teamId,
    )
  ) return undefined;
  const stage = snapshot.stages[snapshot.ownTeam.stageIndex];
  if (
    !stage?.proofIds.includes(input.proofId) ||
    snapshot.ownTeam.acceptedProofs.some((proof) => proof.proofId === input.proofId)
  ) return undefined;
  const event = teamEscapeRaceProofEventSchema.safeParse({
    kind: 'team-race.proof',
    protocolVersion: 1,
    operationId: snapshot.operationId,
    submissionId: input.requestId,
    teamId: snapshot.ownTeam.teamId,
    stageId: stage.id,
    stageIndex: snapshot.ownTeam.stageIndex,
    proofId: input.proofId,
    nodeId: input.nodeId,
    proofToken: teamEscapeRaceProofToken(
      { operationId: snapshot.operationId, seed: snapshot.assignmentSeed },
      snapshot.ownTeam.teamId,
      stage.id,
      input.proofId,
    ),
    observedAt: input.observedAt,
  });
  if (!event.success) return undefined;
  return makeCircuitRaceProofSubmissionMessage({
    raceId: snapshot.raceId,
    operationId: snapshot.operationId,
    requestId: input.requestId,
    event: event.data,
    submission: input.submission,
    revealedHintCount: input.revealedHintCount,
  });
}

export function createCircuitRaceProofSubmissionFromState(input: {
  raceId: string;
  state: TeamEscapeRaceState;
  nodeId: string;
  proofId: string;
  observedAt: number;
  requestId: string;
  submission: CircuitRaceSubmission;
  revealedHintCount: number;
}): CircuitRaceProofSubmissionMessage | undefined {
  const event = createTeamEscapeRaceProofEvent(
    input.state,
    input.nodeId,
    input.proofId,
    input.observedAt,
    input.requestId,
  );
  if (!event) return undefined;
  return makeCircuitRaceProofSubmissionMessage({
    raceId: input.raceId,
    operationId: input.state.operationId,
    requestId: input.requestId,
    event,
    submission: input.submission,
    revealedHintCount: input.revealedHintCount,
  });
}

/** Host-only reduction; acceptedAt comes exclusively from the relay frame. */
export function reduceCircuitRaceProofFrame(
  state: TeamEscapeRaceState,
  frame: CircuitRaceDirectFrame,
  input: { course: CompiledCircuitRace; hostNodeId: string; raceId: string },
): CircuitRaceProofFrameReduction | undefined {
  const message = parseCircuitRaceDirectMessage(frame.payload);
  if (!message || message.kind !== 'circuit-race.proof.submit' || message.raceId !== input.raceId) {
    return undefined;
  }
  const senderTeam = state.teams.find((team) => team.memberNodeIds.includes(frame.senderId));
  if (
    state.mode === 'live' &&
    senderTeam?.memberNodeIds.length === 2 &&
    senderTeam.stageIndex < state.stages.length - 1 &&
    senderTeam.memberNodeIds.indexOf(frame.senderId) !== 1
  ) {
    return {
      requestId: message.requestId,
      reduction: { accepted: false, changed: false, reason: 'INVALID_PROOF', state },
    };
  }
  const reduction = reduceTeamEscapeRaceProof(state, {
    event: message.event,
    // A logical request id survives direct-message retries; transport ids do not.
    eventId: message.requestId,
    senderId: frame.senderId,
    serverTime: frame.serverTime,
  }, {
    isAuthority: input.hostNodeId === state.hostNodeId,
    localNodeId: input.hostNodeId,
  });
  if (reduction.accepted) {
    const stageId = message.event.stageId;
    if (!CIRCUIT_RACE_STAGE_IDS.includes(stageId as (typeof CIRCUIT_RACE_STAGE_IDS)[number])) {
      return {
        requestId: message.requestId,
        reduction: { accepted: false, changed: false, reason: 'INVALID_PROOF', state },
      };
    }
    const validation = validateCircuitRaceStage(
      input.course,
      stageId as (typeof CIRCUIT_RACE_STAGE_IDS)[number],
      message.submission,
      { revealedHintCount: message.revealedHintCount },
    );
    if (!validation.valid) {
      return {
        requestId: message.requestId,
        reduction: { accepted: false, changed: false, reason: 'INVALID_PROOF', state },
      };
    }
  }
  return { reduction, requestId: message.requestId };
}

export function projectCircuitRacePlayerSnapshot(
  snapshot: CircuitRacePlayerSnapshot,
  serverNow: number,
  connectedNodeIds: readonly string[],
): CircuitRacePlayerView {
  const phase = snapshot.ownTeam.finishedAt !== undefined &&
    snapshot.opponents.every((team) => team.finishedAt !== undefined)
    ? 'complete'
    : serverNow < snapshot.startsAt ? 'countdown' : 'running';
  const connected = new Set(connectedNodeIds);
  const progress = [
    {
      teamId: snapshot.ownTeam.teamId,
      stageIndex: snapshot.ownTeam.stageIndex,
      acceptedProofCount: snapshot.ownTeam.acceptedProofs.length,
      finishedAt: snapshot.ownTeam.finishedAt,
    },
    ...snapshot.opponents,
  ];
  const standings = rankSnapshotProgress(progress, snapshot.stages.length, snapshot.tieWindowMs, serverNow);
  const teams = progress.map<CircuitRaceTeamView>((team) => {
    const members = snapshot.participants
      .filter((participant) => participant.teamId === team.teamId)
      .map((participant) => participant.nodeId);
    const online = members.filter((nodeId) => connected.has(nodeId));
    const offline = members.filter((nodeId) => !connected.has(nodeId));
    const isLocalTeam = team.teamId === snapshot.ownTeam.teamId;
    return {
      acceptedProofCount: team.acceptedProofCount,
      ...(isLocalTeam ? {
        acceptedProofIds: snapshot.ownTeam.acceptedProofs.map((proof) => proof.proofId),
      } : {}),
      canSubmit: isLocalTeam && phase === 'running' && team.finishedAt === undefined &&
        connected.has(snapshot.recipientNodeId),
      connectedNodeIds: online,
      connectionStatus: online.length === 0 ? 'offline' : offline.length > 0 ? 'degraded' : 'online',
      finishedAt: team.finishedAt,
      isLocalTeam,
      memberNodeIds: members,
      offlineNodeIds: offline,
      stageId: team.finishedAt === undefined ? snapshot.stages[team.stageIndex]?.id : undefined,
      stageIndex: team.stageIndex,
      ...(isLocalTeam ? { stageStartedAt: snapshot.ownTeam.stageStartedAt } : {}),
      teamId: team.teamId,
    };
  });
  return {
    authorityConnected: connected.has(snapshot.hostNodeId),
    hostNodeId: snapshot.hostNodeId,
    localTeamId: snapshot.ownTeam.teamId,
    mode: snapshot.mode,
    operationId: snapshot.operationId,
    participants: snapshot.participants,
    phase,
    raceId: snapshot.raceId,
    revision: snapshot.revision,
    serverNow,
    standings,
    startsAt: snapshot.startsAt,
    startsInMs: Math.max(0, snapshot.startsAt - serverNow),
    teams,
  };
}

function rankSnapshotProgress(
  teams: readonly {
    acceptedProofCount: number;
    finishedAt?: number;
    stageIndex: number;
    teamId: string;
  }[],
  stageCount: number,
  tieWindowMs: number,
  serverNow: number,
): TeamEscapeRaceStanding[] {
  const finished = teams
    .filter((team) => team.finishedAt !== undefined)
    .sort((left, right) => left.finishedAt! - right.finishedAt! || left.teamId.localeCompare(right.teamId));
  const ranked = new Map<string, { rank: number; tied: boolean }>();
  for (let index = 0; index < finished.length;) {
    let end = index + 1;
    while (end < finished.length && finished[end].finishedAt! - finished[index].finishedAt! <= tieWindowMs) end += 1;
    const tied = end - index > 1;
    for (let member = index; member < end; member += 1) {
      ranked.set(finished[member].teamId, { rank: index + 1, tied });
    }
    index = end;
  }
  return teams.map<TeamEscapeRaceStanding>((team) => {
    const finish = ranked.get(team.teamId);
    return {
      acceptedProofCount: team.acceptedProofCount,
      completedStageCount: team.finishedAt === undefined ? team.stageIndex : stageCount,
      finishedAt: team.finishedAt,
      provisional: team.finishedAt !== undefined && teams.some((candidate) => candidate.finishedAt === undefined) &&
        serverNow <= team.finishedAt + tieWindowMs,
      rank: finish?.rank,
      teamId: team.teamId,
      tied: finish?.tied ?? false,
    };
  }).sort((left, right) => {
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

export function circuitRacePhaseFromState(state: TeamEscapeRaceState, serverNow: number) {
  return teamEscapeRacePhaseAt(state, serverNow);
}

import {
  projectForgeCaseForPlayer,
  validateForgeSubmission,
  type ForgeCase,
  type ForgePlayerCase,
  type ForgeStageSubmission,
  type ForgeSubmissionResult,
} from '../../domain/case-forge';
import {
  housewireSessionEventSchema,
  type ForgeSnapshotEvent,
} from '../session/protocol';

export type ForgeLiveAssignment = ForgeSnapshotEvent['assignments'][number];

export interface ForgeLiveRuntimeState {
  caseId: string;
  operationId: string;
  hostNodeId: string;
  title: string;
  accent: string;
  playerCount: number;
  status: 'waiting' | 'playing' | 'finished' | 'aborted';
  revision: number;
  stageIndex: number;
  assignments: readonly ForgeLiveAssignment[];
  hintsByStage: Readonly<Record<string, number>>;
  syncProofs: readonly { playerId: string; observedAt: number }[];
  /** Host-memory only. Tokens are deliberately omitted from public reconnect snapshots. */
  relayAnswers: readonly { round: number; recipientPlayerId: string; token: string }[];
  createdAt: number;
  startedAt?: number;
  stageStartedAt?: number;
  finishedAt?: number;
  abortedAt?: number;
}

export interface ForgeLiveSubmissionReduction {
  result: ForgeSubmissionResult;
  state: ForgeLiveRuntimeState;
  changed: boolean;
  advanced: boolean;
}

export interface ForgeLiveHintReduction {
  accepted: boolean;
  count: number;
  state: ForgeLiveRuntimeState;
}

export function createForgeLiveRuntime(
  game: ForgeCase,
  hostNodeId: string,
  operationId: string,
  createdAt: number,
  hostName?: string,
): ForgeLiveRuntimeState {
  const role = game.roles[0];
  if (!role) throw new Error('A generated case needs at least one role.');
  return {
    caseId: game.id,
    operationId,
    hostNodeId,
    title: game.title,
    accent: game.accent,
    playerCount: game.playerCount,
    status: 'waiting',
    revision: 0,
    stageIndex: 0,
    assignments: [{
      nodeId: hostNodeId,
      playerId: role.playerId,
      name: cleanName(hostName ?? role.playerName),
      title: role.title,
      accent: role.accent,
      joinedAt: createdAt,
    }],
    hintsByStage: {},
    syncProofs: [],
    relayAnswers: [],
    createdAt,
  };
}

export function assignForgeLiveNode(
  state: ForgeLiveRuntimeState,
  game: ForgeCase,
  nodeId: string,
  name: string,
  joinedAt: number,
): ForgeLiveRuntimeState {
  if (game.id !== state.caseId) return state;
  const existing = state.assignments.find((assignment) => assignment.nodeId === nodeId);
  if (existing) {
    const cleaned = cleanName(name);
    if (state.status !== 'waiting' || existing.name === cleaned) return state;
    return {
      ...state,
      assignments: state.assignments.map((assignment) =>
        assignment.nodeId === nodeId ? { ...assignment, name: cleaned } : assignment,
      ),
      revision: state.revision + 1,
    };
  }
  if (state.status !== 'waiting' || state.assignments.length >= state.playerCount) return state;
  const usedPlayers = new Set(state.assignments.map((assignment) => assignment.playerId));
  const role = game.roles.find((candidate) => !usedPlayers.has(candidate.playerId));
  if (!role) return state;
  return {
    ...state,
    assignments: [...state.assignments, {
      nodeId,
      playerId: role.playerId,
      name: cleanName(name),
      title: role.title,
      accent: role.accent,
      joinedAt,
    }],
    revision: state.revision + 1,
  };
}

export function startForgeLiveRun(
  state: ForgeLiveRuntimeState,
  game: ForgeCase,
  liveNodeIds: readonly string[],
  startedAt: number,
): ForgeLiveRuntimeState {
  if (
    state.status !== 'waiting' ||
    state.caseId !== game.id ||
    state.assignments.length !== game.playerCount
  ) return state;
  const live = new Set(liveNodeIds);
  if (state.assignments.some((assignment) => !live.has(assignment.nodeId))) return state;
  return {
    ...state,
    status: 'playing',
    revision: state.revision + 1,
    stageIndex: 0,
    startedAt,
    stageStartedAt: startedAt,
    syncProofs: [],
    relayAnswers: [],
  };
}

export function reduceForgeLiveSubmission(
  state: ForgeLiveRuntimeState,
  game: ForgeCase,
  senderNodeId: string,
  submittedStageIndex: number,
  submission: ForgeStageSubmission,
  acceptedAt: number,
): ForgeLiveSubmissionReduction {
  const stage = game.stages[state.stageIndex];
  if (
    state.caseId !== game.id ||
    state.status !== 'playing' ||
    !stage ||
    submittedStageIndex !== state.stageIndex
  ) return unchanged(state, { accepted: false, code: 'INVALID_STAGE' });

  const assignment = state.assignments.find((candidate) => candidate.nodeId === senderNodeId);
  if (!assignment || !stage.submitterPlayerIds.includes(assignment.playerId)) {
    return unchanged(state, { accepted: false, code: 'WRONG_ACTOR', stageId: stage.id });
  }

  if (stage.solution.kind === 'sync') {
    return reduceSynchronizedProof(state, game, assignment.playerId, submission, acceptedAt);
  }

  if (stage.solution.kind === 'relay') {
    return reducePrivateRelayAnswer(state, game, assignment.playerId, submission, acceptedAt);
  }

  const result = validateForgeSubmission(game, state.stageIndex, submission);
  if (!result.accepted) return unchanged(state, result);
  return {
    result,
    state: advanceForgeStage(state, game, acceptedAt),
    changed: true,
    advanced: true,
  };
}

export function revealForgeLiveHint(
  state: ForgeLiveRuntimeState,
  game: ForgeCase,
  senderNodeId: string,
  stageIndex: number,
): ForgeLiveHintReduction {
  const stage = game.stages[state.stageIndex];
  const assigned = state.assignments.some((assignment) => assignment.nodeId === senderNodeId);
  if (state.status !== 'playing' || !stage || stageIndex !== state.stageIndex || !assigned) {
    return { accepted: false, count: stage ? (state.hintsByStage[stage.id] ?? 0) : 0, state };
  }
  const current = state.hintsByStage[stage.id] ?? 0;
  const count = Math.min(stage.hints.length, current + 1);
  if (count === current) return { accepted: false, count, state };
  return {
    accepted: true,
    count,
    state: {
      ...state,
      hintsByStage: { ...state.hintsByStage, [stage.id]: count },
      revision: state.revision + 1,
    },
  };
}

export function abortForgeLiveRun(
  state: ForgeLiveRuntimeState,
  senderNodeId: string,
  abortedAt: number,
): ForgeLiveRuntimeState {
  if (senderNodeId !== state.hostNodeId || state.status === 'finished' || state.status === 'aborted') return state;
  return {
    ...state,
    status: 'aborted',
    abortedAt,
    revision: state.revision + 1,
    startedAt: state.startedAt ?? abortedAt,
    stageStartedAt: state.stageStartedAt ?? abortedAt,
  };
}

export function forgeLiveSnapshot(state: ForgeLiveRuntimeState): ForgeSnapshotEvent {
  return housewireSessionEventSchema.parse({
    kind: 'forge.snapshot',
    caseId: state.caseId,
    operationId: state.operationId,
    hostNodeId: state.hostNodeId,
    title: state.title,
    accent: state.accent,
    playerCount: state.playerCount,
    status: state.status,
    revision: state.revision,
    stageIndex: state.stageIndex,
    assignments: [...state.assignments],
    hints: Object.entries(state.hintsByStage).map(([stageId, count]) => ({ stageId, count })),
    syncProofs: [...state.syncProofs],
    createdAt: state.createdAt,
    startedAt: state.startedAt,
    stageStartedAt: state.stageStartedAt,
    finishedAt: state.finishedAt,
    abortedAt: state.abortedAt,
  }) as ForgeSnapshotEvent;
}

export function forgeLiveRuntimeFromSnapshot(snapshot: ForgeSnapshotEvent): ForgeLiveRuntimeState {
  return {
    caseId: snapshot.caseId,
    operationId: snapshot.operationId,
    hostNodeId: snapshot.hostNodeId,
    title: snapshot.title,
    accent: snapshot.accent,
    playerCount: snapshot.playerCount,
    status: snapshot.status,
    revision: snapshot.revision,
    stageIndex: snapshot.stageIndex,
    assignments: snapshot.assignments,
    hintsByStage: Object.fromEntries(snapshot.hints.map(({ stageId, count }) => [stageId, count])),
    syncProofs: snapshot.syncProofs,
    relayAnswers: [],
    createdAt: snapshot.createdAt,
    startedAt: snapshot.startedAt,
    stageStartedAt: snapshot.stageStartedAt,
    finishedAt: snapshot.finishedAt,
    abortedAt: snapshot.abortedAt,
  };
}

export function forgePlayerProjectionForNode(
  game: ForgeCase,
  state: ForgeLiveRuntimeState,
  nodeId: string,
): ForgePlayerCase | undefined {
  const assignment = state.assignments.find((candidate) => candidate.nodeId === nodeId);
  if (!assignment) return undefined;
  const projected = projectForgeCaseForPlayer(game, assignment.playerId);
  const namesByPlayer = new Map(state.assignments.map((candidate) => [candidate.playerId, candidate.name]));
  return {
    ...projected,
    role: { ...projected.role, playerName: assignment.name },
    crew: projected.crew.map((member) => ({
      ...member,
      playerName: namesByPlayer.get(member.playerId) ?? member.playerName,
    })),
  };
}

export function missingForgeLiveNodeIds(
  state: ForgeLiveRuntimeState,
  liveNodeIds: readonly string[],
): string[] {
  if (state.status !== 'playing') return [];
  const live = new Set(liveNodeIds);
  const requiredPlayers = new Set(
    state.stageIndex < 5 ? state.assignments.map((assignment) => assignment.playerId) : [],
  );
  return state.assignments
    .filter((assignment) => requiredPlayers.has(assignment.playerId) && !live.has(assignment.nodeId))
    .map((assignment) => assignment.nodeId);
}

function reduceSynchronizedProof(
  state: ForgeLiveRuntimeState,
  game: ForgeCase,
  playerId: string,
  submission: ForgeStageSubmission,
  acceptedAt: number,
): ForgeLiveSubmissionReduction {
  const stage = game.stages[state.stageIndex];
  if (!stage || stage.solution.kind !== 'sync' || submission.kind !== 'sync') {
    return unchanged(state, { accepted: false, code: 'WRONG_SUBMISSION_KIND', stageId: stage?.id });
  }
  const solution = stage.solution;
  if (submission.proofs.length !== 1 || submission.proofs[0]?.playerId !== playerId) {
    return unchanged(state, { accepted: false, code: 'WRONG_ACTOR', stageId: stage.id });
  }
  const expected = solution.assignments.find((assignment) => assignment.playerId === playerId);
  const proof = submission.proofs[0];
  if (!expected || proof.pose !== expected.pose || proof.vocalCue !== expected.vocalCue) {
    return unchanged(state, { accepted: false, code: 'WRONG_VALUE', stageId: stage.id });
  }

  const active = state.syncProofs.filter((candidate) => acceptedAt - candidate.observedAt <= solution.windowMs);
  const nextProofs = [
    ...active.filter((candidate) => candidate.playerId !== playerId),
    { playerId, observedAt: acceptedAt },
  ].sort((left, right) => left.observedAt - right.observedAt || left.playerId.localeCompare(right.playerId));
  const nextState = { ...state, syncProofs: nextProofs, revision: state.revision + 1 };
  if (nextProofs.length < solution.assignments.length) {
    return {
      result: {
        accepted: false,
        code: 'INCOMPLETE',
        stageId: stage.id,
        acceptedPrefixLength: nextProofs.length,
        expectedLength: solution.assignments.length,
      },
      state: nextState,
      changed: true,
      advanced: false,
    };
  }

  const startedAt = Math.min(...nextProofs.map((candidate) => candidate.observedAt));
  const completedAt = Math.max(...nextProofs.map((candidate) => candidate.observedAt));
  const result = validateForgeSubmission(game, state.stageIndex, {
    kind: 'sync',
    startedAt,
    completedAt,
    proofs: solution.assignments.map((assignment) => ({ ...assignment, evidenceMode: 'manual' as const })),
  });
  if (!result.accepted) return { result, state: nextState, changed: true, advanced: false };
  return {
    result,
    state: advanceForgeStage(nextState, game, acceptedAt),
    changed: true,
    advanced: true,
  };
}

function reducePrivateRelayAnswer(
  state: ForgeLiveRuntimeState,
  game: ForgeCase,
  playerId: string,
  submission: ForgeStageSubmission,
  acceptedAt: number,
): ForgeLiveSubmissionReduction {
  const stage = game.stages[state.stageIndex];
  if (!stage || stage.solution.kind !== 'relay' || submission.kind !== 'relay') {
    return unchanged(state, { accepted: false, code: 'WRONG_SUBMISSION_KIND', stageId: stage?.id });
  }
  if (submission.rounds.length === 0 || new Set(submission.rounds.map((round) => round.round)).size !== submission.rounds.length) {
    return unchanged(state, { accepted: false, code: 'INCOMPLETE', stageId: stage.id });
  }
  for (const round of submission.rounds) {
    const expected = stage.solution.rounds.find((candidate) => candidate.round === round.round);
    if (!expected || expected.recipientPlayerId !== playerId || round.recipientPlayerId !== playerId) {
      return unchanged(state, { accepted: false, code: 'WRONG_RECIPIENT', stageId: stage.id });
    }
    if (round.token.trim().toLocaleUpperCase() !== expected.token.trim().toLocaleUpperCase()) {
      return unchanged(state, { accepted: false, code: 'WRONG_VALUE', stageId: stage.id });
    }
  }
  const submittedRounds = new Set(submission.rounds.map((round) => round.round));
  const relayAnswers = [
    ...state.relayAnswers.filter((answer) => !submittedRounds.has(answer.round)),
    ...submission.rounds.map((round) => ({ ...round, token: round.token.trim() })),
  ].sort((left, right) => left.round - right.round);
  const nextState = { ...state, relayAnswers, revision: state.revision + 1 };
  if (relayAnswers.length < stage.solution.rounds.length) {
    return {
      result: {
        accepted: false,
        code: 'INCOMPLETE',
        stageId: stage.id,
        acceptedPrefixLength: relayAnswers.length,
        expectedLength: stage.solution.rounds.length,
      },
      state: nextState,
      changed: true,
      advanced: false,
    };
  }
  const result = validateForgeSubmission(game, state.stageIndex, { kind: 'relay', rounds: relayAnswers });
  if (!result.accepted) return { result, state: nextState, changed: true, advanced: false };
  return {
    result,
    state: advanceForgeStage(nextState, game, acceptedAt),
    changed: true,
    advanced: true,
  };
}

function advanceForgeStage(
  state: ForgeLiveRuntimeState,
  game: ForgeCase,
  acceptedAt: number,
): ForgeLiveRuntimeState {
  const stageIndex = state.stageIndex + 1;
  if (stageIndex >= game.stages.length) {
    return {
      ...state,
      status: 'finished',
      stageIndex: game.stages.length,
      finishedAt: acceptedAt,
      stageStartedAt: acceptedAt,
      syncProofs: [],
      relayAnswers: [],
      revision: state.revision + 1,
    };
  }
  return {
    ...state,
    stageIndex,
    stageStartedAt: acceptedAt,
    syncProofs: [],
    relayAnswers: [],
    revision: state.revision + 1,
  };
}

function unchanged(
  state: ForgeLiveRuntimeState,
  result: ForgeSubmissionResult,
): ForgeLiveSubmissionReduction {
  return { result, state, changed: false, advanced: false };
}

function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 24) || 'Player';
}

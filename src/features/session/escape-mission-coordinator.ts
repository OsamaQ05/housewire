import {
  compileEscapeCase,
  type CompiledEscapeCase,
  type EscapeCaseId,
} from '../../domain/escape-case-compiler';

import type {
  EscapeAbortEvent,
  EscapeProofEvent,
  EscapeSnapshotEvent,
  EscapeStartEvent,
} from './protocol';

export interface EscapeMissionRuntimeState {
  missionId: EscapeCaseId;
  operationId: string;
  hostNodeId: string;
  seed: number;
  startedAt: number;
  stageIndex: number;
  stageStartedAt: number;
  revision: number;
  liveNodeIds: readonly string[];
  completions: readonly EscapeSnapshotEvent['completions'][number][];
  finishedAt?: number;
  abortedAt?: number;
}

export interface EscapeProofReduction {
  accepted: boolean;
  advanced: boolean;
  state: EscapeMissionRuntimeState;
}

export interface EscapeAbortReduction {
  accepted: boolean;
  state: EscapeMissionRuntimeState;
}

const MAXIMUM_ABORT_CLOCK_SKEW_MS = 30_000;

const SYNCHRONIZED_STAGES = new Set([
  'countertone',
  'draw-threshold',
  'fold-corridor',
  'take-your-places',
  'last-bell',
]);

function hash(value: string): number {
  let state = 2_166_136_261;
  for (const character of value) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16_777_619);
  }
  return state >>> 0;
}

export function escapeProofToken(
  missionId: EscapeCaseId,
  seed: number,
  stageIndex: number,
  proofKey: string,
  nodeId: string,
): string {
  return `P${hash(`${missionId}|${seed >>> 0}|${stageIndex}|${proofKey}|${nodeId}`)
    .toString(36)
    .toUpperCase()}`;
}

export function createEscapeMissionRuntime(event: EscapeStartEvent): EscapeMissionRuntimeState {
  return {
    missionId: event.missionId,
    operationId: event.operationId,
    hostNodeId: event.hostNodeId,
    seed: event.seed,
    startedAt: event.startsAt,
    stageIndex: 0,
    stageStartedAt: event.startsAt,
    revision: 0,
    liveNodeIds: event.liveNodeIds,
    completions: [],
  };
}

export function createEscapeAbortEvent(
  state: EscapeMissionRuntimeState,
  hostNodeId: string,
  abortedAt: number,
): EscapeAbortEvent | undefined {
  if (
    state.finishedAt !== undefined ||
    state.abortedAt !== undefined ||
    hostNodeId !== state.hostNodeId ||
    !state.liveNodeIds.includes(hostNodeId)
  ) {
    return undefined;
  }
  return {
    kind: 'escape.abort',
    missionId: state.missionId,
    operationId: state.operationId,
    hostNodeId,
    abortedAt,
  };
}

export function reduceEscapeAbort(
  state: EscapeMissionRuntimeState,
  event: EscapeAbortEvent,
  senderId: string,
  acceptedAt: number,
): EscapeAbortReduction {
  if (
    state.finishedAt !== undefined ||
    state.abortedAt !== undefined ||
    senderId !== state.hostNodeId ||
    senderId !== event.hostNodeId ||
    event.missionId !== state.missionId ||
    event.operationId !== state.operationId ||
    !state.liveNodeIds.includes(event.hostNodeId) ||
    Math.abs(event.abortedAt - acceptedAt) > MAXIMUM_ABORT_CLOCK_SKEW_MS
  ) {
    return { accepted: false, state };
  }
  return {
    accepted: true,
    state: {
      ...state,
      abortedAt: acceptedAt,
      revision: state.revision + 1,
    },
  };
}

export function compiledCaseForRuntime(state: EscapeMissionRuntimeState): CompiledEscapeCase {
  return compileEscapeCase(state.missionId, state.seed, state.liveNodeIds);
}

export function missingRequiredEscapeNodeIds(
  state: EscapeMissionRuntimeState,
  currentLiveNodeIds: readonly string[],
): string[] {
  if (state.finishedAt !== undefined || state.abortedAt !== undefined) return [];
  const stage = compiledCaseForRuntime(state).stages[state.stageIndex];
  if (!stage) return [];
  const currentlyLive = new Set(currentLiveNodeIds);
  return stage.requiredNodeIds.filter((nodeId) => !currentlyLive.has(nodeId));
}

function numberedProofIndex(proofKey: string): number | undefined {
  const raw = proofKey.split(':')[1];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed - 1 : undefined;
}

function expectedProofActor(
  game: CompiledEscapeCase,
  stageIndex: number,
  proofKey: string,
): string | undefined {
  const itemIndex = numberedProofIndex(proofKey);
  if (game.id === 'dead-air' && stageIndex === 1 && itemIndex !== undefined) {
    return game.serviceScans[itemIndex]?.scannerNodeId;
  }
  if (game.id === 'dead-air' && stageIndex === 2 && itemIndex !== undefined) {
    return game.privateChannel.receiverNodeId;
  }
  if (game.id === 'night-glass' && stageIndex === 1 && itemIndex !== undefined) {
    return game.parallaxRounds[itemIndex]?.watcherNodeId;
  }
  if (game.id === 'night-glass' && stageIndex === 3 && itemIndex !== undefined) {
    return game.corridor.courierNodeId;
  }
  if (game.id === 'long-table' && stageIndex === 2 && itemIndex !== undefined) {
    return game.keepsakes[itemIndex]?.witnessNodeId;
  }
  if (game.id === 'long-table' && stageIndex === 3 && itemIndex !== undefined) {
    return game.serviceRoute[itemIndex]?.courierNodeId;
  }
  return undefined;
}

export function escapeStageRequiresEveryNode(game: CompiledEscapeCase, stageIndex: number): boolean {
  return SYNCHRONIZED_STAGES.has(game.stages[stageIndex]?.id ?? '');
}

function stageIsComplete(
  game: CompiledEscapeCase,
  stageIndex: number,
  completions: EscapeMissionRuntimeState['completions'],
): boolean {
  const stage = game.stages[stageIndex];
  if (!stage) return false;
  if (escapeStageRequiresEveryNode(game, stageIndex)) {
    const proofKey = stage.expectedProofKeys[0];
    return stage.requiredNodeIds.every((nodeId) =>
      completions.some((completion) => completion.nodeId === nodeId && completion.proofKey === proofKey),
    );
  }
  return stage.expectedProofKeys.every((proofKey) =>
    completions.some((completion) => completion.proofKey === proofKey),
  );
}

function synchronizedWindowMs(game: CompiledEscapeCase, stageIndex: number): number {
  const stageId = game.stages[stageIndex]?.id;
  if (game.id === 'dead-air' && stageId === 'countertone') return game.countertone.windowMs;
  if (game.id === 'night-glass' && stageId === 'draw-threshold') return game.threshold.windowMs;
  if (game.id === 'night-glass' && stageId === 'fold-corridor') return game.finale.windowMs;
  if (game.id === 'long-table' && stageId === 'take-your-places') return game.placeWindowMs;
  if (game.id === 'long-table' && stageId === 'last-bell') return game.finale.windowMs;
  return Number.POSITIVE_INFINITY;
}

export function reduceEscapeProof(
  state: EscapeMissionRuntimeState,
  event: EscapeProofEvent,
  senderId: string,
  acceptedAt: number,
): EscapeProofReduction {
  if (
    state.finishedAt !== undefined ||
    state.abortedAt !== undefined ||
    senderId !== event.nodeId ||
    event.missionId !== state.missionId ||
    event.operationId !== state.operationId ||
    event.stageIndex !== state.stageIndex ||
    !state.liveNodeIds.includes(event.nodeId)
  ) {
    return { accepted: false, advanced: false, state };
  }

  const game = compiledCaseForRuntime(state);
  const stage = game.stages[state.stageIndex];
  if (
    !stage ||
    !stage.expectedProofKeys.includes(event.proofKey) ||
    !stage.submitterNodeIds.includes(event.nodeId)
  ) {
    return { accepted: false, advanced: false, state };
  }
  const expectedActor = expectedProofActor(game, state.stageIndex, event.proofKey);
  if (expectedActor !== undefined && expectedActor !== event.nodeId) {
    return { accepted: false, advanced: false, state };
  }
  if (
    event.answerToken !==
    escapeProofToken(state.missionId, state.seed, state.stageIndex, event.proofKey, event.nodeId)
  ) {
    return { accepted: false, advanced: false, state };
  }

  const synchronized = escapeStageRequiresEveryNode(game, state.stageIndex);
  if (synchronized && !stage.requiredNodeIds.includes(event.nodeId)) {
    return { accepted: false, advanced: false, state };
  }
  const windowMs = synchronized ? synchronizedWindowMs(game, state.stageIndex) : Number.POSITIVE_INFINITY;
  const activeCompletions = synchronized
    ? state.completions.filter((completion) => acceptedAt - completion.observedAt <= windowMs)
    : state.completions;
  const alreadyAccepted = activeCompletions.some((completion) =>
    synchronized
      ? completion.nodeId === event.nodeId && completion.proofKey === event.proofKey
      : completion.proofKey === event.proofKey,
  );
  if (alreadyAccepted) return { accepted: true, advanced: false, state };

  const completions = [
    ...activeCompletions,
    { nodeId: event.nodeId, proofKey: event.proofKey, observedAt: acceptedAt },
  ];
  if (!stageIsComplete(game, state.stageIndex, completions)) {
    return {
      accepted: true,
      advanced: false,
      state: { ...state, completions, revision: state.revision + 1 },
    };
  }

  if (state.stageIndex >= game.stages.length - 1) {
    return {
      accepted: true,
      advanced: true,
      state: {
        ...state,
        completions,
        finishedAt: acceptedAt,
        revision: state.revision + 1,
      },
    };
  }

  return {
    accepted: true,
    advanced: true,
    state: {
      ...state,
      stageIndex: state.stageIndex + 1,
      stageStartedAt: acceptedAt,
      completions: [],
      revision: state.revision + 1,
    },
  };
}

export function escapeSnapshotFromRuntime(state: EscapeMissionRuntimeState): EscapeSnapshotEvent {
  const game = compiledCaseForRuntime(state);
  const stage = game.stages[state.stageIndex];
  return {
    kind: 'escape.snapshot',
    missionId: state.missionId,
    operationId: state.operationId,
    hostNodeId: state.hostNodeId,
    seed: state.seed,
    startedAt: state.startedAt,
    stageId: stage.id,
    stageIndex: stage.index,
    stageStartedAt: state.stageStartedAt,
    revision: state.revision,
    liveNodeIds: [...state.liveNodeIds],
    requiredNodeIds: [...stage.requiredNodeIds].sort((left, right) => left.localeCompare(right)),
    completions: [...state.completions],
    finishedAt: state.finishedAt,
    abortedAt: state.abortedAt,
  };
}

export function runtimeFromEscapeSnapshot(snapshot: EscapeSnapshotEvent): EscapeMissionRuntimeState {
  return {
    missionId: snapshot.missionId,
    operationId: snapshot.operationId,
    hostNodeId: snapshot.hostNodeId,
    seed: snapshot.seed,
    startedAt: snapshot.startedAt,
    stageIndex: snapshot.stageIndex,
    stageStartedAt: snapshot.stageStartedAt,
    revision: snapshot.revision,
    liveNodeIds: snapshot.liveNodeIds,
    completions: snapshot.completions,
    finishedAt: snapshot.finishedAt,
    abortedAt: snapshot.abortedAt,
  };
}

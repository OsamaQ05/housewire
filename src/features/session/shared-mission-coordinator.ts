import { generateLine13Game, line13RouteProof } from '../../domain/line-13-game';
import type { EvidenceKind } from '../../domain/types';

import {
  actionsForLine13Stage,
  housewireSessionEventSchema,
  isEvidenceAllowedForAction,
  line13StageIds,
  type AcceptedCompletion,
  type HousewireSessionEvent,
  type Line13ActionId,
  type Line13StageId,
  type MissionAbortEvent,
  type MissionEvidenceEvent,
  type MissionSnapshotEvent,
  type MissionStageEvent,
  type MissionStartEvent,
} from './protocol';
import type { SessionFeedItem } from './use-housewire-session';

const SYNCHRONIZED_HANGUP_WINDOW_MS = 1_600;
const MAXIMUM_EVIDENCE_CLOCK_SKEW_MS = 30_000;
export const COURIER_HANDOFF_WINDOW_MS = 20_000;

const ACTION_MINIMUM_CONFIDENCE: Readonly<Record<Line13ActionId, number>> = {
  'lift-receiver': 0.72,
  'lock-full-warning': 1,
  'carry-warning': 0.68,
  'release-destination-receipt': 1,
  'place-route-section': 1,
  'close-receiver': 0.74,
};

export interface SharedMissionCoordinatorState {
  operationId?: string;
  hostNodeId?: string;
  seed?: number;
  startedAt?: number;
  stageIndex: number;
  stageStartedAt?: number;
  liveNodeIds: readonly string[];
  requiredNodeIds: readonly string[];
  completions: readonly AcceptedCompletion[];
  revision: number;
  acceptedThroughSequence: number;
  finishedAt?: number;
  abortedAt?: number;
  abortedByNodeId?: string;
}

export interface SharedMissionCoordinatorContext {
  localNodeId: string;
  isHost: boolean;
  expectedHostNodeId?: string;
  liveNodeIds: readonly string[];
}

export interface CoordinatorOutbound {
  event: HousewireSessionEvent;
  eventId: string;
}

export interface CoordinatorReduction {
  state: SharedMissionCoordinatorState;
  outbound: readonly CoordinatorOutbound[];
}

export interface LocalCompletionInput {
  actionId?: Line13ActionId;
  evidenceKind: EvidenceKind;
  confidence?: number;
  observedAt?: number;
  value?: string | number | boolean;
}

export interface HostStartInput {
  operationId: string;
  seed: number;
  startsAt: number;
  liveNodeIds: readonly string[];
  hostNodeId: string;
}

export function missionStartTransportEventId(operationId: string): string {
  return `start-${compactIdPart(operationId)}`;
}

export function createSharedMissionCoordinatorState(): SharedMissionCoordinatorState {
  return {
    stageIndex: 0,
    liveNodeIds: [],
    requiredNodeIds: [],
    completions: [],
    revision: 0,
    acceptedThroughSequence: 0,
  };
}

export function createSharedMissionCheckpoint(
  state: SharedMissionCoordinatorState,
  causeEventId: string,
): CoordinatorOutbound | undefined {
  if (
    !state.operationId ||
    !state.hostNodeId ||
    state.seed === undefined ||
    state.startedAt === undefined ||
    state.stageStartedAt === undefined
  ) {
    return undefined;
  }
  return snapshotOutbound(state, causeEventId);
}

export function createMissionStartEvent(input: HostStartInput): MissionStartEvent {
  return housewireSessionEventSchema.parse({
    kind: 'mission.start',
    missionId: 'line-13',
    operationId: input.operationId,
    hostNodeId: input.hostNodeId,
    seed: input.seed >>> 0,
    startsAt: input.startsAt,
    liveNodeIds: stableNodeIds(input.liveNodeIds),
  }) as MissionStartEvent;
}

export function createMissionAbortEvent(
  state: SharedMissionCoordinatorState,
  nodeId: string,
  abortedAt: number,
): MissionAbortEvent | undefined {
  if (
    !state.operationId ||
    state.startedAt === undefined ||
    state.finishedAt !== undefined ||
    state.abortedAt !== undefined ||
    !state.liveNodeIds.includes(nodeId)
  ) {
    return undefined;
  }
  const parsed = housewireSessionEventSchema.safeParse({
    kind: 'mission.abort',
    missionId: 'line-13',
    operationId: state.operationId,
    nodeId,
    abortedAt,
  });
  return parsed.success && parsed.data.kind === 'mission.abort' ? parsed.data : undefined;
}

export function createLocalCompletionEvent(
  state: SharedMissionCoordinatorState,
  nodeId: string,
  input: LocalCompletionInput,
  defaultObservedAt: number,
): MissionEvidenceEvent | undefined {
  if (
    !state.operationId ||
    state.seed === undefined ||
    state.startedAt === undefined ||
    state.finishedAt !== undefined ||
    state.abortedAt !== undefined ||
    !state.requiredNodeIds.includes(nodeId)
  ) {
    return undefined;
  }
  const stageId = line13StageIds[state.stageIndex];
  if (!stageId) return undefined;
  const actionId = input.actionId ?? inferActionId(state, nodeId, stageId, input.evidenceKind);
  if (!actionId || !actionsForLine13Stage(stageId).includes(actionId)) return undefined;
  if (!actionIsAssignedToNode(state, nodeId, actionId)) return undefined;

  const candidate = {
    kind: 'mission.evidence' as const,
    missionId: 'line-13' as const,
    operationId: state.operationId,
    stageId,
    stageIndex: state.stageIndex,
    actionId,
    nodeId,
    evidenceKind: input.evidenceKind,
    confidence: input.confidence ?? (input.evidenceKind === 'MANUAL_HOLD' ? 1 : 0),
    observedAt: input.observedAt ?? defaultObservedAt,
    value: input.value,
  };
  const parsed = housewireSessionEventSchema.safeParse(candidate);
  return parsed.success && parsed.data.kind === 'mission.evidence' ? parsed.data : undefined;
}

export function completedNodeIds(state: SharedMissionCoordinatorState): readonly string[] {
  const stageId = line13StageIds[state.stageIndex];
  if (!stageId) return [];
  if (stageId === 'courier-transfer') {
    return state.requiredNodeIds.filter((nodeId) =>
      state.completions.some((completion) => completion.nodeId === nodeId),
    );
  }
  const requiredActions = actionsForLine13Stage(stageId);
  return state.requiredNodeIds.filter((nodeId) =>
    requiredActions.every((actionId) =>
      state.completions.some((completion) => completion.nodeId === nodeId && completion.actionId === actionId),
    ),
  );
}

export function reduceSharedMissionFrame(
  current: SharedMissionCoordinatorState,
  item: SessionFeedItem,
  context: SharedMissionCoordinatorContext,
): CoordinatorReduction {
  const parsed = housewireSessionEventSchema.safeParse(item.event);
  if (!parsed.success) return unchanged(current);
  const event = parsed.data;

  switch (event.kind) {
    case 'mission.start':
      return acceptStart(current, item, event, context);
    case 'mission.stage':
      return acceptStage(current, item, event, context);
    case 'mission.evidence':
      return acceptEvidence(current, item, event, context);
    case 'mission.abort':
      return acceptAbort(current, item, event, context);
    case 'mission.snapshot':
      return acceptSnapshot(current, item, event, context);
    case 'mission.snapshot.request':
      return answerSnapshotRequest(current, item, event, context);
    default:
      return unchanged(current);
  }
}

function acceptStart(
  current: SharedMissionCoordinatorState,
  item: SessionFeedItem,
  event: MissionStartEvent,
  context: SharedMissionCoordinatorContext,
): CoordinatorReduction {
  if (!isTrustedHost(item.senderId, event.hostNodeId, context, current)) return unchanged(current);
  if (current.operationId === event.operationId) return unchanged(current);
  if (!isNewerOperation(current, event.startsAt, event.operationId)) return unchanged(current);

  const requiredNodeIds = requiredNodesForStage(0, event.seed, event.liveNodeIds, event.startsAt);
  const next: SharedMissionCoordinatorState = {
    operationId: event.operationId,
    hostNodeId: event.hostNodeId,
    seed: event.seed,
    startedAt: event.startsAt,
    stageIndex: 0,
    stageStartedAt: event.startsAt,
    liveNodeIds: event.liveNodeIds,
    requiredNodeIds,
    completions: [],
    revision: 0,
    acceptedThroughSequence: item.sequence,
  };
  if (!context.isHost || context.localNodeId !== event.hostNodeId) return { state: next, outbound: [] };
  return {
    state: next,
    outbound: [stageOutbound(next), snapshotOutbound(next, item.eventId)],
  };
}

function acceptStage(
  current: SharedMissionCoordinatorState,
  item: SessionFeedItem,
  event: MissionStageEvent,
  context: SharedMissionCoordinatorContext,
): CoordinatorReduction {
  if (current.abortedAt !== undefined) return unchanged(current);
  if (!matchesActiveHost(current, item.senderId, event.hostNodeId, event.operationId, context)) {
    return unchanged(current);
  }
  if (event.stageIndex < current.stageIndex || event.stageIndex > current.stageIndex + 1) return unchanged(current);
  if (!event.requiredNodeIds.every((nodeId) => current.liveNodeIds.includes(nodeId))) return unchanged(current);
  if (
    current.seed === undefined ||
    current.startedAt === undefined ||
    !sameIds(
      requiredNodesForStage(event.stageIndex, current.seed, current.liveNodeIds, current.startedAt),
      event.requiredNodeIds,
    )
  ) {
    return unchanged(current);
  }
  if (event.stageIndex === current.stageIndex && current.stageStartedAt !== undefined) return unchanged(current);

  return {
    state: {
      ...current,
      stageIndex: event.stageIndex,
      stageStartedAt: event.startsAt,
      requiredNodeIds: event.requiredNodeIds,
      completions: [],
      acceptedThroughSequence: Math.max(current.acceptedThroughSequence, item.sequence),
    },
    outbound: [],
  };
}

function acceptEvidence(
  current: SharedMissionCoordinatorState,
  item: SessionFeedItem,
  event: MissionEvidenceEvent,
  context: SharedMissionCoordinatorContext,
): CoordinatorReduction {
  if (current.abortedAt !== undefined) return unchanged(current);
  if (!context.isHost || current.hostNodeId !== context.localNodeId) return unchanged(current);
  if (
    event.nodeId !== item.senderId ||
    event.operationId !== current.operationId ||
    !current.liveNodeIds.includes(event.nodeId) ||
    !evidenceIsSemanticallyValid(event) ||
    !evidenceMatchesStageAssignment(current, event)
  ) {
    return unchanged(current);
  }

  if (event.stageIndex < current.stageIndex) {
    const checkpoint = createSharedMissionCheckpoint(current, item.eventId);
    return checkpoint ? { state: current, outbound: [checkpoint] } : unchanged(current);
  }
  if (
    event.stageIndex !== current.stageIndex ||
    event.stageId !== line13StageIds[current.stageIndex] ||
    !current.requiredNodeIds.includes(event.nodeId) ||
    current.stageStartedAt === undefined ||
    event.observedAt < current.stageStartedAt ||
    Math.abs(event.observedAt - item.serverTime) > MAXIMUM_EVIDENCE_CLOCK_SKEW_MS
  ) {
    return unchanged(current);
  }

  if (current.finishedAt !== undefined) {
    const checkpoint = createSharedMissionCheckpoint(current, item.eventId);
    return checkpoint ? { state: current, outbound: [checkpoint] } : unchanged(current);
  }

  let completions = [...current.completions];
  if (event.stageId === 'courier-transfer') {
    completions = completions.filter(
      (completion) =>
        completion.observedAt <= item.serverTime &&
        item.serverTime - completion.observedAt <= COURIER_HANDOFF_WINDOW_MS,
    );
    if (
      event.actionId === 'release-destination-receipt' &&
      !completions.some((completion) => completion.actionId === 'carry-warning')
    ) {
      if (completions.length === current.completions.length) return unchanged(current);
      const next = {
        ...current,
        completions,
        revision: current.revision + 1,
        acceptedThroughSequence: Math.max(current.acceptedThroughSequence, item.sequence),
      };
      return { state: next, outbound: [snapshotOutbound(next, item.eventId)] };
    }
  } else if (event.stageId === 'synchronized-hangup') {
    const newestExisting = Math.max(0, ...completions.map((completion) => completion.observedAt));
    if (newestExisting > event.observedAt + SYNCHRONIZED_HANGUP_WINDOW_MS) return unchanged(current);
    completions = completions.filter(
      (completion) => event.observedAt - completion.observedAt <= SYNCHRONIZED_HANGUP_WINDOW_MS,
    );
  }

  const duplicate = completions.some(
    (completion) => completion.nodeId === event.nodeId && completion.actionId === event.actionId,
  );
  if (duplicate) {
    const next = {
      ...current,
      acceptedThroughSequence: Math.max(current.acceptedThroughSequence, item.sequence),
    };
    return { state: next, outbound: [snapshotOutbound(next, item.eventId)] };
  }

  completions.push({
    nodeId: event.nodeId,
    actionId: event.actionId,
    evidenceKind: event.evidenceKind,
    observedAt: event.stageId === 'courier-transfer' ? item.serverTime : event.observedAt,
  });
  completions.sort(compareCompletions);

  let next: SharedMissionCoordinatorState = {
    ...current,
    completions,
    revision: current.revision + 1,
    acceptedThroughSequence: Math.max(current.acceptedThroughSequence, item.sequence),
  };

  if (!stageIsComplete(next)) {
    return { state: next, outbound: [snapshotOutbound(next, item.eventId)] };
  }

  if (current.stageIndex === line13StageIds.length - 1) {
    next = { ...next, finishedAt: item.serverTime };
    return { state: next, outbound: [snapshotOutbound(next, item.eventId)] };
  }

  const nextStageIndex = current.stageIndex + 1;
  next = {
    ...next,
    stageIndex: nextStageIndex,
    stageStartedAt: item.serverTime,
    requiredNodeIds: requiredNodesForStage(
      nextStageIndex,
      current.seed!,
      current.liveNodeIds,
      current.startedAt!,
    ),
    completions: [],
  };
  return {
    state: next,
    outbound: [stageOutbound(next), snapshotOutbound(next, item.eventId)],
  };
}

function acceptAbort(
  current: SharedMissionCoordinatorState,
  item: SessionFeedItem,
  event: MissionAbortEvent,
  context: SharedMissionCoordinatorContext,
): CoordinatorReduction {
  if (
    event.nodeId !== item.senderId ||
    event.operationId !== current.operationId ||
    current.startedAt === undefined ||
    current.finishedAt !== undefined ||
    current.abortedAt !== undefined ||
    !current.liveNodeIds.includes(event.nodeId) ||
    Math.abs(event.abortedAt - item.serverTime) > MAXIMUM_EVIDENCE_CLOCK_SKEW_MS
  ) {
    return unchanged(current);
  }

  const next: SharedMissionCoordinatorState = {
    ...current,
    abortedAt: item.serverTime,
    abortedByNodeId: event.nodeId,
    revision: current.revision + 1,
    acceptedThroughSequence: Math.max(current.acceptedThroughSequence, item.sequence),
  };
  const hostCanCheckpoint = context.isHost && current.hostNodeId === context.localNodeId;
  return {
    state: next,
    outbound: hostCanCheckpoint ? [snapshotOutbound(next, item.eventId)] : [],
  };
}

function acceptSnapshot(
  current: SharedMissionCoordinatorState,
  item: SessionFeedItem,
  event: MissionSnapshotEvent,
  context: SharedMissionCoordinatorContext,
): CoordinatorReduction {
  if (!isTrustedHost(item.senderId, event.hostNodeId, context, current)) return unchanged(current);
  if (!isNewerOrCurrentOperation(current, event.startedAt, event.operationId)) return unchanged(current);
  if (event.operationId === current.operationId) {
    if (event.revision < current.revision) return unchanged(current);
    if (event.revision === current.revision && event.acceptedThroughSequence < current.acceptedThroughSequence) {
      return unchanged(current);
    }
  }
  if (!snapshotIsSemanticallyValid(event)) return unchanged(current);

  return {
    state: {
      operationId: event.operationId,
      hostNodeId: event.hostNodeId,
      seed: event.seed,
      startedAt: event.startedAt,
      stageIndex: event.stageIndex,
      stageStartedAt: event.stageStartedAt,
      liveNodeIds: event.liveNodeIds,
      requiredNodeIds: event.requiredNodeIds,
      completions: event.completions,
      revision: event.revision,
      acceptedThroughSequence: event.acceptedThroughSequence,
      finishedAt: event.finishedAt,
      abortedAt: event.abortedAt,
      abortedByNodeId: event.abortedByNodeId,
    },
    outbound: [],
  };
}

function answerSnapshotRequest(
  current: SharedMissionCoordinatorState,
  item: SessionFeedItem,
  event: Extract<HousewireSessionEvent, { kind: 'mission.snapshot.request' }>,
  context: SharedMissionCoordinatorContext,
): CoordinatorReduction {
  if (
    !context.isHost ||
    current.hostNodeId !== context.localNodeId ||
    event.nodeId !== item.senderId ||
    !current.operationId ||
    !current.liveNodeIds.includes(event.nodeId)
  ) {
    return unchanged(current);
  }
  return { state: current, outbound: [snapshotOutbound(current, item.eventId)] };
}

function stageOutbound(state: SharedMissionCoordinatorState): CoordinatorOutbound {
  const stageId = line13StageIds[state.stageIndex];
  const event = housewireSessionEventSchema.parse({
    kind: 'mission.stage',
    missionId: 'line-13',
    operationId: state.operationId,
    hostNodeId: state.hostNodeId,
    stageId,
    stageIndex: state.stageIndex,
    startsAt: state.stageStartedAt,
    requiredNodeIds: state.requiredNodeIds,
    signalOwnerId: state.stageIndex === 0 ? state.requiredNodeIds[0] : undefined,
  });
  return {
    event,
    eventId: `stage-${compactIdPart(state.operationId ?? 'inactive')}-${state.stageIndex}`,
  };
}

function snapshotOutbound(state: SharedMissionCoordinatorState, causeEventId: string): CoordinatorOutbound {
  const event = housewireSessionEventSchema.parse({
    kind: 'mission.snapshot',
    missionId: 'line-13',
    operationId: state.operationId,
    hostNodeId: state.hostNodeId,
    seed: state.seed,
    startedAt: state.startedAt,
    stageId: line13StageIds[state.stageIndex],
    stageIndex: state.stageIndex,
    stageStartedAt: state.stageStartedAt,
    revision: state.revision,
    acceptedThroughSequence: state.acceptedThroughSequence,
    liveNodeIds: state.liveNodeIds,
    requiredNodeIds: state.requiredNodeIds,
    completions: state.completions,
    finishedAt: state.finishedAt,
    abortedAt: state.abortedAt,
    abortedByNodeId: state.abortedByNodeId,
  });
  return {
    event,
    eventId: `snap-${compactIdPart(state.operationId ?? 'inactive')}-${state.revision}-${shortHash(causeEventId)}`,
  };
}

function requiredNodesForStage(
  stageIndex: number,
  seed: number,
  operationNodeIds: readonly string[],
  startedAt: number,
): readonly string[] {
  const game = generateLine13Game(seed, operationNodeIds, startedAt);
  if (stageIndex === 0) return [game.ringingNodeId];
  if (stageIndex === 1 || stageIndex === 3) return [game.sourceNodeId];
  if (stageIndex === 2) return stableNodeIds([game.courierNodeId, game.destinationNodeId]);
  if (stageIndex === 4) {
    return stableNodeIds(operationNodeIds);
  }
  return stableNodeIds(operationNodeIds);
}

function evidenceIsSemanticallyValid(event: MissionEvidenceEvent): boolean {
  if (!isEvidenceAllowedForAction(event.actionId, event.evidenceKind)) return false;
  if (event.evidenceKind === 'MANUAL_HOLD') return event.confidence === 1;
  if (event.confidence < ACTION_MINIMUM_CONFIDENCE[event.actionId]) return false;
  return true;
}

function snapshotIsSemanticallyValid(event: MissionSnapshotEvent): boolean {
  const expectedStageId = line13StageIds[event.stageIndex];
  if (expectedStageId !== event.stageId) return false;
  const expectedRequired = requiredNodesForStage(
    event.stageIndex,
    event.seed,
    event.liveNodeIds,
    event.startedAt,
  );
  if (!sameIds(expectedRequired, event.requiredNodeIds)) return false;
  if (
    event.stageIndex === 2 &&
    event.completions.some(
      (completion) =>
        !completionMatchesCourierAssignment(
          event.seed,
          event.liveNodeIds,
          event.startedAt,
          completion.nodeId,
          completion.actionId,
        ),
    )
  ) {
    return false;
  }
  if (event.stageIndex === 2 && event.completions.length > 1) {
    const times = event.completions.map((completion) => completion.observedAt);
    if (Math.max(...times) - Math.min(...times) > COURIER_HANDOFF_WINDOW_MS) return false;
  }
  if (event.finishedAt !== undefined) {
    if (!stageIsComplete({
      ...createSharedMissionCoordinatorState(),
      stageIndex: event.stageIndex,
      requiredNodeIds: event.requiredNodeIds,
      completions: event.completions,
    })) {
      return false;
    }
    const times = event.completions.map((completion) => completion.observedAt);
    if (times.length > 0 && Math.max(...times) - Math.min(...times) > SYNCHRONIZED_HANGUP_WINDOW_MS) return false;
  }
  return true;
}

function stageIsComplete(state: Pick<SharedMissionCoordinatorState, 'stageIndex' | 'requiredNodeIds' | 'completions'>): boolean {
  const stageId = line13StageIds[state.stageIndex];
  if (!stageId) return false;
  const actions = actionsForLine13Stage(stageId);
  if (stageId === 'courier-transfer') {
    return actions.every((actionId) =>
      state.completions.some((completion) => completion.actionId === actionId),
    );
  }
  return state.requiredNodeIds.every((nodeId) =>
    actions.every((actionId) =>
      state.completions.some((completion) => completion.nodeId === nodeId && completion.actionId === actionId),
    ),
  );
}

function inferActionId(
  state: SharedMissionCoordinatorState,
  nodeId: string,
  stageId: Line13StageId,
  evidenceKind: EvidenceKind,
): Line13ActionId | undefined {
  return actionsForLine13Stage(stageId).find(
    (actionId) =>
      isEvidenceAllowedForAction(actionId, evidenceKind) &&
      actionIsAssignedToNode(state, nodeId, actionId) &&
      !state.completions.some((completion) => completion.nodeId === nodeId && completion.actionId === actionId),
  );
}

function actionIsAssignedToNode(
  state: SharedMissionCoordinatorState,
  nodeId: string,
  actionId: Line13ActionId,
): boolean {
  if (state.stageIndex !== 2) return true;
  if (state.seed === undefined || state.startedAt === undefined) return false;
  return completionMatchesCourierAssignment(
    state.seed,
    state.liveNodeIds,
    state.startedAt,
    nodeId,
    actionId,
  );
}

function evidenceMatchesStageAssignment(
  state: SharedMissionCoordinatorState,
  event: MissionEvidenceEvent,
): boolean {
  if (state.seed === undefined || state.startedAt === undefined) return false;
  const game = generateLine13Game(state.seed, state.liveNodeIds, state.startedAt);
  if (event.stageId === 'split-cipher') return event.value === game.pin;
  if (event.stageId === 'route-reconstruction') return event.value === line13RouteProof(game);
  if (event.stageId !== 'courier-transfer') return true;
  if (
    !completionMatchesCourierAssignment(
      state.seed,
      state.liveNodeIds,
      state.startedAt,
      event.nodeId,
      event.actionId,
    )
  ) {
    return false;
  }
  if (event.actionId !== 'release-destination-receipt') return true;
  return event.value === game.transferCode;
}

function completionMatchesCourierAssignment(
  seed: number,
  liveNodeIds: readonly string[],
  startedAt: number,
  nodeId: string,
  actionId: Line13ActionId,
): boolean {
  const game = generateLine13Game(seed, liveNodeIds, startedAt);
  if (actionId === 'carry-warning') return nodeId === game.courierNodeId;
  if (actionId === 'release-destination-receipt') return nodeId === game.destinationNodeId;
  return false;
}

function isTrustedHost(
  senderId: string,
  claimedHostNodeId: string,
  context: SharedMissionCoordinatorContext,
  state: SharedMissionCoordinatorState,
): boolean {
  if (senderId !== claimedHostNodeId) return false;
  const expected = state.hostNodeId ?? context.expectedHostNodeId;
  return expected === undefined || expected === claimedHostNodeId;
}

function matchesActiveHost(
  state: SharedMissionCoordinatorState,
  senderId: string,
  claimedHostNodeId: string,
  operationId: string,
  context: SharedMissionCoordinatorContext,
): boolean {
  return (
    operationId === state.operationId &&
    claimedHostNodeId === state.hostNodeId &&
    isTrustedHost(senderId, claimedHostNodeId, context, state)
  );
}

function isNewerOperation(state: SharedMissionCoordinatorState, startsAt: number, operationId: string): boolean {
  if (state.startedAt === undefined) return true;
  return startsAt > state.startedAt || (startsAt === state.startedAt && operationId.localeCompare(state.operationId ?? '') > 0);
}

function isNewerOrCurrentOperation(state: SharedMissionCoordinatorState, startsAt: number, operationId: string): boolean {
  return state.operationId === operationId || isNewerOperation(state, startsAt, operationId);
}

function stableNodeIds(nodeIds: readonly string[]): string[] {
  return [...new Set(nodeIds)].sort((left, right) => left.localeCompare(right)).slice(0, 4);
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareCompletions(left: AcceptedCompletion, right: AcceptedCompletion): number {
  return left.nodeId.localeCompare(right.nodeId) || left.actionId.localeCompare(right.actionId);
}

function shortHash(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function compactIdPart(value: string): string {
  if (value.length <= 24) return value;
  return `${value.slice(0, 7)}-${shortHash(value)}-${value.slice(-7)}`;
}

function unchanged(state: SharedMissionCoordinatorState): CoordinatorReduction {
  return { state, outbound: [] };
}

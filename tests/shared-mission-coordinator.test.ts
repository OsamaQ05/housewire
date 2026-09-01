import { describe, expect, it } from 'vitest';

import { generateLine13Game, line13RouteProof } from '../src/domain/line-13-game';
import type { EvidenceKind } from '../src/domain/types';
import {
  completedNodeIds,
  createLocalCompletionEvent,
  createMissionAbortEvent,
  createMissionStartEvent,
  createSharedMissionCoordinatorState,
  reduceSharedMissionFrame,
  type LocalCompletionInput,
  type SharedMissionCoordinatorContext,
  type SharedMissionCoordinatorState,
} from '../src/features/session/shared-mission-coordinator';
import {
  housewireSessionEventSchema,
  type HousewireSessionEvent,
  type MissionSnapshotEvent,
} from '../src/features/session/protocol';
import type { SessionFeedItem } from '../src/features/session/use-housewire-session';

const HOST = 'local';
const NODES = ['guest-a', 'guest-b', HOST] as const;

function hostContext(liveNodeIds: readonly string[] = NODES): SharedMissionCoordinatorContext {
  return {
    expectedHostNodeId: HOST,
    isHost: true,
    liveNodeIds,
    localNodeId: HOST,
  };
}

function guestContext(nodeId = 'guest-a'): SharedMissionCoordinatorContext {
  return {
    expectedHostNodeId: HOST,
    isHost: false,
    liveNodeIds: NODES,
    localNodeId: nodeId,
  };
}

function frame(
  event: HousewireSessionEvent,
  senderId: string,
  sequence: number,
  serverTime = 10_000 + sequence,
  eventId = `event-${sequence}`,
): SessionFeedItem {
  return { event, senderId, sequence, serverTime, eventId };
}

function startHost(seed = 13, liveNodeIds: readonly string[] = NODES): {
  state: SharedMissionCoordinatorState;
  outbound: ReturnType<typeof reduceSharedMissionFrame>['outbound'];
} {
  const event = createMissionStartEvent({
    hostNodeId: HOST,
    liveNodeIds,
    operationId: 'op-line13',
    seed,
    startsAt: 10_000,
  });
  return reduceSharedMissionFrame(
    createSharedMissionCoordinatorState(),
    frame(event, HOST, 1, 10_000, 'start-op-line13'),
    hostContext(liveNodeIds),
  );
}

function inputForStage(stageIndex: number, actionOffset = 0, observedAt = 11_000): LocalCompletionInput {
  const inputs: readonly (readonly LocalCompletionInput[])[] = [
    [{ evidenceKind: 'LIFTED', confidence: 0.9 }],
    [{ evidenceKind: 'WARNING_RECONSTRUCTED', confidence: 1 }],
    [
      { actionId: 'carry-warning', evidenceKind: 'CARRY_STEADY', confidence: 0.9 },
      { actionId: 'release-destination-receipt', evidenceKind: 'RECEIPT_RELEASED', confidence: 1 },
    ],
    [{ evidenceKind: 'ROUTE_RECONSTRUCTED', confidence: 1 }],
    [{ evidenceKind: 'PLACED_FLAT', confidence: 0.9 }],
  ];
  return { ...inputs[stageIndex][actionOffset], observedAt };
}

function submit(
  state: SharedMissionCoordinatorState,
  nodeId: string,
  input: LocalCompletionInput,
  sequence: number,
  context = hostContext(),
  serverTime = input.observedAt ?? 11_000,
) {
  const event = createLocalCompletionEvent(state, nodeId, input, input.observedAt ?? 11_000);
  if (!event) throw new Error(`Could not create evidence for stage ${state.stageIndex} and ${nodeId}.`);
  return reduceSharedMissionFrame(
    state,
    frame(event, nodeId, sequence, serverTime, `evidence-${sequence}`),
    context,
  );
}

function finishCurrentStage(
  state: SharedMissionCoordinatorState,
  firstSequence: number,
  context = hostContext(),
): { state: SharedMissionCoordinatorState; nextSequence: number } {
  let next = state;
  let sequence = firstSequence;
  const initialStage = state.stageIndex;
  if (initialStage === 2) {
    const game = gameForState(state);
    next = submit(
      next,
      game.courierNodeId,
      inputForStage(2, 0, 11_000 + sequence),
      sequence++,
      context,
    ).state;
    next = submit(
      next,
      game.destinationNodeId,
      {
        ...inputForStage(2, 1, 11_000 + sequence),
        value: game.transferCode,
      },
      sequence++,
      context,
    ).state;
    return { state: next, nextSequence: sequence };
  }
  for (const nodeId of state.requiredNodeIds) {
    const game = gameForState(next);
    const input = inputForStage(initialStage, 0, 11_000 + sequence);
    const result = submit(
      next,
      nodeId,
      {
        ...input,
        value:
          initialStage === 1
            ? game.pin
            : initialStage === 3
              ? line13RouteProof(game)
              : input.value,
      },
      sequence++,
      context,
    );
    next = result.state;
  }
  return { state: next, nextSequence: sequence };
}

function gameForState(state: SharedMissionCoordinatorState) {
  if (state.seed === undefined || state.startedAt === undefined) throw new Error('Mission has not started.');
  return generateLine13Game(state.seed, state.liveNodeIds, state.startedAt);
}

describe('host-authoritative shared LINE 13 coordinator', () => {
  it('broadcasts an authored first stage and reconnectable snapshot at start', () => {
    const started = startHost();
    expect(started.state.startedAt).toBe(10_000);
    expect(started.state.requiredNodeIds).toHaveLength(1);
    expect(started.outbound.map((item) => item.event.kind)).toEqual([
      'mission.stage',
      'mission.snapshot',
    ]);
  });

  it.each([
    [['guest-a', HOST]],
    [['guest-a', 'guest-b', HOST]],
    [['guest-a', 'guest-b', 'guest-c', HOST]],
  ] as const)('assigns exactly one distinct seeded courier and destination for %s', (liveNodeIds) => {
    let state = startHost(13, liveNodeIds).state;
    let sequence = 2;
    const context = hostContext(liveNodeIds);
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence, context));
    ({ state } = finishCurrentStage(state, sequence, context));
    const game = gameForState(state);

    expect(game.courierNodeId).not.toBe(game.destinationNodeId);
    expect(state.requiredNodeIds).toEqual(
      [game.courierNodeId, game.destinationNodeId].sort((left, right) => left.localeCompare(right)),
    );
  });

  it('keeps derived transport ids relay-safe even for maximum-length operation ids', () => {
    const event = createMissionStartEvent({
      hostNodeId: HOST,
      liveNodeIds: NODES,
      operationId: `o${'p'.repeat(63)}`,
      seed: 13,
      startsAt: 10_000,
    });
    const result = reduceSharedMissionFrame(
      createSharedMissionCoordinatorState(),
      frame(event, HOST, 1, 10_000, 'maximum-operation-start'),
      hostContext(),
    );
    expect(result.outbound.every((item) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(item.eventId))).toBe(true);
  });

  it('requires sender-matched semantic evidence and deduplicates retries', () => {
    let state = startHost().state;
    ({ state } = finishCurrentStage(state, 2));
    expect(state.stageIndex).toBe(1);

    const nodeId = state.requiredNodeIds[0];
    const event = createLocalCompletionEvent(
      state,
      nodeId,
      { ...inputForStage(1, 0, 11_100), value: gameForState(state).pin },
      11_100,
    )!;
    const spoofed = reduceSharedMissionFrame(state, frame(event, 'different-node', 8, 11_100), hostContext());
    expect(spoofed.state).toBe(state);

    const accepted = reduceSharedMissionFrame(state, frame(event, nodeId, 9, 11_100), hostContext());
    expect(accepted.state.revision).toBe(state.revision + 1);
    const duplicate = reduceSharedMissionFrame(
      accepted.state,
      frame(event, nodeId, 10, 11_100, 'different-transport-id'),
      hostContext(),
    );
    expect(duplicate.state.revision).toBe(accepted.state.revision);
    expect(duplicate.outbound.map((item) => item.event.kind)).toEqual(['mission.snapshot']);
  });

  it('rejects forged cipher and route completions with the right evidence label', () => {
    let state = startHost().state;
    let sequence = 2;
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    expect(state.stageIndex).toBe(1);

    const cipherNode = state.requiredNodeIds[0];
    const badCipher = submit(
      state,
      cipherNode,
      { ...inputForStage(1, 0, 12_000), value: '0000' },
      sequence++,
    );
    expect(badCipher.state).toBe(state);

    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    expect(state.stageIndex).toBe(3);
    const routeNode = state.requiredNodeIds[0];
    const badRoute = submit(
      state,
      routeNode,
      { ...inputForStage(3, 0, 14_000), value: 'R-FORGED' },
      sequence,
    );
    expect(badRoute.state).toBe(state);
  });

  it('requires one seeded courier half and one distinct destination half before advancing', () => {
    let state = startHost().state;
    let sequence = 2;
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    expect(state.stageIndex).toBe(2);
    const game = gameForState(state);
    expect(state.requiredNodeIds).toEqual(
      [game.courierNodeId, game.destinationNodeId].sort((left, right) => left.localeCompare(right)),
    );

    let result = submit(state, game.courierNodeId, inputForStage(2, 0, 12_000), sequence++);
    expect(result.state.stageIndex).toBe(2);
    expect(completedNodeIds(result.state)).toEqual([game.courierNodeId]);
    result = submit(
      result.state,
      game.destinationNodeId,
      { ...inputForStage(2, 1, 12_200), value: game.transferCode },
      sequence++,
    );
    expect(result.state.stageIndex).toBe(3);
  });

  it('rejects destination arrival until the assigned courier has a fresh handoff proof', () => {
    let state = startHost().state;
    let sequence = 2;
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    const game = gameForState(state);

    const earlyArrival = submit(
      state,
      game.destinationNodeId,
      { ...inputForStage(2, 1, 12_000), value: game.transferCode },
      sequence,
    );
    expect(earlyArrival.state).toBe(state);
    expect(earlyArrival.outbound).toEqual([]);
  });

  it('rejects either handoff action from the wrong assigned sender', () => {
    let state = startHost().state;
    let sequence = 2;
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    const game = gameForState(state);

    const validCarry = createLocalCompletionEvent(
      state,
      game.courierNodeId,
      inputForStage(2, 0, 12_000),
      12_000,
    )!;
    const wrongCourier = housewireSessionEventSchema.parse({
      ...validCarry,
      nodeId: game.destinationNodeId,
    });
    const rejectedCarry = reduceSharedMissionFrame(
      state,
      frame(wrongCourier, game.destinationNodeId, sequence++, 12_000, 'wrong-courier'),
      hostContext(),
    );
    expect(rejectedCarry.state).toBe(state);

    const validReceipt = createLocalCompletionEvent(
      state,
      game.destinationNodeId,
      { ...inputForStage(2, 1, 12_100), value: game.transferCode },
      12_100,
    )!;
    const wrongDestination = housewireSessionEventSchema.parse({
      ...validReceipt,
      nodeId: game.courierNodeId,
    });
    const rejectedReceipt = reduceSharedMissionFrame(
      state,
      frame(wrongDestination, game.courierNodeId, sequence, 12_100, 'wrong-destination'),
      hostContext(),
    );
    expect(rejectedReceipt.state).toBe(state);
  });

  it('requires the seeded transfer code and exact receipt confidence', () => {
    let state = startHost().state;
    let sequence = 2;
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    const game = gameForState(state);

    for (const [value, confidence] of [
      [undefined, 1],
      ['WRONG', 1],
      [game.transferCode, 0.99],
    ] as const) {
      const event = createLocalCompletionEvent(
        state,
        game.destinationNodeId,
        {
          actionId: 'release-destination-receipt',
          evidenceKind: 'RECEIPT_RELEASED',
          confidence,
          observedAt: 12_000 + sequence,
          value,
        },
        12_000 + sequence,
      )!;
      const rejected = reduceSharedMissionFrame(
        state,
        frame(event, game.destinationNodeId, sequence++, event.observedAt, `bad-receipt-${sequence}`),
        hostContext(),
      );
      expect(rejected.state).toBe(state);
    }
  });

  it('expires an old courier handoff after 20 seconds and requires a fresh courier proof', () => {
    let state = startHost().state;
    let sequence = 2;
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    const game = gameForState(state);

    state = submit(
      state,
      game.courierNodeId,
      inputForStage(2, 0, 12_000),
      sequence++,
    ).state;
    expect(state.completions.map((completion) => completion.actionId)).toEqual(['carry-warning']);

    state = submit(
      state,
      game.destinationNodeId,
      { ...inputForStage(2, 1, 32_001), value: game.transferCode },
      sequence++,
      hostContext(),
      32_001,
    ).state;
    expect(state.stageIndex).toBe(2);
    expect(state.completions).toEqual([]);

    state = submit(
      state,
      game.courierNodeId,
      inputForStage(2, 0, 32_100),
      sequence++,
    ).state;
    expect(state.completions.map((completion) => completion.actionId)).toEqual(['carry-warning']);

    state = submit(
      state,
      game.destinationNodeId,
      { ...inputForStage(2, 1, 32_200), value: game.transferCode },
      sequence++,
    ).state;
    expect(state.stageIndex).toBe(3);
  });

  it('accepts the second assigned handoff half exactly at the 20-second boundary', () => {
    let state = startHost().state;
    let sequence = 2;
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    const game = gameForState(state);

    state = submit(
      state,
      game.courierNodeId,
      inputForStage(2, 0, 12_000),
      sequence++,
    ).state;
    state = submit(
      state,
      game.destinationNodeId,
      { ...inputForStage(2, 1, 32_000), value: game.transferCode },
      sequence,
    ).state;
    expect(state.stageIndex).toBe(3);
  });

  it('broadcasts a member-authored abort, checkpoints it, and blocks later evidence', () => {
    const state = startHost().state;
    const abort = createMissionAbortEvent(state, 'guest-a', 10_500)!;
    const aborted = reduceSharedMissionFrame(
      state,
      frame(abort, 'guest-a', 2, 10_500, 'abort-line13'),
      hostContext(),
    );

    expect(aborted.state.abortedAt).toBe(10_500);
    expect(aborted.state.abortedByNodeId).toBe('guest-a');
    expect(aborted.outbound.map((item) => item.event.kind)).toEqual(['mission.snapshot']);
    expect(createLocalCompletionEvent(
      aborted.state,
      aborted.state.requiredNodeIds[0],
      inputForStage(0, 0, 10_600),
      10_600,
    )).toBeUndefined();

    const checkpoint = aborted.outbound[0];
    const restored = reduceSharedMissionFrame(
      createSharedMissionCoordinatorState(),
      frame(checkpoint.event, HOST, 3, 10_510, checkpoint.eventId),
      guestContext(),
    );
    expect(restored.state.abortedAt).toBe(10_500);
    expect(restored.state.abortedByNodeId).toBe('guest-a');
  });

  it('rejects spoofed abort senders and nodes outside the active operation', () => {
    const state = startHost().state;
    const abort = createMissionAbortEvent(state, 'guest-a', 10_500)!;
    const spoofed = reduceSharedMissionFrame(
      state,
      frame(abort, 'guest-b', 2, 10_500, 'spoofed-abort'),
      hostContext(),
    );

    expect(spoofed.state).toBe(state);
    expect(createMissionAbortEvent(state, 'outsider', 10_500)).toBeUndefined();
  });

  it('never silently removes an operation node when the synchronized hang-up opens', () => {
    let state = startHost().state;
    let sequence = 2;
    while (state.stageIndex < 3) {
      ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    }
    const liveAtHangup = ['guest-a', HOST];
    ({ state } = finishCurrentStage(state, sequence, hostContext(liveAtHangup)));
    expect(state.stageIndex).toBe(4);
    expect(state.requiredNodeIds).toEqual(NODES);
  });

  it('rejects evidence observed before the authoritative stage opened', () => {
    const state = startHost().state;
    const nodeId = state.requiredNodeIds[0];
    const event = createLocalCompletionEvent(
      state,
      nodeId,
      { evidenceKind: 'LIFTED', confidence: 0.9, observedAt: 9_999 },
      9_999,
    )!;
    const result = reduceSharedMissionFrame(
      state,
      frame(event, nodeId, 2, 10_010, 'stale-lift'),
      hostContext(),
    );
    expect(result.state).toBe(state);
    expect(result.outbound).toEqual([]);
  });

  it('answers a retry from the previous stage with the current authoritative snapshot', () => {
    const initial = startHost().state;
    const nodeId = initial.requiredNodeIds[0];
    const oldEvidence = createLocalCompletionEvent(
      initial,
      nodeId,
      { evidenceKind: 'LIFTED', confidence: 0.9, observedAt: 10_100 },
      10_100,
    )!;
    const advanced = reduceSharedMissionFrame(
      initial,
      frame(oldEvidence, nodeId, 2, 10_100, 'first-lift'),
      hostContext(),
    );
    expect(advanced.state.stageIndex).toBe(1);
    const retry = reduceSharedMissionFrame(
      advanced.state,
      frame(oldEvidence, nodeId, 3, 10_200, 'retry-old-lift'),
      hostContext(),
    );
    expect(retry.state.stageIndex).toBe(1);
    expect(retry.outbound.map((item) => item.event.kind)).toEqual(['mission.snapshot']);
  });

  it('expires a loose hang-up and completes only when every live node closes inside 1600 ms', () => {
    let state = startHost().state;
    let sequence = 2;
    while (state.stageIndex < 4) {
      ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    }
    const [first, second, third] = state.requiredNodeIds;
    state = submit(state, first, inputForStage(4, 0, 20_000), sequence++).state;
    state = submit(state, second, inputForStage(4, 0, 22_000), sequence++).state;
    expect(completedNodeIds(state)).toEqual([second]);
    state = submit(state, first, inputForStage(4, 0, 22_300), sequence++).state;
    state = submit(state, third, inputForStage(4, 0, 22_500), sequence++).state;
    expect(state.finishedAt).toBeDefined();
    expect(completedNodeIds(state)).toEqual(state.requiredNodeIds);
  });

  it('reconstructs a switchboard stage transition from a host snapshot and rejects a spoofed host', () => {
    let state = startHost().state;
    ({ state } = finishCurrentStage(state, 2));
    const node = state.requiredNodeIds[0];
    const partial = submit(
      state,
      node,
      { ...inputForStage(1, 0, 13_000), value: gameForState(state).pin },
      10,
    );
    const snapshot = partial.outbound.find((item) => item.event.kind === 'mission.snapshot')!;

    const restored = reduceSharedMissionFrame(
      createSharedMissionCoordinatorState(),
      frame(snapshot.event, HOST, 11, 13_010, snapshot.eventId),
      guestContext(),
    );
    expect(restored.state.operationId).toBe('op-line13');
    expect(restored.state.stageIndex).toBe(2);
    expect(restored.state.completions).toHaveLength(0);

    const spoofed = reduceSharedMissionFrame(
      createSharedMissionCoordinatorState(),
      frame(snapshot.event, 'guest-a', 12, 13_020, 'spoofed-snapshot'),
      guestContext(),
    );
    expect(spoofed.state.startedAt).toBeUndefined();
  });

  it('accepts only snapshots with the seeded two-node courier assignment', () => {
    let state = startHost().state;
    let sequence = 2;
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    ({ state, nextSequence: sequence } = finishCurrentStage(state, sequence));
    const game = gameForState(state);
    const partial = submit(state, game.courierNodeId, inputForStage(2, 0, 12_000), sequence++);
    const snapshot = partial.outbound.find(
      (item): item is { event: MissionSnapshotEvent; eventId: string } => item.event.kind === 'mission.snapshot',
    )!;

    const restored = reduceSharedMissionFrame(
      createSharedMissionCoordinatorState(),
      frame(snapshot.event, HOST, sequence++, 12_010, snapshot.eventId),
      guestContext(),
    );
    expect(restored.state.stageIndex).toBe(2);
    expect(restored.state.completions).toHaveLength(1);

    const swappedCompletion = housewireSessionEventSchema.parse({
      ...snapshot.event,
      completions: snapshot.event.completions.map((completion) => ({
        ...completion,
        nodeId: game.destinationNodeId,
      })),
    });
    const rejectedSwap = reduceSharedMissionFrame(
      createSharedMissionCoordinatorState(),
      frame(swappedCompletion, HOST, sequence++, 12_020, 'snapshot-swapped-assignment'),
      guestContext(),
    );
    expect(rejectedSwap.state.startedAt).toBeUndefined();

    const missingDestination = housewireSessionEventSchema.parse({
      ...snapshot.event,
      requiredNodeIds: [game.courierNodeId],
    });
    const rejectedRoster = reduceSharedMissionFrame(
      createSharedMissionCoordinatorState(),
      frame(missingDestination, HOST, sequence, 12_030, 'snapshot-missing-destination'),
      guestContext(),
    );
    expect(rejectedRoster.state.startedAt).toBeUndefined();
  });

  it.each([
    ['LIFTED', 0.2],
    ['MANUAL_HOLD', 0.9],
  ] as const)('rejects under-threshold %s evidence', (evidenceKind: EvidenceKind, confidence: number) => {
    const state = startHost().state;
    const event = createLocalCompletionEvent(
      state,
      state.requiredNodeIds[0],
      { evidenceKind, confidence, observedAt: 10_100 },
      10_100,
    )!;
    const result = reduceSharedMissionFrame(
      state,
      frame(event, event.nodeId, 2, 10_100),
      hostContext(),
    );
    expect(result.state).toBe(state);
  });
});

import { describe, expect, it } from 'vitest';

import {
  compiledCaseForRuntime,
  createEscapeAbortEvent,
  createEscapeMissionRuntime,
  escapeProofToken,
  escapeSnapshotFromRuntime,
  missingRequiredEscapeNodeIds,
  reduceEscapeAbort,
  reduceEscapeProof,
  runtimeFromEscapeSnapshot,
} from '../src/features/session/escape-mission-coordinator';
import {
  housewireSessionEventSchema,
  type EscapeProofEvent,
  type EscapeStartEvent,
} from '../src/features/session/protocol';

const start: EscapeStartEvent = {
  kind: 'escape.start',
  missionId: 'dead-air',
  operationId: 'op-test',
  hostNodeId: 'a',
  seed: 415,
  startsAt: 1_000,
  liveNodeIds: ['a', 'b', 'c'],
};

function proof(state: ReturnType<typeof createEscapeMissionRuntime>, nodeId: string, proofKey: string): EscapeProofEvent {
  return {
    kind: 'escape.proof',
    missionId: state.missionId,
    operationId: state.operationId,
    stageIndex: state.stageIndex,
    nodeId,
    proofKey,
    answerToken: escapeProofToken(state.missionId, state.seed, state.stageIndex, proofKey, nodeId),
    observedAt: 2_000,
  };
}

describe('escape mission coordinator', () => {
  it('accepts a valid semantic proof and advances the host-authoritative stage', () => {
    const state = createEscapeMissionRuntime(start);
    const event = proof(state, 'a', 'duct-order');
    const reduced = reduceEscapeProof(state, event, 'a', 2_100);
    expect(reduced.accepted).toBe(true);
    expect(reduced.advanced).toBe(true);
    expect(reduced.state.stageIndex).toBe(1);
  });

  it('rejects spoofed senders and proof tokens', () => {
    const state = createEscapeMissionRuntime(start);
    const event = proof(state, 'a', 'duct-order');
    expect(reduceEscapeProof(state, event, 'b', 2_100).accepted).toBe(false);
    expect(reduceEscapeProof(state, { ...event, answerToken: 'PFAKE' }, 'a', 2_100).accepted).toBe(false);
  });

  it('requires every assigned node at synchronized stages', () => {
    let state = createEscapeMissionRuntime(start);
    state = { ...state, stageIndex: 4, stageStartedAt: 5_000, revision: 4 };
    for (const nodeId of ['a', 'b']) {
      const reduced = reduceEscapeProof(state, proof(state, nodeId, 'countertone'), nodeId, 6_000);
      expect(reduced.state.finishedAt).toBeUndefined();
      state = reduced.state;
    }
    const last = reduceEscapeProof(state, proof(state, 'c', 'countertone'), 'c', 6_050);
    expect(last.state.finishedAt).toBe(6_050);
  });

  it('expires stale synchronized proofs instead of accepting a fake wide window', () => {
    let state = createEscapeMissionRuntime(start);
    state = { ...state, stageIndex: 4, stageStartedAt: 5_000, revision: 4 };
    state = reduceEscapeProof(state, proof(state, 'a', 'countertone'), 'a', 6_000).state;
    state = reduceEscapeProof(state, proof(state, 'b', 'countertone'), 'b', 12_000).state;
    expect(state.completions.map((item) => item.nodeId)).toEqual(['b']);
    const third = reduceEscapeProof(state, proof(state, 'c', 'countertone'), 'c', 12_100);
    expect(third.state.finishedAt).toBeUndefined();
  });

  it('round-trips reconnect snapshots without changing authoritative state', () => {
    const state = { ...createEscapeMissionRuntime(start), revision: 7 };
    expect(runtimeFromEscapeSnapshot(escapeSnapshotFromRuntime(state))).toEqual(state);
  });

  it('identifies an absent required player instead of silently reducing the stage', () => {
    const state = createEscapeMissionRuntime(start);
    const requiredNodeId = compiledCaseForRuntime(state).stages[state.stageIndex].requiredNodeIds[0];
    expect(requiredNodeId).toBeDefined();
    expect(
      missingRequiredEscapeNodeIds(
        state,
        state.liveNodeIds.filter((nodeId) => nodeId !== requiredNodeId),
      ),
    ).toEqual([requiredNodeId]);
  });

  it('accepts only the operation host abort and checkpoints the terminal state', () => {
    const state = createEscapeMissionRuntime(start);
    const event = createEscapeAbortEvent(state, 'a', 2_000)!;
    const reduced = reduceEscapeAbort(state, event, 'a', 2_050);
    expect(reduced.accepted).toBe(true);
    expect(reduced.state.abortedAt).toBe(2_050);
    expect(reduced.state.revision).toBe(1);
    expect(missingRequiredEscapeNodeIds(reduced.state, [])).toEqual([]);
    expect(reduceEscapeProof(reduced.state, proof(reduced.state, 'a', 'duct-order'), 'a', 2_100).accepted).toBe(false);
    const snapshot = escapeSnapshotFromRuntime(reduced.state);
    expect(housewireSessionEventSchema.safeParse(snapshot).success).toBe(true);
    expect(housewireSessionEventSchema.safeParse({ ...snapshot, finishedAt: 2_100 }).success).toBe(false);
    expect(runtimeFromEscapeSnapshot(snapshot)).toEqual(reduced.state);
  });

  it('rejects guest-authored, cross-operation and stale escape aborts', () => {
    const state = createEscapeMissionRuntime(start);
    expect(createEscapeAbortEvent(state, 'b', 2_000)).toBeUndefined();
    const event = createEscapeAbortEvent(state, 'a', 2_000)!;
    expect(reduceEscapeAbort(state, event, 'b', 2_050).accepted).toBe(false);
    expect(reduceEscapeAbort(state, { ...event, operationId: 'another-op' }, 'a', 2_050).accepted).toBe(false);
    expect(reduceEscapeAbort(state, event, 'a', 32_001).accepted).toBe(false);
  });
});

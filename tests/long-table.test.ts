import { describe, expect, it } from 'vitest';

import {
  compileLongTableCase,
  type LongTableFinaleProof,
  type LongTableKeepsakeProof,
  type LongTablePassProof,
  validateLongTableArtifactOrder,
  validateLongTableFinaleProof,
  validateLongTableKeepsakeProof,
  validateLongTablePassProof,
  validateLongTablePhotoCode,
  validateStageProof,
} from '../src/domain/escape-case-compiler';
import {
  createEscapeMissionRuntime,
  escapeProofToken,
  reduceEscapeProof,
} from '../src/features/session/escape-mission-coordinator';
import type { EscapeProofEvent, EscapeStartEvent } from '../src/features/session/protocol';
import type { Capability } from '../src/domain/types';

const fullCapabilities = [
  'manual',
  'touch',
  'motion',
  'orientation',
  'microphoneLevel',
  'cameraQr',
  'haptics',
] as const satisfies readonly Capability[];

function nodeIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `node-${index + 1}`);
}

function validKeepsake(game: ReturnType<typeof compileLongTableCase>, index: number): LongTableKeepsakeProof {
  const assignment = game.keepsakes[index];
  return {
    round: assignment.round,
    seekerNodeId: assignment.seekerNodeId,
    witnessNodeId: assignment.witnessNodeId,
    markerToken: assignment.markerToken,
    framedInCamera: true,
    witnessConfirmed: true,
  };
}

function validPass(game: ReturnType<typeof compileLongTableCase>, index: number): LongTablePassProof {
  const step = game.serviceRoute[index];
  return {
    step: step.step,
    courierNodeId: step.courierNodeId,
    stationOwnerNodeId: step.stationOwnerNodeId,
    markerToken: step.markerToken,
    requiredPose: step.requiredPose,
    cameraEvidenceMode: 'camera-qr',
    motionEvidenceMode: 'device-motion',
    stationOwnerConfirmed: true,
  };
}

function validFinale(game: ReturnType<typeof compileLongTableCase>, startedAt = 10_000): LongTableFinaleProof {
  return {
    startedAt,
    completedAt: startedAt + game.finale.windowMs - 1,
    contactsHeld: true,
    assignments: game.finale.assignments.map((assignment) => ({
      ...assignment,
      motionEvidenceMode: 'device-motion',
      voiceEvidenceMode: 'microphone-level',
    })),
  };
}

describe('THE LONG TABLE compiler', () => {
  it.each([2, 3, 4])('builds a replayable five-stage family case for %i phones', (count) => {
    const nodes = nodeIds(count);
    for (let seed = 0; seed < 96; seed += 1) {
      const game = compileLongTableCase(seed, nodes);
      expect(game.id).toBe('long-table');
      expect(game.stages.map((stage) => stage.id)).toEqual([
        'take-your-places',
        'stolen-photograph',
        'what-the-house-kept',
        'run-the-pass',
        'last-bell',
      ]);
      expect(game.stages.every((stage) => nodes.every((nodeId) => stage.requiredNodeIds.includes(nodeId)))).toBe(true);
      expect(game.artifacts).toHaveLength(4);
      expect(new Set(game.artifacts.map((artifact) => artifact.id))).toHaveLength(4);
      expect(new Set(game.artifacts.map((artifact) => artifact.ownerNodeId))).toEqual(new Set(nodes));
      expect(game.artifacts.map((artifact) => artifact.era)).toEqual([...game.artifacts].map((artifact) => artifact.era).sort());
      expect(game.artifactOrder).toEqual(game.artifacts.map((artifact) => artifact.id));
      expect(game.photograph.fragments).toHaveLength(4);
      expect(new Set(game.photograph.fragments.map((fragment) => fragment.position))).toHaveLength(4);
      expect(new Set(game.photograph.fragments.map((fragment) => fragment.digit))).toHaveLength(4);
      expect(new Set(game.photograph.fragments.map((fragment) => fragment.ownerNodeId))).toEqual(new Set(nodes));
      expect(game.photograph.code).toMatch(/^[1-9]{4}$/);
      expect(game.keepsakes.map((assignment) => assignment.seekerNodeId).sort()).toEqual([...nodes].sort());
      expect(game.keepsakes.every((assignment) => assignment.seekerNodeId !== assignment.witnessNodeId)).toBe(true);
      expect(game.serviceRoute.map((step) => step.courierNodeId).sort()).toEqual([...nodes].sort());
      expect(game.serviceRoute.every((step) => step.courierNodeId !== step.stationOwnerNodeId)).toBe(true);
      expect(new Set(game.serviceRoute.map((step) => step.markerToken))).toHaveLength(count);
      expect(game.finale.assignments.map((assignment) => assignment.nodeId)).toEqual(nodes);
    }
  });

  it('is deterministic while replay indexes materially change the room', () => {
    const first = compileLongTableCase('DINNER', ['a', 'b', 'c']);
    expect(compileLongTableCase('DINNER', ['a', 'b', 'c'])).toEqual(first);
    const replay = compileLongTableCase('DINNER', ['a', 'b', 'c'], { replayIndex: 1 });
    expect(replay.effectiveSeed).not.toBe(first.effectiveSeed);
    expect(replay).not.toEqual(first);
  });

  it('keeps every camera, voice, and orientation fallback semantically playable', () => {
    const nodes = ['a', 'b', 'c'];
    const missing = compileLongTableCase(2, nodes, {
      capabilitiesByNode: Object.fromEntries(nodes.map((nodeId) => [nodeId, ['manual', 'touch'] as const])),
    });
    expect(missing.capabilityFallbacks.every((plan) => plan.selectedMode === 'fallback')).toBe(true);
    expect(missing.capabilityFallbacks.every((plan) => plan.preservesSemanticProof)).toBe(true);
    const full = compileLongTableCase(2, nodes, {
      capabilitiesByNode: Object.fromEntries(nodes.map((nodeId) => [nodeId, fullCapabilities])),
    });
    expect(full.capabilityFallbacks.every((plan) => plan.selectedMode === 'preferred')).toBe(true);
  });

  it('validates the timeline and photograph without leaking an unsolved suffix', () => {
    const game = compileLongTableCase(3, ['a', 'b', 'c']);
    expect(validateLongTableArtifactOrder(game, game.artifactOrder.slice(0, 2))).toMatchObject({ status: 'incomplete', acceptedPrefixLength: 2 });
    expect(validateLongTableArtifactOrder(game, [...game.artifactOrder].reverse())).toMatchObject({ status: 'mismatch' });
    expect(validateLongTablePhotoCode(game, game.photograph.code)).toEqual({ accepted: true, code: 'ACCEPTED' });
    expect(validateLongTablePhotoCode(game, '0000')).toMatchObject({ accepted: false, code: 'WRONG_VALUE' });
  });

  it('rejects fake witnesses, wrong destinations, forged seals, and late finales', () => {
    const game = compileLongTableCase(4, ['a', 'b', 'c']);
    const keepsake = validKeepsake(game, 0);
    expect(validateLongTableKeepsakeProof(game, keepsake).accepted).toBe(true);
    expect(validateLongTableKeepsakeProof(game, { ...keepsake, witnessNodeId: keepsake.seekerNodeId })).toMatchObject({ accepted: false, code: 'WRONG_TARGET' });
    expect(validateLongTableKeepsakeProof(game, { ...keepsake, markerToken: 'FORGED' })).toMatchObject({ accepted: false, code: 'WRONG_TOKEN' });
    const pass = validPass(game, 0);
    expect(validateLongTablePassProof(game, pass).accepted).toBe(true);
    expect(validateLongTablePassProof(game, { ...pass, stationOwnerConfirmed: false })).toMatchObject({ accepted: false, code: 'MISSING_CONFIRMATION' });
    expect(validateLongTablePassProof(game, { ...pass, requiredPose: pass.requiredPose === 'LEFT' ? 'RIGHT' : 'LEFT' })).toMatchObject({ accepted: false, code: 'WRONG_VALUE' });
    const finale = validFinale(game);
    expect(validateLongTableFinaleProof(game, finale).accepted).toBe(true);
    expect(validateLongTableFinaleProof(game, { ...finale, completedAt: finale.startedAt + game.finale.windowMs + 1 })).toMatchObject({ accepted: false, code: 'TIMING_WINDOW' });
  });

  it('validates all five typed coordinator proof boundaries', () => {
    const game = compileLongTableCase(9, ['a', 'b', 'c']);
    const keepsake = validKeepsake(game, 0);
    const pass = validPass(game, 0);
    expect(validateStageProof(game, 0, game.nodeIds[0], { kind: 'long-table/seat-order', value: game.artifactOrder })).toMatchObject({ accepted: true, proofKey: 'seat-order' });
    expect(validateStageProof(game, 1, game.photograph.keeperNodeId, { kind: 'long-table/photo-code', value: game.photograph.code })).toMatchObject({ accepted: true, proofKey: 'photo-code' });
    expect(validateStageProof(game, 2, keepsake.witnessNodeId, { kind: 'long-table/keepsake', value: keepsake })).toMatchObject({ accepted: true, proofKey: 'keepsake:1' });
    expect(validateStageProof(game, 3, pass.courierNodeId, { kind: 'long-table/pass-step', value: pass })).toMatchObject({ accepted: true, proofKey: 'pass:1' });
    expect(validateStageProof(game, 4, game.nodeIds[0], { kind: 'long-table/finale', value: validFinale(game) })).toMatchObject({ accepted: true, proofKey: 'last-bell' });
    expect(validateStageProof(game, 2, keepsake.seekerNodeId, { kind: 'long-table/keepsake', value: keepsake })).toMatchObject({ accepted: false, code: 'UNAUTHORIZED_SUBMITTER' });
  });
});

function proof(state: ReturnType<typeof createEscapeMissionRuntime>, nodeId: string, proofKey: string, at: number): EscapeProofEvent {
  return {
    kind: 'escape.proof',
    missionId: state.missionId,
    operationId: state.operationId,
    stageIndex: state.stageIndex,
    nodeId,
    proofKey,
    answerToken: escapeProofToken(state.missionId, state.seed, state.stageIndex, proofKey, nodeId),
    observedAt: at,
  };
}

describe('THE LONG TABLE live coordinator', () => {
  it('completes the full five-stage room with rotating family authority', () => {
    const start: EscapeStartEvent = {
      kind: 'escape.start',
      missionId: 'long-table',
      operationId: 'table-op',
      hostNodeId: 'a',
      seed: 71,
      startsAt: 1_000,
      liveNodeIds: ['a', 'b', 'c'],
    };
    let state = createEscapeMissionRuntime(start);
    let at = 2_000;
    for (const nodeId of state.liveNodeIds) {
      state = reduceEscapeProof(state, proof(state, nodeId, 'seat-order', at), nodeId, at).state;
      at += 100;
    }
    expect(state.stageIndex).toBe(1);
    let game = compileLongTableCase(state.seed, state.liveNodeIds);
    state = reduceEscapeProof(state, proof(state, game.photograph.keeperNodeId, 'photo-code', at), game.photograph.keeperNodeId, at).state;
    expect(state.stageIndex).toBe(2);
    game = compileLongTableCase(state.seed, state.liveNodeIds);
    for (const assignment of game.keepsakes) {
      state = reduceEscapeProof(state, proof(state, assignment.witnessNodeId, `keepsake:${assignment.round}`, at), assignment.witnessNodeId, at).state;
      at += 100;
    }
    expect(state.stageIndex).toBe(3);
    game = compileLongTableCase(state.seed, state.liveNodeIds);
    for (const step of game.serviceRoute) {
      state = reduceEscapeProof(state, proof(state, step.courierNodeId, `pass:${step.step}`, at), step.courierNodeId, at).state;
      at += 100;
    }
    expect(state.stageIndex).toBe(4);
    for (const nodeId of state.liveNodeIds) {
      state = reduceEscapeProof(state, proof(state, nodeId, 'last-bell', at), nodeId, at).state;
      at += 100;
    }
    expect(state.finishedAt).toBeDefined();
  });
});

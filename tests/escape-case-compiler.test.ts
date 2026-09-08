import { assert, integer, property } from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  compileDeadAirCase,
  compileEscapeCase,
  compileLongTableCase,
  compileNightGlassCase,
  type DeadAirCountertoneProof,
  type DeadAirServiceScanProof,
  type DeadAirWhisperProof,
  escapeCaseSeedFromCode,
  type MazeEdge,
  type NightGlassAnchorProof,
  type NightGlassParallaxProof,
  type NightGlassPoseProof,
  validateDeadAirCountertoneProof,
  validateDeadAirDuctOrder,
  validateDeadAirEnvelope,
  validateDeadAirServiceScanProof,
  validateDeadAirValveSequence,
  validateDeadAirWhisperGlyphs,
  validateDeadAirWhisperProof,
  validateDeadAirWhisperSequence,
  validateNightGlassAnchorProof,
  validateNightGlassBearingSequence,
  validateNightGlassFinaleProof,
  validateNightGlassMazePath,
  validateNightGlassParallaxProof,
  validateNightGlassThresholdProof,
  validateOrderedAttempt,
  validateStageProof,
} from '../src/domain/escape-case-compiler';
import type { Capability } from '../src/domain/types';

function nodes(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `node-${index + 1}`);
}

const FULL_CAPABILITIES = [
  'manual',
  'touch',
  'motion',
  'orientation',
  'microphoneLevel',
  'cameraQr',
  'haptics',
] as const satisfies readonly Capability[];

function capabilitiesByNode(
  nodeIds: readonly string[],
  capabilities: readonly Capability[],
): Readonly<Record<string, readonly Capability[]>> {
  return Object.fromEntries(nodeIds.map((nodeId) => [nodeId, capabilities]));
}

function validServiceScanProof(
  game: ReturnType<typeof compileDeadAirCase>,
  index: number,
): DeadAirServiceScanProof {
  const scan = game.serviceScans[index];
  return {
    step: scan.step,
    scannerNodeId: scan.scannerNodeId,
    markerOwnerNodeId: scan.markerOwnerNodeId,
    markerToken: scan.markerToken,
    selectedValve: scan.liveValve,
    evidenceMode: 'camera-qr',
    ownerConfirmed: true,
  };
}

function validWhisperProof(
  game: ReturnType<typeof compileDeadAirCase>,
  index: number,
): DeadAirWhisperProof {
  const round = game.privateChannel.rounds[index];
  return {
    round: round.round,
    senderNodeId: game.privateChannel.callerNodeId,
    recipientNodeId: game.privateChannel.receiverNodeId,
    gate: round.gate,
    acknowledgedCodeword: round.codeword,
    evidenceMode: 'voice-burst',
    payloadRecipientNodeIds: [game.privateChannel.receiverNodeId],
    payloadSizeBytes: 24_000,
    ttlMs: 10_000,
  };
}

function validCountertoneProof(
  game: ReturnType<typeof compileDeadAirCase>,
): DeadAirCountertoneProof {
  return {
    startedAt: 1_000,
    completedAt: 5_000,
    tunerNodeId: game.countertone.tunerNodeId,
    tunerPose: game.countertone.tunerPose,
    beats: game.countertone.beats.map((beat) => ({
      beat: beat.beat,
      level: beat.level,
      performerNodeIds: beat.performerNodeIds,
      evidenceMode: 'microphone-level' as const,
    })),
  };
}

function validParallaxProof(
  game: ReturnType<typeof compileNightGlassCase>,
  index: number,
): NightGlassParallaxProof {
  const round = game.parallaxRounds[index];
  return {
    round: round.round,
    watcherNodeId: round.watcherNodeId,
    frameNodeId: round.frameNodeId,
    hingeNodeId: round.hingeNodeId,
    markerToken: round.markerToken,
    targetGlyph: round.targetGlyph,
    hingePose: round.requiredPose,
    bearing: round.revealedBearing,
    cameraEvidenceMode: 'camera-qr',
    hingeEvidenceMode: 'device-motion',
    frameOwnerConfirmed: true,
  };
}

function validAnchorProof(
  game: ReturnType<typeof compileNightGlassCase>,
  index: number,
): NightGlassAnchorProof {
  const anchor = game.corridor.anchorSteps[index];
  return {
    step: anchor.step,
    courierNodeId: anchor.courierNodeId,
    anchorOwnerNodeId: anchor.anchorOwnerNodeId,
    markerToken: anchor.markerToken,
    cameraEvidenceMode: 'camera-qr',
    carryEvidenceMode: 'device-motion',
    anchorOwnerConfirmed: true,
  };
}

function poseProof(
  assignments: readonly { nodeId: string; pose: NightGlassPoseProof['assignments'][number]['pose'] }[],
  windowMs: number,
): NightGlassPoseProof {
  return {
    startedAt: 2_000,
    completedAt: 2_000 + windowMs,
    contactsHeld: true,
    assignments: assignments.map((assignment) => ({
      ...assignment,
      evidenceMode: 'device-motion' as const,
    })),
  };
}

function mazeAdjacency(edges: readonly MazeEdge[]): Map<number, number[]> {
  const result = new Map<number, number[]>();
  for (let cell = 1; cell <= 9; cell += 1) result.set(cell, []);
  for (const [first, second] of edges) {
    result.get(first)?.push(second);
    result.get(second)?.push(first);
  }
  return result;
}

function countSimplePaths(
  edges: readonly MazeEdge[],
  start: number,
  exit: number,
): number {
  const adjacency = mazeAdjacency(edges);
  let count = 0;
  const visit = (cell: number, seen: ReadonlySet<number>): void => {
    if (cell === exit) {
      count += 1;
      return;
    }
    for (const neighbor of adjacency.get(cell) ?? []) {
      if (seen.has(neighbor)) continue;
      visit(neighbor, new Set([...seen, neighbor]));
    }
  };
  visit(start, new Set([start]));
  return count;
}

describe('escape case compiler shared contract', () => {
  it('is deterministic for arbitrary seeds, replays, cases and two-to-four-node crews', () => {
    assert(
      property(
        integer({ min: 0, max: 2_147_483_647 }),
        integer({ min: 0, max: 100 }),
        integer({ min: 2, max: 4 }),
        (seed, replayIndex, count) => {
          const nodeIds = nodes(count);
          for (const caseId of ['dead-air', 'night-glass', 'long-table'] as const) {
            const first = compileEscapeCase(caseId, seed, nodeIds, { replayIndex });
            const second = compileEscapeCase(caseId, seed, nodeIds, { replayIndex });
            expect(first).toEqual(second);
          }
        },
      ),
      { numRuns: 128 },
    );
  });

  it('gives replay indexes their own stable generated state', () => {
    for (const caseId of ['dead-air', 'night-glass', 'long-table'] as const) {
      const variants = Array.from({ length: 24 }, (_, replayIndex) =>
        compileEscapeCase(caseId, 'HOUSE-13', ['a', 'b', 'c'], { replayIndex }),
      );
      expect(new Set(variants.map((variant) => variant.effectiveSeed))).toHaveLength(24);
      expect(new Set(variants.map((variant) => JSON.stringify(variant)))).toHaveLength(24);
    }
  });

  it('hashes house codes stably and case-sensitively only after normalization', () => {
    expect(escapeCaseSeedFromCode('house-13')).toBe(escapeCaseSeedFromCode('HOUSE-13'));
    expect(escapeCaseSeedFromCode('HOUSE-13')).not.toBe(escapeCaseSeedFromCode('HOUSE-14'));
  });

  it('rejects invalid crew and replay inputs', () => {
    expect(() => compileDeadAirCase(1, ['only'])).toThrow(/two to four/i);
    expect(() => compileNightGlassCase(1, ['a', 'b', 'c', 'd', 'e'])).toThrow(/two to four/i);
    expect(() => compileDeadAirCase(1, ['a', 'a'])).toThrow(/distinct/i);
    expect(() => compileNightGlassCase(1, ['a', ' '])).toThrow(/distinct/i);
    expect(() => compileNightGlassCase(1, ['a', 'b'], { replayIndex: -1 })).toThrow(/replay/i);
    expect(() => compileNightGlassCase(1, ['a', 'b'], { replayIndex: 1.5 })).toThrow(/replay/i);
    expect(() => compileLongTableCase(1, ['only'])).toThrow(/two to four/i);
  });

  it('reports complete, incomplete and mismatch prefixes without revealing the suffix', () => {
    expect(validateOrderedAttempt(['a', 'b', 'c'], [])).toEqual({
      status: 'incomplete',
      acceptedPrefixLength: 0,
      expectedLength: 3,
      submittedLength: 0,
    });
    expect(validateOrderedAttempt(['a', 'b', 'c'], ['a', 'b'])).toMatchObject({
      status: 'incomplete',
      acceptedPrefixLength: 2,
    });
    expect(validateOrderedAttempt(['a', 'b', 'c'], ['a', 'x'])).toMatchObject({
      status: 'mismatch',
      acceptedPrefixLength: 1,
    });
    expect(validateOrderedAttempt(['a', 'b', 'c'], ['a', 'b', 'c'])).toMatchObject({
      status: 'complete',
      acceptedPrefixLength: 3,
    });
    expect(validateOrderedAttempt(['a'], ['a', 'b'])).toMatchObject({
      status: 'mismatch',
      acceptedPrefixLength: 1,
    });
  });
});

describe('DEAD AIR compiler', () => {
  it.each([2, 3, 4])('builds interdependent assignments without self-scans for %i nodes', (count) => {
    const nodeIds = nodes(count);
    for (let seed = 0; seed < 192; seed += 1) {
      const game = compileDeadAirCase(seed, nodeIds);

      expect(game.id).toBe('dead-air');
      expect(game.stages.map((stage) => stage.id)).toEqual([
        'three-ducts',
        'service-plates',
        'service-pair',
        'echo-matrix',
        'countertone',
      ]);
      expect(game.stages.every((stage, index) => stage.index === index)).toBe(true);
      expect(game.stages.every((stage) => stage.requiredNodeIds.length >= 2)).toBe(true);
      expect(game.stages.every((stage) => stage.expectedProofKeys.length >= 1)).toBe(true);
      expect(new Set(game.ductOrder)).toEqual(new Set(nodeIds));
      expect(game.ductClues).toHaveLength(count);
      expect(new Set(game.ductClues.map((clue) => clue.signature.join('-')))).toHaveLength(count);
      expect(new Set(game.ductClues.map((clue) => clue.duct))).toHaveLength(count);
      expect(
        game.ductClues.every(
          (clue) =>
            clue.clueOwnerNodeId === clue.subjectNodeId &&
            clue.clueOwnerNodeId !== clue.decoderOwnerNodeId,
        ),
      ).toBe(true);

      expect(game.serviceScans).toHaveLength(count);
      expect(new Set(game.serviceScans.map((scan) => scan.markerToken))).toHaveLength(count);
      expect(game.serviceScans.every((scan) => scan.scannerNodeId !== scan.markerOwnerNodeId)).toBe(true);
      expect(
        game.serviceScans.every(
          (scan) =>
            scan.scannerNodeId !== scan.corrosionDecoderOwnerNodeId &&
            scan.candidates.includes(scan.liveValve),
        ),
      ).toBe(true);
      expect(game.valveSequence).toEqual(game.serviceScans.map((scan) => scan.liveValve));
      expect(new Set(game.valveSequence)).toHaveLength(count);
      expect(
        game.serviceScans.every((scan) =>
          nodeIds.every((nodeId) => !scan.markerToken.includes(nodeId)),
        ),
      ).toBe(true);

      const channel = game.privateChannel;
      expect(channel.callerNodeId).not.toBe(channel.receiverNodeId);
      expect(channel.codewordClueOwnerNodeId).not.toBe(channel.codewordDecoderOwnerNodeId);
      expect(channel.rounds).toHaveLength(4);
      expect(new Set(channel.rounds.map((round) => round.codeword))).toHaveLength(4);
      expect(new Set(channel.rounds.map((round) => round.decodedGlyph))).toHaveLength(4);
      expect(channel.excludedNodeIds).not.toContain(channel.callerNodeId);
      expect(channel.excludedNodeIds).not.toContain(channel.receiverNodeId);
      if (count === 2) {
        expect(channel.tunerNodeId).toBeNull();
        expect(channel.hasExcludedTuner).toBe(false);
        expect(channel.excludedNodeIds).toEqual([]);
      } else {
        expect(channel.tunerNodeId).not.toBeNull();
        expect(channel.hasExcludedTuner).toBe(true);
        expect(channel.excludedNodeIds).toContain(channel.tunerNodeId);
        expect(new Set(channel.excludedNodeIds)).toHaveLength(count - 2);
      }

      expect(game.echoMatrix.envelope).toHaveLength(4);
      expect(game.echoMatrix.envelope).toContain('SOFT');
      expect(game.echoMatrix.envelope).toContain('STRONG');
      expect(game.echoMatrix.envelope).toContain('REST');
      expect(game.echoMatrix.mappings.map((mapping) => mapping.glyph)).toEqual(
        channel.rounds.map((round) => round.decodedGlyph),
      );
      if (count === 2) {
        expect(
          game.echoMatrix.mappings.every(
            (mapping) => mapping.decoderOwnerNodeId === channel.callerNodeId,
          ),
        ).toBe(true);
        expect(game.echoMatrix.resonatorOrderOwnerNodeId).toBe(channel.receiverNodeId);
      } else {
        expect(
          game.echoMatrix.mappings.every(
            (mapping) => mapping.decoderOwnerNodeId !== channel.codewordClueOwnerNodeId,
          ),
        ).toBe(true);
      }
      expect(game.countertone.vocalistNodeIds).toEqual([
        channel.callerNodeId,
        channel.receiverNodeId,
      ]);
      expect(game.countertone.beats.map((beat) => beat.level)).toEqual(game.echoMatrix.envelope);
    }
  });

  it('splits the two-phone echo matrix across both players', () => {
    for (let seed = 0; seed < 96; seed += 1) {
      const game = compileDeadAirCase(seed, nodes(2));
      const orderOwner = game.echoMatrix.resonatorOrderOwnerNodeId;
      const mappingOwners = new Set(
        game.echoMatrix.mappings.map((mapping) => mapping.decoderOwnerNodeId),
      );

      expect(mappingOwners).toEqual(new Set([game.privateChannel.callerNodeId]));
      expect(mappingOwners.has(orderOwner)).toBe(false);
      expect(new Set([orderOwner, ...mappingOwners])).toEqual(new Set(nodes(2)));
    }
  });

  it('makes all four players necessary across decoder, tuner and echo mappings', () => {
    for (let seed = 0; seed < 96; seed += 1) {
      const game = compileDeadAirCase(seed, nodes(4));
      const participants = new Set<string>([
        game.privateChannel.callerNodeId,
        game.privateChannel.receiverNodeId,
        ...game.privateChannel.excludedNodeIds,
        ...game.echoMatrix.mappings.map((mapping) => mapping.decoderOwnerNodeId),
      ]);
      expect(participants).toEqual(new Set(nodes(4)));
    }
  });

  it('validates ordered answers with useful prefix feedback', () => {
    const game = compileDeadAirCase('VALIDATORS', ['a', 'b', 'c']);
    expect(validateDeadAirDuctOrder(game, game.ductOrder).status).toBe('complete');
    expect(validateDeadAirDuctOrder(game, game.ductOrder.slice(0, 2))).toMatchObject({
      status: 'incomplete',
      acceptedPrefixLength: 2,
    });
    expect(validateDeadAirDuctOrder(game, [...game.ductOrder].reverse()).status).toBe('mismatch');
    expect(validateDeadAirValveSequence(game, game.valveSequence).status).toBe('complete');
    expect(
      validateDeadAirWhisperGlyphs(
        game,
        game.privateChannel.rounds.map((round) => round.decodedGlyph),
      ).status,
    ).toBe('complete');
    expect(validateDeadAirEnvelope(game, game.echoMatrix.envelope).status).toBe('complete');
  });

  it('requires the exact service scan actor, target, token, answer and confirmation', () => {
    const game = compileDeadAirCase(44, ['a', 'b', 'c']);
    const proof = validServiceScanProof(game, 0);
    expect(validateDeadAirServiceScanProof(game, proof)).toEqual({
      accepted: true,
      code: 'ACCEPTED',
    });
    expect(
      validateDeadAirServiceScanProof(game, { ...proof, scannerNodeId: proof.markerOwnerNodeId }),
    ).toMatchObject({ accepted: false, code: 'WRONG_ACTOR' });
    expect(
      validateDeadAirServiceScanProof(game, { ...proof, markerToken: `${proof.markerToken}-STALE` }),
    ).toMatchObject({ accepted: false, code: 'WRONG_TOKEN' });
    expect(
      validateDeadAirServiceScanProof(game, { ...proof, ownerConfirmed: false }),
    ).toMatchObject({ accepted: false, code: 'MISSING_CONFIRMATION' });
  });

  it('routes whisper payload only to the receiver and validates bounded ephemeral proofs', () => {
    const game = compileDeadAirCase(91, ['caller?', 'receiver?', 'third']);
    const proofs = game.privateChannel.rounds.map((_, index) => validWhisperProof(game, index));

    expect(proofs.every((proof) => validateDeadAirWhisperProof(game, proof).accepted)).toBe(true);
    expect(validateDeadAirWhisperSequence(game, proofs)).toMatchObject({
      status: 'complete',
      acceptedPrefixLength: 4,
    });
    expect(validateDeadAirWhisperSequence(game, proofs.slice(0, 2))).toMatchObject({
      status: 'incomplete',
      acceptedPrefixLength: 2,
    });

    const leaked = {
      ...proofs[0],
      payloadRecipientNodeIds: [
        game.privateChannel.receiverNodeId,
        game.privateChannel.excludedNodeIds[0],
      ],
    };
    expect(validateDeadAirWhisperProof(game, leaked)).toMatchObject({
      accepted: false,
      code: 'PAYLOAD_LEAK',
    });
    expect(
      validateDeadAirWhisperProof(game, { ...proofs[0], payloadSizeBytes: 96 * 1_024 + 1 }),
    ).toMatchObject({ accepted: false, code: 'PAYLOAD_LIMIT' });
    expect(
      validateDeadAirWhisperProof(game, { ...proofs[0], ttlMs: 10_001 }),
    ).toMatchObject({ accepted: false, code: 'TTL_LIMIT' });
    expect(
      validateDeadAirWhisperSequence(game, [
        proofs[0],
        { ...proofs[1], acknowledgedCodeword: proofs[0].acknowledgedCodeword },
      ]),
    ).toMatchObject({ status: 'mismatch', acceptedPrefixLength: 1 });
  });

  it('accepts the exact countertone performers, envelope, tuner and timing only', () => {
    const game = compileDeadAirCase(17, ['a', 'b', 'c', 'd']);
    const proof = validCountertoneProof(game);
    expect(validateDeadAirCountertoneProof(game, proof).accepted).toBe(true);
    expect(
      validateDeadAirCountertoneProof(game, {
        ...proof,
        completedAt: proof.startedAt + game.countertone.windowMs + 1,
      }),
    ).toMatchObject({ accepted: false, code: 'TIMING_WINDOW' });
    expect(
      validateDeadAirCountertoneProof(game, {
        ...proof,
        beats: proof.beats.map((beat, index) =>
          index === 0 ? { ...beat, performerNodeIds: ['intruder'] } : beat,
        ),
      }),
    ).toMatchObject({ accepted: false, code: 'WRONG_ACTOR' });
  });

  it('selects explicit semantic fallbacks when capabilities are absent', () => {
    const nodeIds = nodes(3);
    const game = compileDeadAirCase(5, nodeIds, {
      capabilitiesByNode: capabilitiesByNode(nodeIds, ['manual', 'touch']),
    });
    expect(game.capabilityFallbacks.every((plan) => plan.selectedMode === 'fallback')).toBe(true);
    expect(game.capabilityFallbacks.every((plan) => plan.missingCapabilityNodeIds.length > 0)).toBe(true);
    expect(game.capabilityFallbacks.every((plan) => plan.preservesSemanticProof)).toBe(true);
    expect(game.capabilityFallbacks.map((plan) => plan.fallbackEvidenceMode)).toEqual([
      'rotating-seal',
      'authored-token',
      'pressure-hold',
      'direction-hold',
    ]);

    const capable = compileDeadAirCase(5, nodeIds, {
      capabilitiesByNode: capabilitiesByNode(nodeIds, FULL_CAPABILITIES),
    });
    expect(capable.capabilityFallbacks.every((plan) => plan.selectedMode === 'preferred')).toBe(true);
  });

  it('exposes coordinator stage membership and validates typed stage proofs', () => {
    const game = compileDeadAirCase('COORDINATOR', ['a', 'b', 'c']);
    const scanProof = validServiceScanProof(game, 0);
    const whisperProof = validWhisperProof(game, 0);
    const countertoneProof = validCountertoneProof(game);
    const results = [
      validateStageProof(game, 0, game.nodeIds[0], {
        kind: 'dead-air/duct-order',
        value: game.ductOrder,
      }),
      validateStageProof(game, 1, scanProof.scannerNodeId, {
        kind: 'dead-air/service-scan',
        value: scanProof,
      }),
      validateStageProof(game, 2, game.privateChannel.receiverNodeId, {
        kind: 'dead-air/whisper-round',
        value: whisperProof,
      }),
      validateStageProof(game, 3, game.stages[3].submitterNodeIds[0], {
        kind: 'dead-air/echo-envelope',
        value: game.echoMatrix.envelope,
      }),
      validateStageProof(game, 4, game.stages[4].submitterNodeIds[0], {
        kind: 'dead-air/countertone',
        value: countertoneProof,
      }),
    ];
    expect(results.every((result) => result.accepted)).toBe(true);
    expect(results.map((result) => result.proofKey)).toEqual([
      'duct-order',
      'service-scan:1',
      'whisper:1',
      'echo-envelope',
      'countertone',
    ]);
    expect(
      validateStageProof(game, 2, game.privateChannel.callerNodeId, {
        kind: 'dead-air/whisper-round',
        value: whisperProof,
      }),
    ).toMatchObject({ accepted: false, code: 'UNAUTHORIZED_SUBMITTER' });
    expect(
      validateStageProof(game, 0, game.nodeIds[0], {
        kind: 'dead-air/echo-envelope',
        value: game.echoMatrix.envelope,
      }),
    ).toMatchObject({ accepted: false, code: 'WRONG_PROOF_KIND' });
    expect(
      validateStageProof(game, 99, game.nodeIds[0], {
        kind: 'dead-air/duct-order',
        value: game.ductOrder,
      }),
    ).toMatchObject({ accepted: false, code: 'INVALID_STAGE' });
  });
});

describe('NIGHT GLASS compiler', () => {
  it.each([2, 3, 4])('builds camera, hinge, maze and corridor assignments for %i nodes', (count) => {
    const nodeIds = nodes(count);
    for (let seed = 0; seed < 192; seed += 1) {
      const game = compileNightGlassCase(seed, nodeIds);

      expect(game.id).toBe('night-glass');
      expect(game.stages.map((stage) => stage.id)).toEqual([
        'draw-threshold',
        'parallax-doors',
        'impossible-floorplan',
        'walk-corridor',
        'fold-corridor',
      ]);
      expect(game.stages.every((stage, index) => stage.index === index)).toBe(true);
      expect(game.stages.every((stage) => stage.requiredNodeIds.length >= 2)).toBe(true);
      expect(game.stages.every((stage) => stage.expectedProofKeys.length >= 1)).toBe(true);
      expect(game.threshold.assignments.map((assignment) => assignment.nodeId)).toEqual(nodeIds);
      expect(new Set(game.threshold.assignments.map((assignment) => assignment.pose))).toHaveLength(count);

      expect(game.parallaxRounds).toHaveLength(3);
      expect(new Set(game.parallaxRounds.map((round) => round.markerToken))).toHaveLength(3);
      expect(new Set(game.parallaxRounds.map((round) => round.targetGlyph))).toHaveLength(3);
      expect(new Set(game.parallaxRounds.map((round) => round.revealedBearing))).toHaveLength(3);
      expect(game.bearingSequence).toEqual(
        game.parallaxRounds.map((round) => round.revealedBearing),
      );
      for (const round of game.parallaxRounds) {
        expect(round.watcherNodeId).not.toBe(round.frameNodeId);
        expect(round.targetClueOwnerNodeId).not.toBe(round.tiltDecoderOwnerNodeId);
        expect(nodeIds.every((nodeId) => !round.markerToken.includes(nodeId))).toBe(true);
        if (count === 2) {
          expect(round.hingeNodeId).toBe(round.frameNodeId);
        } else {
          expect(new Set([round.watcherNodeId, round.frameNodeId, round.hingeNodeId])).toHaveLength(3);
        }
      }
      expect(
        new Set(
          game.parallaxRounds.flatMap((round) => [
            round.watcherNodeId,
            round.frameNodeId,
            round.hingeNodeId,
          ]),
        ),
      ).toEqual(new Set(nodeIds));

      expect(game.maze.cells).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(game.maze.edges).toHaveLength(8);
      expect(new Set(game.maze.edges.map(([first, second]) => `${first}:${second}`))).toHaveLength(8);
      expect(game.maze.wallLayerOwnerNodeId).not.toBe(game.maze.transformDecoderOwnerNodeId);
      if (count >= 3) {
        expect(
          new Set([
            game.maze.roomLabelsOwnerNodeId,
            game.maze.wallLayerOwnerNodeId,
            game.maze.transformDecoderOwnerNodeId,
          ]),
        ).toHaveLength(3);
      }
      for (const [first, second] of game.maze.edges) {
        const rowDifference = Math.abs(Math.floor((first - 1) / 3) - Math.floor((second - 1) / 3));
        const columnDifference = Math.abs(((first - 1) % 3) - ((second - 1) % 3));
        expect(rowDifference + columnDifference).toBe(1);
      }
      expect(game.maze.path[0]).toBe(game.maze.startCell);
      expect(game.maze.path.at(-1)).toBe(game.maze.exitCell);
      expect(game.maze.path.length).toBeGreaterThanOrEqual(5);
      expect(countSimplePaths(game.maze.edges, game.maze.startCell, game.maze.exitCell)).toBe(1);
      const mazeEdges = new Set(game.maze.edges.map(([first, second]) => `${first}:${second}`));
      for (let index = 0; index < game.maze.path.length - 1; index += 1) {
        const first = game.maze.path[index];
        const second = game.maze.path[index + 1];
        const key = first < second ? `${first}:${second}` : `${second}:${first}`;
        expect(mazeEdges.has(key)).toBe(true);
      }

      expect(game.corridor.anchorSteps).toHaveLength(3);
      expect(
        game.corridor.anchorSteps.every(
          (step) =>
            step.courierNodeId === game.corridor.courierNodeId &&
            step.anchorOwnerNodeId !== game.corridor.courierNodeId,
        ),
      ).toBe(true);
      expect(new Set(game.corridor.anchorSteps.map((step) => step.anchorOwnerNodeId))).toEqual(
        new Set(nodeIds.filter((nodeId) => nodeId !== game.corridor.courierNodeId)),
      );
      expect(new Set(game.corridor.anchorSteps.map((step) => step.markerToken))).toHaveLength(3);
      expect(game.finale.assignments.map((assignment) => assignment.nodeId)).toEqual(nodeIds);
      expect(new Set(game.finale.assignments.map((assignment) => assignment.pose))).toHaveLength(count);
    }
  });

  it('accepts exact threshold and finale pose groups inside their windows', () => {
    const game = compileNightGlassCase('POSES', ['a', 'b', 'c']);
    const thresholdProof = poseProof(game.threshold.assignments, game.threshold.windowMs);
    const finaleProof = poseProof(game.finale.assignments, game.finale.windowMs);
    expect(validateNightGlassThresholdProof(game, thresholdProof).accepted).toBe(true);
    expect(validateNightGlassFinaleProof(game, finaleProof).accepted).toBe(true);
    expect(
      validateNightGlassThresholdProof(game, {
        ...thresholdProof,
        assignments: thresholdProof.assignments.map((assignment, index) =>
          index === 0
            ? {
                ...assignment,
                pose: assignment.pose === 'LEFT' ? ('RIGHT' as const) : ('LEFT' as const),
              }
            : assignment,
        ),
      }).accepted,
    ).toBe(false);
    expect(
      validateNightGlassFinaleProof(game, {
        ...finaleProof,
        completedAt: finaleProof.startedAt + game.finale.windowMs + 1,
      }),
    ).toMatchObject({ accepted: false, code: 'TIMING_WINDOW' });
  });

  it('requires all three parallax actors plus the current signed frame state', () => {
    const game = compileNightGlassCase(81, ['a', 'b', 'c', 'd']);
    for (let index = 0; index < game.parallaxRounds.length; index += 1) {
      expect(validateNightGlassParallaxProof(game, validParallaxProof(game, index)).accepted).toBe(true);
    }
    const proof = validParallaxProof(game, 0);
    expect(
      validateNightGlassParallaxProof(game, { ...proof, markerToken: `${proof.markerToken}-OLD` }),
    ).toMatchObject({ accepted: false, code: 'WRONG_TOKEN' });
    expect(
      validateNightGlassParallaxProof(game, { ...proof, hingeNodeId: proof.watcherNodeId }),
    ).toMatchObject({ accepted: false, code: 'WRONG_ACTOR' });
    expect(
      validateNightGlassParallaxProof(game, { ...proof, frameOwnerConfirmed: false }),
    ).toMatchObject({ accepted: false, code: 'MISSING_CONFIRMATION' });
  });

  it('validates bearing and unique maze routes with prefix preservation', () => {
    const game = compileNightGlassCase(1337, ['a', 'b', 'c']);
    expect(validateNightGlassBearingSequence(game, game.bearingSequence).status).toBe('complete');
    expect(validateNightGlassMazePath(game, game.maze.path).status).toBe('complete');
    expect(validateNightGlassMazePath(game, game.maze.path.slice(0, 3))).toMatchObject({
      status: 'incomplete',
      acceptedPrefixLength: 3,
    });
    const wrongPath = [game.maze.path[0], 99];
    expect(validateNightGlassMazePath(game, wrongPath)).toMatchObject({
      status: 'mismatch',
      acceptedPrefixLength: 1,
    });
  });

  it('requires the assigned courier, remote anchor, current token and owner confirmation', () => {
    const game = compileNightGlassCase(22, ['a', 'b', 'c']);
    for (let index = 0; index < game.corridor.anchorSteps.length; index += 1) {
      expect(validateNightGlassAnchorProof(game, validAnchorProof(game, index)).accepted).toBe(true);
    }
    const proof = validAnchorProof(game, 0);
    expect(
      validateNightGlassAnchorProof(game, {
        ...proof,
        anchorOwnerNodeId: proof.courierNodeId,
      }),
    ).toMatchObject({ accepted: false, code: 'WRONG_TARGET' });
    expect(
      validateNightGlassAnchorProof(game, { ...proof, anchorOwnerConfirmed: false }),
    ).toMatchObject({ accepted: false, code: 'MISSING_CONFIRMATION' });
  });

  it('selects camera, motion and orientation fallbacks without changing proofs', () => {
    const nodeIds = nodes(4);
    const game = compileNightGlassCase(12, nodeIds, {
      capabilitiesByNode: capabilitiesByNode(nodeIds, ['manual', 'touch']),
    });
    expect(game.capabilityFallbacks).toHaveLength(6);
    expect(game.capabilityFallbacks.every((plan) => plan.selectedMode === 'fallback')).toBe(true);
    expect(game.capabilityFallbacks.every((plan) => plan.preservesSemanticProof)).toBe(true);
    expect(new Set(game.capabilityFallbacks.map((plan) => plan.fallbackEvidenceMode))).toEqual(
      new Set(['direction-hold', 'rotating-seal']),
    );

    const capable = compileNightGlassCase(12, nodeIds, {
      capabilitiesByNode: capabilitiesByNode(nodeIds, FULL_CAPABILITIES),
    });
    expect(capable.capabilityFallbacks.every((plan) => plan.selectedMode === 'preferred')).toBe(true);
  });

  it('provides generic coordinator contracts for all NIGHT GLASS stages', () => {
    const game = compileNightGlassCase('COORDINATOR', ['a', 'b', 'c', 'd']);
    const thresholdProof = poseProof(game.threshold.assignments, game.threshold.windowMs);
    const parallaxProof = validParallaxProof(game, 0);
    const anchorProof = validAnchorProof(game, 0);
    const finaleProof = poseProof(game.finale.assignments, game.finale.windowMs);
    const results = [
      validateStageProof(game, 0, game.stages[0].submitterNodeIds[0], {
        kind: 'night-glass/threshold',
        value: thresholdProof,
      }),
      validateStageProof(game, 1, parallaxProof.watcherNodeId, {
        kind: 'night-glass/parallax-round',
        value: parallaxProof,
      }),
      validateStageProof(game, 2, game.stages[2].submitterNodeIds[0], {
        kind: 'night-glass/maze-path',
        value: game.maze.path,
      }),
      validateStageProof(game, 3, anchorProof.courierNodeId, {
        kind: 'night-glass/anchor',
        value: anchorProof,
      }),
      validateStageProof(game, 4, game.stages[4].submitterNodeIds[0], {
        kind: 'night-glass/finale',
        value: finaleProof,
      }),
    ];
    expect(results.every((result) => result.accepted)).toBe(true);
    expect(results.map((result) => result.proofKey)).toEqual([
      'threshold',
      'parallax:1',
      'maze-path',
      'anchor:1',
      'finale',
    ]);
    expect(
      validateStageProof(game, 1, parallaxProof.frameNodeId, {
        kind: 'night-glass/parallax-round',
        value: parallaxProof,
      }),
    ).toMatchObject({ accepted: false, code: 'UNAUTHORIZED_SUBMITTER' });
  });
});

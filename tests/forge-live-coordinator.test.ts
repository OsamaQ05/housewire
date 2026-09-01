import { describe, expect, it } from 'vitest';

import {
  generateOfflineForgeCase,
  type ForgeCase,
  type ForgeGenerationRequest,
  type ForgeStageSubmission,
} from '../src/domain/case-forge';
import {
  abortForgeLiveRun,
  assignForgeLiveNode,
  createForgeLiveRuntime,
  forgeLiveRuntimeFromSnapshot,
  forgeLiveSnapshot,
  forgePlayerProjectionForNode,
  reduceForgeLiveSubmission,
  revealForgeLiveHint,
  startForgeLiveRun,
} from '../src/features/forge/live-coordinator';
import {
  makeForgeJoinTicket,
  parseForgeJoinTicket,
  parseForgeLiveDirectMessage,
} from '../src/features/forge/live-protocol';
import { housewireSessionEventSchema } from '../src/features/session/protocol';

function makeGame(playerCount = 3): ForgeCase {
  const playerIds = Array.from({ length: playerCount }, (_, index) => `player-${index + 1}`);
  const request: ForgeGenerationRequest = {
    seed: 'LIVE-FAMILY-TEST',
    generatedAt: 1_800_000_000_000,
    playerIds,
    playerNames: Object.fromEntries(playerIds.map((id, index) => [id, `Player ${index + 1}`])),
    difficulty: 4,
    targetMinutes: 30,
    tone: 'mystery',
    intensity: 'intense',
    safeMovement: true,
    noiseAllowed: true,
    capabilitiesByPlayer: Object.fromEntries(playerIds.map((id) => [id, ['manual', 'touch', 'motion', 'microphoneLevel', 'cameraQr'] as const])),
  };
  return generateOfflineForgeCase(request);
}

function readyRuntime(game: ForgeCase) {
  let state = createForgeLiveRuntime(game, 'host', 'operation-1', 1_000, 'Amina');
  for (let index = 1; index < game.playerCount; index += 1) {
    state = assignForgeLiveNode(state, game, `guest-${index}`, `Guest ${index}`, 1_000 + index);
  }
  return state;
}

function correctSubmission(game: ForgeCase, stageIndex: number): ForgeStageSubmission {
  const solution = game.stages[stageIndex].solution;
  switch (solution.kind) {
    case 'sequence': return { kind: 'sequence', value: solution.answer };
    case 'code': return { kind: 'code', value: solution.answer };
    case 'relay': return { kind: 'relay', rounds: solution.rounds };
    case 'route': return { kind: 'route', value: solution.answer };
    case 'sync': return {
      kind: 'sync',
      startedAt: 2_000,
      completedAt: 2_000,
      proofs: solution.assignments.map((assignment) => ({ ...assignment, evidenceMode: 'manual' as const })),
    };
  }
}

describe('generated live Case Forge coordinator', () => {
  it('assigns each relay phone one role and starts only with the full live crew', () => {
    const game = makeGame();
    const waiting = readyRuntime(game);
    expect(waiting.assignments.map((item) => item.playerId)).toEqual(game.roles.map((role) => role.playerId));
    expect(startForgeLiveRun(waiting, game, ['host', 'guest-1'], 2_000)).toBe(waiting);
    const playing = startForgeLiveRun(waiting, game, ['host', 'guest-1', 'guest-2'], 2_000);
    expect(playing.status).toBe('playing');
    expect(assignForgeLiveNode(playing, game, 'intruder', 'Intruder', 2_001)).toBe(playing);
  });

  it('lets a reconnecting phone reclaim its role and publishes a valid host abort from the lobby', () => {
    const game = makeGame();
    const waiting = readyRuntime(game);
    const reconnecting = waiting.assignments[1];
    const reclaimed = assignForgeLiveNode(waiting, game, reconnecting.nodeId, 'Renamed guest', 9_000);
    expect(reclaimed.assignments).toHaveLength(game.playerCount);
    expect(reclaimed.assignments.find((assignment) => assignment.nodeId === reconnecting.nodeId)?.playerId).toBe(reconnecting.playerId);
    expect(reclaimed.assignments.find((assignment) => assignment.nodeId === reconnecting.nodeId)?.name).toBe('Renamed guest');

    const aborted = abortForgeLiveRun(reclaimed, reclaimed.hostNodeId, 10_000);
    expect(aborted).toMatchObject({ status: 'aborted', abortedAt: 10_000, startedAt: 10_000, stageStartedAt: 10_000 });
    expect(housewireSessionEventSchema.safeParse(forgeLiveSnapshot(aborted)).success).toBe(true);
  });

  it('keeps answers and other roles’ clues out of every direct player projection', () => {
    const game = makeGame();
    const state = readyRuntime(game);
    const projection = forgePlayerProjectionForNode(game, state, 'guest-1')!;
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain('"solution"');
    expect(serialized).not.toContain('"effectiveSeed"');
    expect(serialized).not.toContain('"seed"');
    expect(serialized).not.toContain('"recipe"');
    for (const stage of projection.stages) {
      expect(stage.clues.every((clue) => clue.audiencePlayerIds.includes(projection.role.playerId))).toBe(true);
    }
    const otherPrivateClue = game.stages.flatMap((stage) => stage.clues)
      .find((clue) => clue.private && !clue.audiencePlayerIds.includes(projection.role.playerId));
    expect(otherPrivateClue).toBeDefined();
    expect(serialized).not.toContain(otherPrivateClue!.id);

    const orderMechanic = projection.stages[0].mechanic;
    const routeMechanic = projection.stages[3].mechanic;
    const syncMechanic = projection.stages[4].mechanic;
    expect(orderMechanic.kind).toBe('distributed-order');
    expect(routeMechanic.kind).toBe('route-grid');
    expect(syncMechanic.kind).toBe('motion-sync');
    expect(orderMechanic).not.toHaveProperty('adjacentConstraints');
    expect(routeMechanic).not.toHaveProperty('openEdges');
    if (syncMechanic.kind === 'motion-sync') {
      expect(syncMechanic.assignments).toHaveLength(1);
      expect(syncMechanic.assignments[0]?.playerId).toBe(projection.role.playerId);
      expect(syncMechanic.participantCount).toBe(game.playerCount);
    }
  });

  it('separates camera marker display from the decoder scanner on different phones', () => {
    const game = makeGame();
    const state = readyRuntime(game);
    const symbolStage = game.stages[1];
    const marker = symbolStage.clues.find((clue) => clue.payload.kind === 'camera-marker');
    if (!marker || marker.payload.kind !== 'camera-marker') throw new Error('Expected a camera marker.');
    const suffix = marker.id.replace('marker-', '');
    const decoder = symbolStage.clues.find((clue) => clue.id === `decoder-${suffix}`);
    const ownerPlayerId = marker.audiencePlayerIds[0];
    const decoderPlayerId = decoder?.audiencePlayerIds[0];
    if (!ownerPlayerId || !decoderPlayerId) throw new Error('Expected marker and decoder owners.');
    const ownerNode = state.assignments.find((assignment) => assignment.playerId === ownerPlayerId)?.nodeId;
    const decoderNode = state.assignments.find((assignment) => assignment.playerId === decoderPlayerId)?.nodeId;
    if (!ownerNode || !decoderNode) throw new Error('Expected assigned camera roles.');

    const ownerProjection = forgePlayerProjectionForNode(game, state, ownerNode)!;
    const decoderProjection = forgePlayerProjectionForNode(game, state, decoderNode)!;
    const ownerClue = ownerProjection.stages[1].clues.find((clue) => clue.id === marker.id);
    const scannerClue = decoderProjection.stages[1].clues.find((clue) => clue.id === `scanner-${suffix}`);
    expect(ownerClue?.payload).toEqual({ kind: 'camera-display', markerToken: marker.payload.markerToken });
    expect(scannerClue?.payload).toEqual({
      kind: 'camera-scanner',
      markerToken: marker.payload.markerToken,
      symbol: marker.payload.symbol,
    });
    expect(ownerProjection.stages[1].clues.some((clue) => clue.id === `scanner-${suffix}`)).toBe(false);
    expect(decoderProjection.stages[1].clues.some((clue) => clue.id === marker.id)).toBe(false);
  });

  it('keeps a manual-seal scanner beside the marker in a one-phone live case', () => {
    const game = makeGame(1);
    const state = readyRuntime(game);
    const projection = forgePlayerProjectionForNode(game, state, 'host')!;
    const symbolClues = projection.stages[1].clues;
    expect(symbolClues.some((clue) => clue.payload.kind === 'camera-display')).toBe(true);
    expect(symbolClues.some((clue) => clue.payload.kind === 'camera-scanner')).toBe(true);
  });

  it('accepts answers only from the assigned submitter and advances authoritatively', () => {
    const game = makeGame();
    let state = readyRuntime(game);
    state = startForgeLiveRun(state, game, state.assignments.map((item) => item.nodeId), 2_000);
    const stage = game.stages[0];
    const submitter = state.assignments.find((item) => stage.submitterPlayerIds.includes(item.playerId))!;
    const spoofed = reduceForgeLiveSubmission(state, game, 'unassigned', 0, correctSubmission(game, 0), 2_100);
    expect(spoofed.result.code).toBe('WRONG_ACTOR');
    expect(spoofed.state).toBe(state);
    const accepted = reduceForgeLiveSubmission(state, game, submitter.nodeId, 0, correctSubmission(game, 0), 2_100);
    expect(accepted.result.accepted).toBe(true);
    expect(accepted.state.stageIndex).toBe(1);
  });

  it('collects one synchronized proof per assigned phone and expires stale proof windows', () => {
    const game = makeGame();
    let state = readyRuntime(game);
    state = { ...startForgeLiveRun(state, game, state.assignments.map((item) => item.nodeId), 2_000), stageIndex: 4, revision: 8 };
    const solution = game.stages[4].solution;
    if (solution.kind !== 'sync') throw new Error('Expected the generated sync finale.');
    for (let index = 0; index < state.assignments.length; index += 1) {
      const assignment = state.assignments[index];
      const expected = solution.assignments.find((item) => item.playerId === assignment.playerId)!;
      const reduced = reduceForgeLiveSubmission(state, game, assignment.nodeId, 4, {
        kind: 'sync',
        startedAt: 0,
        completedAt: 0,
        proofs: [{ ...expected, evidenceMode: 'manual' }],
      }, 3_000 + index * 20);
      state = reduced.state;
    }
    expect(state.status).toBe('finished');
    expect(state.stageIndex).toBe(5);

    let stale = readyRuntime(game);
    stale = { ...startForgeLiveRun(stale, game, stale.assignments.map((item) => item.nodeId), 2_000), stageIndex: 4, revision: 8 };
    for (let index = 0; index < stale.assignments.length; index += 1) {
      const assignment = stale.assignments[index];
      const expected = solution.assignments.find((item) => item.playerId === assignment.playerId)!;
      stale = reduceForgeLiveSubmission(stale, game, assignment.nodeId, 4, {
        kind: 'sync', startedAt: 0, completedAt: 0, proofs: [{ ...expected, evidenceMode: 'manual' }],
      }, index === 0 ? 3_000 : 3_000 + solution.windowMs + index * 20).state;
    }
    expect(stale.status).toBe('playing');
    expect(stale.syncProofs.length).toBeLessThan(game.playerCount);
  });

  it('aggregates only recipient-bound relay rounds on the host without snapshotting tokens', () => {
    const game = makeGame();
    let state = readyRuntime(game);
    state = { ...startForgeLiveRun(state, game, state.assignments.map((item) => item.nodeId), 2_000), stageIndex: 2, revision: 5 };
    const solution = game.stages[2].solution;
    if (solution.kind !== 'relay') throw new Error('Expected the private relay stage.');
    const recipients = [...new Set(solution.rounds.map((round) => round.recipientPlayerId))];

    recipients.forEach((recipientPlayerId, index) => {
      const nodeId = state.assignments.find((assignment) => assignment.playerId === recipientPlayerId)?.nodeId;
      if (!nodeId) throw new Error('Expected every relay recipient to have one phone.');
      const ownRounds = solution.rounds.filter((round) => round.recipientPlayerId === recipientPlayerId);
      const reduced = reduceForgeLiveSubmission(state, game, nodeId, 2, { kind: 'relay', rounds: ownRounds }, 3_000 + index);
      expect(reduced.result.code).toBe(index === recipients.length - 1 ? 'ACCEPTED' : 'INCOMPLETE');
      state = reduced.state;
      const publicSnapshot = JSON.stringify(forgeLiveSnapshot(state));
      for (const answer of solution.rounds) expect(publicSnapshot).not.toContain(answer.token);
    });

    expect(state.stageIndex).toBe(3);
    expect(state.relayAnswers).toEqual([]);
  });

  it('checkpoints hints and live progress into a bounded reconnect snapshot', () => {
    const game = makeGame();
    let state = readyRuntime(game);
    state = startForgeLiveRun(state, game, state.assignments.map((item) => item.nodeId), 2_000);
    const hinted = revealForgeLiveHint(state, game, 'guest-1', 0);
    expect(hinted.accepted).toBe(true);
    const snapshot = forgeLiveSnapshot(hinted.state);
    expect(housewireSessionEventSchema.safeParse(snapshot).success).toBe(true);
    expect(forgeLiveRuntimeFromSnapshot(snapshot)).toEqual(hinted.state);
    expect(housewireSessionEventSchema.safeParse({
      ...snapshot,
      assignments: [...snapshot.assignments, { ...snapshot.assignments[0], playerId: 'duplicate-role' }],
    }).success).toBe(false);
  });

  it('round-trips Expo forge invite URLs and rejects malformed role files', () => {
    const game = makeGame();
    const state = readyRuntime(game);
    const url = makeForgeJoinTicket('A7K2M', 'ws://192.168.1.8:8787', game.id, 'exp://192.168.1.8:8081/--/forge-join');
    expect(parseForgeJoinTicket(url)).toEqual({
      version: 1,
      code: 'A7K2M',
      relayUrl: 'ws://192.168.1.8:8787',
      caseId: game.id,
    });
    const projection = forgePlayerProjectionForNode(game, state, 'guest-1')!;
    const direct = parseForgeLiveDirectMessage({
      kind: 'forge.case', protocolVersion: 1, caseId: game.id, operationId: state.operationId,
      playerId: projection.role.playerId, playerCase: projection, snapshot: forgeLiveSnapshot(state),
    });
    expect(direct?.kind).toBe('forge.case');
    expect(parseForgeLiveDirectMessage({ ...direct, playerCase: game })).toBeUndefined();
  });
});

import { assert, integer, property, string } from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  FORGE_THEME_IDS,
  generateOfflineForgeCase,
  projectForgeCaseForPlayer,
  validateForgeCase,
  validateForgeSubmission,
  type ForgeCase,
  type ForgeGenerationRequest,
  type ForgeStageSubmission,
} from '../src/domain/case-forge';
import type { Capability } from '../src/domain/types';

const CAPABILITIES = [
  'manual',
  'touch',
  'motion',
  'orientation',
  'microphoneLevel',
  'cameraQr',
  'haptics',
] as const satisfies readonly Capability[];

function request(
  playerCount: number,
  overrides: Partial<ForgeGenerationRequest> = {},
): ForgeGenerationRequest {
  const playerIds = Array.from({ length: playerCount }, (_, index) => `player-${index + 1}`);
  return {
    seed: 'FAMILY-HOUSE',
    generatedAt: 1_800_000_000_000,
    playerIds,
    playerNames: Object.fromEntries(playerIds.map((playerId, index) => [playerId, `Player ${index + 1}`])),
    difficulty: 3,
    targetMinutes: 30,
    tone: 'mystery',
    intensity: 'balanced',
    safeMovement: true,
    noiseAllowed: true,
    capabilitiesByPlayer: Object.fromEntries(playerIds.map((playerId) => [playerId, CAPABILITIES])),
    ...overrides,
  };
}

function correctSubmission(game: ForgeCase, stageIndex: number): ForgeStageSubmission {
  const solution = game.stages[stageIndex].solution;
  switch (solution.kind) {
    case 'sequence':
      return { kind: 'sequence', value: solution.answer };
    case 'code':
      return { kind: 'code', value: solution.answer };
    case 'relay':
      return { kind: 'relay', rounds: solution.rounds };
    case 'route':
      return { kind: 'route', value: solution.answer };
    case 'sync':
      return {
        kind: 'sync',
        startedAt: 10_000,
        completedAt: 10_000 + solution.windowMs,
        proofs: solution.assignments.map((assignment) => ({
          ...assignment,
          evidenceMode: 'sensor' as const,
        })),
      };
  }
}

describe('offline Case Forge generation', () => {
  it('generates a complete playable five-stage case for every theme, difficulty and crew size', () => {
    for (const themeId of FORGE_THEME_IDS) {
      for (let playerCount = 1; playerCount <= 4; playerCount += 1) {
        for (const difficulty of [1, 2, 3, 4, 5] as const) {
          const game = generateOfflineForgeCase(request(playerCount, { themeId, difficulty }));
          const validation = validateForgeCase(game);
          expect(validation, `${themeId}/${playerCount}/${difficulty}: ${JSON.stringify(validation.issues)}`).toMatchObject({
            playable: true,
            issues: [],
          });
          expect(game.stages.map((stage) => stage.mechanic.kind)).toEqual([
            'distributed-order',
            'symbol-lock',
            'private-relay',
            'route-grid',
            'motion-sync',
          ]);
          expect(game.stages.reduce((sum, stage) => sum + stage.durationMinutes, 0)).toBe(game.durationMinutes);
          expect(game.stages.every((stage) => stage.fallback.preservesAnswer)).toBe(true);
          expect(game.roles.map((role) => role.playerId)).toEqual(game.recipe.playerIds);
        }
      }
    }
  });

  it('is deterministic for arbitrary safe seeds and changes on replay', () => {
    assert(
      property(
        string({ minLength: 1, maxLength: 32 }).filter((value) => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value)),
        integer({ min: 1, max: 4 }),
        integer({ min: 0, max: 500 }),
        (seed, playerCount, replayIndex) => {
          const input = request(playerCount, { seed, replayIndex });
          expect(generateOfflineForgeCase(input)).toEqual(generateOfflineForgeCase(input));
          expect(generateOfflineForgeCase({ ...input, replayIndex: replayIndex + 1 }).effectiveSeed)
            .not.toBe(generateOfflineForgeCase(input).effectiveSeed);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('maps custom themes locally, sanitizes them, and folds them into deterministic state', () => {
    const underwater = generateOfflineForgeCase(request(3, { customThemePrompt: 'an underwater spaceship rescue' }));
    expect(underwater.theme).toBe('abyssal-relay');
    expect(`${underwater.title} ${underwater.tagline} ${underwater.premise}`.toLowerCase())
      .toContain('underwater spaceship rescue');
    const museum = generateOfflineForgeCase(request(3, { customThemePrompt: 'a museum full of living paintings' }));
    expect(museum.theme).toBe('museum-afterlight');
    expect(museum.stages.map((stage) => stage.mechanic.kind)).toEqual([
      'distributed-order',
      'symbol-lock',
      'private-relay',
      'route-grid',
      'motion-sync',
    ]);
    expect(validateForgeCase(museum).playable).toBe(true);
    expect(generateOfflineForgeCase(request(3, { customThemePrompt: 'a train crossing snowy mountains' })).theme)
      .toBe('stormbound-express');
    expect(
      generateOfflineForgeCase(request(3, { customThemePrompt: 'an underwater spaceship rescue' })).effectiveSeed,
    ).not.toBe(generateOfflineForgeCase(request(3)).effectiveSeed);
    expect(() => generateOfflineForgeCase(request(2, { customThemePrompt: `bad\ncontrol` }))).toThrow(/custom theme/i);
    expect(() => generateOfflineForgeCase(request(2, { customThemePrompt: 'x'.repeat(181) }))).toThrow(/custom theme/i);
  });

  it('compiles disabled camera, voice, and movement choices into real manual mechanics', () => {
    const input = request(3, {
      capabilitiesByPlayer: {
        'player-1': ['manual', 'touch', 'haptics'],
        'player-2': ['manual', 'touch', 'haptics'],
        'player-3': ['manual', 'touch', 'haptics'],
      },
      noiseAllowed: false,
      safeMovement: false,
    });
    const game = generateOfflineForgeCase(input);
    const symbol = game.stages[1];
    const relay = game.stages[2];
    const finale = game.stages[4];
    expect(symbol.mechanic).toMatchObject({ kind: 'symbol-lock', revealMode: 'manual' });
    expect(symbol.clues.some((clue) => clue.payload.kind === 'camera-marker')).toBe(false);
    expect(relay.mechanic).toMatchObject({ kind: 'private-relay', deliveryMode: 'text' });
    expect(relay.clues.some((clue) => clue.payload.kind === 'audio-token')).toBe(false);
    expect(finale.mechanic).toMatchObject({ kind: 'motion-sync', inputMode: 'touch' });
    expect(finale.clues.some((clue) => clue.payload.kind === 'pose' || clue.payload.kind === 'audio-token')).toBe(false);
    expect(validateForgeCase(game).playable).toBe(true);
  });

  it('keeps every derived identifier valid even for maximum-length player ids', () => {
    const id = `p${'x'.repeat(63)}`;
    const game = generateOfflineForgeCase({
      ...request(1),
      playerIds: [id],
      playerNames: { [id]: 'Max' },
      capabilitiesByPlayer: { [id]: CAPABILITIES },
    });
    expect(validateForgeCase(game).playable).toBe(true);
  });

  it('rejects runtime profile data for strangers or unknown capabilities', () => {
    expect(() => generateOfflineForgeCase(request(2, {
      playerNames: { 'player-1': 'One', 'player-2': 'Two', intruder: 'Nope' },
    }))).toThrow(/members/i);
    expect(() => generateOfflineForgeCase(request(2, {
      capabilitiesByPlayer: { 'player-1': ['manual'], intruder: ['manual'] },
    }))).toThrow(/members/i);
    expect(() => generateOfflineForgeCase(request(2, {
      capabilitiesByPlayer: { 'player-1': ['manual', 'manual'] },
    }))).toThrow(/capability/i);
  });

  it('makes a one-player relay a memory mechanic and a four-player case truly distributed', () => {
    const solo = generateOfflineForgeCase(request(1));
    expect(solo.stages[2].mechanic).toMatchObject({ kind: 'private-relay', memoryMode: true });
    const group = generateOfflineForgeCase(request(4));
    expect(group.stages[2].mechanic).toMatchObject({ kind: 'private-relay', memoryMode: false });
    for (const stage of group.stages) {
      for (const playerId of group.recipe.playerIds) {
        expect(stage.clues.some((clue) => clue.audiencePlayerIds.includes(playerId))).toBe(true);
      }
    }
  });

  it('uses quiet and missing-sensor policies without removing the semantic proof', () => {
    const playerIds = ['a', 'b', 'c'];
    const game = generateOfflineForgeCase(request(3, {
      playerIds,
      playerNames: Object.fromEntries(playerIds.map((playerId) => [playerId, playerId.toUpperCase()])),
      noiseAllowed: false,
      safeMovement: false,
      capabilitiesByPlayer: Object.fromEntries(playerIds.map((playerId) => [playerId, ['manual', 'touch'] as const])),
    }));
    expect(game.stages[1].fallback.reason).toMatch(/no camera/i);
    expect(game.stages[2].fallback.reason).toMatch(/not suitable/i);
    expect(game.stages[4].fallback.reason).toMatch(/unavailable/i);
    expect(game.stages[4].mechanic.kind === 'motion-sync' && game.stages[4].mechanic.assignments.every((assignment) => assignment.vocalCue === 'NONE')).toBe(true);
    expect(validateForgeCase(game).playable).toBe(true);
  });
});

describe('Case Forge proofs and private projections', () => {
  it('accepts the exact authoritative proof for all five mechanics', () => {
    const game = generateOfflineForgeCase(request(4, { difficulty: 5, targetMinutes: 45 }));
    for (let index = 0; index < game.stages.length; index += 1) {
      expect(validateForgeSubmission(game, index, correctSubmission(game, index))).toMatchObject({
        accepted: true,
        code: 'ACCEPTED',
        stageId: game.stages[index].id,
      });
    }
  });

  it('reports incomplete prefixes without exposing the missing suffix', () => {
    const game = generateOfflineForgeCase(request(3));
    const order = game.stages[0].solution;
    const route = game.stages[3].solution;
    expect(order.kind).toBe('sequence');
    expect(route.kind).toBe('route');
    if (order.kind !== 'sequence' || route.kind !== 'route') return;
    expect(validateForgeSubmission(game, 0, { kind: 'sequence', value: order.answer.slice(0, 2) })).toMatchObject({
      accepted: false,
      code: 'INCOMPLETE',
      acceptedPrefixLength: 2,
    });
    expect(validateForgeSubmission(game, 3, { kind: 'route', value: [route.answer[0], 99] })).toMatchObject({
      accepted: false,
      code: 'WRONG_VALUE',
      acceptedPrefixLength: 1,
    });
  });

  it('rejects wrong relay recipients and slow or altered synchronized proofs', () => {
    const game = generateOfflineForgeCase(request(3));
    const relay = game.stages[2].solution;
    const sync = game.stages[4].solution;
    if (relay.kind !== 'relay' || sync.kind !== 'sync') throw new Error('Unexpected generated mechanics.');
    expect(validateForgeSubmission(game, 2, {
      kind: 'relay',
      rounds: relay.rounds.map((round, index) => index === 0 ? { ...round, recipientPlayerId: 'player-3' } : round),
    }).code).toBe('WRONG_RECIPIENT');
    expect(validateForgeSubmission(game, 4, {
      kind: 'sync',
      startedAt: 1_000,
      completedAt: 1_001 + sync.windowMs,
      proofs: sync.assignments.map((assignment) => ({ ...assignment, evidenceMode: 'manual' as const })),
    }).code).toBe('TIMING_WINDOW');
    expect(validateForgeSubmission(game, 4, {
      kind: 'sync',
      startedAt: 1_000,
      completedAt: 1_000 + sync.windowMs,
      proofs: sync.assignments.map((assignment, index) => ({
        ...assignment,
        pose: index === 0
          ? (assignment.pose === 'FACE_DOWN' ? ('PLACE_FLAT' as const) : ('FACE_DOWN' as const))
          : assignment.pose,
        evidenceMode: 'manual' as const,
      })),
    }).accepted).toBe(false);
  });

  it('projects only addressed clues and strips every authoritative solution', () => {
    const game = generateOfflineForgeCase(request(4));
    for (const playerId of game.recipe.playerIds) {
      const projection = projectForgeCaseForPlayer(game, playerId);
      expect(projection.role.playerId).toBe(playerId);
      expect('recipe' in projection).toBe(false);
      expect('validation' in projection).toBe(false);
      for (const stage of projection.stages) {
        expect('solution' in stage).toBe(false);
        expect(stage.clues.every((clue) => clue.audiencePlayerIds.includes(playerId))).toBe(true);
      }
    }
    expect(() => projectForgeCaseForPlayer(game, 'intruder')).toThrow(/not part/i);
  });

  it('detects tampered code mappings, routes, safety contracts, and private audiences', () => {
    const base = generateOfflineForgeCase(request(3));
    const routeTamper = JSON.parse(JSON.stringify(base)) as ForgeCase;
    const routeSolution = routeTamper.stages[3].solution;
    if (routeSolution.kind === 'route') (routeSolution.answer as number[])[1] = 99;
    expect(validateForgeCase(routeTamper)).toMatchObject({ playable: false });

    const fallbackTamper = JSON.parse(JSON.stringify(base)) as ForgeCase;
    (fallbackTamper.stages[1].fallback as { preservesAnswer: boolean }).preservesAnswer = false;
    expect(validateForgeCase(fallbackTamper)).toMatchObject({ playable: false });

    const audienceTamper = JSON.parse(JSON.stringify(base)) as ForgeCase;
    (audienceTamper.stages[2].clues[0].audiencePlayerIds as string[]).push('intruder');
    expect(validateForgeCase(audienceTamper)).toMatchObject({ playable: false });
  });
});

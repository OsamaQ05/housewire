import { assert, integer, property, string } from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  FORGE_THEME_IDS,
  generateOfflineForgeCase,
  normalizeForgeThemePrompt,
  projectForgeCaseForPlayer,
  validateForgeCase,
  validateForgeSubmission,
  type ForgeCase,
  type ForgeGenerationRequest,
  type ForgeStageSubmission,
} from '../src/domain/case-forge';
import type { Capability } from '../src/domain/types';
import { withLegacySyncFinale } from './legacy-forge-fixture';

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

type MechanicKind = ForgeCase['stages'][number]['mechanic']['kind'];

function gameContaining(
  playerCount: number,
  mechanicKinds: readonly MechanicKind[],
  overrides: Partial<ForgeGenerationRequest> = {},
): ForgeCase {
  for (let replayIndex = 0; replayIndex < 40; replayIndex += 1) {
    const game = generateOfflineForgeCase(request(playerCount, { ...overrides, replayIndex }));
    if (mechanicKinds.every((kind) => game.stages.some((stage) => stage.mechanic.kind === kind))) return game;
  }
  throw new Error(`Could not generate mechanics: ${mechanicKinds.join(', ')}.`);
}

function stageWithMechanic<K extends MechanicKind>(game: ForgeCase, kind: K) {
  const stage = game.stages.find((candidate) => candidate.mechanic.kind === kind);
  if (!stage || stage.mechanic.kind !== kind) throw new Error(`Missing ${kind} stage.`);
  return stage as typeof stage & { mechanic: Extract<typeof stage.mechanic, { kind: K }> };
}

function correctSubmission(game: ForgeCase, stageIndex: number): ForgeStageSubmission {
  const solution = game.stages[stageIndex].solution;
  switch (solution.kind) {
    case 'sequence':
      return { kind: 'sequence', value: solution.answer };
    case 'word':
      return { kind: 'word', value: solution.answer };
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
          const mechanicKinds = game.stages.map((stage) => stage.mechanic.kind);
          expect(mechanicKinds).toHaveLength(5);
          expect(mechanicKinds.at(-1)).toBe('distributed-order');
          expect(mechanicKinds).toContain('split-riddle');
          expect(new Set(mechanicKinds).size).toBe(5);
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
    expect(museum.stages.map((stage) => stage.mechanic.kind)).toContain('split-riddle');
    expect(validateForgeCase(museum).playable).toBe(true);
    expect(generateOfflineForgeCase(request(3, { customThemePrompt: 'a train crossing snowy mountains' })).theme)
      .toBe('stormbound-express');
    expect(
      generateOfflineForgeCase(request(3, { customThemePrompt: 'an underwater spaceship rescue' })).effectiveSeed,
    ).not.toBe(generateOfflineForgeCase(request(3)).effectiveSeed);
    expect(() => generateOfflineForgeCase(request(2, { customThemePrompt: 'bad\u0000control' }))).toThrow(/custom theme/i);
    expect(() => generateOfflineForgeCase(request(2, { customThemePrompt: 'x'.repeat(181) }))).toThrow(/custom theme/i);
  });

  it('normalizes multiline pasted descriptions before seeding and saving a case', () => {
    const multiline = '  A desert\r\nhotel\t\tloses power.\nFind the hidden well.  ';
    const normalized = 'A desert hotel loses power. Find the hidden well.';
    const input = request(3, { customThemePrompt: multiline });
    expect(normalizeForgeThemePrompt(multiline)).toBe(normalized);
    const game = generateOfflineForgeCase(input);
    expect(game).toEqual(generateOfflineForgeCase(request(3, { customThemePrompt: normalized })));
    expect(game.recipe.customThemePrompt).toBe(normalized);
    expect(input.customThemePrompt).toBe(multiline);
    expect(validateForgeCase(game).playable).toBe(true);
  });

  it('treats blank descriptions as absent instead of failing generation', () => {
    expect(normalizeForgeThemePrompt(undefined)).toBeUndefined();
    for (const blank of ['', '  ', '\r\n\t ', '\u00a0']) {
      expect(normalizeForgeThemePrompt(blank)).toBeUndefined();
      expect(generateOfflineForgeCase(request(2, { customThemePrompt: blank })))
        .toEqual(generateOfflineForgeCase(request(2)));
    }
  });

  it('preserves Unicode descriptions and gives their local cases a recognizable title', () => {
    for (const prompt of ['فندق قديم في الصحراء', 'مَتْحَف الأسرار', '古い砂漠のホテル', 'Café oublié 🔑']) {
      expect(normalizeForgeThemePrompt(prompt)).toBe(prompt);
      const game = generateOfflineForgeCase(request(3, { customThemePrompt: prompt }));
      expect(game.recipe.customThemePrompt).toBe(prompt);
      expect(game.title).not.toContain('Unfiled World');
      expect(game.title).toContain(prompt.split(' ')[0]);
      expect(validateForgeCase(game).playable).toBe(true);
    }
  });

  it('rejects non-whitespace controls and enforces the normalized description limit', () => {
    for (const control of ['\u0000', '\u0007', '\u000b', '\u000c', '\u001b', '\u007f', '\u0085']) {
      expect(() => normalizeForgeThemePrompt(`hotel${control}secret`)).toThrow(/custom theme/i);
    }
    expect(normalizeForgeThemePrompt(`  ${'x'.repeat(180)}\r\n`)).toHaveLength(180);
    expect(() => normalizeForgeThemePrompt('x'.repeat(181))).toThrow(/180/);
    expect(() => normalizeForgeThemePrompt(42 as unknown as string)).toThrow(/custom theme/i);
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
    const game = gameContaining(3, ['symbol-lock', 'private-relay'], input);
    const symbol = stageWithMechanic(game, 'symbol-lock');
    const relay = stageWithMechanic(game, 'private-relay');
    const finale = stageWithMechanic(game, 'distributed-order');
    expect(symbol.mechanic).toMatchObject({ kind: 'symbol-lock', revealMode: 'manual' });
    expect(symbol.clues.some((clue) => clue.payload.kind === 'camera-marker')).toBe(false);
    expect(relay.mechanic).toMatchObject({ kind: 'private-relay', deliveryMode: 'text' });
    expect(relay.clues.some((clue) => clue.payload.kind === 'audio-token')).toBe(false);
    expect(finale.mechanic).toMatchObject({ kind: 'distributed-order' });
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
    const solo = gameContaining(1, ['private-relay']);
    expect(stageWithMechanic(solo, 'private-relay').mechanic).toMatchObject({ memoryMode: true });
    const group = gameContaining(4, ['private-relay']);
    expect(stageWithMechanic(group, 'private-relay').mechanic).toMatchObject({ memoryMode: false });
    for (const stage of group.stages) {
      for (const playerId of group.recipe.playerIds) {
        expect(stage.clues.some((clue) => clue.audiencePlayerIds.includes(playerId))).toBe(true);
      }
    }
  });

  it('uses quiet and missing-sensor policies without removing the semantic proof', () => {
    const playerIds = ['a', 'b', 'c'];
    const options = {
      playerIds,
      playerNames: Object.fromEntries(playerIds.map((playerId) => [playerId, playerId.toUpperCase()])),
      noiseAllowed: false,
      safeMovement: false,
      capabilitiesByPlayer: Object.fromEntries(playerIds.map((playerId) => [playerId, ['manual', 'touch'] as const])),
    } satisfies Partial<ForgeGenerationRequest>;
    const game = gameContaining(3, ['symbol-lock', 'private-relay'], options);
    expect(stageWithMechanic(game, 'symbol-lock').fallback.reason).toMatch(/no camera/i);
    expect(stageWithMechanic(game, 'private-relay').fallback.reason).toMatch(/not suitable/i);
    const finale = stageWithMechanic(game, 'distributed-order');
    expect(finale.fallback.reason).toMatch(/no sensor/i);
    expect(finale.mechanic.tokens.length).toBeGreaterThanOrEqual(5);
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

  it('runs a canonical split-riddle as a real distributed word lock', () => {
    const game = generateOfflineForgeCase(request(4, { difficulty: 5 }));
    const riddle = stageWithMechanic(game, 'split-riddle');
    expect(riddle.mechanic.candidates).toHaveLength(8);
    expect(riddle.clues.filter((clue) => clue.payload.kind === 'riddle-fragment')).toHaveLength(4);
    expect(game.recipe.playerIds.every((playerId) =>
      riddle.clues.some((clue) => clue.audiencePlayerIds.includes(playerId)))).toBe(true);
    if (riddle.solution.kind !== 'word') throw new Error('Expected the split-riddle word solution.');
    const answer = riddle.solution.answer;
    expect(validateForgeSubmission(game, riddle.index, { kind: 'word', value: answer })).toMatchObject({
      accepted: true,
      code: 'ACCEPTED',
    });
    const wrong = riddle.mechanic.candidates.find((candidate) => candidate.id !== answer)!;
    expect(validateForgeSubmission(game, riddle.index, { kind: 'word', value: wrong.id })).toMatchObject({
      accepted: false,
      code: 'WRONG_VALUE',
    });

    const tampered = JSON.parse(JSON.stringify(game)) as ForgeCase;
    const tamperedRiddle = stageWithMechanic(tampered, 'split-riddle');
    const fragment = tamperedRiddle.clues.find((clue) => clue.payload.kind === 'riddle-fragment');
    if (!fragment || fragment.payload.kind !== 'riddle-fragment') throw new Error('Expected a riddle fragment.');
    (fragment.payload as { text: string }).text = 'The answer is whatever the player taps.';
    expect(validateForgeCase(tampered)).toMatchObject({ playable: false });
  });

  it('changes scene order and actual solutions across valid replay cuts', () => {
    const cuts = Array.from({ length: 12 }, (_, replayIndex) =>
      generateOfflineForgeCase(request(3, { replayIndex })),
    );
    const signatures = cuts.map((game) => game.stages.map((stage) => stage.mechanic.kind).join('>'));
    expect(new Set(signatures).size).toBeGreaterThan(3);
    expect(new Set(cuts.map((game) => JSON.stringify(game.stages.map((stage) => stage.solution)))).size).toBeGreaterThan(3);
    expect(cuts.every((game) => validateForgeCase(game).playable)).toBe(true);
  });

  it('does not expose correct prefixes as a trial-and-error answer oracle', () => {
    const game = gameContaining(3, ['distributed-order', 'route-grid']);
    const orderStage = stageWithMechanic(game, 'distributed-order');
    const routeStage = stageWithMechanic(game, 'route-grid');
    const order = orderStage.solution;
    const route = routeStage.solution;
    expect(order.kind).toBe('sequence');
    expect(route.kind).toBe('route');
    if (order.kind !== 'sequence' || route.kind !== 'route') return;
    expect(validateForgeSubmission(game, orderStage.index, { kind: 'sequence', value: order.answer.slice(0, 2) })).toMatchObject({
      accepted: false,
      code: 'INCOMPLETE',
    });
    expect(validateForgeSubmission(game, routeStage.index, { kind: 'route', value: [route.answer[0], 99] })).toMatchObject({
      accepted: false,
      code: 'INCOMPLETE',
    });
    expect(validateForgeSubmission(game, orderStage.index, { kind: 'sequence', value: order.answer.slice(0, 2) })).not.toHaveProperty('acceptedPrefixLength');
    expect(validateForgeSubmission(game, routeStage.index, { kind: 'route', value: [route.answer[0], 99] })).not.toHaveProperty('acceptedPrefixLength');
  });

  it('rejects wrong relay recipients and slow or altered synchronized proofs', () => {
    const game = withLegacySyncFinale(gameContaining(3, ['private-relay']));
    const relayStage = stageWithMechanic(game, 'private-relay');
    const syncStage = stageWithMechanic(game, 'motion-sync');
    const relay = relayStage.solution;
    const sync = syncStage.solution;
    if (relay.kind !== 'relay' || sync.kind !== 'sync') throw new Error('Unexpected generated mechanics.');
    expect(validateForgeSubmission(game, relayStage.index, {
      kind: 'relay',
      rounds: relay.rounds.map((round, index) => index === 0 ? { ...round, recipientPlayerId: 'player-3' } : round),
    }).code).toBe('WRONG_RECIPIENT');
    expect(validateForgeSubmission(game, syncStage.index, {
      kind: 'sync',
      startedAt: 1_000,
      completedAt: 1_001 + sync.windowMs,
      proofs: sync.assignments.map((assignment) => ({ ...assignment, evidenceMode: 'manual' as const })),
    }).code).toBe('TIMING_WINDOW');
    expect(validateForgeSubmission(game, syncStage.index, {
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
    const base = gameContaining(3, ['route-grid']);
    const routeTamper = JSON.parse(JSON.stringify(base)) as ForgeCase;
    const routeSolution = stageWithMechanic(routeTamper, 'route-grid').solution;
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

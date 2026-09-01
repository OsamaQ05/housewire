import { assert, integer, property } from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  generateLine13Game,
  isCorrectCircuit,
  isCorrectRoute,
  LINE_13_GLYPHS,
  line13SeedFromCode,
  tiltSequence,
} from '../src/domain/line-13-game';

describe('LINE 13 game generator', () => {
  it('is deterministic for arbitrary session seeds and crew sizes', () => {
    assert(
      property(
        integer({ min: 0, max: 2_147_483_647 }),
        integer({ min: 2, max: 4 }),
        (seed, count) => {
          const nodeIds = Array.from({ length: count }, (_, index) => `node-${index + 1}`);
          const first = generateLine13Game(seed, nodeIds, 1_000);
          const second = generateLine13Game(seed, nodeIds, 1_000);
          expect(first).toEqual(second);
        },
      ),
      { numRuns: 128 },
    );
  });

  it.each([2, 3, 4])('builds a complete operation for %i nodes', (count) => {
    const nodeIds = Array.from({ length: count }, (_, index) => `node-${index + 1}`);
    const game = generateLine13Game(8_201 + count, nodeIds, 0);

    expect(game.nodeIds).toHaveLength(count);
    expect(new Set(game.route)).toEqual(new Set(nodeIds));
    expect(game.routeScraps).toHaveLength(6);
    expect(game.circuitOrder).toHaveLength(6);
    expect(new Set(game.circuitOrder)).toHaveLength(6);
    expect(new Set(game.routeScraps.map(({ incoming }) => incoming))).toHaveLength(6);
    expect(new Set(game.routeScraps.map(({ nodeId }) => nodeId))).toEqual(new Set(nodeIds));
    expect(Object.keys(game.finalContacts)).toHaveLength(count);
    expect(game.cipher).toHaveLength(4);
    expect(new Set(game.cipher)).toHaveLength(4);
    expect(game.transferCode).toMatch(/^\d{4}$/);
    expect(game.pin).toMatch(/^\d{4}$/);
    expect(new Set(game.pin)).toHaveLength(4);
    expect(game.destinationNodeId).not.toBe(game.courierNodeId);
    expect(game.futureTimestamp).toBe(13 * 60 * 1_000);
    expect(game.cipherFragments.flatMap((fragment) => fragment.positions)).toHaveLength(4);
    expect(game.lensMarkers).toHaveLength(4);
  });

  it('always produces one solvable cross-device cipher and lens puzzle', () => {
    assert(
      property(
        integer({ min: 0, max: 2_147_483_647 }),
        integer({ min: 2, max: 4 }),
        (seed, count) => {
          const nodeIds = Array.from({ length: count }, (_, index) => `node-${index + 1}`);
          const game = generateLine13Game(seed, nodeIds, 0);
          const decoderDigits = LINE_13_GLYPHS.map((glyph) => game.digitDecoder[glyph]);
          const distributedMappings = game.decoderFragments.flatMap((fragment) =>
            fragment.mappings.map((mapping) => ({ ...mapping, nodeId: fragment.nodeId })),
          );
          const cipherPositions = game.cipherFragments.flatMap((fragment) =>
            fragment.positions.map((position) => ({ ...position, nodeId: fragment.nodeId })),
          );

          expect(Object.keys(game.digitDecoder)).toHaveLength(LINE_13_GLYPHS.length);
          expect(decoderDigits.every((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9)).toBe(true);
          expect(new Set(decoderDigits)).toHaveLength(LINE_13_GLYPHS.length);
          expect(distributedMappings).toHaveLength(LINE_13_GLYPHS.length);
          expect(new Set(distributedMappings.map(({ glyph }) => glyph))).toHaveLength(LINE_13_GLYPHS.length);
          expect(game.decoderFragments.every((fragment) => fragment.mappings.length > 0)).toBe(true);

          for (const glyph of LINE_13_GLYPHS) {
            const matchingMappings = distributedMappings.filter((mapping) => mapping.glyph === glyph);
            expect(matchingMappings).toHaveLength(1);
            expect(matchingMappings[0].digit).toBe(game.digitDecoder[glyph]);
          }

          expect(cipherPositions).toHaveLength(4);
          expect(new Set(cipherPositions.map(({ glyph }) => glyph))).toHaveLength(4);
          expect(game.pin).toBe(game.cipher.map((glyph) => game.digitDecoder[glyph]).join(''));
          expect(new Set(game.pin)).toHaveLength(4);

          for (const cipherPosition of cipherPositions) {
            const mappingOwner = distributedMappings.find(
              (mapping) => mapping.glyph === cipherPosition.glyph,
            )?.nodeId;
            expect(mappingOwner).toBeDefined();
            expect(mappingOwner).not.toBe(cipherPosition.nodeId);
          }

          expect(game.lensMarkers.map(({ position }) => position)).toEqual([1, 2, 3, 4]);
          expect(game.lensMarkers.map(({ glyph }) => glyph)).toEqual(game.cipher);
          expect(new Set(game.lensMarkers.map(({ qrToken }) => qrToken))).toHaveLength(4);
          expect(game.lensMarkers.every(({ qrToken }) => /^HW13-LENS-[1-4]-[A-Z0-9]+$/.test(qrToken))).toBe(true);
          expect(game.lensMarkers.every(({ ownerNodeId }) => ownerNodeId !== game.courierNodeId)).toBe(true);
          expect(game.lensMarkers.at(-1)?.ownerNodeId).toBe(game.destinationNodeId);

          const eligibleMarkerOwners = nodeIds.filter((nodeId) => nodeId !== game.courierNodeId);
          expect(new Set(game.lensMarkers.map(({ ownerNodeId }) => ownerNodeId))).toEqual(
            new Set(eligibleMarkerOwners),
          );
          if (count === 2) {
            expect(game.lensMarkers.every(({ ownerNodeId }) => ownerNodeId === game.destinationNodeId)).toBe(true);
          }
        },
      ),
      { numRuns: 256 },
    );
  });

  it('keeps lens QR tokens stable across clock changes without exposing node ids', () => {
    const nodeIds = ['alice@example.test', 'family-tablet', 'hall-phone'];
    const first = generateLine13Game(13_013, nodeIds, 1_000);
    const second = generateLine13Game(13_013, nodeIds, 99_000);

    expect(first.lensMarkers).toEqual(second.lensMarkers);
    for (const marker of first.lensMarkers) {
      expect(nodeIds.every((nodeId) => !marker.qrToken.includes(nodeId))).toBe(true);
    }
  });

  it.each([2, 3, 4])('keeps courier and destination structurally interdependent for %i nodes', (count) => {
    const nodeIds = Array.from({ length: count }, (_, index) => `node-${index + 1}`);

    for (let seed = 0; seed < 128; seed += 1) {
      const game = generateLine13Game(seed, nodeIds, 0);
      expect(game.destinationNodeId).not.toBe(game.courierNodeId);
      expect(nodeIds).toContain(game.destinationNodeId);
      expect(nodeIds).toContain(game.courierNodeId);
    }
  });

  it('maps every cipher position to a physical tilt gate', () => {
    const game = generateLine13Game(77, ['a', 'b', 'c']);
    expect(tiltSequence(game)).toEqual(game.cipher.map((glyph) => game.decoder[glyph]));
    expect(tiltSequence(game).every((gate) => ['LEFT', 'RIGHT', 'AWAY', 'TOWARD'].includes(gate))).toBe(true);
  });

  it('can always anchor the courier to the local phone for a coherent preview', () => {
    assert(
      property(integer({ min: 0, max: 2_147_483_647 }), (seed) => {
        const game = generateLine13Game(
          seed,
          ['local', 'sim-hall', 'sim-kitchen'],
          0,
          'local',
        );
        expect(game.courierNodeId).toBe('local');
        expect(game.destinationNodeId).not.toBe('local');
        expect(game.lensMarkers.every(({ ownerNodeId }) => ownerNodeId !== 'local')).toBe(true);
      }),
      { numRuns: 128 },
    );
  });

  it('accepts only the authored route order', () => {
    const game = generateLine13Game(404, ['a', 'b', 'c', 'd']);
    expect(isCorrectRoute(game, game.route)).toBe(true);
    expect(isCorrectRoute(game, [...game.route].reverse())).toBe(false);
    expect(isCorrectRoute(game, game.route.slice(1))).toBe(false);
  });

  it.each([2, 3, 4])('builds one six-tile closed circuit distributed across %i phones', (count) => {
    const nodeIds = Array.from({ length: count }, (_, index) => `node-${index + 1}`);

    for (let seed = 0; seed < 128; seed += 1) {
      const game = generateLine13Game(seed, nodeIds, 0);
      const scrapsByIncoming = new Map(
        game.routeScraps.map((scrap) => [scrap.incoming, scrap] as const),
      );

      expect(game.routeScraps).toHaveLength(LINE_13_GLYPHS.length);
      expect(scrapsByIncoming.size).toBe(LINE_13_GLYPHS.length);
      expect(new Set(game.routeScraps.map(({ nodeId }) => nodeId))).toEqual(new Set(nodeIds));

      for (let index = 0; index < game.circuitOrder.length; index += 1) {
        const incoming = game.circuitOrder[index];
        const expectedExit = game.circuitOrder[(index + 1) % game.circuitOrder.length];
        const scrap = scrapsByIncoming.get(incoming);
        expect(scrap).toBeDefined();
        expect(game.phase === 'SOLID' ? scrap?.solidExit : scrap?.brokenExit).toBe(expectedExit);
      }

      expect(isCorrectCircuit(game, game.circuitOrder)).toBe(true);
      expect(isCorrectCircuit(game, [...game.circuitOrder].reverse())).toBe(false);
      expect(isCorrectCircuit(game, game.circuitOrder.slice(1))).toBe(false);
      expect(game.lensMarkers.at(-1)?.ownerNodeId).toBe(game.destinationNodeId);
    }
  });

  it('varies meaningful puzzle state across session codes', () => {
    const first = generateLine13Game(line13SeedFromCode('13ABC'), ['a', 'b', 'c']);
    const second = generateLine13Game(line13SeedFromCode('13ABD'), ['a', 'b', 'c']);
    expect({ cipher: first.cipher, route: first.route, phase: first.phase }).not.toEqual({
      cipher: second.cipher,
      route: second.route,
      phase: second.phase,
    });
  });

  it('refuses a one-phone real operation', () => {
    expect(() => generateLine13Game(13, ['only-node'])).toThrow(/at least two/i);
  });
});

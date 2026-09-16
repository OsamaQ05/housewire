import { describe, expect, it } from 'vitest';
import { createShadowPlayState, isShadowPlaySolved, reduceShadowPlayState, shadowAlignment, shadowPlayStateSchema, shadowPlaySummary, shadowProjection, SHADOW_PLAY_SOLUTION } from '../src/features/story-rooms/activities/shadow-play';
describe('Long Table projected shadow surprise', () => {
  it('builds actual projections and requires each of four controls', () => {
    let state = createShadowPlayState();
    for (const move of SHADOW_PLAY_SOLUTION) { state = reduceShadowPlayState(state, move); expect(shadowPlayStateSchema.safeParse(state).success).toBe(true); }
    expect(shadowAlignment(state)).toEqual([true, true, true]);
    expect(isShadowPlaySolved(state)).toBe(true);
    for (let control = 0; control < 4; control++) expect(isShadowPlaySolved(SHADOW_PLAY_SOLUTION.filter(m => m.control !== control).reduce(reduceShadowPlayState, createShadowPlayState()))).toBe(false);
  });
  it('projects using the lamp-object distance and changes every shadow with the lamp', () => {
    const piece = { x: 2, depth: 2, turn: 0 };
    expect(shadowProjection(1, piece)).toEqual({ x: 140, scale: 2, turn: 0 });
    expect(shadowProjection(2, piece).x).toBe(100);
    expect(shadowProjection(1, { ...piece, depth: 0 }).scale).toBe(1);
  });
  it('needs position, orientation and size, not only the correct piece identity', () => {
    const state = SHADOW_PLAY_SOLUTION.slice(0, -1).reduce(reduceShadowPlayState, createShadowPlayState());
    expect(isShadowPlaySolved(state)).toBe(false);
    expect(shadowAlignment(state)).toEqual([true, true, false]);
  });
  it('allows an alternate physical construction', () => {
    const state = SHADOW_PLAY_SOLUTION.map(move => move.command === 'lamp' ? { ...move, value: 4 } : move.command === 'slide' ? { ...move, value: move.control === 3 ? 7 : 5 } : move).reduce(reduceShadowPlayState, createShadowPlayState());
    expect(isShadowPlaySolved(state)).toBe(true);
  });
  it('keeps the wall observation private to the lamp keeper', () => {
    const state = createShadowPlayState();
    expect(shadowPlaySummary(state, [1, 3]).join(' ')).not.toContain('My wall view');
    expect(shadowPlaySummary(state, [0, 2]).join(' ')).toContain('My wall view');
  });
  it('rejects malformed controls and invented completion, and latches valid success', () => {
    const initial = createShadowPlayState();
    for (const move of [{ control: 0, command: 'slide', value: 2 }, { control: 1, command: 'lamp', value: 2 }, { control: 1, command: 'slide', value: 20 }, { control: 1, command: 'turn', value: .5 }, { control: 4, command: 'turn', value: 0 }]) expect(reduceShadowPlayState(initial, move)).toBe(initial);
    expect(shadowPlayStateSchema.safeParse({ ...initial, complete: true }).success).toBe(false);
    const solved = SHADOW_PLAY_SOLUTION.reduce(reduceShadowPlayState, initial);
    expect(reduceShadowPlayState(solved, { control: 0, command: 'lamp', value: 0 })).toBe(solved);
  });
  it('always preserves a bounded valid state through all controls', () => {
    for (let lamp = 0; lamp <= 4; lamp++) for (let control = 1; control <= 3; control++) for (let x = 0; x <= 8; x++) for (let depth = 0; depth <= 2; depth++) for (let turn = 0; turn <= 3; turn++) {
      const moves = [{ control: 0, command: 'lamp', value: lamp }, { control, command: 'slide', value: x }, { control, command: 'depth', value: depth }, { control, command: 'turn', value: turn }];
      expect(shadowPlayStateSchema.safeParse(moves.reduce(reduceShadowPlayState, createShadowPlayState())).success).toBe(true);
    }
  });
});

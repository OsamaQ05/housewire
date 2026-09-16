import { describe, expect, it } from 'vitest';
import type { ActivityMove } from '../src/features/story-rooms/activities/contracts';
import { createServingTrayState, isServingTraySolved, reduceServingTrayState, servingTrayStateSchema, SERVING_TRAY_SOLUTION, TRAY_OBSTACLES, type ServingTrayState } from '../src/features/story-rooms/activities/serving-tray';

const nudge = (control: number, value: number): ActivityMove => ({ control, command: 'nudge', value });
const horizontal = (state: ServingTrayState, value: number) => [nudge(0, value), nudge(1, value)].reduce(reduceServingTrayState, state);
describe('Long Table cooperative serving tray', () => {
  it('navigates a physical obstacle route and needs all four owners', () => {
    let state = createServingTrayState();
    for (const move of SERVING_TRAY_SOLUTION) { state = reduceServingTrayState(state, move); expect(servingTrayStateSchema.safeParse(state).success).toBe(true); }
    expect(state.checkpoint).toBe(true);
    expect(isServingTraySolved(state)).toBe(true);
    for (let owner = 0; owner < 4; owner++) expect(isServingTraySolved(SERVING_TRAY_SOLUTION.filter(m => m.control !== owner).reduce(reduceServingTrayState, createServingTrayState()))).toBe(false);
  });
  it('waits without requiring simultaneous taps and ignores repeated pulls', () => {
    const initial = createServingTrayState();
    const waiting = reduceServingTrayState(initial, nudge(0, 1));
    expect(waiting.x).toBe(0);
    expect(reduceServingTrayState(waiting, nudge(0, 1))).toBe(waiting);
    const moved = reduceServingTrayState(waiting, nudge(1, 1));
    expect(moved.x).toBe(1);
    expect(moved.pending).toEqual([0, 0, 0, 0]);
  });
  it('supports cancellation and opposite arrival order', () => {
    const wait = reduceServingTrayState(createServingTrayState(), nudge(1, 1));
    expect(reduceServingTrayState(wait, nudge(1, 0)).pending).toEqual([0, 0, 0, 0]);
    expect(reduceServingTrayState(wait, nudge(0, 1)).x).toBe(1);
  });
  it('blocks edges and dishes without consuming lives or losing the tray', () => {
    const edge = horizontal(createServingTrayState(), -1);
    expect(edge.feedback).toBe('edge');
    expect(edge.x).toBe(0);
    for (const obstacle of TRAY_OBSTACLES) {
      const initial: ServingTrayState = { ...createServingTrayState(), x: obstacle.x - 1, y: obstacle.y };
      const blocked = horizontal(initial, 1);
      expect(blocked.feedback).toBe('blocked');
      expect(blocked.x).toBe(initial.x);
      expect(blocked.spills).toBe(0);
    }
  });
  it('slides dessert on mismatched pulls, then catches it and recovers', () => {
    let state = createServingTrayState();
    for (let i = 0; i < 3; i++) state = [nudge(0, 1), nudge(1, -1)].reduce(reduceServingTrayState, state);
    expect(state.feedback).toBe('spill');
    expect(state.spills).toBe(1);
    expect(state.slipX).toBe(0);
    expect(isServingTraySolved(SERVING_TRAY_SOLUTION.reduce(reduceServingTrayState, state))).toBe(true);
  });
  it('checkpoints at the green mat and returns there after a spill', () => {
    let state = SERVING_TRAY_SOLUTION.slice(0, 10).reduce(reduceServingTrayState, createServingTrayState());
    expect([state.x, state.y, state.checkpoint]).toEqual([3, 2, true]);
    state = horizontal(state, -1);
    for (let i = 0; i < 3; i++) state = [nudge(0, 1), nudge(1, -1)].reduce(reduceServingTrayState, state);
    expect([state.x, state.y]).toEqual([3, 2]);
    expect(isServingTraySolved(SERVING_TRAY_SOLUTION.slice(10).reduce(reduceServingTrayState, state))).toBe(true);
  });
  it('latches completion and rejects forged or malformed states/actions', () => {
    const initial = createServingTrayState(), solved = SERVING_TRAY_SOLUTION.reduce(reduceServingTrayState, initial);
    expect(reduceServingTrayState(solved, nudge(0, -1))).toBe(solved);
    for (const move of [nudge(4, 1), nudge(0, 2), nudge(0, NaN), { control: 1, command: 'complete', value: 1 }]) expect(reduceServingTrayState(initial, move)).toBe(initial);
    expect(servingTrayStateSchema.safeParse({ ...initial, delivered: true }).success).toBe(false);
    expect(servingTrayStateSchema.safeParse({ ...initial, x: 2, y: 0 }).success).toBe(false);
  });
  it('allows more than one physical route', () => {
    const moves = [...Array.from({ length: 6 }, () => [nudge(0, 1), nudge(1, 1)]).flat(), ...Array.from({ length: 4 }, () => [nudge(2, -1), nudge(3, -1)]).flat()];
    expect(isServingTraySolved(moves.reduce(reduceServingTrayState, createServingTrayState()))).toBe(true);
  });
});

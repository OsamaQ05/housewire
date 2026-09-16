import { z } from 'zod';
import type { ActivityKind, ActivityMove } from './contracts';
import { marbleStateSchema, createMarbleState, reduceMarbleState, isMarbleSolved, marbleSummary } from './marble';
import { timeHouseStateSchema, createTimeHouseState, reduceTimeHouseState, isTimeHouseSolved, timeHouseSummary } from './time-house';
import { toolSearchStateSchema, createToolSearchState, reduceToolSearchState, isToolSearchSolved, toolSearchSummary } from './tool-search';
import { craneStateSchema, createCraneState, reduceCraneState, isCraneSolved, craneSummary } from './crane';
import { benchWiringStateSchema, createBenchWiringState, reduceBenchWiringState, isBenchWiringSolved, benchWiringSummary } from './bench-wiring';
import { servingTrayStateSchema, createServingTrayState, reduceServingTrayState, isServingTraySolved, servingTraySummary } from './serving-tray';
import { shadowPlayStateSchema, createShadowPlayState, reduceShadowPlayState, isShadowPlaySolved, shadowPlaySummary } from './shadow-play';
import { clockworkStateSchema, createClockworkState, reduceClockworkState, isClockworkSolved, clockworkSummary } from './clockwork';

/** Finite, serializable physical progress; never an executable command or arbitrary object. */
export const activityStateSchema = z.union([marbleStateSchema, timeHouseStateSchema, toolSearchStateSchema, craneStateSchema, benchWiringStateSchema, servingTrayStateSchema, shadowPlayStateSchema, clockworkStateSchema]);
export type ActivityState = z.infer<typeof activityStateSchema>;
export const activityMoveSchema = z.object({
  control: z.number().int().min(0).max(3),
  command: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  value: z.number().int().min(-1000).max(1000).optional(),
}).strict();

export function createActivityState(kind: ActivityKind): ActivityState {
  switch (kind) {
    case 'marble-machine': return createMarbleState();
    case 'time-house': return createTimeHouseState();
    case 'tool-search': return createToolSearchState();
    case 'rescue-crane': return createCraneState();
    case 'bench-wiring': return createBenchWiringState();
    case 'serving-tray': return createServingTrayState();
    case 'shadow-play': return createShadowPlayState();
    case 'clockwork-machine': return createClockworkState();
  }
}

/** Keep reference identity for invalid moves so they cannot spend attempts or revisions. */
export function reduceActivityState(state: ActivityState, move: ActivityMove): ActivityState {
  if (!activityStateSchema.safeParse(state).success || !activityMoveSchema.safeParse(move).success) return state;
  let next: ActivityState;
  switch (state.kind) {
    case 'marble-machine': next = reduceMarbleState(state, move); break;
    case 'time-house': next = reduceTimeHouseState(state, move); break;
    case 'tool-search': next = reduceToolSearchState(state, move); break;
    case 'rescue-crane': next = reduceCraneState(state, move); break;
    case 'bench-wiring': next = reduceBenchWiringState(state, move); break;
    case 'serving-tray': next = reduceServingTrayState(state, move); break;
    case 'shadow-play': next = reduceShadowPlayState(state, move); break;
    case 'clockwork-machine': next = reduceClockworkState(state, move); break;
  }
  return next.kind === state.kind && activityStateSchema.safeParse(next).success ? next : state;
}

export function isActivitySolved(state: ActivityState): boolean {
  switch (state.kind) {
    case 'marble-machine': return isMarbleSolved(state);
    case 'time-house': return isTimeHouseSolved(state);
    case 'tool-search': return isToolSearchSolved(state);
    case 'rescue-crane': return isCraneSolved(state);
    case 'bench-wiring': return isBenchWiringSolved(state);
    case 'serving-tray': return isServingTraySolved(state);
    case 'shadow-play': return isShadowPlaySolved(state);
    case 'clockwork-machine': return isClockworkSolved(state);
  }
}

/** Only this player's visible parts, for the non-spoiler guide—not a solution fixture. */
export function activitySummary(state: ActivityState, ownedSlots: readonly number[]): string[] {
  switch (state.kind) {
    case 'marble-machine': return marbleSummary(state, [...ownedSlots]);
    case 'time-house': return timeHouseSummary(state, [...ownedSlots]);
    case 'tool-search': return toolSearchSummary(state, [...ownedSlots]);
    case 'rescue-crane': return craneSummary(state, [...ownedSlots]);
    case 'bench-wiring': return benchWiringSummary(state, ownedSlots);
    case 'serving-tray': return servingTraySummary(state, [...ownedSlots]);
    case 'shadow-play': return shadowPlaySummary(state, [...ownedSlots]);
    case 'clockwork-machine': return clockworkSummary(state, [...ownedSlots]);
  }
}

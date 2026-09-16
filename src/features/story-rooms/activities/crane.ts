import { z } from 'zod';
import type { ActivityMove } from './contracts';

export const CRANE_FEEDBACK = {
  ready: 'A little parcel is waiting on the workbench. Bring it to the gold delivery tray.',
  moved: 'The trolley has moved. Ask the hoist operator how much clearance you have.',
  lifted: 'The hook is at its new height.',
  carrying: 'Got it! The parcel is on the hook.',
  empty: 'Nothing to pick up here. The hook must reach the parcel on the bench.',
  'lift-first': 'The parcel catches on the bench. Lift it before moving the trolley.',
  'low-beam': 'The low divider is in the way. The hoist operator can see the clearance.',
  'closed-gate': 'The crossing gate is closed. Ask the bridge operator to open the passage.',
  'gate-busy': 'The hook is inside the crossing. Move it clear before changing the bridge.',
  crossing: 'Passage open. The delivery tray folds away while the crossing is in use.',
  receiving: 'Delivery tray out. The crossing gate is closed again.',
  'tray-away': 'The parcel is above the delivery bay, but its tray is folded away.',
  'lower-first': 'Bring the parcel down to the tray before releasing it.',
  returned: 'The parcel is safely on the bench again. You can pick it up from here.',
  delivered: 'Delivered together. The parcel opens—the town’s missing clock is inside.',
} as const;

const position = z.number().int().min(0).max(6);
export const craneStateSchema = z.object({
  kind: z.literal('rescue-crane'),
  x: position,
  height: z.number().int().min(0).max(3),
  bridge: z.enum(['receive', 'crossing']),
  carrying: z.boolean(),
  parcelX: position,
  delivered: z.boolean(),
  moves: z.number().int().min(0).max(100000),
  feedback: z.enum(Object.keys(CRANE_FEEDBACK) as [keyof typeof CRANE_FEEDBACK, ...(keyof typeof CRANE_FEEDBACK)[]]),
}).strict().superRefine((state, context) => {
  if (state.carrying && state.parcelX !== state.x) context.addIssue({ code: 'custom', message: 'A carried parcel travels with the trolley.' });
  if (state.delivered && (state.carrying || state.parcelX !== 5 || state.x !== 5 || state.height !== 0 || state.bridge !== 'receive')) context.addIssue({ code: 'custom', message: 'A delivered parcel must be resting in the extended tray.' });
});
export type CraneState = z.infer<typeof craneStateSchema>;

export function createCraneState(): CraneState {
  return { kind: 'rescue-crane', x: 0, height: 3, bridge: 'receive', carrying: false, parcelX: 1, delivered: false, moves: 0, feedback: 'ready' };
}

/** The controls move an actual shared object through a bounded physical model. */
export function reduceCraneState(state: CraneState, move: ActivityMove): CraneState {
  if (state.delivered || state.moves >= 100000 || !Number.isInteger(move.control)) return state;
  const respond = (feedback: CraneState['feedback'], update: Partial<CraneState> = {}): CraneState => ({ ...state, ...update, moves: state.moves + 1, feedback });
  if (move.control === 0 && move.command === 'travel' && Number.isInteger(move.value) && move.value! >= 0 && move.value! <= 6) {
    const x = move.value!;
    if (x === state.x) return state;
    if (state.carrying && state.height === 0) return respond('lift-first');
    const crosses = Math.min(x, state.x) <= 3 && Math.max(x, state.x) >= 3;
    if (crosses && state.bridge !== 'crossing') return respond('closed-gate');
    if (crosses && state.height < 2) return respond('low-beam');
    return respond('moved', { x, parcelX: state.carrying ? x : state.parcelX });
  }
  if (move.control === 1 && move.command === 'hoist' && Number.isInteger(move.value) && move.value! >= 0 && move.value! <= 3) {
    if (move.value === state.height) return state;
    if (state.x === 3 && move.value! < 2) return respond('low-beam');
    return respond('lifted', { height: move.value! });
  }
  if (move.control === 2 && move.command === 'bridge' && (move.value === 0 || move.value === 1)) {
    const bridge = move.value === 1 ? 'crossing' : 'receive';
    if (bridge === state.bridge) return state;
    if (state.x === 3) return respond('gate-busy');
    return respond(bridge === 'crossing' ? 'crossing' : 'receiving', { bridge });
  }
  if (move.control === 3 && move.command === 'grip' && move.value === undefined) {
    if (!state.carrying) {
      if (state.x !== state.parcelX || state.height !== 0) return respond('empty');
      return respond('carrying', { carrying: true });
    }
    if (state.x === 5) {
      if (state.bridge !== 'receive') return respond('tray-away');
      if (state.height !== 0) return respond('lower-first');
      return respond('delivered', { carrying: false, delivered: true, parcelX: 5 });
    }
    if (state.height !== 0) return respond('lower-first');
    return respond('returned', { carrying: false, parcelX: state.x });
  }
  return state;
}

export function isCraneSolved(state: CraneState): boolean { return state.delivered; }

export function craneSummary(state: CraneState, ownedSlots: number[]): string[] {
  const observations: string[] = [CRANE_FEEDBACK[state.feedback]];
  if (ownedSlots.some(slot => slot === 0 || slot === 2)) observations.push(`My overhead view: trolley at bay ${state.x + 1}; parcel ${state.carrying ? 'on the hook' : `at bay ${state.parcelX + 1}`}; bridge in ${state.bridge} mode. The delivery tray is visibly marked gold.`);
  if (ownedSlots.some(slot => slot === 1 || slot === 3)) observations.push(`My side view: hook height ${state.height}; ${state.carrying ? 'carrying a parcel' : 'empty hook'}. A low divider is visible in the crossing. Controls change the real shared crane; there is no answer code.`);
  return observations;
}

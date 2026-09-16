import { z } from 'zod';
import type { ActivityMove } from './contracts';

export const TRAY_OBSTACLES = [{ x: 2, y: 0, kind: 'cup' }, { x: 2, y: 3, kind: 'pot' }, { x: 4, y: 1, kind: 'vase' }, { x: 4, y: 2, kind: 'fruit' }] as const;
export const TRAY_NAMES = ['Rose handle', 'Mint handle', 'Honey handle', 'Plum handle'];
export const TRAY_FEEDBACK = {
  ready: 'Bring dessert to the gold mat. Opposite handles move together.',
  waiting: 'One handle is ready. Its partner chooses the same direction to slide.',
  moved: 'A smooth little slide. Choose a clear route around the dishes.',
  blocked: 'A dish is in the way. The tray stays here—try another route.',
  edge: 'That is the table edge. Keep the tray on the cloth.',
  wobble: 'Opposite pulls! The dessert slipped. Agree on a direction before moving.',
  spill: 'Caught it on the napkin! Dessert is safe at the last resting mat.',
  rested: 'The centre mat steadies the dessert. A safe place to pause.',
  arrived: 'Dessert delivered! A tiny lamp waits beneath the serving mat.',
} as const;
const nudge = z.number().int().min(-1).max(1);
export const servingTrayStateSchema = z.object({
  kind: z.literal('serving-tray'), x: z.number().int().min(0).max(6), y: z.number().int().min(0).max(4),
  pending: z.tuple([nudge, nudge, nudge, nudge]),
  slipX: z.number().int().min(-2).max(2), slipY: z.number().int().min(-2).max(2),
  checkpoint: z.boolean(), spills: z.number().int().min(0).max(100000),
  moves: z.number().int().min(0).max(100000), delivered: z.boolean(),
  feedback: z.enum(Object.keys(TRAY_FEEDBACK) as [keyof typeof TRAY_FEEDBACK, ...(keyof typeof TRAY_FEEDBACK)[]]),
}).strict().superRefine((state, context) => {
  if (TRAY_OBSTACLES.some(item => item.x === state.x && item.y === state.y)) context.addIssue({ code: 'custom', message: 'A tray cannot occupy a dish.' });
  if (state.delivered && (state.x !== 6 || state.y !== 0 || state.pending.some(Boolean))) context.addIssue({ code: 'custom', message: 'Delivered dessert must be on its gold mat.' });
});
export type ServingTrayState = z.infer<typeof servingTrayStateSchema>;
export function createServingTrayState(): ServingTrayState {
  return { kind: 'serving-tray', x: 0, y: 4, pending: [0, 0, 0, 0], slipX: 0, slipY: 0, checkpoint: false, spills: 0, moves: 0, delivered: false, feedback: 'ready' };
}
export function reduceServingTrayState(state: ServingTrayState, move: ActivityMove): ServingTrayState {
  if (state.delivered || state.moves >= 100000 || !Number.isInteger(move.control) || move.control < 0 || move.control > 3 || move.command !== 'nudge' || (move.value !== -1 && move.value !== 1 && move.value !== 0)) return state;
  if (state.pending[move.control] === move.value) return state;
  const pending = [...state.pending] as ServingTrayState['pending'];
  pending[move.control] = move.value;
  const next: ServingTrayState = { ...state, pending, moves: state.moves + 1, feedback: 'waiting' };
  const axis = move.control < 2 ? 0 : 2;
  const first = pending[axis], second = pending[axis + 1];
  if (!first || !second) return next;
  pending[axis] = 0; pending[axis + 1] = 0;
  if (first !== second) {
    const slipX = state.slipX + (axis === 0 ? first : 0);
    const slipY = state.slipY + (axis === 2 ? first : 0);
    if (Math.abs(slipX) > 2 || Math.abs(slipY) > 2) return { ...next, x: state.checkpoint ? 3 : 0, y: state.checkpoint ? 2 : 4, pending: [0, 0, 0, 0], slipX: 0, slipY: 0, spills: state.spills + 1, feedback: 'spill' };
    return { ...next, slipX, slipY, feedback: 'wobble' };
  }
  const x = state.x + (axis === 0 ? first : 0), y = state.y + (axis === 2 ? first : 0);
  if (x < 0 || x > 6 || y < 0 || y > 4) return { ...next, feedback: 'edge' };
  if (TRAY_OBSTACLES.some(item => item.x === x && item.y === y)) return { ...next, feedback: 'blocked' };
  const resting = x === 3 && y === 2;
  const delivered = x === 6 && y === 0;
  return { ...next, x, y, pending: delivered ? [0, 0, 0, 0] : pending, checkpoint: state.checkpoint || resting, slipX: resting || delivered ? 0 : state.slipX, slipY: resting || delivered ? 0 : state.slipY, delivered, feedback: delivered ? 'arrived' : resting ? 'rested' : 'moved' };
}
export function isServingTraySolved(state: ServingTrayState): boolean { return state.delivered; }
export function servingTraySummary(state: ServingTrayState, slots: number[]): string[] {
  return [TRAY_FEEDBACK[state.feedback], `I control ${slots.map(slot => TRAY_NAMES[slot]).join(' and ')}. Rose and Mint agree on sideways slides; Honey and Plum agree on lengthways slides. The tray is at table cell ${state.x + 1}, ${state.y + 1}. The gold serving mat is at the far right end.`, `Pending pulls: ${state.pending.join(', ')}. Dessert slip: ${state.slipX}, ${state.slipY}. Dishes visibly block ${TRAY_OBSTACLES.map(o => `${o.x + 1},${o.y + 1}`).join('; ')}. This is physical cooperation, not an answer code.`];
}
export const SERVING_TRAY_SOLUTION: ActivityMove[] = [
  ...Array.from({ length: 2 }, () => [{ control: 2, command: 'nudge', value: -1 }, { control: 3, command: 'nudge', value: -1 }]).flat(),
  ...Array.from({ length: 3 }, () => [{ control: 0, command: 'nudge', value: 1 }, { control: 1, command: 'nudge', value: 1 }]).flat(),
  ...Array.from({ length: 2 }, () => [{ control: 2, command: 'nudge', value: -1 }, { control: 3, command: 'nudge', value: -1 }]).flat(),
  ...Array.from({ length: 3 }, () => [{ control: 0, command: 'nudge', value: 1 }, { control: 1, command: 'nudge', value: 1 }]).flat(),
];

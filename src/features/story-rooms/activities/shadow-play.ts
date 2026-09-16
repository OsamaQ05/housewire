import { z } from 'zod';
import type { ActivityMove } from './contracts';

export const SHADOW_NAMES = ['Lamp', 'Roof cut-out', 'House cut-out', 'Plant cut-out'];
export const SHADOW_FEEDBACK = { ready: 'Three paper shapes. One secret picture. The lamp keeper sees the wall.', moved: 'The shadow changed. Ask the lamp keeper what needs moving.', found: 'A piece of the roof garden has appeared.', complete: 'A rooftop garden! The surprise was upstairs all along. Bring everyone—and dessert.' } as const;
const cutoutSchema = z.object({ x: z.number().int().min(0).max(8), depth: z.number().int().min(0).max(2), turn: z.number().int().min(0).max(3) }).strict();
export const shadowPlayStateSchema = z.object({
  kind: z.literal('shadow-play'), lamp: z.number().int().min(0).max(4),
  pieces: z.tuple([cutoutSchema, cutoutSchema, cutoutSchema]),
  moves: z.number().int().min(0).max(100000), complete: z.boolean(),
  feedback: z.enum(Object.keys(SHADOW_FEEDBACK) as [keyof typeof SHADOW_FEEDBACK, ...(keyof typeof SHADOW_FEEDBACK)[]]),
}).strict().superRefine((state, context) => {
  if (state.complete && !shadowAlignment(state).every(Boolean)) context.addIssue({ code: 'custom', message: 'The projected silhouette must fit the garden.' });
});
export type ShadowPlayState = z.infer<typeof shadowPlayStateSchema>;
export type ShadowPiece = z.infer<typeof cutoutSchema>;
export const SHADOW_TARGETS = [{ x: 140, y: 106, scale: 2 }, { x: 140, y: 159, scale: 2 }, { x: 220, y: 164, scale: 1.5 }] as const;
export function shadowProjection(lamp: number, piece: ShadowPiece) {
  const light = 60 + lamp * 40, object = 80 + piece.x * 20, scale = 1 + piece.depth * .5;
  return { x: light + (object - light) * scale, scale, turn: piece.turn };
}
export function shadowAlignment(state: Pick<ShadowPlayState, 'lamp' | 'pieces'>): boolean[] {
  return state.pieces.map((piece, index) => { const p = shadowProjection(state.lamp, piece), target = SHADOW_TARGETS[index]; return Math.abs(p.x - target.x) <= 5 && Math.abs(p.scale - target.scale) < .01 && p.turn === 0; });
}
export function createShadowPlayState(): ShadowPlayState {
  return { kind: 'shadow-play', lamp: 3, pieces: [{ x: 0, depth: 0, turn: 1 }, { x: 6, depth: 0, turn: 2 }, { x: 2, depth: 2, turn: 3 }], moves: 0, complete: false, feedback: 'ready' };
}
export function reduceShadowPlayState(state: ShadowPlayState, move: ActivityMove): ShadowPlayState {
  if (state.complete || state.moves >= 100000 || !Number.isInteger(move.control) || move.control < 0 || move.control > 3) return state;
  let lamp = state.lamp;
  const pieces = state.pieces.map(p => ({ ...p })) as ShadowPlayState['pieces'];
  if (move.control === 0 && move.command === 'lamp' && Number.isInteger(move.value) && move.value! >= 0 && move.value! <= 4) {
    if (move.value === lamp) return state;
    lamp = move.value!;
  } else if (move.control > 0 && ['slide', 'depth', 'turn'].includes(move.command) && Number.isInteger(move.value)) {
    const piece = pieces[move.control - 1];
    if (move.command === 'slide' && move.value! >= 0 && move.value! <= 8) { if (piece.x === move.value) return state; piece.x = move.value!; }
    else if (move.command === 'depth' && move.value! >= 0 && move.value! <= 2) { if (piece.depth === move.value) return state; piece.depth = move.value!; }
    else if (move.command === 'turn' && move.value! >= 0 && move.value! <= 3) { if (piece.turn === move.value) return state; piece.turn = move.value!; }
    else return state;
  } else return state;
  const aligned = shadowAlignment({ lamp, pieces }), complete = aligned.every(Boolean);
  return { ...state, lamp, pieces, moves: state.moves + 1, complete, feedback: complete ? 'complete' : aligned.some(Boolean) ? 'found' : 'moved' };
}
export function isShadowPlaySolved(state: ShadowPlayState): boolean { return state.complete; }
export function shadowPlaySummary(state: ShadowPlayState, slots: number[]): string[] {
  const summary = [SHADOW_FEEDBACK[state.feedback], `My controls: ${slots.map(slot => SHADOW_NAMES[slot]).join(', ')}.`];
  if (slots.includes(0)) summary.push(`My wall view shows ${shadowAlignment(state).filter(Boolean).length} fitted silhouettes. The paper shadows form a rooftop garden; outlines show position, size and orientation. Lamp position ${state.lamp + 1}.`);
  for (const slot of slots.filter(slot => slot > 0)) { const p = state.pieces[slot - 1]; summary.push(`${SHADOW_NAMES[slot]}: tabletop position ${p.x + 1}, distance ${p.depth + 1}, quarter turns ${p.turn}. Moving closer to the lamp enlarges its shadow. Ask the lamp keeper where its shadow falls.`); }
  return summary;
}
export const SHADOW_PLAY_SOLUTION: ActivityMove[] = [
  { control: 0, command: 'lamp', value: 1 },
  { control: 1, command: 'slide', value: 2 }, { control: 1, command: 'depth', value: 2 }, { control: 1, command: 'turn', value: 0 },
  { control: 2, command: 'slide', value: 2 }, { control: 2, command: 'depth', value: 2 }, { control: 2, command: 'turn', value: 0 },
  { control: 3, command: 'slide', value: 5 }, { control: 3, command: 'depth', value: 1 }, { control: 3, command: 'turn', value: 0 },
];

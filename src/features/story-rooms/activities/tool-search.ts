import { z } from 'zod';
import type { ActivityMove } from './contracts';

export const toolSearchStateSchema = z.object({
  kind: z.literal('tool-search'),
  drawers: z.array(z.number().int().min(0).max(2)).max(3).refine(values => new Set(values).size === values.length),
  deskPlaces: z.array(z.number().int().min(0).max(2)).max(3).refine(values => new Set(values).size === values.length),
  cord: z.boolean(), magnet: z.boolean(), cloth: z.boolean(),
  retrievalLine: z.boolean(), key: z.boolean(), unlocked: z.boolean(), clean: z.boolean(),
  event: z.enum(['start', 'empty', 'cord', 'cloth', 'magnet', 'combined', 'wrong-combination', 'too-short', 'key', 'unlocked', 'clean', 'need-key', 'open-first', 'wrong-tool']),
}).strict().refine(state => state.cloth === state.drawers.includes(0)
  && state.cord === state.drawers.includes(2) && state.magnet === state.deskPlaces.includes(1)
  && (!state.retrievalLine || state.cord && state.magnet)
  && (!state.key || state.retrievalLine) && (!state.unlocked || state.key)
  && (!state.clean || state.unlocked && state.cloth), { message: 'Finds and tool progress must match the explored room.' });
export type ToolSearchState = z.infer<typeof toolSearchStateSchema>;
export function createToolSearchState(): ToolSearchState {
  return { kind: 'tool-search', drawers: [], deskPlaces: [], cord: false, magnet: false, cloth: false, retrievalLine: false, key: false, unlocked: false, clean: false, event: 'start' };
}
export function isToolSearchSolved(state: ToolSearchState) { return state.unlocked && state.clean; }
export function reduceToolSearchState(state: ToolSearchState, move: ActivityMove): ToolSearchState {
  if (isToolSearchSolved(state) || !Number.isInteger(move.control)) return state;
  const { control, command, value } = move;
  if (control === 0 && command === 'open-drawer' && Number.isInteger(value) && value! >= 0 && value! <= 2) {
    if (state.drawers.includes(value!)) return state;
    return { ...state, drawers: [...state.drawers, value!], cloth: state.cloth || value === 0, cord: state.cord || value === 2, event: value === 0 ? 'cloth' : value === 2 ? 'cord' : 'empty' };
  }
  if (control === 1 && command === 'inspect-desk' && Number.isInteger(value) && value! >= 0 && value! <= 2) {
    if (state.deskPlaces.includes(value!)) return state;
    return { ...state, deskPlaces: [...state.deskPlaces, value!], magnet: state.magnet || value === 1, event: value === 1 ? 'magnet' : 'empty' };
  }
  if (control === 2 && command === 'combine' && [3, 5, 6].includes(value ?? -1)) {
    const available = (state.cord ? 1 : 0) | (state.magnet ? 2 : 0) | (state.cloth ? 4 : 0);
    if (((value ?? 0) & available) !== value || state.retrievalLine) return state;
    return { ...state, retrievalLine: value === 3, event: value === 3 ? 'combined' : 'wrong-combination' };
  }
  if (control === 2 && command === 'lower-tool' && value === undefined) {
    if (state.key) return state;
    return { ...state, key: state.retrievalLine, event: state.retrievalLine ? 'key' : 'too-short' };
  }
  if (control === 3 && command === 'use-item') {
    if (value === 3 && state.key && !state.unlocked) return { ...state, unlocked: true, event: 'unlocked' };
    if (value === 4 && state.cloth && !state.clean) return { ...state, clean: state.unlocked, event: state.unlocked ? 'clean' : 'open-first' };
    if (value === 1 && state.cord || value === 2 && state.magnet) return { ...state, event: state.unlocked ? 'wrong-tool' : 'need-key' };
  }
  return state;
}
export const TOOL_SEARCH_EVENTS: Record<ToolSearchState['event'], string> = {
  start: 'A little key is below the grate. Search your corner; useful finds go into the shared bag.',
  empty: 'Nothing useful here. There are other places to look.',
  cord: 'A long cord! It is now in everyone’s bag.',
  cloth: 'A soft cloth! Keep it for the dusty viewer.',
  magnet: 'A small magnet! The key below the grate is iron.',
  combined: 'The cord is tied to the magnet. It can now reach down through the grate.',
  'wrong-combination': 'Those objects do not make a useful tool together. Nothing is used up.',
  'too-short': 'Your fingers cannot reach. You need a tool long enough to lift the iron key.',
  key: 'The key comes up through the grate. It is now in the shared bag.',
  unlocked: 'The viewer opens! Its glass is dusty, but unbroken.',
  clean: 'The glass is clear. Two versions of the same courtyard appear inside.',
  'need-key': 'That will not turn the little lock. Look for something that fits it.',
  'open-first': 'The dusty glass is inside the locked cover. Open the viewer first.',
  'wrong-tool': 'The glass needs something soft. Nothing is damaged.',
};
export function toolSearchSummary(state: ToolSearchState, ownedSlots: number[]): string[] {
  return [TOOL_SEARCH_EVENTS[state.event], `Shared finds: ${[state.cord && 'cord', state.magnet && 'magnet', state.cloth && 'cloth', state.retrievalLine && 'magnet on a cord', state.key && 'iron key'].filter(Boolean).join(', ') || 'none yet'}.`, `This player operates: ${ownedSlots.map(slot => ['cupboard', 'desk', 'grate and tool bench', 'viewer'][slot]).join(', ')}.`];
}
export const TOOL_SEARCH_SOLUTION: ActivityMove[] = [
  { control: 0, command: 'open-drawer', value: 0 }, { control: 0, command: 'open-drawer', value: 2 },
  { control: 1, command: 'inspect-desk', value: 1 }, { control: 2, command: 'combine', value: 3 },
  { control: 2, command: 'lower-tool' }, { control: 3, command: 'use-item', value: 3 }, { control: 3, command: 'use-item', value: 4 },
];

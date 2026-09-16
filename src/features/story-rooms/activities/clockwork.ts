import { z } from 'zod';
import type { ActivityMove } from './contracts';

export const CLOCKWORK_PARTS = [
  { name: 'Copper drive', color: '#D98646' },
  { name: 'Mint drive', color: '#6CA899' },
  { name: 'Coral drive', color: '#DA7862' },
  { name: 'Blue drive', color: '#729CB9' },
] as const;
export const CLOCKWORK_FEEDBACK = {
  ready: 'Build a moving chain from the hand crank to the little clock.',
  placed: 'Drive fitted. Wheels on the same peg share an axle.',
  turned: 'Drive turned. Line up its wheels with the next drive.',
  crossed: 'Belt crossed. Its two wheels now turn opposite ways.',
  straight: 'Belt straight. Its two wheels now turn the same way.',
  removed: 'Drive back in your parts tray. Nothing is lost.',
  edge: 'That drive would hang off the board. Turn it or choose another peg.',
  occupied: 'Another drive already joins those pegs. Choose a different gap.',
  disconnected: 'The moving chain stops before the clock. Join a still wheel to a turning one.',
  backwards: 'The clock is turning backwards! Crossing one belt reverses its direction.',
  jammed: 'Two paths pull the same axle opposite ways. Open the loop or change a belt.',
  complete: 'It works! The clock winds forward and the little town comes to life.',
} as const;

const partSchema = z.object({ peg: z.number().int().min(-1).max(8), turn: z.number().int().min(0).max(3), crossed: z.boolean() }).strict();
export type ClockworkPart = z.infer<typeof partSchema>;
export type ClockworkFeedback = keyof typeof CLOCKWORK_FEEDBACK;
const pegs = z.array(z.number().int().min(-1).max(1)).length(9);
const stateBase = z.object({
  kind: z.literal('clockwork-machine'),
  parts: z.array(partSchema).length(4),
  runs: z.number().int().min(0).max(100000),
  moves: z.number().int().min(0).max(100000),
  solved: z.boolean(),
  feedback: z.enum(Object.keys(CLOCKWORK_FEEDBACK) as [ClockworkFeedback, ...ClockworkFeedback[]]),
  powered: pegs,
  jammed: z.boolean(),
}).strict();
type ClockworkBase = z.infer<typeof stateBase>;

/** Ends of a tangible two-pulley drive, not a position in a hidden answer. */
export function clockworkEndpoints(part: ClockworkPart): [number, number] | null {
  if (part.peg < 0 || part.peg > 8 || !Number.isInteger(part.peg)) return null;
  const x = part.peg % 3; const y = Math.floor(part.peg / 3);
  const dx = [1, 0, -1, 0][part.turn]; const dy = [0, 1, 0, -1][part.turn];
  if (dx === undefined || dy === undefined || x + dx < 0 || x + dx > 2 || y + dy < 0 || y + dy > 2) return null;
  return [part.peg, (y + dy) * 3 + x + dx];
}

/** Propagate angular direction through coupled shafts; crossed belts reverse it. */
export function simulateClockwork(parts: readonly ClockworkPart[]): { powered: number[]; jammed: boolean; reachesClock: boolean; forward: boolean } {
  const graph: { next: number; sign: number }[][] = Array.from({ length: 9 }, () => []);
  for (const part of parts) {
    const ends = clockworkEndpoints(part);
    if (!ends) continue;
    const [a, b] = ends; const sign = part.crossed ? -1 : 1;
    graph[a].push({ next: b, sign }); graph[b].push({ next: a, sign });
  }
  const powered = Array<number>(9).fill(0); powered[0] = 1;
  const queue = [0]; let jammed = false;
  for (let step = 0; step < queue.length; step++) {
    const current = queue[step];
    for (const link of graph[current]) {
      const direction = powered[current] * link.sign;
      if (!powered[link.next]) { powered[link.next] = direction; queue.push(link.next); }
      else if (powered[link.next] !== direction) jammed = true;
    }
  }
  return { powered, jammed, reachesClock: powered[8] !== 0, forward: !jammed && powered[8] === 1 };
}

export const clockworkStateSchema = stateBase.superRefine((state, context) => {
  const occupied = new Set<string>();
  state.parts.forEach(part => {
    if (part.peg < 0) return;
    const ends = clockworkEndpoints(part);
    if (!ends) { context.addIssue({ code: 'custom', message: 'A drive must fit on the pegboard.' }); return; }
    const key = [...ends].sort((a, b) => a - b).join('-');
    if (occupied.has(key)) context.addIssue({ code: 'custom', message: 'Two drives cannot occupy the same gap.' });
    occupied.add(key);
  });
  if (state.solved && (!simulateClockwork(state.parts).forward || state.feedback !== 'complete' || state.runs === 0)) context.addIssue({ code: 'custom', message: 'Completion requires a tested forward-driving machine.' });
  if (state.feedback === 'complete' && !state.solved) context.addIssue({ code: 'custom', message: 'Completion feedback needs a completed machine.' });
  const hasPreview = state.powered.some(value => value !== 0);
  if (hasPreview) {
    const result = simulateClockwork(state.parts);
    if (state.runs === 0 || state.powered.some((value, index) => value !== result.powered[index]) || state.jammed !== result.jammed || result.forward !== state.solved) context.addIssue({ code: 'custom', message: 'Run feedback must match the real transmission.' });
  } else if (state.jammed || state.solved) context.addIssue({ code: 'custom', message: 'A result needs a powered simulation.' });
});
export type ClockworkState = z.infer<typeof clockworkStateSchema>;

export function createClockworkState(): ClockworkState {
  return { kind: 'clockwork-machine', parts: Array.from({ length: 4 }, (_, index) => ({ peg: -1, turn: 0, crossed: index === 2 })), runs: 0, moves: 0, solved: false, feedback: 'ready', powered: Array<number>(9).fill(0), jammed: false };
}

export function reduceClockworkState(state: ClockworkState, move: ActivityMove): ClockworkState {
  if (state.solved || state.moves >= 100000 || !Number.isInteger(move.control) || move.control < 0 || move.control > 3) return state;
  const own = state.parts[move.control];
  const respond = (feedback: ClockworkFeedback, update: Partial<ClockworkBase> = {}): ClockworkState => ({ ...state, moves: state.moves + 1, feedback, ...update });
  const change = (next: ClockworkPart, feedback: ClockworkFeedback): ClockworkState => {
    if (next.peg >= 0) {
      const ends = clockworkEndpoints(next);
      if (!ends) return respond('edge');
      if (state.parts.some((part, index) => {
        if (index === move.control) return false;
        const other = clockworkEndpoints(part);
        return other && ends.every(end => other.includes(end));
      })) return respond('occupied');
    }
    const parts = state.parts.map((part, index) => index === move.control ? next : part);
    return respond(feedback, { parts, powered: Array<number>(9).fill(0), jammed: false });
  };
  if (move.command === 'place' && Number.isInteger(move.value) && move.value! >= 0 && move.value! <= 8) {
    if (move.value === own.peg) return state;
    return change({ ...own, peg: move.value! }, 'placed');
  }
  if (move.command === 'turn' && Number.isInteger(move.value) && move.value! >= 0 && move.value! <= 3) {
    if (move.value === own.turn) return state;
    return change({ ...own, turn: move.value! }, 'turned');
  }
  if (move.command === 'belt' && (move.value === 0 || move.value === 1)) {
    const crossed = move.value === 1;
    if (crossed === own.crossed) return state;
    return change({ ...own, crossed }, crossed ? 'crossed' : 'straight');
  }
  if (move.command === 'remove' && move.value === undefined) {
    if (own.peg < 0) return state;
    return change({ ...own, peg: -1 }, 'removed');
  }
  if (move.command === 'run' && move.value === undefined && state.runs < 100000) {
    const result = simulateClockwork(state.parts);
    return respond(result.jammed ? 'jammed' : result.forward ? 'complete' : result.reachesClock ? 'backwards' : 'disconnected', { powered: result.powered, jammed: result.jammed, runs: state.runs + 1, solved: result.forward });
  }
  return state;
}

export function isClockworkSolved(state: ClockworkState): boolean { return state.solved; }
export function clockworkSummary(state: ClockworkState, ownedSlots: number[]): string[] {
  return [CLOCKWORK_FEEDBACK[state.feedback], `The shared pegboard connects a hand crank at top left to the clock at bottom right. ${state.parts.filter(part => part.peg >= 0).length} of four drive units are fitted.`, ...ownedSlots.map(slot => {
    const part = state.parts[slot]; const ends = clockworkEndpoints(part);
    return `My ${CLOCKWORK_PARTS[slot].name}: ${ends ? `mounted between ${pegName(ends[0])} and ${pegName(ends[1])}` : 'in my tray'}, ${part.crossed ? 'crossed belt reverses rotation' : 'straight belt carries rotation in the same direction'}.`;
  })];
}
export function pegName(peg: number): string { return `${'ABC'[peg % 3]}${Math.floor(peg / 3) + 1}`; }

/** A reproducible accessible demo, not consulted by game validation. */
export const CLOCKWORK_SOLUTION_MOVES: ActivityMove[] = [
  { control: 0, command: 'place', value: 0 },
  { control: 1, command: 'place', value: 1 },
  { control: 2, command: 'turn', value: 1 },
  { control: 2, command: 'place', value: 2 },
  { control: 2, command: 'belt', value: 0 },
  { control: 3, command: 'turn', value: 1 },
  { control: 3, command: 'place', value: 5 },
  { control: 0, command: 'run' },
];

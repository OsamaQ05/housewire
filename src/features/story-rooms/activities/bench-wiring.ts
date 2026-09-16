import { z } from 'zod';
import type { ActivityMove } from './contracts';

export const WIRING_SIZE = 6;
export const WIRING_NAMES = ['Bakery cable', 'Cinema cable', 'Garden cable', 'Crane cable'] as const;
export const WIRING_DESTINATIONS = ['Bakery', 'Cinema', 'Garden', 'Crane'] as const;
export const WIRING_COLORS = ['#EE956F', '#79BED0', '#91CBA6', '#F0C66D'] as const;
export const WIRING_STARTS = [0, 13, 9, 5] as const;
export const WIRING_GOALS = [19, 10, 35, 22] as const;
export const WIRING_BUILDINGS = [8, 20] as const;
export const WIRING_FEEDBACK = {
  ready: 'Four dark buildings. Lay your cable from its round socket to its matching building.',
  laid: 'Cable laid. Make room for the other routes too.',
  rewound: 'Cable shortened. The freed street is available to everyone.',
  occupied: 'Another cable uses that street. Ask its owner to make room, or take another route.',
  blocked: 'That model building is in the way. Use the streets around it.',
  gap: 'Continue from your cable’s glowing tip, one neighbouring street at a time.',
  socket: 'That socket or building belongs to another cable.',
  complete: 'A building is connected. You can shorten a finished route if another cable needs room.',
  incomplete: 'Some buildings still need a cable. Follow each route from its socket to its building.',
  powered: 'The whole little town lights up. The crane is ready.',
} as const;

const cellSchema = z.number().int().min(0).max(WIRING_SIZE ** 2 - 1);
const pathSchema = z.array(cellSchema).min(1).max(WIRING_SIZE ** 2);
export const wiringPoint = (cell: number) => ({ x: cell % WIRING_SIZE, y: Math.floor(cell / WIRING_SIZE) });
export function wiringAdjacent(a: number, b: number): boolean {
  const first = wiringPoint(a); const second = wiringPoint(b);
  return Math.abs(first.x - second.x) + Math.abs(first.y - second.y) === 1;
}
function isBuilding(cell: number): boolean { return WIRING_BUILDINGS.some(value => value === cell); }
function otherTerminal(cell: number, control: number): boolean {
  return WIRING_STARTS.some((value, index) => index !== control && value === cell)
    || WIRING_GOALS.some((value, index) => index !== control && value === cell);
}

/** No hidden answer: any four non-overlapping, orthogonal cable routes work. */
export function inspectWiring(paths: readonly (readonly number[])[]) {
  let valid = paths.length === 4;
  const seen = new Set<number>();
  const connected = [false, false, false, false];
  for (let control = 0; control < paths.length; control++) {
    const path = paths[control];
    if (!path.length || path[0] !== WIRING_STARTS[control] || path.length > 36) valid = false;
    for (let at = 0; at < path.length; at++) {
      const cell = path[at];
      if (!Number.isInteger(cell) || cell < 0 || cell >= 36 || seen.has(cell) || isBuilding(cell)
        || otherTerminal(cell, control) || (at > 0 && !wiringAdjacent(path[at - 1], cell))
        || (cell === WIRING_GOALS[control] && at !== path.length - 1)) valid = false;
      seen.add(cell);
    }
    connected[control] = path.length > 1 && path[path.length - 1] === WIRING_GOALS[control];
  }
  return { valid, safe: valid && connected.every(Boolean), connected, connectedCount: connected.filter(Boolean).length };
}

export const benchWiringStateSchema = z.object({
  kind: z.literal('bench-wiring'),
  paths: z.tuple([pathSchema, pathSchema, pathSchema, pathSchema]),
  tests: z.number().int().min(0).max(100000),
  moves: z.number().int().min(0).max(100000),
  powered: z.boolean(),
  feedback: z.enum(['ready', 'laid', 'rewound', 'occupied', 'blocked', 'gap', 'socket', 'complete', 'incomplete', 'powered']),
}).strict().superRefine((state, ctx) => {
  const result = inspectWiring(state.paths);
  if (!result.valid) ctx.addIssue({ code: 'custom', message: 'Cables must form separate street routes from their own sockets.' });
  if (state.powered && (state.tests < 1 || !result.safe)) ctx.addIssue({ code: 'custom', message: 'Power requires four tested cable connections.' });
});
export type BenchWiringState = z.infer<typeof benchWiringStateSchema>;

export function createBenchWiringState(): BenchWiringState {
  return { kind: 'bench-wiring', paths: [[0], [13], [9], [5]], tests: 0, moves: 0, powered: false, feedback: 'ready' };
}
export function reduceBenchWiringState(state: BenchWiringState, move: ActivityMove): BenchWiringState {
  if (state.powered || state.moves >= 100000 || !Number.isInteger(move.control) || move.control < 0 || move.control > 3) return state;
  const control = move.control; const path = state.paths[control];
  const feedback = (message: BenchWiringState['feedback']): BenchWiringState => ({ ...state, feedback: message, moves: state.moves + 1 });
  const setPath = (next: number[], message: BenchWiringState['feedback']): BenchWiringState => {
    const paths = state.paths.map(route => [...route]) as BenchWiringState['paths']; paths[control] = next;
    return { ...state, paths, feedback: message, moves: state.moves + 1 };
  };
  if ((move.command === 'undo' || move.command === 'reset') && move.value === undefined) {
    if (path.length === 1) return state;
    return setPath(move.command === 'reset' ? [WIRING_STARTS[control]] : path.slice(0, -1), 'rewound');
  }
  if (move.command === 'place' && Number.isInteger(move.value) && move.value! >= 0 && move.value! < 36) {
    const cell = move.value!; const earlier = path.indexOf(cell);
    if (earlier === path.length - 1) return state;
    if (earlier >= 0) return setPath(path.slice(0, earlier + 1), 'rewound');
    if (isBuilding(cell)) return feedback('blocked');
    if (otherTerminal(cell, control)) return feedback('socket');
    if (state.paths.some((route, index) => index !== control && route.includes(cell))) return feedback('occupied');
    if (path[path.length - 1] === WIRING_GOALS[control]) return feedback('complete');
    if (!wiringAdjacent(path[path.length - 1], cell)) return feedback('gap');
    return setPath([...path, cell], cell === WIRING_GOALS[control] ? 'complete' : 'laid');
  }
  if (move.command === 'test' && move.value === undefined && state.tests < 100000) {
    const result = inspectWiring(state.paths);
    return { ...state, tests: state.tests + 1, moves: state.moves + 1, powered: result.safe, feedback: result.safe ? 'powered' : 'incomplete' };
  }
  return state;
}
export function isBenchWiringSolved(state: BenchWiringState): boolean {
  return state.powered && state.tests > 0 && inspectWiring(state.paths).safe;
}
export function benchWiringSummary(state: BenchWiringState, owned: readonly number[]): string[] {
  const result = inspectWiring(state.paths);
  return [WIRING_FEEDBACK[state.feedback], `I lay ${owned.map(slot => WIRING_NAMES[slot]).join(' and ')}.`,
    `${result.connectedCount} of 4 buildings are connected. ${WIRING_DESTINATIONS.map((name, slot) => `${name}: ${result.connected[slot] ? 'connected' : 'waiting'}`).join('; ')}.`,
    'Visible streets are shared: a cable cannot cross another cable or a model building. Continue from the glowing tip, tap an earlier own segment to shorten, or use Undo / Reel in. Every non-overlapping route to the matching building is accepted.'];
}

export const BENCH_WIRING_SOLUTION_PATHS = [[0, 6, 12, 18, 19], [13, 7, 1, 2, 3, 4, 10], [9, 15, 21, 27, 33, 34, 35], [5, 11, 17, 23, 22]] as const;
export const BENCH_WIRING_SOLUTION_MOVES: ActivityMove[] = [
  ...BENCH_WIRING_SOLUTION_PATHS.flatMap((path, control) => path.slice(1).map(value => ({ control, command: 'place', value }))),
  { control: 0, command: 'test' },
];

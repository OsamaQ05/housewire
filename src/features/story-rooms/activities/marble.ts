import { z } from 'zod';
import type { ActivityMove } from './contracts';

const pointSchema = z.object({ x: z.number().finite().min(-100).max(500), y: z.number().finite().min(-100).max(500) }).strict();
const pieceSchema = z.object({ cell: z.number().int().min(-1).max(29), rotation: z.number().int().min(0).max(3) }).strict();
/** Each part is already mounted: players adjust a short, visible rail, not an
 * open construction grid. Cell coordinates are retained in the wire protocol. */
export const MARBLE_RAILS = [[0, 5, 10], [6, 11, 16], [12, 17, 22, 27], [4, 9, 14, 19]] as const;
export const MARBLE_TENSIONS = ['Gentle', 'Firmer'] as const;
export const marbleStateSchema = z.object({
  kind: z.literal('marble-machine'),
  pieces: z.tuple([pieceSchema, pieceSchema, pieceSchema, pieceSchema]),
  runs: z.number().int().min(0).max(100000),
  result: z.enum(['ready', 'missing', 'ramp', 'catcher', 'spring', 'bell', 'success']),
  trace: z.array(pointSchema).max(240),
}).strict().refine(state => state.pieces.every((piece, index) =>
  (MARBLE_RAILS[index] as readonly number[]).includes(piece.cell)
  && (index === 2 ? piece.rotation <= 1 : piece.rotation === 0)), 'A part must stay on its own rail.');
export type MarbleState = z.infer<typeof marbleStateSchema>;
export type MarblePoint = z.infer<typeof pointSchema>;
export type MarblePiece = z.infer<typeof pieceSchema>;
export const MARBLE_NAMES = ['Ramp', 'Funnel', 'Spring', 'Bell'] as const;
export const MARBLE_COLUMNS = 5;
export const MARBLE_ROWS = 6;
export const MARBLE_SOURCE = { x: 32, y: 14 };
const GRAVITY = 250;

export function createMarbleState(): MarbleState {
  return { kind: 'marble-machine', pieces: [{ cell: 10, rotation: 0 }, { cell: 16, rotation: 0 }, { cell: 27, rotation: 0 }, { cell: 19, rotation: 0 }], runs: 0, result: 'ready', trace: [] };
}

export function marbleRailStop(state: MarbleState, control: number): number {
  return (MARBLE_RAILS[control] as readonly number[]).indexOf(state.pieces[control].cell);
}

export function marbleSocket(cell: number): MarblePoint {
  return { x: 32 + (cell % MARBLE_COLUMNS) * 64, y: 44 + Math.floor(cell / MARBLE_COLUMNS) * 50 };
}

export function marbleGeometry(pieces: MarbleState['pieces']) {
  const [ramp, funnel, spring, bell] = pieces.map(piece => marbleSocket(Math.max(0, piece.cell)));
  const rampDirection = pieces[0].rotation === 3 ? -1 : 1;
  const rampDrop = [16, 28, 44, 28][pieces[0].rotation];
  const funnelDirection = pieces[1].rotation % 2 === 0 ? 1 : -1;
  return {
    ramp, funnel, spring, bell,
    rampStart: { x: ramp.x - 24 * rampDirection, y: ramp.y - rampDrop / 2 },
    rampEnd: { x: ramp.x + 24 * rampDirection, y: ramp.y + rampDrop / 2 },
    rampDirection,
    funnelDirection,
    funnelExit: { x: funnel.x + 10 * funnelDirection, y: funnel.y + 13 },
    springAngle: -65 * Math.PI / 180,
    springSpeed: pieces[2].rotation === 1 ? 310 : 235,
  };
}

/** Gravity and intersections decide every hand-off. The rails simply remove
 * fiddly placement; there is no prescribed winning set of settings. */
export function simulateMarble(pieces: MarbleState['pieces']): Pick<MarbleState, 'result' | 'trace'> {
  const g = marbleGeometry(pieces);
  const trace: MarblePoint[] = [];
  const add = (x: number, y: number) => trace.push({ x: Math.round(Math.max(-99, Math.min(499, x)) * 100) / 100, y: Math.round(Math.max(-99, Math.min(499, y)) * 100) / 100 });
  const line = (a: MarblePoint, b: MarblePoint, count = 18) => {
    for (let i = 0; i <= count; i++) add(a.x + (b.x - a.x) * i / count, a.y + (b.y - a.y) * i / count);
  };
  const fallTime = (from: number, to: number, vy: number) => (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * Math.max(0, to - from))) / GRAVITY;
  const flight = (start: MarblePoint, vx: number, vy: number, time: number, count = 30) => {
    for (let i = 1; i <= count; i++) {
      const t = time * i / count;
      add(start.x + vx * t, start.y + vy * t + .5 * GRAVITY * t * t);
    }
    return trace[trace.length - 1];
  };
  const miss = (start: MarblePoint, vx = 0, vy = 0) => flight(start, vx, vy, fallTime(start.y, 324, vy));
  if (pieces.some(piece => piece.cell < 0)) return { result: 'missing', trace: [MARBLE_SOURCE] };
  if (Math.abs(g.ramp.x - MARBLE_SOURCE.x) > 24) {
    line(MARBLE_SOURCE, { x: MARBLE_SOURCE.x, y: 324 });
    return { result: 'ramp', trace };
  }
  line(MARBLE_SOURCE, g.ramp);
  line(g.ramp, g.rampEnd, 10);
  const slope = Math.atan2(g.rampEnd.y - g.rampStart.y, Math.abs(g.rampEnd.x - g.rampStart.x));
  const speed = Math.sqrt(2 * GRAVITY * (g.rampEnd.y - MARBLE_SOURCE.y) * .55);
  const vx = speed * Math.cos(slope) * g.rampDirection;
  const vy = speed * Math.sin(slope);
  if (g.funnel.y <= g.rampEnd.y) {
    miss(g.rampEnd, vx, vy);
    return { result: 'catcher', trace };
  }
  const landing = flight(g.rampEnd, vx, vy, fallTime(g.rampEnd.y, g.funnel.y, vy));
  if (Math.abs(landing.x - g.funnel.x) > 25) return { result: 'catcher', trace };
  line(landing, g.funnelExit, 10);
  const funnelVx = 70 * g.funnelDirection;
  if (g.spring.y <= g.funnelExit.y) {
    miss(g.funnelExit, funnelVx);
    return { result: 'spring', trace };
  }
  const bounce = flight(g.funnelExit, funnelVx, 0, fallTime(g.funnelExit.y, g.spring.y, 0));
  if (Math.abs(bounce.x - g.spring.x) > 23) return { result: 'spring', trace };
  const springVx = g.springSpeed * Math.cos(g.springAngle);
  const springVy = g.springSpeed * Math.sin(g.springAngle);
  const timeToBell = (g.bell.x - bounce.x) / springVx;
  if (timeToBell <= 0 || timeToBell > 1.7) {
    miss(bounce, springVx, springVy);
    return { result: 'bell', trace };
  }
  const arrival = flight(bounce, springVx, springVy, timeToBell, 40);
  return { result: Math.abs(arrival.y - g.bell.y) <= 14 ? 'success' : 'bell', trace };
}

export function reduceMarbleState(state: MarbleState, move: ActivityMove): MarbleState {
  if (isMarbleSolved(state)) return state;
  if (!Number.isInteger(move.control) || move.control < 0 || move.control > 3) return state;
  if (move.command === 'launch' && move.value === undefined) {
    if (state.runs >= 100000) return state;
    return { ...state, ...simulateMarble(state.pieces), runs: state.runs + 1 };
  }
  const current = state.pieces[move.control];
  let replacement: MarblePiece;
  if (move.command === 'height' && Number.isInteger(move.value) && move.value! >= 0 && move.value! < MARBLE_RAILS[move.control].length) {
    replacement = { ...current, cell: MARBLE_RAILS[move.control][move.value!] };
  } else if (move.command === 'tension' && move.control === 2 && (move.value === 0 || move.value === 1)) {
    replacement = { ...current, rotation: move.value };
  } else return state;
  if (replacement.cell === current.cell && replacement.rotation === current.rotation) return state;
  const pieces = [...state.pieces] as MarbleState['pieces'];
  pieces[move.control] = replacement;
  return { ...state, pieces, result: 'ready', trace: [] };
}

/** Earned success is latched by the reducer; a remote flag alone is not proof. */
export function isMarbleSolved(state: MarbleState): boolean {
  return state.runs > 0 && state.result === 'success' && marbleStateSchema.safeParse(state).success && simulateMarble(state.pieces).result === 'success';
}

export const MARBLE_FEEDBACK: Record<MarbleState['result'], string> = {
  ready: 'The machine is built. Adjust your part, then follow a test marble.',
  missing: 'A part is missing. Start a fresh chapter to restore the machine.',
  ramp: 'The marble missed the ramp. Its owner can adjust the start height.',
  catcher: 'The first jump missed. Adjust the ramp or funnel height together.',
  spring: 'The funnel caught it! Now line up the spring with the next drop.',
  bell: 'It bounced! Adjust the bell’s height, or try the other spring tension.',
  success: 'Ding! Four parts, one working machine.',
};

export function marbleSummary(state: MarbleState, ownedSlots: number[]): string[] {
  return [`Goal: pass the marble from ramp to funnel to spring to bell. ${MARBLE_FEEDBACK[state.result]}`,
    `You control: ${ownedSlots.map(slot => MARBLE_NAMES[slot]).join(', ')}.`,
    ...state.pieces.map((piece, index) => `${MARBLE_NAMES[index]}: rail stop ${marbleRailStop(state, index) + 1} from the top${index === 2 ? `; ${MARBLE_TENSIONS[piece.rotation].toLowerCase()} tension` : ''}.`),
    'Raise or lower only the parts you own. The spring also has two tension settings. Watch the visible test trail; several settings work.'];
}

/** Reproducible QA fixture only. Gameplay evaluates the simulated trajectory. */
export const MARBLE_SOLUTION_MOVES: ActivityMove[] = [
  { control: 0, command: 'height', value: 0 }, { control: 1, command: 'height', value: 0 },
  { control: 2, command: 'height', value: 0 }, { control: 3, command: 'height', value: 1 },
  { control: 0, command: 'launch' },
];

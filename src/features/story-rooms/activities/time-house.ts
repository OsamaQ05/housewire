import { z } from 'zod';
import type { ActivityMove } from './contracts';

export const timeHouseStateSchema = z.object({
  kind: z.literal('time-house'), shutter: z.number().int().min(0).max(2), planter: z.number().int().min(0).max(2),
  pinFound: z.boolean(), catchReleased: z.boolean(), doorOpen: z.boolean(),
  event: z.enum(['start', 'shutter', 'planter', 'dark-wall', 'pin', 'need-pin', 'released', 'roots', 'latched', 'opened']),
}).strict().refine(state => (!state.catchReleased || state.pinFound)
  && (!state.doorOpen || state.catchReleased && state.planter !== 0), { message: 'The doorway cannot open before its obstacles are removed.' });
export type TimeHouseState = z.infer<typeof timeHouseStateSchema>;
export function createTimeHouseState(): TimeHouseState { return { kind: 'time-house', shutter: 0, planter: 0, pinFound: false, catchReleased: false, doorOpen: false, event: 'start' }; }
export function timeHouseLightVisible(state: TimeHouseState) { return state.shutter === 2 && state.planter !== 1; }
export function isTimeHouseSolved(state: TimeHouseState) { return state.doorOpen; }
export function reduceTimeHouseState(state: TimeHouseState, move: ActivityMove): TimeHouseState {
  if (isTimeHouseSolved(state) || !Number.isInteger(move.control)) return state;
  const { control, command, value } = move;
  if (control === 0 && command === 'set-shutter' && Number.isInteger(value) && value! >= 0 && value! <= 2 && value !== state.shutter) return { ...state, shutter: value!, event: 'shutter' };
  if (control === 2 && command === 'move-planter' && Number.isInteger(value) && value! >= 0 && value! <= 2 && value !== state.planter) return { ...state, planter: value!, event: 'planter' };
  if (value !== undefined) return state;
  if (control === 1 && command === 'search-wall' && !state.pinFound) return { ...state, pinFound: timeHouseLightVisible(state), event: timeHouseLightVisible(state) ? 'pin' : 'dark-wall' };
  if (control === 3 && command === 'release-catch' && !state.catchReleased) return { ...state, catchReleased: state.pinFound, event: state.pinFound ? 'released' : 'need-pin' };
  if (control === 3 && command === 'open-door') return { ...state, doorOpen: state.catchReleased && state.planter !== 0, event: !state.catchReleased ? 'latched' : state.planter === 0 ? 'roots' : 'opened' };
  return state;
}
export const TIME_HOUSE_EVENTS: Record<TimeHouseState['event'], string> = {
  start: 'The courtyard exists in two times. Changes in the old house appear in the house today.',
  shutter: 'The old shutter moves. Ask the people in the present what changed in their light.',
  planter: 'The young plant has moved. Its grown roots now follow a different path in the present.',
  'dark-wall': 'You feel smooth stone. The wall is too dark to spot anything small.',
  pin: 'In the daylight, a brass pin glints in a crack. You pass it to the door keeper.',
  'need-pin': 'The narrow catch needs a thin pin. Someone near the wall may find one.',
  released: 'The old catch slides free. The door can move, if nothing is blocking it.',
  roots: 'The catch is free, but thick roots still cross the doorway. Where did this plant begin?',
  latched: 'The wooden door is still held by its small catch.',
  opened: 'The passage opens. Warm roof-garden light floods into both versions of the courtyard.',
};
export function timeHouseSummary(state: TimeHouseState, ownedSlots: number[]): string[] {
  const seesPast = ownedSlots.some(slot => slot === 0 || slot === 2);
  const seesPresent = ownedSlots.some(slot => slot === 1 || slot === 3);
  return [TIME_HOUSE_EVENTS[state.event],
    ...(seesPast ? [`Old courtyard: shutter is ${['closed', 'half open', 'wide open'][state.shutter]}; young plant is ${['by the door', 'under the window', 'at the courtyard edge'][state.planter]}.`] : []),
    ...(seesPresent ? [`Present courtyard: ${timeHouseLightVisible(state) ? 'light reaches the wall' : 'wall is shaded'}; ${state.planter === 0 ? 'roots block the door' : 'doorway is clear'}; ${state.catchReleased ? 'catch is released' : 'catch is fastened'}.`] : []),
    `This player operates: ${ownedSlots.map(slot => ['past shutter', 'present wall', 'past planter', 'present door'][slot]).join(', ')}.`];
}
export const TIME_HOUSE_SOLUTION: ActivityMove[] = [
  { control: 0, command: 'set-shutter', value: 2 }, { control: 2, command: 'move-planter', value: 2 },
  { control: 1, command: 'search-wall' }, { control: 3, command: 'release-catch' }, { control: 3, command: 'open-door' },
];

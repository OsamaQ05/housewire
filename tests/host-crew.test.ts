import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { prepareHostCrew } from '../src/features/session/host-crew';
import type { CrewNode, HouseRoom } from '../src/store/use-housewire-store';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) },
}));

function player(id: string, name: string, overrides: Partial<CrewNode> = {}): CrewNode {
  return {
    id, name, initials: 'QA', nodeNumber: 3, role: 'navigator', roomId: 'kitchen',
    color: '#F4C85A', connected: false, simulated: false, ...overrides,
  };
}

const rooms = [{ id: 'living' }, { id: 'kitchen' }] as const;
const staleCrew = () => [
  player('local', 'Previous host'),
  player('guest-self', 'Host QA'),
  player('guest-old', 'Old guest'),
  player('simulated-1', 'Demo guest', { simulated: true }),
];

describe('a new host starts with this phone’s identity only', () => {
  it('promotes the current guest without borrowing the previous host’s name', () => {
    expect(prepareHostCrew(staleCrew(), 'guest-self', rooms)).toEqual([{
      id: 'local', name: 'Host QA', initials: 'QA', nodeNumber: 1, role: 'relay',
      roomId: 'kitchen', color: '#FF603B', connected: true, simulated: false,
    }]);
  });

  it('keeps a current host’s profile but removes every retained guest', () => {
    const crew = [player('local', 'Osama', { initials: 'O' }), ...staleCrew().slice(1)];
    expect(prepareHostCrew(crew, 'local', rooms)).toEqual([
      expect.objectContaining({ id: 'local', name: 'Osama', initials: 'O' }),
    ]);
  });

  it('does not impersonate a stale host when the local identity is missing', () => {
    expect(prepareHostCrew(staleCrew(), 'missing-phone', rooms)).toEqual([
      expect.objectContaining({ id: 'local', name: 'You', roomId: 'living', simulated: false }),
    ]);
  });

  it('does not promote a simulated player into a real host', () => {
    expect(prepareHostCrew(staleCrew(), 'simulated-1', rooms)).toEqual([
      expect.objectContaining({ id: 'local', name: 'You', connected: true, simulated: false }),
    ]);
  });

  it('moves an unavailable station to the first chosen room', () => {
    const crew = [player('guest-self', 'Host QA', { roomId: 'old-house' })];
    expect(prepareHostCrew(crew, 'guest-self', rooms)[0].roomId).toBe('living');
  });

  it('uses a safe default when no rooms or players remain', () => {
    expect(prepareHostCrew([], 'missing-phone', [])).toEqual([
      expect.objectContaining({ id: 'local', name: 'You', roomId: 'living' }),
    ]);
  });

  it('does not mutate the prior session’s frozen roster', () => {
    const crew = Object.freeze(staleCrew().map(node => Object.freeze(node)));
    const before = JSON.stringify(crew);
    const next = prepareHostCrew(crew, 'guest-self', rooms);
    expect(JSON.stringify(crew)).toBe(before);
    expect(next[0]).not.toBe(crew[1]);
  });
});

const houseModule = import('../src/store/use-housewire-store');
let house: Awaited<typeof houseModule>['useHousewireStore'];

describe('fresh hosting is an atomic session transition', () => {
  beforeAll(async () => {
    house = (await houseModule).useHousewireStore;
    await vi.waitFor(() => expect(house.getState().hydrated).toBe(true));
  });

  beforeEach(() => {
    house.getState().resetProduct();
    house.getState().setCrew(staleCrew());
    house.getState().setLocalNodeId('guest-self');
  });

  it('publishes the new code, local identity and clean host roster in one change', () => {
    const observed: { id: string; crew: string[]; names: string[]; code: string | null }[] = [];
    const unsubscribe = house.subscribe(state => observed.push({
      id: state.localNodeId, crew: state.crew.map(node => node.id),
      names: state.crew.map(node => node.name), code: state.sessionCode,
    }));
    house.getState().prepareSession('lan', undefined, 'ws://192.168.1.5:8787');
    unsubscribe();

    expect(observed).toEqual([{
      id: 'local', crew: ['local'], names: ['Host QA'], code: expect.stringMatching(/^[A-Z2-9]{5}$/),
    }]);
    expect(house.getState()).toMatchObject({ sessionMode: 'lan', relayUrl: 'ws://192.168.1.5:8787' });
  });

  it('does not turn an explicitly joining guest into a host', () => {
    const original = house.getState().crew;
    house.getState().prepareSession('lan', 'ABCDE', 'ws://192.168.1.5:8787');
    expect(house.getState()).toMatchObject({ localNodeId: 'guest-self', sessionCode: 'ABCDE' });
    expect(house.getState().crew).toBe(original);
  });

  it('leaves preview setup identities unchanged', () => {
    const original = house.getState().crew;
    house.getState().prepareSession('preview');
    expect(house.getState().localNodeId).toBe('guest-self');
    expect(house.getState().crew).toBe(original);
  });

  it('assigns a fresh host only to a selected safe room', () => {
    const customRooms: HouseRoom[] = [
      { id: 'kitchen', label: 'Kitchen', kind: 'kitchen', safe: false, x: 0, y: 0 },
      { id: 'study', label: 'Study', kind: 'study', safe: true, x: 1, y: 0 },
    ];
    house.getState().setRooms(customRooms);
    house.getState().prepareSession('lan');
    expect(house.getState().crew).toEqual([
      expect.objectContaining({ id: 'local', name: 'Host QA', roomId: 'study' }),
    ]);
  });
});

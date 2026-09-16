import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { countsForBoard, leaderboard } from '../src/features/family-club/model';
import type { CrewNode, MissionResult } from '../src/store/use-housewire-store';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) },
}));

const houseModule = import('../src/store/use-housewire-store');
const clubModule = import('../src/store/use-family-club-store');
let house: Awaited<typeof houseModule>['useHousewireStore'];
let club: Awaited<typeof clubModule>['useFamilyClubStore'];

function member(id: string, name: string, simulated = false): CrewNode {
  return { id, name, initials: name.slice(0, 2), nodeNumber: 1, role: 'relay', roomId: 'living', color: '#F36D44', connected: true, simulated };
}
const finish = (routeSeed = 90210): MissionResult => ({
  missionId: 'line-13', completedAt: '2026-09-15T17:00:00.000Z', durationSeconds: 640,
  retries: 2, routeSeed, events: ['The warning is repaired.', 'The exit opens.'],
});

describe('authored story completion uses the frozen case roster', () => {
  beforeAll(async () => {
    house = (await houseModule).useHousewireStore;
    club = (await clubModule).useFamilyClubStore;
    await vi.waitFor(() => expect(house.getState().hydrated && club.getState().hydrated).toBe(true));
  });
  beforeEach(() => {
    house.getState().resetProduct();
    house.getState().setCrew([member('outsider', 'Not in this case'), member('old-guest', 'Previous guest')]);
    house.getState().prepareSession('lan', 'FAMILY');
    club.setState({ members: [], games: [], storageError: false });
  });

  it('credits only supplied players, never unrelated current house crew', () => {
    const frozen = Object.freeze([Object.freeze(member('osama', 'Osama')), Object.freeze(member('feras', 'Feras'))]);
    house.getState().startMission();
    house.getState().updateMissionProgress(3, 2);
    house.getState().completeMission(finish(), frozen);

    expect(club.getState().games).toHaveLength(1);
    expect(club.getState().games[0].participants.map(player => player.name)).toEqual(['Osama', 'Feras']);
    expect(leaderboard(club.getState()).map(row => [row.member.name, row.games, row.wins, row.escapes])).toEqual([
      ['Feras', 1, 1, 1], ['Osama', 1, 1, 1],
    ]);
    expect(house.getState().crew.map(player => player.name)).toEqual(['Not in this case', 'Previous guest']);
    expect(house.getState()).toMatchObject({ missionStartedAt: null, missionInProgressId: null, missionStageIndex: 0, missionRetries: 0 });
    expect(house.getState().results[0]).toEqual(finish());
  });

  it('does not fall back to unrelated crew when an explicit roster is empty', () => {
    house.getState().completeMission(finish(), []);
    expect(club.getState().games[0].participants).toEqual([]);
    expect(countsForBoard(club.getState().games[0])).toBe(false);
    expect(leaderboard(club.getState())).toEqual([]);
  });

  it('retains compatibility for older callers that do not supply a roster', () => {
    house.getState().completeMission(finish());
    expect(club.getState().games[0].participants.map(player => player.name)).toEqual(['Not in this case', 'Previous guest']);
  });

  it('preserves a rehearsal in history without awarding live-game stats', () => {
    house.getState().prepareSession('preview');
    house.getState().completeMission(finish(), [member('osama', 'Osama'), member('practice-player', 'Partner', true)]);

    const record = club.getState().games[0];
    expect(record.practice).toBe(true);
    expect(record.participants.map(player => player.name)).toEqual(['Osama']);
    expect(countsForBoard(record)).toBe(false);
    expect(leaderboard(club.getState()).every(row => row.games === 0 && row.wins === 0 && row.escapes === 0)).toBe(true);
    expect(house.getState().results).toHaveLength(1);
  });

  it('credits a later live finish without importing practice points', () => {
    const frozen = [member('osama', 'Osama'), member('feras', 'Feras')];
    house.getState().prepareSession('preview');
    house.getState().completeMission(finish(1), frozen);
    house.getState().prepareSession('lan', 'FAMILY');
    house.getState().completeMission(finish(2), frozen);

    expect(club.getState().games).toHaveLength(2);
    expect(club.getState().games.filter(countsForBoard)).toHaveLength(1);
    expect(leaderboard(club.getState()).every(row => row.games === 1 && row.wins === 1 && row.escapes === 1)).toBe(true);
  });

  it('uses explicit rehearsal status when the cloud setting has no live session', () => {
    // HousewireSessionProvider only enables live play for LAN + a room code.
    // A cloud setting can therefore render the one-phone story rehearsal.
    house.getState().prepareSession('cloud');
    house.getState().completeMission(finish(), [member('osama', 'Osama')], true);

    const record = club.getState().games[0];
    expect(record.practice).toBe(true);
    expect(record.participants.map(player => player.name)).toEqual(['Osama']);
    expect(countsForBoard(record)).toBe(false);
    expect(leaderboard(club.getState()).every(row => row.wins === 0 && row.games === 0)).toBe(true);
  });

  it('respects the actual live result when the mutable settings have since changed', () => {
    house.getState().prepareSession('preview');
    house.getState().completeMission(finish(), [member('osama', 'Osama'), member('feras', 'Feras')], false);

    const record = club.getState().games[0];
    expect(record.practice).toBe(false);
    expect(record.participants.map(player => player.name)).toEqual(['Osama', 'Feras']);
    expect(leaderboard(club.getState()).every(row => row.wins === 1 && row.games === 1)).toBe(true);
  });

  it('cannot award another win when the same result is revisited with changed crew', () => {
    const result = finish();
    house.getState().completeMission(result, [member('osama', 'Osama'), member('feras', 'Feras')]);
    house.getState().setCrew([member('visitor', 'Late visitor')]);
    house.getState().completeMission(result, [member('visitor', 'Late visitor')]);

    expect(club.getState().games).toHaveLength(1);
    expect(club.getState().games[0].participants.map(player => player.name)).toEqual(['Osama', 'Feras']);
    expect(leaderboard(club.getState()).every(row => row.games === 1 && row.wins === 1)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { createJudgeCutCrew } from '../src/features/demo/judge-cut';
import { useHousewireStore, type HouseRoom } from '../src/store/use-housewire-store';

const rooms: HouseRoom[] = [
  { id: 'living', label: 'Living', kind: 'living', safe: true, x: 0, y: 0 },
  { id: 'hall', label: 'Hall', kind: 'hall', safe: false, x: 40, y: 20 },
  { id: 'kitchen', label: 'Kitchen', kind: 'kitchen', safe: true, x: 60, y: 50 },
];

describe('judge cut crew', () => {
  it('uses only safe rooms and marks every remote station as simulated', () => {
    const crew = createJudgeCutCrew(rooms);
    expect(crew.map((node) => node.roomId)).toEqual(['living', 'kitchen']);
    expect(crew[0]).toMatchObject({ id: 'local', simulated: false });
    expect(crew.slice(1).every((node) => node.simulated)).toBe(true);
  });
});

describe('solo mission progress', () => {
  it('persists bounded stage progress and clears it for a new session', () => {
    const store = useHousewireStore.getState();
    store.startMission();
    useHousewireStore.getState().updateMissionProgress(3, 4);
    expect(useHousewireStore.getState()).toMatchObject({ missionStageIndex: 3, missionRetries: 4 });

    useHousewireStore.getState().prepareSession('preview', 'CUT13');
    expect(useHousewireStore.getState()).toMatchObject({ missionStageIndex: 0, missionRetries: 0 });
  });
});

import {
  useHousewireStore,
  type CrewNode,
  type HouseRoom,
  type RoleId,
} from '../../store/use-housewire-store';

const CUT_ROLES: readonly RoleId[] = ['relay', 'listener', 'navigator', 'breaker'];
const CUT_COLORS: Readonly<Record<RoleId, string>> = {
  relay: '#FF603B',
  listener: '#65CFE2',
  navigator: '#F4C85A',
  breaker: '#B7A5EE',
};
const CUT_NAMES = ['You', 'Mara', 'Samir', 'Inez'] as const;

export const JUDGE_CUT_CODE = 'CUT13';

export function createJudgeCutCrew(rooms: readonly HouseRoom[]): CrewNode[] {
  return rooms
    .filter((room) => room.safe)
    .slice(0, 4)
    .map((room, index) => {
      const role = CUT_ROLES[index] ?? 'breaker';
      const name = CUT_NAMES[index] ?? `Node ${index + 1}`;
      return {
        id: index === 0 ? 'local' : `simulated-${index + 1}`,
        color: CUT_COLORS[role],
        connected: true,
        initials: index === 0 ? 'YOU' : name.slice(0, 2).toUpperCase(),
        name,
        nodeNumber: index + 1,
        role,
        roomId: room.id,
        simulated: index > 0,
      };
    });
}

/**
 * Arms an honest one-phone cut at the first interdependent puzzle. Remote
 * stations remain visibly simulated; this only removes setup from a judge demo.
 */
export function prepareJudgeCut(): void {
  let state = useHousewireStore.getState();
  if (state.rooms.filter((room) => room.safe).length < 2) {
    state.seedHouse();
    state = useHousewireStore.getState();
  }

  state.finishOnboarding();
  state.selectMission('line-13');
  state.setLocalNodeId('local');
  state.setCrew(createJudgeCutCrew(state.rooms));
  state.prepareSession('preview', JUDGE_CUT_CODE);
  useHousewireStore.getState().startMission();
}

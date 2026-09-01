import { deriveLanRelayUrl } from '@/src/features/session';
import { useHousewireStore, type CrewNode } from '@/src/store/use-housewire-store';

export function prepareLiveForgeHost(): { code: string; relayUrl: string } {
  const state = useHousewireStore.getState();
  const currentLocal = state.crew.find((node) => node.id === 'local');
  const safeRoom = state.rooms.find((room) => room.safe) ?? state.rooms[0];
  const host: CrewNode = currentLocal
    ? { ...currentLocal, connected: true, nodeNumber: 1, simulated: false }
    : {
        id: 'local',
        name: 'You',
        initials: 'YOU',
        nodeNumber: 1,
        role: 'relay',
        roomId: safeRoom?.id ?? 'living',
        color: '#FFD84A',
        connected: true,
        simulated: false,
      };
  state.setCrew([host]);
  state.setLocalNodeId('local');
  state.prepareSession('lan', undefined, deriveLanRelayUrl());
  const next = useHousewireStore.getState();
  if (!next.sessionCode) throw new Error('The live case room could not be created.');
  return { code: next.sessionCode, relayUrl: next.relayUrl ?? deriveLanRelayUrl() };
}

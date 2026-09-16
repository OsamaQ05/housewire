import type { CrewNode } from '../../store/use-housewire-store';

/** A new host room keeps this phone's identity, never the previous room's crew. */
export function prepareHostCrew(
  crew: readonly CrewNode[],
  localNodeId: string,
  rooms: readonly { id: string }[],
): CrewNode[] {
  const current = crew.find((node) => node.id === localNodeId && !node.simulated);
  return [{
    id: 'local',
    name: current?.name || 'You',
    initials: current?.initials || 'YOU',
    nodeNumber: 1,
    role: 'relay',
    roomId: rooms.some((room) => room.id === current?.roomId)
      ? current!.roomId
      : rooms[0]?.id ?? 'living',
    color: '#FF603B',
    connected: true,
    simulated: false,
  }];
}

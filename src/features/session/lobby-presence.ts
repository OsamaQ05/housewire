import type { CrewNode, RoleId } from '@/src/store/use-housewire-store';

import { MAXIMUM_SESSION_NODES, type LobbyCommandEvent, type LobbyProfileEvent } from './protocol';
import { isServerTimestampFresh } from './server-clock';

export const LOBBY_HEARTBEAT_INTERVAL_MS = 6_000;
export const LOBBY_PRESENCE_TIMEOUT_MS = 20_000;
export const LOBBY_COMMAND_MAX_AGE_MS = 15_000;

export const LOBBY_ROLE_ORDER: readonly RoleId[] = ['relay', 'listener', 'navigator', 'breaker'];

export const LOBBY_ROLE_COLORS: Readonly<Record<RoleId, string>> = {
  relay: '#FF603B',
  listener: '#65CFE2',
  navigator: '#F4C85A',
  breaker: '#B7A5EE',
};

/**
 * Assigns stable lobby stations without manufacturing connectivity. A node's
 * connected flag is evidence supplied by the relay presence reconciler and
 * must survive layout normalisation.
 */
export function normaliseLiveCrew(nodes: readonly CrewNode[], rooms: readonly { id: string }[]): CrewNode[] {
  const byId = new Map(nodes.filter((node) => !node.simulated).map((node) => [node.id, node]));
  return [...byId.values()]
    .sort((left, right) => {
      if (left.id === 'local') return -1;
      if (right.id === 'local') return 1;
      if (left.connected !== right.connected) return left.connected ? -1 : 1;
      return left.id.localeCompare(right.id);
    })
    .slice(0, 4)
    .map((node, index) => {
      const role = LOBBY_ROLE_ORDER[index] ?? 'relay';
      return {
        ...node,
        color: LOBBY_ROLE_COLORS[role],
        connected: node.connected,
        nodeNumber: index + 1,
        role,
        roomId: rooms[index % Math.max(1, rooms.length)]?.id ?? node.roomId,
        simulated: false,
      };
    });
}

/**
 * Reconciles retained lobby entries against timestamps authored by the relay.
 * Offline nodes remain in the register but cannot masquerade as live phones.
 * Returns the input array when no flag changes, avoiding persistence writes on
 * every expiry tick.
 */
export function reconcileLobbyCrewPresence(
  nodes: readonly CrewNode[],
  lastSeenAtServerByNodeId: ReadonlyMap<string, number>,
  serverNow: number,
  maximumAgeMs = LOBBY_PRESENCE_TIMEOUT_MS,
): readonly CrewNode[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.simulated) return node;
    const lastSeenAtServer = lastSeenAtServerByNodeId.get(node.id);
    const connected =
      lastSeenAtServer !== undefined && isServerTimestampFresh(lastSeenAtServer, serverNow, maximumAgeMs);
    if (connected === node.connected) return node;
    changed = true;
    return { ...node, connected };
  });
  return changed ? next : nodes;
}

/**
 * Accepts profile data only when the relay-authenticated sender owns the node
 * id. Connectivity and simulation state are derived locally, never trusted
 * from a peer payload.
 */
export function mergeLobbyCrewProfile(
  nodes: readonly CrewNode[],
  profile: LobbyProfileEvent,
  senderId: string,
): readonly CrewNode[] {
  if (senderId !== profile.nodeId) return nodes;

  const existingIndex = nodes.findIndex((node) => node.id === profile.nodeId);
  if (existingIndex < 0) {
    return [
      ...nodes,
      {
        id: profile.nodeId,
        name: profile.name,
        initials: initialsFor(profile.name),
        nodeNumber: MAXIMUM_SESSION_NODES,
        role: 'breaker',
        roomId: 'unassigned',
        color: LOBBY_ROLE_COLORS.breaker,
        connected: true,
        simulated: false,
      },
    ];
  }

  const existing = nodes[existingIndex];
  const connectedNode: CrewNode = {
    ...existing,
    name: profile.name,
    initials: initialsFor(profile.name),
    connected: true,
    simulated: false,
  };
  if (
    !existing.simulated &&
    existing.connected &&
    existing.name === connectedNode.name &&
    existing.initials === connectedNode.initials
  ) {
    return nodes;
  }

  const next = [...nodes];
  next[existingIndex] = connectedNode;
  return next;
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'N';
}

/** Rejects spoofed hosts and stale commands replayed from relay history. */
export function isTrustedLobbyCommand(
  event: LobbyCommandEvent,
  senderId: string,
  expectedHostNodeId: string,
  commandServerTime: number,
  serverNow: number,
  maximumAgeMs = LOBBY_COMMAND_MAX_AGE_MS,
): boolean {
  return (
    event.hostNodeId === senderId &&
    senderId === expectedHostNodeId &&
    isServerTimestampFresh(commandServerTime, serverNow, maximumAgeMs)
  );
}

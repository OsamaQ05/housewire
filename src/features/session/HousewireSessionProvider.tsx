import { createContext, useContext, useMemo, useRef, type PropsWithChildren } from 'react';

import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useConnectionSettingsStore } from '@/src/store/use-connection-settings-store';

import type { SessionNode } from './protocol';
import { deriveLanRelayUrl, useHousewireSession } from './use-housewire-session';

export type HousewireSessionContextValue = ReturnType<typeof useHousewireSession> & {
  enabled: boolean;
  hostNodeId?: string;
  isHost: boolean;
  localNodeId: string;
  liveNodeIds: readonly string[];
  node: SessionNode;
  sessionId: string;
};

const HousewireSessionContext = createContext<HousewireSessionContextValue | null>(null);

export function HousewireSessionProvider({ children }: PropsWithChildren) {
  const sessionMode = useHousewireStore((state) => state.sessionMode);
  const sessionCode = useHousewireStore((state) => state.sessionCode);
  const relayUrl = useHousewireStore((state) => state.relayUrl);
  const relayOverride = useConnectionSettingsStore((state) => state.relayUrl);
  const localNodeId = useHousewireStore((state) => state.localNodeId);
  const crew = useHousewireStore((state) => state.crew);
  const localCrewNode = crew.find((node) => node.id === localNodeId);
  const joinedAtRef = useRef({ nodeId: localNodeId, value: Date.now() });
  if (joinedAtRef.current.nodeId !== localNodeId) {
    joinedAtRef.current = { nodeId: localNodeId, value: Date.now() };
  }
  const joinedAt = joinedAtRef.current.value;
  const enabled = sessionMode === 'lan' && Boolean(sessionCode);
  const node = useMemo<SessionNode>(
    () => ({
      id: localNodeId,
      joinedAt,
      label: localCrewNode?.name ?? (localNodeId === 'local' ? 'Host' : 'Node'),
      nodeNumber: localCrewNode?.nodeNumber ?? (localNodeId === 'local' ? 1 : 2),
      simulated: false,
    }),
    [joinedAt, localCrewNode?.name, localCrewNode?.nodeNumber, localNodeId],
  );
  const session = useHousewireSession({
    enabled,
    node,
    relayUrl: relayUrl ?? (relayOverride || deriveLanRelayUrl()),
    sessionId: sessionCode ?? 'inactive',
  });
  const isHost = localNodeId === 'local';
  const liveNodes = useMemo(() => {
    const byId = new Map(session.peers.map((peer) => [peer.id, peer]));
    byId.set(node.id, node);
    return [...byId.values()]
      .sort((left, right) => left.nodeNumber - right.nodeNumber || left.id.localeCompare(right.id))
      .slice(0, 4);
  }, [node, session.peers]);
  const hostNodeId = isHost
    ? localNodeId
    : liveNodes.find((peer) => peer.id === 'local' || peer.nodeNumber === 1)?.id;
  const value = useMemo(
    () => ({
      ...session,
      enabled,
      hostNodeId,
      isHost,
      localNodeId,
      liveNodeIds: liveNodes.map((peer) => peer.id).sort((left, right) => left.localeCompare(right)),
      node,
      sessionId: sessionCode ?? 'inactive',
    }),
    [enabled, hostNodeId, isHost, liveNodes, localNodeId, node, session, sessionCode],
  );

  return <HousewireSessionContext.Provider value={value}>{children}</HousewireSessionContext.Provider>;
}

export function useHousewireSessionContext(): HousewireSessionContextValue {
  const value = useContext(HousewireSessionContext);
  if (!value) throw new Error('useHousewireSessionContext must be used inside HousewireSessionProvider.');
  return value;
}

import Constants from 'expo-constants';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { LanWebSocketTransport } from '@/src/services/transport';
import type {
  DirectDeliveryAck,
  TransportConnectionState,
  TransportDirectFrame,
  TransportFrame,
} from '@/src/services/transport';

import {
  housewireSessionEventSchema,
  MAXIMUM_SESSION_FEED,
  type HousewireSessionEvent,
  type SessionNode,
} from './protocol';
import { LOBBY_PRESENCE_TIMEOUT_MS } from './lobby-presence';
import { resolveLanRelayUrl } from './join-room';
import { ReliableSessionOutbox } from './reliable-outbox';
import { RelayResumeVault } from './relay-resume-vault';
import { createRelayId } from './relay-id';
import {
  advanceServerClockAnchor,
  estimateServerNow,
  isServerTimestampFresh,
  type ServerClockAnchor,
} from './server-clock';

export interface HousewireSessionOptions {
  enabled: boolean;
  sessionId: string;
  relayUrl: string;
  node: SessionNode;
}

export interface SessionFeedItem {
  event: HousewireSessionEvent;
  eventId: string;
  senderId: string;
  sequence: number;
  serverTime: number;
}

export interface SessionPublishOptions {
  eventId?: string;
}

export interface SessionReliablePublishOptions {
  eventId: string;
}

export interface SessionDirectFeedItem {
  messageId: string;
  payload: unknown;
  recipientId: string;
  senderId: string;
  serverTime: number;
}

export type SessionDirectListener = (item: SessionDirectFeedItem) => void;

const SAFE_EVENT_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const PEER_STALE_AFTER_MS = LOBBY_PRESENCE_TIMEOUT_MS;
const MAXIMUM_DIRECT_SESSION_FEED = 32;

export function deriveLanRelayUrl(): string {
  return resolveLanRelayUrl({
    explicit: process.env.EXPO_PUBLIC_HOUSEWIRE_RELAY_URL,
    expoHostUri: Constants.expoConfig?.hostUri,
    expoDebuggerHost: Constants.expoGoConfig?.debuggerHost,
    webHostname:
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.hostname
        : undefined,
  });
}

export function useHousewireSession(options: HousewireSessionOptions) {
  const transportRef = useRef<LanWebSocketTransport<HousewireSessionEvent, unknown> | null>(null);
  const directListenersRef = useRef(new Set<SessionDirectListener>());
  const seenEventIdsRef = useRef(new Set<string>());
  const reliableOutboxRef = useRef(new ReliableSessionOutbox<HousewireSessionEvent>());
  const flushingOutboxRef = useRef(false);
  const serverClockAnchorRef = useRef<ServerClockAnchor | undefined>(undefined);
  // Private to this provider lifetime. Credentials never enter Zustand,
  // session events, race snapshots, logs, or QR join tickets.
  const resumeVaultRef = useRef(new RelayResumeVault());
  const [connectionState, setConnectionState] = useState<TransportConnectionState>('idle');
  const [feed, setFeed] = useState<SessionFeedItem[]>([]);
  const [directFeed, setDirectFeed] = useState<SessionDirectFeedItem[]>([]);
  const [peers, setPeers] = useState<SessionNode[]>([]);
  const [error, setError] = useState<string>();
  const [connectionGeneration, setConnectionGeneration] = useState(0);

  const flushReliableOutbox = useCallback(async () => {
    const transport = transportRef.current;
    if (!transport || transport.state !== 'connected' || flushingOutboxRef.current) return;
    flushingOutboxRef.current = true;
    try {
      for (const attempt of reliableOutboxRef.current.takeDue(Date.now())) {
        try {
          await transport.publish(attempt.event, {
            eventId: attempt.transportEventId,
            clientSentAt: Date.now(),
          });
        } catch {
          reliableOutboxRef.current.expedite(attempt.logicalEventId);
        }
      }
    } finally {
      flushingOutboxRef.current = false;
    }
  }, []);

  const stableNode = useMemo(
    () => ({
      id: options.node.id,
      joinedAt: options.node.joinedAt,
      label: options.node.label,
      nodeNumber: options.node.nodeNumber,
      simulated: options.node.simulated,
    }),
    [options.node.id, options.node.joinedAt, options.node.label, options.node.nodeNumber, options.node.simulated],
  );
  const presenceNodeRef = useRef(stableNode);
  presenceNodeRef.current = stableNode;
  const announcedNodeSignatureRef = useRef('');

  useEffect(() => {
    seenEventIdsRef.current.clear();
    reliableOutboxRef.current.clear();
    serverClockAnchorRef.current = undefined;
    announcedNodeSignatureRef.current = '';
    setFeed([]);
    setDirectFeed([]);
    setPeers([]);
    setError(undefined);
    if (!options.enabled || !options.sessionId || !options.relayUrl) {
      setConnectionState('idle');
      return;
    }

    const role = stableNode.id === 'local' ? 'host' : 'guest';
    const resumeIdentity = {
      clientId: stableNode.id,
      relayUrl: options.relayUrl,
      role,
      sessionId: options.sessionId,
    } as const;
    const transport = new LanWebSocketTransport<HousewireSessionEvent, unknown>({
      clientId: stableNode.id,
      onResumeCredentials: (credentials) => resumeVaultRef.current.write(resumeIdentity, credentials),
      reconnect: true,
      resumeCredentials: resumeVaultRef.current.read(resumeIdentity),
      role,
      sessionId: options.sessionId,
      url: options.relayUrl,
    });
    transportRef.current = transport;
    const clientId = stableNode.id;
    let disposed = false;

    const publishPresence = async () => {
      const currentNode = presenceNodeRef.current;
      announcedNodeSignatureRef.current = sessionNodeSignature(currentNode);
      await transport.publish(
        { kind: 'presence', node: { ...currentNode, joinedAt: Date.now() } },
        { eventId: createRelayId('presence'), clientSentAt: Date.now() },
      );
    };

    const unsubscribeState = transport.subscribeState((state) => {
      if (!disposed) {
        setConnectionState(state);
        if (state === 'connected') {
          setError(undefined);
          void publishPresence();
          transport.ping(createRelayId('ping'));
          void flushReliableOutbox();
        } else if (state === 'error') {
          setError(transport.lastError?.message ?? 'The house relay connection failed.');
        }
      }
    });
    const unsubscribeFrames = transport.subscribe((frame: TransportFrame<HousewireSessionEvent>) => {
      const receivedAt = Date.now();
      serverClockAnchorRef.current = advanceServerClockAnchor(
        serverClockAnchorRef.current,
        frame.serverTime,
        receivedAt,
      );
      const parsed = housewireSessionEventSchema.safeParse(frame.payload);
      if (!parsed.success || disposed) return;
      if (frame.senderId === clientId) reliableOutboxRef.current.acknowledge(frame.eventId);
      if (seenEventIdsRef.current.has(frame.eventId)) return;
      if (parsed.data.kind === 'presence' && parsed.data.node.id !== frame.senderId) return;
      seenEventIdsRef.current.add(frame.eventId);
      const item: SessionFeedItem = {
        event: parsed.data,
        eventId: frame.eventId,
        senderId: frame.senderId,
        sequence: frame.sequence,
        serverTime: frame.serverTime,
      };
      setFeed((current) => [...current, item].slice(-MAXIMUM_SESSION_FEED));
      const serverNow = estimateServerNow(
        serverClockAnchorRef.current,
        receivedAt,
        transport.clockEstimate?.offsetMs,
      );
      setPeers((current) =>
        current.filter(
          (node) =>
            node.id === clientId || isServerTimestampFresh(node.joinedAt, serverNow, PEER_STALE_AFTER_MS),
        ),
      );
      if (parsed.data.kind === 'presence') {
        const presenceNode = { ...parsed.data.node, joinedAt: frame.serverTime };
        setPeers((current) => {
          const withoutNode = current.filter((node) => node.id !== presenceNode.id);
          return [...withoutNode, presenceNode].sort((a, b) => a.nodeNumber - b.nodeNumber);
        });
      }
    });
    const unsubscribeDirect = transport.subscribeDirect((frame: TransportDirectFrame<unknown>) => {
      if (disposed) return;
      const receivedAt = Date.now();
      serverClockAnchorRef.current = advanceServerClockAnchor(
        serverClockAnchorRef.current,
        frame.serverTime,
        receivedAt,
      );
      const item: SessionDirectFeedItem = {
        messageId: frame.messageId,
        payload: frame.payload,
        recipientId: frame.recipientId,
        senderId: frame.senderId,
        serverTime: frame.serverTime,
      };
      setDirectFeed((current) => [...current, item].slice(-MAXIMUM_DIRECT_SESSION_FEED));
      for (const listener of directListenersRef.current) listener(item);
    });

    void transport
      .connect()
      .then(async () => {
        if (disposed) return;
        await flushReliableOutbox();
      })
      .catch((cause: unknown) => {
        if (!disposed) setError(cause instanceof Error ? cause.message : 'Could not reach the house relay.');
      });

    const heartbeat = setInterval(() => {
      if (transport.state !== 'connected') return;
      void publishPresence();
      transport.ping(createRelayId('ping'));
    }, 8_000);

    const prunePeers = setInterval(() => {
      const serverNow = estimateServerNow(
        serverClockAnchorRef.current,
        Date.now(),
        transport.clockEstimate?.offsetMs,
      );
      setPeers((current) =>
        current.filter(
          (node) =>
            node.id === clientId || isServerTimestampFresh(node.joinedAt, serverNow, PEER_STALE_AFTER_MS),
        ),
      );
    }, 4_000);

    const retryReliableOutbox = setInterval(() => {
      void flushReliableOutbox();
    }, 750);

    return () => {
      disposed = true;
      clearInterval(heartbeat);
      clearInterval(prunePeers);
      clearInterval(retryReliableOutbox);
      unsubscribeState();
      unsubscribeFrames();
      unsubscribeDirect();
      void transport.disconnect();
      if (transportRef.current === transport) transportRef.current = null;
      flushingOutboxRef.current = false;
    };
  }, [
    connectionGeneration,
    flushReliableOutbox,
    options.enabled,
    options.relayUrl,
    options.sessionId,
    stableNode.id,
  ]);

  useEffect(() => {
    const transport = transportRef.current;
    if (!options.enabled || !transport || transport.state !== 'connected') return;
    const signature = sessionNodeSignature(stableNode);
    if (signature === announcedNodeSignatureRef.current) return;
    announcedNodeSignatureRef.current = signature;
    void transport.publish(
      { kind: 'presence', node: { ...stableNode, joinedAt: Date.now() } },
      { eventId: createRelayId('presence'), clientSentAt: Date.now() },
    );
  }, [options.enabled, stableNode]);

  const publish = useCallback(async (event: HousewireSessionEvent, publishOptions?: SessionPublishOptions) => {
    const transport = transportRef.current;
    if (!transport || transport.state !== 'connected') {
      throw new Error('The house relay is not connected.');
    }
    const parsed = housewireSessionEventSchema.safeParse(event);
    if (!parsed.success) throw new Error('The session event does not satisfy the bounded Housewire protocol.');
    const eventId = publishOptions?.eventId ?? createRelayId();
    if (!SAFE_EVENT_ID.test(eventId)) throw new Error('The session event id is not relay-safe.');
    await transport.publish(parsed.data, { eventId, clientSentAt: Date.now() });
  }, []);

  const publishReliable = useCallback(
    async (event: HousewireSessionEvent, publishOptions: SessionReliablePublishOptions) => {
      const parsed = housewireSessionEventSchema.safeParse(event);
      if (!parsed.success) throw new Error('The reliable event does not satisfy the bounded Housewire protocol.');
      if (!SAFE_EVENT_ID.test(publishOptions.eventId)) throw new Error('The reliable event id is not relay-safe.');
      reliableOutboxRef.current.enqueue(publishOptions.eventId, parsed.data);
      await flushReliableOutbox();
    },
    [flushReliableOutbox],
  );

  const publishDirect = useCallback(async (recipientId: string, payload: unknown): Promise<DirectDeliveryAck> => {
    const transport = transportRef.current;
    if (!transport || transport.state !== 'connected') {
      throw new Error('The house relay is not connected for direct delivery.');
    }
    if (!SAFE_EVENT_ID.test(recipientId)) throw new Error('The direct recipient id is not relay-safe.');
    return transport.publishDirect(recipientId, payload, {
      messageId: createRelayId('direct'),
      clientSentAt: Date.now(),
    });
  }, []);

  const subscribeDirect = useCallback((listener: SessionDirectListener): (() => void) => {
    directListenersRef.current.add(listener);
    return () => directListenersRef.current.delete(listener);
  }, []);

  const consumeDirect = useCallback((messageId: string) => {
    setDirectFeed((current) => current.filter((item) => item.messageId !== messageId));
  }, []);

  const clearError = useCallback(() => setError(undefined), []);
  const reconnect = useCallback(() => {
    setError(undefined);
    setConnectionGeneration((current) => current + 1);
  }, []);

  return {
    clockEstimate: transportRef.current?.clockEstimate,
    clearError,
    connectionState,
    consumeDirect,
    error,
    directFeed,
    feed,
    peers,
    publish,
    publishDirect,
    publishReliable,
    reconnect,
    subscribeDirect,
  };
}

function sessionNodeSignature(node: SessionNode): string {
  return `${node.id}\u0000${node.label}\u0000${node.nodeNumber}\u0000${node.simulated}`;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { line13SeedFromCode } from '@/src/domain/line-13-game';
import { useHousewireStore } from '@/src/store/use-housewire-store';

import { useHousewireSessionContext } from './HousewireSessionProvider';
import { createRelayId } from './relay-id';
import {
  housewireSessionEventSchema,
  line13StageIds,
  toSessionTimestamp,
  type HousewireSessionEvent,
} from './protocol';
import {
  COURIER_HANDOFF_WINDOW_MS,
  completedNodeIds as selectCompletedNodeIds,
  createLocalCompletionEvent,
  createMissionAbortEvent,
  createMissionStartEvent,
  createSharedMissionCheckpoint,
  createSharedMissionCoordinatorState,
  missionStartTransportEventId,
  reduceSharedMissionFrame,
  type HostStartInput,
  type LocalCompletionInput,
  type SharedMissionCoordinatorContext,
  type SharedMissionCoordinatorState,
} from './shared-mission-coordinator';
import type { SessionFeedItem } from './use-housewire-session';

export interface SharedMissionHostStartOptions {
  operationId?: string;
  seed?: number;
  startsAt?: number;
  liveNodeIds?: readonly string[];
}

/**
 * React bridge around the pure host-authoritative coordinator. The session
 * provider owns the durable feed and transport; this hook never opens a second
 * socket or creates a competing multiplayer store.
 */
export function useSharedMissionCoordinator() {
  const session = useHousewireSessionContext();
  const { publishReliable } = session;
  const crew = useHousewireStore((store) => store.crew);
  const [state, setState] = useState<SharedMissionCoordinatorState>(createSharedMissionCoordinatorState);
  const stateRef = useRef(state);
  const processedEventIdsRef = useRef(new Set<string>());
  const localSequenceRef = useRef(0);
  const requestedSnapshotForConnectionRef = useRef<string | undefined>(undefined);
  const connectionEpochRef = useRef(session.connectionState === 'connected' ? 1 : 0);
  const previousConnectionStateRef = useRef(session.connectionState);
  const checkpointedConnectionRef = useRef<string | undefined>(undefined);
  const [handoffClock, setHandoffClock] = useState(Date.now());

  const availableNodeIds = useMemo(() => {
    const candidates = session.enabled
      ? session.liveNodeIds
      : crew.filter((node) => node.connected).map((node) => node.id);
    const unique = [...new Set([session.localNodeId, ...candidates])]
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 4);
    return unique;
  }, [crew, session.enabled, session.liveNodeIds, session.localNodeId]);

  const coordinatorContext = useCallback(
    (): SharedMissionCoordinatorContext => ({
      localNodeId: session.localNodeId,
      isHost: session.isHost,
      expectedHostNodeId: session.hostNodeId,
      liveNodeIds: availableNodeIds,
    }),
    [availableNodeIds, session.hostNodeId, session.isHost, session.localNodeId],
  );

  const commit = useCallback((next: SharedMissionCoordinatorState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const publishAuthority = useCallback(
    (message: { event: HousewireSessionEvent; eventId: string }) =>
      publishReliable(message.event, { eventId: message.eventId }).catch(() => undefined),
    [publishReliable],
  );

  const dispatchLocally = useCallback(
    (initialEvent: HousewireSessionEvent, initialEventId: string) => {
      const queue: { event: HousewireSessionEvent; eventId: string; senderId: string }[] = [
        { event: initialEvent, eventId: initialEventId, senderId: session.localNodeId },
      ];
      let next = stateRef.current;
      while (queue.length > 0) {
        const queued = queue.shift()!;
        const sequence = ++localSequenceRef.current;
        const result = reduceSharedMissionFrame(
          next,
          {
            event: queued.event,
            eventId: queued.eventId,
            senderId: queued.senderId,
            sequence,
            serverTime: Date.now(),
          },
          coordinatorContext(),
        );
        next = result.state;
        queue.push(
          ...result.outbound.map((outbound) => ({
            event: outbound.event,
            eventId: outbound.eventId,
            senderId: session.localNodeId,
          })),
        );
      }
      commit(next);
    },
    [commit, coordinatorContext, session.localNodeId],
  );

  useEffect(() => {
    stateRef.current = createSharedMissionCoordinatorState();
    processedEventIdsRef.current.clear();
    localSequenceRef.current = 0;
    requestedSnapshotForConnectionRef.current = undefined;
    checkpointedConnectionRef.current = undefined;
    setState(stateRef.current);
  }, [session.localNodeId, session.sessionId]);

  useEffect(() => {
    if (!session.enabled || session.feed.length === 0) return;
    let next = stateRef.current;
    const outbound: { event: HousewireSessionEvent; eventId: string }[] = [];
    for (const item of session.feed) {
      if (processedEventIdsRef.current.has(item.eventId)) continue;
      processedEventIdsRef.current.add(item.eventId);
      const result = reduceSharedMissionFrame(next, item, coordinatorContext());
      next = result.state;
      outbound.push(...result.outbound);
    }
    if (processedEventIdsRef.current.size > 768) {
      processedEventIdsRef.current = new Set(session.feed.map((item) => item.eventId));
    }
    if (next !== stateRef.current) commit(next);
    for (const message of outbound) {
      void publishAuthority(message);
    }
  }, [commit, coordinatorContext, publishAuthority, session]);

  useEffect(() => {
    if (session.connectionState !== 'connected') {
      requestedSnapshotForConnectionRef.current = undefined;
      return;
    }
    if (!session.enabled || session.isHost) return;
    const requestKey = `${session.sessionId}:${session.localNodeId}:connected`;
    if (requestedSnapshotForConnectionRef.current === requestKey) return;
    requestedSnapshotForConnectionRef.current = requestKey;
    const event = housewireSessionEventSchema.parse({
      kind: 'mission.snapshot.request',
      nodeId: session.localNodeId,
      knownOperationId: stateRef.current.operationId,
      requestedAt: toSessionTimestamp(Date.now() + (session.clockEstimate?.offsetMs ?? 0)),
    });
    void session.publish(event, { eventId: createRelayId() }).catch(() => {
      requestedSnapshotForConnectionRef.current = undefined;
    });
  }, [session]);

  useEffect(() => {
    const previous = previousConnectionStateRef.current;
    if (session.connectionState === 'connected' && previous !== 'connected') {
      connectionEpochRef.current += 1;
    }
    previousConnectionStateRef.current = session.connectionState;
    if (!session.isHost || session.connectionState !== 'connected' || !state.operationId) return;
    const key = `${session.sessionId}:${state.operationId}:${connectionEpochRef.current}`;
    if (checkpointedConnectionRef.current === key) return;
    checkpointedConnectionRef.current = key;
    const checkpoint = createSharedMissionCheckpoint(stateRef.current, createRelayId('reconnect'));
    if (checkpoint) void publishAuthority(checkpoint);
  }, [publishAuthority, session.connectionState, session.isHost, session.sessionId, state.operationId]);

  useEffect(() => {
    if (!session.isHost || !session.enabled) return;
    const interval = setInterval(() => {
      if (session.connectionState !== 'connected') return;
      const checkpoint = createSharedMissionCheckpoint(stateRef.current, createRelayId('periodic'));
      if (checkpoint) void publishAuthority(checkpoint);
    }, 15_000);
    return () => clearInterval(interval);
  }, [publishAuthority, session.connectionState, session.enabled, session.isHost]);

  const hostStart = useCallback(
    async (options: SharedMissionHostStartOptions = {}): Promise<boolean> => {
      if (!session.isHost) return false;
      const liveNodeIds = [...new Set(options.liveNodeIds ?? availableNodeIds)]
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 4);
      if (liveNodeIds.length < 2 || !liveNodeIds.includes(session.localNodeId)) return false;
      const startsAt = toSessionTimestamp(
        options.startsAt ?? Date.now() + (session.clockEstimate?.offsetMs ?? 0),
      );
      const operationId = options.operationId ?? createRelayId('op');
      let event: ReturnType<typeof createMissionStartEvent>;
      try {
        event = createMissionStartEvent({
          operationId,
          seed: options.seed ?? line13SeedFromCode(`${session.sessionId}-${startsAt}`),
          startsAt,
          liveNodeIds,
          hostNodeId: session.localNodeId,
        } satisfies HostStartInput);
      } catch {
        return false;
      }
      const eventId = missionStartTransportEventId(operationId);
      if (!session.enabled) {
        dispatchLocally(event, eventId);
        return true;
      }
      if (session.connectionState !== 'connected') return false;
      try {
        await session.publishReliable(event, { eventId });
        return true;
      } catch {
        return false;
      }
    },
    [availableNodeIds, dispatchLocally, session],
  );

  const submitLocalCompletion = useCallback(
    async (input: LocalCompletionInput): Promise<boolean> => {
      const clockOffset = session.clockEstimate?.offsetMs ?? 0;
      const observedAt = toSessionTimestamp(input.observedAt ?? Date.now() + clockOffset);
      const event = createLocalCompletionEvent(
        stateRef.current,
        session.localNodeId,
        { ...input, observedAt },
        observedAt,
      );
      if (!event) return false;
      const eventId = createRelayId();
      if (!session.enabled) {
        dispatchLocally(event, eventId);
        return true;
      }
      try {
        await session.publish(event, { eventId });
        return true;
      } catch {
        return false;
      }
    },
    [dispatchLocally, session],
  );

  const abortOperation = useCallback(async (): Promise<boolean> => {
    const abortedAt = toSessionTimestamp(Date.now() + (session.clockEstimate?.offsetMs ?? 0));
    const event = createMissionAbortEvent(stateRef.current, session.localNodeId, abortedAt);
    if (!event) return false;
    const eventId = createRelayId('abort');
    if (!session.enabled) {
      dispatchLocally(event, eventId);
      return true;
    }
    if (session.connectionState !== 'connected') return false;
    try {
      await session.publishReliable(event, { eventId });
      return true;
    } catch {
      return false;
    }
  }, [dispatchLocally, session]);

  const courierCompletion = state.stageIndex === 2
    ? state.completions.find((completion) => completion.actionId === 'carry-warning')
    : undefined;
  const handoffExpiresAt = courierCompletion
    ? courierCompletion.observedAt + COURIER_HANDOFF_WINDOW_MS
    : undefined;

  useEffect(() => {
    if (handoffExpiresAt === undefined) return;
    setHandoffClock(Date.now());
    const interval = setInterval(() => setHandoffClock(Date.now()), 250);
    return () => clearInterval(interval);
  }, [handoffExpiresAt]);

  const handoffRemainingMs = handoffExpiresAt === undefined
    ? undefined
    : Math.max(0, handoffExpiresAt - (handoffClock + (session.clockEstimate?.offsetMs ?? 0)));
  const handoffExpired = handoffRemainingMs === 0 && handoffExpiresAt !== undefined;
  const visibleCompletedNodeIds = handoffExpired && state.stageIndex === 2
    ? []
    : selectCompletedNodeIds(state);

  return {
    isHost: session.isHost,
    localNodeId: session.localNodeId,
    stageIndex: state.stageIndex,
    startedAt: state.startedAt,
    completedNodeIds: visibleCompletedNodeIds,
    submitLocalCompletion,
    abortOperation,
    hostStart,
    connectionState: session.connectionState,
    clockOffsetMs: session.clockEstimate?.offsetMs ?? 0,
    finishedAt: state.finishedAt,
    abortedAt: state.abortedAt,
    abortedByNodeId: state.abortedByNodeId,
    operationId: state.operationId,
    requiredNodeIds: state.requiredNodeIds,
    stageId: state.startedAt === undefined ? undefined : line13StageIds[state.stageIndex],
    seed: state.seed,
    liveNodeIds: state.liveNodeIds,
    stageStartedAt: state.stageStartedAt,
    handoffExpiresAt,
    handoffRemainingMs,
    handoffCourierReady: courierCompletion !== undefined && !handoffExpired,
    handoffExpired,
    missingNodeIds: state.liveNodeIds.filter((nodeId) => !availableNodeIds.includes(nodeId)),
    membershipError:
      state.startedAt !== undefined && state.liveNodeIds.some((nodeId) => !availableNodeIds.includes(nodeId))
        ? 'A required LINE 13 node is offline. Reconnect that phone or abort this operation; membership is never silently reduced.'
        : undefined,
  };
}

export function makeSessionFeedItem(
  event: HousewireSessionEvent,
  senderId: string,
  sequence: number,
  serverTime: number,
  eventId = `event-${sequence}`,
): SessionFeedItem {
  return { event, senderId, sequence, serverTime, eventId };
}

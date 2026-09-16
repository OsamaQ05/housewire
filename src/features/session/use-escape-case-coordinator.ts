import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { compileEscapeCase, type EscapeCaseId } from '@/src/domain/escape-case-compiler';
import { line13SeedFromCode } from '@/src/domain/line-13-game';

import {
  createEscapeAbortEvent,
  expireEscapeMission,
  reduceEscapeMistake,
  createEscapeMissionRuntime,
  escapeProofToken,
  escapeSnapshotFromRuntime,
  missingRequiredEscapeNodeIds,
  reduceEscapeAbort,
  reduceEscapeProof,
  runtimeFromEscapeSnapshot,
  type EscapeMissionRuntimeState,
} from './escape-mission-coordinator';
import { useHousewireSessionContext } from './HousewireSessionProvider';
import { createRelayId } from './relay-id';
import {
  housewireSessionEventSchema,
  toSessionTimestamp,
  type EscapeProofEvent,
  type EscapeAbortEvent,
  type EscapeSignalEvent,
  type EscapeStartEvent,
} from './protocol';

export interface EscapeCaseHostStartOptions {
  seed?: number;
  startsAt?: number;
}

export function useEscapeCaseCoordinator(missionId: EscapeCaseId) {
  const session = useHousewireSessionContext();
  const [state, setState] = useState<EscapeMissionRuntimeState>();
  const [snapshotRequestGeneration, setSnapshotRequestGeneration] = useState(0);
  const stateRef = useRef(state);
  const processedEventIdsRef = useRef(new Set<string>());
  const snapshotRequestRef = useRef<string | undefined>(undefined);

  const commit = useCallback((next: EscapeMissionRuntimeState | undefined) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const publishSnapshot = useCallback(
    async (next: EscapeMissionRuntimeState) => {
      if (!session.isHost || session.connectionState !== 'connected') return;
      const snapshot = housewireSessionEventSchema.parse(escapeSnapshotFromRuntime(next));
      await session.publishReliable(snapshot, {
        eventId: `esc-snap-${next.operationId}-${next.revision}`.slice(0, 64),
      });
    },
    [session],
  );

  useEffect(() => {
    processedEventIdsRef.current.clear();
    snapshotRequestRef.current = undefined;
    setSnapshotRequestGeneration(0);
    commit(undefined);
  }, [commit, missionId, session.localNodeId, session.sessionId]);

  useEffect(() => {
    if (!session.enabled || session.feed.length === 0) return;
    for (const item of session.feed) {
      if (processedEventIdsRef.current.has(item.eventId)) continue;
      processedEventIdsRef.current.add(item.eventId);
      const event = item.event;

      if (event.kind === 'escape.start' && event.missionId === missionId) {
        if (
          item.senderId !== event.hostNodeId ||
          !event.liveNodeIds.includes(event.hostNodeId) ||
          session.hostNodeId === undefined ||
          event.hostNodeId !== session.hostNodeId
        ) {
          continue;
        }
        const current = stateRef.current;
        if (!current || current.operationId !== event.operationId) {
          commit(createEscapeMissionRuntime(event));
        }
        continue;
      }

      if (event.kind === 'escape.snapshot' && event.missionId === missionId) {
        const current = stateRef.current;
        const trustedHostNodeId = current?.operationId === event.operationId
          ? current.hostNodeId
          : session.hostNodeId;
        if (
          item.senderId !== event.hostNodeId ||
          trustedHostNodeId === undefined ||
          event.hostNodeId !== trustedHostNodeId
        ) {
          continue;
        }
        if (
          !current ||
          current.operationId !== event.operationId ||
          event.revision > current.revision
        ) {
          commit(runtimeFromEscapeSnapshot(event));
        }
        continue;
      }

      if (event.kind === 'escape.abort' && event.missionId === missionId) {
        const current = stateRef.current;
        if (!current) continue;
        const reduced = reduceEscapeAbort(current, event, item.senderId, item.serverTime);
        if (reduced.accepted && reduced.state !== current) {
          commit(reduced.state);
          if (session.isHost) void publishSnapshot(reduced.state);
        }
        continue;
      }

      if (event.kind === 'escape.proof' && event.missionId === missionId && session.isHost) {
        const current = stateRef.current;
        if (!current) continue;
        const reduced = reduceEscapeProof(current, event, item.senderId, item.serverTime);
        if (reduced.state !== current) {
          commit(reduced.state);
          void publishSnapshot(reduced.state);
        }
        continue;
      }

      if (event.kind === 'escape.mistake' && event.missionId === missionId && session.isHost && stateRef.current) {
        const next = reduceEscapeMistake(stateRef.current, event, item.senderId, item.serverTime);
        if (next !== stateRef.current) { commit(next); void publishSnapshot(next); }
        continue;
      }

      if (
        event.kind === 'escape.snapshot.request' &&
        event.missionId === missionId &&
        session.isHost &&
        item.senderId === event.nodeId &&
        stateRef.current
      ) {
        void publishSnapshot(stateRef.current);
      }
    }
    if (processedEventIdsRef.current.size > 768) {
      processedEventIdsRef.current = new Set(session.feed.map((item) => item.eventId));
    }
  }, [commit, missionId, publishSnapshot, session]);

  useEffect(() => {
    if (
      !session.enabled ||
      session.isHost ||
      session.connectionState !== 'connected'
    ) {
      if (session.connectionState !== 'connected') snapshotRequestRef.current = undefined;
      return;
    }
    const key = `${session.sessionId}:${session.localNodeId}:${missionId}:${snapshotRequestGeneration}`;
    if (snapshotRequestRef.current === key) return;
    snapshotRequestRef.current = key;
    const request = housewireSessionEventSchema.parse({
      kind: 'escape.snapshot.request',
      missionId,
      nodeId: session.localNodeId,
      knownOperationId: stateRef.current?.operationId,
      requestedAt: toSessionTimestamp(Date.now() + (session.clockEstimate?.offsetMs ?? 0)),
    });
    void session.publish(request, { eventId: createRelayId() }).catch(() => {
      snapshotRequestRef.current = undefined;
    });
  }, [missionId, session, snapshotRequestGeneration]);

  useEffect(() => {
    if (
      !session.enabled ||
      session.connectionState !== 'connected' ||
      state !== undefined
    ) return;
    const interval = setInterval(() => {
      if (!session.isHost) snapshotRequestRef.current = undefined;
      setSnapshotRequestGeneration((current) => current + 1);
    }, 6_000);
    return () => clearInterval(interval);
  }, [session.connectionState, session.enabled, session.isHost, state]);

  useEffect(() => {
    if (!session.enabled || !session.isHost || session.connectionState !== 'connected') return;
    const interval = setInterval(() => {
      if (stateRef.current) void publishSnapshot(stateRef.current);
    }, 12_000);
    return () => clearInterval(interval);
  }, [publishSnapshot, session.connectionState, session.enabled, session.isHost]);

  const hostStart = useCallback(
    async (options: EscapeCaseHostStartOptions = {}): Promise<boolean> => {
      if (!session.isHost || session.connectionState !== 'connected') return false;
      const liveNodeIds = [...new Set(session.liveNodeIds)]
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 4);
      if (liveNodeIds.length < 2 || !liveNodeIds.includes(session.localNodeId)) return false;
      const startsAt = toSessionTimestamp(
        options.startsAt ?? Date.now() + (session.clockEstimate?.offsetMs ?? 0),
      );
      const operationId = createRelayId('esc');
      const event = housewireSessionEventSchema.parse({
        kind: 'escape.start',
        missionId,
        operationId,
        hostNodeId: session.localNodeId,
        seed: options.seed ?? line13SeedFromCode(`${missionId}:${session.sessionId}:${startsAt}`),
        startsAt,
        liveNodeIds,
      }) as EscapeStartEvent;
      const next = createEscapeMissionRuntime(event);
      commit(next);
      try {
        await session.publishReliable(event, { eventId: `esc-start-${operationId}`.slice(0, 64) });
        await publishSnapshot(next);
        return true;
      } catch {
        commit(undefined);
        return false;
      }
    }, [commit, missionId, publishSnapshot, session],
  );

  useEffect(() => {
    if (!session.isHost || !state) return;
    const timer = setInterval(() => {
      const current = stateRef.current;
      if (!current) return;
      const next = expireEscapeMission(current, Date.now() + (session.clockEstimate?.offsetMs ?? 0));
      if (next !== current) { commit(next); void publishSnapshot(next); }
    }, 500);
    return () => clearInterval(timer);
  }, [commit, publishSnapshot, session.clockEstimate?.offsetMs, session.isHost, state]);

  const reportMistake = useCallback(async () => {
    const current = stateRef.current;
    if (!current || current.failedAt !== undefined || current.finishedAt !== undefined || current.abortedAt !== undefined || session.connectionState !== 'connected') return false;
    const event = housewireSessionEventSchema.parse({ kind: 'escape.mistake', missionId, operationId: current.operationId, nodeId: session.localNodeId, attemptId: createRelayId('mistake'), stageIndex: current.stageIndex, observedAt: toSessionTimestamp(Date.now() + (session.clockEstimate?.offsetMs ?? 0)) });
    if (event.kind !== 'escape.mistake') return false;
    if (session.isHost) { const next = reduceEscapeMistake(current, event, session.localNodeId, event.observedAt); commit(next); void publishSnapshot(next); }
    try { await session.publishReliable(event, { eventId: event.attemptId }); return true; } catch { return false; }
  }, [commit, missionId, publishSnapshot, session]);

  const submitProof = useCallback(
    async (proofKey: string): Promise<boolean> => {
      const current = stateRef.current;
      if (
        !current ||
        current.finishedAt !== undefined ||
        current.failedAt !== undefined ||
        current.abortedAt !== undefined ||
        session.connectionState !== 'connected'
      ) return false;
      const event = housewireSessionEventSchema.parse({
        kind: 'escape.proof',
        missionId,
        operationId: current.operationId,
        stageIndex: current.stageIndex,
        nodeId: session.localNodeId,
        proofKey,
        answerToken: escapeProofToken(missionId, current.seed, current.stageIndex, proofKey, session.localNodeId),
        observedAt: toSessionTimestamp(Date.now() + (session.clockEstimate?.offsetMs ?? 0)),
      }) as EscapeProofEvent;
      if (session.isHost) {
        const reduced = reduceEscapeProof(current, event, session.localNodeId, event.observedAt);
        if (!reduced.accepted) return false;
        if (reduced.state !== current) {
          commit(reduced.state);
          void publishSnapshot(reduced.state);
        }
      }
      try {
        await session.publishReliable(event, { eventId: createRelayId('esc-proof') });
        return true;
      } catch {
        return false;
      }
    }, [commit, missionId, publishSnapshot, session],
  );

  const abortOperation = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current;
    if (!current || !session.isHost || session.connectionState !== 'connected') return false;
    const abortedAt = toSessionTimestamp(Date.now() + (session.clockEstimate?.offsetMs ?? 0));
    const candidate = createEscapeAbortEvent(current, session.localNodeId, abortedAt);
    if (!candidate) return false;
    const event = housewireSessionEventSchema.parse(candidate) as EscapeAbortEvent;
    const reduced = reduceEscapeAbort(current, event, session.localNodeId, abortedAt);
    if (!reduced.accepted) return false;
    try {
      await session.publishReliable(event, {
        eventId: `esc-abort-${current.operationId}`.slice(0, 64),
      });
      await publishSnapshot(reduced.state);
      commit(reduced.state);
      return true;
    } catch {
      return false;
    }
  }, [commit, publishSnapshot, session]);

  const publishSignal = useCallback(
    async (input: Omit<EscapeSignalEvent, 'kind' | 'missionId' | 'operationId' | 'nodeId' | 'observedAt'>) => {
      const current = stateRef.current;
      if (
        !current ||
        current.finishedAt !== undefined ||
        current.abortedAt !== undefined ||
        session.connectionState !== 'connected'
      ) return false;
      const event = housewireSessionEventSchema.parse({
        ...input,
        kind: 'escape.signal',
        missionId,
        operationId: current.operationId,
        nodeId: session.localNodeId,
        observedAt: toSessionTimestamp(Date.now() + (session.clockEstimate?.offsetMs ?? 0)),
      }) as EscapeSignalEvent;
      try {
        await session.publish(event, { eventId: createRelayId() });
        return true;
      } catch {
        return false;
      }
    },
    [missionId, session],
  );

  const game = useMemo(
    () => state ? compileEscapeCase(missionId, state.seed, state.liveNodeIds) : undefined,
    [missionId, state],
  );
  const requiredNodeIds = useMemo(
    () => game?.stages[state?.stageIndex ?? -1]?.requiredNodeIds ?? [],
    [game, state?.stageIndex],
  );
  const missingRequiredNodeIds = useMemo(() => {
    if (!state) return [];
    return missingRequiredEscapeNodeIds(state, session.liveNodeIds);
  }, [session.liveNodeIds, state]);
  const coordinationGuidance = useMemo(() => {
    if (!session.enabled) return undefined;
    if (session.connectionState !== 'connected') {
      return session.isHost
        ? 'The relay connection is down. Reconnect before ending the run for every phone, or leave only this phone.'
        : 'This phone lost the relay. Reconnect to recover the authoritative stage, or leave this case locally.';
    }
    if (!state && snapshotRequestGeneration > 0) {
      return session.isHost
        ? 'No authoritative case state is available. Return home and reopen the case from the lobby.'
        : 'The host has not returned an authoritative stage. Confirm the host is still in the room, retry, or leave this case.';
    }
    if (missingRequiredNodeIds.length > 0) {
      const count = missingRequiredNodeIds.length;
      return session.isHost
        ? `${count} required phone${count === 1 ? ' is' : 's are'} offline. Reconnect ${count === 1 ? 'it' : 'them'} or end this run for everyone.`
        : `${count} required phone${count === 1 ? ' is' : 's are'} offline. Ask the host to reconnect ${count === 1 ? 'it' : 'them'} or end the run; you can leave this phone locally.`;
    }
    return undefined;
  }, [missingRequiredNodeIds.length, session.connectionState, session.enabled, session.isHost, snapshotRequestGeneration, state]);
  const signals = useMemo(
    () => session.feed.flatMap((item) => {
      const event = item.event;
      return event.kind === 'escape.signal' &&
        event.missionId === missionId &&
        event.operationId === state?.operationId
        ? [{ ...event, senderId: item.senderId, serverTime: item.serverTime }]
        : [];
    }),
    [missionId, session.feed, state?.operationId],
  );

  return {
    ...state,
    abortOperation,
    clockOffsetMs: session.clockEstimate?.offsetMs ?? 0,
    connectionState: session.connectionState,
    coordinationGuidance,
    game,
    hostStart,
    isHost: session.isHost,
    localNodeId: session.localNodeId,
    missingRequiredNodeIds,
    publishSignal,
    signals,
    submitProof,
    reportMistake,
    requiredNodeIds,
  };
}

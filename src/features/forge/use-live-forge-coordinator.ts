import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  ForgeCase,
  ForgePlayerCase,
  ForgeStageSubmission,
  ForgeSubmissionResult,
} from '@/src/domain/case-forge';
import {
  housewireSessionEventSchema,
  toSessionTimestamp,
  useHousewireSessionContext,
  type ForgeJoinEvent,
} from '@/src/features/session';
import { createRelayId } from '@/src/features/session/relay-id';

import {
  abortForgeLiveRun,
  assignForgeLiveNode,
  createForgeLiveRuntime,
  forgeLiveRuntimeFromSnapshot,
  forgeLiveSnapshot,
  forgePlayerProjectionForNode,
  missingForgeLiveNodeIds,
  reduceForgeLiveSubmission,
  revealForgeLiveHint,
  startForgeLiveRun,
  type ForgeLiveRuntimeState,
} from './live-coordinator';
import {
  forgeSubmission,
  parseForgeLiveDirectMessage,
  type ForgeLiveDirectMessage,
} from './live-protocol';

interface UseLiveForgeCoordinatorOptions {
  caseId: string;
  game?: ForgeCase;
  localName: string;
}

type PendingRequest =
  | { kind: 'submission'; resolve: (result: ForgeSubmissionResult) => void; timer: ReturnType<typeof setTimeout> }
  | { kind: 'hint'; resolve: (count: number | false) => void; timer: ReturnType<typeof setTimeout> };

const REQUEST_TIMEOUT_MS = 10_000;

export function useLiveForgeCoordinator({ caseId, game, localName }: UseLiveForgeCoordinatorOptions) {
  const session = useHousewireSessionContext();
  const [state, setState] = useState<ForgeLiveRuntimeState | undefined>(undefined);
  const [projection, setProjection] = useState<ForgePlayerCase | undefined>(undefined);
  const [lastError, setLastError] = useState<string | undefined>(undefined);
  const stateRef = useRef(state);
  const processedEventIdsRef = useRef(new Set<string>());
  const processedDirectIdsRef = useRef(new Set<string>());
  const pendingRef = useRef(new Map<string, PendingRequest>());
  const joinRequestKeyRef = useRef<string | undefined>(undefined);

  const commit = useCallback((next: ForgeLiveRuntimeState | undefined) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const publishSnapshot = useCallback(async (next: ForgeLiveRuntimeState) => {
    if (!session.isHost || session.connectionState !== 'connected') return;
    const snapshot = forgeLiveSnapshot(next);
    await session.publishReliable(snapshot, {
      eventId: `forge-snap-${next.operationId}-${next.revision}`.slice(0, 64),
    });
  }, [session]);

  const sendProjection = useCallback(async (nodeId: string, next: ForgeLiveRuntimeState) => {
    if (!game || !session.isHost || session.connectionState !== 'connected') return false;
    const playerCase = forgePlayerProjectionForNode(game, next, nodeId);
    const assignment = next.assignments.find((candidate) => candidate.nodeId === nodeId);
    if (!playerCase || !assignment) return false;
    try {
      await session.publishDirect(nodeId, {
        kind: 'forge.case',
        protocolVersion: 1,
        caseId,
        operationId: next.operationId,
        playerId: assignment.playerId,
        playerCase,
        snapshot: forgeLiveSnapshot(next),
      } satisfies ForgeLiveDirectMessage);
      return true;
    } catch {
      return false;
    }
  }, [caseId, game, session]);

  useEffect(() => {
    processedEventIdsRef.current.clear();
    processedDirectIdsRef.current.clear();
    joinRequestKeyRef.current = undefined;
    for (const pending of pendingRef.current.values()) {
      clearTimeout(pending.timer);
      if (pending.kind === 'submission') pending.resolve({ accepted: false, code: 'INVALID_STAGE' });
      else pending.resolve(false);
    }
    pendingRef.current.clear();
    commit(undefined);
    setProjection(undefined);
    setLastError(undefined);
  }, [caseId, commit, session.localNodeId, session.sessionId]);

  useEffect(() => {
    if (!session.enabled || session.feed.length === 0) return;
    for (const item of session.feed) {
      if (processedEventIdsRef.current.has(item.eventId)) continue;
      processedEventIdsRef.current.add(item.eventId);
      const event = item.event;

      if (event.kind === 'forge.snapshot' && event.caseId === caseId) {
        const trustedHost = stateRef.current?.operationId === event.operationId
          ? stateRef.current.hostNodeId
          : session.isHost ? session.localNodeId : session.hostNodeId;
        if (item.senderId !== event.hostNodeId || event.hostNodeId !== trustedHost) continue;
        const current = stateRef.current;
        const shouldAdopt = !current || event.operationId !== current.operationId
          ? event.createdAt >= (current?.createdAt ?? 0)
          : event.revision > current.revision;
        if (shouldAdopt) commit(forgeLiveRuntimeFromSnapshot(event));
        continue;
      }

      if (
        event.kind === 'forge.join' &&
        event.caseId === caseId &&
        session.isHost &&
        item.senderId === event.nodeId &&
        game
      ) {
        const current = stateRef.current;
        if (!current) continue;
        const next = assignForgeLiveNode(current, game, event.nodeId, event.name, item.serverTime);
        if (next !== current) {
          commit(next);
          void publishSnapshot(next);
        }
        void sendProjection(event.nodeId, next);
        continue;
      }

      if (
        event.kind === 'forge.snapshot.request' &&
        event.caseId === caseId &&
        session.isHost &&
        item.senderId === event.nodeId
      ) {
        const current = stateRef.current;
        if (current) {
          void publishSnapshot(current);
          void sendProjection(event.nodeId, current);
        }
      }
    }
    if (processedEventIdsRef.current.size > 768) {
      processedEventIdsRef.current = new Set(session.feed.map((item) => item.eventId));
    }
  }, [caseId, commit, game, publishSnapshot, sendProjection, session]);

  useEffect(() => {
    if (!session.enabled || session.directFeed.length === 0) return;
    for (const item of session.directFeed) {
      if (processedDirectIdsRef.current.has(item.messageId)) continue;
      processedDirectIdsRef.current.add(item.messageId);
      session.consumeDirect(item.messageId);
      const message = parseForgeLiveDirectMessage(item.payload);
      if (!message || message.caseId !== caseId) continue;

      if (message.kind === 'forge.case') {
        const trustedHost = session.hostNodeId ?? stateRef.current?.hostNodeId;
        const ownAssignment = message.snapshot.assignments.find(
          (assignment) => assignment.nodeId === session.localNodeId,
        );
        if (
          session.isHost ||
          item.senderId !== trustedHost ||
          message.snapshot.hostNodeId !== item.senderId ||
          ownAssignment?.playerId !== message.playerId
        ) continue;
        const current = stateRef.current;
        if (
          !current ||
          message.snapshot.operationId !== current.operationId ||
          message.snapshot.revision >= current.revision
        ) commit(forgeLiveRuntimeFromSnapshot(message.snapshot));
        setProjection((currentProjection) => samePlayerProjection(currentProjection, message.playerCase)
          ? currentProjection
          : message.playerCase);
        setLastError(undefined);
        continue;
      }

      if (message.kind === 'forge.submit' && session.isHost && game) {
        const current = stateRef.current;
        if (!current || current.operationId !== message.operationId) continue;
        const reduced = reduceForgeLiveSubmission(
          current,
          game,
          item.senderId,
          message.stageIndex,
          message.submission as ForgeStageSubmission,
          item.serverTime,
        );
        if (reduced.changed) {
          commit(reduced.state);
          void publishSnapshot(reduced.state);
        }
        void session.publishDirect(item.senderId, {
          kind: 'forge.result',
          protocolVersion: 1,
          caseId,
          operationId: current.operationId,
          requestId: message.requestId,
          result: reduced.result,
        } satisfies ForgeLiveDirectMessage).catch(() => undefined);
        continue;
      }

      if (message.kind === 'forge.hint' && session.isHost && game) {
        const current = stateRef.current;
        if (!current || current.operationId !== message.operationId) continue;
        const reduced = revealForgeLiveHint(current, game, item.senderId, message.stageIndex);
        if (reduced.state !== current) {
          commit(reduced.state);
          void publishSnapshot(reduced.state);
        }
        void session.publishDirect(item.senderId, {
          kind: 'forge.hint.result',
          protocolVersion: 1,
          caseId,
          operationId: current.operationId,
          requestId: message.requestId,
          accepted: reduced.accepted,
          count: reduced.count,
        } satisfies ForgeLiveDirectMessage).catch(() => undefined);
        continue;
      }

      if (message.kind === 'forge.result' || message.kind === 'forge.hint.result') {
        const trustedHost = stateRef.current?.hostNodeId ?? session.hostNodeId;
        if (item.senderId !== trustedHost || message.operationId !== stateRef.current?.operationId) continue;
        const pending = pendingRef.current.get(message.requestId);
        if (!pending) continue;
        pendingRef.current.delete(message.requestId);
        clearTimeout(pending.timer);
        if (message.kind === 'forge.result' && pending.kind === 'submission') pending.resolve(message.result);
        if (message.kind === 'forge.hint.result' && pending.kind === 'hint') {
          pending.resolve(message.accepted ? message.count : false);
        }
      }
    }
    if (processedDirectIdsRef.current.size > 128) {
      processedDirectIdsRef.current = new Set(session.directFeed.map((item) => item.messageId));
    }
  }, [caseId, commit, game, publishSnapshot, session]);

  useEffect(() => {
    if (
      !session.enabled ||
      !session.isHost ||
      !game ||
      session.connectionState !== 'connected' ||
      state !== undefined
    ) return;
    const timer = setTimeout(() => {
      if (stateRef.current) return;
      const createdAt = toSessionTimestamp(Date.now() + (session.clockEstimate?.offsetMs ?? 0));
      const next = createForgeLiveRuntime(
        game,
        session.localNodeId,
        createRelayId('forge'),
        createdAt,
        localName,
      );
      commit(next);
      void publishSnapshot(next);
    }, 450);
    return () => clearTimeout(timer);
  }, [commit, game, localName, publishSnapshot, session, state]);

  useEffect(() => {
    if (
      !session.enabled ||
      session.isHost ||
      session.connectionState !== 'connected'
    ) {
      if (session.connectionState !== 'connected') joinRequestKeyRef.current = undefined;
      return;
    }
    const key = `${session.sessionId}:${session.localNodeId}:${caseId}:${state?.operationId ?? 'waiting'}`;
    if (joinRequestKeyRef.current === key) return;
    joinRequestKeyRef.current = key;
    const requestedAt = toSessionTimestamp(Date.now() + (session.clockEstimate?.offsetMs ?? 0));
    const join = housewireSessionEventSchema.parse({
      kind: 'forge.join',
      caseId,
      nodeId: session.localNodeId,
      name: localName,
      requestedAt,
    }) as ForgeJoinEvent;
    void Promise.all([
      session.publish(join, { eventId: createRelayId('forge-join') }),
      session.publish(housewireSessionEventSchema.parse({
        kind: 'forge.snapshot.request',
        caseId,
        nodeId: session.localNodeId,
        knownOperationId: state?.operationId,
        requestedAt,
      }), { eventId: createRelayId('forge-state') }),
    ]).catch(() => {
      joinRequestKeyRef.current = undefined;
      setLastError('The host did not receive this role request.');
    });
  }, [caseId, localName, projection, session, state?.operationId]);

  useEffect(() => {
    if (
      !session.enabled ||
      session.isHost ||
      session.connectionState !== 'connected' ||
      projection
    ) return;
    const interval = setInterval(() => {
      joinRequestKeyRef.current = undefined;
      const requestedAt = toSessionTimestamp(Date.now() + (session.clockEstimate?.offsetMs ?? 0));
      void session.publish(housewireSessionEventSchema.parse({
        kind: 'forge.join',
        caseId,
        nodeId: session.localNodeId,
        name: localName,
        requestedAt,
      }), { eventId: createRelayId('forge-join') }).catch(() => undefined);
    }, 6_000);
    return () => clearInterval(interval);
  }, [caseId, localName, projection, session]);

  useEffect(() => {
    if (!session.enabled || !session.isHost || session.connectionState !== 'connected') return;
    const interval = setInterval(() => {
      const current = stateRef.current;
      if (!current) return;
      void publishSnapshot(current);
      for (const assignment of current.assignments) {
        if (assignment.nodeId !== session.localNodeId && session.liveNodeIds.includes(assignment.nodeId)) {
          void sendProjection(assignment.nodeId, current);
        }
      }
    }, 12_000);
    return () => clearInterval(interval);
  }, [publishSnapshot, sendProjection, session]);

  useEffect(() => () => {
    for (const pending of pendingRef.current.values()) {
      clearTimeout(pending.timer);
      if (pending.kind === 'submission') pending.resolve({ accepted: false, code: 'INVALID_STAGE' });
      else pending.resolve(false);
    }
    pendingRef.current.clear();
  }, []);

  const hostStart = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current;
    if (!game || !current || !session.isHost || session.connectionState !== 'connected') return false;
    const startedAt = toSessionTimestamp(Date.now() + (session.clockEstimate?.offsetMs ?? 0));
    const next = startForgeLiveRun(current, game, session.liveNodeIds, startedAt);
    if (next === current) return false;
    commit(next);
    try {
      await publishSnapshot(next);
      return true;
    } catch {
      commit(current);
      return false;
    }
  }, [commit, game, publishSnapshot, session]);

  const submit = useCallback(async (submission: ForgeStageSubmission): Promise<ForgeSubmissionResult> => {
    const current = stateRef.current;
    if (!current || current.status !== 'playing' || session.connectionState !== 'connected') {
      return { accepted: false, code: 'INVALID_STAGE' };
    }
    const validSubmission = forgeSubmission(submission);
    if (session.isHost) {
      if (!game) return { accepted: false, code: 'INVALID_STAGE' };
      const acceptedAt = toSessionTimestamp(Date.now() + (session.clockEstimate?.offsetMs ?? 0));
      const reduced = reduceForgeLiveSubmission(
        current,
        game,
        session.localNodeId,
        current.stageIndex,
        validSubmission,
        acceptedAt,
      );
      if (reduced.changed) {
        commit(reduced.state);
        void publishSnapshot(reduced.state);
      }
      return reduced.result;
    }
    const hostNodeId = current.hostNodeId;
    const requestId = createRelayId('forge-answer');
    return new Promise<ForgeSubmissionResult>((resolve) => {
      const timer = setTimeout(() => {
        pendingRef.current.delete(requestId);
        resolve({ accepted: false, code: 'INVALID_STAGE' });
      }, REQUEST_TIMEOUT_MS);
      pendingRef.current.set(requestId, { kind: 'submission', resolve, timer });
      void session.publishDirect(hostNodeId, {
        kind: 'forge.submit',
        protocolVersion: 1,
        caseId,
        operationId: current.operationId,
        requestId,
        stageIndex: current.stageIndex,
        submission: validSubmission,
      } satisfies ForgeLiveDirectMessage).catch(() => {
        clearTimeout(timer);
        pendingRef.current.delete(requestId);
        resolve({ accepted: false, code: 'INVALID_STAGE' });
      });
    });
  }, [caseId, commit, game, publishSnapshot, session]);

  const revealHint = useCallback(async (): Promise<number | false> => {
    const current = stateRef.current;
    if (!current || current.status !== 'playing' || session.connectionState !== 'connected') return false;
    if (session.isHost) {
      if (!game) return false;
      const reduced = revealForgeLiveHint(current, game, session.localNodeId, current.stageIndex);
      if (reduced.state !== current) {
        commit(reduced.state);
        void publishSnapshot(reduced.state);
      }
      return reduced.accepted ? reduced.count : false;
    }
    const requestId = createRelayId('forge-hint');
    return new Promise<number | false>((resolve) => {
      const timer = setTimeout(() => {
        pendingRef.current.delete(requestId);
        resolve(false);
      }, REQUEST_TIMEOUT_MS);
      pendingRef.current.set(requestId, { kind: 'hint', resolve, timer });
      void session.publishDirect(current.hostNodeId, {
        kind: 'forge.hint',
        protocolVersion: 1,
        caseId,
        operationId: current.operationId,
        requestId,
        stageIndex: current.stageIndex,
      } satisfies ForgeLiveDirectMessage).catch(() => {
        clearTimeout(timer);
        pendingRef.current.delete(requestId);
        resolve(false);
      });
    });
  }, [caseId, commit, game, publishSnapshot, session]);

  const abort = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current;
    if (!current || !session.isHost || session.connectionState !== 'connected') return false;
    const abortedAt = toSessionTimestamp(Date.now() + (session.clockEstimate?.offsetMs ?? 0));
    const next = abortForgeLiveRun(current, session.localNodeId, abortedAt);
    if (next === current) return false;
    commit(next);
    try {
      await publishSnapshot(next);
      return true;
    } catch {
      commit(current);
      return false;
    }
  }, [commit, publishSnapshot, session]);

  useEffect(() => {
    if (!game || !state || !session.isHost) return;
    setProjection(forgePlayerProjectionForNode(game, state, session.localNodeId));
  }, [game, session.isHost, session.localNodeId, state]);

  const missingNodeIds = useMemo(
    () => state ? missingForgeLiveNodeIds(state, session.liveNodeIds) : [],
    [session.liveNodeIds, state],
  );

  return {
    abort,
    connectionState: session.connectionState,
    isHost: session.isHost,
    lastError: lastError ?? session.error,
    liveNodeIds: session.liveNodeIds,
    localNodeId: session.localNodeId,
    missingNodeIds,
    projection,
    reconnect: session.reconnect,
    revealHint,
    sessionCode: session.sessionId,
    state,
    submit,
    hostStart,
  };
}

function samePlayerProjection(left: ForgePlayerCase | undefined, right: ForgePlayerCase): boolean {
  if (!left || left.id !== right.id || left.role.playerId !== right.role.playerId) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

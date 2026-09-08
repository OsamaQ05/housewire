import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CircuitRaceSubmission, CompiledCircuitRace } from '@/src/domain/circuit-race';
import {
  acceptTeamEscapeRaceStart,
  createPracticeTeamEscapeRace,
  createTeamEscapeRaceStartEvent,
  simulatePracticeTeamEscapeRace,
  type TeamEscapeRaceProofRejectionReason,
  type TeamEscapeRaceState,
} from '@/src/domain/team-escape-race';
import {
  toSessionTimestamp,
  useHousewireSessionContext,
} from '@/src/features/session';
import { createRelayId } from '@/src/features/session/relay-id';

import {
  acceptCircuitRaceSnapshotFrame,
  acceptCircuitRaceStartFrame,
  createCircuitRacePlayerSnapshot,
  createCircuitRaceProofSubmissionFromSnapshot,
  createCircuitRaceProofSubmissionFromState,
  isCircuitRacePendingProofAcknowledged,
  projectCircuitRacePlayerSnapshot,
  reduceCircuitRaceProofFrame,
  type CircuitRacePlayerView,
} from './coordinator';
import {
  makeCircuitRaceProofResultMessage,
  makeCircuitRaceSnapshotMessage,
  makeCircuitRaceSnapshotRequestMessage,
  makeCircuitRaceStartMessage,
  isCircuitRaceLivePlayerCount,
  parseCircuitRaceDirectMessage,
  type CircuitRacePlayerSnapshot,
  type CircuitRaceProofResultMessage,
} from './protocol';

const PROOF_RESULT_TIMEOUT_MS = 9_000;
const SNAPSHOT_REPLAY_INTERVAL_MS = 8_000;

export interface UseCircuitRaceCoordinatorOptions {
  raceId: string;
  course: CompiledCircuitRace;
  mode?: 'live' | 'practice';
  teamIds?: readonly string[];
  tieWindowMs?: number;
  countdownMs?: number;
  practice?: {
    includeLocalTeamBots?: boolean;
    paceMs?: number;
    simulatedPlayerCount?: number;
  };
}

export interface CircuitRaceLiveStartOptions {
  countdownMs?: number;
  participantNodeIds?: readonly string[];
}

export type CircuitRaceStartResult =
  | { started: true; operationId: string; undeliveredNodeIds: readonly string[] }
  | {
      started: false;
      reason: 'WRONG_MODE' | 'NOT_HOST' | 'OFFLINE' | 'ALREADY_STARTED' | 'PLAYERS' | 'INVALID_SETUP';
    };

export type CircuitRaceSubmitFailureReason =
  | TeamEscapeRaceProofRejectionReason
  | 'NO_RACE'
  | 'NOT_RUNNING'
  | 'OFFLINE'
  | 'INVALID_LOCAL_PROOF'
  | 'DELIVERY_FAILED'
  | 'TIMEOUT';

export type CircuitRaceSubmitResult =
  | { accepted: true; changed: boolean; revision: number }
  | { accepted: false; changed: false; reason: CircuitRaceSubmitFailureReason; revision: number };

interface PendingProof {
  checkpoint: {
    operationId: string;
    revision: number;
    stageIndex: number;
  };
  resolve: (result: CircuitRaceSubmitResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function useCircuitRaceCoordinator(options: UseCircuitRaceCoordinatorOptions) {
  const session = useHousewireSessionContext();
  const mode = options.mode ?? 'live';
  const [authorityState, setAuthorityState] = useState<TeamEscapeRaceState>();
  const [snapshot, setSnapshot] = useState<CircuitRacePlayerSnapshot>();
  const [lastError, setLastError] = useState<string>();
  const [serverNow, setServerNow] = useState(() => Date.now());
  const authorityStateRef = useRef(authorityState);
  const snapshotRef = useRef(snapshot);
  const processedDirectIdsRef = useRef(new Set<string>());
  const pendingProofsRef = useRef(new Map<string, PendingProof>());
  const snapshotRequestKeyRef = useRef<string | undefined>(undefined);
  const assignmentPlanKey = `${mode}:${options.course.seed}:${options.raceId}:${session.localNodeId}:${session.sessionId}`;
  const liveAssignmentPlanRef = useRef({
    key: assignmentPlanKey,
    seed: createLiveAssignmentSeed(options.course.seed),
  });
  if (liveAssignmentPlanRef.current.key !== assignmentPlanKey) {
    liveAssignmentPlanRef.current = {
      key: assignmentPlanKey,
      seed: createLiveAssignmentSeed(options.course.seed),
    };
  }

  const estimatedServerNow = useCallback(() => toSessionTimestamp(
    Date.now() + (mode === 'live' ? (session.clockEstimate?.offsetMs ?? 0) : 0),
  ), [mode, session.clockEstimate?.offsetMs]);

  const commitSnapshot = useCallback((next: CircuitRacePlayerSnapshot | undefined) => {
    if (next) {
      for (const [requestId, pending] of pendingProofsRef.current) {
        if (!isCircuitRacePendingProofAcknowledged(pending.checkpoint, next)) continue;
        clearTimeout(pending.timer);
        pendingProofsRef.current.delete(requestId);
        pending.resolve({ accepted: true, changed: true, revision: next.revision });
      }
    }
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const commitAuthority = useCallback((next: TeamEscapeRaceState | undefined) => {
    authorityStateRef.current = next;
    setAuthorityState(next);
    commitSnapshot(next
      ? createCircuitRacePlayerSnapshot(next, options.raceId, session.localNodeId, options.course)
      : undefined);
  }, [commitSnapshot, options.course, options.raceId, session.localNodeId]);

  const sendSnapshot = useCallback(async (
    recipientNodeId: string,
    state: TeamEscapeRaceState,
  ): Promise<boolean> => {
    if (mode !== 'live' || !session.isHost || session.connectionState !== 'connected') return false;
    try {
      const privateSnapshot = createCircuitRacePlayerSnapshot(state, options.raceId, recipientNodeId, options.course);
      await session.publishDirect(recipientNodeId, makeCircuitRaceSnapshotMessage(privateSnapshot));
      return true;
    } catch {
      return false;
    }
  }, [mode, options.course, options.raceId, session]);

  const fanoutSnapshots = useCallback(async (state: TeamEscapeRaceState): Promise<string[]> => {
    const recipients = state.participants
      .filter((participant) => !participant.simulated && participant.nodeId !== session.localNodeId)
      .map((participant) => participant.nodeId);
    const delivered = await Promise.all(recipients.map(async (nodeId) => ({
      nodeId,
      delivered: await sendSnapshot(nodeId, state),
    })));
    return delivered.filter((item) => !item.delivered).map((item) => item.nodeId);
  }, [sendSnapshot, session.localNodeId]);

  const requestSnapshot = useCallback(async (): Promise<boolean> => {
    if (
      mode !== 'live' ||
      session.isHost ||
      !session.hostNodeId ||
      session.connectionState !== 'connected'
    ) return false;
    const current = snapshotRef.current;
    try {
      await session.publishDirect(session.hostNodeId, makeCircuitRaceSnapshotRequestMessage({
        raceId: options.raceId,
        requestId: createRelayId('race-state'),
        knownOperationId: current?.operationId,
        knownRevision: current?.revision,
      }));
      return true;
    } catch {
      setLastError('The race host did not receive the reconnect request.');
      return false;
    }
  }, [mode, options.raceId, session]);

  useEffect(() => {
    processedDirectIdsRef.current.clear();
    snapshotRequestKeyRef.current = undefined;
    for (const pending of pendingProofsRef.current.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ accepted: false, changed: false, reason: 'NO_RACE', revision: 0 });
    }
    pendingProofsRef.current.clear();
    authorityStateRef.current = undefined;
    snapshotRef.current = undefined;
    setAuthorityState(undefined);
    setSnapshot(undefined);
    setLastError(undefined);
  }, [mode, options.course.seed, options.raceId, session.localNodeId, session.sessionId]);

  useEffect(() => {
    const interval = setInterval(() => setServerNow(estimatedServerNow()), 250);
    setServerNow(estimatedServerNow());
    return () => clearInterval(interval);
  }, [estimatedServerNow]);

  useEffect(() => {
    if (mode !== 'live' || !session.enabled || session.directFeed.length === 0) return;
    for (const item of session.directFeed) {
      if (processedDirectIdsRef.current.has(item.messageId)) continue;
      const message = parseCircuitRaceDirectMessage(item.payload);
      if (!message || message.raceId !== options.raceId) continue;
      if (!session.isHost && !session.hostNodeId) continue;

      processedDirectIdsRef.current.add(item.messageId);
      session.consumeDirect(item.messageId);

      if (session.isHost && message.kind === 'circuit-race.snapshot.request') {
        const current = authorityStateRef.current;
        if (current?.participants.some((participant) => participant.nodeId === item.senderId)) {
          void sendSnapshot(item.senderId, current);
        }
        continue;
      }

      if (session.isHost && message.kind === 'circuit-race.proof.submit') {
        const current = authorityStateRef.current;
        if (!current) continue;
        const handled = reduceCircuitRaceProofFrame(current, item, {
          course: options.course,
          hostNodeId: session.localNodeId,
          raceId: options.raceId,
        });
        if (!handled) continue;
        const { reduction, requestId } = handled;
        if (reduction.changed) {
          commitAuthority(reduction.state);
          void fanoutSnapshots(reduction.state);
        } else {
          void sendSnapshot(item.senderId, reduction.state);
        }
        void session.publishDirect(item.senderId, makeCircuitRaceProofResultMessage({
          raceId: options.raceId,
          operationId: current.operationId,
          requestId,
          accepted: reduction.accepted,
          changed: reduction.changed,
          reason: reduction.reason,
          revision: reduction.state.revision,
        })).catch(() => undefined);
        continue;
      }

      if (!session.isHost && message.kind === 'circuit-race.start') {
        const accepted = acceptCircuitRaceStartFrame(item, {
          expectedHostNodeId: session.hostNodeId!,
          localNodeId: session.localNodeId,
          raceId: options.raceId,
        });
        if (!accepted.accepted) {
          setLastError('The host sent a race start that could not be verified.');
          continue;
        }
        const current = snapshotRef.current;
        if (
          !current ||
          accepted.snapshot.operationId === current.operationId && accepted.snapshot.revision > current.revision ||
          accepted.snapshot.operationId !== current.operationId && accepted.snapshot.startsAt > current.startsAt
        ) {
          commitSnapshot(accepted.snapshot);
          setLastError(undefined);
        }
        continue;
      }

      if (!session.isHost && message.kind === 'circuit-race.snapshot') {
        const accepted = acceptCircuitRaceSnapshotFrame(item, {
          current: snapshotRef.current,
          expectedHostNodeId: session.hostNodeId!,
          localNodeId: session.localNodeId,
          raceId: options.raceId,
        });
        if (accepted.accepted && accepted.changed) {
          commitSnapshot(accepted.snapshot);
          setLastError(undefined);
        }
        continue;
      }

      if (!session.isHost && message.kind === 'circuit-race.proof.result') {
        const current = snapshotRef.current;
        if (
          item.senderId !== session.hostNodeId ||
          !current ||
          message.operationId !== current.operationId
        ) continue;
        const pending = pendingProofsRef.current.get(message.requestId);
        if (!pending) continue;
        pendingProofsRef.current.delete(message.requestId);
        clearTimeout(pending.timer);
        pending.resolve(resultFromHostMessage(message));
        if (message.accepted && message.revision > current.revision) void requestSnapshot();
      }
    }
    if (processedDirectIdsRef.current.size > 192) {
      processedDirectIdsRef.current = new Set(
        session.directFeed
          .filter((item) => parseCircuitRaceDirectMessage(item.payload)?.raceId === options.raceId)
          .map((item) => item.messageId),
      );
    }
  }, [
    commitAuthority,
    commitSnapshot,
    fanoutSnapshots,
    mode,
    options.course,
    options.raceId,
    requestSnapshot,
    sendSnapshot,
    session,
  ]);

  useEffect(() => {
    if (
      mode !== 'live' ||
      session.isHost ||
      session.connectionState !== 'connected' ||
      !session.hostNodeId
    ) {
      if (session.connectionState !== 'connected') snapshotRequestKeyRef.current = undefined;
      return;
    }
    const key = `${session.sessionId}:${session.localNodeId}:${session.hostNodeId}`;
    if (snapshotRequestKeyRef.current === key) return;
    snapshotRequestKeyRef.current = key;
    void requestSnapshot().then((delivered) => {
      if (!delivered) snapshotRequestKeyRef.current = undefined;
    });
  }, [mode, requestSnapshot, session.connectionState, session.hostNodeId, session.isHost, session.localNodeId, session.sessionId]);

  useEffect(() => {
    if (mode !== 'live' || !session.isHost || session.connectionState !== 'connected') return;
    const interval = setInterval(() => {
      const current = authorityStateRef.current;
      if (current) void fanoutSnapshots(current);
    }, SNAPSHOT_REPLAY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fanoutSnapshots, mode, session.connectionState, session.isHost]);

  useEffect(() => {
    if (mode !== 'practice') return;
    const interval = setInterval(() => {
      const current = authorityStateRef.current;
      if (!current || current.mode !== 'practice') return;
      const tick = simulatePracticeTeamEscapeRace(current, Date.now(), {
        includeLocalTeamBots: options.practice?.includeLocalTeamBots,
        paceMs: options.practice?.paceMs,
      });
      if (tick.state !== current) commitAuthority(tick.state);
    }, 350);
    return () => clearInterval(interval);
  }, [commitAuthority, mode, options.practice?.includeLocalTeamBots, options.practice?.paceMs]);

  useEffect(() => () => {
    for (const pending of pendingProofsRef.current.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ accepted: false, changed: false, reason: 'NO_RACE', revision: snapshotRef.current?.revision ?? 0 });
    }
    pendingProofsRef.current.clear();
  }, []);

  const startLive = useCallback(async (
    startOptions: CircuitRaceLiveStartOptions = {},
  ): Promise<CircuitRaceStartResult> => {
    if (mode !== 'live') return { started: false, reason: 'WRONG_MODE' };
    if (!session.isHost) return { started: false, reason: 'NOT_HOST' };
    if (session.connectionState !== 'connected') return { started: false, reason: 'OFFLINE' };
    if (authorityStateRef.current) return { started: false, reason: 'ALREADY_STARTED' };
    const live = new Set(session.liveNodeIds);
    const participantNodeIds = [...new Set(startOptions.participantNodeIds ?? session.liveNodeIds)]
      .sort((left, right) => left.localeCompare(right));
    if (
      !isCircuitRaceLivePlayerCount(participantNodeIds.length) ||
      !participantNodeIds.includes(session.localNodeId) ||
      participantNodeIds.some((nodeId) => !live.has(nodeId))
    ) return { started: false, reason: 'PLAYERS' };
    const nodeById = new Map([
      ...session.peers.map((node) => [node.id, node] as const),
      [session.node.id, session.node] as const,
    ]);
    const now = estimatedServerNow();
    try {
      const event = createTeamEscapeRaceStartEvent({
        hostNodeId: session.localNodeId,
        mode: 'live',
        operationId: createRelayId('race'),
        participants: participantNodeIds.map((nodeId) => ({
          nodeId,
          label: nodeById.get(nodeId)?.label ?? `Phone ${participantNodeIds.indexOf(nodeId) + 1}`,
          // Skill is deliberately neutral because the signed start is visible
          // to every participant; private ratings do not belong in the wire format.
          skill: 5,
          simulated: false,
        })),
        // Assignment randomness is deliberately unrelated to the private
        // content seed, which never crosses the wire.
        seed: liveAssignmentPlanRef.current.seed,
        stages: options.course.stages.map((stage, index) => ({
          id: stage.id,
          label: stage.title,
          proofIds: [createRelayId(`circuit${index + 1}`)],
        })),
        startsAt: now + Math.max(1_000, Math.min(10_000, startOptions.countdownMs ?? options.countdownMs ?? 3_000)),
        teamIds: options.teamIds,
        tieWindowMs: options.tieWindowMs,
      });
      const accepted = acceptTeamEscapeRaceStart({
        event,
        eventId: createRelayId('race-start'),
        senderId: session.localNodeId,
        serverTime: now,
      }, session.localNodeId);
      if (!accepted.accepted) return { started: false, reason: 'INVALID_SETUP' };
      commitAuthority(accepted.state);
      const guests = participantNodeIds.filter((nodeId) => nodeId !== session.localNodeId);
      const deliveries = await Promise.all(guests.map(async (nodeId) => {
        try {
          const message = makeCircuitRaceStartMessage(
            options.raceId,
            event,
            createCircuitRacePlayerSnapshot(accepted.state, options.raceId, nodeId, options.course).course,
          );
          await session.publishDirect(nodeId, message);
          return { delivered: true, nodeId };
        } catch {
          return { delivered: false, nodeId };
        }
      }));
      const snapshotFailures = await fanoutSnapshots(accepted.state);
      const undeliveredNodeIds = [...new Set([
        ...deliveries.filter((delivery) => !delivery.delivered).map((delivery) => delivery.nodeId),
        ...snapshotFailures,
      ])];
      return { started: true, operationId: event.operationId, undeliveredNodeIds };
    } catch {
      return { started: false, reason: 'INVALID_SETUP' };
    }
  }, [commitAuthority, estimatedServerNow, fanoutSnapshots, mode, options, session]);

  const startPractice = useCallback((): CircuitRaceStartResult => {
    if (mode !== 'practice') return { started: false, reason: 'WRONG_MODE' };
    if (authorityStateRef.current) return { started: false, reason: 'ALREADY_STARTED' };
    try {
      const now = Date.now();
      const practice = createPracticeTeamEscapeRace({
        localNodeId: session.localNodeId,
        operationId: createRelayId('practice-race'),
        seed: options.course.seed,
        simulatedPlayerCount: Math.max(1, Math.min(3, options.practice?.simulatedPlayerCount ?? 3)),
        stages: options.course.stages.map((stage) => ({
          id: stage.id,
          label: stage.title,
          proofIds: [stage.proofId],
        })),
        startsAt: now + Math.max(1_000, Math.min(10_000, options.countdownMs ?? 3_000)),
        teamIds: options.teamIds,
        tieWindowMs: options.tieWindowMs,
      });
      commitAuthority(practice);
      return { started: true, operationId: practice.operationId, undeliveredNodeIds: [] };
    } catch {
      return { started: false, reason: 'INVALID_SETUP' };
    }
  }, [commitAuthority, mode, options, session.localNodeId]);

  const submitStage = useCallback(async (
    submission: CircuitRaceSubmission,
    revealedHintCount = 0,
  ): Promise<CircuitRaceSubmitResult> => {
    const currentSnapshot = snapshotRef.current;
    const revision = currentSnapshot?.revision ?? 0;
    if (!currentSnapshot) return { accepted: false, changed: false, reason: 'NO_RACE', revision };
    const now = estimatedServerNow();
    if (now < currentSnapshot.startsAt || currentSnapshot.ownTeam.finishedAt !== undefined) {
      return { accepted: false, changed: false, reason: 'NOT_RUNNING', revision };
    }
    if (mode === 'live' && session.connectionState !== 'connected') {
      return { accepted: false, changed: false, reason: 'OFFLINE', revision };
    }
    const currentStage = currentSnapshot.stages[currentSnapshot.ownTeam.stageIndex];
    const proofId = currentStage?.proofIds[0];
    if (!proofId) return { accepted: false, changed: false, reason: 'INVALID_LOCAL_PROOF', revision };
    const requestId = createRelayId('race-proof');
    if (authorityStateRef.current) {
      const current = authorityStateRef.current;
      let message;
      try {
        message = createCircuitRaceProofSubmissionFromState({
          raceId: options.raceId,
          state: current,
          nodeId: session.localNodeId,
          proofId,
          observedAt: now,
          requestId,
          submission,
          revealedHintCount,
        });
      } catch {
        return { accepted: false, changed: false, reason: 'INVALID_LOCAL_PROOF', revision };
      }
      if (!message) return { accepted: false, changed: false, reason: 'INVALID_LOCAL_PROOF', revision };
      const handled = reduceCircuitRaceProofFrame(current, {
        messageId: requestId,
        payload: message,
        recipientId: session.localNodeId,
        senderId: session.localNodeId,
        serverTime: now,
      }, { course: options.course, hostNodeId: current.hostNodeId, raceId: options.raceId });
      if (!handled) return { accepted: false, changed: false, reason: 'INVALID_LOCAL_PROOF', revision };
      const { reduction } = handled;
      if (reduction.changed) {
        commitAuthority(reduction.state);
        if (mode === 'live') void fanoutSnapshots(reduction.state);
      }
      return reduction.accepted
        ? { accepted: true, changed: reduction.changed, revision: reduction.state.revision }
        : {
            accepted: false,
            changed: false,
            reason: reduction.reason ?? 'INVALID_LOCAL_PROOF',
            revision: reduction.state.revision,
          };
    }

    let message;
    try {
      message = createCircuitRaceProofSubmissionFromSnapshot({
        snapshot: currentSnapshot,
        nodeId: session.localNodeId,
        proofId,
        observedAt: now,
        requestId,
        submission,
        revealedHintCount,
      });
    } catch {
      return { accepted: false, changed: false, reason: 'INVALID_LOCAL_PROOF', revision };
    }
    if (!message) return { accepted: false, changed: false, reason: 'INVALID_LOCAL_PROOF', revision };
    return new Promise<CircuitRaceSubmitResult>((resolve) => {
      const timer = setTimeout(() => {
        pendingProofsRef.current.delete(requestId);
        resolve({ accepted: false, changed: false, reason: 'TIMEOUT', revision: snapshotRef.current?.revision ?? revision });
      }, PROOF_RESULT_TIMEOUT_MS);
      pendingProofsRef.current.set(requestId, {
        checkpoint: {
          operationId: currentSnapshot.operationId,
          revision,
          stageIndex: currentSnapshot.ownTeam.stageIndex,
        },
        resolve,
        timer,
      });
      void session.publishDirect(currentSnapshot.hostNodeId, message).catch(() => {
        clearTimeout(timer);
        pendingProofsRef.current.delete(requestId);
        resolve({ accepted: false, changed: false, reason: 'DELIVERY_FAILED', revision: snapshotRef.current?.revision ?? revision });
      });
    });
  }, [commitAuthority, estimatedServerNow, fanoutSnapshots, mode, options.course, options.raceId, session]);

  const view = useMemo<CircuitRacePlayerView | undefined>(() => snapshot
    ? projectCircuitRacePlayerSnapshot(
        snapshot,
        serverNow,
        mode === 'practice' ? snapshot.participants.map((participant) => participant.nodeId) : session.liveNodeIds,
      )
    : undefined,
  [mode, serverNow, session.liveNodeIds, snapshot]);

  const lobbyParticipants = useMemo(() => {
    const ids = new Set(session.liveNodeIds);
    return [session.node, ...session.peers]
      .filter((node, index, nodes) => ids.has(node.id) && nodes.findIndex((candidate) => candidate.id === node.id) === index)
      .sort((left, right) => left.nodeNumber - right.nodeNumber || left.id.localeCompare(right.id));
  }, [session.liveNodeIds, session.node, session.peers]);

  return {
    /** Full proof state exists only on the live host or the local practice device. */
    authorityState,
    canHostStart: mode === 'live' && session.isHost && session.connectionState === 'connected' &&
      isCircuitRaceLivePlayerCount(lobbyParticipants.length) && !authorityState,
    connectionState: mode === 'practice' ? 'connected' as const : session.connectionState,
    isHost: mode === 'practice' || session.isHost,
    lastError: lastError ?? (mode === 'live' ? session.error : undefined),
    lobbyAssignmentSeed: liveAssignmentPlanRef.current.seed,
    lobbyParticipants,
    localNodeId: session.localNodeId,
    reconnect: session.reconnect,
    requestSnapshot,
    sessionCode: session.sessionId,
    snapshot,
    startLive,
    startPractice,
    submitStage,
    view,
  };
}

function createLiveAssignmentSeed(excludedSeed: number): number {
  const candidate = (Date.now() ^ Math.floor(Math.random() * 0xffff_ffff)) >>> 0;
  return candidate === excludedSeed ? (candidate + 1) >>> 0 : candidate;
}

function resultFromHostMessage(message: CircuitRaceProofResultMessage): CircuitRaceSubmitResult {
  return message.accepted
    ? { accepted: true, changed: message.changed, revision: message.revision }
    : {
        accepted: false,
        changed: false,
        reason: message.reason ?? 'INVALID_LOCAL_PROOF',
        revision: message.revision,
      };
}

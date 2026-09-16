import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHousewireStore } from '@/src/store/use-housewire-store';

import { useHousewireSessionContext } from '../session/HousewireSessionProvider';
import { createRelayId } from '../session/relay-id';
import { createStoryState, expireStoryState, projectStoryView, reduceStoryAction } from './engine';
import { acceptStorySnapshot, authenticateStoryAction, makeStorySnapshot, storyRequestSchema } from './story-protocol';
import { storyCheckpointKey, useStoryStore } from './story-store';
import type { ActivityMove } from './activities/contracts';
import { STORY_CONTENT_VERSION, type StoryAction, type StoryPlayer, type StoryRoomId, type StoryState } from './types';

const terminal = (state: StoryState) => ['won', 'failed', 'aborted'].includes(state.status);

/** A frozen cast and one authoritative board, shared by briefing and playing screens. */
export function useStoryRoom(roomId: StoryRoomId, options: { coordinator?: boolean } = {}) {
  const coordinator = options.coordinator === true;
  const activeMission = useHousewireStore((store) => store.missionInProgressId);
  const session = useHousewireSessionContext();
  const shared = session.enabled;
  const localId = session.localNodeId;
  const isHost = !shared || session.isHost;
  const hostId = shared ? (session.hostNodeId ?? 'local') : localId;
  const checkpointKey = storyCheckpointKey(roomId, shared ? session.sessionId : 'practice', localId);
  const state = useStoryStore((store) => {
    const saved = store.checkpoints[checkpointKey]?.state;
    return saved?.contentVersion === STORY_CONTENT_VERSION ? saved : undefined;
  });
  const hydrated = useStoryStore((store) => store.hydrated);
  const storageError = useStoryStore((store) => store.storageError);
  const runtime = useStoryStore((store) => store.runtime[checkpointKey]);
  const [localError, setLocalError] = useState<string>();
  const [practicePlayerId, setPracticePlayerId] = useState(localId);
  const [clock, setClock] = useState(Date.now());
  const seenEvents = useRef(new Set<string>());
  const lastSnapshotRequest = useRef(0);
  const lastPublished = useRef(0);
  const activePlayerId = shared ? localId : practicePlayerId;
  const { publish, publishReliable, connectionState, clearError } = session;

  const current = useCallback(() => {
    const saved = useStoryStore.getState().checkpoints[checkpointKey]?.state;
    return saved?.contentVersion === STORY_CONTENT_VERSION ? saved : undefined;
  }, [checkpointKey]);
  const save = useCallback((next: StoryState) => useStoryStore.getState().save(checkpointKey, next), [checkpointKey]);
  const now = shared && !isHost ? clock + (runtime?.clockOffset ?? 0) : clock;
  const receivedOperationId = runtime?.operationId;

  const connectedPlayers = useMemo<StoryPlayer[]>(() => {
    if (!shared) return [{ id: localId, name: 'You' }, { id: 'practice-player', name: 'Partner' }];
    return session.liveNodeIds.map((id) => ({
      id, name: id === localId ? session.node.label : (session.peers.find((peer) => peer.id === id)?.label ?? 'Player'),
    })).sort((left, right) => left.id === hostId ? -1 : right.id === hostId ? 1 : left.id.localeCompare(right.id));
  }, [shared, localId, hostId, session.liveNodeIds, session.node.label, session.peers]);
  const players = state?.players ?? connectedPlayers;
  const view = useMemo(() => !coordinator && state && state.players.some((player) => player.id === activePlayerId)
    ? projectStoryView(state, activePlayerId) : undefined, [activePlayerId, coordinator, state]);

  useEffect(() => { void useStoryStore.getState().hydrate(); }, []);
  useEffect(() => {
    seenEvents.current.clear();
    lastSnapshotRequest.current = 0;
    setPracticePlayerId(localId);
    setLocalError(undefined);
  }, [checkpointKey, localId]);

  const announce = useCallback(async (next: StoryState, reliable = false) => {
    if (!shared || !isHost) return;
    const snapshot = makeStorySnapshot(next, Date.now());
    lastPublished.current = Date.now();
    if (reliable) await publishReliable(snapshot, { eventId: createRelayId('story-state') });
    else if (connectionState === 'connected') await publish(snapshot);
  }, [connectionState, isHost, publish, publishReliable, shared]);

  const requestSnapshot = useCallback(async () => {
    if (!shared || isHost || connectionState !== 'connected') return;
    lastSnapshotRequest.current = Date.now();
    await publish({ kind: 'story.request', roomId, nodeId: localId, knownOperationId: current()?.operationId, sentAt: Date.now() });
  }, [shared, isHost, connectionState, publish, roomId, localId, current]);

  useEffect(() => {
    if (!hydrated || !shared || connectionState !== 'connected') return;
    const restored = current();
    if (isHost && coordinator && restored && (activeMission === roomId || terminal(restored))) {
      const next = expireStoryState(restored, Date.now());
      if (next !== restored) save(next);
      void announce(next).catch(() => undefined);
    } else if (!isHost && (!coordinator || activeMission === roomId)) void requestSnapshot().catch(() => undefined);
  }, [activeMission, announce, connectionState, coordinator, current, hydrated, isHost, requestSnapshot, roomId, save, shared]);

  useEffect(() => {
    if (!hydrated || !shared || !coordinator) return;
    for (const item of session.feed) {
      const event = item.event;
      if (!event.kind.startsWith('story.') || !('roomId' in event) || event.roomId !== roomId || seenEvents.current.has(item.eventId)) continue;
      // A just-started run can arrive before root navigation updates its active
      // mission. Leave that action unread until the root switches the scope.
      if (isHost && event.kind === 'story.action' && activeMission !== roomId) continue;
      seenEvents.current.add(item.eventId);
      if (seenEvents.current.size > 768) seenEvents.current = new Set([...seenEvents.current].slice(-384));
      const previous = current();
      if (event.kind === 'story.snapshot' && !isHost) {
        const accepted = acceptStorySnapshot({ raw: event, senderId: item.senderId, hostNodeId: hostId, localNodeId: localId, roomId, current: previous });
        if (!accepted) continue;
        // Server-stamped arrival compensates for replay age; fresh requests refine this after reconnect.
        const serverNow = session.clockEstimate ? Date.now() + session.clockEstimate.offsetMs : item.serverTime;
        const clockOffset = accepted.sentAt + Math.max(0, serverNow - item.serverTime) - Date.now();
        if (!previous || accepted.state.revision !== previous.revision || accepted.state.operationId !== previous.operationId) save(accepted.state);
        useStoryStore.getState().updateRuntime(checkpointKey, { operationId: accepted.operationId, clockOffset, error: undefined });
      } else if (event.kind === 'story.action' && isHost && previous) {
        const action = authenticateStoryAction(previous, event, item.senderId);
        if (!action) continue;
        const next = reduceStoryAction(previous, action, item.senderId, Date.now());
        if (next !== previous) {
          save(next);
          void announce(next, true).catch(() => useStoryStore.getState().updateRuntime(checkpointKey, { error: 'Your room is saved. Reconnect to send the latest board.' }));
        }
      } else if (event.kind === 'story.request' && isHost && previous) {
        const request = storyRequestSchema.safeParse(event);
        if (request.success && request.data.nodeId === item.senderId && previous.players.some((player) => player.id === item.senderId)) {
          const next = expireStoryState(previous, Date.now());
          if (next !== previous) save(next);
          void announce(next).catch(() => undefined);
        }
      }
    }
  }, [activeMission, announce, checkpointKey, coordinator, current, hostId, hydrated, isHost, localId, roomId, save, session.clockEstimate, session.feed, shared]);

  useEffect(() => {
    // Hidden global drivers never create practice games or run their clocks.
    if (coordinator && (!shared || activeMission !== roomId)) return;
    const timer = setInterval(() => {
      if (!coordinator) setClock(Date.now());
      if (!hydrated) return;
      // Visible live screens display state; the root driver alone advances it.
      if (shared && !coordinator) return;
      const previous = current();
      if (isHost && previous) {
        const next = expireStoryState(previous, Date.now());
        if (next !== previous) { save(next); void announce(next, true).catch(() => undefined); }
        else if (shared && !terminal(next) && Date.now() - lastPublished.current >= 5_000) void announce(next).catch(() => undefined);
      } else if (shared && Date.now() - lastSnapshotRequest.current >= 8_000) void requestSnapshot().catch(() => undefined);
    }, 500);
    return () => clearInterval(timer);
  }, [activeMission, announce, coordinator, current, hydrated, isHost, requestSnapshot, roomId, save, shared]);

  const begin = useCallback(async (): Promise<boolean> => {
    setLocalError(undefined);
    await useStoryStore.getState().hydrate();
    if (!isHost) { setLocalError('The host starts this room. Your role will arrive here.'); return false; }
    if (shared && connectionState !== 'connected') { setLocalError('Reconnect to the house before starting together.'); return false; }
    if (connectedPlayers.length < 2 || connectedPlayers.length > 4) { setLocalError('Join at least two phones, or choose one-phone practice.'); return false; }
    if (shared && activeMission && activeMission !== roomId) {
      const previousKey = storyCheckpointKey(activeMission, session.sessionId, localId);
      const old = useStoryStore.getState().checkpoints[previousKey]?.state;
      if (old?.contentVersion === STORY_CONTENT_VERSION && !terminal(old)) {
        const ended = reduceStoryAction(old, { kind: 'abort', id: createRelayId('story-end'), stageIndex: old.stageIndex }, localId, Date.now());
        useStoryStore.getState().save(previousKey, ended);
        try { await announce(ended, true); }
        catch { setLocalError('The previous room is saved. Reconnect before opening a new one together.'); return false; }
      }
    }
    const previous = current();
    const startsAt = Math.max(Date.now(), (previous?.startedAt ?? 0) + 1);
    const next = createStoryState(roomId, connectedPlayers, Math.floor(Math.random() * 0xffff_ffff), createRelayId('story'), startsAt);
    save(next);
    setPracticePlayerId(localId);
    setClock(startsAt);
    try { await announce(next, true); return true; }
    catch { setLocalError('The room is saved, but its invitation is waiting for the connection.'); return false; }
  }, [activeMission, announce, connectedPlayers, connectionState, current, isHost, localId, roomId, save, session.sessionId, shared]);

  const dispatch = useCallback(async (makeAction: (id: string, stageIndex: number) => StoryAction, hostOnly = false): Promise<boolean> => {
    const previous = current();
    if (!previous || !hydrated) return false;
    if (hostOnly && !isHost) { setLocalError('The host moves everyone on together.'); return false; }
    if (shared && connectionState !== 'connected') { setLocalError('Reconnect before changing the shared board. Your progress is saved.'); return false; }
    const senderId = hostOnly ? localId : activePlayerId;
    const action = makeAction(createRelayId('story-act'), previous.stageIndex);
    setLocalError(undefined);
    if (!shared || isHost) {
      const next = reduceStoryAction(previous, action, senderId, Date.now());
      if (next === previous) return false;
      save(next);
      if (action.kind === 'reveal' && next.status === 'stage-solved') {
        // An older failure screen may have cleared the active-room marker.
        // Reactivate its root coordinator before guests send their next moves.
        useHousewireStore.setState({ missionInProgressId: roomId, missionStartedAt: next.startedAt });
      }
      try { await announce(next, true); return true; }
      catch { setLocalError('Your move is saved. Reconnect to share it.'); return false; }
    }
    try {
      await publishReliable({ kind: 'story.action', roomId, operationId: previous.operationId, nodeId: localId, action, sentAt: Date.now() }, { eventId: action.id });
      return true;
    } catch { setLocalError('Your move could not be sent. Reconnect and try once more.'); return false; }
  }, [activePlayerId, announce, connectionState, current, hydrated, isHost, localId, publishReliable, roomId, save, shared]);

  const act = useCallback((move: ActivityMove) => dispatch((id, stageIndex) => ({ kind: 'act', id, stageIndex, ...move })), [dispatch]);
  const edit = useCallback((slot: number, value: string) => dispatch((id, stageIndex) => ({ kind: 'edit', id, stageIndex, slot, value })), [dispatch]);
  const submit = useCallback(() => dispatch((id, stageIndex) => ({ kind: 'submit', id, stageIndex })), [dispatch]);
  const continueStage = useCallback(() => dispatch((id, stageIndex) => ({ kind: 'continue', id, stageIndex }), true), [dispatch]);
  const abort = useCallback(() => dispatch((id, stageIndex) => ({ kind: 'abort', id, stageIndex }), true), [dispatch]);
  const reveal = useCallback(() => dispatch((id, stageIndex) => ({ kind: 'reveal', id, stageIndex }), true), [dispatch]);
  const probe = useCallback((probeId: string) => dispatch((id, stageIndex) => ({ kind: 'probe', id, stageIndex, probeId })), [dispatch]);
  const selectPracticePlayer = useCallback((id: string) => {
    if (!shared && current()?.players.some((player) => player.id === id)) { setPracticePlayerId(id); setLocalError(undefined); }
  }, [current, shared]);
  const missingPlayers = shared && state ? state.players.filter((player) => !session.liveNodeIds.includes(player.id)) : [];
  const connectionWarning = shared && connectionState !== 'connected'
    ? 'Connection interrupted. Keep this screen open; your room will resync.'
    : missingPlayers.length ? `Waiting for ${missingPlayers.map((player) => player.name).join(' and ')} to reconnect. Their roles are saved.` : undefined;
  const dismissError = useCallback(() => { setLocalError(undefined); clearError(); useStoryStore.getState().updateRuntime(checkpointKey, { error: undefined }); }, [checkpointKey, clearError]);

  return {
    state, view, shared, isHost, localId, activePlayerId, players, connectedPlayers, hydrated,
    connectionState, connectionWarning, missingPlayers, error: localError ?? runtime?.error ?? session.error ?? storageError,
    now, receivedOperationId, begin, act, edit, submit, continueStage, abort, reveal, probe, selectPracticePlayer,
    dismissError, reconnect: session.reconnect,
  };
}

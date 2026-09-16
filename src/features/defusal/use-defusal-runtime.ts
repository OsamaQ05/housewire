import { useCallback, useEffect, useState } from 'react';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  applyDefusalAction, createDefusalSeed, createDefusalState, projectDefusal,
  startDefusal, tickDefusal, type DefusalAction, type DefusalRole, type DefusalState, type DefusalView,
} from '@/src/domain/defusal';
import { deriveLanRelayUrl, describeJoinFailure, probeLanHouse, useHousewireSessionContext } from '@/src/features/session';
import { createRelayId } from '@/src/features/session/relay-id';
import { useHousewireStore, type CrewNode } from '@/src/store/use-housewire-store';

import { acceptDefusalSnapshot, defusalDeliveries, handleDefusalMessage, type DefusalDelivery } from './coordinator';
import { type DefusalJoinTicket, parseDefusalJoinParams } from './join-ticket';
import { defusalMessageSchema } from './protocol';
import { parseDefusalRuntime, serializeDefusalRuntime } from './runtime-state';

interface RuntimeState {
  authority?: DefusalState;
  guestView?: DefusalView;
  mode?: 'live' | 'practice';
  code?: string;
  relayUrl?: string;
  practiceRole: DefusalRole;
  error?: string;
  joining: boolean;
  hydrated: boolean;
  storageError?: string;
  /** Guest clocks are anchored to host snapshots; local wall-clock changes cannot buy extra time. */
  clockAnchor?: { hostNow: number; receivedAt: number };
}
// Remains alive when opening a help sheet or returning from the background.
// Authority/solutions never enter the guest store or public session event feed.
const useRuntimeState = create<RuntimeState>(() => ({ practiceRole: 'operator', joining: false, hydrated: false }));
const STORAGE_KEY = 'housewire-last-light-v1';
let joinAttempt = 0;
let preHydrationMutation = false;
let savedSlice: string | undefined;
let saveQueue = Promise.resolve();
useRuntimeState.subscribe((current, previous) => {
  if (!current.hydrated) { preHydrationMutation = true; return; }
  if (!previous.hydrated && !preHydrationMutation) return;
  const house = useHousewireStore.getState();
  const serialized = serializeDefusalRuntime(current, current.authority?.hostId ?? house.localNodeId);
  if (serialized === savedSlice) return;
  savedSlice = serialized;
  saveQueue = saveQueue.then(async () => {
    try {
      if (serialized) await AsyncStorage.setItem(STORAGE_KEY, serialized);
      else await AsyncStorage.removeItem(STORAGE_KEY);
      if (useRuntimeState.getState().storageError) useRuntimeState.setState({ storageError: undefined });
    } catch { useRuntimeState.setState({ storageError: 'This device could not save the run. Keep it open until storage is available.' }); }
  });
});
void (async () => {
  try {
    const serialized = await AsyncStorage.getItem(STORAGE_KEY);
    if (!useHousewireStore.getState().hydrated) await new Promise<void>((resolve) => {
      const stop = useHousewireStore.subscribe((house) => { if (house.hydrated) { stop(); resolve(); } });
    });
    if (serialized && !preHydrationMutation) {
      const restored = parseDefusalRuntime(serialized, useHousewireStore.getState(), Date.now());
      if (restored) { savedSlice = serialized; useRuntimeState.setState(restored); }
    }
  } catch { useRuntimeState.setState({ storageError: 'Saved Last Light data could not be opened. You can still start a new device.' }); }
  finally { useRuntimeState.setState({ hydrated: true }); }
})();

function localName(): string {
  const house = useHousewireStore.getState();
  return house.crew.find((node) => node.id === house.localNodeId)?.name ?? 'You';
}
function playerNode(id: string, name: string): CrewNode {
  return {
    id, name, initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
    nodeNumber: id === 'local' ? 1 : 2, role: 'listener', roomId: 'living',
    color: '#FFC968', connected: true, simulated: false,
  };
}
function setAuthority(authority: DefusalState): void { useRuntimeState.setState({ authority, error: undefined }); }

export function useDefusalRuntime() {
  const {
    enabled, sessionId, isHost: sessionIsHost, localNodeId: sessionLocalNodeId,
    publishDirect, consumeDirect, subscribeDirect, connectionState, error: sessionError, reconnect,
  } = useHousewireSessionContext();
  const state = useRuntimeState();
  const houseCode = useHousewireStore((house) => house.sessionCode);
  const houseMode = useHousewireStore((house) => house.sessionMode);
  const houseHydrated = useHousewireStore((house) => house.hydrated);
  const [clockNow, setClockNow] = useState(Date.now());
  const live = state.mode === 'live' && enabled && state.code === sessionId;
  const isHost = state.mode === 'practice' || (live && sessionIsHost);
  const localNodeId = state.mode === 'practice' ? state.authority?.hostId ?? 'local' : sessionLocalNodeId;
  const matchesSession = state.mode !== 'live' || (houseMode === 'lan' && houseCode === state.code);
  const view = !matchesSession ? undefined : state.authority ? projectDefusal(state.authority, localNodeId, state.practiceRole) : state.guestView;
  const now = !isHost && state.clockAnchor ? state.clockAnchor.hostNow + Math.max(0, clockNow - state.clockAnchor.receivedAt) : clockNow;
  const sendDeliveries = useCallback((deliveries: DefusalDelivery[]) => {
    for (const delivery of deliveries) {
      // A disconnected reader can request the newest private snapshot when back.
      void publishDirect(delivery.recipientId, delivery.message).catch(() => undefined);
    }
  }, [publishDirect]);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentNow = Date.now();
      setClockNow(currentNow);
      const current = useRuntimeState.getState();
      if (!current.authority) return;
      const next = tickDefusal(current.authority, currentNow);
      if (next === current.authority) return;
      setAuthority(next);
      if (current.mode === 'live') sendDeliveries(defusalDeliveries(next, currentNow));
    }, 500);
    return () => clearInterval(interval);
  }, [sendDeliveries]);

  useEffect(() => {
    const current = useRuntimeState.getState();
    const house = useHousewireStore.getState();
    if (!current.hydrated || !house.hydrated || current.mode !== 'live') return;
    if (house.sessionMode !== 'lan' || house.sessionCode !== current.code) {
      joinAttempt++;
      useRuntimeState.setState({ authority: undefined, guestView: undefined, mode: undefined, code: undefined, relayUrl: undefined, joining: false });
    }
  }, [houseCode, houseMode, houseHydrated, state.hydrated]);

  useEffect(() => {
    if (!state.joining || !state.mode) return;
    const attempt = joinAttempt;
    const timeout = setTimeout(() => {
      if (attempt !== joinAttempt || !useRuntimeState.getState().joining) return;
      useRuntimeState.setState({ joining: false, error: 'The host has not answered yet. Keep Last Light open on the host, then reconnect here.' });
    }, 12_000);
    return () => clearTimeout(timeout);
  }, [state.joining, state.mode, state.code]);

  useEffect(() => {
    if (!live) return;
    return subscribeDirect((item) => {
      const parsed = defusalMessageSchema.safeParse(item.payload);
      if (!parsed.success) return;
      consumeDirect(item.messageId);
      const current = useRuntimeState.getState();
      if (current.code !== sessionId) return;
      if (sessionIsHost && current.authority) {
        const result = handleDefusalMessage(current.authority, item.senderId, parsed.data, Date.now());
        if (result.state !== current.authority) setAuthority(result.state);
        sendDeliveries(result.deliveries);
        return;
      }
      if (item.senderId !== 'local') return;
      if (parsed.data.type === 'notice') {
        useRuntimeState.setState({ error: parsed.data.text, joining: false });
        return;
      }
      const accepted = acceptDefusalSnapshot({ senderId: item.senderId, localNodeId: sessionLocalNodeId, hostId: 'local', raw: parsed.data, current: current.guestView });
      if (accepted) useRuntimeState.setState({
        guestView: accepted.view, joining: false, error: undefined,
        clockAnchor: { hostNow: accepted.hostNow, receivedAt: Date.now() },
      });
    });
  }, [live, sendDeliveries, consumeDirect, sessionIsHost, sessionLocalNodeId, sessionId, subscribeDirect]);

  useEffect(() => {
    if (!live || sessionIsHost || connectionState !== 'connected') return;
    const request = () => {
      const current = useRuntimeState.getState();
      const payload = current.guestView
        ? { channel: 'last-light-v1', type: 'request' }
        : { channel: 'last-light-v1', type: 'join', name: localName() };
      void publishDirect('local', payload).catch((cause: unknown) => {
        useRuntimeState.setState({ error: describeJoinFailure(cause) });
      });
    };
    request();
    // Private resync, not replay of the other players' clue pages.
    const interval = setInterval(request, 2_500);
    return () => clearInterval(interval);
  }, [live, connectionState, sessionIsHost, publishDirect]);

  const startPractice = useCallback((tutorial = false, playerName?: string) => {
    joinAttempt++;
    const name = playerName?.trim().replace(/\s+/g, ' ').slice(0, 24) || localName();
    const house = useHousewireStore.getState();
    house.prepareSession('preview');
    const created = createDefusalState({ id: createRelayId('light'), hostId: 'local', mode: 'practice', seed: createDefusalSeed(), tutorial, players: [{ id: 'local', name }] });
    const started = startDefusal(created, created.hostId, Date.now()).state;
    useRuntimeState.setState({ authority: started, guestView: undefined, mode: 'practice', practiceRole: 'operator', code: undefined, relayUrl: undefined, error: undefined, joining: false, clockAnchor: undefined });
  }, []);

  const startHost = useCallback((tutorial = false, playerName?: string) => {
    joinAttempt++;
    const name = playerName?.trim().replace(/\s+/g, ' ').slice(0, 24) || localName();
    const house = useHousewireStore.getState();
    house.setCrew([playerNode('local', name)]);
    house.setLocalNodeId('local');
    const relayUrl = deriveLanRelayUrl();
    house.prepareSession('lan', undefined, relayUrl);
    const code = useHousewireStore.getState().sessionCode ?? undefined;
    const created = createDefusalState({ id: createRelayId('light'), hostId: 'local', mode: 'live', seed: createDefusalSeed(), tutorial, players: [{ id: 'local', name }] });
    useRuntimeState.setState({ authority: created, guestView: undefined, mode: 'live', practiceRole: 'operator', code, relayUrl, error: undefined, joining: false, clockAnchor: undefined });
  }, []);

  const join = useCallback(async (ticket: DefusalJoinTicket, name: string): Promise<boolean> => {
    const cleanName = name.trim().replace(/\s+/g, ' ').slice(0, 24);
    const cleanTicket = parseDefusalJoinParams({ c: ticket.code, r: ticket.relayUrl });
    if (!cleanName || !cleanTicket) { useRuntimeState.setState({ error: 'Enter your name and the room code from the host.' }); return false; }
    if (useRuntimeState.getState().joining) return false;
    const attempt = ++joinAttempt;
    useRuntimeState.setState({ joining: true, error: undefined });
    try {
      await probeLanHouse({ code: cleanTicket.code, relayUrl: cleanTicket.relayUrl });
      if (attempt !== joinAttempt) return false;
      const house = useHousewireStore.getState();
      const sameGuest = house.sessionMode === 'lan' && house.sessionCode === cleanTicket.code && house.relayUrl === cleanTicket.relayUrl && house.localNodeId !== 'local';
      const nodeId = sameGuest ? house.localNodeId : createRelayId('light-guest');
      house.setCrew([playerNode(nodeId, cleanName)]);
      house.setLocalNodeId(nodeId);
      house.prepareSession('lan', cleanTicket.code, cleanTicket.relayUrl);
      useRuntimeState.setState({ authority: undefined, guestView: undefined, mode: 'live', practiceRole: 'operator', code: cleanTicket.code, relayUrl: cleanTicket.relayUrl, error: undefined, joining: true, clockAnchor: undefined });
      return true;
    } catch (cause) {
      if (attempt !== joinAttempt) return false;
      useRuntimeState.setState({ error: describeJoinFailure(cause), joining: false });
      return false;
    }
  }, []);

  const startGame = useCallback(() => {
    const current = useRuntimeState.getState();
    if (!current.authority) return;
    if (current.mode === 'live' && connectionState !== 'connected') { useRuntimeState.setState({ error: 'Reconnect the host relay before starting.' }); return; }
    const result = startDefusal(current.authority, sessionIsHost || current.mode === 'practice' ? current.authority.hostId : sessionLocalNodeId, Date.now());
    if (!result.accepted) { useRuntimeState.setState({ error: result.reason }); return; }
    setAuthority(result.state);
    if (current.mode === 'live') sendDeliveries(defusalDeliveries(result.state, Date.now()));
  }, [sendDeliveries, connectionState, sessionIsHost, sessionLocalNodeId]);

  const sendAction = useCallback(async (answer?: string[]) => {
    const current = useRuntimeState.getState();
    const currentView = current.authority ? projectDefusal(current.authority, current.authority.hostId, current.practiceRole) : current.guestView;
    if (!currentView || currentView.status !== 'playing') return;
    const base = { actionId: createRelayId('light-move'), operationId: currentView.id, stageIndex: currentView.stageIndex };
    const action: DefusalAction = answer ? { ...base, type: 'commit', answer } : { ...base, type: 'ready' };
    useRuntimeState.setState({ error: undefined });
    if (current.authority) {
      const result = applyDefusalAction(current.authority, current.authority.hostId, action, Date.now());
      if (!result.accepted) { useRuntimeState.setState({ error: result.reason }); return; }
      setAuthority(result.state);
      if (current.mode === 'live') sendDeliveries(defusalDeliveries(result.state, Date.now()));
      return;
    }
    try { await publishDirect('local', { channel: 'last-light-v1', type: 'action', action }); }
    catch (cause) { useRuntimeState.setState({ error: describeJoinFailure(cause) }); }
  }, [sendDeliveries, publishDirect]);

  const restart = useCallback(() => {
    const current = useRuntimeState.getState();
    if (!current.authority) { useRuntimeState.setState({ error: 'The host creates the next device.' }); return; }
    const created = createDefusalState({ id: createRelayId('light'), hostId: current.authority.hostId, mode: current.authority.mode, seed: createDefusalSeed(), tutorial: current.authority.game.tutorial, players: current.authority.players });
    const next = current.mode === 'practice' ? startDefusal(created, created.hostId, Date.now()).state : created;
    useRuntimeState.setState({ authority: next, practiceRole: 'operator', error: undefined });
    if (current.mode === 'live') sendDeliveries(defusalDeliveries(next, Date.now()));
  }, [sendDeliveries]);

  const leave = useCallback(() => {
    joinAttempt++;
    useHousewireStore.getState().prepareSession('preview');
    useRuntimeState.setState({ authority: undefined, guestView: undefined, mode: undefined, code: undefined, relayUrl: undefined, practiceRole: 'operator', error: undefined, joining: false, clockAnchor: undefined });
  }, []);
  const clearError = useCallback(() => useRuntimeState.setState({ error: undefined }), []);
  const setPracticeRole = useCallback((role: DefusalRole) => useRuntimeState.setState({ practiceRole: role }), []);
  return {
    view, mode: state.mode, practiceRole: state.practiceRole, setPracticeRole, localNodeId, isHost,
    connectionState: state.mode === 'practice' ? 'connected' as const : connectionState,
    error: state.error ?? state.storageError ?? (state.mode === 'live' ? sessionError : undefined), clearError, now, hydrated: state.hydrated,
    remainingMs: view?.deadline ? Math.max(0, view.deadline - now) : 0,
    code: state.code, relayUrl: state.relayUrl, joining: state.joining,
    startPractice, startHost, join, startGame, commit: (answer: string[]) => sendAction(answer),
    markReady: () => sendAction(), restart, leave, reconnect,
  };
}

/** Home can offer Resume without mounting another session listener or game ticker. */
export function useDefusalResume(): boolean {
  const hydrated = useRuntimeState((state) => state.hydrated);
  const mode = useRuntimeState((state) => state.mode);
  const code = useRuntimeState((state) => state.code);
  const authority = useRuntimeState((state) => state.authority);
  const guestView = useRuntimeState((state) => state.guestView);
  const houseCode = useHousewireStore((state) => state.sessionCode);
  const houseMode = useHousewireStore((state) => state.sessionMode);
  if (!hydrated || (mode === 'live' && (houseCode !== code || houseMode !== 'lan'))) return false;
  const status = authority?.status ?? guestView?.status;
  return status === 'waiting' || status === 'playing';
}

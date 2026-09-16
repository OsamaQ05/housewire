import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { useFamilyClubStore } from './use-family-club-store';
import { raceRecord } from '../features/family-club/records';
import { isTeamEscapeRaceTerminal } from '../domain/team-escape-race';

import type {
  TeamEscapeRaceProofEvent,
  TeamEscapeRaceStartEvent,
  TeamEscapeRaceState,
} from '@/src/domain/team-escape-race';
import {
  parsePersistedCircuitRaceState,
  serializeCircuitRaceState,
  type CircuitRaceResult,
} from '@/src/features/race/runtime-state';

export type CircuitRaceLaunchMode = 'live' | 'practice';

export interface CircuitRaceAcceptedProof {
  event: TeamEscapeRaceProofEvent;
  eventId: string;
  senderId: string;
  serverTime: number;
}

export type { CircuitRaceResult } from '@/src/features/race/runtime-state';

interface CircuitRaceStore {
  hydrated: boolean;
  launchMode: CircuitRaceLaunchMode;
  seed: number;
  startEvent?: TeamEscapeRaceStartEvent;
  raceState?: TeamEscapeRaceState;
  acceptedProofs: CircuitRaceAcceptedProof[];
  history: CircuitRaceResult[];
  setLaunchMode(mode: CircuitRaceLaunchMode): void;
  setSeed(seed: number): void;
  begin(startEvent: TeamEscapeRaceStartEvent, state: TeamEscapeRaceState): void;
  setRaceState(state: TeamEscapeRaceState): void;
  acceptProof(proof: CircuitRaceAcceptedProof, state: TeamEscapeRaceState): void;
  finish(state: TeamEscapeRaceState): void;
  recordResult(result: CircuitRaceResult): void;
  clearRace(): void;
}

const STORAGE_KEY = 'housewire-circuit-race-v1';

export const useCircuitRaceStore = create<CircuitRaceStore>()((set, get) => ({
  hydrated: false,
  launchMode: 'practice',
  seed: 1,
  acceptedProofs: [],
  history: [],
  setLaunchMode: (launchMode) => set({ launchMode }),
  setSeed: (seed) => set({ seed: Math.max(0, Math.min(0xffff_ffff, Math.floor(seed))) >>> 0 }),
  begin: (startEvent, raceState) => set({ startEvent, raceState, acceptedProofs: [] }),
  setRaceState: (raceState) => set({ raceState }),
  acceptProof: (proof, raceState) => set((current) => ({
    raceState,
    acceptedProofs: current.acceptedProofs.some((item) => item.eventId === proof.eventId)
      ? current.acceptedProofs
      : [...current.acceptedProofs, proof].slice(-96),
  })),
  finish: (state) => {
    const current = get();
    if (current.history.some((result) => result.id === state.operationId)) return;
    const finished = state.teams.filter((team) => team.finishedAt !== undefined);
    if (!state.teams.every(isTeamEscapeRaceTerminal)) return;
    const first = Math.min(...finished.map((team) => team.finishedAt!));
    const winners = finished
      .filter((team) => team.finishedAt! - first <= state.tieWindowMs)
      .map((team) => team.teamId);
    const result: CircuitRaceResult = {
      id: state.operationId,
      playedAt: new Date().toISOString(),
      mode: current.launchMode,
      winningTeamIds: winners,
      standings: state.teams.map((team) => ({
        teamId: team.teamId,
        elapsedMs: Math.max(0, (team.finishedAt ?? team.failedAt!) - state.startsAt),
        ...(team.failedAt !== undefined ? { failed: true, failureReason: team.failureReason } : {}),
      })),
    };
    useFamilyClubStore.getState().record(raceRecord(result, state.participants.map((p) => ({ ...p, teamId: state.teams.find((t) => t.memberNodeIds.includes(p.nodeId))?.teamId ?? '' }))));
    set({ raceState: state, history: [result, ...current.history].slice(0, 20) });
  },
  recordResult: (result) => set((current) => current.history.some((item) => item.id === result.id)
    ? current
    : { history: [result, ...current.history].slice(0, 20) }),
  clearRace: () => set({ startEvent: undefined, raceState: undefined, acceptedProofs: [] }),
}));

let lastSerialized = '';
void AsyncStorage.getItem(STORAGE_KEY)
  .then((serialized) => {
    if (!serialized) return;
    const value = parsePersistedCircuitRaceState(serialized);
    if (!value) return;
    useCircuitRaceStore.setState({
      history: value.history,
      launchMode: value.launchMode,
      seed: value.seed,
    });
  })
  .catch(() => undefined)
  .finally(() => useCircuitRaceStore.setState({ hydrated: true }));

useCircuitRaceStore.subscribe((state) => {
  if (!state.hydrated) return;
  const serialized = serializeCircuitRaceState({
    history: state.history,
    launchMode: state.launchMode,
    seed: state.seed,
  });
  if (serialized === lastSerialized) return;
  lastSerialized = serialized;
  void AsyncStorage.setItem(STORAGE_KEY, serialized).catch(() => undefined);
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type RoomKind =
  | 'living'
  | 'hall'
  | 'kitchen'
  | 'bedroom'
  | 'study'
  | 'outdoor'
  | 'other';

export type MissionId = 'line-13' | 'dead-air' | 'night-glass' | 'long-table';
export type SessionMode = 'preview' | 'lan' | 'cloud';
export type RoleId = 'relay' | 'listener' | 'navigator' | 'breaker';

export interface HouseRoom {
  id: string;
  label: string;
  kind: RoomKind;
  safe: boolean;
  x: number;
  y: number;
}

export interface CrewNode {
  id: string;
  name: string;
  initials: string;
  nodeNumber: number;
  role: RoleId;
  roomId: string;
  color: string;
  connected: boolean;
  simulated: boolean;
}

export interface CalibrationState {
  motion: boolean;
  orientation: boolean;
  audio: boolean;
  haptics: boolean;
  camera: boolean;
  fallbackMode: boolean;
}

export interface MissionResult {
  missionId: MissionId;
  completedAt: string;
  durationSeconds: number;
  retries: number;
  routeSeed: number;
  events: string[];
}

interface HousewireSettings {
  daylight: boolean;
  reducedMotion: boolean;
  haptics: boolean;
  sound: boolean;
  highContrast: boolean;
}

interface HousewireState {
  hydrated: boolean;
  onboardingComplete: boolean;
  tutorialComplete: boolean;
  householdName: string;
  rooms: HouseRoom[];
  crew: CrewNode[];
  calibration: CalibrationState;
  selectedMission: MissionId;
  sessionMode: SessionMode;
  sessionCode: string | null;
  relayUrl: string | null;
  localNodeId: string;
  missionStartedAt: number | null;
  missionInProgressId: MissionId | null;
  missionStageIndex: number;
  missionRetries: number;
  results: MissionResult[];
  settings: HousewireSettings;
  setHydrated: (hydrated: boolean) => void;
  finishOnboarding: () => void;
  completeTutorial: () => void;
  setHouseholdName: (name: string) => void;
  setRooms: (rooms: HouseRoom[]) => void;
  toggleRoomSafety: (roomId: string) => void;
  seedHouse: () => void;
  setCrew: (crew: CrewNode[]) => void;
  setLocalNodeId: (nodeId: string) => void;
  setCalibration: (key: keyof CalibrationState, value: boolean) => void;
  resetCalibration: () => void;
  selectMission: (missionId: MissionId) => void;
  prepareSession: (mode: SessionMode, sessionCode?: string, relayUrl?: string) => void;
  startMission: () => void;
  updateMissionProgress: (stageIndex: number, retries: number) => void;
  completeMission: (result: MissionResult) => void;
  updateSettings: (settings: Partial<HousewireSettings>) => void;
  resetProduct: () => void;
}

const defaultRooms: HouseRoom[] = [
  { id: 'living', label: 'Living room', kind: 'living', safe: true, x: 10, y: 12 },
  { id: 'hall', label: 'Hall', kind: 'hall', safe: true, x: 58, y: 18 },
  { id: 'kitchen', label: 'Kitchen table', kind: 'kitchen', safe: true, x: 22, y: 62 },
];

const defaultCrew: CrewNode[] = [
  {
    id: 'local',
    name: 'You',
    initials: 'YOU',
    nodeNumber: 1,
    role: 'relay',
    roomId: 'living',
    color: '#FF603B',
    connected: true,
    simulated: false,
  },
  {
    id: 'node-2',
    name: 'Mara',
    initials: 'MA',
    nodeNumber: 2,
    role: 'listener',
    roomId: 'hall',
    color: '#65CFE2',
    connected: true,
    simulated: true,
  },
  {
    id: 'node-3',
    name: 'Samir',
    initials: 'SA',
    nodeNumber: 3,
    role: 'navigator',
    roomId: 'kitchen',
    color: '#F4C85A',
    connected: true,
    simulated: true,
  },
];

const defaultCalibration: CalibrationState = {
  motion: false,
  orientation: false,
  audio: false,
  haptics: false,
  camera: false,
  fallbackMode: false,
};

const defaultSettings: HousewireSettings = {
  daylight: false,
  reducedMotion: false,
  haptics: true,
  sound: true,
  highContrast: false,
};

const randomCode = () => {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
};

const SAFE_NODE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export const useHousewireStore = create<HousewireState>()((set) => ({
      hydrated: false,
      onboardingComplete: false,
      tutorialComplete: false,
      householdName: 'Our house',
      rooms: defaultRooms,
      crew: defaultCrew,
      calibration: defaultCalibration,
      selectedMission: 'line-13',
      sessionMode: 'preview',
      sessionCode: null,
      relayUrl: null,
      localNodeId: 'local',
      missionStartedAt: null,
      missionInProgressId: null,
      missionStageIndex: 0,
      missionRetries: 0,
      results: [],
      settings: defaultSettings,
      setHydrated: (hydrated) => set({ hydrated }),
      finishOnboarding: () => set({ onboardingComplete: true }),
      completeTutorial: () => set({ tutorialComplete: true }),
      setHouseholdName: (householdName) => set({ householdName: householdName.trim() || 'Our house' }),
      setRooms: (rooms) => set({ rooms }),
      toggleRoomSafety: (roomId) =>
        set((state) => ({
          rooms: state.rooms.map((room) =>
            room.id === roomId ? { ...room, safe: !room.safe } : room,
          ),
        })),
      seedHouse: () => set({ rooms: defaultRooms, crew: defaultCrew }),
      setCrew: (crew) => set({ crew }),
      setLocalNodeId: (localNodeId) => {
        if (SAFE_NODE_ID.test(localNodeId)) set({ localNodeId });
      },
      setCalibration: (key, value) =>
        set((state) => ({ calibration: { ...state.calibration, [key]: value } })),
      resetCalibration: () => set({ calibration: defaultCalibration }),
      selectMission: (selectedMission) => set({ selectedMission }),
      prepareSession: (sessionMode, sessionCode, relayUrl) =>
        set({
          sessionMode,
          sessionCode: sessionCode ?? randomCode(),
          relayUrl: relayUrl ?? null,
          missionStartedAt: null,
          missionInProgressId: null,
          missionStageIndex: 0,
          missionRetries: 0,
          calibration: defaultCalibration,
        }),
      startMission: () => set((state) => ({ missionInProgressId: state.selectedMission, missionStartedAt: Date.now(), missionStageIndex: 0, missionRetries: 0 })),
      updateMissionProgress: (missionStageIndex, missionRetries) =>
        set({
          missionStageIndex: Math.max(0, Math.min(4, Math.trunc(missionStageIndex))),
          missionRetries: Math.max(0, Math.trunc(missionRetries)),
        }),
      completeMission: (result) =>
        set((state) => ({
          results: [result, ...state.results].slice(0, 20),
          missionStartedAt: null,
          missionInProgressId: null,
          missionStageIndex: 0,
          missionRetries: 0,
        })),
      updateSettings: (settings) =>
        set((state) => ({ settings: { ...state.settings, ...settings } })),
      resetProduct: () =>
        set({
          onboardingComplete: false,
          tutorialComplete: false,
          householdName: 'Our house',
          rooms: defaultRooms,
          crew: defaultCrew,
          calibration: defaultCalibration,
          selectedMission: 'line-13',
          sessionMode: 'preview',
          sessionCode: null,
          relayUrl: null,
          localNodeId: 'local',
          missionStartedAt: null,
          missionInProgressId: null,
          missionStageIndex: 0,
          missionRetries: 0,
          results: [],
          settings: defaultSettings,
        }),
}));

const STORAGE_KEY = 'housewire-product-state-v1';

interface PersistedHousewireState {
  onboardingComplete: boolean;
  tutorialComplete: boolean;
  householdName: string;
  rooms: HouseRoom[];
  crew: CrewNode[];
  selectedMission: MissionId;
  sessionMode: SessionMode;
  sessionCode: string | null;
  relayUrl: string | null;
  localNodeId: string;
  missionStartedAt: number | null;
  missionInProgressId: MissionId | null;
  missionStageIndex: number;
  missionRetries: number;
  results: MissionResult[];
  settings: HousewireSettings;
}

function persistedSlice(state: HousewireState): PersistedHousewireState {
  return {
    householdName: state.householdName,
    onboardingComplete: state.onboardingComplete,
    tutorialComplete: state.tutorialComplete,
    crew: state.crew,
    localNodeId: state.localNodeId,
    missionStartedAt: state.missionStartedAt,
    missionInProgressId: state.missionInProgressId,
    missionStageIndex: state.missionStageIndex,
    missionRetries: state.missionRetries,
    relayUrl: state.relayUrl,
    results: state.results,
    rooms: state.rooms,
    selectedMission: state.selectedMission,
    sessionCode: state.sessionCode,
    sessionMode: state.sessionMode,
    settings: state.settings,
  };
}

function isCrewNode(value: unknown): value is CrewNode {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CrewNode>;
  return (
    typeof candidate.id === 'string' && SAFE_NODE_ID.test(candidate.id) &&
    typeof candidate.name === 'string' && candidate.name.length >= 1 && candidate.name.length <= 24 &&
    typeof candidate.initials === 'string' && candidate.initials.length >= 1 && candidate.initials.length <= 4 &&
    typeof candidate.nodeNumber === 'number' && Number.isInteger(candidate.nodeNumber) &&
    candidate.nodeNumber >= 1 && candidate.nodeNumber <= 4 &&
    typeof candidate.role === 'string' && ['relay', 'listener', 'navigator', 'breaker'].includes(candidate.role) &&
    typeof candidate.roomId === 'string' && candidate.roomId.length >= 1 && candidate.roomId.length <= 64 &&
    typeof candidate.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate.color) &&
    typeof candidate.connected === 'boolean' &&
    typeof candidate.simulated === 'boolean'
  );
}

function isStoredRelayUrl(value: string): boolean {
  if (value.length > 240) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'ws:' || url.protocol === 'wss:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isPersistedState(value: unknown): value is Partial<PersistedHousewireState> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PersistedHousewireState>;
  return (
    (candidate.onboardingComplete === undefined || typeof candidate.onboardingComplete === 'boolean') &&
    (candidate.tutorialComplete === undefined || typeof candidate.tutorialComplete === 'boolean') &&
    (candidate.householdName === undefined || typeof candidate.householdName === 'string') &&
    (candidate.rooms === undefined || Array.isArray(candidate.rooms)) &&
    (candidate.crew === undefined || (Array.isArray(candidate.crew) && candidate.crew.length <= 4 && candidate.crew.every(isCrewNode))) &&
    (candidate.selectedMission === undefined ||
      ['line-13', 'dead-air', 'night-glass', 'long-table', 'live-wire', 'phase-choir'].includes(
        candidate.selectedMission as string,
      )) &&
    (candidate.sessionMode === undefined || ['preview', 'lan', 'cloud'].includes(candidate.sessionMode)) &&
    (candidate.sessionCode === undefined || candidate.sessionCode === null || /^[A-Z0-9]{5}$/.test(candidate.sessionCode)) &&
    (candidate.relayUrl === undefined || candidate.relayUrl === null || (typeof candidate.relayUrl === 'string' && isStoredRelayUrl(candidate.relayUrl))) &&
    (candidate.localNodeId === undefined || (typeof candidate.localNodeId === 'string' && SAFE_NODE_ID.test(candidate.localNodeId))) &&
    (candidate.missionStartedAt === undefined ||
      candidate.missionStartedAt === null ||
      (typeof candidate.missionStartedAt === 'number' &&
        Number.isInteger(candidate.missionStartedAt) &&
        candidate.missionStartedAt > 0)) &&
    (candidate.missionInProgressId === undefined ||
      candidate.missionInProgressId === null ||
      ['line-13', 'dead-air', 'night-glass', 'long-table'].includes(candidate.missionInProgressId)) &&
    (candidate.missionStageIndex === undefined ||
      (typeof candidate.missionStageIndex === 'number' &&
        Number.isInteger(candidate.missionStageIndex) &&
        candidate.missionStageIndex >= 0 &&
        candidate.missionStageIndex <= 4)) &&
    (candidate.missionRetries === undefined ||
      (typeof candidate.missionRetries === 'number' &&
        Number.isInteger(candidate.missionRetries) &&
        candidate.missionRetries >= 0 &&
        candidate.missionRetries <= 10_000)) &&
    (candidate.results === undefined || Array.isArray(candidate.results)) &&
    (candidate.settings === undefined || typeof candidate.settings === 'object')
  );
}

let lastSerializedState = '';

void AsyncStorage.getItem(STORAGE_KEY)
  .then((serialized) => {
    if (!serialized) return;
    const parsed: unknown = JSON.parse(serialized);
    if (!isPersistedState(parsed)) return;
    const current = useHousewireStore.getState();
    const crew = parsed.crew ?? current.crew;
    const localNodeId = parsed.localNodeId ?? current.localNodeId;
    const canRestoreLiveIdentity =
      parsed.sessionMode !== 'lan' ||
      (parsed.sessionCode !== null &&
        parsed.sessionCode !== undefined &&
        crew.some((node) => node.id === localNodeId && !node.simulated));
    const persistedStartedAt = parsed.missionStartedAt ?? null;
    const missionAgeMs = persistedStartedAt === null ? Number.POSITIVE_INFINITY : Date.now() - persistedStartedAt;
    const canRestoreMission =
      canRestoreLiveIdentity &&
      persistedStartedAt !== null &&
      missionAgeMs >= -5 * 60_000 &&
      missionAgeMs <= 30 * 60_000;
    useHousewireStore.setState({
      householdName: parsed.householdName ?? current.householdName,
      onboardingComplete: parsed.onboardingComplete ?? current.onboardingComplete,
      tutorialComplete: parsed.tutorialComplete ?? current.tutorialComplete,
      crew: canRestoreLiveIdentity ? crew : current.crew,
      localNodeId: canRestoreLiveIdentity ? localNodeId : current.localNodeId,
      missionStartedAt: canRestoreMission ? persistedStartedAt : null,
      missionInProgressId: canRestoreMission
        ? (parsed.missionInProgressId ?? (parsed.selectedMission === 'dead-air' || parsed.selectedMission === 'night-glass' || parsed.selectedMission === 'long-table' ? parsed.selectedMission : 'line-13'))
        : null,
      missionStageIndex:
        canRestoreMission
          ? (parsed.missionStageIndex ?? current.missionStageIndex)
          : 0,
      missionRetries:
        canRestoreMission
          ? (parsed.missionRetries ?? current.missionRetries)
          : 0,
      relayUrl: canRestoreLiveIdentity ? (parsed.relayUrl ?? current.relayUrl) : null,
      results: parsed.results ?? current.results,
      rooms: parsed.rooms ?? current.rooms,
      selectedMission:
        parsed.selectedMission === 'dead-air' || parsed.selectedMission === 'night-glass' || parsed.selectedMission === 'long-table'
          ? parsed.selectedMission
          : 'line-13',
      sessionCode: canRestoreLiveIdentity ? (parsed.sessionCode ?? current.sessionCode) : null,
      sessionMode: canRestoreLiveIdentity ? (parsed.sessionMode ?? current.sessionMode) : 'preview',
      settings: { ...current.settings, ...parsed.settings },
    });
    lastSerializedState = JSON.stringify(persistedSlice(useHousewireStore.getState()));
  })
  .catch(() => undefined)
  .finally(() => useHousewireStore.getState().setHydrated(true));

useHousewireStore.subscribe((state) => {
  if (!state.hydrated) return;
  const serialized = JSON.stringify(persistedSlice(state));
  if (serialized === lastSerializedState) return;
  lastSerializedState = serialized;
  void AsyncStorage.setItem(STORAGE_KEY, serialized).catch(() => undefined);
});

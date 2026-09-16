import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { storyStateSchema } from './story-protocol';
import type { StoryState } from './types';

const STORAGE_KEY = 'housewire-authored-stories-v1';
const MAX_CHECKPOINTS = 12;
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export interface StoryCheckpoint { state: StoryState; savedAt: number }
type Checkpoints = Record<string, StoryCheckpoint>;

export function storyCheckpointKey(roomId: string, sessionId: string, localId: string): string {
  return `${roomId}:${sessionId}:${localId}`;
}

export function pruneStoryCheckpoints(raw: unknown, now = Date.now()): Checkpoints {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const entries: [string, StoryCheckpoint][] = [];
  for (const [key, entry] of Object.entries(raw)) {
    if (key.length > 196 || !/^[a-zA-Z0-9_:-]+$/.test(key) || !entry || typeof entry !== 'object') continue;
    const checkpoint = entry as Partial<StoryCheckpoint>;
    if (!Number.isSafeInteger(checkpoint.savedAt) || checkpoint.savedAt! > now + 60_000 || checkpoint.savedAt! < now - MAX_AGE_MS) continue;
    const parsed = storyStateSchema.safeParse(checkpoint.state);
    if (!parsed.success) continue;
    entries.push([key, { state: parsed.data, savedAt: checkpoint.savedAt! }]);
  }
  return Object.fromEntries(entries.sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, MAX_CHECKPOINTS));
}

interface StoryStore {
  hydrated: boolean; checkpoints: Checkpoints; storageError?: string;
  runtime: Record<string, { operationId?: string; clockOffset?: number; error?: string }>;
  hydrate: () => Promise<void>;
  save: (key: string, state: StoryState) => void;
  updateRuntime: (key: string, update: { operationId?: string; clockOffset?: number; error?: string }) => void;
}

let hydration: Promise<void> | undefined;
let writeChain = Promise.resolve();

export const useStoryStore = create<StoryStore>((set, get) => ({
  hydrated: false, checkpoints: {}, runtime: {},
  updateRuntime: (key, update) => {
    const runtime = { ...get().runtime, [key]: { ...get().runtime[key], ...update } };
    const known = new Set(Object.keys(get().checkpoints));
    set({ runtime: Object.fromEntries(Object.entries(runtime).filter(([item]) => known.has(item)).slice(-MAX_CHECKPOINTS)) });
  },
  hydrate: async () => {
    if (get().hydrated) return;
    if (!hydration) hydration = (async () => {
      try {
        const text = await AsyncStorage.getItem(STORAGE_KEY);
        const loaded = text && text.length < 1_000_000 ? pruneStoryCheckpoints(JSON.parse(text)) : {};
        // Revalidate in-memory checkpoints too: Fast Refresh may preserve an
        // old catalog board after this phone receives a new app bundle.
        set({ checkpoints: pruneStoryCheckpoints({ ...loaded, ...get().checkpoints }), hydrated: true });
      } catch {
        set({ hydrated: true, storageError: 'This phone could not restore its saved room. You can still start a new one.' });
      }
    })();
    await hydration;
  },
  save: (key, state) => {
    const checkpoints = pruneStoryCheckpoints({ ...get().checkpoints, [key]: { state, savedAt: Date.now() } });
    set({ checkpoints });
    // Serial writes prevent a slower old draft from overwriting a newer checkpoint.
    writeChain = writeChain.then(async () => {
      try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(get().checkpoints)); }
      catch { set({ storageError: 'Progress is running, but this phone could not save its checkpoint.' }); }
    });
  },
}));

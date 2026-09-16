import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  isFrequencyAvatarId,
  normalizeFrequencyAvatarName,
  parseFrequencyAvatarChoices,
  type FrequencyAvatarChoices,
  type FrequencyAvatarId,
} from '../features/trivia/frequency-avatar-model';

export const FREQUENCY_AVATAR_STORAGE_KEY = 'housewire-frequency-avatars-v1';

interface AvatarStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}

interface FrequencyAvatarState {
  choices: FrequencyAvatarChoices;
  hydrated: boolean;
  storageError: boolean;
  setAvatar(name: string, id: FrequencyAvatarId): void;
  retrySave(): void;
}

export function createFrequencyAvatarStore(storage: AvatarStorage) {
  let pending: FrequencyAvatarChoices = {};
  let readFailed = false;
  let reading = false;
  let writeQueue = Promise.resolve();

  function save(choices: FrequencyAvatarChoices) {
    const serialized = JSON.stringify({ version: 1, choices });
    // Serial writes keep a slow older selection from replacing the latest one.
    writeQueue = writeQueue.then(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await storage.setItem(FREQUENCY_AVATAR_STORAGE_KEY, serialized);
          useStore.setState({ storageError: false });
          return;
        } catch { /* Retry a transient write failure once. */ }
      }
      useStore.setState({ storageError: true });
    });
  }

  const useStore = create<FrequencyAvatarState>()((set, get) => ({
    choices: {},
    hydrated: false,
    storageError: false,
    setAvatar: (name, id) => {
      const key = normalizeFrequencyAvatarName(name);
      if (!key || !isFrequencyAvatarId(id)) return;
      const state = get();
      const choices = { ...state.choices, [key]: id };
      set({ choices });
      if (!state.hydrated || readFailed) {
        pending = { ...pending, [key]: id };
        if (readFailed) void restore();
      } else if (state.choices[key] !== id || state.storageError) {
        save(choices);
      }
    },
    retrySave: () => {
      if (readFailed) void restore();
      else if (get().hydrated) save(get().choices);
    },
  }));

  async function restore() {
    if (reading) return;
    reading = true;
    try {
      const raw = await storage.getItem(FREQUENCY_AVATAR_STORAGE_KEY);
      const changed = Object.keys(pending).length > 0;
      const choices = { ...parseFrequencyAvatarChoices(raw), ...pending };
      pending = {};
      readFailed = false;
      useStore.setState({ choices, hydrated: true, storageError: false });
      if (changed) save(choices);
    } catch {
      // Keep choices usable in memory; recover the old data before writing again.
      readFailed = true;
      useStore.setState({ hydrated: true, storageError: true });
    } finally {
      reading = false;
    }
  }

  void restore();
  return useStore;
}

export const useFrequencyAvatarStore = createFrequencyAvatarStore(AsyncStorage);

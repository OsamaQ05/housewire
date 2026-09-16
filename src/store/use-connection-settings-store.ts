import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { EMPTY_CONNECTION_SETTINGS, normalizeServiceUrl, parseConnectionSettings, type ConnectionSettings } from '../domain/connection-settings';

export const CONNECTION_SETTINGS_KEY = 'housewire-connections-v1';
interface ConnectionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}
interface ConnectionState extends ConnectionSettings {
  hydrated: boolean;
  storageError: boolean;
  save(settings: ConnectionSettings): Promise<void>;
}

export function createConnectionSettingsStore(storage: ConnectionStorage) {
  let revision = 0;
  let writes = Promise.resolve();
  const useStore = create<ConnectionState>()((set) => ({
    ...EMPTY_CONNECTION_SETTINGS,
    hydrated: false,
    storageError: false,
    save: async (settings) => {
      const normalized = {
        relayUrl: normalizeServiceUrl(settings.relayUrl, 'relay'),
        aiUrl: normalizeServiceUrl(settings.aiUrl, 'ai'),
      };
      revision++;
      set(normalized);
      const next = writes.catch(() => undefined).then(async () => {
        try {
          await storage.setItem(CONNECTION_SETTINGS_KEY, JSON.stringify({ version: 1, ...normalized }));
          set({ storageError: false });
        } catch {
          set({ storageError: true });
          throw new Error('These addresses work now, but could not be saved. Try Save again before closing the app.');
        }
      });
      writes = next;
      await next;
    },
  }));
  const beforeRead = revision;
  void storage.getItem(CONNECTION_SETTINGS_KEY).then((raw) => {
    if (revision === beforeRead) useStore.setState(parseConnectionSettings(raw));
  }).catch(() => useStore.setState({ storageError: true })).finally(() => useStore.setState({ hydrated: true }));
  return useStore;
}

export const useConnectionSettingsStore = createConnectionSettingsStore(AsyncStorage);

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ForgeStorageCleaner {
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

export function isForgeStorageKey(key: string): boolean {
  return key.startsWith('housewire-forge-') || key.startsWith('housewire-case-forge-');
}

/** Removes generated cases, run checkpoints, and present/future Forge LAN checkpoints. */
export async function clearAllForgeStorage(storage: ForgeStorageCleaner = AsyncStorage): Promise<void> {
  const keys = (await storage.getAllKeys()).filter(isForgeStorageKey);
  if (keys.length > 0) await storage.multiRemove(keys);
}

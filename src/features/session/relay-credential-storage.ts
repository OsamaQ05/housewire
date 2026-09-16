import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { RelayCredentialStorage } from './relay-resume-vault';

/** Web is tab-session-only. Native proofs are encrypted and device-bound. */
export const relayCredentialStorage: RelayCredentialStorage = {
  async getItem(key) {
    if (Platform.OS === 'web') return typeof window === 'undefined' ? null : window.sessionStorage.getItem(key);
    return SecureStore.getItemAsync(key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  async setItem(key, value) {
    if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.sessionStorage.setItem(key, value); return; }
    await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  async removeItem(key) {
    if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.sessionStorage.removeItem(key); return; }
    await SecureStore.deleteItemAsync(key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
};

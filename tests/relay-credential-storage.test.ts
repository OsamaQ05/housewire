import { afterEach, describe, expect, it, vi } from 'vitest';

import { relayCredentialStorage } from '../src/features/session/relay-credential-storage';

const mocks = vi.hoisted(() => ({
  platform: { OS: 'ios' }, getItemAsync: vi.fn(async () => 'proof'), setItemAsync: vi.fn(async () => undefined), deleteItemAsync: vi.fn(async () => undefined),
}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('expo-secure-store', () => ({ ...mocks, WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7 }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); mocks.platform.OS = 'ios'; });

describe('relay credential platform adapter', () => {
  it('uses only device-bound encrypted storage on native, without biometric prompts', async () => {
    expect(await relayCredentialStorage.getItem('private-key')).toBe('proof');
    await relayCredentialStorage.setItem('private-key', 'private-proof');
    await relayCredentialStorage.removeItem('private-key');
    const options = { keychainAccessible: 7 };
    expect(mocks.getItemAsync).toHaveBeenCalledWith('private-key', options);
    expect(mocks.setItemAsync).toHaveBeenCalledWith('private-key', 'private-proof', options);
    expect(mocks.deleteItemAsync).toHaveBeenCalledWith('private-key', options);
  });
  it('uses sessionStorage only for web, never persistent public localStorage', async () => {
    mocks.platform.OS = 'web';
    const sessionStorage = { getItem: vi.fn(() => 'tab-proof'), setItem: vi.fn(), removeItem: vi.fn() };
    const localStorage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal('window', { sessionStorage, localStorage });
    expect(await relayCredentialStorage.getItem('key')).toBe('tab-proof');
    await relayCredentialStorage.setItem('key', 'tab-proof'); await relayCredentialStorage.removeItem('key');
    expect(sessionStorage.setItem).toHaveBeenCalledWith('key', 'tab-proof');
    expect(localStorage.setItem).not.toHaveBeenCalled(); expect(mocks.getItemAsync).not.toHaveBeenCalled();
  });
  it('does not access browser storage during static rendering', async () => {
    mocks.platform.OS = 'web'; vi.stubGlobal('window', undefined);
    expect(await relayCredentialStorage.getItem('key')).toBeNull();
    await expect(relayCredentialStorage.setItem('key', 'value')).resolves.toBeUndefined();
  });
});

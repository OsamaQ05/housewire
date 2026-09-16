import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectionSettingsForLaptop, normalizeServiceUrl, parseConnectionSettings, resolveAiServiceUrl } from '../src/domain/connection-settings';
import { inspectAiConnection } from '../src/features/settings/connection-health';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => undefined } }));
vi.mock('expo-constants', () => ({ default: { expoConfig: {}, expoGoConfig: {} } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

afterEach(() => { vi.unstubAllEnvs(); });

describe('standalone phone connection settings', () => {
  it('normalizes local shortcuts with the correct independent ports', () => {
    expect(connectionSettingsForLaptop(' 192.168.1.8 ')).toEqual({ relayUrl: 'ws://192.168.1.8:8787', aiUrl: 'http://192.168.1.8:8788' });
    expect(normalizeServiceUrl('10.0.0.2', 'relay')).toBe('ws://10.0.0.2:8787');
    expect(normalizeServiceUrl('10.0.0.2', 'ai')).toBe('http://10.0.0.2:8788');
  });

  it('preserves independent secure hosts, ports, and deployment paths', () => {
    expect(normalizeServiceUrl('https://relay.example.test/socket/', 'relay')).toBe('wss://relay.example.test/socket');
    expect(resolveAiServiceUrl('wss://relay.example.test/socket', 'https://intelligence.example.test:9443/housewire/')).toBe('https://intelligence.example.test:9443/housewire');
    expect(() => resolveAiServiceUrl('wss://relay.example.test/socket')).toThrow(/AI server address/);
    expect(resolveAiServiceUrl('ws://10.0.0.2:8787')).toBe('http://10.0.0.2:8788');
  });

  it.each(['https://user:secret@example.test', 'https://example.test?key=secret', 'https://example.test#secret', 'file:///tmp/x', 'http://example.test', 'http://10.attacker.example', 'http://172.40.0.1', '10.0.0.999', 'bad address'])('rejects unsafe or invalid AI address %s', (value) => {
    expect(() => normalizeServiceUrl(value, 'ai')).toThrow();
  });

  it('rejects token-bearing relay addresses and loopback laptop shortcuts', () => {
    expect(() => normalizeServiceUrl('wss://server.test?token=secret', 'relay')).toThrow();
    expect(() => normalizeServiceUrl('ws://public.test:8787', 'relay')).toThrow();
    expect(() => connectionSettingsForLaptop('127.0.0.1')).toThrow(/laptop/);
    expect(() => connectionSettingsForLaptop('localhost')).toThrow(/laptop/);
  });

  it('recovers safe stored fields independently and tolerates corrupted storage', () => {
    expect(parseConnectionSettings('{oops')).toEqual({ relayUrl: '', aiUrl: '' });
    expect(parseConnectionSettings(JSON.stringify({ version: 1, relayUrl: 'wss://relay.test', aiUrl: 'https://user:secret@ai.test' }))).toEqual({ relayUrl: 'wss://relay.test', aiUrl: '' });
    expect(parseConnectionSettings(JSON.stringify({ version: 2, relayUrl: 'wss://relay.test' }))).toEqual({ relayUrl: '', aiUrl: '' });
  });

  it('persists and restores addresses across app restarts', async () => {
    const { createConnectionSettingsStore } = await import('../src/store/use-connection-settings-store');
    const disk = new Map<string, string>();
    const storage = { getItem: async (key: string) => disk.get(key) ?? null, setItem: async (key: string, value: string) => { disk.set(key, value); } };
    const store = createConnectionSettingsStore(storage);
    await vi.waitFor(() => expect(store.getState().hydrated).toBe(true));
    await store.getState().save({ relayUrl: 'wss://relay.test/socket', aiUrl: 'https://ai.test' });
    const restored = createConnectionSettingsStore(storage);
    await vi.waitFor(() => expect(restored.getState().hydrated).toBe(true));
    expect(restored.getState().relayUrl).toBe('wss://relay.test/socket');
    expect(restored.getState().aiUrl).toBe('https://ai.test');
    await restored.getState().save({ relayUrl: '', aiUrl: '' });
    expect(restored.getState().relayUrl).toBe('');
  });

  it('does not overwrite a new setting with a slow startup read', async () => {
    const { createConnectionSettingsStore } = await import('../src/store/use-connection-settings-store');
    let finishRead!: (raw: string | null) => void;
    const storage = { getItem: () => new Promise<string | null>(resolve => { finishRead = resolve; }), setItem: async () => undefined };
    const store = createConnectionSettingsStore(storage);
    await store.getState().save({ relayUrl: 'wss://new.test', aiUrl: 'https://new-ai.test' });
    finishRead(JSON.stringify({ version: 1, relayUrl: 'wss://old.test', aiUrl: '' }));
    await vi.waitFor(() => expect(store.getState().hydrated).toBe(true));
    expect(store.getState().relayUrl).toBe('wss://new.test');
  });

  it('keeps the app usable after storage failures and reports failed saves', async () => {
    const { createConnectionSettingsStore } = await import('../src/store/use-connection-settings-store');
    const store = createConnectionSettingsStore({ getItem: async () => { throw new Error('disk'); }, setItem: async () => { throw new Error('disk'); } });
    await vi.waitFor(() => expect(store.getState().hydrated).toBe(true));
    await expect(store.getState().save({ relayUrl: 'wss://relay.test', aiUrl: '' })).rejects.toThrow(/could not be saved/);
    expect(store.getState().relayUrl).toBe('wss://relay.test');
    expect(store.getState().storageError).toBe(true);
  });

  it('uses build defaults, then persisted overrides, without changing an active session relay', async () => {
    const { useConnectionSettingsStore } = await import('../src/store/use-connection-settings-store');
    const { defaultRelayServiceUrl, defaultAiServiceUrl } = await import('../src/services/runtime-connections');
    await vi.waitFor(() => expect(useConnectionSettingsStore.getState().hydrated).toBe(true));
    useConnectionSettingsStore.setState({ relayUrl: '', aiUrl: '' });
    vi.stubEnv('EXPO_PUBLIC_HOUSEWIRE_RELAY_URL', 'ws://10.0.0.2:8787');
    vi.stubEnv('EXPO_PUBLIC_HOUSEWIRE_FORGE_URL', 'https://built-ai.test');
    expect(defaultRelayServiceUrl()).toBe('ws://10.0.0.2:8787');
    expect(defaultAiServiceUrl()).toBe('https://built-ai.test');
    useConnectionSettingsStore.setState({ relayUrl: 'wss://saved-relay.test', aiUrl: 'https://saved-ai.test' });
    expect(defaultRelayServiceUrl()).toBe('wss://saved-relay.test');
    expect(defaultAiServiceUrl('ws://10.0.0.9:8787')).toBe('https://saved-ai.test');
    useConnectionSettingsStore.setState({ relayUrl: '', aiUrl: '' });
    vi.stubEnv('EXPO_PUBLIC_HOUSEWIRE_FORGE_URL', '');
    expect(defaultAiServiceUrl('ws://10.0.0.9:8787')).toBe('http://10.0.0.9:8788');
    vi.stubEnv('EXPO_PUBLIC_HOUSEWIRE_RELAY_URL', '');
    expect(defaultRelayServiceUrl()).toBe('');
  });

  it('health checks distinguish ready AI, missing keys, and unreachable service', async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ status: 'ok', aiConfigured: true })));
    expect((await inspectAiConnection('https://ai.test', request)).connected).toBe(true);
    expect(request.mock.calls[0]?.[0]).toBe('https://ai.test/health');
    const noKey = await inspectAiConnection('https://ai.test', async () => new Response(JSON.stringify({ status: 'ok', aiConfigured: false })));
    expect(noKey.connected).toBe(false);
    expect(noKey.message).toMatch(/API key on the laptop/);
    expect((await inspectAiConnection('https://ai.test', async () => { throw new Error('offline'); })).connected).toBe(false);
    expect((await inspectAiConnection('https://ai.test', async () => new Response('{}'))).connected).toBe(false);
  });
});

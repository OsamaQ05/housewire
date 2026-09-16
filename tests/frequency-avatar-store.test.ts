import { describe, expect, it, vi } from 'vitest';

import { getFrequencyAvatar, type FrequencyAvatarId } from '../src/features/trivia/frequency-avatar-model';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => undefined } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('Family Frequency saved avatars', () => {
  it('merges a choice made during startup with saved choices and keeps the newest selection', async () => {
    const { createFrequencyAvatarStore, FREQUENCY_AVATAR_STORAGE_KEY } = await import('../src/store/use-frequency-avatar-store');
    const read = deferred<string | null>();
    const storage = { getItem: vi.fn(() => read.promise), setItem: vi.fn(async (_key: string, _value: string) => undefined) };
    const store = createFrequencyAvatarStore(storage);
    store.getState().setAvatar('Mara', 'fox');
    store.getState().setAvatar(' MARA ', 'rabbit');
    expect(store.getState().choices.mara).toBe('rabbit');
    expect(store.getState().hydrated).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    read.resolve(JSON.stringify({ version: 1, choices: { mara: 'bear', noor: 'owl' } }));
    await vi.waitFor(() => expect(store.getState().hydrated).toBe(true));
    expect(store.getState().choices).toEqual({ mara: 'rabbit', noor: 'owl' });
    await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1));
    expect(storage.getItem).toHaveBeenCalledWith(FREQUENCY_AVATAR_STORAGE_KEY);
    expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual({ version: 1, choices: { mara: 'rabbit', noor: 'owl' } });
  });

  it('restores saved choices across a fresh store and keeps storage separate from games', async () => {
    const { createFrequencyAvatarStore, FREQUENCY_AVATAR_STORAGE_KEY } = await import('../src/store/use-frequency-avatar-store');
    const disk = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => disk.get(key) ?? null,
      setItem: vi.fn(async (key: string, value: string) => { disk.set(key, value); }),
    };
    const first = createFrequencyAvatarStore(storage);
    await vi.waitFor(() => expect(first.getState().hydrated).toBe(true));
    first.getState().setAvatar('  Zoë  ', 'frog');
    await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1));
    const second = createFrequencyAvatarStore(storage);
    await vi.waitFor(() => expect(second.getState().hydrated).toBe(true));
    expect(getFrequencyAvatar('Zoe\u0308', second.getState().choices)).toBe('frog');
    expect([...disk.keys()]).toEqual([FREQUENCY_AVATAR_STORAGE_KEY]);
  });

  it('serializes rapid selections so a slow earlier write cannot win', async () => {
    const { createFrequencyAvatarStore } = await import('../src/store/use-frequency-avatar-store');
    const firstWrite = deferred<void>();
    const storage = { getItem: async () => null, setItem: vi.fn(async (_key: string, _value: string): Promise<void> => {}).mockImplementationOnce(() => firstWrite.promise) };
    const store = createFrequencyAvatarStore(storage);
    await vi.waitFor(() => expect(store.getState().hydrated).toBe(true));
    store.getState().setAvatar('Mara', 'fox');
    store.getState().setAvatar('Mara', 'cat');
    await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1));
    firstWrite.resolve();
    await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(2));
    expect(JSON.parse(storage.setItem.mock.calls[1][1]).choices.mara).toBe('cat');
  });

  it('hydrates malformed storage without crashing and ignores invalid edits', async () => {
    const { createFrequencyAvatarStore } = await import('../src/store/use-frequency-avatar-store');
    const storage = { getItem: async () => '{broken', setItem: vi.fn(async () => undefined) };
    const store = createFrequencyAvatarStore(storage);
    await vi.waitFor(() => expect(store.getState().hydrated).toBe(true));
    expect(store.getState().choices).toEqual({});
    store.getState().setAvatar('  ', 'bear');
    store.getState().setAvatar('Mara', 'dragon' as FrequencyAvatarId);
    expect(store.getState().choices).toEqual({});
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps local edits after read failure and recovers old choices before saving', async () => {
    const { createFrequencyAvatarStore } = await import('../src/store/use-frequency-avatar-store');
    const storage = { getItem: vi.fn().mockRejectedValue(new Error('offline')), setItem: vi.fn(async (_key: string, _value: string) => undefined) };
    const store = createFrequencyAvatarStore(storage);
    await vi.waitFor(() => expect(store.getState().storageError).toBe(true));
    store.getState().setAvatar('Mara', 'rabbit');
    await vi.waitFor(() => expect(storage.getItem).toHaveBeenCalledTimes(2));
    expect(store.getState().choices.mara).toBe('rabbit');
    expect(storage.setItem).not.toHaveBeenCalled();
    storage.getItem.mockResolvedValue(JSON.stringify({ version: 1, choices: { noor: 'owl' } }));
    store.getState().retrySave();
    await vi.waitFor(() => expect(store.getState().storageError).toBe(false));
    expect(store.getState().choices).toEqual({ noor: 'owl', mara: 'rabbit' });
    await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1));
    expect(JSON.parse(storage.setItem.mock.calls[0][1]).choices).toEqual({ noor: 'owl', mara: 'rabbit' });
  });

  it('retains the visible choice on failed writes and can retry it', async () => {
    const { createFrequencyAvatarStore } = await import('../src/store/use-frequency-avatar-store');
    const storage = { getItem: async () => null, setItem: vi.fn().mockRejectedValue(new Error('storage full')) };
    const store = createFrequencyAvatarStore(storage);
    await vi.waitFor(() => expect(store.getState().hydrated).toBe(true));
    store.getState().setAvatar('Mara', 'cat');
    await vi.waitFor(() => expect(store.getState().storageError).toBe(true));
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(store.getState().choices.mara).toBe('cat');
    storage.setItem.mockResolvedValue(undefined);
    store.getState().retrySave();
    await vi.waitFor(() => expect(store.getState().storageError).toBe(false));
    expect(storage.setItem).toHaveBeenCalledTimes(3);
  });
});

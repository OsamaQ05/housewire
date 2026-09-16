import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClubGameInput } from '../src/features/family-club/model';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => undefined } }));
const input: ClubGameInput = { id: 'first', mode: 'escape', title: 'Line 13', playedAt: '2026-09-11T12:00:00Z', practice: false, participants: [{ name: 'Osama', won: true }] };

describe('Family Club persistence', () => {
  beforeEach(() => vi.resetModules());
  it('merges a finish received before hydration with existing saved history', async () => {
    const { insertGame } = await import('../src/features/family-club/model');
    const old = insertGame({ members: [], games: [] }, { ...input, id: 'older' });
    let restore!: (value: string) => void;
    const storage = { getItem: vi.fn(() => new Promise<string>((resolve) => { restore = resolve; })), setItem: vi.fn(async (_key: string, _value: string) => undefined) };
    const { createFamilyClubStore } = await import('../src/store/use-family-club-store');
    const store = createFamilyClubStore(storage);
    store.getState().record(input);
    restore(JSON.stringify({ version: 1, ...old }));
    await vi.waitFor(() => expect(store.getState().hydrated).toBe(true));
    expect(store.getState().games).toHaveLength(2);
    expect(store.getState().members).toHaveLength(1);
    await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalled());
    expect(JSON.parse(storage.setItem.mock.calls.at(-1)![1] as string).games).toHaveLength(2);
  });
  it('retains history after renaming and rejects duplicate aliases', async () => {
    const { createFamilyClubStore } = await import('../src/store/use-family-club-store');
    const store = createFamilyClubStore({ getItem: async () => null, setItem: async () => undefined });
    await vi.waitFor(() => expect(store.getState().hydrated).toBe(true));
    store.getState().record(input);
    const id = store.getState().members[0].id;
    expect(store.getState().saveMember('Oss', '#FFD166', id)).toBeUndefined();
    store.getState().record({ ...input, id: 'second' });
    expect(store.getState().members).toHaveLength(1);
    expect(store.getState().saveMember('Osama', '#FFD166')).toMatch(/already/);
    expect(store.getState().games[0].participants[0].memberId).toBe(id);
  });
  it('retries a failed write and reports a persistent error until retried', async () => {
    const storage = { getItem: async () => null, setItem: vi.fn().mockRejectedValue(new Error('full')) };
    const { createFamilyClubStore } = await import('../src/store/use-family-club-store');
    const store = createFamilyClubStore(storage);
    await vi.waitFor(() => expect(store.getState().hydrated).toBe(true));
    store.getState().record(input);
    await vi.waitFor(() => expect(store.getState().storageError).toBe(true));
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    storage.setItem.mockResolvedValue(undefined);
    store.getState().retrySave();
    await vi.waitFor(() => expect(store.getState().storageError).toBe(false));
    expect(store.getState().games).toHaveLength(1);
  });
  it('recovers existing history before saving finishes after a failed initial read', async () => {
    const { insertGame } = await import('../src/features/family-club/model');
    const old = insertGame({ members: [], games: [] }, { ...input, id: 'older' });
    const storage = { getItem: vi.fn().mockRejectedValue(new Error('temporarily unavailable')), setItem: vi.fn(async (_key: string, _value: string) => undefined) };
    const { createFamilyClubStore } = await import('../src/store/use-family-club-store');
    const store = createFamilyClubStore(storage);
    await vi.waitFor(() => expect(store.getState().storageError).toBe(true));
    store.getState().record(input);
    expect(store.getState().games).toHaveLength(1);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.getState().saveMember('New player', '#FFD166')).toMatch(/storage/);
    storage.getItem.mockResolvedValue(JSON.stringify({ version: 1, ...old }));
    store.getState().retrySave();
    await vi.waitFor(() => expect(store.getState().storageError).toBe(false));
    expect(store.getState().games).toHaveLength(2);
    await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalled());
    expect(JSON.parse(storage.setItem.mock.calls.at(-1)![1]).games).toHaveLength(2);
  });
});

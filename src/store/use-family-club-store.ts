import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { cleanName, insertGame, memberForName, nameKey, newMember, parseClubData, type ClubData, type ClubGameInput } from '../features/family-club/model';

export const CLUB_STORAGE_KEY = 'housewire-family-club-v1';
interface ClubStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> }
interface ClubState extends ClubData {
  hydrated: boolean;
  storageError: boolean;
  record(game: ClubGameInput): void;
  recordMany(games: readonly ClubGameInput[]): void;
  saveMember(name: string, color: string, id?: string): string | undefined;
  retrySave(): void;
}

export function createFamilyClubStore(storage: ClubStorage) {
  let pending: ((data: ClubData) => ClubData)[] = [];
  let readFailed = false;
  let reading = false;
  let queue = Promise.resolve();
  const save = (data: ClubData) => {
    const serialized = JSON.stringify({ version: 1, members: data.members, games: data.games });
    queue = queue.then(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try { await storage.setItem(CLUB_STORAGE_KEY, serialized); useStore.setState({ storageError: false }); return; } catch { /* Retry a transient write once. */ }
      }
      useStore.setState({ storageError: true });
    });
  };
  const apply = (update: (data: ClubData) => ClubData) => {
    const current = useStore.getState();
    if (!current.hydrated) { pending.push(update); return; }
    const next = update(current);
    if (next === current) return;
    useStore.setState(next);
    // Never overwrite unknown on-disk history after a failed read.
    if (readFailed) pending.push(update);
    else save(next);
  };
  const useStore = create<ClubState>()((set, get) => ({
    members: [], games: [], hydrated: false, storageError: false,
    record: (game) => apply((data) => insertGame(data, game)),
    recordMany: (games) => apply((data) => games.reduce(insertGame, data)),
    saveMember: (value, color, id) => {
      if (!get().hydrated) return 'Your family is still loading. Try again in a moment.';
      if (readFailed) return 'Phone storage is unavailable. Retry from Family Club before editing players.';
      const name = cleanName(value);
      if (!name) return 'Add a name first.';
      const other = memberForName(get().members, name);
      if (other && other.id !== id) return 'That name is already in your family. Use a different nickname.';
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) return 'Choose a player color.';
      apply((data) => ({ ...data, members: id ? data.members.map((m) => m.id === id ? { ...m, name, color, aliases: [...new Set([...m.aliases, nameKey(name)])] } : m) : [...data.members, newMember(name, data.members.length, color)] }));
      return undefined;
    },
    retrySave: () => { if (readFailed) void restore(); else save(get()); },
  }));
  async function restore() {
    if (reading) return;
    reading = true;
    try {
      const raw = await storage.getItem(CLUB_STORAGE_KEY);
      let data = parseClubData(raw);
      for (const update of pending) data = update(data);
      const changed = pending.length > 0;
      pending = [];
      readFailed = false;
      useStore.setState({ ...data, hydrated: true, storageError: false });
      if (changed) save(data);
    } catch {
      readFailed = true;
      if (!useStore.getState().hydrated) {
        let data: ClubData = { members: [], games: [] };
        for (const update of pending) data = update(data);
        useStore.setState(data);
      }
      useStore.setState({ hydrated: true, storageError: true });
    } finally { reading = false; }
  }
  void restore();
  return useStore;
}

export const useFamilyClubStore = createFamilyClubStore(AsyncStorage);

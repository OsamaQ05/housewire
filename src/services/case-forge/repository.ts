import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  assertPlayableForgeCase,
  forgeCaseSummary,
  type ForgeCase,
  type ForgeCaseSummary,
} from '../../domain/case-forge';
import type { ForgeCaseRepository, KeyValueStorage } from './types';
import { forgeUtf8ByteLength, parseSafeForgeJson } from './serialization';

const DEFAULT_STORAGE_KEY = 'housewire-case-forge-library-v1';
const MAX_CASES = 24;
const MAX_STORAGE_BYTES = 4 * 1_024 * 1_024;

function cloneCase(game: ForgeCase): ForgeCase {
  return JSON.parse(JSON.stringify(game)) as ForgeCase;
}

export class MemoryForgeCaseRepository implements ForgeCaseRepository {
  private cases = new Map<string, ForgeCase>();

  async list(): Promise<readonly ForgeCaseSummary[]> {
    return [...this.cases.values()]
      .sort((first, second) => second.createdAt - first.createdAt)
      .map(forgeCaseSummary);
  }

  async get(caseId: string): Promise<ForgeCase | null> {
    const game = this.cases.get(caseId);
    return game ? cloneCase(game) : null;
  }

  async save(game: ForgeCase): Promise<void> {
    const valid = assertPlayableForgeCase(game);
    this.cases.set(valid.id, cloneCase(valid));
    const ordered = [...this.cases.values()].sort((first, second) => second.createdAt - first.createdAt);
    this.cases = new Map(ordered.slice(0, MAX_CASES).map((entry) => [entry.id, entry]));
  }

  async remove(caseId: string): Promise<boolean> {
    return this.cases.delete(caseId);
  }
}

export class AsyncStorageForgeCaseRepository implements ForgeCaseRepository {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly storageKey = DEFAULT_STORAGE_KEY,
  ) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readCases(): Promise<ForgeCase[]> {
    const serialized = await this.storage.getItem(this.storageKey);
    if (!serialized) return [];
    if (forgeUtf8ByteLength(serialized) > MAX_STORAGE_BYTES) throw new Error('Stored Case Forge library is too large.');
    const parsed = parseSafeForgeJson(serialized, MAX_STORAGE_BYTES);
    if (!Array.isArray(parsed)) throw new Error('Stored Case Forge library is invalid.');
    const valid: ForgeCase[] = [];
    let repaired = parsed.length > MAX_CASES;
    for (const entry of parsed.slice(0, MAX_CASES)) {
      try {
        valid.push(assertPlayableForgeCase(entry));
      } catch {
        // One damaged record should not strand every other saved case.
        repaired = true;
      }
    }
    if (repaired) await this.writeCases(valid);
    return valid;
  }

  private async writeCases(cases: readonly ForgeCase[]): Promise<void> {
    const serialized = JSON.stringify(cases.slice(0, MAX_CASES));
    if (forgeUtf8ByteLength(serialized) > MAX_STORAGE_BYTES) throw new Error('Case Forge library exceeds local storage limit.');
    await this.storage.setItem(this.storageKey, serialized);
  }

  list(): Promise<readonly ForgeCaseSummary[]> {
    return this.serialize(async () => (await this.readCases())
      .sort((first, second) => second.createdAt - first.createdAt)
      .map(forgeCaseSummary));
  }

  get(caseId: string): Promise<ForgeCase | null> {
    return this.serialize(async () => {
      const game = (await this.readCases()).find((entry) => entry.id === caseId);
      return game ? cloneCase(game) : null;
    });
  }

  save(game: ForgeCase): Promise<void> {
    return this.serialize(async () => {
      const valid = assertPlayableForgeCase(game);
      const existing = (await this.readCases()).filter((entry) => entry.id !== valid.id);
      await this.writeCases([cloneCase(valid), ...existing].sort((first, second) => second.createdAt - first.createdAt));
    });
  }

  remove(caseId: string): Promise<boolean> {
    return this.serialize(async () => {
      const existing = await this.readCases();
      const remaining = existing.filter((entry) => entry.id !== caseId);
      if (remaining.length === existing.length) return false;
      await this.writeCases(remaining);
      return true;
    });
  }
}

export function createAsyncStorageForgeCaseRepository(
  storage: KeyValueStorage = AsyncStorage,
  storageKey = DEFAULT_STORAGE_KEY,
): ForgeCaseRepository {
  return new AsyncStorageForgeCaseRepository(storage, storageKey);
}

import type { RelayClientRole, RelayResumeCredentials } from '@/src/services/transport';

export interface RelayResumeIdentity {
  clientId: string;
  relayUrl: string;
  role: RelayClientRole;
  sessionId: string;
}

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const RESUME_CREDENTIAL = /^[a-zA-Z0-9_-]{43}$/;
const INDEX_KEY = 'housewire.relay.v1.index';
const ITEM_PREFIX = 'housewire.relay.v1.';

/** Implemented with Keychain/Keystore natively; never with public app persistence. */
export interface RelayCredentialStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Private bounded cache with optional encrypted persistence. Each entry is
 * under 2 KiB, for older Keychain limits. No credentials enter app state,
 * AsyncStorage, logs, QR tickets, board snapshots, or analytics.
 */
export class RelayResumeVault {
  private readonly entries = new Map<string, RelayResumeCredentials>();
  private readonly touchedBeforeHydration = new Set<string>();
  private readonly storedKeys = new Set<string>();
  private hydration?: Promise<void>;
  private hydrated = false;
  private clearedBeforeHydration = false;
  private writes = Promise.resolve();
  storageUnavailable = false;

  constructor(private readonly maximumEntries = 8, private readonly storage?: RelayCredentialStorage) {
    if (!Number.isInteger(maximumEntries) || maximumEntries < 1 || maximumEntries > 32) {
      throw new Error('The relay resume vault must hold between 1 and 32 identities.');
    }
  }

  /** Await before opening the socket so the first join carries its original proof. */
  hydrate(): Promise<void> {
    if (this.hydration) return this.hydration;
    this.hydration = (async () => {
      if (!this.storage) { this.hydrated = true; return; }
      try {
        const raw = await this.storage.getItem(INDEX_KEY);
        const keys: unknown = raw && raw.length <= 4096 ? JSON.parse(raw) : [];
        if (!Array.isArray(keys) || keys.length > 32) throw new Error('Invalid private vault index.');
        for (const key of keys) {
          if (typeof key !== 'string' || !/^housewire\.relay\.v1\.[a-z0-9]{1,7}-[a-z0-9]{1,7}$/.test(key)) continue;
          this.storedKeys.add(key);
          const text = await this.storage.getItem(key);
          if (!text || text.length > 2048) continue;
          let record: { version?: unknown; identity?: unknown; credentials?: unknown };
          try { record = JSON.parse(text); } catch { continue; }
          if (!record || record.version !== 1 || typeof record.identity !== 'string') continue;
          const identity = parseIdentityKey(record.identity);
          if (!identity || privateStorageKey(record.identity) !== key) continue;
          const credentials = record.credentials as RelayResumeCredentials | undefined;
          if (!credentials || !validCredentials(credentials) || !credentialsMatchIdentity(credentials, identity)) continue;
          if (!this.clearedBeforeHydration && !this.touchedBeforeHydration.has(record.identity) && !this.entries.has(record.identity)) {
            this.entries.set(record.identity, { ...credentials });
          }
        }
        // Receipts issued while a slow restore was in flight are newest, not
        // candidates for eviction by older persisted identities.
        for (const key of this.touchedBeforeHydration) {
          const fresh = this.entries.get(key);
          if (fresh) { this.entries.delete(key); this.entries.set(key, fresh); }
        }
        this.trim();
      } catch {
        // Retain valid in-memory proofs. Never fall back to unencrypted device storage.
        this.storageUnavailable = true;
      } finally {
        this.hydrated = true;
        this.touchedBeforeHydration.clear();
      }
    })();
    return this.hydration;
  }

  async restore(identity: RelayResumeIdentity): Promise<RelayResumeCredentials | undefined> {
    identityKey(identity);
    await this.hydrate();
    return this.read(identity);
  }

  read(identity: RelayResumeIdentity): RelayResumeCredentials | undefined {
    const stored = this.entries.get(identityKey(identity));
    return stored ? { ...stored } : undefined;
  }

  write(identity: RelayResumeIdentity, credentials: RelayResumeCredentials | undefined): void {
    const key = identityKey(identity);
    if (credentials && (!validCredentials(credentials) || !credentialsMatchIdentity(credentials, identity))) {
      throw new Error('Reconnect credentials are bound to one exact room, phone, and role.');
    }
    if (!this.hydrated) this.touchedBeforeHydration.add(key);
    if (!credentials) {
      this.entries.delete(key);
      this.queueWrite();
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, { ...credentials });
    this.trim();
    this.queueWrite();
  }

  clear(): void {
    this.entries.clear();
    if (!this.hydrated) this.clearedBeforeHydration = true;
    this.queueWrite();
  }

  /** Useful before a deliberate reset and in lifecycle regression tests. */
  async flush(): Promise<void> { await this.writes; }

  private trim(): void {
    while (this.entries.size > this.maximumEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
    }
  }

  private queueWrite(): void {
    if (!this.storage) return;
    this.writes = this.writes.then(async () => {
      await this.hydrate();
      try {
        const nextKeys = new Set<string>();
        for (const [identity, credentials] of [...this.entries]) {
          const key = privateStorageKey(identity);
          const text = JSON.stringify({ version: 1, identity, credentials });
          if (text.length > 2048) throw new Error('Private reconnect entry exceeds its size bound.');
          await this.storage!.setItem(key, text);
          nextKeys.add(key);
        }
        await this.storage!.setItem(INDEX_KEY, JSON.stringify([...nextKeys]));
        for (const key of this.storedKeys) if (!nextKeys.has(key)) await this.storage!.removeItem(key);
        this.storedKeys.clear();
        for (const key of nextKeys) this.storedKeys.add(key);
        this.storageUnavailable = false;
      } catch { this.storageUnavailable = true; }
    });
  }
}

function identityKey(identity: RelayResumeIdentity): string {
  if (
    !SAFE_ID.test(identity.sessionId) ||
    !SAFE_ID.test(identity.clientId) ||
    (identity.role !== 'host' && identity.role !== 'guest' && identity.role !== 'probe') ||
    identity.relayUrl.length < 1 ||
    identity.relayUrl.length > 240
  ) {
    throw new Error('Cannot cache reconnect credentials for an invalid relay identity.');
  }
  let url: URL;
  try { url = new URL(identity.relayUrl); } catch { throw new Error('Invalid relay address for private reconnect storage.'); }
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) {
    throw new Error('Private reconnect storage requires a credential-free relay endpoint.');
  }
  return `${url.toString()}\u0000${identity.sessionId}\u0000${identity.clientId}\u0000${identity.role}`;
}

function parseIdentityKey(key: string): RelayResumeIdentity | undefined {
  const parts = key.split('\u0000');
  if (parts.length !== 4) return undefined;
  const identity = { relayUrl: parts[0], sessionId: parts[1], clientId: parts[2], role: parts[3] as RelayClientRole };
  try { return identityKey(identity) === key ? identity : undefined; } catch { return undefined; }
}

function privateStorageKey(identity: string): string {
  // Names are opaque locators, not security tokens. Exact identity is checked
  // inside the encrypted value as well, so a hash collision cannot rebind a proof.
  let left = 2166136261; let right = 5381;
  for (const letter of identity) { left = Math.imul(left ^ letter.charCodeAt(0), 16777619); right = Math.imul(right, 33) ^ letter.charCodeAt(0); }
  return `${ITEM_PREFIX}${(left >>> 0).toString(36)}-${(right >>> 0).toString(36)}`;
}

function validCredentials(credentials: RelayResumeCredentials): boolean {
  return (
    SAFE_ID.test(credentials.sessionId) &&
    SAFE_ID.test(credentials.clientId) &&
    SAFE_ID.test(credentials.roomEpoch) &&
    RESUME_CREDENTIAL.test(credentials.credential) &&
    (credentials.role === 'host' || credentials.role === 'guest' || credentials.role === 'probe')
  );
}

function credentialsMatchIdentity(
  credentials: RelayResumeCredentials,
  identity: RelayResumeIdentity,
): boolean {
  return (
    credentials.sessionId === identity.sessionId &&
    credentials.clientId === identity.clientId &&
    credentials.role === identity.role
  );
}

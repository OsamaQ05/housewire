import { describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { RelayResumeVault, type RelayCredentialStorage, type RelayResumeIdentity } from '../src/features/session/relay-resume-vault';
import { HousewireRelay } from '../server/relay';
import { LanWebSocketTransport, type WebSocketLike } from '../src/services/transport/lan-websocket';
import type { RelayResumeCredentials } from '../src/services/transport/types';

const identity: RelayResumeIdentity = { clientId: 'guest', relayUrl: 'ws://house.local:8787', role: 'guest', sessionId: 'ROOM1' };
const proof: RelayResumeCredentials = { clientId: 'guest', credential: 'A'.repeat(43), role: 'guest', roomEpoch: 'epoch-one', sessionId: 'ROOM1' };
function storageFixture() {
  const values = new Map<string, string>();
  const storage: RelayCredentialStorage = {
    getItem: vi.fn(async (key) => values.get(key) ?? null),
    setItem: vi.fn(async (key, value) => { values.set(key, value); }),
    removeItem: vi.fn(async (key) => { values.delete(key); }),
  };
  return { values, storage };
}

describe('encrypted relay resume persistence contract', () => {
  it('restores into a completely new vault after a cold start, normalising endpoint spelling', async () => {
    const { storage, values } = storageFixture();
    const first = new RelayResumeVault(8, storage);
    first.write(identity, proof); await first.flush();
    const second = new RelayResumeVault(8, storage);
    expect(second.read(identity)).toBeUndefined();
    expect(await second.restore({ ...identity, relayUrl: 'ws://HOUSE.local:8787/' })).toEqual(proof);
    expect([...values.values()].every((value) => value.length < 2048)).toBe(true);
    expect([...values.keys()].every((key) => !key.includes(proof.credential) && !key.includes('house.local'))).toBe(true);
  });

  it('isolates relay, room, phone, role and epoch; stored data cannot rebind a proof', async () => {
    const { storage, values } = storageFixture();
    const first = new RelayResumeVault(8, storage);
    first.write(identity, proof); await first.flush();
    const second = new RelayResumeVault(8, storage); await second.hydrate();
    for (const change of [{ relayUrl: 'wss://house.local:8787' }, { sessionId: 'ROOM2' }, { clientId: 'other' }, { role: 'host' as const }]) {
      expect(second.read({ ...identity, ...change })).toBeUndefined();
    }
    const itemKey = [...values.keys()].find((key) => !key.endsWith('.index'))!;
    const stored = JSON.parse(values.get(itemKey)!);
    stored.credentials.clientId = 'intruder'; values.set(itemKey, JSON.stringify(stored));
    expect(await new RelayResumeVault(8, storage).restore(identity)).toBeUndefined();
  });

  it('does not let a late restore overwrite a freshly issued proof', async () => {
    const { storage } = storageFixture();
    const first = new RelayResumeVault(8, storage); first.write(identity, proof); await first.flush();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const delayed: RelayCredentialStorage = { ...storage, getItem: async (key) => { await gate; return storage.getItem(key); } };
    const restarted = new RelayResumeVault(8, delayed);
    const hydration = restarted.hydrate(); expect(restarted.hydrate()).toBe(hydration);
    const replacement = { ...proof, credential: 'B'.repeat(43), roomEpoch: 'epoch-two' };
    restarted.write(identity, replacement); release(); await hydration; await restarted.flush();
    expect(restarted.read(identity)).toEqual(replacement);
    expect(await new RelayResumeVault(8, storage).restore(identity)).toEqual(replacement);
  });

  it('does not resurrect a deleted identity when asynchronous initialization finishes', async () => {
    const { storage } = storageFixture();
    const first = new RelayResumeVault(8, storage); first.write(identity, proof); await first.flush();
    const restarted = new RelayResumeVault(8, storage);
    restarted.write(identity, undefined); await restarted.flush();
    expect(await new RelayResumeVault(8, storage).restore(identity)).toBeUndefined();
  });

  it('clears all persisted proofs without clearing any unrelated storage', async () => {
    const { storage, values } = storageFixture(); values.set('unrelated', 'untouched');
    const first = new RelayResumeVault(8, storage); first.write(identity, proof); await first.flush();
    const restarted = new RelayResumeVault(8, storage); restarted.clear(); await restarted.flush();
    expect(await new RelayResumeVault(8, storage).restore(identity)).toBeUndefined();
    expect(values.get('unrelated')).toBe('untouched');
    expect([...values.keys()].filter((key) => key.startsWith('housewire.'))).toEqual(['housewire.relay.v1.index']);
  });

  it('evicts old encrypted entries while retaining a new identity created during restore', async () => {
    const { storage, values } = storageFixture();
    const first = new RelayResumeVault(2, storage);
    first.write(identity, proof);
    first.write({ ...identity, clientId: 'two' }, { ...proof, clientId: 'two' }); await first.flush();
    const restarted = new RelayResumeVault(2, storage);
    restarted.write({ ...identity, clientId: 'three' }, { ...proof, clientId: 'three' }); await restarted.flush();
    const final = new RelayResumeVault(2, storage); await final.hydrate();
    expect(final.read(identity)).toBeUndefined();
    expect(final.read({ ...identity, clientId: 'two' })).toBeDefined();
    expect(final.read({ ...identity, clientId: 'three' })).toBeDefined();
    expect(values.size).toBe(3); // Two small encrypted records plus their index.
  });

  it('keeps in-process reconnect working if encrypted storage is unavailable; never logs proofs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fail = async () => { throw new Error('Device storage unavailable'); };
    const vault = new RelayResumeVault(8, { getItem: fail, setItem: fail, removeItem: fail });
    await expect(vault.hydrate()).resolves.toBeUndefined();
    vault.write(identity, proof); await vault.flush();
    expect(vault.read(identity)).toEqual(proof); expect(vault.storageUnavailable).toBe(true);
    expect(log).not.toHaveBeenCalled(); log.mockRestore();
  });

  it('rejects corrupt entries, endpoint credentials and unsafe protocols', async () => {
    const { storage, values } = storageFixture(); values.set('housewire.relay.v1.index', '{bad');
    const vault = new RelayResumeVault(8, storage); await vault.hydrate();
    expect(vault.read(identity)).toBeUndefined();
    for (const relayUrl of ['https://house.local', 'ws://user:pass@house.local', 'ws://house.local?token=secret']) {
      expect(() => vault.write({ ...identity, relayUrl }, proof)).toThrow();
    }
  });
});

it('cold-restarts both host and guest over a real relay without losing their original phone claims', async () => {
  const relay = new HousewireRelay<{ value: string }>({ host: '127.0.0.1', port: 0 });
  const address = await relay.start();
  const transports: LanWebSocketTransport<{ value: string }>[] = [];
  const hostStorage = storageFixture().storage; const guestStorage = storageFixture().storage;
  const hostIdentity: RelayResumeIdentity = { relayUrl: address.url, sessionId: 'cold-restart', clientId: 'local', role: 'host' };
  const guestIdentity: RelayResumeIdentity = { ...hostIdentity, clientId: 'guest', role: 'guest' };
  const factory = (url: string): WebSocketLike => new WebSocket(url) as unknown as WebSocketLike;
  const start = async (who: RelayResumeIdentity, storage: RelayCredentialStorage) => {
    const freshVault = new RelayResumeVault(8, storage);
    const credentials = await freshVault.restore(who);
    const transport = new LanWebSocketTransport<{ value: string }>({
      url: who.relayUrl, sessionId: who.sessionId, clientId: who.clientId, role: who.role,
      reconnect: false, webSocketFactory: factory, resumeCredentials: credentials,
      onResumeCredentials: (value) => freshVault.write(who, value),
    });
    transports.push(transport); await transport.connect(); await freshVault.flush(); return transport;
  };
  try {
    const firstHost = await start(hostIdentity, hostStorage); const firstGuest = await start(guestIdentity, guestStorage);
    await firstHost.publish({ value: 'before' }, { eventId: 'before-restart' });
    await firstGuest.disconnect(); await firstHost.disconnect();
    const nextHost = await start(hostIdentity, hostStorage); const nextGuest = await start(guestIdentity, guestStorage);
    const received: string[] = []; nextGuest.subscribe((frame) => received.push(frame.payload.value));
    await nextHost.publish({ value: 'after' }, { eventId: 'after-restart' });
    const deadline = Date.now() + 3000;
    while (!received.includes('after') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(nextHost.state).toBe('connected'); expect(nextGuest.state).toBe('connected'); expect(received).toContain('after');
  } finally { await Promise.all(transports.map((transport) => transport.disconnect())); await relay.stop(); }
}, 15_000);

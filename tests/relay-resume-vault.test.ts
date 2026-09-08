import { describe, expect, it } from 'vitest';

import { RelayResumeVault } from '../src/features/session/relay-resume-vault';
import type { RelayResumeCredentials } from '../src/services/transport';

const identity = {
  clientId: 'phone-a',
  relayUrl: 'ws://192.168.1.8:8787',
  role: 'guest' as const,
  sessionId: 'ROOM1',
};

const credentials: RelayResumeCredentials = {
  clientId: identity.clientId,
  credential: 'A'.repeat(43),
  role: identity.role,
  roomEpoch: 'room-epoch-1',
  sessionId: identity.sessionId,
};

describe('session reconnect credential vault', () => {
  it('returns a credential only for the exact relay, room, client, and role', () => {
    const vault = new RelayResumeVault();
    vault.write(identity, credentials);

    expect(vault.read(identity)).toEqual(credentials);
    expect(vault.read({ ...identity, relayUrl: 'ws://192.168.1.9:8787' })).toBeUndefined();
    expect(vault.read({ ...identity, sessionId: 'ROOM2' })).toBeUndefined();
    expect(vault.read({ ...identity, clientId: 'phone-b' })).toBeUndefined();
    expect(vault.read({ ...identity, role: 'host' })).toBeUndefined();
  });

  it('rejects malformed or rebound credentials and deletes a reset identity', () => {
    const vault = new RelayResumeVault();
    expect(() => vault.write(identity, { ...credentials, credential: 'short' })).toThrow(/exact room/i);
    expect(() => vault.write(identity, { ...credentials, clientId: 'phone-b' })).toThrow(/exact room/i);
    expect(() => vault.write(identity, { ...credentials, role: 'host' })).toThrow(/exact room/i);

    vault.write(identity, credentials);
    vault.write(identity, undefined);
    expect(vault.read(identity)).toBeUndefined();
  });

  it('keeps a small bounded working set without leaking older session proofs', () => {
    const vault = new RelayResumeVault(2);
    for (const suffix of ['A', 'B', 'C']) {
      const nextIdentity = { ...identity, clientId: `phone-${suffix}` };
      vault.write(nextIdentity, { ...credentials, clientId: nextIdentity.clientId });
    }
    expect(vault.read({ ...identity, clientId: 'phone-A' })).toBeUndefined();
    expect(vault.read({ ...identity, clientId: 'phone-B' })).toBeDefined();
    expect(vault.read({ ...identity, clientId: 'phone-C' })).toBeDefined();
  });
});

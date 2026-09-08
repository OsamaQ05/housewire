import type { RelayClientRole, RelayResumeCredentials } from '@/src/services/transport';

export interface RelayResumeIdentity {
  clientId: string;
  relayUrl: string;
  role: RelayClientRole;
  sessionId: string;
}

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const RESUME_CREDENTIAL = /^[a-zA-Z0-9_-]{43}$/;

/**
 * A deliberately private, bounded cache for reconnections during this app
 * process. It is not part of product state, persistence, QR tickets, or any
 * relay payload, which keeps credentials out of snapshots and diagnostics.
 */
export class RelayResumeVault {
  private readonly entries = new Map<string, RelayResumeCredentials>();

  constructor(private readonly maximumEntries = 8) {
    if (!Number.isInteger(maximumEntries) || maximumEntries < 1 || maximumEntries > 32) {
      throw new Error('The relay resume vault must hold between 1 and 32 identities.');
    }
  }

  read(identity: RelayResumeIdentity): RelayResumeCredentials | undefined {
    const stored = this.entries.get(identityKey(identity));
    return stored ? { ...stored } : undefined;
  }

  write(identity: RelayResumeIdentity, credentials: RelayResumeCredentials | undefined): void {
    const key = identityKey(identity);
    if (!credentials) {
      this.entries.delete(key);
      return;
    }
    if (!validCredentials(credentials) || !credentialsMatchIdentity(credentials, identity)) {
      throw new Error('Reconnect credentials are bound to one exact room, phone, and role.');
    }
    this.entries.delete(key);
    this.entries.set(key, { ...credentials });
    while (this.entries.size > this.maximumEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
    }
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
  return `${identity.relayUrl}\u0000${identity.sessionId}\u0000${identity.clientId}\u0000${identity.role}`;
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

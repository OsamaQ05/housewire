import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { HousewireRelay } from '../server/relay';
import {
  LanWebSocketTransport,
  RelayProtocolError,
  type WebSocketLike,
} from '../src/services/transport/lan-websocket';
import {
  MAXIMUM_RELAY_MESSAGE_BYTES,
  type RelayResumeCredentials,
} from '../src/services/transport/types';

interface Payload {
  action: string;
}

interface RelayReply {
  clientId?: string;
  code?: string;
  resumeCredential?: string;
  role?: string;
  roomEpoch?: string;
  sessionId?: string;
  type?: string;
}

const activeRelays: HousewireRelay[] = [];
const factory = (url: string): WebSocketLike => new WebSocket(url) as unknown as WebSocketLike;

afterEach(async () => {
  await Promise.all(activeRelays.splice(0).map((relay) => relay.stop()));
});

describe('relay reconnect identity security', () => {
  it('rejects host hijacks while active and offline, but accepts the exact private resume credential', async () => {
    const address = await startRelay();
    let hostCredentials: RelayResumeCredentials | undefined;
    const host = transport(address.url, 'HOST1', 'host-phone', 'host', {
      onResumeCredentials: (credentials) => { hostCredentials = credentials; },
    });
    await host.connect();
    expect(hostCredentials?.credential).toMatch(/^[a-zA-Z0-9_-]{43}$/);

    const activeHijacker = transport(address.url, 'HOST1', 'host-phone', 'host');
    await expect(activeHijacker.connect()).rejects.toMatchObject({ code: 'RESUME_REQUIRED' });
    expect(host.state).toBe('connected');

    await host.disconnect();
    const offlineHijacker = transport(address.url, 'HOST1', 'host-phone', 'host');
    await expect(offlineHijacker.connect()).rejects.toMatchObject({ code: 'RESUME_REQUIRED' });
    const offlineReplacementHost = transport(address.url, 'HOST1', 'different-host', 'host');
    await expect(offlineReplacementHost.connect()).rejects.toMatchObject({ code: 'HOST_EXISTS' });

    const resumedHost = transport(address.url, 'HOST1', 'host-phone', 'host', {
      resumeCredentials: hostCredentials,
    });
    await resumedHost.connect();
    const replacementHost = transport(address.url, 'HOST1', 'different-host', 'host');
    await expect(replacementHost.connect()).rejects.toMatchObject({ code: 'HOST_EXISTS' });
    expect(resumedHost.state).toBe('connected');

    await Promise.all([
      activeHijacker.disconnect(),
      offlineHijacker.disconnect(),
      offlineReplacementHost.disconnect(),
      replacementHost.disconnect(),
      resumedHost.disconnect(),
    ]);
  });

  it('rejects peer hijacks and lets a valid credential replace only its own active socket', async () => {
    const address = await startRelay();
    const host = transport(address.url, 'PEERS', 'host', 'host');
    let peerCredentials: RelayResumeCredentials | undefined;
    const peer = transport(address.url, 'PEERS', 'peer-a', 'guest', {
      onResumeCredentials: (credentials) => { peerCredentials = credentials; },
    });
    await host.connect();
    await peer.connect();
    expect(peerCredentials).toBeDefined();

    const missingProof = transport(address.url, 'PEERS', 'peer-a', 'guest');
    await expect(missingProof.connect()).rejects.toMatchObject({ code: 'RESUME_REQUIRED' });
    const wrongProof = transport(address.url, 'PEERS', 'peer-a', 'guest', {
      resumeCredentials: { ...peerCredentials!, credential: 'W'.repeat(43) },
    });
    await expect(wrongProof.connect()).rejects.toMatchObject({ code: 'INVALID_RESUME' });
    expect(peer.state).toBe('connected');

    const validResume = transport(address.url, 'PEERS', 'peer-a', 'guest', {
      resumeCredentials: peerCredentials,
    });
    await validResume.connect();
    await waitFor(() => peer.state === 'closed');
    expect(validResume.state).toBe('connected');

    await Promise.all([
      host.disconnect(),
      peer.disconnect(),
      missingProof.disconnect(),
      wrongProof.disconnect(),
      validResume.disconnect(),
    ]);
  });

  it('binds credentials to one room, client id, and immutable role on client and server', async () => {
    const address = await startRelay();
    let credentials: RelayResumeCredentials | undefined;
    const hostA = transport(address.url, 'ROOM-A', 'host-a', 'host', {
      onResumeCredentials: (next) => { credentials = next; },
    });
    const hostB = transport(address.url, 'ROOM-B', 'host-b', 'host');
    await hostA.connect();
    await hostB.connect();

    expect(() => transport(address.url, 'ROOM-A', 'other-client', 'host', {
      resumeCredentials: credentials,
    })).toThrowError(RelayProtocolError);
    expect(() => transport(address.url, 'ROOM-B', 'host-a', 'host', {
      resumeCredentials: credentials,
    })).toThrowError(/one exact room/i);
    expect(() => transport(address.url, 'ROOM-A', 'host-a', 'guest', {
      resumeCredentials: credentials,
    })).toThrowError(/one exact room/i);

    const changedClient = await rawJoin(address.url, {
      type: 'join',
      sessionId: 'ROOM-A',
      clientId: 'other-client',
      role: 'guest',
      lastSequence: 0,
      lastRoomEpoch: credentials!.roomEpoch,
      resumeCredential: credentials!.credential,
      capabilities: ['direct-v1'],
    });
    expect(changedClient).toMatchObject({ type: 'error', code: 'INVALID_RESUME' });

    const changedRole = await rawJoin(address.url, {
      type: 'join',
      sessionId: 'ROOM-A',
      clientId: 'host-a',
      role: 'guest',
      lastSequence: 0,
      lastRoomEpoch: credentials!.roomEpoch,
      resumeCredential: credentials!.credential,
      capabilities: ['direct-v1'],
    });
    expect(changedRole).toMatchObject({ type: 'error', code: 'ROLE_MISMATCH' });

    const changedRoom = await rawJoin(address.url, {
      type: 'join',
      sessionId: 'ROOM-B',
      clientId: 'host-a',
      role: 'guest',
      lastSequence: 0,
      lastRoomEpoch: credentials!.roomEpoch,
      resumeCredential: credentials!.credential,
      capabilities: ['direct-v1'],
    });
    expect(changedRoom.type).toBe('error');
    expect(changedRoom.code).not.toBeUndefined();

    await Promise.all([hostA.disconnect(), hostB.disconnect()]);
  });

  it('rejects malformed and oversized reconnect credentials without disclosing a credential', async () => {
    const address = await startRelay();
    const host = transport(address.url, 'BOUNDS', 'host', 'host');
    await host.connect();

    for (const resumeCredential of ['short', 'A'.repeat(42), 'A'.repeat(44), 'A'.repeat(4_096)]) {
      const reply = await rawJoin(address.url, {
        type: 'join',
        sessionId: 'BOUNDS',
        clientId: `guest-${resumeCredential.length}`,
        role: 'guest',
        lastSequence: 0,
        resumeCredential,
      });
      expect(reply).toMatchObject({ type: 'error', code: 'INVALID_MESSAGE' });
      expect(reply.resumeCredential).toBeUndefined();
    }

    const socket = await openRawSocket(address.url);
    const closed = new Promise<number>((resolve) => socket.once('close', resolve));
    socket.send(JSON.stringify({ padding: 'x'.repeat(MAXIMUM_RELAY_MESSAGE_BYTES) }));
    await expect(closed).resolves.toBe(1_009);
    await host.disconnect();
  });

  it('keeps reconnect credentials out of public replay frames', async () => {
    const address = await startRelay();
    let credentials: RelayResumeCredentials | undefined;
    const host = transport(address.url, 'REPLAY', 'host', 'host', {
      onResumeCredentials: (next) => { credentials = next; },
    });
    await host.connect();
    await host.publish({ action: 'public-clue' }, { eventId: 'public-clue-1' });

    const lateGuest = transport(address.url, 'REPLAY', 'late-guest', 'guest');
    const replay: unknown[] = [];
    lateGuest.subscribe((frame) => replay.push(frame));
    await lateGuest.connect();
    await waitFor(() => replay.length === 1);

    expect(credentials).toBeDefined();
    expect(JSON.stringify(replay)).not.toContain(credentials!.credential);
    expect(replay[0]).not.toHaveProperty('resumeCredential');
    await Promise.all([host.disconnect(), lateGuest.disconnect()]);
  });
});

async function startRelay() {
  const relay = new HousewireRelay<Payload>({ host: '127.0.0.1', port: 0 });
  activeRelays.push(relay);
  return relay.start();
}

function transport(
  url: string,
  sessionId: string,
  clientId: string,
  role: 'host' | 'guest',
  options: {
    onResumeCredentials?: (credentials: RelayResumeCredentials | undefined) => void;
    resumeCredentials?: RelayResumeCredentials;
  } = {},
) {
  return new LanWebSocketTransport<Payload>({
    url,
    sessionId,
    clientId,
    role,
    reconnect: false,
    webSocketFactory: factory,
    ...options,
  });
}

async function openRawSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return socket;
}

async function rawJoin(url: string, message: Record<string, unknown>): Promise<RelayReply> {
  const socket = await openRawSocket(url);
  return new Promise<RelayReply>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Timed out waiting for raw relay admission response.'));
    }, 1_000);
    socket.once('message', (raw) => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(raw.toString()) as RelayReply);
      } catch (cause) {
        reject(cause);
      } finally {
        socket.close();
      }
    });
    socket.send(JSON.stringify(message));
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for relay security condition.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

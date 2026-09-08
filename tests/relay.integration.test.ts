import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { HousewireRelay } from '../server/relay';
import { makeJoinTicket, parseJoinTicket } from '../src/features/session/protocol';
import { probeLanHouse } from '../src/features/session/join-room';
import { LanWebSocketTransport, type WebSocketLike } from '../src/services/transport/lan-websocket';
import { MAXIMUM_RELAY_MESSAGE_BYTES } from '../src/services/transport/types';
import type { RelayResumeCredentials } from '../src/services/transport/types';

interface Payload {
  action: string;
}

interface DirectPayload {
  kind: 'voice-fragment';
  transcript: string;
}

const activeRelays: HousewireRelay[] = [];

afterEach(async () => {
  await Promise.all(activeRelays.splice(0).map((relay) => relay.stop()));
});

const factory = (url: string): WebSocketLike => new WebSocket(url) as unknown as WebSocketLike;

describe('LAN relay integration', () => {
  it('broadcasts ordered frames to three phones and replays history to a late joiner', async () => {
    let serverTime = 10_000;
    const relay = new HousewireRelay<Payload>({ host: '127.0.0.1', port: 0, now: () => ++serverTime });
    activeRelays.push(relay);
    const address = await relay.start();
    const host = new LanWebSocketTransport<Payload>({
      url: address.url, sessionId: 'line13-room', clientId: 'host', reconnect: false, role: 'host', webSocketFactory: factory,
    });
    const courier = new LanWebSocketTransport<Payload>({
      url: address.url, sessionId: 'line13-room', clientId: 'courier', reconnect: false, role: 'guest', webSocketFactory: factory,
    });
    const hostFrames: number[] = [];
    const courierFrames: number[] = [];
    host.subscribe((frame) => hostFrames.push(frame.sequence));
    courier.subscribe((frame) => courierFrames.push(frame.sequence));
    await Promise.all([host.connect(), courier.connect()]);

    await host.publish({ action: 'ring' }, { eventId: 'ring-1' });
    await courier.publish({ action: 'answer' }, { eventId: 'answer-1' });
    await waitFor(() => hostFrames.length === 2 && courierFrames.length === 2);
    expect(hostFrames).toEqual([1, 2]);
    expect(courierFrames).toEqual([1, 2]);

    const late = new LanWebSocketTransport<Payload>({
      url: address.url, sessionId: 'line13-room', clientId: 'switchboard', reconnect: false, role: 'guest', webSocketFactory: factory,
    });
    const lateFrames: number[] = [];
    late.subscribe((frame) => lateFrames.push(frame.sequence));
    await late.connect();
    await waitFor(() => lateFrames.length === 2);
    expect(lateFrames).toEqual([1, 2]);

    await courier.publish({ action: 'answer-again' }, { eventId: 'answer-1' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(hostFrames).toEqual([1, 2]);
    expect(lateFrames).toEqual([1, 2]);

    await Promise.all([host.disconnect(), courier.disconnect(), late.disconnect()]);
  });

  it('returns a usable clock estimate from ping/pong', async () => {
    const relay = new HousewireRelay<Payload>({ host: '127.0.0.1', port: 0 });
    activeRelays.push(relay);
    const address = await relay.start();
    const client = new LanWebSocketTransport<Payload>({
      url: address.url, sessionId: 'clock-room', clientId: 'clock-client', reconnect: false, role: 'host', webSocketFactory: factory,
    });
    await client.connect();
    client.ping('clock-1');
    await waitFor(() => client.clockEstimate !== undefined);
    expect(client.clockEstimate!.roundTripMs).toBeGreaterThanOrEqual(0);
    await client.disconnect();
  });

  it('delivers an ephemeral direct payload only to its named player and never replays it', async () => {
    const relay = new HousewireRelay<Payload, DirectPayload>({ host: '127.0.0.1', port: 0 });
    activeRelays.push(relay);
    const address = await relay.start();
    const shared = {
      url: address.url,
      sessionId: 'dead-air-room',
      reconnect: false,
      webSocketFactory: factory,
    } as const;
    const host = new LanWebSocketTransport<Payload, DirectPayload>({
      ...shared,
      clientId: 'host',
      role: 'host',
    });
    const sender = new LanWebSocketTransport<Payload, DirectPayload>({
      ...shared,
      clientId: 'sender',
      role: 'guest',
    });
    let recipientResumeCredentials: RelayResumeCredentials | undefined;
    const recipient = new LanWebSocketTransport<Payload, DirectPayload>({
      ...shared,
      clientId: 'recipient',
      onResumeCredentials: (credentials) => { recipientResumeCredentials = credentials; },
      role: 'guest',
    });
    const hostDirect: DirectPayload[] = [];
    const senderDirect: DirectPayload[] = [];
    const recipientDirect: DirectPayload[] = [];
    host.subscribeDirect((frame) => hostDirect.push(frame.payload));
    sender.subscribeDirect((frame) => senderDirect.push(frame.payload));
    recipient.subscribeDirect((frame) => recipientDirect.push(frame.payload));
    await host.connect();
    await Promise.all([sender.connect(), recipient.connect()]);

    await expect(
      sender.publishDirect('recipient', undefined as unknown as DirectPayload, { messageId: 'direct-undefined' }),
    ).rejects.toMatchObject({ code: 'INVALID_DIRECT_PAYLOAD' });
    await expect(
      sender.publishDirect(
        'recipient',
        { toJSON: () => undefined } as unknown as DirectPayload,
        { messageId: 'direct-omitted' },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_DIRECT_PAYLOAD' });
    expect(sender.state).toBe('connected');

    const payload: DirectPayload = { kind: 'voice-fragment', transcript: 'The third caller must not hear this.' };
    const ack = await sender.publishDirect('recipient', payload, { messageId: 'direct-one' });
    await waitFor(() => recipientDirect.length === 1);
    expect(ack).toMatchObject({
      type: 'direct.ack',
      messageId: 'direct-one',
      recipientId: 'recipient',
    });
    expect(ack.deliveredAt).toBeGreaterThan(0);
    expect(recipientDirect).toEqual([payload]);
    expect(hostDirect).toEqual([]);
    expect(senderDirect).toEqual([]);

    const broadcastSequences: number[] = [];
    host.subscribe((frame) => broadcastSequences.push(frame.sequence));
    await sender.publish({ action: 'after-direct' }, { eventId: 'after-direct' });
    await waitFor(() => broadcastSequences.length === 1);
    expect(broadcastSequences).toEqual([1]);

    await recipient.disconnect();
    const reconnectedRecipient = new LanWebSocketTransport<Payload, DirectPayload>({
      ...shared,
      clientId: 'recipient',
      resumeCredentials: recipientResumeCredentials,
      role: 'guest',
    });
    const replayedDirect: DirectPayload[] = [];
    reconnectedRecipient.subscribeDirect((frame) => replayedDirect.push(frame.payload));
    await reconnectedRecipient.connect();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(replayedDirect).toEqual([]);

    const legacyRecipient = new WebSocket(address.url);
    await new Promise<void>((resolve, reject) => {
      legacyRecipient.once('open', resolve);
      legacyRecipient.once('error', reject);
    });
    const legacyJoined = new Promise<void>((resolve, reject) => {
      legacyRecipient.once('message', (raw) => {
        try {
          const message = JSON.parse(raw.toString()) as { type?: string };
          if (message.type === 'joined') resolve();
          else reject(new Error(`Unexpected legacy join response: ${message.type ?? 'missing type'}`));
        } catch (cause) {
          reject(cause);
        }
      });
    });
    legacyRecipient.send(JSON.stringify({
      type: 'join',
      sessionId: 'dead-air-room',
      clientId: 'legacy-recipient',
      lastSequence: 0,
      role: 'guest',
    }));
    await legacyJoined;
    await expect(
      sender.publishDirect('legacy-recipient', payload, { messageId: 'direct-legacy' }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_UNSUPPORTED' });
    legacyRecipient.close();

    await expect(
      sender.publishDirect('not-connected', payload, { messageId: 'direct-missing' }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_UNAVAILABLE' });
    expect(sender.state).toBe('connected');

    const foreignHost = new LanWebSocketTransport<Payload, DirectPayload>({
      ...shared,
      sessionId: 'another-house',
      clientId: 'foreign-host',
      role: 'host',
    });
    const foreignRecipient = new LanWebSocketTransport<Payload, DirectPayload>({
      ...shared,
      sessionId: 'another-house',
      clientId: 'foreign-recipient',
      role: 'guest',
    });
    await foreignHost.connect();
    await foreignRecipient.connect();
    await expect(
      sender.publishDirect('foreign-recipient', payload, { messageId: 'direct-cross-room' }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_UNAVAILABLE' });
    await expect(
      sender.publishDirect(
        'recipient',
        { kind: 'voice-fragment', transcript: 'x'.repeat(MAXIMUM_RELAY_MESSAGE_BYTES) },
        { messageId: 'direct-oversized' },
      ),
    ).rejects.toMatchObject({ code: 'MESSAGE_TOO_LARGE' });
    expect(sender.state).toBe('connected');

    await sender.publishDirect(
      'recipient',
      { kind: 'voice-fragment', transcript: 'Fresh after reconnect.' },
      { messageId: 'direct-two' },
    );
    await waitFor(() => replayedDirect.length === 1);
    expect(replayedDirect[0]?.transcript).toBe('Fresh after reconnect.');
    await Promise.all([
      host.disconnect(),
      sender.disconnect(),
      reconnectedRecipient.disconnect(),
      foreignHost.disconnect(),
      foreignRecipient.disconnect(),
    ]);
  });

  it('closes an untrusted socket that exceeds the raw relay message ceiling', async () => {
    const relay = new HousewireRelay<Payload>({
      host: '127.0.0.1',
      port: 0,
      maximumMessageBytes: MAXIMUM_RELAY_MESSAGE_BYTES * 2,
    });
    activeRelays.push(relay);
    const address = await relay.start();
    const socket = new WebSocket(address.url);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    const closed = new Promise<number>((resolve) => socket.once('close', resolve));
    socket.send(JSON.stringify({ padding: 'x'.repeat(MAXIMUM_RELAY_MESSAGE_BYTES) }));
    await expect(closed).resolves.toBe(1_009);
  });

  it('advertises a stricter relay ceiling so direct messages fail locally without disconnecting', async () => {
    const relay = new HousewireRelay<Payload, DirectPayload>({
      host: '127.0.0.1',
      port: 0,
      maximumMessageBytes: 2_048,
    });
    activeRelays.push(relay);
    const address = await relay.start();
    const host = new LanWebSocketTransport<Payload, DirectPayload>({
      url: address.url,
      sessionId: 'small-room',
      clientId: 'host',
      role: 'host',
      reconnect: false,
      webSocketFactory: factory,
    });
    const recipient = new LanWebSocketTransport<Payload, DirectPayload>({
      url: address.url,
      sessionId: 'small-room',
      clientId: 'recipient',
      role: 'guest',
      reconnect: false,
      webSocketFactory: factory,
    });
    const received: string[] = [];
    recipient.subscribeDirect((frame) => received.push(frame.payload.transcript));
    await host.connect();
    await recipient.connect();

    await expect(
      host.publishDirect(
        'recipient',
        { kind: 'voice-fragment', transcript: 'x'.repeat(2_048) },
        { messageId: 'too-large-for-room' },
      ),
    ).rejects.toMatchObject({ code: 'MESSAGE_TOO_LARGE' });
    expect(host.state).toBe('connected');
    await host.publishDirect(
      'recipient',
      { kind: 'voice-fragment', transcript: 'small' },
      { messageId: 'small-enough' },
    );
    await waitFor(() => received.length === 1);
    expect(received).toEqual(['small']);
    await Promise.all([host.disconnect(), recipient.disconnect()]);
  });

  it('rejects a guest code unless an active host owns the room', async () => {
    const relay = new HousewireRelay<Payload>({ host: '127.0.0.1', port: 0 });
    activeRelays.push(relay);
    const address = await relay.start();
    const guest = new LanWebSocketTransport<Payload>({
      url: address.url,
      sessionId: 'EMPTY',
      clientId: 'guest',
      reconnect: false,
      role: 'guest',
      webSocketFactory: factory,
    });

    await expect(guest.connect()).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' });
    expect(guest.lastError?.message).toContain('No active host');
    await guest.disconnect();
  });

  it('does not let a second socket replace an active host by copying its client id', async () => {
    const relay = new HousewireRelay<Payload>({ host: '127.0.0.1', port: 0 });
    activeRelays.push(relay);
    const address = await relay.start();
    const host = new LanWebSocketTransport<Payload>({
      url: address.url,
      sessionId: 'SAFE-HOST',
      clientId: 'host-node',
      reconnect: false,
      role: 'host',
      webSocketFactory: factory,
    });
    const impersonator = new LanWebSocketTransport<Payload>({
      url: address.url,
      sessionId: 'SAFE-HOST',
      clientId: 'host-node',
      reconnect: false,
      role: 'host',
      webSocketFactory: factory,
    });
    await host.connect();
    await expect(impersonator.connect()).rejects.toMatchObject({ code: 'RESUME_REQUIRED' });
    expect(host.state).toBe('connected');
    await host.disconnect();
    await impersonator.disconnect();
  });

  it('makes a real guest publication visible to the host and enforces the four-phone limit', async () => {
    const relay = new HousewireRelay<Payload>({ host: '127.0.0.1', port: 0 });
    activeRelays.push(relay);
    const address = await relay.start();
    const ticket = parseJoinTicket(makeJoinTicket('CREW4', address.url));
    expect(ticket).toBeDefined();
    const host = new LanWebSocketTransport<Payload>({
      url: ticket!.relayUrl, sessionId: ticket!.code, clientId: 'local', reconnect: false, role: 'host', webSocketFactory: factory,
    });
    const guests = ['guest-a', 'guest-b', 'guest-c'].map((clientId) => new LanWebSocketTransport<Payload>({
      url: ticket!.relayUrl, sessionId: ticket!.code, clientId, reconnect: false, role: 'guest', webSocketFactory: factory,
    }));
    const senders: string[] = [];
    host.subscribe((frame) => senders.push(frame.senderId));
    await host.connect();
    await probeLanHouse({ code: ticket!.code, relayUrl: ticket!.relayUrl, webSocketFactory: factory });
    for (const guest of guests) await guest.connect();
    await guests[0].publish({ action: 'lobby.profile' }, { eventId: 'guest-a-profile' });
    await waitFor(() => senders.includes('guest-a'));
    expect(senders).toContain('guest-a');

    const fifthPhone = new LanWebSocketTransport<Payload>({
      url: address.url, sessionId: 'CREW4', clientId: 'guest-d', reconnect: false, role: 'guest', webSocketFactory: factory,
    });
    await expect(fifthPhone.connect()).rejects.toMatchObject({ code: 'ROOM_FULL' });
    await fifthPhone.disconnect();
    await Promise.all([host.disconnect(), ...guests.map((guest) => guest.disconnect())]);
  });

  it('accepts sequence numbers from a new relay epoch after a relay restart', async () => {
    const relay = new HousewireRelay<Payload>({ host: '127.0.0.1', port: 0 });
    activeRelays.push(relay);
    const firstAddress = await relay.start();
    const common = {
      url: firstAddress.url,
      sessionId: 'RETRY',
      reconnect: true,
      reconnectBaseDelayMs: 20,
      connectTimeoutMs: 250,
      webSocketFactory: factory,
    } as const;
    const host = new LanWebSocketTransport<Payload>({ ...common, clientId: 'local', role: 'host' });
    const guest = new LanWebSocketTransport<Payload>({ ...common, clientId: 'guest', role: 'guest' });
    const guestFrames: { action: string; sequence: number }[] = [];
    guest.subscribe((frame) => guestFrames.push({ action: frame.payload.action, sequence: frame.sequence }));
    await host.connect();
    await guest.connect();
    await host.publish({ action: 'before-restart' }, { eventId: 'before-restart' });
    await waitFor(() => guestFrames.length === 1);

    await relay.stop();
    await waitFor(() => host.state !== 'connected' && guest.state !== 'connected');
    const replacement = new HousewireRelay<Payload>({
      host: '127.0.0.1',
      port: firstAddress.port,
    });
    activeRelays.push(replacement);
    await replacement.start();
    await waitFor(() => host.state === 'connected' && guest.state === 'connected', 6_000);

    await host.publish({ action: 'after-restart' }, { eventId: 'after-restart' });
    await waitFor(() => guestFrames.length === 2);
    expect(guestFrames).toEqual([
      { action: 'before-restart', sequence: 1 },
      { action: 'after-restart', sequence: 1 },
    ]);
    await Promise.all([host.disconnect(), guest.disconnect()]);
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for relay condition.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

import { describe, expect, it } from 'vitest';
import { estimateClock } from '../src/services/transport/clock-sync';
import { LoopbackNetwork } from '../src/services/transport/loopback';
import { LanWebSocketTransport, type WebSocketLike } from '../src/services/transport/lan-websocket';
import { resolveLanRelayUrl } from '../src/features/session/join-room';

describe('loopback transport', () => {
  it('orders broadcasts and deduplicates retry event ids', async () => {
    const network = new LoopbackNetwork<{ command: string }>();
    const host = network.createTransport('line13', 'host');
    const receiver = network.createTransport('line13', 'receiver');
    const frames: number[] = [];
    receiver.subscribe((frame) => frames.push(frame.sequence));
    await host.connect();
    await receiver.connect();
    await host.publish({ command: 'ring' }, { eventId: 'event-1', clientSentAt: 100 });
    await host.publish({ command: 'ring' }, { eventId: 'event-1', clientSentAt: 101 });
    await receiver.publish({ command: 'answer' }, { eventId: 'event-2', clientSentAt: 102 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(frames).toEqual([1, 2]);
  });

  it('keeps direct payloads ephemeral and recipient-only', async () => {
    const network = new LoopbackNetwork<{ command: string }, { clue: string }>();
    const sender = network.createTransport('dead-air', 'sender');
    const recipient = network.createTransport('dead-air', 'recipient');
    const excluded = network.createTransport('dead-air', 'excluded');
    const recipientFrames: string[] = [];
    const excludedFrames: string[] = [];
    recipient.subscribeDirect((frame) => recipientFrames.push(frame.payload.clue));
    excluded.subscribeDirect((frame) => excludedFrames.push(frame.payload.clue));
    await Promise.all([sender.connect(), recipient.connect(), excluded.connect()]);

    const ack = await sender.publishDirect('recipient', { clue: 'frequency 91.3' }, { messageId: 'direct-clue' });
    expect(ack).toMatchObject({ messageId: 'direct-clue', recipientId: 'recipient' });
    expect(recipientFrames).toEqual(['frequency 91.3']);
    expect(excludedFrames).toEqual([]);

    await expect(
      sender.publishDirect('recipient', undefined as unknown as { clue: string }, { messageId: 'invalid-direct' }),
    ).rejects.toMatchObject({ code: 'INVALID_DIRECT_PAYLOAD' });
    const replacement = network.createTransport('dead-air', 'recipient');
    const replacementFrames: string[] = [];
    replacement.subscribeDirect((frame) => replacementFrames.push(frame.payload.clue));
    await replacement.connect();
    expect(recipient.state).toBe('closed');
    await sender.publishDirect('recipient', { clue: 'replacement owns the id' }, { messageId: 'replacement-direct' });
    expect(recipientFrames).toEqual(['frequency 91.3']);
    expect(replacementFrames).toEqual(['replacement owns the id']);

    await replacement.disconnect();
    await expect(sender.publishDirect('recipient', { clue: 'gone' })).rejects.toThrow('not connected');
  });

  it('estimates host time at the network round-trip midpoint', () => {
    expect(estimateClock({ clientSentAt: 1_000, serverAt: 1_075, clientReceivedAt: 1_100 })).toEqual({
      offsetMs: 25,
      roundTripMs: 100,
      measuredAt: 1_100,
    });
  });

  it('times out unacknowledged direct delivery and clears pending delivery on disconnect', async () => {
    const transport = new LanWebSocketTransport<unknown, { clue: string }>({
      url: 'ws://silent.test',
      sessionId: 'silent-room',
      clientId: 'sender',
      role: 'host',
      reconnect: false,
      directAckTimeoutMs: 15,
      webSocketFactory: () => createSilentDirectSocket(),
    });
    await transport.connect();
    await expect(
      transport.publishDirect('recipient', { clue: 'lost ack' }, { messageId: 'lost-ack' }),
    ).rejects.toMatchObject({ code: 'DIRECT_ACK_TIMEOUT' });
    expect(transport.state).toBe('connected');

    const pendingRejection = expect(
      transport.publishDirect('recipient', { clue: 'disconnect' }, { messageId: 'disconnect-pending' }),
    ).rejects.toThrow('cancelled');
    await transport.disconnect();
    await pendingRejection;
  });
});

describe('LAN relay URL resolution', () => {
  it('uses the visible LAN web origin instead of advertising loopback', () => {
    expect(
      resolveLanRelayUrl({
        webHostname: '192.168.1.147',
        expoHostUri: '127.0.0.1:8081',
      }),
    ).toBe('ws://192.168.1.147:8787');
  });

  it('parses Expo hosts, IPv6, explicit secure relays, and safe fallbacks', () => {
    expect(resolveLanRelayUrl({ expoHostUri: '192.168.1.20:8081' })).toBe('ws://192.168.1.20:8787');
    expect(resolveLanRelayUrl({ expoHostUri: 'http://[fe80::1234]:8081' })).toBe('ws://[fe80::1234]:8787');
    expect(resolveLanRelayUrl({ explicit: 'https://relay.example.test/socket/' })).toBe('wss://relay.example.test/socket');
    expect(resolveLanRelayUrl({})).toBe('ws://127.0.0.1:8787');
  });
});

type FakeSocketEvent = { code?: number; data?: unknown; reason?: string };
type FakeSocketListener = (event?: FakeSocketEvent) => void;

function createSilentDirectSocket(): WebSocketLike {
  const listeners = new Map<string, Set<FakeSocketListener>>();
  let readyState = 0;
  const emit = (type: string, event?: FakeSocketEvent) => {
    for (const listener of listeners.get(type) ?? []) listener(event);
  };
  const socket = {
    get readyState() {
      return readyState;
    },
    send(data: string) {
      const message = JSON.parse(data) as { clientId?: string; sessionId?: string; type?: string };
      if (message.type !== 'join') return;
      queueMicrotask(() => emit('message', {
        data: JSON.stringify({
          type: 'joined',
          sessionId: message.sessionId,
          clientId: message.clientId,
          latestSequence: 0,
          roomEpoch: 'room-silent',
          capabilities: ['direct-v1'],
          maximumMessageBytes: 140 * 1024,
          serverTime: Date.now(),
        }),
      }));
    },
    close(code?: number, reason?: string) {
      if (readyState === 3) return;
      readyState = 3;
      queueMicrotask(() => emit('close', { code, reason }));
    },
    addEventListener(type: string, listener: FakeSocketListener) {
      const bucket = listeners.get(type) ?? new Set<FakeSocketListener>();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
  };
  queueMicrotask(() => {
    readyState = 1;
    emit('open');
  });
  return socket as unknown as WebSocketLike;
}

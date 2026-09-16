import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { HousewireRelay } from '../server/relay';
import { HOUSE_LINE_MAX_CLIP_BYTES, HOUSE_LINE_TTL_MS, houseLineMessageSchema, type HouseLineMessage } from '../src/features/comms/house-line-protocol';
import { LanWebSocketTransport, type WebSocketLike } from '../src/services/transport/lan-websocket';
import { MAXIMUM_RELAY_MESSAGE_BYTES, utf8ByteLength } from '../src/services/transport/types';

describe('long private voice notes over the real relay', () => {
  it('delivers a maximum-size 30-second note only to its selected player', async () => {
    const relay = new HousewireRelay({ host: '127.0.0.1', port: 0 });
    const address = await relay.start();
    const base = { url: address.url, sessionId: 'long-voice-note', reconnect: false, webSocketFactory: (url: string) => new WebSocket(url) as unknown as WebSocketLike };
    const sender = new LanWebSocketTransport<unknown, HouseLineMessage>({ ...base, role: 'host', clientId: 'sender' });
    const receiver = new LanWebSocketTransport<unknown, HouseLineMessage>({ ...base, role: 'guest', clientId: 'receiver' });
    const excluded = new LanWebSocketTransport<unknown, HouseLineMessage>({ ...base, role: 'guest', clientId: 'excluded' });
    const received: HouseLineMessage[] = [];
    const overheard: HouseLineMessage[] = [];
    const history: unknown[] = [];
    receiver.subscribeDirect((frame) => received.push(frame.payload));
    excluded.subscribeDirect((frame) => overheard.push(frame.payload));
    excluded.subscribe((frame) => history.push(frame.payload));
    try {
      await sender.connect();
      await Promise.all([receiver.connect(), excluded.connect()]);
      const bytes = Buffer.alloc(HOUSE_LINE_MAX_CLIP_BYTES, 42);
      const message = houseLineMessageSchema.parse({ kind: 'housewire.line.clip.v1', protocolVersion: 1, channelId: 'long-voice-note', transmissionId: 'full-note', sentAt: Date.now(), ttlMs: HOUSE_LINE_TTL_MS, clip: { base64: bytes.toString('base64'), byteSize: bytes.byteLength, durationMs: 30_000, mimeType: 'audio/mp4' } });
      expect(utf8ByteLength(JSON.stringify(message)) + 1024).toBeLessThan(MAXIMUM_RELAY_MESSAGE_BYTES);
      expect(await sender.publishDirect('receiver', message, { messageId: 'max-size-note' })).toMatchObject({ recipientId: 'receiver' });
      await new Promise(resolve => setTimeout(resolve, 40));
      expect(received).toEqual([message]);
      expect(overheard).toEqual([]);
      expect(history).toEqual([]);
      expect(sender.state).toBe('connected');
    } finally {
      await Promise.all([sender.disconnect(), receiver.disconnect(), excluded.disconnect()]);
      await relay.stop();
    }
  });
});

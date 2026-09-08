import { describe, expect, it, vi } from 'vitest';

import {
  HOUSE_LINE_MAX_INBOX_ITEMS,
  HOUSE_LINE_TTL_MS,
  appendHouseLineInbox,
  fanOutHouseLineMessage,
  houseLineMessageSchema,
  parseHouseLineMessage,
  selectHouseLineRecipients,
  validateIncomingHouseLineMessage,
  type HouseLineInboxItem,
  type HouseLineMessage,
} from '../src/features/comms/house-line-protocol';

const NOW = 50_000;

function signal(overrides: Partial<HouseLineMessage> = {}): HouseLineMessage {
  return houseLineMessageSchema.parse({
    kind: 'housewire.line.signal.v1',
    protocolVersion: 1,
    channelId: 'operation-one',
    transmissionId: 'signal-one',
    signal: 'READY',
    sentAt: NOW,
    ttlMs: HOUSE_LINE_TTL_MS,
    ...overrides,
  });
}

function inboxItem(index: number): HouseLineInboxItem {
  const message = signal({ transmissionId: `signal-${index}`, sentAt: NOW + index });
  if (message.kind !== 'housewire.line.signal.v1') throw new Error('Expected a signal fixture.');
  return {
    frameMessageId: `frame-${index}`,
    message,
    played: false,
    receivedAt: NOW + index,
    senderId: `node-${index}`,
    senderLabel: `Node ${index}`,
  };
}

describe('House Line protocol', () => {
  it('parses strict signal, clip, and receipt envelopes', () => {
    expect(parseHouseLineMessage(signal())).toMatchObject({ signal: 'READY' });

    const base64 = Buffer.from('short voice burst').toString('base64');
    const clip = houseLineMessageSchema.parse({
      kind: 'housewire.line.clip.v1',
      protocolVersion: 1,
      channelId: 'operation-one',
      transmissionId: 'clip-one',
      sentAt: NOW,
      ttlMs: HOUSE_LINE_TTL_MS,
      clip: {
        base64,
        byteSize: Buffer.byteLength('short voice burst'),
        durationMs: 750,
        mimeType: 'audio/mp4',
      },
    });
    expect(clip.kind).toBe('housewire.line.clip.v1');

    expect(houseLineMessageSchema.parse({
      kind: 'housewire.line.receipt.v1',
      protocolVersion: 1,
      channelId: 'operation-one',
      transmissionId: 'receipt-one',
      sourceTransmissionId: 'clip-one',
      status: 'played',
      sentAt: NOW,
      ttlMs: HOUSE_LINE_TTL_MS,
    })).toMatchObject({ status: 'played' });
  });

  it('rejects unknown fields, invalid signals, oversized durations, and forged byte counts', () => {
    expect(parseHouseLineMessage({ ...signal(), extra: 'not allowed' })).toBeUndefined();
    expect(parseHouseLineMessage({ ...signal(), signal: 'HELP_ME_SOLVE_THIS' })).toBeUndefined();

    const base64 = Buffer.from('abc').toString('base64');
    expect(parseHouseLineMessage({
      kind: 'housewire.line.clip.v1',
      protocolVersion: 1,
      channelId: 'operation-one',
      transmissionId: 'clip-bad',
      sentAt: NOW,
      ttlMs: HOUSE_LINE_TTL_MS,
      clip: { base64, byteSize: 999, durationMs: 2_500, mimeType: 'audio/mp4' },
    })).toBeUndefined();
  });

  it('accepts only fresh messages for the active channel from a trusted peer', () => {
    const context = {
      channelId: 'operation-one',
      now: NOW + 1_000,
      senderId: 'node-two',
      trustedPeerIds: ['node-one', 'node-two'],
    } as const;
    expect(validateIncomingHouseLineMessage(signal(), context)).toMatchObject({ accepted: true });
    expect(validateIncomingHouseLineMessage(signal({ channelId: 'other-operation' }), context)).toEqual({
      accepted: false,
      reason: 'WRONG_CHANNEL',
    });
    expect(validateIncomingHouseLineMessage(signal(), { ...context, senderId: 'intruder' })).toEqual({
      accepted: false,
      reason: 'UNTRUSTED_SENDER',
    });
    expect(validateIncomingHouseLineMessage(signal({ sentAt: NOW - HOUSE_LINE_TTL_MS }), context)).toEqual({
      accepted: false,
      reason: 'EXPIRED',
    });
    expect(validateIncomingHouseLineMessage(signal({ sentAt: context.now + 5_001 }), context)).toEqual({
      accepted: false,
      reason: 'FUTURE_TIMESTAMP',
    });
  });
});

describe('House Line delivery helpers', () => {
  it('selects stable unique recipients and never sends to the local phone', () => {
    expect(selectHouseLineRecipients('node-a', ['node-c', 'node-a', 'node-b', 'node-b'], 'ALL')).toEqual([
      'node-b',
      'node-c',
    ]);
    expect(selectHouseLineRecipients('node-a', ['node-a', 'node-b'], 'node-b')).toEqual(['node-b']);
    expect(selectHouseLineRecipients('node-a', ['node-a', 'node-b'], 'missing')).toEqual([]);
  });

  it('fans out independently and reports partial delivery without failing the whole call', async () => {
    const publish = vi.fn(async (recipientId: string) => {
      if (recipientId === 'node-c') throw new Error('offline');
      return { type: 'direct.ack' as const, messageId: 'relay-message', recipientId, deliveredAt: NOW };
    });
    const result = await fanOutHouseLineMessage(publish, ['node-b', 'node-c', 'node-b'], signal());
    expect(publish).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ deliveredRecipientIds: ['node-b'], failedRecipientIds: ['node-c'] });
  });

  it('deduplicates transmissions and keeps only the newest bounded inbox items', () => {
    let inbox: HouseLineInboxItem[] = [];
    for (let index = 0; index < HOUSE_LINE_MAX_INBOX_ITEMS + 3; index += 1) {
      inbox = appendHouseLineInbox(inbox, inboxItem(index));
    }
    expect(inbox).toHaveLength(HOUSE_LINE_MAX_INBOX_ITEMS);
    expect(inbox[0]?.message.transmissionId).toBe('signal-3');

    inbox = appendHouseLineInbox(inbox, {
      ...inboxItem(8),
      frameMessageId: 'replacement-frame',
      senderLabel: 'Replacement sender label',
    });
    expect(inbox).toHaveLength(HOUSE_LINE_MAX_INBOX_ITEMS);
    expect(inbox.at(-1)).toMatchObject({ frameMessageId: 'replacement-frame' });
  });
});

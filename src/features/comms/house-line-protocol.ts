import { z } from 'zod';
import { VOICE_NOTE_MAX_BYTES, VOICE_NOTE_MAX_DURATION_MS, VOICE_NOTE_MIME_TYPES } from '../../domain/voice-note';

export const HOUSE_LINE_TTL_MS = 90_000 as const;
export const HOUSE_LINE_MAX_CLIP_BYTES = VOICE_NOTE_MAX_BYTES;
export const HOUSE_LINE_MAX_CLIP_DURATION_MS = VOICE_NOTE_MAX_DURATION_MS;
export const HOUSE_LINE_MAX_INBOX_ITEMS = 6;
export const HOUSE_LINE_FUTURE_SKEW_MS = 5_000;

export const HOUSE_LINE_SIGNALS = ['READY', 'REPEAT', 'COME_HERE', 'FOUND_IT'] as const;
export type HouseLineSignal = (typeof HOUSE_LINE_SIGNALS)[number];

const safeIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'Use a relay-safe identifier.');
const timestampSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** RTT-based clock offsets may contain half milliseconds. Normalize only locally
 * constructed timestamps; received envelopes must still pass the strict schema. */
export function houseLineTimestamp(now: number, clockOffsetMs = 0): number {
  const safeNow = Number.isFinite(now) ? now : 0;
  const safeOffset = Number.isFinite(clockOffsetMs) ? clockOffsetMs : 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(safeNow + safeOffset)));
}
const base64Schema = z
  .string()
  .min(4)
  .max(Math.ceil(HOUSE_LINE_MAX_CLIP_BYTES / 3) * 4)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Audio must be standard base64.');

const commonSchema = z.object({
  protocolVersion: z.literal(1),
  channelId: safeIdSchema,
  transmissionId: safeIdSchema,
  sentAt: timestampSchema,
  ttlMs: z.literal(HOUSE_LINE_TTL_MS),
});

const clipSchema = commonSchema
  .extend({
    kind: z.literal('housewire.line.clip.v1'),
    clip: z
      .object({
        base64: base64Schema,
        byteSize: z.number().int().min(1).max(HOUSE_LINE_MAX_CLIP_BYTES),
        durationMs: z.number().int().min(120).max(HOUSE_LINE_MAX_CLIP_DURATION_MS),
        mimeType: z.enum(VOICE_NOTE_MIME_TYPES),
      })
      .strict(),
  })
  .strict()
  .superRefine((message, context) => {
    const encodedBytes = decodedBase64ByteLength(message.clip.base64);
    if (encodedBytes !== message.clip.byteSize) {
      context.addIssue({
        code: 'custom',
        message: 'The declared audio size does not match its encoded bytes.',
        path: ['clip', 'byteSize'],
      });
    }
  });

const signalSchema = commonSchema
  .extend({
    kind: z.literal('housewire.line.signal.v1'),
    signal: z.enum(HOUSE_LINE_SIGNALS),
  })
  .strict();

const receiptSchema = commonSchema
  .extend({
    kind: z.literal('housewire.line.receipt.v1'),
    sourceTransmissionId: safeIdSchema,
    status: z.enum(['played', 'dismissed']),
  })
  .strict();

export const houseLineMessageSchema = z.union([clipSchema, signalSchema, receiptSchema]);
export type HouseLineMessage = z.infer<typeof houseLineMessageSchema>;
export type HouseLineClipMessage = Extract<HouseLineMessage, { kind: 'housewire.line.clip.v1' }>;
export type HouseLineSignalMessage = Extract<HouseLineMessage, { kind: 'housewire.line.signal.v1' }>;
export type HouseLineReceiptMessage = Extract<HouseLineMessage, { kind: 'housewire.line.receipt.v1' }>;

export type HouseLineTargetId = 'ALL' | string;

export interface HouseLineInboxItem {
  frameMessageId: string;
  message: HouseLineClipMessage | HouseLineSignalMessage;
  played: boolean;
  receivedAt: number;
  senderId: string;
  senderLabel: string;
}

export interface HouseLineFanoutResult {
  deliveredRecipientIds: readonly string[];
  failedRecipientIds: readonly string[];
}

export type HouseLineRejectionReason =
  | 'MALFORMED'
  | 'WRONG_CHANNEL'
  | 'UNTRUSTED_SENDER'
  | 'EXPIRED'
  | 'FUTURE_TIMESTAMP';

export type HouseLineIncomingValidation =
  | { accepted: true; message: HouseLineMessage }
  | { accepted: false; reason: HouseLineRejectionReason };

export interface HouseLineIncomingContext {
  channelId: string;
  now: number;
  senderId: string;
  trustedPeerIds: readonly string[];
}

export function parseHouseLineMessage(value: unknown): HouseLineMessage | undefined {
  const parsed = houseLineMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Validates both the direct payload and the trusted transport envelope around it.
 * The payload intentionally carries no sender identity: callers must use the
 * relay-authenticated sender id supplied by the direct frame.
 */
export function validateIncomingHouseLineMessage(
  value: unknown,
  context: HouseLineIncomingContext,
): HouseLineIncomingValidation {
  const message = parseHouseLineMessage(value);
  if (!message) return { accepted: false, reason: 'MALFORMED' };
  if (message.channelId !== context.channelId) return { accepted: false, reason: 'WRONG_CHANNEL' };
  if (!context.trustedPeerIds.includes(context.senderId)) {
    return { accepted: false, reason: 'UNTRUSTED_SENDER' };
  }
  if (message.sentAt > context.now + HOUSE_LINE_FUTURE_SKEW_MS) {
    return { accepted: false, reason: 'FUTURE_TIMESTAMP' };
  }
  if (context.now - message.sentAt > message.ttlMs) {
    return { accepted: false, reason: 'EXPIRED' };
  }
  return { accepted: true, message };
}

export function decodedBase64ByteLength(value: string): number {
  if (!value || value.length % 4 !== 0) return -1;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

export function selectHouseLineRecipients(
  localNodeId: string,
  trustedPeerIds: readonly string[],
  targetId: HouseLineTargetId,
): string[] {
  const available = [...new Set(trustedPeerIds)]
    .filter((nodeId) => nodeId !== localNodeId)
    .sort((left, right) => left.localeCompare(right));
  return targetId === 'ALL' ? available : available.includes(targetId) ? [targetId] : [];
}

export async function fanOutHouseLineMessage(
  publishDirect: (recipientId: string, payload: unknown) => Promise<unknown>,
  recipientIds: readonly string[],
  message: HouseLineMessage,
): Promise<HouseLineFanoutResult> {
  const uniqueRecipients = [...new Set(recipientIds)];
  const results = await Promise.allSettled(
    uniqueRecipients.map((recipientId) => publishDirect(recipientId, message)),
  );
  return results.reduce<HouseLineFanoutResult>(
    (summary, result, index) => {
      const recipientId = uniqueRecipients[index];
      if (result.status === 'fulfilled') {
        return {
          ...summary,
          deliveredRecipientIds: [...summary.deliveredRecipientIds, recipientId],
        };
      }
      return {
        ...summary,
        failedRecipientIds: [...summary.failedRecipientIds, recipientId],
      };
    },
    { deliveredRecipientIds: [], failedRecipientIds: [] },
  );
}

export function appendHouseLineInbox(
  inbox: readonly HouseLineInboxItem[],
  item: HouseLineInboxItem,
): HouseLineInboxItem[] {
  const withoutDuplicate = inbox.filter(
    (candidate) => candidate.message.transmissionId !== item.message.transmissionId,
  );
  return [...withoutDuplicate, item].slice(-HOUSE_LINE_MAX_INBOX_ITEMS);
}

export function houseLineSignalLabel(signal: HouseLineSignal): string {
  switch (signal) {
    case 'READY':
      return 'Ready';
    case 'REPEAT':
      return 'Repeat that';
    case 'COME_HERE':
      return 'Come here';
    case 'FOUND_IT':
      return 'Found it';
  }
}

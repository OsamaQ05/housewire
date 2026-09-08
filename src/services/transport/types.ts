export type TransportConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';

export interface TransportFrame<T = unknown> {
  type: 'frame';
  sessionId: string;
  sequence: number;
  senderId: string;
  eventId: string;
  serverTime: number;
  payload: T;
}

export interface PublishOptions {
  eventId: string;
  clientSentAt?: number;
}

export const MAXIMUM_RELAY_MESSAGE_BYTES = 140 * 1024;

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

export interface DirectPublishOptions {
  messageId?: string;
  clientSentAt?: number;
}

export interface DirectDeliveryAck {
  type: 'direct.ack';
  messageId: string;
  recipientId: string;
  deliveredAt: number;
}

export interface TransportDirectFrame<D = unknown> {
  type: 'direct';
  sessionId: string;
  senderId: string;
  recipientId: string;
  messageId: string;
  serverTime: number;
  payload: D;
}

export interface SessionTransport<T = unknown, D = unknown> {
  readonly sessionId: string;
  readonly clientId: string;
  readonly state: TransportConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(payload: T, options: PublishOptions): Promise<void>;
  publishDirect(recipientId: string, payload: D, options?: DirectPublishOptions): Promise<DirectDeliveryAck>;
  subscribe(listener: (frame: TransportFrame<T>) => void): () => void;
  subscribeDirect(listener: (frame: TransportDirectFrame<D>) => void): () => void;
  subscribeState(listener: (state: TransportConnectionState) => void): () => void;
}

export type RelayClientRole = 'host' | 'guest' | 'probe';
export type RelayCapability = 'direct-v1';

/**
 * Opaque proof that a relay issued to one exact room/client/role identity.
 * Keep this object in private client storage only; it must never be published
 * as a session event or included in a room snapshot.
 */
export interface RelayResumeCredentials {
  readonly clientId: string;
  readonly credential: string;
  readonly role: RelayClientRole;
  readonly roomEpoch: string;
  readonly sessionId: string;
}

export type ClientRelayMessage<T = unknown, D = unknown> =
  | {
      type: 'join';
      sessionId: string;
      clientId: string;
      lastSequence: number;
      lastRoomEpoch?: string;
      role: RelayClientRole;
      resumeCredential?: string;
      capabilities?: RelayCapability[];
    }
  | { type: 'publish'; sessionId: string; clientId: string; eventId: string; clientSentAt: number; payload: T }
  | {
      type: 'direct';
      sessionId: string;
      clientId: string;
      recipientId: string;
      messageId: string;
      clientSentAt: number;
      payload: D;
    }
  | { type: 'ping'; sessionId: string; clientId: string; pingId: string; clientTime: number };

export type ServerRelayMessage<T = unknown, D = unknown> =
  | {
      type: 'joined';
      sessionId: string;
      clientId: string;
      latestSequence: number;
      roomEpoch: string;
      role: RelayClientRole;
      resumeCredential: string;
      capabilities?: RelayCapability[];
      maximumMessageBytes?: number;
      serverTime: number;
    }
  | TransportFrame<T>
  | TransportDirectFrame<D>
  | DirectDeliveryAck
  | { type: 'direct.nack'; messageId: string; recipientId: string; code: string; message: string }
  | { type: 'pong'; pingId: string; clientTime: number; serverTime: number }
  | { type: 'error'; code: string; message: string };

export interface ClockEstimate {
  offsetMs: number;
  roundTripMs: number;
  measuredAt: number;
}

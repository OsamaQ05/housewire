export interface ReliableOutboxAttempt<T> {
  event: T;
  logicalEventId: string;
  transportEventId: string;
  attempt: number;
}

interface ReliableOutboxEntry<T> {
  event: T;
  logicalEventId: string;
  attempts: number;
  lastAttemptAt?: number;
  transportEventIds: Set<string>;
}

export interface ReliableOutboxOptions {
  capacity?: number;
  retryBaseMs?: number;
  retryMaximumMs?: number;
  createRetryEventId?: (logicalEventId: string, attempt: number) => string;
}

const SAFE_EVENT_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * A bounded, transport-agnostic outbox. An item is retained until one of its
 * transport attempts is echoed by the relay, not merely until WebSocket.send
 * returns. Retries intentionally use fresh transport ids so a relay can
 * rebroadcast after an acknowledgement was lost on a previous socket.
 */
export class ReliableSessionOutbox<T> {
  private readonly entries = new Map<string, ReliableOutboxEntry<T>>();
  private readonly attemptToLogicalId = new Map<string, string>();
  private readonly capacity: number;
  private readonly retryBaseMs: number;
  private readonly retryMaximumMs: number;
  private readonly createRetryEventId: (logicalEventId: string, attempt: number) => string;

  constructor(options: ReliableOutboxOptions = {}) {
    this.capacity = options.capacity ?? 48;
    this.retryBaseMs = options.retryBaseMs ?? 1_200;
    this.retryMaximumMs = options.retryMaximumMs ?? 8_000;
    this.createRetryEventId =
      options.createRetryEventId ??
      ((logicalEventId, attempt) => `retry-${shortHash(logicalEventId)}-${attempt}-${shortNonce()}`);
  }

  get size(): number {
    return this.entries.size;
  }

  enqueue(logicalEventId: string, event: T): void {
    assertSafeEventId(logicalEventId);
    if (this.entries.has(logicalEventId)) return;
    if (this.entries.size >= this.capacity) throw new Error('The reliable session outbox is full.');
    this.entries.set(logicalEventId, {
      event,
      logicalEventId,
      attempts: 0,
      transportEventIds: new Set<string>(),
    });
  }

  takeDue(now: number): readonly ReliableOutboxAttempt<T>[] {
    const attempts: ReliableOutboxAttempt<T>[] = [];
    for (const entry of this.entries.values()) {
      if (entry.lastAttemptAt !== undefined && now - entry.lastAttemptAt < this.retryDelay(entry.attempts)) continue;
      const attempt = entry.attempts + 1;
      const transportEventId =
        attempt === 1 ? entry.logicalEventId : this.createRetryEventId(entry.logicalEventId, attempt);
      assertSafeEventId(transportEventId);
      entry.attempts = attempt;
      entry.lastAttemptAt = now;
      entry.transportEventIds.add(transportEventId);
      this.attemptToLogicalId.set(transportEventId, entry.logicalEventId);
      attempts.push({
        attempt,
        event: entry.event,
        logicalEventId: entry.logicalEventId,
        transportEventId,
      });
    }
    return attempts;
  }

  acknowledge(transportEventId: string): boolean {
    const logicalEventId = this.attemptToLogicalId.get(transportEventId);
    if (!logicalEventId) return false;
    const entry = this.entries.get(logicalEventId);
    if (!entry) return false;
    this.entries.delete(logicalEventId);
    for (const attemptId of entry.transportEventIds) this.attemptToLogicalId.delete(attemptId);
    return true;
  }

  expedite(logicalEventId: string): void {
    const entry = this.entries.get(logicalEventId);
    if (entry) entry.lastAttemptAt = undefined;
  }

  clear(): void {
    this.entries.clear();
    this.attemptToLogicalId.clear();
  }

  private retryDelay(attempts: number): number {
    return Math.min(this.retryMaximumMs, this.retryBaseMs * 2 ** Math.max(0, attempts - 1));
  }
}

function assertSafeEventId(value: string): void {
  if (!SAFE_EVENT_ID.test(value)) throw new Error('Reliable event ids must be relay-safe and at most 64 characters.');
}

function shortHash(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function shortNonce(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}

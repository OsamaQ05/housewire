import { describe, expect, it } from 'vitest';

import { ReliableSessionOutbox } from '../src/features/session/reliable-outbox';

describe('reliable session outbox', () => {
  it('retains authority events until an echoed attempt acknowledges them', () => {
    const outbox = new ReliableSessionOutbox<{ phase: number }>({
      createRetryEventId: (_logicalId, attempt) => `retry-event-${attempt}`,
      retryBaseMs: 1_000,
      retryMaximumMs: 4_000,
    });
    outbox.enqueue('stage-operation-1', { phase: 1 });

    expect(outbox.takeDue(10_000)).toEqual([
      {
        attempt: 1,
        event: { phase: 1 },
        logicalEventId: 'stage-operation-1',
        transportEventId: 'stage-operation-1',
      },
    ]);
    expect(outbox.size).toBe(1);
    expect(outbox.takeDue(10_999)).toEqual([]);
    expect(outbox.takeDue(11_000)[0]).toMatchObject({ attempt: 2, transportEventId: 'retry-event-2' });
    expect(outbox.acknowledge('retry-event-2')).toBe(true);
    expect(outbox.size).toBe(0);
  });

  it('deduplicates a logical checkpoint and can expedite after a failed send', () => {
    const outbox = new ReliableSessionOutbox<{ revision: number }>({
      createRetryEventId: (_logicalId, attempt) => `retry-checkpoint-${attempt}`,
      retryBaseMs: 5_000,
    });
    outbox.enqueue('snapshot-operation-2', { revision: 2 });
    outbox.enqueue('snapshot-operation-2', { revision: 99 });
    expect(outbox.takeDue(1_000)[0].event).toEqual({ revision: 2 });
    outbox.expedite('snapshot-operation-2');
    expect(outbox.takeDue(1_001)[0]).toMatchObject({ attempt: 2, event: { revision: 2 } });
  });

  it('rejects unsafe ids and remains bounded', () => {
    const outbox = new ReliableSessionOutbox<number>({ capacity: 1 });
    expect(() => outbox.enqueue('../unsafe', 1)).toThrow(/relay-safe/);
    outbox.enqueue('safe-event', 1);
    expect(() => outbox.enqueue('second-event', 2)).toThrow(/outbox is full/);
  });
});

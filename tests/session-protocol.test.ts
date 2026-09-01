import { describe, expect, it } from 'vitest';

import {
  housewireSessionEventSchema,
  makeJoinTicket,
  parseJoinTicket,
  parseJoinTicketRouteParams,
  toSessionTimestamp,
} from '../src/features/session/protocol';

describe('session timestamps', () => {
  it('normalises fractional clock offsets before strict protocol validation', () => {
    expect(toSessionTimestamp(1_000.49)).toBe(1_000);
    expect(toSessionTimestamp(1_000.5)).toBe(1_001);
    expect(toSessionTimestamp(-2.2)).toBe(0);
    expect(() => toSessionTimestamp(Number.NaN)).toThrow(/finite/i);
  });
});

describe('Housewire join tickets', () => {
  it('round-trips the LAN session without accounts or cloud state', () => {
    const value = makeJoinTicket('A13XZ', 'ws://192.168.1.20:8787');
    expect(parseJoinTicket(value)).toEqual({
      version: 1,
      code: 'A13XZ',
      missionId: 'line-13',
      relayUrl: 'ws://192.168.1.20:8787',
    });
    expect(value).toBe('housewire://join?v=1&c=A13XZ&r=ws%3A%2F%2F192.168.1.20%3A8787&m=line-13');
    expect(value.length).toBeLessThan(100);
    expect(
      parseJoinTicket(
        makeJoinTicket(
          'A13XZ',
          'ws://192.168.1.20:8787',
          'line-13',
          'exp://192.168.1.20:8081/--/join',
        ),
      ),
    ).toMatchObject({ code: 'A13XZ', relayUrl: 'ws://192.168.1.20:8787' });
  });

  it('hydrates compact and legacy route parameters used by external QR deep links', () => {
    expect(
      parseJoinTicketRouteParams({
        v: '1',
        c: 'QRS13',
        r: 'ws://192.168.1.147:8787',
        m: 'line-13',
      }),
    ).toEqual({
      version: 1,
      code: 'QRS13',
      missionId: 'line-13',
      relayUrl: 'ws://192.168.1.147:8787',
    });

    const legacy = JSON.stringify({ version: 1, code: 'OLD13', relayUrl: 'ws://192.168.1.20:8787' });
    expect(parseJoinTicketRouteParams({ ticket: encodeURIComponent(legacy) })).toEqual({
      version: 1,
      code: 'OLD13',
      missionId: 'line-13',
      relayUrl: 'ws://192.168.1.20:8787',
    });

    expect(parseJoinTicket(makeJoinTicket('AIR13', 'ws://192.168.1.20:8787', 'dead-air'))?.missionId).toBe('dead-air');
  });

  it('rejects unsafe or malformed tickets', () => {
    expect(parseJoinTicket('https://example.com/join')).toBeUndefined();
    expect(
      parseJoinTicket(JSON.stringify({ version: 1, code: '../x', relayUrl: 'file:///tmp/socket' })),
    ).toBeUndefined();
  });
});

describe('bounded Housewire session events', () => {
  const baseEvidence = {
    kind: 'mission.evidence',
    missionId: 'line-13',
    operationId: 'op-01',
    stageId: 'courier-transfer',
    stageIndex: 2,
    actionId: 'release-destination-receipt',
    nodeId: 'destination',
    evidenceKind: 'RECEIPT_RELEASED',
    confidence: 1,
    observedAt: 10_000,
    value: '1307',
  } as const;

  it('accepts exact authored semantic evidence', () => {
    expect(housewireSessionEventSchema.safeParse(baseEvidence).success).toBe(true);
  });

  it('accepts only bounded member-authored abort messages', () => {
    const abort = {
      kind: 'mission.abort',
      missionId: 'line-13',
      operationId: 'op-01',
      nodeId: 'node-a',
      abortedAt: 10_000,
    } as const;
    expect(housewireSessionEventSchema.safeParse(abort).success).toBe(true);
    expect(housewireSessionEventSchema.safeParse({ ...abort, operationId: '../escape' }).success).toBe(false);
    expect(housewireSessionEventSchema.safeParse({ ...abort, reason: 'unbounded free text' }).success).toBe(false);
  });

  it('accepts only bounded host-authored escape abort messages', () => {
    const abort = {
      kind: 'escape.abort',
      missionId: 'dead-air',
      operationId: 'escape-op-01',
      hostNodeId: 'host',
      abortedAt: 10_000,
    } as const;
    expect(housewireSessionEventSchema.safeParse(abort).success).toBe(true);
    expect(housewireSessionEventSchema.safeParse({ ...abort, missionId: 'line-13' }).success).toBe(false);
    expect(housewireSessionEventSchema.safeParse({ ...abort, hostNodeId: '../host' }).success).toBe(false);
    expect(housewireSessionEventSchema.safeParse({ ...abort, nodeId: 'guest-a' }).success).toBe(false);
    expect(housewireSessionEventSchema.safeParse({ ...abort, reason: 'unbounded free text' }).success).toBe(false);
  });

  it('rejects mismatched stages, manual receipt substitution and unknown fields', () => {
    expect(
      housewireSessionEventSchema.safeParse({ ...baseEvidence, stageIndex: 3 }).success,
    ).toBe(false);
    expect(
      housewireSessionEventSchema.safeParse({ ...baseEvidence, evidenceKind: 'MANUAL_HOLD' }).success,
    ).toBe(false);
    expect(
      housewireSessionEventSchema.safeParse({ ...baseEvidence, prompt: 'trust me' }).success,
    ).toBe(false);
  });

  it('uses full-warning reconstruction semantics and rejects the obsolete fragment event', () => {
    const warning = {
      ...baseEvidence,
      stageId: 'split-cipher',
      stageIndex: 1,
      actionId: 'lock-full-warning',
      evidenceKind: 'WARNING_RECONSTRUCTED',
      nodeId: 'decoder',
      value: undefined,
    } as const;
    expect(housewireSessionEventSchema.safeParse(warning).success).toBe(true);
    expect(
      housewireSessionEventSchema.safeParse({
        ...warning,
        actionId: 'lock-cipher-fragment',
        evidenceKind: 'CIPHER_FRAGMENT_LOCKED',
      }).success,
    ).toBe(false);
  });

  it('caps operations at four uniquely and deterministically ordered nodes', () => {
    const start = {
      kind: 'mission.start',
      missionId: 'line-13',
      operationId: 'op-01',
      hostNodeId: 'host',
      seed: 13,
      startsAt: 10_000,
    } as const;
    expect(
      housewireSessionEventSchema.safeParse({ ...start, liveNodeIds: ['host', 'node-a'] }).success,
    ).toBe(true);
    expect(
      housewireSessionEventSchema.safeParse({ ...start, liveNodeIds: ['node-a', 'host'] }).success,
    ).toBe(false);
    expect(
      housewireSessionEventSchema.safeParse({ ...start, liveNodeIds: ['host', 'host'] }).success,
    ).toBe(false);
    expect(
      housewireSessionEventSchema.safeParse({
        ...start,
        liveNodeIds: ['host', 'node-a', 'node-b', 'node-c', 'node-d'],
      }).success,
    ).toBe(false);
  });

  it('accepts bounded lobby profiles and host calibration commands', () => {
    expect(
      housewireSessionEventSchema.safeParse({
        kind: 'lobby.profile',
        nodeId: 'node-a',
        name: 'Mara',
      }).success,
    ).toBe(true);
    expect(
      housewireSessionEventSchema.safeParse({
        kind: 'lobby.command',
        action: 'calibrate',
        hostNodeId: 'local',
      }).success,
    ).toBe(true);
  });

  it('keeps session presence distinct from the old full lobby crew payload', () => {
    expect(
      housewireSessionEventSchema.safeParse({
        kind: 'presence',
        node: {
          id: 'node-a',
          label: 'Mara',
          nodeNumber: 2,
          simulated: false,
          joinedAt: 100_000,
        },
      }).success,
    ).toBe(true);
    expect(
      housewireSessionEventSchema.safeParse({
        kind: 'presence',
        node: {
          id: 'node-a',
          name: 'Mara',
          initials: 'MA',
          nodeNumber: 2,
          role: 'listener',
          roomId: 'hall',
          color: '#65CFE2',
          connected: true,
          simulated: false,
        },
      }).success,
    ).toBe(false);
  });

  it('rejects unbounded lobby data and peer-authored connectivity claims', () => {
    const profile = {
      kind: 'lobby.profile',
      nodeId: 'node-a',
      name: 'Mara',
    } as const;
    expect(
      housewireSessionEventSchema.safeParse({
        ...profile,
        name: 'x'.repeat(25),
      }).success,
    ).toBe(false);
    expect(housewireSessionEventSchema.safeParse({ ...profile, name: '   ' }).success).toBe(false);
    expect(housewireSessionEventSchema.safeParse({ ...profile, nodeId: '../node-a' }).success).toBe(
      false,
    );
    expect(
      housewireSessionEventSchema.safeParse({
        ...profile,
        connected: true,
        simulated: false,
        nodeNumber: 2,
        role: 'listener',
        roomId: 'hall',
        color: '#65CFE2',
      }).success,
    ).toBe(false);
    expect(
      housewireSessionEventSchema.safeParse({
        kind: 'lobby.command',
        action: 'start-anything',
        hostNodeId: 'local',
      }).success,
    ).toBe(false);
    expect(
      housewireSessionEventSchema.safeParse({
        kind: 'lobby.command',
        action: 'calibrate',
        hostNodeId: 'local',
        issuedAt: Date.now(),
      }).success,
    ).toBe(false);
  });
});

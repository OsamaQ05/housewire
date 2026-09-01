import { describe, expect, it } from 'vitest';

import type { CrewNode } from '../src/store/use-housewire-store';
import {
  isTrustedLobbyCommand,
  mergeLobbyCrewProfile,
  normaliseLiveCrew,
  reconcileLobbyCrewPresence,
} from '../src/features/session/lobby-presence';

function node(id: string, connected: boolean, simulated = false): CrewNode {
  return {
    id,
    color: '#000000',
    connected,
    initials: id.slice(0, 2).toUpperCase(),
    name: id,
    nodeNumber: 4,
    role: 'breaker',
    roomId: 'old-room',
    simulated,
  };
}

describe('lobby relay presence', () => {
  it('preserves offline status while assigning deterministic stations', () => {
    const normalised = normaliseLiveCrew(
      [node('guest-b', false), node('local', true), node('guest-a', true)],
      [{ id: 'living' }, { id: 'hall' }],
    );

    expect(normalised.map((item) => [item.id, item.connected, item.nodeNumber])).toEqual([
      ['local', true, 1],
      ['guest-a', true, 2],
      ['guest-b', false, 3],
    ]);
  });

  it('expires retained ghosts using relay-authored time and restores a fresh heartbeat', () => {
    const crew = [node('local', true), node('guest-a', true), node('guest-b', false)];
    const lastSeen = new Map([
      ['local', 100_000],
      ['guest-a', 70_000],
      ['guest-b', 99_000],
    ]);

    const reconciled = reconcileLobbyCrewPresence(crew, lastSeen, 101_000, 20_000);
    expect(reconciled.map((item) => [item.id, item.connected])).toEqual([
      ['local', true],
      ['guest-a', false],
      ['guest-b', true],
    ]);
  });

  it('does not rewrite the roster when no connectivity flag changes', () => {
    const crew = [node('local', true), node('guest-a', false), node('simulated-1', true, true)];
    const reconciled = reconcileLobbyCrewPresence(crew, new Map([['local', 5_000]]), 5_100, 20_000);
    expect(reconciled).toBe(crew);
  });

  it('keeps fresh phones ahead of retained alphabetical ghosts at the four-node limit', () => {
    const normalised = normaliseLiveCrew(
      [
        node('local', true),
        node('guest-a-old', false),
        node('guest-b-old', false),
        node('guest-c-old', false),
        node('guest-z-fresh', true),
      ],
      [{ id: 'living' }, { id: 'hall' }, { id: 'kitchen' }, { id: 'study' }],
    );

    expect(normalised.map((item) => item.id)).toEqual([
      'local',
      'guest-z-fresh',
      'guest-a-old',
      'guest-b-old',
    ]);
  });

  it('merges a relay-authenticated profile without trusting peer connectivity flags', () => {
    const crew = [node('local', true), node('guest-a', false)];
    const merged = mergeLobbyCrewProfile(
      crew,
      {
        kind: 'lobby.profile',
        nodeId: 'guest-a',
        name: 'Mara',
      },
      'guest-a',
    );

    expect(merged[1]).toMatchObject({
      id: 'guest-a',
      name: 'Mara',
      connected: true,
      simulated: false,
    });
    expect(
      mergeLobbyCrewProfile(
        crew,
        { kind: 'lobby.profile', nodeId: 'guest-a', name: 'Mara' },
        'spoofed-sender',
      ),
    ).toBe(crew);
  });

  it('accepts only fresh calibration commands from the expected host', () => {
    const command = { kind: 'lobby.command', action: 'calibrate', hostNodeId: 'local' } as const;

    expect(isTrustedLobbyCommand(command, 'local', 'local', 100_000, 101_000)).toBe(true);
    expect(isTrustedLobbyCommand(command, 'local', 'local', 86_000, 101_000)).toBe(true);
    expect(isTrustedLobbyCommand(command, 'local', 'local', 103_000, 101_000)).toBe(true);
    expect(isTrustedLobbyCommand(command, 'local', 'local', 103_001, 101_000)).toBe(false);
    expect(isTrustedLobbyCommand(command, 'guest-a', 'local', 100_000, 101_000)).toBe(false);
    expect(isTrustedLobbyCommand(command, 'local', 'local', 70_000, 101_000)).toBe(false);
  });

  it('updates a retained name once without duplicating a reconnecting node', () => {
    const crew = [node('local', true), node('guest-a', false)];
    const profile = { kind: 'lobby.profile', nodeId: 'guest-a', name: 'Mara Vale' } as const;
    const rejoined = mergeLobbyCrewProfile(crew, profile, 'guest-a');
    const unchanged = mergeLobbyCrewProfile(rejoined, profile, 'guest-a');

    expect(rejoined.map((item) => item.id)).toEqual(['local', 'guest-a']);
    expect(rejoined[1]).toMatchObject({ name: 'Mara Vale', initials: 'MV', connected: true });
    expect(unchanged).toBe(rejoined);
  });
});

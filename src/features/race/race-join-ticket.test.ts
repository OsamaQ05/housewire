import { describe, expect, it } from 'vitest';

import {
  makeCircuitRaceJoinTicket,
  parseCircuitRaceJoinTicket,
  parseCircuitRaceRouteParams,
} from './race-join-ticket';

describe('Circuit Race join tickets', () => {
  it('round-trips a custom-scheme invite and normalises the race code', () => {
    const invite = makeCircuitRaceJoinTicket('a1b2c', 'ws://192.168.1.24:8787');

    expect(parseCircuitRaceJoinTicket(invite)).toEqual({
      version: 1,
      code: 'A1B2C',
      relayUrl: 'ws://192.168.1.24:8787',
    });
  });

  it('supports Expo development deep links without discarding existing query data', () => {
    const invite = makeCircuitRaceJoinTicket(
      '7K3MW',
      'wss://relay.example.test/house',
      'exp://192.168.1.24:8081/--/race-join?channel=development',
    );
    const url = new URL(invite);

    expect(url.searchParams.get('channel')).toBe('development');
    expect(parseCircuitRaceJoinTicket(invite)).toEqual({
      version: 1,
      code: '7K3MW',
      relayUrl: 'wss://relay.example.test/house',
    });
  });

  it('strictly parses router params and uses the first value from repeated params', () => {
    expect(parseCircuitRaceRouteParams({
      c: ['abc12', 'WRONG'],
      r: ['ws://10.0.0.4:8787', 'ws://wrong.test'],
      v: ['1', '2'],
    })).toEqual({ version: 1, code: 'ABC12', relayUrl: 'ws://10.0.0.4:8787' });

    expect(parseCircuitRaceRouteParams({ c: 'ABC12', r: 'ws://10.0.0.4:8787' })).toBeUndefined();
    expect(parseCircuitRaceRouteParams({ c: 'ABC12', r: 'ws://10.0.0.4:8787', v: '2' })).toBeUndefined();
  });

  it('rejects the wrong destination, credentials, bad codes, bad relays, and oversized scans', () => {
    expect(parseCircuitRaceJoinTicket('housewire://home?v=1&c=ABC12&r=ws%3A%2F%2F10.0.0.4%3A8787')).toBeUndefined();
    expect(parseCircuitRaceJoinTicket('https://user:secret@example.test/race-join?v=1&c=ABC12&r=ws%3A%2F%2F10.0.0.4%3A8787')).toBeUndefined();
    expect(parseCircuitRaceJoinTicket('housewire://race-join?v=1&c=NOPE&r=ws%3A%2F%2F10.0.0.4%3A8787')).toBeUndefined();
    expect(parseCircuitRaceJoinTicket('housewire://race-join?v=1&c=ABC12&r=file%3A%2F%2Frelay')).toBeUndefined();
    expect(parseCircuitRaceJoinTicket(`housewire://race-join?${'x'.repeat(1_100)}`)).toBeUndefined();
    expect(() => makeCircuitRaceJoinTicket('ABC12', 'ws://10.0.0.4:8787', 'housewire://home')).toThrow(/race-join/i);
  });
});

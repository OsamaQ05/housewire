import { describe, expect, it } from 'vitest';

import { createRelayId } from '../src/features/session/relay-id';

describe('createRelayId', () => {
  it('creates bounded protocol-safe identifiers without Web Crypto', () => {
    const ids = Array.from({ length: 2_000 }, () => createRelayId('presence'));

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id))).toBe(true);
  });

  it('sanitises caller prefixes and supplies a safe fallback', () => {
    expect(createRelayId('bad prefix!?')).toMatch(/^badprefix_/);
    expect(createRelayId('!?')).toMatch(/^evt_/);
  });
});

import { describe, expect, it } from 'vitest';

import {
  defaultFrequencyAvatar,
  FREQUENCY_AVATARS,
  getFrequencyAvatar,
  isFrequencyAvatarId,
  normalizeFrequencyAvatarName,
  parseFrequencyAvatarChoices,
  type FrequencyAvatarChoices,
} from '../src/features/trivia/frequency-avatar-model';

describe('Family Frequency avatar identities', () => {
  it('keeps one stable identity across case, spacing, and equivalent Unicode names', () => {
    expect(normalizeFrequencyAvatarName('  NÓOR\t Ali ')).toBe('nóor ali');
    expect(defaultFrequencyAvatar('  NOOR\t Ali ')).toBe(defaultFrequencyAvatar('noor ali'));
    expect(defaultFrequencyAvatar('Zoë')).toBe(defaultFrequencyAvatar('Zoe\u0308'));
    expect(defaultFrequencyAvatar('Ｎｏｏｒ')).toBe(defaultFrequencyAvatar('Noor'));
    expect(defaultFrequencyAvatar('  ')).toBe('fox');
  });

  it('offers six distinct characters and always resolves a valid default', () => {
    expect(FREQUENCY_AVATARS.map((avatar) => avatar.id)).toEqual(['fox', 'frog', 'owl', 'bear', 'rabbit', 'cat']);
    const ids = ['Mara', 'Samir', 'Noor', 'Rami', 'Osama', 'Leen', 'Dad', 'Mum', 'جنى', '😊'].map(defaultFrequencyAvatar);
    expect(ids.every(isFrequencyAvatarId)).toBe(true);
    expect(new Set(ids).size).toBeGreaterThanOrEqual(4);
    expect(defaultFrequencyAvatar('Mara')).toBe(defaultFrequencyAvatar('Mara'));
  });

  it('uses a saved choice and rejects unknown or inherited values', () => {
    expect(getFrequencyAvatar('  MARA ', { mara: 'rabbit' })).toBe('rabbit');
    const invalid = { mara: 'dragon' } as unknown as FrequencyAvatarChoices;
    expect(getFrequencyAvatar('Mara', invalid)).toBe(defaultFrequencyAvatar('Mara'));
    expect(getFrequencyAvatar('Mara', Object.create({ mara: 'cat' }))).toBe(defaultFrequencyAvatar('Mara'));
    expect(isFrequencyAvatarId('toString')).toBe(false);
  });

  it('salvages valid persisted choices and safely handles object-property nicknames', () => {
    const choices = parseFrequencyAvatarChoices('{"version":1,"choices":{" MARA ":"owl","Noor":"dragon"," ":"bear","__proto__":"cat","constructor":"frog"}}');
    expect(Object.keys(choices).sort()).toEqual(['__proto__', 'constructor', 'mara']);
    expect(getFrequencyAvatar('Mara', choices)).toBe('owl');
    expect(getFrequencyAvatar('__proto__', choices)).toBe('cat');
    expect(getFrequencyAvatar('constructor', choices)).toBe('frog');
    expect(Object.getPrototypeOf(choices)).toBe(Object.prototype);
  });

  it.each([null, '', '{broken', 'null', '[]', '42', '{"version":2,"choices":{"mara":"fox"}}', '{"version":1,"choices":[]}', '{"version":1,"choices":null}'])('falls back safely for invalid storage: %s', (raw) => {
    expect(parseFrequencyAvatarChoices(raw)).toEqual({});
  });
});

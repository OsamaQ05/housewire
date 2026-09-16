/** Keep this order stable: it is also the palette for name-based defaults. */
export const FREQUENCY_AVATARS = [
  { id: 'fox', label: 'Fox' },
  { id: 'frog', label: 'Frog' },
  { id: 'owl', label: 'Owl' },
  { id: 'bear', label: 'Bear' },
  { id: 'rabbit', label: 'Rabbit' },
  { id: 'cat', label: 'Cat' },
] as const;

export type FrequencyAvatarId = (typeof FREQUENCY_AVATARS)[number]['id'];
export type FrequencyAvatarChoices = Readonly<Record<string, FrequencyAvatarId>>;

export function isFrequencyAvatarId(value: unknown): value is FrequencyAvatarId {
  return FREQUENCY_AVATARS.some((avatar) => avatar.id === value);
}

/** The same nickname identifies a player across setup, games, and Club history. */
export function normalizeFrequencyAvatarName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

export function defaultFrequencyAvatar(name: string): FrequencyAvatarId {
  const normalized = normalizeFrequencyAvatarName(name);
  if (!normalized) return 'fox';
  // FNV-1a uses explicit 32-bit arithmetic, so web and native choose identically.
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index++) {
    hash = Math.imul(hash ^ normalized.charCodeAt(index), 16777619);
  }
  return FREQUENCY_AVATARS[(hash >>> 0) % FREQUENCY_AVATARS.length].id;
}

export function getFrequencyAvatar(name: string, choices: FrequencyAvatarChoices = {}): FrequencyAvatarId {
  const key = normalizeFrequencyAvatarName(name);
  const selected = Object.prototype.hasOwnProperty.call(choices, key) ? choices[key] : undefined;
  return isFrequencyAvatarId(selected) ? selected : defaultFrequencyAvatar(name);
}

/** Salvage valid choices without allowing malformed storage to break the UI. */
export function parseFrequencyAvatarChoices(raw: string | null): FrequencyAvatarChoices {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1
      || !('choices' in data) || !data.choices || typeof data.choices !== 'object' || Array.isArray(data.choices)) return {};
    return Object.fromEntries(Object.entries(data.choices).flatMap(([name, id]) => {
      const key = normalizeFrequencyAvatarName(name);
      return key && isFrequencyAvatarId(id) ? [[key, id]] : [];
    }));
  } catch {
    return {};
  }
}

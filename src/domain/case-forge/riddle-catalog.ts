export interface ForgeRiddleObject {
  id: string;
  label: string;
  sigil: string;
}

export interface ForgeRiddleFragmentDefinition {
  id: string;
  text: string;
  /** Canonical truth table used to prove that the combined fragments have one answer. */
  matchingCandidateIds: readonly string[];
}

export interface ForgeRiddleCatalogEntry {
  answerId: string;
  candidateIds: readonly string[];
  fragments: readonly [
    ForgeRiddleFragmentDefinition,
    ForgeRiddleFragmentDefinition,
    ForgeRiddleFragmentDefinition,
    ForgeRiddleFragmentDefinition,
  ];
}

/**
 * A small authored object vocabulary keeps the riddle lock fair offline. The model may
 * narrate the room around it, but it never invents these facts or the authoritative answer.
 */
export const FORGE_RIDDLE_OBJECTS: readonly ForgeRiddleObject[] = [
  { id: 'anchor', label: 'ANCHOR', sigil: '⌖' },
  { id: 'bell', label: 'BELL', sigil: '◯' },
  { id: 'book', label: 'BOOK', sigil: '▤' },
  { id: 'candle', label: 'CANDLE', sigil: '╽' },
  { id: 'compass', label: 'COMPASS', sigil: 'N' },
  { id: 'hourglass', label: 'HOURGLASS', sigil: '⋈' },
  { id: 'key', label: 'KEY', sigil: '⌁' },
  { id: 'lantern', label: 'LANTERN', sigil: '◇' },
  { id: 'map', label: 'MAP', sigil: '▧' },
  { id: 'mirror', label: 'MIRROR', sigil: '◈' },
  { id: 'telescope', label: 'TELESCOPE', sigil: '◎' },
  { id: 'umbrella', label: 'UMBRELLA', sigil: '⌢' },
] as const;

export const FORGE_RIDDLE_CATALOG: readonly ForgeRiddleCatalogEntry[] = [
  {
    answerId: 'compass',
    candidateIds: ['compass', 'map', 'lantern', 'key', 'hourglass', 'bell', 'anchor', 'telescope'],
    fragments: [
      { id: 'fragment-1', text: 'Travelers trust me when the route stops making sense.', matchingCandidateIds: ['compass', 'map', 'lantern'] },
      { id: 'fragment-2', text: 'I can work while resting inside one steady hand.', matchingCandidateIds: ['compass', 'lantern', 'key', 'bell', 'telescope'] },
      { id: 'fragment-3', text: 'Something within me can move while my shell stays still.', matchingCandidateIds: ['compass', 'hourglass', 'bell'] },
      { id: 'fragment-4', text: 'A marked face matters more than my outer shape.', matchingCandidateIds: ['compass', 'map', 'hourglass', 'telescope'] },
    ],
  },
  {
    answerId: 'map',
    candidateIds: ['map', 'compass', 'book', 'mirror', 'umbrella', 'key', 'lantern', 'telescope'],
    fragments: [
      { id: 'fragment-1', text: 'I guide without speaking or making my own light.', matchingCandidateIds: ['map', 'compass', 'lantern'] },
      { id: 'fragment-2', text: 'Folding me can make me smaller without breaking me.', matchingCandidateIds: ['map', 'umbrella'] },
      { id: 'fragment-3', text: 'My body remembers a forest, but carries no roots.', matchingCandidateIds: ['map', 'book'] },
      { id: 'fragment-4', text: 'I hold many places while remaining in just one.', matchingCandidateIds: ['map', 'book', 'mirror'] },
    ],
  },
  {
    answerId: 'lantern',
    candidateIds: ['lantern', 'candle', 'compass', 'map', 'mirror', 'telescope', 'key', 'book'],
    fragments: [
      { id: 'fragment-1', text: 'Darkness makes people reach for me.', matchingCandidateIds: ['lantern', 'candle'] },
      { id: 'fragment-2', text: 'I can be carried while I am doing my job.', matchingCandidateIds: ['lantern', 'candle', 'compass', 'map', 'telescope'] },
      { id: 'fragment-3', text: 'Glass may guard the part that makes me useful.', matchingCandidateIds: ['lantern', 'mirror', 'telescope'] },
      { id: 'fragment-4', text: 'I can reveal a path without describing it.', matchingCandidateIds: ['lantern', 'candle', 'compass', 'map'] },
    ],
  },
  {
    answerId: 'key',
    candidateIds: ['key', 'compass', 'map', 'bell', 'anchor', 'book', 'umbrella', 'candle'],
    fragments: [
      { id: 'fragment-1', text: 'I usually fit inside a closed hand.', matchingCandidateIds: ['key', 'compass', 'bell', 'candle'] },
      { id: 'fragment-2', text: 'Cold metal often forms the part that matters most.', matchingCandidateIds: ['key', 'compass', 'bell', 'anchor'] },
      { id: 'fragment-3', text: 'I become useful where a barrier refuses to change.', matchingCandidateIds: ['key', 'anchor', 'umbrella'] },
      { id: 'fragment-4', text: 'My edge pattern matters more than the space inside it.', matchingCandidateIds: ['key', 'map', 'book'] },
    ],
  },
  {
    answerId: 'mirror',
    candidateIds: ['mirror', 'telescope', 'lantern', 'hourglass', 'map', 'book', 'bell', 'candle'],
    fragments: [
      { id: 'fragment-1', text: 'Glass is often the most fragile part of me.', matchingCandidateIds: ['mirror', 'telescope', 'lantern', 'hourglass'] },
      { id: 'fragment-2', text: 'Light must reach me before I can do my work.', matchingCandidateIds: ['mirror', 'telescope', 'lantern', 'candle'] },
      { id: 'fragment-3', text: 'I show something that is not physically stored inside me.', matchingCandidateIds: ['mirror', 'map', 'book'] },
      { id: 'fragment-4', text: 'Turn me away and my answer disappears immediately.', matchingCandidateIds: ['mirror', 'telescope', 'lantern'] },
    ],
  },
  {
    answerId: 'hourglass',
    candidateIds: ['hourglass', 'mirror', 'telescope', 'candle', 'bell', 'compass', 'book', 'lantern'],
    fragments: [
      { id: 'fragment-1', text: 'Glass lets you watch my hidden work happen.', matchingCandidateIds: ['hourglass', 'mirror', 'telescope', 'lantern'] },
      { id: 'fragment-2', text: 'Something moves inside me while my shell stays in place.', matchingCandidateIds: ['hourglass', 'compass', 'bell'] },
      { id: 'fragment-3', text: 'I measure a change without needing a numbered face.', matchingCandidateIds: ['hourglass', 'candle', 'compass'] },
      { id: 'fragment-4', text: 'Turning me over restores what I can measure.', matchingCandidateIds: ['hourglass', 'book', 'compass'] },
    ],
  },
  {
    answerId: 'bell',
    candidateIds: ['bell', 'lantern', 'key', 'anchor', 'compass', 'candle', 'book', 'umbrella'],
    fragments: [
      { id: 'fragment-1', text: 'Metal often gives my body its strength.', matchingCandidateIds: ['bell', 'key', 'anchor', 'compass', 'lantern'] },
      { id: 'fragment-2', text: 'I can announce a change without using a single word.', matchingCandidateIds: ['bell', 'lantern', 'candle'] },
      { id: 'fragment-3', text: 'I may hang above a room for far longer than I am heard.', matchingCandidateIds: ['bell', 'anchor', 'umbrella'] },
      { id: 'fragment-4', text: 'A strike makes my message travel farther than my body.', matchingCandidateIds: ['bell', 'key', 'book'] },
    ],
  },
  {
    answerId: 'anchor',
    candidateIds: ['anchor', 'bell', 'key', 'compass', 'mirror', 'book', 'map', 'lantern'],
    fragments: [
      { id: 'fragment-1', text: 'Metal and weight are both part of how I help.', matchingCandidateIds: ['anchor', 'bell', 'key', 'compass'] },
      { id: 'fragment-2', text: 'My best work is done by staying exactly where I am.', matchingCandidateIds: ['anchor', 'mirror', 'book'] },
      { id: 'fragment-3', text: 'Travelers value me most when water is close.', matchingCandidateIds: ['anchor', 'compass', 'map', 'lantern'] },
      { id: 'fragment-4', text: 'I hold something much larger than myself without closing around it.', matchingCandidateIds: ['anchor', 'key', 'book'] },
    ],
  },
] as const;

export function forgeRiddleObject(id: string): ForgeRiddleObject | undefined {
  return FORGE_RIDDLE_OBJECTS.find((candidate) => candidate.id === id);
}

export function forgeRiddleCatalogEntry(answerId: string): ForgeRiddleCatalogEntry | undefined {
  return FORGE_RIDDLE_CATALOG.find((entry) => entry.answerId === answerId);
}

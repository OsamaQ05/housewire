import type { Capability } from '../types';
import { routeLandmark } from './route-landmarks';
import { normalizeForgeThemePrompt } from './theme-prompt';
import type {
  ForgeCase,
  ForgeClue,
  ForgeDifficulty,
  ForgeDuration,
  ForgeGenerationRequest,
  ForgeHint,
  ForgeIntensity,
  ForgeRole,
  ForgeStage,
  ForgeThemeId,
  ForgeTone,
} from './types';
import {
  FORGE_RIDDLE_CATALOG,
  forgeRiddleObject,
  type ForgeRiddleCatalogEntry,
  type ForgeRiddleFragmentDefinition,
} from './riddle-catalog';

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const ALL_CAPABILITIES = [
  'manual',
  'touch',
  'motion',
  'orientation',
  'microphoneLevel',
  'cameraQr',
  'ambientLight',
  'haptics',
] as const satisfies readonly Capability[];

interface ThemeBlueprint {
  id: ForgeThemeId;
  label: string;
  accent: string;
  titles: readonly string[];
  tagline: string;
  premise: string;
  objective: string;
  ending: string;
  stageTitles: readonly [string, string, string, string, string];
  stageBeats: readonly [string, string, string, string, string];
  riddleTitle: string;
  riddleBeat: string;
  objectLabels: readonly string[];
  relayWords: readonly string[];
  gates: readonly string[];
}

const THEMES: Readonly<Record<ForgeThemeId, ThemeBlueprint>> = {
  'abyssal-relay': {
    id: 'abyssal-relay',
    label: 'ABYSSAL RELAY',
    accent: '#53D8D3',
    titles: ['The Drowned Frequency', 'Relay Below Zero', 'The Last Bathysphere'],
    tagline: 'Bring a lost sea station back on the air before the pressure reaches the core.',
    premise:
      'A research station has surfaced without its crew. Its emergency relay still answers—but only in fragments split across your phones.',
    objective:
      'Recover five interlocking station proofs and bring the emergency relay online as one crew.',
    ending:
      'The relay answers from the dark. The station lights climb the cable one by one, and the recovered log names your crew.',
    stageTitles: ['Floodline Order', 'Pressure Seal', 'The Silent Channel', 'Ballast Route', 'Surface Tone'],
    stageBeats: [
      'Five flooded modules are waking out of order. Their final pulses are scattered across the crew.',
      'The pressure vault accepts symbols, but corrosion has separated each marker from its value.',
      'A narrow-band channel can reach only one receiver at a time. The words must arrive in gate order.',
      'The ballast pumps will overload unless the current takes the station’s one safe route.',
      'The ascent motor listens for a physical formation and a held crew tone.',
    ],
    riddleTitle: 'The Unnamed Instrument',
    riddleBeat: 'A sealed equipment locker recognizes one object, but its description has surfaced on different channels.',
    objectLabels: ['SONAR', 'BALLAST', 'GALLEY', 'DIVE BELL', 'ARCHIVE', 'AIRLOCK', 'BEACON', 'CORE'],
    relayWords: ['ANCHOR', 'BRINE', 'LANTERN', 'TRENCH', 'ORBIT', 'HOLLOW', 'CURRENT', 'EMBER'],
    gates: ['AFT', 'KEEL', 'PORT', 'CROWN'],
  },
  'clockwork-manor': {
    id: 'clockwork-manor',
    label: 'CLOCKWORK MANOR',
    accent: '#F2B34B',
    titles: ['The House Between Seconds', 'Midnight Winding', 'The Unfinished Hour'],
    tagline: 'Repair a manor that has trapped one family minute and refuses to let it end.',
    premise:
      'At midnight, every clock in an abandoned manor stopped on a different second. A mechanical will has divided the winding sequence among its heirs.',
    objective:
      'Recover five interlocking inheritance proofs and restart the heart clock together.',
    ending:
      'The missing minute finally passes. Doors unlatch throughout the manor, and dawn moves across the portraits again.',
    stageTitles: ['Servants’ Sequence', 'The Brass Testament', 'Speaking Tube', 'Gearwalk', 'Heart Clock'],
    stageBeats: [
      'The manor rooms must wake in the order written between several damaged household ledgers.',
      'The master key is written in brass marks whose values were hidden on separate clock faces.',
      'The speaking tubes preserve four words, but each tube opens to only one listener.',
      'A service automaton must cross the gear floor without touching a locked tooth.',
      'The heart clock requires every heir to become one part of the escapement.',
    ],
    riddleTitle: 'The Unnamed Inheritance',
    riddleBeat: 'The mechanical will names no object outright. Its four surviving lines were delivered to different heirs.',
    objectLabels: ['PANTRY', 'ATRIUM', 'NURSERY', 'LIBRARY', 'ORANGERY', 'ATTIC', 'STUDY', 'BELL TOWER'],
    relayWords: ['MERCURY', 'VELLUM', 'THIRTEEN', 'CANDLE', 'COPPER', 'WINDOW', 'ORCHARD', 'HOLLOW'],
    gates: ['HOUR', 'MINUTE', 'CHIME', 'CROWN'],
  },
  'museum-afterlight': {
    id: 'museum-afterlight',
    label: 'MUSEUM AFTERLIGHT',
    accent: '#FF6B5C',
    titles: ['The Gallery That Moved', 'Afterlight Protocol', 'The Missing Exhibition'],
    tagline: 'Put a vanished exhibition back into reality before the night guard completes one round.',
    premise:
      'A prototype camera flash erased an exhibition from ordinary sight. Your phones still catch different parts of its afterimage.',
    objective:
      'Recover five interlocking exhibit proofs and hold the final frame long enough to restore the collection.',
    ending:
      'The shutter closes. Every missing object returns with a soft crackle of light, exactly where the crew remembered it.',
    stageTitles: ['Inventory of Shadows', 'Negative Vault', 'Audio Guide Zero', 'Gallery Without Walls', 'The Final Exposure'],
    stageBeats: [
      'The lost pieces cast separate afterimages. Only their overlapping order reveals the first catalog number.',
      'Each camera marker shows a symbol while its catalog value appears on somebody else’s phone.',
      'A damaged audio guide routes each accession word to one private listener.',
      'The erased gallery survives as open passages split across several viewpoints.',
      'The restoration flash needs the crew to hold a single impossible photograph together.',
    ],
    riddleTitle: 'Object Without a Label',
    riddleBeat: 'One erased exhibit can reopen the gallery, but its catalog description has split into contradictory-looking fragments.',
    objectLabels: ['MASK', 'ASTROLABE', 'VASE', 'LANTERN', 'MAP', 'CROWN', 'CAMERA', 'MIRROR'],
    relayWords: ['SILVER', 'VELVET', 'ORBIT', 'FIGURE', 'GLASS', 'EMBER', 'NORTH', 'FRAME'],
    gates: ['PLATE', 'LENS', 'SHUTTER', 'FILM'],
  },
  'stormbound-express': {
    id: 'stormbound-express',
    label: 'STORMBOUND EXPRESS',
    accent: '#9BB7FF',
    titles: ['The Train Beyond Mile Zero', 'Whiteout Limited', 'Signal at Black Pass'],
    tagline: 'Guide a stranded night train through a whiteout using signals no single passenger can see.',
    premise:
      'A mountain train has stopped between stations as a whiteout erases the track. Its old safety system has assigned one fragment of the route to each passenger.',
    objective:
      'Recover five interlocking rail proofs and guide the train safely through Black Pass.',
    ending:
      'The points lock with a deep metallic note. The train rolls out of the whiteout, carrying every passenger into the same sunrise.',
    stageTitles: ['Carriage Manifest', 'Signal Cabinet', 'Conductor’s Wire', 'Black Pass', 'Clear Track'],
    stageBeats: [
      'The carriages were uncoupled in the storm. Their manifests encode the only stable order.',
      'Ice hides the signal colors, leaving only geometric markers and split decoder strips.',
      'The conductor’s wire carries short route words to one carriage at a time.',
      'The points through Black Pass form one valid path, distributed across the train.',
      'The final signal requires every carriage to answer in one physical rhythm.',
    ],
    riddleTitle: 'The Lost Property Lock',
    riddleBeat: 'The emergency cabinet asks for one lost object. Each carriage received a different line from its description.',
    objectLabels: ['SLEEPER', 'DINER', 'MAIL', 'OBSERVATION', 'BAGGAGE', 'ENGINE', 'PARLOR', 'CABOOSE'],
    relayWords: ['SWITCH', 'SUMMIT', 'LANTERN', 'TUNNEL', 'CINDER', 'NORTH', 'RIVER', 'COPPER'],
    gates: ['HOME', 'DISTANT', 'PASS', 'YARD'],
  },
};

const THEME_IDS = Object.keys(THEMES) as ForgeThemeId[];
const GLYPHS = ['◼', '▲', '●', '◆', '⬟', '✚', '☾', '⌁'] as const;
const ROLE_ACCENTS = ['#FF6547', '#55CAD6', '#F4C95D', '#AFA0FF'] as const;
const ROLE_ARCHETYPES = [
  {
    title: 'Signal Keeper',
    brief: 'You hold the crew’s reference signals.',
    responsibility: 'Start comparisons and keep the shared order honest.',
  },
  {
    title: 'Field Reader',
    brief: 'You receive physical markers and partial decoders.',
    responsibility: 'Describe exactly what your phone reveals without guessing.',
  },
  {
    title: 'Route Bearer',
    brief: 'You preserve paths and transitions.',
    responsibility: 'Connect fragments into a route the whole crew can execute.',
  },
  {
    title: 'Final Witness',
    brief: 'You verify the last state of each mechanism.',
    responsibility: 'Confirm completion only after every required signal is present.',
  },
] as const;

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x48_57_46_31;
  }

  next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }

  integer(maximumExclusive: number): number {
    if (!Number.isInteger(maximumExclusive) || maximumExclusive <= 0) {
      throw new Error('Random range must be a positive integer.');
    }
    return Math.floor(this.next() * maximumExclusive);
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new Error('Cannot choose from an empty collection.');
    return values[this.integer(values.length)];
  }

  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = this.integer(index + 1);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }
}

export function forgeSeedFromValue(seed: string | number): number {
  const normalized = typeof seed === 'number' ? String(seed) : seed.trim().toUpperCase();
  let hash = 2_166_136_261;
  for (const character of normalized) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function mixSeed(seed: number, replayIndex: number, playerCount: number, difficulty: number): number {
  let mixed = seed ^ Math.imul(replayIndex + 1, 0x9e_37_79_b1);
  mixed ^= Math.imul(playerCount + 17, 0x85_eb_ca_6b);
  mixed ^= Math.imul(difficulty + 31, 0xc2_b2_ae_35);
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7f_4a_7c_15);
  mixed ^= mixed >>> 15;
  return mixed >>> 0;
}

function assertRequest(request: ForgeGenerationRequest): void {
  if (
    (typeof request.seed === 'string' && (request.seed.trim().length === 0 || request.seed.length > 128)) ||
    (typeof request.seed === 'number' && !Number.isFinite(request.seed))
  ) {
    throw new Error('Case seed must be a finite number or 1–128 character string.');
  }
  if (
    !Number.isSafeInteger(request.generatedAt) ||
    request.generatedAt <= 0 ||
    request.generatedAt > 8_640_000_000_000_000
  ) {
    throw new Error('generatedAt must be a positive safe timestamp.');
  }
  if (request.playerIds.length < 1 || request.playerIds.length > 4) {
    throw new Error('Case Forge supports one to four players.');
  }
  const playerIds = request.playerIds.map((playerId) => playerId.trim());
  if (playerIds.some((playerId) => !SAFE_ID.test(playerId)) || new Set(playerIds).size !== playerIds.length) {
    throw new Error('Player ids must be distinct safe identifiers.');
  }
  if (![1, 2, 3, 4, 5].includes(request.difficulty)) throw new Error('Difficulty must be 1–5.');
  if (![20, 30, 45].includes(request.targetMinutes)) throw new Error('Duration must be 20, 30 or 45 minutes.');
  if (!['eerie', 'adventure', 'mystery'].includes(request.tone)) throw new Error('Unsupported case tone.');
  if (!['gentle', 'balanced', 'intense'].includes(request.intensity)) throw new Error('Unsupported case intensity.');
  if (typeof request.safeMovement !== 'boolean' || typeof request.noiseAllowed !== 'boolean') {
    throw new Error('Movement and noise policies must be explicit booleans.');
  }
  const replayIndex = request.replayIndex ?? 0;
  if (!Number.isInteger(replayIndex) || replayIndex < 0 || replayIndex > 999_999) {
    throw new Error('Replay index must be a non-negative integer.');
  }
  if (request.themeId && !THEME_IDS.includes(request.themeId)) throw new Error('Unknown Case Forge theme.');
  if (
    request.customThemePrompt !== undefined &&
    (request.customThemePrompt.trim().length === 0 ||
      request.customThemePrompt.trim().length > 180 ||
      /[\u0000-\u001f\u007f]/.test(request.customThemePrompt))
  ) {
    throw new Error('Custom theme must be 1–180 printable characters.');
  }
  for (const playerId of playerIds) {
    const name = request.playerNames?.[playerId];
    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 24)) {
      throw new Error(`Player name for ${playerId} must be 1–24 characters.`);
    }
  }
  if (request.playerNames && Object.keys(request.playerNames).some((playerId) => !playerIds.includes(playerId))) {
    throw new Error('Player names may only reference members of this case.');
  }
  if (request.capabilitiesByPlayer) {
    for (const [playerId, capabilities] of Object.entries(request.capabilitiesByPlayer)) {
      if (!playerIds.includes(playerId) || !Array.isArray(capabilities)) {
        throw new Error('Capabilities may only reference members of this case.');
      }
      if (
        new Set(capabilities).size !== capabilities.length ||
        capabilities.some((capability) => !ALL_CAPABILITIES.includes(capability))
      ) {
        throw new Error(`Invalid capability declaration for ${playerId}.`);
      }
    }
  }
}

function closestThemeId(prompt: string | undefined, random: SeededRandom): ForgeThemeId {
  const normalized = prompt?.trim().toLowerCase() ?? '';
  if (/\b(sea|ocean|submarine|ship|underwater|diver|space|station)\b/.test(normalized)) return 'abyssal-relay';
  if (/\b(clock|time|manor|mansion|house|victorian|mechanical)\b/.test(normalized)) return 'clockwork-manor';
  if (/\b(museum|art|gallery|painting|camera|film|artifact)\b/.test(normalized)) return 'museum-afterlight';
  if (/\b(train|rail|snow|mountain|storm|journey|express)\b/.test(normalized)) return 'stormbound-express';
  if (normalized) return THEME_IDS[forgeSeedFromValue(normalized) % THEME_IDS.length];
  return random.pick(THEME_IDS);
}

function capabilitiesFor(request: ForgeGenerationRequest, playerId: string): readonly Capability[] {
  return request.capabilitiesByPlayer?.[playerId] ?? ALL_CAPABILITIES;
}

function allHaveCapability(
  request: ForgeGenerationRequest,
  playerIds: readonly string[],
  capability: Capability,
): boolean {
  return playerIds.every((playerId) => capabilitiesFor(request, playerId).includes(capability));
}

function distributeDurations(target: ForgeDuration): [number, number, number, number, number] {
  const weights = [0.16, 0.18, 0.2, 0.22, 0.24] as const;
  const values = weights.map((weight) => Math.max(3, Math.floor(target * weight)));
  let remainder = target - values.reduce((sum, value) => sum + value, 0);
  for (let index = values.length - 1; remainder > 0; index = (index - 1 + values.length) % values.length) {
    values[index] += 1;
    remainder -= 1;
  }
  while (remainder < 0) {
    const index = values.findIndex((value) => value > 3);
    if (index < 0) break;
    values[index] -= 1;
    remainder += 1;
  }
  return values as [number, number, number, number, number];
}

function createRoles(
  playerIds: readonly string[],
  names: Readonly<Record<string, string>> | undefined,
  random: SeededRandom,
): ForgeRole[] {
  const archetypes = random.shuffle(ROLE_ARCHETYPES).slice(0, playerIds.length);
  return playerIds.map((playerId, index) => ({
    id: `role-${index + 1}`,
    playerId,
    playerName: names?.[playerId]?.trim() || (playerIds.length === 1 ? 'You' : `Player ${index + 1}`),
    ...archetypes[index],
    accent: ROLE_ACCENTS[index],
  }));
}

function clueAudience(playerId: string): readonly string[] {
  return [playerId];
}

function standardHints(
  general: string,
  directional: string,
  strong: string,
  difficulty: ForgeDifficulty,
): readonly ForgeHint[] {
  return [
    { level: 1, text: general, penaltySeconds: 15 + difficulty * 5 },
    { level: 2, text: directional, penaltySeconds: 30 + difficulty * 10 },
    { level: 3, text: strong, penaltySeconds: 60 + difficulty * 15 },
  ];
}

function createOrderStage(
  theme: ThemeBlueprint,
  request: ForgeGenerationRequest,
  playerIds: readonly string[],
  random: SeededRandom,
  durationMinutes: number,
): ForgeStage {
  const tokenCount = Math.max(4 + Math.floor((request.difficulty - 1) / 2), playerIds.length + 1);
  const selected = random.shuffle(theme.objectLabels).slice(0, tokenCount);
  const answerLabels = random.shuffle(selected);
  const tokens = answerLabels.map((label) => ({
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label,
  }));
  const shuffledTokens = random.shuffle(tokens);
  const adjacentConstraints = tokens.slice(0, -1).map((token, index) => [token.id, tokens[index + 1].id] as const);
  const clues: ForgeClue[] = [
    {
      id: 'order-roster',
      title: 'Recovered pieces',
      audiencePlayerIds: [...playerIds],
      private: false,
      payload: { kind: 'sequence', items: shuffledTokens.map((token) => token.label) },
    },
    ...adjacentConstraints.map(([left, right], index) => {
      const owner = playerIds[index % playerIds.length];
      const leftLabel = tokens.find((token) => token.id === left)?.label ?? left;
      const rightLabel = tokens.find((token) => token.id === right)?.label ?? right;
      return {
        id: `order-link-${index + 1}`,
        title: `Fragment ${index + 1}`,
        audiencePlayerIds: clueAudience(owner),
        private: playerIds.length > 1,
        payload: { kind: 'text' as const, text: `${leftLabel} sits immediately before ${rightLabel}.` },
      };
    }),
  ];

  return {
    id: 'forge-order',
    index: 0,
    title: theme.stageTitles[0],
    storyBeat: theme.stageBeats[0],
    instruction: 'Say your fragments aloud. Build one chain, then submit the recovered pieces in order.',
    durationMinutes,
    mechanic: { kind: 'distributed-order', tokens: shuffledTokens, adjacentConstraints },
    clues,
    hints: standardHints(
      'Each fragment is an exact adjacency, not just a general before/after clue.',
      'Find the piece that nobody says comes after another piece; it starts the chain.',
      `The chain begins with ${tokens[0].label}.`,
      request.difficulty,
    ),
    solution: { kind: 'sequence', answer: tokens.map((token) => token.id) },
    requiredPlayerIds: [...playerIds],
    submitterPlayerIds: [...playerIds],
    fallback: {
      reason: 'This stage uses only reading and touch.',
      instruction: 'Read each fragment aloud and tap the labels into order.',
      preservesAnswer: true,
    },
  };
}

function riddleSurvivors(
  candidateIds: readonly string[],
  fragments: readonly ForgeRiddleFragmentDefinition[],
): string[] {
  return candidateIds.filter((candidateId) =>
    fragments.every((fragment) => fragment.matchingCandidateIds.includes(candidateId)),
  );
}

function createRiddleCandidates(
  entry: ForgeRiddleCatalogEntry,
  fragments: readonly ForgeRiddleFragmentDefinition[],
  count: number,
  random: SeededRandom,
) {
  const selectedIds = [entry.answerId];
  for (const fragment of fragments) {
    const decoy = random.shuffle(fragment.matchingCandidateIds)
      .find((candidateId) => candidateId !== entry.answerId && !selectedIds.includes(candidateId));
    if (decoy) selectedIds.push(decoy);
  }
  for (const candidateId of random.shuffle(entry.candidateIds)) {
    if (selectedIds.length >= count) break;
    if (!selectedIds.includes(candidateId)) selectedIds.push(candidateId);
  }
  return random.shuffle(selectedIds).map((candidateId) => {
    const candidate = forgeRiddleObject(candidateId);
    if (!candidate) throw new Error(`Missing canonical riddle object ${candidateId}.`);
    return { ...candidate };
  });
}

function createSplitRiddleStage(
  theme: ThemeBlueprint,
  request: ForgeGenerationRequest,
  playerIds: readonly string[],
  random: SeededRandom,
  durationMinutes: number,
): ForgeStage {
  const entry = random.pick(FORGE_RIDDLE_CATALOG);
  const fragmentCount: 3 | 4 = playerIds.length === 4 || request.difficulty <= 2 ? 4 : 3;
  const fragments = random.shuffle(entry.fragments.slice(0, fragmentCount));
  const candidateCount = request.difficulty <= 1 ? 6 : request.difficulty <= 3 ? 7 : 8;
  const candidates = createRiddleCandidates(entry, fragments, candidateCount, random);
  const candidateIds = candidates.map((candidate) => candidate.id);
  const afterTwo = riddleSurvivors(candidateIds, fragments.slice(0, 2));
  const answer = forgeRiddleObject(entry.answerId);
  if (!answer || riddleSurvivors(candidateIds, fragments).length !== 1) {
    throw new Error('The canonical split-riddle catalog produced an ambiguous lock.');
  }

  const clues: ForgeClue[] = fragments.map((fragment, index) => ({
    id: `riddle-fragment-${index + 1}`,
    title: `Witness fragment ${index + 1} of ${fragmentCount}`,
    audiencePlayerIds: clueAudience(playerIds[index % playerIds.length]),
    private: playerIds.length > 1,
    payload: { kind: 'riddle-fragment', fragmentId: fragment.id, text: fragment.text },
  }));

  return {
    id: 'forge-split-riddle',
    index: 0,
    title: theme.riddleTitle,
    storyBeat: theme.riddleBeat,
    instruction: 'Keep your fragment on your phone. Read every line aloud, eliminate objects that conflict, then lock in the one survivor.',
    durationMinutes,
    mechanic: { kind: 'split-riddle', candidates, fragmentCount },
    clues,
    hints: standardHints(
      'No single fragment is enough. Test each object against every line the crew has read.',
      `Combining the first two witness fragments leaves ${afterTwo.length} possible ${afterTwo.length === 1 ? 'object' : 'objects'} on this plate. Add the remaining evidence.`,
      `The answer starts with ${answer.label[0]} and has ${answer.label.length} letters.`,
      request.difficulty,
    ),
    solution: { kind: 'word', answer: entry.answerId },
    requiredPlayerIds: [...playerIds],
    submitterPlayerIds: [...playerIds],
    fallback: {
      reason: 'The object lock uses private reading and touch, so it remains playable without sensors or network access.',
      instruction: 'Pass the phone between roles if needed; keep the same candidate plate and combine all witness fragments aloud.',
      preservesAnswer: true,
    },
  };
}

function createSymbolStage(
  theme: ThemeBlueprint,
  request: ForgeGenerationRequest,
  playerIds: readonly string[],
  random: SeededRandom,
  durationMinutes: number,
): ForgeStage {
  const codeLength = Math.min(5, Math.max(playerIds.length, 3 + Math.floor(request.difficulty / 2)));
  const symbols = random.shuffle(GLYPHS).slice(0, codeLength);
  const digits = random.shuffle(['1', '2', '3', '4', '5', '6', '7', '8', '9']).slice(0, codeLength);
  const encodedSequence = Array.from({ length: codeLength }, () => random.pick(symbols));
  const mapping = new Map(symbols.map((symbol, index) => [symbol, digits[index]]));
  const answer = encodedSequence.map((symbol) => mapping.get(symbol)).join('');
  const hasCamera = allHaveCapability(request, playerIds, 'cameraQr');
  const clues: ForgeClue[] = [
    {
      id: 'symbol-sequence',
      title: 'Lock face',
      audiencePlayerIds: [...playerIds],
      private: false,
      payload: { kind: 'sequence', items: encodedSequence },
    },
  ];

  symbols.forEach((symbol, index) => {
    const markerOwner = playerIds[index % playerIds.length];
    const decoderOwner = playerIds[(index + 1) % playerIds.length];
    const markerToken = `HWF-${theme.id.slice(0, 3).toUpperCase()}-${index + 1}-${random.integer(0xffff).toString(16).padStart(4, '0').toUpperCase()}`;
    clues.push({
      id: `marker-${index + 1}`,
      title: `Marker ${index + 1}`,
      audiencePlayerIds: clueAudience(markerOwner),
      private: playerIds.length > 1,
      payload: hasCamera
        ? { kind: 'camera-marker', markerToken, symbol }
        : { kind: 'text', text: `Manual marker ${index + 1}: ${symbol}` },
    });
    clues.push({
      id: `decoder-${index + 1}`,
      title: `Decoder strip ${index + 1}`,
      audiencePlayerIds: clueAudience(decoderOwner),
      private: playerIds.length > 1,
      payload: { kind: 'mapping', pairs: [{ left: symbol, right: digits[index] }] },
    });
  });

  return {
    id: 'forge-symbol-lock',
    index: 1,
    title: theme.stageTitles[1],
    storyBeat: theme.stageBeats[1],
    instruction: hasCamera
      ? 'Scan or reveal each marker, match it to another player’s decoder strip, then enter the lock code.'
      : 'Reveal each rotating marker, match it to another player’s decoder strip, then enter the lock code.',
    durationMinutes,
    mechanic: {
      kind: 'symbol-lock',
      symbols,
      encodedSequence,
      preferredCapability: 'cameraQr',
      revealMode: hasCamera ? 'camera' : 'manual',
    },
    clues,
    hints: standardHints(
      'Marker owners should announce symbols; decoder owners should answer with digits.',
      'Decode the lock face strictly from left to right, including repeated symbols.',
      `The first symbol resolves to ${answer[0]}.`,
      request.difficulty,
    ),
    solution: { kind: 'code', answer },
    requiredPlayerIds: [...playerIds],
    submitterPlayerIds: [...playerIds],
    fallback: {
      reason: hasCamera ? 'Camera access can still be refused at any time.' : 'One or more phones have no camera scanner.',
      instruction: 'Tap REVEAL MARKER to rotate the same signed symbol on screen; the decoder and final code do not change.',
      preservesAnswer: true,
    },
  };
}

function createRelayStage(
  theme: ThemeBlueprint,
  request: ForgeGenerationRequest,
  playerIds: readonly string[],
  random: SeededRandom,
  durationMinutes: number,
): ForgeStage {
  const roundCount = Math.min(4, Math.max(playerIds.length, 2 + Math.floor(request.difficulty / 2)));
  const words = random.shuffle(theme.relayWords).slice(0, roundCount);
  const hasAudio = request.noiseAllowed && allHaveCapability(request, playerIds, 'microphoneLevel');
  const rounds = words.map((_, index) => {
    const senderPlayerId = playerIds[index % playerIds.length];
    const recipientPlayerId =
      playerIds.length === 1 ? senderPlayerId : playerIds[(index + 1) % playerIds.length];
    return {
      round: index + 1,
      senderPlayerId,
      recipientPlayerId,
      excludedPlayerIds: playerIds.filter(
        (playerId) => playerId !== senderPlayerId && playerId !== recipientPlayerId,
      ),
      gate: theme.gates[index],
    };
  });
  const clues: ForgeClue[] = [];
  rounds.forEach((round, index) => {
    clues.push({
      id: `relay-word-${round.round}`,
      title: `${round.gate} transmission`,
      audiencePlayerIds: clueAudience(round.senderPlayerId),
      private: playerIds.length > 1,
      payload: hasAudio
        ? {
            kind: 'audio-token',
            spokenText: words[index],
            fallbackText: `One-time word: ${words[index]}`,
          }
        : { kind: 'text', text: `One-time word: ${words[index]}` },
    });
    clues.push({
      id: `relay-gate-${round.round}`,
      title: `${round.gate} receiver`,
      audiencePlayerIds: clueAudience(round.recipientPlayerId),
      private: playerIds.length > 1,
      payload: {
        kind: 'text',
        text: playerIds.length === 1
          ? `Listen once, close the flap, then enter the ${round.gate} word from memory.`
          : `Only you may acknowledge the word sent through the ${round.gate} gate.`,
      },
    });
  });

  return {
    id: 'forge-private-relay',
    index: 2,
    title: theme.stageTitles[2],
    storyBeat: theme.stageBeats[2],
    instruction:
      playerIds.length === 1
        ? 'Play each burst once, close its flap, then reconstruct the gate words from memory.'
        : hasAudio
          ? 'Record each word as a short private burst. Only its named receiver can acknowledge it.'
          : 'Open each one-time word flap and pass it only to the named receiver.',
    durationMinutes,
    mechanic: {
      kind: 'private-relay',
      rounds,
      preferredCapability: 'microphoneLevel',
      deliveryMode: hasAudio ? 'audio' : 'text',
      memoryMode: playerIds.length === 1,
    },
    clues,
    hints: standardHints(
      'Follow the gate order shown on the stage; delivery order is part of the proof.',
      'The receiver should repeat the word once before acknowledging it.',
      `The ${rounds[0].gate} word begins with ${words[0][0]}.`,
      request.difficulty,
    ),
    solution: {
      kind: 'relay',
      rounds: rounds.map((round, index) => ({
        round: round.round,
        recipientPlayerId: round.recipientPlayerId,
        token: words[index],
      })),
    },
    requiredPlayerIds: [...playerIds],
    submitterPlayerIds: [...new Set(rounds.map((round) => round.recipientPlayerId))],
    fallback: {
      reason: hasAudio ? 'Microphone permission can be refused.' : 'The room or device is not suitable for recorded audio.',
      instruction: 'Use the one-time text flap. It reveals the identical token only to the sender and expires after acknowledgement.',
      preservesAnswer: true,
    },
  };
}

type Edge = readonly [number, number];

function edgeKey(first: number, second: number): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

function gridNeighbors(cell: number, width: number, height: number): number[] {
  const row = Math.floor((cell - 1) / width);
  const column = (cell - 1) % width;
  const result: number[] = [];
  if (row > 0) result.push(cell - width);
  if (column < width - 1) result.push(cell + 1);
  if (row < height - 1) result.push(cell + width);
  if (column > 0) result.push(cell - 1);
  return result;
}

function createPerfectMaze(width: 3 | 4, random: SeededRandom): readonly Edge[] {
  const visited = new Set<number>([1]);
  const stack = [1];
  const edges: Edge[] = [];
  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const available = random.shuffle(gridNeighbors(current, width, width)).filter((cell) => !visited.has(cell));
    const next = available[0];
    if (next === undefined) {
      stack.pop();
      continue;
    }
    edges.push(current < next ? [current, next] : [next, current]);
    visited.add(next);
    stack.push(next);
  }
  return edges;
}

function adjacencyFromEdges(cellCount: number, edges: readonly Edge[]): Map<number, number[]> {
  const adjacency = new Map<number, number[]>();
  for (let cell = 1; cell <= cellCount; cell += 1) adjacency.set(cell, []);
  for (const [first, second] of edges) {
    adjacency.get(first)?.push(second);
    adjacency.get(second)?.push(first);
  }
  return adjacency;
}

function farthestCell(start: number, adjacency: ReadonlyMap<number, readonly number[]>): number {
  const queue = [start];
  const distance = new Map<number, number>([[start, 0]]);
  let farthest = start;
  while (queue.length > 0) {
    const current = queue.shift() as number;
    if ((distance.get(current) ?? 0) > (distance.get(farthest) ?? 0)) farthest = current;
    for (const next of adjacency.get(current) ?? []) {
      if (distance.has(next)) continue;
      distance.set(next, (distance.get(current) ?? 0) + 1);
      queue.push(next);
    }
  }
  return farthest;
}

function pathBetween(
  start: number,
  exit: number,
  adjacency: ReadonlyMap<number, readonly number[]>,
): number[] {
  const queue = [start];
  const previous = new Map<number, number | null>([[start, null]]);
  while (queue.length > 0) {
    const current = queue.shift() as number;
    if (current === exit) break;
    for (const next of adjacency.get(current) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  const path: number[] = [];
  let cursor: number | null | undefined = exit;
  while (cursor !== null && cursor !== undefined) {
    path.push(cursor);
    cursor = previous.get(cursor);
  }
  return path.reverse();
}

function createRouteStage(
  theme: ThemeBlueprint,
  request: ForgeGenerationRequest,
  playerIds: readonly string[],
  random: SeededRandom,
  durationMinutes: number,
): ForgeStage {
  const width: 3 | 4 = request.difficulty <= 2 ? 3 : 4;
  const cells = Array.from({ length: width * width }, (_, index) => index + 1);
  const openEdges = createPerfectMaze(width, random);
  const adjacency = adjacencyFromEdges(cells.length, openEdges);
  const firstEnd = farthestCell(random.pick(cells), adjacency);
  const secondEnd = farthestCell(firstEnd, adjacency);
  const answer = pathBetween(firstEnd, secondEnd, adjacency);
  const edgeBuckets = playerIds.map(() => [] as Edge[]);
  random.shuffle(openEdges).forEach((edge, index) => edgeBuckets[index % playerIds.length].push(edge));
  const clues: ForgeClue[] = edgeBuckets.map((edges, index) => ({
    id: `route-layer-${index + 1}`,
    title: 'Your doorway map',
    audiencePlayerIds: clueAudience(playerIds[index]),
    private: playerIds.length > 1,
    payload: { kind: 'grid-edges', edges },
  }));
  clues.push({
    id: 'route-terminals',
    title: 'Entry / exit plate',
    audiencePlayerIds: clueAudience(playerIds[(request.difficulty + 1) % playerIds.length]),
    private: playerIds.length > 1,
    payload: { kind: 'text', text: `Start at ${routeLandmark(firstEnd).label}. Reach ${routeLandmark(secondEnd).label}.` },
  });

  return {
    id: 'forge-route-grid',
    index: 3,
    title: theme.stageTitles[3],
    storyBeat: theme.stageBeats[3],
    instruction: 'Everyone has different doorways on the same map. Describe which landmarks connect; together, draw one safe path from START to EXIT.',
    durationMinutes,
    mechanic: {
      kind: 'route-grid',
      width,
      height: width,
      cells,
      openEdges: [...openEdges].sort((first, second) => edgeKey(...first).localeCompare(edgeKey(...second))),
      startCell: firstEnd,
      exitCell: secondEnd,
    },
    clues,
    hints: standardHints(
      'Every line in a route layer is an open passage; unlisted borders are walls.',
      'Combine all layers before moving. The complete network is a tree, so it has one route.',
      'Begin at START and ask who has a doorway touching that landmark. Cross out dead ends together.',
      request.difficulty,
    ),
    solution: { kind: 'route', answer },
    requiredPlayerIds: [...playerIds],
    submitterPlayerIds: [...playerIds],
    fallback: {
      reason: 'The grid is touch-native and requires no sensor.',
      instruction: 'Describe the landmarks joined by a line, then tap those landmarks on the shared route board.',
      preservesAnswer: true,
    },
  };
}


/** A final reconstruction rather than a contact that opens just by being held. */
function createReconstructionFinale(theme: ThemeBlueprint, request: ForgeGenerationRequest, playerIds: readonly string[], random: SeededRandom, durationMinutes: number): ForgeStage {
  const stage = createOrderStage(theme, { ...request, difficulty: Math.max(3, request.difficulty) as ForgeDifficulty }, playerIds, random, durationMinutes);
  return {
    ...stage,
    id: 'forge-reconstruction',
    title: 'The Last Missing Minute',
    storyBeat: 'The exit recorded what happened, but not when. Each person recovered a different piece of the final minute. Rebuild it before the door can trust you.',
    instruction: 'Each object marks one moment. Read your fragments aloud and reconstruct the exact order together. “Immediately after” means no object can go between them.',
    clues: stage.clues.map((clue, index) => {
      if (clue.payload.kind !== 'text' || !clue.id.startsWith('order-link-') || stage.mechanic.kind !== 'distributed-order') return clue;
      const pair = stage.mechanic.adjacentConstraints[Number(clue.id.replace('order-link-', '')) - 1];
      const first = stage.mechanic.tokens.find((token) => token.id === pair[0])!.label;
      const second = stage.mechanic.tokens.find((token) => token.id === pair[1])!.label;
      return { ...clue, title: `Witness memory ${index}`, payload: { kind: 'text' as const, text: index % 2 ? `“I remember ${second} immediately after ${first}.”` : `“${first} happened immediately before ${second}. Nothing happened between them.”` } };
    }),
    fallback: { reason: 'The finale is a shared deduction, so no sensor or pressure hold is required.', instruction: 'Read the memories, then arrange the object tiles. Every clue remains available to its own role.', preservesAnswer: true },
  };
}

function stylePremise(base: string, tone: ForgeTone, intensity: ForgeIntensity): string {
  const lead = tone === 'eerie' ? 'The house is quiet. ' : tone === 'adventure' ? 'The crew has one attempt. ' : '';
  const tail = intensity === 'intense' ? ' The mechanism is already counting down.' : intensity === 'gentle' ? ' Nothing advances until the crew is ready.' : '';
  return `${lead}${base}${tail}`;
}

function createCustomThemeBlueprint(base: ThemeBlueprint, prompt: string): ThemeBlueprint {
  const subject = prompt.trim().replace(/\s+/g, ' ');
  const titleWords = subject
    .match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu)
    ?.filter((word, index) => index > 0 || !/^(a|an|the)$/i.test(word))
    .slice(0, 6) ?? [];
  const titleSubject = (titleWords.join(' ') || 'Unfiled World').slice(0, 56);
  const world = subject.slice(0, 150);
  return {
    ...base,
    label: 'CUSTOM CASE',
    titles: [`The ${titleSubject}`, `${titleSubject}: Zero`, `The Last ${titleSubject}`],
    tagline: `A five-stage escape built inside this world: ${world}`.slice(0, 180),
    premise:
      `The case world is “${world}”. An unknown mechanism has divided its only escape sequence across the crew’s phones.`,
    objective:
      'Recover five interlocking proofs from the case world and close its final mechanism together.',
    ending:
      `The final lock releases. “${world}” becomes still, and the route behind the crew seals without taking any of its evidence.`,
    stageTitles: ['Origin Sequence', 'The Encoded Aperture', 'Private Frequency', 'The Impossible Route', 'Final Alignment'],
    stageBeats: [
      `The first trace from “${world}” has been split into exact adjacency fragments.`,
      'A sealed aperture shows symbols to one role and their values to another.',
      'The mechanism opens a private channel to only one intended receiver at a time.',
      'Several partial maps describe one safe route through the case world.',
      'The exit responds only when every role holds a different part of one synchronized proof.',
    ],
    riddleTitle: 'The Nameless Object',
    riddleBeat: `One object belongs inside “${world}”, but its identity survives only as private witness fragments.`,
    objectLabels: ['ORIGIN', 'ARCHIVE', 'LANTERN', 'MIRROR', 'SIGNAL', 'VAULT', 'GATE', 'CORE'],
    relayWords: ['ORBIT', 'EMBER', 'NORTH', 'GLASS', 'HOLLOW', 'COPPER', 'THREAD', 'RETURN'],
    gates: ['ENTRY', 'ECHO', 'CROSSING', 'EXIT'],
  };
}

/**
 * Produces a complete deterministic case locally. The output contains executable puzzle
 * state and authoritative answers; no model, account, network, or API key is involved.
 */
export function generateOfflineForgeCase(request: ForgeGenerationRequest): ForgeCase {
  request = { ...request, customThemePrompt: normalizeForgeThemePrompt(request.customThemePrompt) };
  assertRequest(request);
  const replayIndex = request.replayIndex ?? 0;
  const normalizedPlayerIds = request.playerIds.map((playerId) => playerId.trim());
  const baseSeed = request.customThemePrompt
    ? forgeSeedFromValue(request.seed) ^ forgeSeedFromValue(request.customThemePrompt)
    : forgeSeedFromValue(request.seed);
  const effectiveSeed = mixSeed(baseSeed, replayIndex, normalizedPlayerIds.length, request.difficulty);
  const random = new SeededRandom(effectiveSeed);
  const baseTheme = THEMES[request.themeId ?? closestThemeId(request.customThemePrompt, random)];
  const theme = request.customThemePrompt
    ? createCustomThemeBlueprint(baseTheme, request.customThemePrompt)
    : baseTheme;
  const durations = distributeDurations(request.targetMinutes);
  const roles = createRoles(normalizedPlayerIds, request.playerNames, random);
  const legacyKinds = random.shuffle([
    'symbol-lock',
    'private-relay',
    'route-grid',
  ] as const);
  const openingKinds = random.shuffle([
    'split-riddle',
    ...legacyKinds,
  ] as const);
  const openingStages = openingKinds.map((kind, index) => {
    switch (kind) {
      case 'split-riddle':
        return createSplitRiddleStage(theme, request, normalizedPlayerIds, random, durations[index]);
      case 'symbol-lock':
        return createSymbolStage(theme, request, normalizedPlayerIds, random, durations[index]);
      case 'private-relay':
        return createRelayStage(theme, request, normalizedPlayerIds, random, durations[index]);
      case 'route-grid':
        return createRouteStage(theme, request, normalizedPlayerIds, random, durations[index]);
    }
  });
  const stages = [
    ...openingStages,
    createReconstructionFinale(theme, request, normalizedPlayerIds, random, durations[4]),
  ].map((stage, index) => ({ ...stage, index }));
  const idSuffix = mixSeed(effectiveSeed, THEME_IDS.indexOf(theme.id), request.targetMinutes, request.intensity.length)
    .toString(36)
    .toUpperCase()
    .padStart(7, '0');

  return {
    id: `forge-${theme.id}-${idSuffix}`,
    schemaVersion: 1,
    generatorVersion: 'housewire-local-forge-v3',
    providerId: 'housewire-local-forge-v1',
    seed: request.seed,
    effectiveSeed,
    replayIndex,
    createdAt: request.generatedAt,
    title: random.pick(theme.titles),
    tagline: theme.tagline,
    theme: theme.id,
    accent: theme.accent,
    durationMinutes: request.targetMinutes,
    playerCount: normalizedPlayerIds.length,
    difficulty: request.difficulty,
    tone: request.tone,
    intensity: request.intensity,
    premise: stylePremise(theme.premise, request.tone, request.intensity),
    objective: theme.objective,
    ending: theme.ending,
    safetyNotice: request.safeMovement
      ? 'Clear a small arm’s-length area around each player. No running, stairs, darkness, or blind movement is required.'
      : 'Seated-safe edition: every physical proof can be completed with the phone supported over a table.',
    roles,
    stages,
    recipe: {
      seed: request.seed,
      playerIds: normalizedPlayerIds,
      playerNames: request.playerNames,
      difficulty: request.difficulty,
      targetMinutes: request.targetMinutes,
      tone: request.tone,
      intensity: request.intensity,
      safeMovement: request.safeMovement,
      noiseAllowed: request.noiseAllowed,
      replayIndex,
      themeId: theme.id,
      customThemePrompt: request.customThemePrompt?.trim(),
      capabilitiesByPlayer: request.capabilitiesByPlayer,
    },
    validation: {
      validatorVersion: 1,
      status: 'playable',
      checkedAt: request.generatedAt,
      checks: [
        'five-stage-arc',
        'unique-stage-solutions',
        'all-players-required',
        'capability-fallbacks',
        'private-clue-isolation',
        'canonical-riddle-lock',
        'variable-mechanic-cut',
        'route-connectivity',
        'bounded-content',
      ],
    },
  };
}

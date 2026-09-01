export const LINE_13_GLYPHS = ['CROWN', 'FORK', 'EYE', 'GATE', 'COIL', 'KEY'] as const;

export type Line13Glyph = (typeof LINE_13_GLYPHS)[number];
export type TiltGate = 'LEFT' | 'RIGHT' | 'AWAY' | 'TOWARD';
export type FinalContact = 'LEFT EDGE' | 'RIGHT EDGE' | 'UPRIGHT' | 'CENTER CONTACT';
export type SignalPhase = 'SOLID' | 'BROKEN';

export interface CipherFragment {
  nodeId: string;
  positions: readonly { index: number; glyph: Line13Glyph }[];
}

export interface DecoderFragment {
  nodeId: string;
  mappings: readonly { glyph: Line13Glyph; digit: number }[];
}

export interface LensMarker {
  position: number;
  glyph: Line13Glyph;
  ownerNodeId: string;
  qrToken: string;
}

export interface RouteScrap {
  nodeId: string;
  incoming: Line13Glyph;
  solidExit: Line13Glyph;
  brokenExit: Line13Glyph;
}

export interface Line13Game {
  seed: number;
  nodeIds: readonly string[];
  ringingNodeId: string;
  courierNodeId: string;
  sourceNodeId: string;
  destinationNodeId: string;
  cipher: readonly Line13Glyph[];
  cipherFragments: readonly CipherFragment[];
  decoder: Readonly<Record<Line13Glyph, TiltGate>>;
  digitDecoder: Readonly<Record<Line13Glyph, number>>;
  decoderFragments: readonly DecoderFragment[];
  pin: string;
  lensMarkers: readonly LensMarker[];
  phase: SignalPhase;
  route: readonly string[];
  circuitOrder: readonly Line13Glyph[];
  routeScraps: readonly RouteScrap[];
  finalContacts: Readonly<Record<string, FinalContact>>;
  transferCode: string;
  futureTimestamp: number;
}

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x1a13c0de;
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
    return Math.floor(this.next() * maximumExclusive);
  }

  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = this.integer(index + 1);
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }
}

const TILT_GATES: readonly TiltGate[] = ['LEFT', 'RIGHT', 'AWAY', 'TOWARD'];
const DECODER_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const FINAL_CONTACTS: readonly FinalContact[] = [
  'LEFT EDGE',
  'RIGHT EDGE',
  'UPRIGHT',
  'CENTER CONTACT',
];

function createDecoder(random: SeededRandom): Readonly<Record<Line13Glyph, TiltGate>> {
  const gates = random.shuffle(TILT_GATES);
  return Object.fromEntries(
    LINE_13_GLYPHS.map((glyph, index) => [glyph, gates[index % gates.length]]),
  ) as unknown as Readonly<Record<Line13Glyph, TiltGate>>;
}

function distributeCipher(
  cipher: readonly Line13Glyph[],
  nodeIds: readonly string[],
  random: SeededRandom,
): readonly CipherFragment[] {
  const owners = random.shuffle(
    cipher.map((_, index) => nodeIds[index % nodeIds.length]),
  );
  return nodeIds.map((nodeId) => ({
    nodeId,
    positions: cipher.flatMap((glyph, index) =>
      owners[index] === nodeId ? [{ index: index + 1, glyph }] : [],
    ),
  }));
}

function createDigitDecoder(random: SeededRandom): Readonly<Record<Line13Glyph, number>> {
  const digits = random.shuffle(DECODER_DIGITS).slice(0, LINE_13_GLYPHS.length);
  return Object.fromEntries(
    LINE_13_GLYPHS.map((glyph, index) => [glyph, digits[index]]),
  ) as unknown as Readonly<Record<Line13Glyph, number>>;
}

function distributeDecoder(
  digitDecoder: Readonly<Record<Line13Glyph, number>>,
  cipherFragments: readonly CipherFragment[],
  nodeIds: readonly string[],
  random: SeededRandom,
): readonly DecoderFragment[] {
  const cipherOwners = new Map<Line13Glyph, string>();
  for (const fragment of cipherFragments) {
    for (const position of fragment.positions) cipherOwners.set(position.glyph, fragment.nodeId);
  }

  const ownerOrder = random.shuffle(nodeIds);
  const ownerOffset = 1 + random.integer(ownerOrder.length - 1);
  let unclaimedIndex = 0;
  const mappingOwners = new Map<Line13Glyph, string>();

  for (const glyph of LINE_13_GLYPHS) {
    const cipherOwner = cipherOwners.get(glyph);
    if (cipherOwner) {
      const cipherOwnerIndex = ownerOrder.indexOf(cipherOwner);
      mappingOwners.set(
        glyph,
        ownerOrder[(cipherOwnerIndex + ownerOffset) % ownerOrder.length],
      );
    } else {
      mappingOwners.set(glyph, ownerOrder[unclaimedIndex % ownerOrder.length]);
      unclaimedIndex += 1;
    }
  }

  return nodeIds.map((nodeId) => ({
    nodeId,
    mappings: LINE_13_GLYPHS.flatMap((glyph) =>
      mappingOwners.get(glyph) === nodeId ? [{ glyph, digit: digitDecoder[glyph] }] : [],
    ),
  }));
}

function createLensMarkers(
  seed: number,
  cipher: readonly Line13Glyph[],
  nodeIds: readonly string[],
  courierNodeId: string,
  random: SeededRandom,
): readonly LensMarker[] {
  const ownerOrder = random.shuffle(nodeIds.filter((nodeId) => nodeId !== courierNodeId));

  return cipher.map((glyph, index) => {
    const position = index + 1;
    const tokenHash = line13SeedFromCode(`LENS:${seed >>> 0}:${position}:${glyph}`)
      .toString(36)
      .toUpperCase()
      .padStart(7, '0');
    return {
      position,
      glyph,
      ownerNodeId: ownerOrder[index % ownerOrder.length],
      qrToken: `HW13-LENS-${position}-${tokenHash}`,
    };
  });
}

function createCircuitScraps(
  nodeIds: readonly string[],
  circuitOrder: readonly Line13Glyph[],
  phase: SignalPhase,
  random: SeededRandom,
): readonly RouteScrap[] {
  // Shuffling the owners before cycling through them gives every 2–4 phone
  // crew at least one tile without coupling puzzle length to crew size.
  const ownerOrder = random.shuffle(nodeIds);

  return circuitOrder.map((incoming, index) => {
    const genuineExit = circuitOrder[(index + 1) % circuitOrder.length];
    const falseExitCandidates = LINE_13_GLYPHS.filter(
      (glyph) => glyph !== genuineExit && glyph !== incoming,
    );
    const falseExit = falseExitCandidates[random.integer(falseExitCandidates.length)];
    return {
      nodeId: ownerOrder[index % ownerOrder.length],
      incoming,
      solidExit: phase === 'SOLID' ? genuineExit : falseExit,
      brokenExit: phase === 'BROKEN' ? genuineExit : falseExit,
    };
  });
}

/**
 * Produces a complete, solvable LINE 13 operation. Generation is deliberately
 * bounded and deterministic: the local director selects a seed, while authored
 * rules guarantee one closed route and meaningful information for every node.
 */
export function generateLine13Game(
  seed: number,
  requestedNodeIds: readonly string[],
  now = Date.now(),
  preferredCourierNodeId?: string,
): Line13Game {
  const uniqueNodeIds = [...new Set(requestedNodeIds)].slice(0, 4);
  if (uniqueNodeIds.length < 2) throw new Error('LINE 13 requires at least two distinct nodes.');

  const random = new SeededRandom(seed);
  const route = random.shuffle(uniqueNodeIds);
  const ringingNodeId = route[random.integer(route.length)];
  const seededCourierNodeId = route[(route.indexOf(ringingNodeId) + 1) % route.length];
  const courierNodeId =
    preferredCourierNodeId && uniqueNodeIds.includes(preferredCourierNodeId)
      ? preferredCourierNodeId
      : seededCourierNodeId;
  const sourceNodeId = route[0];
  const cipher = random.shuffle(LINE_13_GLYPHS).slice(0, 4);
  const phase: SignalPhase = random.next() >= 0.5 ? 'SOLID' : 'BROKEN';
  const shuffledContacts = random.shuffle(FINAL_CONTACTS);
  const finalContacts = Object.fromEntries(
    route.map((nodeId, index) => [nodeId, shuffledContacts[index % shuffledContacts.length]]),
  );
  const transferCode = Array.from({ length: 4 }, () =>
    String(random.integer(10)),
  ).join('');
  const cipherFragments = distributeCipher(cipher, uniqueNodeIds, random);
  const decoder = createDecoder(random);
  const circuitOrder = random.shuffle(LINE_13_GLYPHS);
  const routeScraps = createCircuitScraps(uniqueNodeIds, circuitOrder, phase, random);
  const digitDecoder = createDigitDecoder(random);
  const decoderFragments = distributeDecoder(
    digitDecoder,
    cipherFragments,
    uniqueNodeIds,
    random,
  );
  const pin = cipher.map((glyph) => digitDecoder[glyph]).join('');
  const lensMarkers = createLensMarkers(
    seed,
    cipher,
    uniqueNodeIds,
    courierNodeId,
    random,
  );
  // The courier's last scan is the physical hand-off destination, so the
  // generated marker order and the role assignment can never contradict.
  const destinationNodeId = lensMarkers[lensMarkers.length - 1].ownerNodeId;

  return {
    seed,
    nodeIds: uniqueNodeIds,
    ringingNodeId,
    courierNodeId,
    sourceNodeId,
    destinationNodeId,
    cipher,
    cipherFragments,
    decoder,
    digitDecoder,
    decoderFragments,
    pin,
    lensMarkers,
    phase,
    route,
    circuitOrder,
    routeScraps,
    finalContacts,
    transferCode,
    futureTimestamp: now + 13 * 60 * 1_000,
  };
}

export function tiltSequence(game: Line13Game): readonly TiltGate[] {
  return game.cipher.map((glyph) => game.decoder[glyph]);
}

export function isCorrectRoute(game: Line13Game, attemptedRoute: readonly string[]): boolean {
  if (attemptedRoute.length !== game.route.length) return false;
  return attemptedRoute.every((nodeId, index) => nodeId === game.route[index]);
}

export function isCorrectCircuit(
  game: Line13Game,
  attemptedGlyphs: readonly Line13Glyph[],
): boolean {
  if (attemptedGlyphs.length !== game.circuitOrder.length) return false;
  return attemptedGlyphs.every((glyph, index) => glyph === game.circuitOrder[index]);
}

/** Compact proof sent to the host after the authored circuit was solved locally. */
export function line13RouteProof(game: Line13Game): string {
  return `R-${line13SeedFromCode(game.circuitOrder.join('>')).toString(36).toUpperCase()}`;
}

export function line13SeedFromCode(code: string): number {
  let hash = 2_166_136_261;
  for (const character of code.toUpperCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

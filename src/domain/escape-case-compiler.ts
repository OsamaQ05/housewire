import { LINE_13_GLYPHS, type Line13Glyph } from './line-13-game';
import type { Capability } from './types';

export type EscapeCaseId = 'dead-air' | 'night-glass' | 'long-table';
export type EscapeSeed = number | string;

export type ToneBand = 'LOW' | 'MID' | 'HIGH';
export type DuctId = 'I' | 'II' | 'III' | 'IV';
export type EnvelopeLevel = 'SOFT' | 'STRONG' | 'REST';
export type GrossPose = 'LEFT' | 'RIGHT' | 'AWAY' | 'TOWARD' | 'UPRIGHT' | 'FLAT';
export type Bearing = 'N' | 'E' | 'S' | 'W';
export type LongTableArtifactId =
  | 'BRASS KEY'
  | 'RECIPE CARD'
  | 'CASSETTE'
  | 'FILM CAMERA'
  | 'GAME PAD'
  | 'MOBILE';
export type PhotoAnchor = 'KEY' | 'CASSETTE' | 'CAMERA' | 'GAME PAD';
export type PhotoPosition = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';

export type EvidenceMode =
  | 'camera-qr'
  | 'rotating-seal'
  | 'voice-burst'
  | 'authored-token'
  | 'private-text'
  | 'microphone-level'
  | 'pressure-hold'
  | 'device-motion'
  | 'direction-hold'
  | 'camera-frame';

export interface EscapeCaseCompileOptions {
  /** A stable increment that produces a new case without changing the house seed. */
  replayIndex?: number;
  /** Omitted nodes are treated as fully capable; supplied nodes are capability-checked. */
  capabilitiesByNode?: Readonly<Record<string, readonly Capability[]>>;
}

export interface CapabilityFallbackPlan {
  id: string;
  stageId: string;
  assignedNodeIds: readonly string[];
  preferredCapability: Capability;
  selectedMode: 'preferred' | 'fallback';
  missingCapabilityNodeIds: readonly string[];
  preferredEvidenceMode: EvidenceMode;
  fallbackEvidenceMode: EvidenceMode;
  fallbackLabel: string;
  /** Fallbacks must produce the same semantic answer/proof, never skip a stage. */
  preservesSemanticProof: true;
}

export interface PrefixValidation {
  status: 'complete' | 'incomplete' | 'mismatch';
  acceptedPrefixLength: number;
  expectedLength: number;
  submittedLength: number;
}

export interface ProofValidation {
  accepted: boolean;
  code:
    | 'ACCEPTED'
    | 'INVALID_STAGE'
    | 'UNAUTHORIZED_SUBMITTER'
    | 'WRONG_PROOF_KIND'
    | 'WRONG_STAGE_ITEM'
    | 'WRONG_ACTOR'
    | 'WRONG_TARGET'
    | 'WRONG_TOKEN'
    | 'WRONG_VALUE'
    | 'MISSING_CONFIRMATION'
    | 'PAYLOAD_LEAK'
    | 'PAYLOAD_LIMIT'
    | 'TTL_LIMIT'
    | 'TIMING_WINDOW';
}

export type EscapeStageProofKind =
  | 'dead-air/duct-order'
  | 'dead-air/service-scan'
  | 'dead-air/whisper-round'
  | 'dead-air/echo-envelope'
  | 'dead-air/countertone'
  | 'night-glass/threshold'
  | 'night-glass/parallax-round'
  | 'night-glass/maze-path'
  | 'night-glass/anchor'
  | 'night-glass/finale'
  | 'long-table/seat-order'
  | 'long-table/photo-code'
  | 'long-table/keepsake'
  | 'long-table/pass-step'
  | 'long-table/finale';

export interface EscapeStageContract {
  id: string;
  index: number;
  proofKind: EscapeStageProofKind;
  /** Nodes whose private information or physical evidence is structurally necessary. */
  requiredNodeIds: readonly string[];
  /** Nodes allowed to submit the semantic proof to the host coordinator. */
  submitterNodeIds: readonly string[];
  /** Stable non-secret keys the coordinator must collect once each before advancing. */
  expectedProofKeys: readonly string[];
}

export type EscapeStageProof =
  | { kind: 'dead-air/duct-order'; value: readonly string[] }
  | { kind: 'dead-air/service-scan'; value: DeadAirServiceScanProof }
  | { kind: 'dead-air/whisper-round'; value: DeadAirWhisperProof }
  | { kind: 'dead-air/echo-envelope'; value: readonly EnvelopeLevel[] }
  | { kind: 'dead-air/countertone'; value: DeadAirCountertoneProof }
  | { kind: 'night-glass/threshold'; value: NightGlassPoseProof }
  | { kind: 'night-glass/parallax-round'; value: NightGlassParallaxProof }
  | { kind: 'night-glass/maze-path'; value: readonly number[] }
  | { kind: 'night-glass/anchor'; value: NightGlassAnchorProof }
  | { kind: 'night-glass/finale'; value: NightGlassPoseProof }
  | { kind: 'long-table/seat-order'; value: readonly LongTableArtifactId[] }
  | { kind: 'long-table/photo-code'; value: string }
  | { kind: 'long-table/keepsake'; value: LongTableKeepsakeProof }
  | { kind: 'long-table/pass-step'; value: LongTablePassProof }
  | { kind: 'long-table/finale'; value: LongTableFinaleProof };

export interface StageProofValidation extends ProofValidation {
  stageId?: string;
  proofKey?: string;
}

interface CompiledEscapeCaseBase {
  id: EscapeCaseId;
  version: 1;
  seed: EscapeSeed;
  replayIndex: number;
  effectiveSeed: number;
  nodeIds: readonly string[];
  recommendedPlayers: 3;
  stages: readonly EscapeStageContract[];
  capabilityFallbacks: readonly CapabilityFallbackPlan[];
}

export interface DeadAirDuctClue {
  subjectNodeId: string;
  clueOwnerNodeId: string;
  decoderOwnerNodeId: string;
  signature: readonly ToneBand[];
  duct: DuctId;
}

export interface DeadAirServiceScan {
  step: number;
  scannerNodeId: string;
  markerOwnerNodeId: string;
  corrosionDecoderOwnerNodeId: string;
  markerToken: string;
  candidates: readonly [Line13Glyph, Line13Glyph];
  liveValve: Line13Glyph;
}

export interface DeadAirWhisperRound {
  round: number;
  codeword: string;
  gate: DuctId;
  decodedGlyph: Line13Glyph;
}

export interface DeadAirEnvelopeMapping {
  glyph: Line13Glyph;
  level: EnvelopeLevel;
  decoderOwnerNodeId: string;
}

export interface DeadAirCountertoneBeat {
  beat: number;
  level: EnvelopeLevel;
  performerNodeIds: readonly string[];
}

export interface DeadAirCase extends CompiledEscapeCaseBase {
  id: 'dead-air';
  ductOrder: readonly string[];
  ductClues: readonly DeadAirDuctClue[];
  serviceScans: readonly DeadAirServiceScan[];
  valveSequence: readonly Line13Glyph[];
  privateChannel: {
    callerNodeId: string;
    receiverNodeId: string;
    tunerNodeId: string | null;
    excludedNodeIds: readonly string[];
    hasExcludedTuner: boolean;
    codewordClueOwnerNodeId: string;
    codewordDecoderOwnerNodeId: string;
    gateScheduleOwnerNodeId: string;
    rounds: readonly DeadAirWhisperRound[];
  };
  echoMatrix: {
    resonatorOrderOwnerNodeId: string;
    mirrorRuleOwnerNodeId: string;
    mappings: readonly DeadAirEnvelopeMapping[];
    envelope: readonly EnvelopeLevel[];
  };
  countertone: {
    vocalistNodeIds: readonly [string, string];
    tunerNodeId: string | null;
    tunerPose: GrossPose;
    windowMs: number;
    beats: readonly DeadAirCountertoneBeat[];
  };
}

export interface NightGlassThresholdAssignment {
  nodeId: string;
  pose: GrossPose;
}

export interface NightGlassParallaxRound {
  round: number;
  watcherNodeId: string;
  frameNodeId: string;
  hingeNodeId: string;
  targetClueOwnerNodeId: string;
  tiltDecoderOwnerNodeId: string;
  targetGlyph: Line13Glyph;
  requiredPose: GrossPose;
  revealedBearing: Bearing;
  markerToken: string;
}

export type MazeEdge = readonly [number, number];

export interface NightGlassMaze {
  width: 3;
  height: 3;
  cells: readonly number[];
  edges: readonly MazeEdge[];
  startCell: number;
  exitCell: number;
  path: readonly number[];
  wallLayerRotation: 0 | 90 | 180 | 270;
  roomLabelsOwnerNodeId: string;
  wallLayerOwnerNodeId: string;
  transformDecoderOwnerNodeId: string;
  startExitOwnerNodeId: string;
}

export interface NightGlassAnchorStep {
  step: number;
  courierNodeId: string;
  anchorOwnerNodeId: string;
  markerToken: string;
}

export interface NightGlassFinaleAssignment {
  nodeId: string;
  pose: GrossPose;
}

export interface NightGlassCase extends CompiledEscapeCaseBase {
  id: 'night-glass';
  threshold: {
    windowMs: number;
    assignments: readonly NightGlassThresholdAssignment[];
  };
  parallaxRounds: readonly NightGlassParallaxRound[];
  bearingSequence: readonly Bearing[];
  maze: NightGlassMaze;
  corridor: {
    courierNodeId: string;
    anchorSteps: readonly NightGlassAnchorStep[];
  };
  finale: {
    windowMs: number;
    assignments: readonly NightGlassFinaleAssignment[];
  };
}

export interface LongTableArtifact {
  id: LongTableArtifactId;
  era: number;
  ownerNodeId: string;
  clue: string;
  icon: 'key-outline' | 'document-text-outline' | 'musical-notes-outline' | 'camera-outline' | 'game-controller-outline' | 'phone-portrait-outline';
}

export interface LongTablePhotoFragment {
  anchor: PhotoAnchor;
  position: PhotoPosition;
  digit: number;
  ownerNodeId: string;
}

export interface LongTableKeepsakeAssignment {
  round: number;
  seekerNodeId: string;
  witnessNodeId: string;
  prompt: string;
  markerToken: string;
}

export interface LongTablePassStep {
  step: number;
  courierNodeId: string;
  stationOwnerNodeId: string;
  requiredPose: GrossPose;
  markerToken: string;
}

export interface LongTableFinaleAssignment {
  nodeId: string;
  pose: GrossPose;
  voiceLevel: EnvelopeLevel;
}

export interface LongTableCase extends CompiledEscapeCaseBase {
  id: 'long-table';
  tableCaptainNodeId: string;
  artifacts: readonly LongTableArtifact[];
  artifactOrder: readonly LongTableArtifactId[];
  placeWindowMs: number;
  photograph: {
    keeperNodeId: string;
    ruleOwnerNodeId: string;
    readOrder: readonly PhotoPosition[];
    fragments: readonly LongTablePhotoFragment[];
    code: string;
  };
  keepsakes: readonly LongTableKeepsakeAssignment[];
  serviceRoute: readonly LongTablePassStep[];
  finale: {
    windowMs: number;
    assignments: readonly LongTableFinaleAssignment[];
  };
}

export type CompiledEscapeCase = DeadAirCase | NightGlassCase | LongTableCase;

export interface DeadAirServiceScanProof {
  step: number;
  scannerNodeId: string;
  markerOwnerNodeId: string;
  markerToken: string;
  selectedValve: Line13Glyph;
  evidenceMode: 'camera-qr' | 'rotating-seal';
  ownerConfirmed: boolean;
}

export interface DeadAirWhisperProof {
  round: number;
  senderNodeId: string;
  recipientNodeId: string;
  gate: DuctId;
  acknowledgedCodeword: string;
  evidenceMode: 'voice-burst' | 'authored-token' | 'private-text';
  /** Exact playable clients that received content, not delivery metadata. */
  payloadRecipientNodeIds: readonly string[];
  payloadSizeBytes: number;
  ttlMs: number;
}

export interface DeadAirCountertoneProof {
  startedAt: number;
  completedAt: number;
  tunerNodeId: string | null;
  tunerPose: GrossPose;
  beats: readonly {
    beat: number;
    level: EnvelopeLevel;
    performerNodeIds: readonly string[];
    evidenceMode: 'microphone-level' | 'pressure-hold';
  }[];
}

export interface NightGlassPoseProof {
  startedAt: number;
  completedAt: number;
  contactsHeld: boolean;
  assignments: readonly {
    nodeId: string;
    pose: GrossPose;
    evidenceMode: 'device-motion' | 'direction-hold';
  }[];
}

export interface NightGlassParallaxProof {
  round: number;
  watcherNodeId: string;
  frameNodeId: string;
  hingeNodeId: string;
  markerToken: string;
  targetGlyph: Line13Glyph;
  hingePose: GrossPose;
  bearing: Bearing;
  cameraEvidenceMode: 'camera-qr' | 'rotating-seal';
  hingeEvidenceMode: 'device-motion' | 'direction-hold';
  frameOwnerConfirmed: boolean;
}

export interface NightGlassAnchorProof {
  step: number;
  courierNodeId: string;
  anchorOwnerNodeId: string;
  markerToken: string;
  cameraEvidenceMode: 'camera-qr' | 'rotating-seal';
  carryEvidenceMode: 'device-motion' | 'direction-hold';
  anchorOwnerConfirmed: boolean;
}

export interface LongTableKeepsakeProof {
  round: number;
  seekerNodeId: string;
  witnessNodeId: string;
  markerToken: string;
  framedInCamera: boolean;
  witnessConfirmed: boolean;
}

export interface LongTablePassProof {
  step: number;
  courierNodeId: string;
  stationOwnerNodeId: string;
  markerToken: string;
  requiredPose: GrossPose;
  cameraEvidenceMode: 'camera-qr' | 'rotating-seal';
  motionEvidenceMode: 'device-motion' | 'direction-hold';
  stationOwnerConfirmed: boolean;
}

export interface LongTableFinaleProof {
  startedAt: number;
  completedAt: number;
  contactsHeld: boolean;
  assignments: readonly {
    nodeId: string;
    pose: GrossPose;
    voiceLevel: EnvelopeLevel;
    motionEvidenceMode: 'device-motion' | 'direction-hold';
    voiceEvidenceMode: 'microphone-level' | 'pressure-hold';
  }[];
}

const DUCT_IDS = ['I', 'II', 'III', 'IV'] as const satisfies readonly DuctId[];
const TONE_SIGNATURES = [
  ['LOW', 'HIGH', 'MID'],
  ['MID', 'LOW', 'HIGH'],
  ['HIGH', 'MID', 'LOW'],
  ['LOW', 'MID', 'HIGH'],
  ['HIGH', 'LOW', 'MID'],
  ['MID', 'HIGH', 'LOW'],
] as const satisfies readonly (readonly ToneBand[])[];
const CODEWORDS = [
  'EMBER',
  'HOLLOW',
  'SEVEN',
  'RIVER',
  'LANTERN',
  'COPPER',
  'WINDOW',
  'ORBIT',
] as const;
const HINGE_POSES = ['LEFT', 'RIGHT', 'AWAY', 'TOWARD'] as const satisfies readonly GrossPose[];
const ALL_POSES = [
  'LEFT',
  'RIGHT',
  'AWAY',
  'TOWARD',
  'UPRIGHT',
  'FLAT',
] as const satisfies readonly GrossPose[];
const BEARINGS = ['N', 'E', 'S', 'W'] as const satisfies readonly Bearing[];
const PHOTO_POSITIONS = ['NORTH', 'EAST', 'SOUTH', 'WEST'] as const satisfies readonly PhotoPosition[];
const LONG_TABLE_ARTIFACTS = [
  { id: 'BRASS KEY', era: 1964, clue: 'Cut before screens had locks. It opened a door, never an app.', icon: 'key-outline' },
  { id: 'RECIPE CARD', era: 1976, clue: 'Stained by hands, copied by memory, revised in the margin.', icon: 'document-text-outline' },
  { id: 'CASSETTE', era: 1987, clue: 'Its music had two sides and a pencil could rescue it.', icon: 'musical-notes-outline' },
  { id: 'FILM CAMERA', era: 1995, clue: 'It counted moments before anyone could preview them.', icon: 'camera-outline' },
  { id: 'GAME PAD', era: 2003, clue: 'Two thumbs learned its map before touchscreens arrived.', icon: 'game-controller-outline' },
  { id: 'MOBILE', era: 2012, clue: 'The youngest object swallowed the jobs of all the others.', icon: 'phone-portrait-outline' },
] as const satisfies readonly Omit<LongTableArtifact, 'ownerNodeId'>[];
const KEEPSAKE_PROMPTS = [
  'Find something at least two people here have used.',
  'Find something repaired instead of replaced.',
  'Find something that came from another home.',
  'Find something that has outlived one of your phones.',
  'Find something everyone recognizes but nobody labels.',
  'Find something that only makes sense in this household.',
] as const;

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0xdead_a117;
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
    if (maximumExclusive <= 0) throw new Error('Random range must be positive.');
    return Math.floor(this.next() * maximumExclusive);
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

export function escapeCaseSeedFromCode(code: string): number {
  let hash = 2_166_136_261;
  for (const character of code.toUpperCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function effectiveSeed(caseId: EscapeCaseId, seed: EscapeSeed, replayIndex: number): number {
  return escapeCaseSeedFromCode(`${caseId}:${String(seed)}:REPLAY:${replayIndex}`);
}

function normalizedNodes(requestedNodeIds: readonly string[]): readonly string[] {
  const nodeIds = [...new Set(requestedNodeIds.map((nodeId) => nodeId.trim()))].filter(Boolean);
  if (nodeIds.length !== requestedNodeIds.length) {
    throw new Error('Escape cases require distinct, non-empty node ids.');
  }
  if (nodeIds.length < 2 || nodeIds.length > 4) {
    throw new Error('Escape cases require two to four nodes.');
  }
  return nodeIds;
}

function normalizedReplayIndex(value: number | undefined): number {
  const replayIndex = value ?? 0;
  if (!Number.isInteger(replayIndex) || replayIndex < 0) {
    throw new Error('Replay index must be a non-negative integer.');
  }
  return replayIndex;
}

function token(prefix: string, effectiveCaseSeed: number, position: number, value: string): string {
  const tokenHash = escapeCaseSeedFromCode(
    `${prefix}:${effectiveCaseSeed >>> 0}:${position}:${value}`,
  )
    .toString(36)
    .toUpperCase()
    .padStart(7, '0');
  return `${prefix}-${position}-${tokenHash}`;
}

function capabilityFallback(
  options: EscapeCaseCompileOptions,
  id: string,
  stageId: string,
  assignedNodeIds: readonly string[],
  preferredCapability: Capability,
  preferredEvidenceMode: EvidenceMode,
  fallbackEvidenceMode: EvidenceMode,
  fallbackLabel: string,
): CapabilityFallbackPlan {
  const missingCapabilityNodeIds = assignedNodeIds.filter((nodeId) => {
    const declared = options.capabilitiesByNode?.[nodeId];
    return declared !== undefined && !declared.includes(preferredCapability);
  });
  return {
    id,
    stageId,
    assignedNodeIds,
    preferredCapability,
    selectedMode: missingCapabilityNodeIds.length === 0 ? 'preferred' : 'fallback',
    missingCapabilityNodeIds,
    preferredEvidenceMode,
    fallbackEvidenceMode,
    fallbackLabel,
    preservesSemanticProof: true,
  };
}

function ownerAwayFrom(
  subjectNodeId: string,
  orderedNodeIds: readonly string[],
  offset = 1,
): string {
  const subjectIndex = orderedNodeIds.indexOf(subjectNodeId);
  return orderedNodeIds[(subjectIndex + Math.max(1, offset)) % orderedNodeIds.length];
}

function sameMembers(first: readonly string[], second: readonly string[]): boolean {
  if (first.length !== second.length) return false;
  const counts = new Map<string, number>();
  for (const value of first) counts.set(value, (counts.get(value) ?? 0) + 1);
  for (const value of second) {
    const count = counts.get(value) ?? 0;
    if (count === 0) return false;
    if (count === 1) counts.delete(value);
    else counts.set(value, count - 1);
  }
  return counts.size === 0;
}

function uniqueNodeIds(values: readonly (string | null)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

export function validateOrderedAttempt<T>(
  expected: readonly T[],
  submitted: readonly T[],
): PrefixValidation {
  const sharedLength = Math.min(expected.length, submitted.length);
  let acceptedPrefixLength = 0;
  while (
    acceptedPrefixLength < sharedLength &&
    Object.is(expected[acceptedPrefixLength], submitted[acceptedPrefixLength])
  ) {
    acceptedPrefixLength += 1;
  }

  const mismatch =
    acceptedPrefixLength < sharedLength ||
    (submitted.length > expected.length && acceptedPrefixLength === expected.length);
  return {
    status: mismatch
      ? 'mismatch'
      : submitted.length === expected.length
        ? 'complete'
        : 'incomplete',
    acceptedPrefixLength,
    expectedLength: expected.length,
    submittedLength: submitted.length,
  };
}

function proofAccepted(): ProofValidation {
  return { accepted: true, code: 'ACCEPTED' };
}

function proofRejected(code: Exclude<ProofValidation['code'], 'ACCEPTED'>): ProofValidation {
  return { accepted: false, code };
}

export function compileDeadAirCase(
  seed: EscapeSeed,
  requestedNodeIds: readonly string[],
  options: EscapeCaseCompileOptions = {},
): DeadAirCase {
  const nodeIds = normalizedNodes(requestedNodeIds);
  const replayIndex = normalizedReplayIndex(options.replayIndex);
  const caseSeed = effectiveSeed('dead-air', seed, replayIndex);
  const random = new SeededRandom(caseSeed);
  const ductOrder = random.shuffle(nodeIds);
  const signatures = random.shuffle(TONE_SIGNATURES).slice(0, nodeIds.length);

  const ductClues = ductOrder.map((subjectNodeId, index): DeadAirDuctClue => ({
    subjectNodeId,
    clueOwnerNodeId: subjectNodeId,
    decoderOwnerNodeId: ownerAwayFrom(subjectNodeId, ductOrder),
    signature: signatures[index],
    duct: DUCT_IDS[index],
  }));

  const liveValves = random.shuffle(LINE_13_GLYPHS).slice(0, nodeIds.length);
  const decoyOrder = random.shuffle(LINE_13_GLYPHS);
  const serviceScans = ductOrder.map((scannerNodeId, index): DeadAirServiceScan => {
    const markerOwnerNodeId = ductOrder[(index + 1) % ductOrder.length];
    const corrosionDecoderOwnerNodeId =
      nodeIds.length >= 3
        ? ductOrder[(index + 2) % ductOrder.length]
        : markerOwnerNodeId;
    const liveValve = liveValves[index];
    const decoyValve =
      decoyOrder.find((glyph) => glyph !== liveValve && !liveValves.includes(glyph)) ??
      decoyOrder.find((glyph) => glyph !== liveValve) ??
      LINE_13_GLYPHS[(LINE_13_GLYPHS.indexOf(liveValve) + 1) % LINE_13_GLYPHS.length];
    const candidates = random.next() >= 0.5
      ? ([liveValve, decoyValve] as const)
      : ([decoyValve, liveValve] as const);
    return {
      step: index + 1,
      scannerNodeId,
      markerOwnerNodeId,
      corrosionDecoderOwnerNodeId,
      markerToken: token('HW-DA-PLATE', caseSeed, index + 1, liveValve),
      candidates,
      liveValve,
    };
  });

  const privateRoleOrder = random.shuffle(nodeIds);
  const callerNodeId = privateRoleOrder[0];
  const receiverNodeId = privateRoleOrder[1];
  const excludedNodeIds = privateRoleOrder.slice(2);
  const tunerNodeId = excludedNodeIds[0] ?? null;
  const words = random.shuffle(CODEWORDS).slice(0, 4);
  const decodedGlyphs = random.shuffle(LINE_13_GLYPHS).slice(0, 4);
  const gateOrder = random.shuffle(DUCT_IDS.slice(0, nodeIds.length));
  const whisperRounds = words.map((codeword, index): DeadAirWhisperRound => ({
    round: index + 1,
    codeword,
    gate: gateOrder[index % gateOrder.length],
    decodedGlyph: decodedGlyphs[index],
  }));

  const baseEnvelope = random.shuffle<EnvelopeLevel>(['SOFT', 'STRONG', 'REST', 'SOFT']);
  // With two phones the receiver already owns the resonator order. Put the
  // pressure map on the caller so neither player can solve the matrix alone.
  // Larger crews continue to keep mappings away from the caller, preserving
  // that player's private-channel responsibility while spreading the decode.
  const mappingOwnerCandidates =
    nodeIds.length === 2
      ? [callerNodeId]
      : nodeIds.filter((nodeId) => nodeId !== callerNodeId);
  const mappingOwnerOrder = random.shuffle(mappingOwnerCandidates);
  const envelopeMappings = whisperRounds.map((round, index): DeadAirEnvelopeMapping => ({
    glyph: round.decodedGlyph,
    level: baseEnvelope[index],
    decoderOwnerNodeId: mappingOwnerOrder[index % mappingOwnerOrder.length],
  }));
  const vocalistNodeIds = [callerNodeId, receiverNodeId] as const;
  const countertoneBeats = baseEnvelope.map((level, index): DeadAirCountertoneBeat => ({
    beat: index + 1,
    level,
    performerNodeIds:
      level === 'REST'
        ? []
        : index === baseEnvelope.length - 1
          ? vocalistNodeIds
          : [vocalistNodeIds[index % vocalistNodeIds.length]],
  }));
  const tunerPose = random.shuffle(HINGE_POSES)[0];

  const cameraNodes = serviceScans.map((scan) => scan.scannerNodeId);
  const countertoneNodes = [...vocalistNodeIds];
  if (tunerNodeId) countertoneNodes.push(tunerNodeId);
  const capabilityFallbacks: CapabilityFallbackPlan[] = [
    capabilityFallback(
      options,
      'dead-air/service-plates-camera',
      'service-plates',
      cameraNodes,
      'cameraQr',
      'camera-qr',
      'rotating-seal',
      'Read the rotating seal aloud and require its owner to confirm it.',
    ),
    capabilityFallback(
      options,
      'dead-air/private-channel-microphone',
      'service-pair',
      [callerNodeId],
      'microphoneLevel',
      'voice-burst',
      'authored-token',
      'Send the authored codeword token through the same targeted channel.',
    ),
    capabilityFallback(
      options,
      'dead-air/countertone-meter',
      'countertone',
      vocalistNodeIds,
      'microphoneLevel',
      'microphone-level',
      'pressure-hold',
      'Reproduce the same pressure envelope with deliberate holds.',
    ),
    capabilityFallback(
      options,
      'dead-air/countertone-tuner',
      'countertone',
      tunerNodeId ? [tunerNodeId] : [receiverNodeId],
      'orientation',
      'device-motion',
      'direction-hold',
      'Hold the matching contact plate for the full countertone window.',
    ),
  ];
  const serviceRequiredNodeIds = uniqueNodeIds(
    serviceScans.flatMap((scan) => [
      scan.scannerNodeId,
      scan.markerOwnerNodeId,
      scan.corrosionDecoderOwnerNodeId,
    ]),
  );
  const privateChannelRequiredNodeIds = uniqueNodeIds([
    callerNodeId,
    receiverNodeId,
    tunerNodeId,
  ]);
  const echoMatrixRequiredNodeIds = uniqueNodeIds([
    receiverNodeId,
    tunerNodeId ?? callerNodeId,
    ...envelopeMappings.map((mapping) => mapping.decoderOwnerNodeId),
  ]);
  const stages: readonly EscapeStageContract[] = [
    {
      id: 'three-ducts',
      index: 0,
      proofKind: 'dead-air/duct-order',
      requiredNodeIds: nodeIds,
      submitterNodeIds: nodeIds,
      expectedProofKeys: ['duct-order'],
    },
    {
      id: 'service-plates',
      index: 1,
      proofKind: 'dead-air/service-scan',
      requiredNodeIds: serviceRequiredNodeIds,
      submitterNodeIds: uniqueNodeIds(serviceScans.map((scan) => scan.scannerNodeId)),
      expectedProofKeys: serviceScans.map((scan) => `service-scan:${scan.step}`),
    },
    {
      id: 'service-pair',
      index: 2,
      proofKind: 'dead-air/whisper-round',
      requiredNodeIds: privateChannelRequiredNodeIds,
      submitterNodeIds: [receiverNodeId],
      expectedProofKeys: whisperRounds.map((round) => `whisper:${round.round}`),
    },
    {
      id: 'echo-matrix',
      index: 3,
      proofKind: 'dead-air/echo-envelope',
      requiredNodeIds: echoMatrixRequiredNodeIds,
      submitterNodeIds: echoMatrixRequiredNodeIds,
      expectedProofKeys: ['echo-envelope'],
    },
    {
      id: 'countertone',
      index: 4,
      proofKind: 'dead-air/countertone',
      requiredNodeIds: uniqueNodeIds(countertoneNodes),
      submitterNodeIds: uniqueNodeIds(countertoneNodes),
      expectedProofKeys: ['countertone'],
    },
  ];

  return {
    id: 'dead-air',
    version: 1,
    seed,
    replayIndex,
    effectiveSeed: caseSeed,
    nodeIds,
    recommendedPlayers: 3,
    stages,
    capabilityFallbacks,
    ductOrder,
    ductClues,
    serviceScans,
    valveSequence: serviceScans.map((scan) => scan.liveValve),
    privateChannel: {
      callerNodeId,
      receiverNodeId,
      tunerNodeId,
      excludedNodeIds,
      hasExcludedTuner: tunerNodeId !== null,
      codewordClueOwnerNodeId: callerNodeId,
      codewordDecoderOwnerNodeId: receiverNodeId,
      gateScheduleOwnerNodeId: tunerNodeId ?? callerNodeId,
      rounds: whisperRounds,
    },
    echoMatrix: {
      resonatorOrderOwnerNodeId: receiverNodeId,
      mirrorRuleOwnerNodeId: tunerNodeId ?? callerNodeId,
      mappings: envelopeMappings,
      envelope: baseEnvelope,
    },
    countertone: {
      vocalistNodeIds,
      tunerNodeId,
      tunerPose,
      windowMs: 5_000,
      beats: countertoneBeats,
    },
  };
}

function orthogonalNeighbors(cell: number): readonly number[] {
  const zeroIndex = cell - 1;
  const row = Math.floor(zeroIndex / 3);
  const column = zeroIndex % 3;
  const neighbors: number[] = [];
  if (row > 0) neighbors.push(cell - 3);
  if (column < 2) neighbors.push(cell + 1);
  if (row < 2) neighbors.push(cell + 3);
  if (column > 0) neighbors.push(cell - 1);
  return neighbors;
}

function canonicalEdge(first: number, second: number): MazeEdge {
  return first < second ? [first, second] : [second, first];
}

function edgeKey(edge: MazeEdge): string {
  return `${edge[0]}:${edge[1]}`;
}

function adjacencyFromEdges(edges: readonly MazeEdge[]): ReadonlyMap<number, readonly number[]> {
  const adjacency = new Map<number, number[]>();
  for (let cell = 1; cell <= 9; cell += 1) adjacency.set(cell, []);
  for (const [first, second] of edges) {
    adjacency.get(first)?.push(second);
    adjacency.get(second)?.push(first);
  }
  return adjacency;
}

function shortestPath(
  edges: readonly MazeEdge[],
  startCell: number,
  exitCell: number,
): readonly number[] {
  const adjacency = adjacencyFromEdges(edges);
  const queue = [startCell];
  const previous = new Map<number, number | null>([[startCell, null]]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    if (current === exitCell) break;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (previous.has(neighbor)) continue;
      previous.set(neighbor, current);
      queue.push(neighbor);
    }
  }
  if (!previous.has(exitCell)) throw new Error('Generated maze is disconnected.');
  const path: number[] = [];
  let cursor: number | null = exitCell;
  while (cursor !== null) {
    path.push(cursor);
    cursor = previous.get(cursor) ?? null;
  }
  return path.reverse();
}

function generatedPerfectMaze(random: SeededRandom): {
  edges: readonly MazeEdge[];
  startCell: number;
  exitCell: number;
  path: readonly number[];
} {
  const initialCell = 1 + random.integer(9);
  const visited = new Set<number>([initialCell]);
  const stack = [initialCell];
  const edges: MazeEdge[] = [];
  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const candidates = random
      .shuffle(orthogonalNeighbors(current))
      .filter((neighbor) => !visited.has(neighbor));
    const next = candidates[0];
    if (next === undefined) {
      stack.pop();
      continue;
    }
    visited.add(next);
    edges.push(canonicalEdge(current, next));
    stack.push(next);
  }

  let bestPath: readonly number[] = [];
  const tiedDiameters: (readonly number[])[] = [];
  for (let first = 1; first <= 9; first += 1) {
    for (let second = first + 1; second <= 9; second += 1) {
      const path = shortestPath(edges, first, second);
      if (path.length > bestPath.length) {
        bestPath = path;
        tiedDiameters.length = 0;
        tiedDiameters.push(path);
      } else if (path.length === bestPath.length) {
        tiedDiameters.push(path);
      }
    }
  }
  const selectedPath = random.shuffle(tiedDiameters)[0];
  return {
    edges: [...edges].sort((first, second) => edgeKey(first).localeCompare(edgeKey(second))),
    startCell: selectedPath[0],
    exitCell: selectedPath[selectedPath.length - 1],
    path: selectedPath,
  };
}

export function compileNightGlassCase(
  seed: EscapeSeed,
  requestedNodeIds: readonly string[],
  options: EscapeCaseCompileOptions = {},
): NightGlassCase {
  const nodeIds = normalizedNodes(requestedNodeIds);
  const replayIndex = normalizedReplayIndex(options.replayIndex);
  const caseSeed = effectiveSeed('night-glass', seed, replayIndex);
  const random = new SeededRandom(caseSeed);
  const roleOrder = random.shuffle(nodeIds);

  const thresholdPoses = random.shuffle(ALL_POSES).slice(0, nodeIds.length);
  const thresholdAssignments = nodeIds.map((nodeId, index): NightGlassThresholdAssignment => ({
    nodeId,
    pose: thresholdPoses[index],
  }));

  const targetGlyphs = random.shuffle(LINE_13_GLYPHS).slice(0, 3);
  const requiredPoses = random.shuffle(HINGE_POSES).slice(0, 3);
  const revealedBearings = random.shuffle(BEARINGS).slice(0, 3);
  const parallaxRounds = Array.from({ length: 3 }, (_, index): NightGlassParallaxRound => {
    const watcherNodeId = roleOrder[index % roleOrder.length];
    const frameNodeId = roleOrder[(index + 1) % roleOrder.length];
    const hingeNodeId =
      nodeIds.length === 2
        ? frameNodeId
        : roleOrder[(index + 2) % roleOrder.length];
    const targetClueOwnerNodeId = nodeIds.length === 2 ? watcherNodeId : frameNodeId;
    return {
      round: index + 1,
      watcherNodeId,
      frameNodeId,
      hingeNodeId,
      targetClueOwnerNodeId,
      tiltDecoderOwnerNodeId: hingeNodeId,
      targetGlyph: targetGlyphs[index],
      requiredPose: requiredPoses[index],
      revealedBearing: revealedBearings[index],
      markerToken: token('HW-NG-FRAME', caseSeed, index + 1, targetGlyphs[index]),
    };
  });

  const generatedMaze = generatedPerfectMaze(random);
  const mazeOwnerOrder = random.shuffle(nodeIds);
  const wallLayerOwnerNodeId = mazeOwnerOrder[1 % mazeOwnerOrder.length];
  const transformDecoderOwnerNodeId =
    nodeIds.length >= 3
      ? mazeOwnerOrder[2 % mazeOwnerOrder.length]
      : mazeOwnerOrder[0];
  const rotationOptions = [0, 90, 180, 270] as const;
  const bearingHash = revealedBearings.reduce(
    (sum, bearing) => sum + BEARINGS.indexOf(bearing) + 1,
    0,
  );
  const wallLayerRotation = rotationOptions[(bearingHash + random.integer(4)) % 4];
  const maze: NightGlassMaze = {
    width: 3,
    height: 3,
    cells: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    edges: generatedMaze.edges,
    startCell: generatedMaze.startCell,
    exitCell: generatedMaze.exitCell,
    path: generatedMaze.path,
    wallLayerRotation,
    roomLabelsOwnerNodeId: mazeOwnerOrder[0],
    wallLayerOwnerNodeId,
    transformDecoderOwnerNodeId,
    startExitOwnerNodeId: mazeOwnerOrder[3 % mazeOwnerOrder.length],
  };

  const courierNodeId = random.shuffle(nodeIds)[0];
  const availableAnchors = random.shuffle(nodeIds.filter((nodeId) => nodeId !== courierNodeId));
  const anchorSteps = Array.from({ length: 3 }, (_, index): NightGlassAnchorStep => {
    const anchorOwnerNodeId = availableAnchors[index % availableAnchors.length];
    return {
      step: index + 1,
      courierNodeId,
      anchorOwnerNodeId,
      markerToken: token('HW-NG-DOOR', caseSeed, index + 1, String(maze.path[index + 1] ?? maze.exitCell)),
    };
  });

  const finalePoses = random.shuffle(ALL_POSES).slice(0, nodeIds.length);
  const finaleAssignments = nodeIds.map((nodeId, index): NightGlassFinaleAssignment => ({
    nodeId,
    pose: finalePoses[index],
  }));
  const parallaxWatchers = parallaxRounds.map((round) => round.watcherNodeId);
  const parallaxHinges = parallaxRounds.map((round) => round.hingeNodeId);
  const capabilityFallbacks: CapabilityFallbackPlan[] = [
    capabilityFallback(
      options,
      'night-glass/threshold-orientation',
      'draw-threshold',
      nodeIds,
      'orientation',
      'device-motion',
      'direction-hold',
      'Hold the matching contact plate through the same sync window.',
    ),
    capabilityFallback(
      options,
      'night-glass/parallax-camera',
      'parallax-doors',
      parallaxWatchers,
      'cameraQr',
      'camera-qr',
      'rotating-seal',
      'Enter the rotating frame seal and require the frame owner to confirm.',
    ),
    capabilityFallback(
      options,
      'night-glass/parallax-hinge',
      'parallax-doors',
      parallaxHinges,
      'orientation',
      'device-motion',
      'direction-hold',
      'Hold the hinge contact until the watcher confirms the bearing.',
    ),
    capabilityFallback(
      options,
      'night-glass/corridor-lens',
      'walk-corridor',
      [courierNodeId],
      'cameraQr',
      'camera-qr',
      'rotating-seal',
      'At each stopped station, enter its rotating seal and await owner confirmation.',
    ),
    capabilityFallback(
      options,
      'night-glass/corridor-carry',
      'walk-corridor',
      [courierNodeId],
      'motion',
      'device-motion',
      'direction-hold',
      'Hold the courier contact before walking and release it only after stopping.',
    ),
    capabilityFallback(
      options,
      'night-glass/finale-orientation',
      'fold-corridor',
      nodeIds,
      'orientation',
      'device-motion',
      'direction-hold',
      'Hold each assigned contact inside the same finale window.',
    ),
  ];
  const parallaxRequiredNodeIds = uniqueNodeIds(
    parallaxRounds.flatMap((round) => [
      round.watcherNodeId,
      round.frameNodeId,
      round.hingeNodeId,
      round.targetClueOwnerNodeId,
      round.tiltDecoderOwnerNodeId,
    ]),
  );
  const mazeRequiredNodeIds = uniqueNodeIds([
    maze.roomLabelsOwnerNodeId,
    maze.wallLayerOwnerNodeId,
    maze.transformDecoderOwnerNodeId,
    maze.startExitOwnerNodeId,
  ]);
  const corridorRequiredNodeIds = uniqueNodeIds([
    courierNodeId,
    ...anchorSteps.map((step) => step.anchorOwnerNodeId),
  ]);
  const stages: readonly EscapeStageContract[] = [
    {
      id: 'draw-threshold',
      index: 0,
      proofKind: 'night-glass/threshold',
      requiredNodeIds: nodeIds,
      submitterNodeIds: nodeIds,
      expectedProofKeys: ['threshold'],
    },
    {
      id: 'parallax-doors',
      index: 1,
      proofKind: 'night-glass/parallax-round',
      requiredNodeIds: parallaxRequiredNodeIds,
      submitterNodeIds: uniqueNodeIds(parallaxRounds.map((round) => round.watcherNodeId)),
      expectedProofKeys: parallaxRounds.map((round) => `parallax:${round.round}`),
    },
    {
      id: 'impossible-floorplan',
      index: 2,
      proofKind: 'night-glass/maze-path',
      requiredNodeIds: mazeRequiredNodeIds,
      submitterNodeIds: mazeRequiredNodeIds,
      expectedProofKeys: ['maze-path'],
    },
    {
      id: 'walk-corridor',
      index: 3,
      proofKind: 'night-glass/anchor',
      requiredNodeIds: corridorRequiredNodeIds,
      submitterNodeIds: [courierNodeId],
      expectedProofKeys: anchorSteps.map((step) => `anchor:${step.step}`),
    },
    {
      id: 'fold-corridor',
      index: 4,
      proofKind: 'night-glass/finale',
      requiredNodeIds: nodeIds,
      submitterNodeIds: nodeIds,
      expectedProofKeys: ['finale'],
    },
  ];

  return {
    id: 'night-glass',
    version: 1,
    seed,
    replayIndex,
    effectiveSeed: caseSeed,
    nodeIds,
    recommendedPlayers: 3,
    stages,
    capabilityFallbacks,
    threshold: {
      windowMs: 2_500,
      assignments: thresholdAssignments,
    },
    parallaxRounds,
    bearingSequence: parallaxRounds.map((round) => round.revealedBearing),
    maze,
    corridor: {
      courierNodeId,
      anchorSteps,
    },
    finale: {
      windowMs: 2_400,
      assignments: finaleAssignments,
    },
  };
}

export function compileLongTableCase(
  seed: EscapeSeed,
  requestedNodeIds: readonly string[],
  options: EscapeCaseCompileOptions = {},
): LongTableCase {
  const nodeIds = normalizedNodes(requestedNodeIds);
  const replayIndex = normalizedReplayIndex(options.replayIndex);
  const caseSeed = effectiveSeed('long-table', seed, replayIndex);
  const random = new SeededRandom(caseSeed);
  const roleOrder = random.shuffle(nodeIds);
  const artifactTemplates = random
    .shuffle(LONG_TABLE_ARTIFACTS)
    .slice(0, 4)
    .sort((left, right) => left.era - right.era);
  const artifactOwners = random.shuffle([
    ...nodeIds,
    ...random.shuffle(nodeIds).slice(0, artifactTemplates.length - nodeIds.length),
  ]);
  const artifacts = artifactTemplates.map((artifact, index): LongTableArtifact => ({
    ...artifact,
    ownerNodeId: artifactOwners[index],
  }));
  const artifactOrder = artifacts.map((artifact) => artifact.id);
  const tableCaptainNodeId = roleOrder[0];

  const fragmentDigits = random.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4);
  const fragmentOwners = random.shuffle([
    ...nodeIds,
    ...random.shuffle(nodeIds).slice(0, 4 - nodeIds.length),
  ]);
  const fragments = (['KEY', 'CASSETTE', 'CAMERA', 'GAME PAD'] as const).map(
    (anchor, index): LongTablePhotoFragment => ({
      anchor,
      position: PHOTO_POSITIONS[index],
      digit: fragmentDigits[index],
      ownerNodeId: fragmentOwners[index],
    }),
  );
  const readOrder = random.shuffle(PHOTO_POSITIONS);
  const code = readOrder
    .map((position) => fragments.find((fragment) => fragment.position === position)?.digit ?? 0)
    .join('');
  const keeperNodeId = roleOrder[1 % roleOrder.length];
  const ruleOwnerNodeId = roleOrder[2 % roleOrder.length];

  const promptOrder = random.shuffle(KEEPSAKE_PROMPTS);
  const keepsakes = roleOrder.map((seekerNodeId, index): LongTableKeepsakeAssignment => {
    const witnessNodeId = roleOrder[(index + 1) % roleOrder.length];
    return {
      round: index + 1,
      seekerNodeId,
      witnessNodeId,
      prompt: promptOrder[index],
      markerToken: token('HW-LT-KEPT', caseSeed, index + 1, seekerNodeId),
    };
  });

  const poseOrder = random.shuffle(HINGE_POSES);
  const serviceRoute = artifactOrder.slice(0, nodeIds.length).map((artifactId, index): LongTablePassStep => {
    const courierNodeId = roleOrder[index];
    const stationOwnerNodeId = roleOrder[(index + 1) % roleOrder.length];
    return {
      step: index + 1,
      courierNodeId,
      stationOwnerNodeId,
      requiredPose: poseOrder[index % poseOrder.length],
      markerToken: token('HW-LT-PASS', caseSeed, index + 1, artifactId),
    };
  });

  const finalePoses = random.shuffle(ALL_POSES).slice(0, nodeIds.length);
  const finaleLevels = random.shuffle<EnvelopeLevel>(['REST', 'SOFT', 'STRONG', 'SOFT']);
  const finaleAssignments = nodeIds.map((nodeId, index): LongTableFinaleAssignment => ({
    nodeId,
    pose: finalePoses[index],
    voiceLevel: finaleLevels[index],
  }));

  const capabilityFallbacks: CapabilityFallbackPlan[] = [
    capabilityFallback(
      options,
      'long-table/place-orientation',
      'take-your-places',
      nodeIds,
      'orientation',
      'device-motion',
      'direction-hold',
      'Hold the place contact while every phone settles on the table.',
    ),
    capabilityFallback(
      options,
      'long-table/keepsake-camera',
      'what-the-house-kept',
      keepsakes.map((assignment) => assignment.seekerNodeId),
      'cameraQr',
      'camera-frame',
      'rotating-seal',
      'Inspect the object in person, then use its signed keepsake seal.',
    ),
    capabilityFallback(
      options,
      'long-table/service-pass-camera',
      'run-the-pass',
      serviceRoute.map((step) => step.courierNodeId),
      'cameraQr',
      'camera-qr',
      'rotating-seal',
      'Read the destination seal aloud after reaching the correct person.',
    ),
    capabilityFallback(
      options,
      'long-table/finale-voice',
      'last-bell',
      finaleAssignments.filter((assignment) => assignment.voiceLevel !== 'REST').map((assignment) => assignment.nodeId),
      'microphoneLevel',
      'microphone-level',
      'pressure-hold',
      'Use the matching voice-pressure contact on the final beat.',
    ),
  ];

  const stageContracts: readonly EscapeStageContract[] = [
    {
      id: 'take-your-places',
      index: 0,
      proofKind: 'long-table/seat-order',
      requiredNodeIds: nodeIds,
      submitterNodeIds: nodeIds,
      expectedProofKeys: ['seat-order'],
    },
    {
      id: 'stolen-photograph',
      index: 1,
      proofKind: 'long-table/photo-code',
      requiredNodeIds: uniqueNodeIds([
        keeperNodeId,
        ruleOwnerNodeId,
        ...fragments.map((fragment) => fragment.ownerNodeId),
      ]),
      submitterNodeIds: [keeperNodeId],
      expectedProofKeys: ['photo-code'],
    },
    {
      id: 'what-the-house-kept',
      index: 2,
      proofKind: 'long-table/keepsake',
      requiredNodeIds: nodeIds,
      submitterNodeIds: uniqueNodeIds(keepsakes.map((assignment) => assignment.witnessNodeId)),
      expectedProofKeys: keepsakes.map((assignment) => `keepsake:${assignment.round}`),
    },
    {
      id: 'run-the-pass',
      index: 3,
      proofKind: 'long-table/pass-step',
      requiredNodeIds: nodeIds,
      submitterNodeIds: uniqueNodeIds(serviceRoute.map((step) => step.courierNodeId)),
      expectedProofKeys: serviceRoute.map((step) => `pass:${step.step}`),
    },
    {
      id: 'last-bell',
      index: 4,
      proofKind: 'long-table/finale',
      requiredNodeIds: nodeIds,
      submitterNodeIds: nodeIds,
      expectedProofKeys: ['last-bell'],
    },
  ];

  return {
    id: 'long-table',
    version: 1,
    seed,
    replayIndex,
    effectiveSeed: caseSeed,
    nodeIds,
    recommendedPlayers: 3,
    stages: stageContracts,
    capabilityFallbacks,
    tableCaptainNodeId,
    artifacts,
    artifactOrder,
    placeWindowMs: 8_000,
    photograph: {
      keeperNodeId,
      ruleOwnerNodeId,
      readOrder,
      fragments,
      code,
    },
    keepsakes,
    serviceRoute,
    finale: {
      windowMs: 8_000,
      assignments: finaleAssignments,
    },
  };
}

export function compileEscapeCase(
  caseId: EscapeCaseId,
  seed: EscapeSeed,
  nodeIds: readonly string[],
  options: EscapeCaseCompileOptions = {},
): CompiledEscapeCase {
  switch (caseId) {
    case 'dead-air':
      return compileDeadAirCase(seed, nodeIds, options);
    case 'night-glass':
      return compileNightGlassCase(seed, nodeIds, options);
    case 'long-table':
      return compileLongTableCase(seed, nodeIds, options);
  }
}

export function validateDeadAirDuctOrder(
  game: DeadAirCase,
  submittedNodeIds: readonly string[],
): PrefixValidation {
  return validateOrderedAttempt(game.ductOrder, submittedNodeIds);
}

export function validateDeadAirValveSequence(
  game: DeadAirCase,
  submittedValves: readonly Line13Glyph[],
): PrefixValidation {
  return validateOrderedAttempt(game.valveSequence, submittedValves);
}

export function validateDeadAirWhisperGlyphs(
  game: DeadAirCase,
  submittedGlyphs: readonly Line13Glyph[],
): PrefixValidation {
  return validateOrderedAttempt(
    game.privateChannel.rounds.map((round) => round.decodedGlyph),
    submittedGlyphs,
  );
}

export function validateDeadAirEnvelope(
  game: DeadAirCase,
  submittedEnvelope: readonly EnvelopeLevel[],
): PrefixValidation {
  return validateOrderedAttempt(game.echoMatrix.envelope, submittedEnvelope);
}

export function validateDeadAirServiceScanProof(
  game: DeadAirCase,
  proof: DeadAirServiceScanProof,
): ProofValidation {
  const expected = game.serviceScans[proof.step - 1];
  if (!expected || expected.step !== proof.step) return proofRejected('WRONG_STAGE_ITEM');
  if (proof.scannerNodeId !== expected.scannerNodeId) return proofRejected('WRONG_ACTOR');
  if (proof.markerOwnerNodeId !== expected.markerOwnerNodeId) return proofRejected('WRONG_TARGET');
  if (proof.markerToken !== expected.markerToken) return proofRejected('WRONG_TOKEN');
  if (proof.selectedValve !== expected.liveValve) return proofRejected('WRONG_VALUE');
  if (!proof.ownerConfirmed) return proofRejected('MISSING_CONFIRMATION');
  return proofAccepted();
}

export function validateDeadAirWhisperProof(
  game: DeadAirCase,
  proof: DeadAirWhisperProof,
): ProofValidation {
  const expected = game.privateChannel.rounds[proof.round - 1];
  if (!expected || expected.round !== proof.round) return proofRejected('WRONG_STAGE_ITEM');
  if (proof.senderNodeId !== game.privateChannel.callerNodeId) return proofRejected('WRONG_ACTOR');
  if (proof.recipientNodeId !== game.privateChannel.receiverNodeId) return proofRejected('WRONG_TARGET');
  if (proof.gate !== expected.gate || proof.acknowledgedCodeword !== expected.codeword) {
    return proofRejected('WRONG_VALUE');
  }
  if (
    proof.payloadRecipientNodeIds.length !== 1 ||
    proof.payloadRecipientNodeIds[0] !== game.privateChannel.receiverNodeId ||
    game.privateChannel.excludedNodeIds.some((nodeId) =>
      proof.payloadRecipientNodeIds.includes(nodeId),
    )
  ) {
    return proofRejected('PAYLOAD_LEAK');
  }
  if (proof.payloadSizeBytes < 0 || proof.payloadSizeBytes > 96 * 1_024) {
    return proofRejected('PAYLOAD_LIMIT');
  }
  if (proof.ttlMs <= 0 || proof.ttlMs > 10_000) return proofRejected('TTL_LIMIT');
  return proofAccepted();
}

export function validateDeadAirWhisperSequence(
  game: DeadAirCase,
  submittedProofs: readonly DeadAirWhisperProof[],
): PrefixValidation {
  let acceptedPrefixLength = 0;
  const expectedLength = game.privateChannel.rounds.length;
  while (acceptedPrefixLength < Math.min(expectedLength, submittedProofs.length)) {
    const proof = submittedProofs[acceptedPrefixLength];
    if (proof.round !== acceptedPrefixLength + 1) break;
    if (!validateDeadAirWhisperProof(game, proof).accepted) break;
    acceptedPrefixLength += 1;
  }
  const mismatch =
    acceptedPrefixLength < submittedProofs.length || submittedProofs.length > expectedLength;
  return {
    status: mismatch
      ? 'mismatch'
      : submittedProofs.length === expectedLength
        ? 'complete'
        : 'incomplete',
    acceptedPrefixLength,
    expectedLength,
    submittedLength: submittedProofs.length,
  };
}

export function validateDeadAirCountertoneProof(
  game: DeadAirCase,
  proof: DeadAirCountertoneProof,
): ProofValidation {
  if (proof.completedAt < proof.startedAt || proof.completedAt - proof.startedAt > game.countertone.windowMs) {
    return proofRejected('TIMING_WINDOW');
  }
  if (proof.tunerNodeId !== game.countertone.tunerNodeId || proof.tunerPose !== game.countertone.tunerPose) {
    return proofRejected('WRONG_ACTOR');
  }
  if (proof.beats.length !== game.countertone.beats.length) return proofRejected('WRONG_STAGE_ITEM');
  for (let index = 0; index < game.countertone.beats.length; index += 1) {
    const expected = game.countertone.beats[index];
    const submitted = proof.beats[index];
    if (submitted.beat !== expected.beat || submitted.level !== expected.level) {
      return proofRejected('WRONG_VALUE');
    }
    if (!sameMembers(submitted.performerNodeIds, expected.performerNodeIds)) {
      return proofRejected('WRONG_ACTOR');
    }
  }
  return proofAccepted();
}

export function validateNightGlassThresholdProof(
  game: NightGlassCase,
  proof: NightGlassPoseProof,
): ProofValidation {
  if (proof.completedAt < proof.startedAt || proof.completedAt - proof.startedAt > game.threshold.windowMs) {
    return proofRejected('TIMING_WINDOW');
  }
  if (!proof.contactsHeld) return proofRejected('MISSING_CONFIRMATION');
  if (proof.assignments.length !== game.threshold.assignments.length) {
    return proofRejected('WRONG_STAGE_ITEM');
  }
  for (const expected of game.threshold.assignments) {
    const submitted = proof.assignments.find((assignment) => assignment.nodeId === expected.nodeId);
    if (!submitted) return proofRejected('WRONG_ACTOR');
    if (submitted.pose !== expected.pose) return proofRejected('WRONG_VALUE');
  }
  return proofAccepted();
}

export function validateNightGlassParallaxProof(
  game: NightGlassCase,
  proof: NightGlassParallaxProof,
): ProofValidation {
  const expected = game.parallaxRounds[proof.round - 1];
  if (!expected || expected.round !== proof.round) return proofRejected('WRONG_STAGE_ITEM');
  if (
    proof.watcherNodeId !== expected.watcherNodeId ||
    proof.hingeNodeId !== expected.hingeNodeId
  ) {
    return proofRejected('WRONG_ACTOR');
  }
  if (proof.frameNodeId !== expected.frameNodeId) return proofRejected('WRONG_TARGET');
  if (proof.markerToken !== expected.markerToken) return proofRejected('WRONG_TOKEN');
  if (
    proof.targetGlyph !== expected.targetGlyph ||
    proof.hingePose !== expected.requiredPose ||
    proof.bearing !== expected.revealedBearing
  ) {
    return proofRejected('WRONG_VALUE');
  }
  if (!proof.frameOwnerConfirmed) return proofRejected('MISSING_CONFIRMATION');
  return proofAccepted();
}

export function validateNightGlassBearingSequence(
  game: NightGlassCase,
  submittedBearings: readonly Bearing[],
): PrefixValidation {
  return validateOrderedAttempt(game.bearingSequence, submittedBearings);
}

export function validateNightGlassMazePath(
  game: NightGlassCase,
  submittedCells: readonly number[],
): PrefixValidation {
  return validateOrderedAttempt(game.maze.path, submittedCells);
}

export function validateNightGlassAnchorProof(
  game: NightGlassCase,
  proof: NightGlassAnchorProof,
): ProofValidation {
  const expected = game.corridor.anchorSteps[proof.step - 1];
  if (!expected || expected.step !== proof.step) return proofRejected('WRONG_STAGE_ITEM');
  if (proof.courierNodeId !== expected.courierNodeId) return proofRejected('WRONG_ACTOR');
  if (proof.anchorOwnerNodeId !== expected.anchorOwnerNodeId) return proofRejected('WRONG_TARGET');
  if (proof.markerToken !== expected.markerToken) return proofRejected('WRONG_TOKEN');
  if (!proof.anchorOwnerConfirmed) return proofRejected('MISSING_CONFIRMATION');
  return proofAccepted();
}

export function validateNightGlassFinaleProof(
  game: NightGlassCase,
  proof: NightGlassPoseProof,
): ProofValidation {
  if (proof.completedAt < proof.startedAt || proof.completedAt - proof.startedAt > game.finale.windowMs) {
    return proofRejected('TIMING_WINDOW');
  }
  if (!proof.contactsHeld) return proofRejected('MISSING_CONFIRMATION');
  if (proof.assignments.length !== game.finale.assignments.length) {
    return proofRejected('WRONG_STAGE_ITEM');
  }
  for (const expected of game.finale.assignments) {
    const submitted = proof.assignments.find((assignment) => assignment.nodeId === expected.nodeId);
    if (!submitted) return proofRejected('WRONG_ACTOR');
    if (submitted.pose !== expected.pose) return proofRejected('WRONG_VALUE');
  }
  return proofAccepted();
}

export function validateLongTableArtifactOrder(
  game: LongTableCase,
  submitted: readonly LongTableArtifactId[],
): PrefixValidation {
  return validateOrderedAttempt(game.artifactOrder, submitted);
}

export function validateLongTablePhotoCode(
  game: LongTableCase,
  submitted: string,
): ProofValidation {
  return submitted === game.photograph.code ? proofAccepted() : proofRejected('WRONG_VALUE');
}

export function validateLongTableKeepsakeProof(
  game: LongTableCase,
  proof: LongTableKeepsakeProof,
): ProofValidation {
  const expected = game.keepsakes[proof.round - 1];
  if (!expected || expected.round !== proof.round) return proofRejected('WRONG_STAGE_ITEM');
  if (proof.seekerNodeId !== expected.seekerNodeId) return proofRejected('WRONG_ACTOR');
  if (proof.witnessNodeId !== expected.witnessNodeId) return proofRejected('WRONG_TARGET');
  if (proof.markerToken !== expected.markerToken) return proofRejected('WRONG_TOKEN');
  if (!proof.framedInCamera || !proof.witnessConfirmed) return proofRejected('MISSING_CONFIRMATION');
  return proofAccepted();
}

export function validateLongTablePassProof(
  game: LongTableCase,
  proof: LongTablePassProof,
): ProofValidation {
  const expected = game.serviceRoute[proof.step - 1];
  if (!expected || expected.step !== proof.step) return proofRejected('WRONG_STAGE_ITEM');
  if (proof.courierNodeId !== expected.courierNodeId) return proofRejected('WRONG_ACTOR');
  if (proof.stationOwnerNodeId !== expected.stationOwnerNodeId) return proofRejected('WRONG_TARGET');
  if (proof.markerToken !== expected.markerToken) return proofRejected('WRONG_TOKEN');
  if (proof.requiredPose !== expected.requiredPose) return proofRejected('WRONG_VALUE');
  if (!proof.stationOwnerConfirmed) return proofRejected('MISSING_CONFIRMATION');
  return proofAccepted();
}

export function validateLongTableFinaleProof(
  game: LongTableCase,
  proof: LongTableFinaleProof,
): ProofValidation {
  if (proof.completedAt < proof.startedAt || proof.completedAt - proof.startedAt > game.finale.windowMs) {
    return proofRejected('TIMING_WINDOW');
  }
  if (!proof.contactsHeld || proof.assignments.length !== game.finale.assignments.length) {
    return proofRejected('MISSING_CONFIRMATION');
  }
  for (const expected of game.finale.assignments) {
    const submitted = proof.assignments.find((assignment) => assignment.nodeId === expected.nodeId);
    if (!submitted) return proofRejected('WRONG_ACTOR');
    if (submitted.pose !== expected.pose || submitted.voiceLevel !== expected.voiceLevel) {
      return proofRejected('WRONG_VALUE');
    }
  }
  return proofAccepted();
}

function stageProofResult(
  validation: ProofValidation,
  stageId: string,
  proofKey: string,
): StageProofValidation {
  return validation.accepted
    ? { ...validation, stageId, proofKey }
    : { ...validation, stageId };
}

/**
 * Coordinator-facing proof boundary. Stage contracts expose required members
 * and non-secret proof keys, while this function retains every semantic answer
 * inside the authoritative compiled case.
 */
export function validateStageProof(
  game: CompiledEscapeCase,
  stageIndex: number,
  nodeId: string,
  proof: EscapeStageProof,
): StageProofValidation {
  const stage = game.stages[stageIndex];
  if (!stage || stage.index !== stageIndex) return proofRejected('INVALID_STAGE');
  if (proof.kind !== stage.proofKind) {
    return { ...proofRejected('WRONG_PROOF_KIND'), stageId: stage.id };
  }
  if (!stage.submitterNodeIds.includes(nodeId)) {
    return { ...proofRejected('UNAUTHORIZED_SUBMITTER'), stageId: stage.id };
  }

  switch (proof.kind) {
    case 'dead-air/duct-order': {
      if (game.id !== 'dead-air') return proofRejected('WRONG_PROOF_KIND');
      const result = validateDeadAirDuctOrder(game, proof.value);
      return stageProofResult(
        result.status === 'complete' ? proofAccepted() : proofRejected('WRONG_VALUE'),
        stage.id,
        'duct-order',
      );
    }
    case 'dead-air/service-scan': {
      if (game.id !== 'dead-air') return proofRejected('WRONG_PROOF_KIND');
      if (nodeId !== proof.value.scannerNodeId) {
        return { ...proofRejected('UNAUTHORIZED_SUBMITTER'), stageId: stage.id };
      }
      return stageProofResult(
        validateDeadAirServiceScanProof(game, proof.value),
        stage.id,
        `service-scan:${proof.value.step}`,
      );
    }
    case 'dead-air/whisper-round': {
      if (game.id !== 'dead-air') return proofRejected('WRONG_PROOF_KIND');
      if (nodeId !== game.privateChannel.receiverNodeId) {
        return { ...proofRejected('UNAUTHORIZED_SUBMITTER'), stageId: stage.id };
      }
      return stageProofResult(
        validateDeadAirWhisperProof(game, proof.value),
        stage.id,
        `whisper:${proof.value.round}`,
      );
    }
    case 'dead-air/echo-envelope': {
      if (game.id !== 'dead-air') return proofRejected('WRONG_PROOF_KIND');
      const result = validateDeadAirEnvelope(game, proof.value);
      return stageProofResult(
        result.status === 'complete' ? proofAccepted() : proofRejected('WRONG_VALUE'),
        stage.id,
        'echo-envelope',
      );
    }
    case 'dead-air/countertone': {
      if (game.id !== 'dead-air') return proofRejected('WRONG_PROOF_KIND');
      return stageProofResult(
        validateDeadAirCountertoneProof(game, proof.value),
        stage.id,
        'countertone',
      );
    }
    case 'night-glass/threshold': {
      if (game.id !== 'night-glass') return proofRejected('WRONG_PROOF_KIND');
      return stageProofResult(
        validateNightGlassThresholdProof(game, proof.value),
        stage.id,
        'threshold',
      );
    }
    case 'night-glass/parallax-round': {
      if (game.id !== 'night-glass') return proofRejected('WRONG_PROOF_KIND');
      if (nodeId !== proof.value.watcherNodeId) {
        return { ...proofRejected('UNAUTHORIZED_SUBMITTER'), stageId: stage.id };
      }
      return stageProofResult(
        validateNightGlassParallaxProof(game, proof.value),
        stage.id,
        `parallax:${proof.value.round}`,
      );
    }
    case 'night-glass/maze-path': {
      if (game.id !== 'night-glass') return proofRejected('WRONG_PROOF_KIND');
      const result = validateNightGlassMazePath(game, proof.value);
      return stageProofResult(
        result.status === 'complete' ? proofAccepted() : proofRejected('WRONG_VALUE'),
        stage.id,
        'maze-path',
      );
    }
    case 'night-glass/anchor': {
      if (game.id !== 'night-glass') return proofRejected('WRONG_PROOF_KIND');
      if (nodeId !== proof.value.courierNodeId) {
        return { ...proofRejected('UNAUTHORIZED_SUBMITTER'), stageId: stage.id };
      }
      return stageProofResult(
        validateNightGlassAnchorProof(game, proof.value),
        stage.id,
        `anchor:${proof.value.step}`,
      );
    }
    case 'night-glass/finale': {
      if (game.id !== 'night-glass') return proofRejected('WRONG_PROOF_KIND');
      return stageProofResult(
        validateNightGlassFinaleProof(game, proof.value),
        stage.id,
        'finale',
      );
    }
    case 'long-table/seat-order': {
      if (game.id !== 'long-table') return proofRejected('WRONG_PROOF_KIND');
      const result = validateLongTableArtifactOrder(game, proof.value);
      return stageProofResult(
        result.status === 'complete' ? proofAccepted() : proofRejected('WRONG_VALUE'),
        stage.id,
        'seat-order',
      );
    }
    case 'long-table/photo-code': {
      if (game.id !== 'long-table') return proofRejected('WRONG_PROOF_KIND');
      return stageProofResult(
        validateLongTablePhotoCode(game, proof.value),
        stage.id,
        'photo-code',
      );
    }
    case 'long-table/keepsake': {
      if (game.id !== 'long-table') return proofRejected('WRONG_PROOF_KIND');
      if (nodeId !== proof.value.witnessNodeId) {
        return { ...proofRejected('UNAUTHORIZED_SUBMITTER'), stageId: stage.id };
      }
      return stageProofResult(
        validateLongTableKeepsakeProof(game, proof.value),
        stage.id,
        `keepsake:${proof.value.round}`,
      );
    }
    case 'long-table/pass-step': {
      if (game.id !== 'long-table') return proofRejected('WRONG_PROOF_KIND');
      if (nodeId !== proof.value.courierNodeId) {
        return { ...proofRejected('UNAUTHORIZED_SUBMITTER'), stageId: stage.id };
      }
      return stageProofResult(
        validateLongTablePassProof(game, proof.value),
        stage.id,
        `pass:${proof.value.step}`,
      );
    }
    case 'long-table/finale': {
      if (game.id !== 'long-table') return proofRejected('WRONG_PROOF_KIND');
      return stageProofResult(
        validateLongTableFinaleProof(game, proof.value),
        stage.id,
        'last-bell',
      );
    }
  }
}

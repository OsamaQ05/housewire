import { z } from 'zod';

import { CAPABILITIES } from '../types';
import { FORGE_THEME_IDS, type ForgeCase, type ForgePlayerCase } from './types';

const safeId = z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const boundedText = z.string().min(1).max(800).refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));
const shortText = z.string().min(1).max(180).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const capability = z.enum(CAPABILITIES);
const playerIds = z.array(safeId).min(1).max(4);
const pose = z.enum(['PLACE_FLAT', 'HOLD_UPRIGHT', 'TILT_LEFT', 'TILT_RIGHT', 'FACE_DOWN', 'HOLD_STILL']);
const vocalCue = z.enum(['NONE', 'LOW_HUM', 'SHORT_TONE']);
const edge = z.tuple([z.number().int().min(1).max(16), z.number().int().min(1).max(16)]);

const cluePayload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: boundedText }).strict(),
  z.object({ kind: z.literal('riddle-fragment'), fragmentId: safeId, text: boundedText }).strict(),
  z.object({ kind: z.literal('sequence'), items: z.array(shortText).min(1).max(16) }).strict(),
  z.object({
    kind: z.literal('mapping'),
    pairs: z.array(z.object({ left: shortText, right: shortText }).strict()).min(1).max(16),
  }).strict(),
  z.object({ kind: z.literal('grid-edges'), edges: z.array(edge).max(32) }).strict(),
  z.object({ kind: z.literal('audio-token'), spokenText: shortText, fallbackText: shortText }).strict(),
  z.object({ kind: z.literal('camera-marker'), markerToken: shortText, symbol: shortText }).strict(),
  z.object({ kind: z.literal('camera-display'), markerToken: shortText }).strict(),
  z.object({ kind: z.literal('camera-scanner'), markerToken: shortText, symbol: shortText }).strict(),
  z.object({ kind: z.literal('pose'), pose, holdMs: z.number().int().min(250).max(10_000) }).strict(),
]);

const clue = z.object({
  id: safeId,
  title: shortText,
  audiencePlayerIds: playerIds,
  private: z.boolean(),
  payload: cluePayload,
}).strict();

const hint = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: boundedText,
  penaltySeconds: z.number().int().min(0).max(600),
}).strict();

const syncAssignment = z.object({ playerId: safeId, pose, vocalCue }).strict();

const mechanic = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('distributed-order'),
    tokens: z.array(z.object({ id: safeId, label: shortText }).strict()).min(3).max(8),
    adjacentConstraints: z.array(z.tuple([safeId, safeId])).min(2).max(8),
  }).strict(),
  z.object({
    kind: z.literal('split-riddle'),
    candidates: z.array(z.object({ id: safeId, label: shortText, sigil: shortText }).strict()).min(5).max(8),
    fragmentCount: z.union([z.literal(3), z.literal(4)]),
  }).strict(),
  z.object({
    kind: z.literal('symbol-lock'),
    symbols: z.array(shortText).min(3).max(6),
    encodedSequence: z.array(shortText).min(3).max(8),
    preferredCapability: z.literal('cameraQr'),
    revealMode: z.enum(['camera', 'manual']).default('camera'),
  }).strict(),
  z.object({
    kind: z.literal('private-relay'),
    rounds: z.array(z.object({
      round: z.number().int().min(1).max(8),
      senderPlayerId: safeId,
      recipientPlayerId: safeId,
      excludedPlayerIds: z.array(safeId).max(3),
      gate: shortText,
    }).strict()).min(1).max(8),
    preferredCapability: z.literal('microphoneLevel'),
    deliveryMode: z.enum(['audio', 'text']).default('audio'),
    memoryMode: z.boolean(),
  }).strict(),
  z.object({
    kind: z.literal('route-grid'),
    width: z.union([z.literal(3), z.literal(4)]),
    height: z.union([z.literal(3), z.literal(4)]),
    cells: z.array(z.number().int().min(1).max(16)).min(9).max(16),
    openEdges: z.array(edge).min(8).max(24),
    startCell: z.number().int().min(1).max(16),
    exitCell: z.number().int().min(1).max(16),
  }).strict(),
  z.object({
    kind: z.literal('motion-sync'),
    assignments: z.array(syncAssignment).min(1).max(4),
    inputMode: z.enum(['motion', 'touch']).default('motion'),
    windowMs: z.number().int().min(3_000).max(30_000),
    preferredCapability: z.literal('motion'),
  }).strict(),
]);

const playerMechanic = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('distributed-order'),
    tokens: z.array(z.object({ id: safeId, label: shortText }).strict()).min(3).max(8),
  }).strict(),
  mechanic.options[1],
  mechanic.options[2],
  mechanic.options[3],
  z.object({
    kind: z.literal('route-grid'),
    width: z.union([z.literal(3), z.literal(4)]),
    height: z.union([z.literal(3), z.literal(4)]),
    cells: z.array(z.number().int().min(1).max(16)).min(9).max(16),
    startCell: z.number().int().min(1).max(16),
    exitCell: z.number().int().min(1).max(16),
  }).strict(),
  z.object({
    kind: z.literal('motion-sync'),
    assignments: z.array(syncAssignment).min(1).max(1),
    participantCount: z.number().int().min(1).max(4),
    windowMs: z.number().int().min(3_000).max(30_000),
    preferredCapability: z.literal('motion'),
    inputMode: z.enum(['motion', 'touch']),
  }).strict(),
]);

const solution = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sequence'), answer: z.array(safeId).min(3).max(8) }).strict(),
  z.object({ kind: z.literal('word'), answer: safeId }).strict(),
  z.object({ kind: z.literal('code'), answer: z.string().regex(/^\d{3,8}$/) }).strict(),
  z.object({
    kind: z.literal('relay'),
    rounds: z.array(z.object({
      round: z.number().int().min(1).max(8),
      recipientPlayerId: safeId,
      token: shortText,
    }).strict()).min(1).max(8),
  }).strict(),
  z.object({
    kind: z.literal('route'),
    answer: z.array(z.number().int().min(1).max(16)).min(2).max(16),
  }).strict(),
  z.object({
    kind: z.literal('sync'),
    windowMs: z.number().int().min(3_000).max(30_000),
    assignments: z.array(syncAssignment).min(1).max(4),
  }).strict(),
]);

const fallback = z.object({ reason: boundedText, instruction: boundedText, preservesAnswer: z.literal(true) }).strict();

const stage = z.object({
  id: safeId,
  index: z.number().int().min(0).max(8),
  title: shortText,
  storyBeat: boundedText,
  instruction: boundedText,
  durationMinutes: z.number().int().min(1).max(30),
  mechanic,
  clues: z.array(clue).min(1).max(40),
  hints: z.array(hint).length(3),
  solution,
  requiredPlayerIds: playerIds,
  submitterPlayerIds: playerIds,
  fallback,
}).strict();

const playerStage = stage.omit({ mechanic: true, solution: true }).extend({ mechanic: playerMechanic });

const role = z.object({
  id: safeId,
  playerId: safeId,
  playerName: shortText,
  title: shortText,
  brief: boundedText,
  responsibility: boundedText,
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
}).strict();

const recipe = z.object({
  seed: z.union([z.string().min(1).max(128), z.number().finite()]),
  playerIds,
  playerNames: z.record(safeId, z.string().min(1).max(24)).optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  targetMinutes: z.union([z.literal(20), z.literal(30), z.literal(45)]),
  tone: z.enum(['eerie', 'adventure', 'mystery']),
  intensity: z.enum(['gentle', 'balanced', 'intense']),
  safeMovement: z.boolean(),
  noiseAllowed: z.boolean(),
  replayIndex: z.number().int().min(0).max(999_999),
  themeId: z.enum(FORGE_THEME_IDS),
  customThemePrompt: shortText.optional(),
  capabilitiesByPlayer: z.record(safeId, z.array(capability).max(CAPABILITIES.length)).optional(),
}).strict();

export const forgeCaseSchema = z.object({
  id: z.string().min(1).max(96).regex(/^forge-[a-z0-9-]+-[A-Z0-9]{7}$/),
  schemaVersion: z.literal(1),
  generatorVersion: z.enum(['housewire-local-forge-v1', 'housewire-local-forge-v2']),
  providerId: safeId,
  seed: z.union([z.string().min(1).max(128), z.number().finite()]),
  effectiveSeed: z.number().int().min(0).max(0xffff_ffff),
  replayIndex: z.number().int().min(0).max(999_999),
  createdAt: z.number().int().positive().max(8_640_000_000_000_000),
  title: shortText,
  tagline: boundedText,
  theme: z.enum(FORGE_THEME_IDS),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  durationMinutes: z.union([z.literal(20), z.literal(30), z.literal(45)]),
  playerCount: z.number().int().min(1).max(4),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  tone: z.enum(['eerie', 'adventure', 'mystery']),
  intensity: z.enum(['gentle', 'balanced', 'intense']),
  premise: boundedText,
  objective: boundedText,
  ending: boundedText,
  safetyNotice: boundedText,
  roles: z.array(role).min(1).max(4),
  stages: z.array(stage).length(5),
  recipe,
  validation: z.object({
    validatorVersion: z.literal(1),
    status: z.literal('playable'),
    checkedAt: z.number().int().positive().max(8_640_000_000_000_000),
    checks: z.array(safeId).min(1).max(24),
  }).strict(),
}).strict();

export const forgePlayerCaseSchema = forgeCaseSchema
  .omit({ effectiveSeed: true, recipe: true, replayIndex: true, roles: true, seed: true, stages: true, validation: true })
  .extend({
    role,
    crew: z.array(role.pick({ playerId: true, playerName: true, title: true, accent: true })).min(1).max(4),
    stages: z.array(playerStage).length(5),
  })
  .strict();

export function parseForgeCase(value: unknown): ForgeCase {
  return forgeCaseSchema.parse(value) as ForgeCase;
}

export function parseForgePlayerCase(value: unknown): ForgePlayerCase {
  return forgePlayerCaseSchema.parse(value) as ForgePlayerCase;
}

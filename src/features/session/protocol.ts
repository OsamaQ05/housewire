import { z } from 'zod';

import { EVIDENCE_KINDS, type EvidenceKind } from '../../domain/types';
import type { MissionId } from '@/src/store/use-housewire-store';

export const MAXIMUM_SESSION_NODES = 4;
export const MAXIMUM_SESSION_FEED = 192;

const safeIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'Use a relay-safe identifier.');
const timestampSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const uint32Schema = z.number().int().min(0).max(0xffff_ffff);

export function toSessionTimestamp(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Session timestamps must be finite.');
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(value)));
}

export const line13StageIds = [
  'incoming-call',
  'split-cipher',
  'courier-transfer',
  'route-reconstruction',
  'synchronized-hangup',
] as const;

export type Line13StageId = (typeof line13StageIds)[number];

export const line13ActionIds = [
  'lift-receiver',
  'lock-full-warning',
  'carry-warning',
  'release-destination-receipt',
  'place-route-section',
  'close-receiver',
] as const;

export type Line13ActionId = (typeof line13ActionIds)[number];

const stageIdSchema = z.enum(line13StageIds);
const actionIdSchema = z.enum(line13ActionIds);
const evidenceKindSchema = z.enum(EVIDENCE_KINDS);

function uniqueNodeIds(minimum: number) {
  return z
    .array(safeIdSchema)
    .min(minimum)
    .max(MAXIMUM_SESSION_NODES)
    .refine((nodeIds) => new Set(nodeIds).size === nodeIds.length, 'Node ids must be unique.')
    .refine(
      (nodeIds) => nodeIds.every((nodeId, index) => index === 0 || nodeIds[index - 1].localeCompare(nodeId) < 0),
      'Node ids must be in stable lexical order.',
    );
}

export const sessionNodeSchema = z
  .object({
    id: safeIdSchema,
    label: z.string().trim().min(1).max(24),
    nodeNumber: z.number().int().min(1).max(MAXIMUM_SESSION_NODES),
    simulated: z.literal(false),
    joinedAt: timestampSchema,
  })
  .strict();

export type SessionNode = z.infer<typeof sessionNodeSchema>;

const presenceSchema = z.object({ kind: z.literal('presence'), node: sessionNodeSchema }).strict();

const lobbyProfileSchema = z
  .object({
    kind: z.literal('lobby.profile'),
    nodeId: safeIdSchema,
    name: z.string().trim().min(1).max(24),
  })
  .strict();

const lobbyCommandSchema = z
  .object({
    kind: z.literal('lobby.command'),
    action: z.literal('calibrate'),
    hostNodeId: safeIdSchema,
  })
  .strict();

const missionStartSchema = z
  .object({
    kind: z.literal('mission.start'),
    missionId: z.literal('line-13'),
    operationId: safeIdSchema,
    hostNodeId: safeIdSchema,
    seed: uint32Schema,
    startsAt: timestampSchema,
    liveNodeIds: uniqueNodeIds(2),
  })
  .strict();

const stageSchema = z
  .object({
    kind: z.literal('mission.stage'),
    missionId: z.literal('line-13'),
    operationId: safeIdSchema,
    hostNodeId: safeIdSchema,
    stageId: stageIdSchema,
    stageIndex: z.number().int().min(0).max(line13StageIds.length - 1),
    startsAt: timestampSchema,
    requiredNodeIds: uniqueNodeIds(1),
    signalOwnerId: safeIdSchema.optional(),
  })
  .strict();

const evidenceValueSchema = z.union([
  z.string().max(64),
  z.number().finite().min(-1_000_000).max(1_000_000),
  z.boolean(),
]);

const evidenceSchema = z
  .object({
    kind: z.literal('mission.evidence'),
    missionId: z.literal('line-13'),
    operationId: safeIdSchema,
    stageId: stageIdSchema,
    stageIndex: z.number().int().min(0).max(line13StageIds.length - 1),
    actionId: actionIdSchema,
    nodeId: safeIdSchema,
    evidenceKind: evidenceKindSchema,
    confidence: z.number().finite().min(0).max(1),
    observedAt: timestampSchema,
    value: evidenceValueSchema.optional(),
  })
  .strict();

const abortSchema = z
  .object({
    kind: z.literal('mission.abort'),
    missionId: z.literal('line-13'),
    operationId: safeIdSchema,
    nodeId: safeIdSchema,
    abortedAt: timestampSchema,
  })
  .strict();

const pulseSchema = z
  .object({
    kind: z.literal('signal.pulse'),
    fromNodeId: safeIdSchema,
    toNodeId: safeIdSchema,
    departsAt: timestampSchema,
    arrivesAt: timestampSchema,
    cue: z.enum(['ring', 'relay', 'transfer', 'closure']),
  })
  .strict();

const acceptedCompletionSchema = z
  .object({
    nodeId: safeIdSchema,
    actionId: actionIdSchema,
    evidenceKind: evidenceKindSchema,
    observedAt: timestampSchema,
  })
  .strict();

const snapshotSchema = z
  .object({
    kind: z.literal('mission.snapshot'),
    missionId: z.literal('line-13'),
    operationId: safeIdSchema,
    hostNodeId: safeIdSchema,
    seed: uint32Schema,
    startedAt: timestampSchema,
    stageId: stageIdSchema,
    stageIndex: z.number().int().min(0).max(line13StageIds.length - 1),
    stageStartedAt: timestampSchema,
    revision: z.number().int().min(0).max(4_096),
    acceptedThroughSequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    liveNodeIds: uniqueNodeIds(2),
    requiredNodeIds: uniqueNodeIds(1),
    completions: z.array(acceptedCompletionSchema).max(8),
    finishedAt: timestampSchema.optional(),
    abortedAt: timestampSchema.optional(),
    abortedByNodeId: safeIdSchema.optional(),
  })
  .strict();

const snapshotRequestSchema = z
  .object({
    kind: z.literal('mission.snapshot.request'),
    nodeId: safeIdSchema,
    knownOperationId: safeIdSchema.optional(),
    requestedAt: timestampSchema,
  })
  .strict();

const readySchema = z.object({ kind: z.literal('node.ready'), nodeId: safeIdSchema, ready: z.boolean() }).strict();

export const escapeMissionIds = ['dead-air', 'night-glass', 'long-table'] as const;
export type EscapeMissionId = (typeof escapeMissionIds)[number];

const escapeMissionIdSchema = z.enum(escapeMissionIds);
const escapeStageIdSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const escapeProofKeySchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?::[1-9][0-9]?)?$/);

const escapeStartSchema = z
  .object({
    kind: z.literal('escape.start'),
    missionId: escapeMissionIdSchema,
    operationId: safeIdSchema,
    hostNodeId: safeIdSchema,
    seed: uint32Schema,
    startsAt: timestampSchema,
    liveNodeIds: uniqueNodeIds(2),
  })
  .strict();

const escapeAbortSchema = z
  .object({
    kind: z.literal('escape.abort'),
    missionId: escapeMissionIdSchema,
    operationId: safeIdSchema,
    hostNodeId: safeIdSchema,
    abortedAt: timestampSchema,
  })
  .strict();

const escapeProofSchema = z
  .object({
    kind: z.literal('escape.proof'),
    missionId: escapeMissionIdSchema,
    operationId: safeIdSchema,
    stageIndex: z.number().int().min(0).max(4),
    nodeId: safeIdSchema,
    proofKey: escapeProofKeySchema,
    answerToken: safeIdSchema,
    observedAt: timestampSchema,
  })
  .strict();

const escapeCompletionSchema = z
  .object({
    nodeId: safeIdSchema,
    proofKey: escapeProofKeySchema,
    observedAt: timestampSchema,
  })
  .strict();

const escapeSnapshotSchema = z
  .object({
    kind: z.literal('escape.snapshot'),
    missionId: escapeMissionIdSchema,
    operationId: safeIdSchema,
    hostNodeId: safeIdSchema,
    seed: uint32Schema,
    startedAt: timestampSchema,
    stageId: escapeStageIdSchema,
    stageIndex: z.number().int().min(0).max(4),
    stageStartedAt: timestampSchema,
    revision: z.number().int().min(0).max(4_096),
    liveNodeIds: uniqueNodeIds(2),
    requiredNodeIds: uniqueNodeIds(1),
    completions: z.array(escapeCompletionSchema).max(16),
    finishedAt: timestampSchema.optional(),
    abortedAt: timestampSchema.optional(),
  })
  .strict();

const escapeSnapshotRequestSchema = z
  .object({
    kind: z.literal('escape.snapshot.request'),
    missionId: escapeMissionIdSchema,
    nodeId: safeIdSchema,
    knownOperationId: safeIdSchema.optional(),
    requestedAt: timestampSchema,
  })
  .strict();

const escapeSignalSchema = z
  .object({
    kind: z.literal('escape.signal'),
    missionId: escapeMissionIdSchema,
    operationId: safeIdSchema,
    nodeId: safeIdSchema,
    targetNodeId: safeIdSchema.optional(),
    round: z.number().int().min(1).max(8),
    signal: z.enum([
      'gate-open',
      'whisper-sent',
      'whisper-heard',
      'frame-locked',
      'table-set',
      'keepsake-framed',
    ]),
    value: z.string().max(32).optional(),
    observedAt: timestampSchema,
  })
  .strict();

const forgeCaseIdSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^forge-[a-z0-9-]+-[A-Z0-9]{7}$/);

const forgeJoinSchema = z
  .object({
    kind: z.literal('forge.join'),
    caseId: forgeCaseIdSchema,
    nodeId: safeIdSchema,
    name: z.string().trim().min(1).max(24),
    requestedAt: timestampSchema,
  })
  .strict();

const forgeSnapshotRequestSchema = z
  .object({
    kind: z.literal('forge.snapshot.request'),
    caseId: forgeCaseIdSchema,
    nodeId: safeIdSchema,
    knownOperationId: safeIdSchema.optional(),
    requestedAt: timestampSchema,
  })
  .strict();

const forgeAssignmentSchema = z
  .object({
    nodeId: safeIdSchema,
    playerId: safeIdSchema,
    name: z.string().trim().min(1).max(24),
    title: z.string().trim().min(1).max(180),
    accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    joinedAt: timestampSchema,
  })
  .strict();

const forgeSnapshotSchema = z
  .object({
    kind: z.literal('forge.snapshot'),
    caseId: forgeCaseIdSchema,
    operationId: safeIdSchema,
    hostNodeId: safeIdSchema,
    title: z.string().trim().min(1).max(180),
    accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    playerCount: z.number().int().min(1).max(MAXIMUM_SESSION_NODES),
    status: z.enum(['waiting', 'playing', 'finished', 'aborted']),
    revision: z.number().int().min(0).max(16_384),
    stageIndex: z.number().int().min(0).max(5),
    assignments: z.array(forgeAssignmentSchema).min(1).max(MAXIMUM_SESSION_NODES),
    hints: z.array(z.object({ stageId: safeIdSchema, count: z.number().int().min(0).max(3) }).strict()).max(5),
    syncProofs: z.array(z.object({ playerId: safeIdSchema, observedAt: timestampSchema }).strict()).max(MAXIMUM_SESSION_NODES),
    createdAt: timestampSchema,
    startedAt: timestampSchema.optional(),
    stageStartedAt: timestampSchema.optional(),
    finishedAt: timestampSchema.optional(),
    abortedAt: timestampSchema.optional(),
  })
  .strict();

const baseEventSchema = z.discriminatedUnion('kind', [
  presenceSchema,
  lobbyProfileSchema,
  lobbyCommandSchema,
  missionStartSchema,
  stageSchema,
  evidenceSchema,
  abortSchema,
  pulseSchema,
  snapshotSchema,
  snapshotRequestSchema,
  readySchema,
  escapeStartSchema,
  escapeAbortSchema,
  escapeProofSchema,
  escapeSnapshotSchema,
  escapeSnapshotRequestSchema,
  escapeSignalSchema,
  forgeJoinSchema,
  forgeSnapshotRequestSchema,
  forgeSnapshotSchema,
]);

const EXPECTED_STAGE_ACTIONS: Readonly<Record<Line13StageId, readonly Line13ActionId[]>> = {
  'incoming-call': ['lift-receiver'],
  'split-cipher': ['lock-full-warning'],
  'courier-transfer': ['carry-warning', 'release-destination-receipt'],
  'route-reconstruction': ['place-route-section'],
  'synchronized-hangup': ['close-receiver'],
};

const EXPECTED_ACTION_EVIDENCE: Readonly<Record<Line13ActionId, readonly EvidenceKind[]>> = {
  'lift-receiver': ['LIFTED', 'MANUAL_HOLD'],
  'lock-full-warning': ['WARNING_RECONSTRUCTED', 'MANUAL_HOLD'],
  'carry-warning': ['CARRY_STEADY', 'MANUAL_HOLD'],
  'release-destination-receipt': ['RECEIPT_RELEASED'],
  'place-route-section': ['ROUTE_RECONSTRUCTED', 'MANUAL_HOLD'],
  'close-receiver': ['PLACED_FLAT', 'MANUAL_HOLD'],
};

export function isEvidenceAllowedForAction(actionId: Line13ActionId, evidenceKind: EvidenceKind): boolean {
  return EXPECTED_ACTION_EVIDENCE[actionId].includes(evidenceKind);
}

export function actionsForLine13Stage(stageId: Line13StageId): readonly Line13ActionId[] {
  return EXPECTED_STAGE_ACTIONS[stageId];
}

function addIssue(context: z.RefinementCtx, message: string, path: PropertyKey[]): void {
  context.addIssue({ code: 'custom', message, path });
}

export const housewireSessionEventSchema = baseEventSchema.superRefine((event, context) => {
  if (
    (event.kind === 'mission.stage' ||
      event.kind === 'mission.evidence' ||
      event.kind === 'mission.snapshot') &&
    line13StageIds[event.stageIndex] !== event.stageId
  ) {
    addIssue(context, 'Stage id does not match its authored LINE 13 index.', ['stageId']);
  }
  if (event.kind === 'mission.start' && !event.liveNodeIds.includes(event.hostNodeId)) {
    addIssue(context, 'The host must be one of the live mission nodes.', ['hostNodeId']);
  }
  if (event.kind === 'mission.stage') {
    if (event.signalOwnerId !== undefined && !event.requiredNodeIds.includes(event.signalOwnerId)) {
      addIssue(context, 'The signal owner must be required by this stage.', ['signalOwnerId']);
    }
    if (event.stageIndex === 0 && event.requiredNodeIds.length !== 1) {
      addIssue(context, 'The incoming call has exactly one live receiver.', ['requiredNodeIds']);
    }
  }
  if (event.kind === 'mission.evidence') {
    if (!actionsForLine13Stage(event.stageId).includes(event.actionId)) {
      addIssue(context, 'Action does not belong to this stage.', ['actionId']);
    }
    if (!isEvidenceAllowedForAction(event.actionId, event.evidenceKind)) {
      addIssue(context, 'Evidence kind cannot complete this action.', ['evidenceKind']);
    }
  }
  if (event.kind === 'mission.snapshot') {
    const liveNodes = new Set(event.liveNodeIds);
    if (!liveNodes.has(event.hostNodeId)) {
      addIssue(context, 'Snapshot host must be a live mission node.', ['hostNodeId']);
    }
    for (const [index, nodeId] of event.requiredNodeIds.entries()) {
      if (!liveNodes.has(nodeId)) {
        addIssue(context, 'Required nodes must belong to this operation.', ['requiredNodeIds', index]);
      }
    }
    const semanticKeys = new Set<string>();
    for (const [index, completion] of event.completions.entries()) {
      const key = `${completion.nodeId}:${completion.actionId}`;
      if (semanticKeys.has(key)) {
        addIssue(context, 'Snapshot completions must be semantically unique.', ['completions', index]);
      }
      semanticKeys.add(key);
      if (!event.requiredNodeIds.includes(completion.nodeId)) {
        addIssue(context, 'Completion came from a node outside this stage.', ['completions', index, 'nodeId']);
      }
      if (!actionsForLine13Stage(event.stageId).includes(completion.actionId)) {
        addIssue(context, 'Completion action does not belong to this stage.', ['completions', index, 'actionId']);
      }
      if (!isEvidenceAllowedForAction(completion.actionId, completion.evidenceKind)) {
        addIssue(context, 'Completion evidence does not match its action.', ['completions', index, 'evidenceKind']);
      }
    }
    if (event.finishedAt !== undefined && event.stageId !== 'synchronized-hangup') {
      addIssue(context, 'Only the final LINE 13 stage can be marked finished.', ['finishedAt']);
    }
    if ((event.abortedAt === undefined) !== (event.abortedByNodeId === undefined)) {
      addIssue(context, 'Aborted snapshots require both a timestamp and the ending node.', ['abortedAt']);
    }
    if (event.abortedByNodeId !== undefined && !liveNodes.has(event.abortedByNodeId)) {
      addIssue(context, 'The ending node must belong to this operation.', ['abortedByNodeId']);
    }
    if (event.finishedAt !== undefined && event.abortedAt !== undefined) {
      addIssue(context, 'An operation cannot be both finished and aborted.', ['abortedAt']);
    }
  }
  if (event.kind === 'escape.start' && !event.liveNodeIds.includes(event.hostNodeId)) {
    addIssue(context, 'The escape host must be one of the live nodes.', ['hostNodeId']);
  }
  if (event.kind === 'escape.snapshot') {
    const liveNodes = new Set(event.liveNodeIds);
    if (!liveNodes.has(event.hostNodeId)) {
      addIssue(context, 'Escape snapshot host must be a live node.', ['hostNodeId']);
    }
    for (const [index, nodeId] of event.requiredNodeIds.entries()) {
      if (!liveNodes.has(nodeId)) {
        addIssue(context, 'Escape-stage actors must belong to this operation.', ['requiredNodeIds', index]);
      }
    }
    const completionKeys = new Set<string>();
    for (const [index, completion] of event.completions.entries()) {
      if (!liveNodes.has(completion.nodeId)) {
        addIssue(context, 'Escape completion came from outside this operation.', ['completions', index, 'nodeId']);
      }
      const semanticKey = `${completion.nodeId}:${completion.proofKey}`;
      if (completionKeys.has(semanticKey)) {
        addIssue(context, 'Escape completions must be semantically unique.', ['completions', index]);
      }
      completionKeys.add(semanticKey);
    }
    if (event.finishedAt !== undefined && event.abortedAt !== undefined) {
      addIssue(context, 'An escape operation cannot be both finished and aborted.', ['abortedAt']);
    }
  }
  if (event.kind === 'forge.snapshot') {
    const nodeIds = new Set<string>();
    const playerIds = new Set<string>();
    for (const [index, assignment] of event.assignments.entries()) {
      if (nodeIds.has(assignment.nodeId)) {
        addIssue(context, 'A phone can hold only one generated-case role.', ['assignments', index, 'nodeId']);
      }
      if (playerIds.has(assignment.playerId)) {
        addIssue(context, 'A generated-case role can be assigned only once.', ['assignments', index, 'playerId']);
      }
      nodeIds.add(assignment.nodeId);
      playerIds.add(assignment.playerId);
    }
    if (!nodeIds.has(event.hostNodeId)) {
      addIssue(context, 'The generated-case host must hold a role.', ['hostNodeId']);
    }
    if (event.assignments.length > event.playerCount) {
      addIssue(context, 'The generated-case room has more assignments than roles.', ['assignments']);
    }
    if (event.status === 'waiting' && (event.startedAt !== undefined || event.stageStartedAt !== undefined)) {
      addIssue(context, 'A waiting generated case cannot have run timestamps.', ['startedAt']);
    }
    if (event.status !== 'waiting' && (event.startedAt === undefined || event.stageStartedAt === undefined)) {
      addIssue(context, 'A started generated case requires run timestamps.', ['startedAt']);
    }
    if (event.status === 'finished' && (event.finishedAt === undefined || event.stageIndex !== 5)) {
      addIssue(context, 'A finished generated case must close after scene five.', ['finishedAt']);
    }
    if (event.status === 'aborted' && event.abortedAt === undefined) {
      addIssue(context, 'An aborted generated case requires a timestamp.', ['abortedAt']);
    }
    if (event.finishedAt !== undefined && event.abortedAt !== undefined) {
      addIssue(context, 'A generated case cannot be both finished and aborted.', ['abortedAt']);
    }
  }
});

export type HousewireSessionEvent = z.infer<typeof housewireSessionEventSchema>;
export type LobbyProfileEvent = Extract<HousewireSessionEvent, { kind: 'lobby.profile' }>;
export type LobbyCommandEvent = Extract<HousewireSessionEvent, { kind: 'lobby.command' }>;
export type MissionStartEvent = Extract<HousewireSessionEvent, { kind: 'mission.start' }>;
export type MissionStageEvent = Extract<HousewireSessionEvent, { kind: 'mission.stage' }>;
export type MissionEvidenceEvent = Extract<HousewireSessionEvent, { kind: 'mission.evidence' }>;
export type MissionAbortEvent = Extract<HousewireSessionEvent, { kind: 'mission.abort' }>;
export type MissionSnapshotEvent = Extract<HousewireSessionEvent, { kind: 'mission.snapshot' }>;
export type AcceptedCompletion = MissionSnapshotEvent['completions'][number];
export type EscapeStartEvent = Extract<HousewireSessionEvent, { kind: 'escape.start' }>;
export type EscapeAbortEvent = Extract<HousewireSessionEvent, { kind: 'escape.abort' }>;
export type EscapeProofEvent = Extract<HousewireSessionEvent, { kind: 'escape.proof' }>;
export type EscapeSnapshotEvent = Extract<HousewireSessionEvent, { kind: 'escape.snapshot' }>;
export type EscapeSignalEvent = Extract<HousewireSessionEvent, { kind: 'escape.signal' }>;
export type ForgeJoinEvent = Extract<HousewireSessionEvent, { kind: 'forge.join' }>;
export type ForgeSnapshotRequestEvent = Extract<HousewireSessionEvent, { kind: 'forge.snapshot.request' }>;
export type ForgeSnapshotEvent = Extract<HousewireSessionEvent, { kind: 'forge.snapshot' }>;

const joinTicketSchema = z
  .object({
    version: z.literal(1),
    code: z.string().regex(/^[A-Z0-9]{5}$/),
    missionId: z
      .custom<MissionId>((value) => typeof value === 'string' && isMissionId(value), 'Unknown Housewire mission.')
      .default('line-13'),
    relayUrl: z
      .string()
      .max(240)
      .refine((value) => {
        try {
          const url = new URL(value);
          return (url.protocol === 'ws:' || url.protocol === 'wss:') && !url.username && !url.password;
        } catch {
          return false;
        }
      }, 'Join tickets require a ws:// or wss:// relay URL without credentials.'),
  })
  .strict();

export type JoinTicket = z.infer<typeof joinTicketSchema>;

export function makeJoinTicket(
  code: string,
  relayUrl: string,
  missionId: MissionId = 'line-13',
  joinBaseUrl = 'housewire://join',
): string {
  const ticket = joinTicketSchema.parse({ version: 1, code: code.toUpperCase(), missionId, relayUrl });
  const base = joinBaseUrl.replace(/[?&]+$/, '');
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${[
    'v=1',
    `c=${encodeURIComponent(ticket.code)}`,
    `r=${encodeURIComponent(ticket.relayUrl)}`,
    `m=${encodeURIComponent(ticket.missionId)}`,
  ].join('&')}`;
}

export function parseJoinTicket(value: string): JoinTicket | undefined {
  try {
    const legacyMatch = value.match(/[?&]ticket=([^&]+)/);
    const raw = legacyMatch ? decodeURIComponent(legacyMatch[1]) : value;
    if (raw.trim().startsWith('{')) {
      const parsed = joinTicketSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : undefined;
    }

    const url = new URL(value);
    const allowedProtocol = ['housewire:', 'exp:', 'exps:', 'http:', 'https:'].includes(url.protocol);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const isJoinRoute =
      allowedProtocol &&
      (url.hostname.toLowerCase() === 'join' || pathSegments.at(-1)?.toLowerCase() === 'join');
    if (!isJoinRoute) return undefined;
    const parsed = joinTicketSchema.safeParse({
      version: Number(url.searchParams.get('v')),
      code: url.searchParams.get('c'),
      relayUrl: url.searchParams.get('r'),
      missionId: url.searchParams.get('m') ?? undefined,
    });
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export type JoinTicketRouteParam = string | string[] | undefined;

export function parseJoinTicketRouteParams(params: {
  c?: JoinTicketRouteParam;
  m?: JoinTicketRouteParam;
  r?: JoinTicketRouteParam;
  ticket?: JoinTicketRouteParam;
  v?: JoinTicketRouteParam;
}): JoinTicket | undefined {
  const legacy = firstRouteParam(params.ticket);
  if (legacy) {
    const parsed = parseJoinTicket(legacy);
    if (parsed) return parsed;
    try {
      return parseJoinTicket(decodeURIComponent(legacy));
    } catch {
      return undefined;
    }
  }

  const code = firstRouteParam(params.c);
  const relayUrl = firstRouteParam(params.r);
  if (!code || !relayUrl) return undefined;
  const version = firstRouteParam(params.v) ?? '1';
  const missionId = firstRouteParam(params.m) ?? 'line-13';
  return parseJoinTicket(
    `housewire://join?v=${encodeURIComponent(version)}&c=${encodeURIComponent(code)}&r=${encodeURIComponent(relayUrl)}&m=${encodeURIComponent(missionId)}`,
  );
}

function firstRouteParam(value: JoinTicketRouteParam): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function isMissionId(value: string): value is MissionId {
  return value === 'line-13' || value === 'dead-air' || value === 'night-glass' || value === 'long-table';
}

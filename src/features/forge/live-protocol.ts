import { z } from 'zod';

import {
  parseForgePlayerCase,
  type ForgePlayerCase,
  type ForgeStageSubmission,
  type ForgeSubmissionResult,
} from '../../domain/case-forge';
import {
  housewireSessionEventSchema,
  type ForgeSnapshotEvent,
} from '../session/protocol';

const safeId = z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const caseId = z.string().min(1).max(96).regex(/^forge-[a-z0-9-]+-[A-Z0-9]{7}$/);
const timestamp = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const pose = z.enum(['PLACE_FLAT', 'HOLD_UPRIGHT', 'TILT_LEFT', 'TILT_RIGHT', 'FACE_DOWN', 'HOLD_STILL']);
const vocalCue = z.enum(['NONE', 'LOW_HUM', 'SHORT_TONE']);

const submission = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sequence'), value: z.array(safeId).max(8) }).strict(),
  z.object({ kind: z.literal('code'), value: z.string().max(12) }).strict(),
  z.object({
    kind: z.literal('relay'),
    rounds: z.array(z.object({
      round: z.number().int().min(1).max(8),
      recipientPlayerId: safeId,
      token: z.string().trim().max(24),
    }).strict()).max(8),
  }).strict(),
  z.object({ kind: z.literal('route'), value: z.array(z.number().int().min(1).max(16)).max(16) }).strict(),
  z.object({
    kind: z.literal('sync'),
    startedAt: timestamp,
    completedAt: timestamp,
    proofs: z.array(z.object({
      playerId: safeId,
      pose,
      vocalCue,
      evidenceMode: z.enum(['sensor', 'manual']),
    }).strict()).max(4),
  }).strict(),
]);

const result = z.object({
  accepted: z.boolean(),
  code: z.enum([
    'ACCEPTED',
    'INVALID_STAGE',
    'WRONG_SUBMISSION_KIND',
    'INCOMPLETE',
    'WRONG_VALUE',
    'WRONG_RECIPIENT',
    'WRONG_ACTOR',
    'TIMING_WINDOW',
  ]),
  stageId: safeId.optional(),
  acceptedPrefixLength: z.number().int().min(0).max(32).optional(),
  expectedLength: z.number().int().min(0).max(32).optional(),
}).strict();

const directEnvelope = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('forge.case'),
    protocolVersion: z.literal(1),
    caseId,
    operationId: safeId,
    playerId: safeId,
    playerCase: z.unknown(),
    snapshot: z.unknown(),
  }).strict(),
  z.object({
    kind: z.literal('forge.submit'),
    protocolVersion: z.literal(1),
    caseId,
    operationId: safeId,
    requestId: safeId,
    stageIndex: z.number().int().min(0).max(4),
    submission,
  }).strict(),
  z.object({
    kind: z.literal('forge.result'),
    protocolVersion: z.literal(1),
    caseId,
    operationId: safeId,
    requestId: safeId,
    result,
  }).strict(),
  z.object({
    kind: z.literal('forge.hint'),
    protocolVersion: z.literal(1),
    caseId,
    operationId: safeId,
    requestId: safeId,
    stageIndex: z.number().int().min(0).max(4),
  }).strict(),
  z.object({
    kind: z.literal('forge.hint.result'),
    protocolVersion: z.literal(1),
    caseId,
    operationId: safeId,
    requestId: safeId,
    accepted: z.boolean(),
    count: z.number().int().min(0).max(3),
  }).strict(),
]);

export type ForgeLiveDirectMessage =
  | {
      kind: 'forge.case';
      protocolVersion: 1;
      caseId: string;
      operationId: string;
      playerId: string;
      playerCase: ForgePlayerCase;
      snapshot: ForgeSnapshotEvent;
    }
  | {
      kind: 'forge.submit';
      protocolVersion: 1;
      caseId: string;
      operationId: string;
      requestId: string;
      stageIndex: number;
      submission: ForgeStageSubmission;
    }
  | {
      kind: 'forge.result';
      protocolVersion: 1;
      caseId: string;
      operationId: string;
      requestId: string;
      result: ForgeSubmissionResult;
    }
  | {
      kind: 'forge.hint';
      protocolVersion: 1;
      caseId: string;
      operationId: string;
      requestId: string;
      stageIndex: number;
    }
  | {
      kind: 'forge.hint.result';
      protocolVersion: 1;
      caseId: string;
      operationId: string;
      requestId: string;
      accepted: boolean;
      count: number;
    };

export function parseForgeLiveDirectMessage(value: unknown): ForgeLiveDirectMessage | undefined {
  const parsed = directEnvelope.safeParse(value);
  if (!parsed.success) return undefined;
  if (parsed.data.kind !== 'forge.case') return parsed.data as ForgeLiveDirectMessage;
  try {
    const snapshot = housewireSessionEventSchema.parse(parsed.data.snapshot);
    if (snapshot.kind !== 'forge.snapshot') return undefined;
    const playerCase = parseForgePlayerCase(parsed.data.playerCase);
    if (
      snapshot.caseId !== parsed.data.caseId ||
      snapshot.operationId !== parsed.data.operationId ||
      playerCase.id !== parsed.data.caseId ||
      playerCase.role.playerId !== parsed.data.playerId
    ) return undefined;
    return { ...parsed.data, playerCase, snapshot };
  } catch {
    return undefined;
  }
}

export interface ForgeJoinTicket {
  version: 1;
  code: string;
  relayUrl: string;
  caseId: string;
}

const joinTicket = z.object({
  version: z.literal(1),
  code: z.string().regex(/^[A-Z0-9]{5}$/),
  relayUrl: z.string().max(240).refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'ws:' || url.protocol === 'wss:') && !url.username && !url.password;
    } catch {
      return false;
    }
  }),
  caseId,
}).strict();

export function makeForgeJoinTicket(
  code: string,
  relayUrl: string,
  forgeCaseId: string,
  joinBaseUrl: string,
): string {
  const ticket = joinTicket.parse({ version: 1, code: code.toUpperCase(), relayUrl, caseId: forgeCaseId });
  const separator = joinBaseUrl.includes('?') ? '&' : '?';
  return `${joinBaseUrl.replace(/[?&]+$/, '')}${separator}${[
    'v=1',
    `c=${encodeURIComponent(ticket.code)}`,
    `r=${encodeURIComponent(ticket.relayUrl)}`,
    `f=${encodeURIComponent(ticket.caseId)}`,
  ].join('&')}`;
}

export function parseForgeJoinTicket(value: string): ForgeJoinTicket | undefined {
  try {
    const url = new URL(value);
    const allowedProtocol = ['housewire:', 'exp:', 'exps:', 'http:', 'https:'].includes(url.protocol);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const isForgeJoin = allowedProtocol &&
      (url.hostname.toLowerCase() === 'forge-join' || pathSegments.at(-1)?.toLowerCase() === 'forge-join');
    if (!isForgeJoin) return undefined;
    const parsed = joinTicket.safeParse({
      version: Number(url.searchParams.get('v')),
      code: url.searchParams.get('c'),
      relayUrl: url.searchParams.get('r'),
      caseId: url.searchParams.get('f'),
    });
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function parseForgeJoinRouteParams(params: {
  c?: string | string[];
  f?: string | string[];
  r?: string | string[];
  v?: string | string[];
}): ForgeJoinTicket | undefined {
  const code = first(params.c);
  const relayUrl = first(params.r);
  const forgeCaseId = first(params.f);
  const version = first(params.v);
  if (!code || !relayUrl || !forgeCaseId || !version) return undefined;
  const parsed = joinTicket.safeParse({
    version: Number(version),
    code,
    relayUrl,
    caseId: forgeCaseId,
  });
  return parsed.success ? parsed.data : undefined;
}

export function forgeSubmission(value: ForgeStageSubmission): ForgeStageSubmission {
  return submission.parse(value) as ForgeStageSubmission;
}

export function forgeSubmissionResult(value: ForgeSubmissionResult): ForgeSubmissionResult {
  return result.parse(value) as ForgeSubmissionResult;
}

function first(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

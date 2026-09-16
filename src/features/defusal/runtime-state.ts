import { z } from 'zod';
import { compileDefusal, tickDefusal, type DefusalRole, type DefusalState, type DefusalView } from '../../domain/defusal';
import { defusalViewSchema } from './protocol';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const role = z.enum(['operator', 'archivist', 'witness']);
const authoritySchema = z.object({
  id, hostId: id, mode: z.enum(['practice', 'live']), seed: z.number().int().min(0).max(0xffff_ffff), tutorial: z.boolean(),
  players: z.array(z.object({ id, name: z.string().trim().min(1).max(24), role }).strict()).min(1).max(4),
  status: z.enum(['waiting', 'playing', 'defused', 'failed']), stageIndex: z.number().int().min(0).max(4),
  revision: z.number().int().min(0).max(1_000_000), strikes: z.number().int().min(0).max(5),
  startedAt: time.optional(), deadline: time.optional(), finishedAt: time.optional(), cooldownUntil: time,
  readyNodeIds: z.array(id).max(4), seenActionIds: z.array(id).max(128), feedback: z.string().max(500).optional(),
}).strict();
const persistedSchema = z.object({
  version: z.literal(1), mode: z.enum(['practice', 'live']), localNodeId: id,
  code: z.string().regex(/^[A-Z0-9]{5}$/).optional(),
  relayUrl: z.string().max(240).refine((value) => {
    try { const url = new URL(value); return ['ws:', 'wss:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
  }).optional(),
  practiceRole: role, authority: authoritySchema.optional(), guestView: defusalViewSchema.optional(),
}).strict();
export interface DefusalSaveable {
  authority?: DefusalState; guestView?: DefusalView; mode?: 'live' | 'practice';
  code?: string; relayUrl?: string; practiceRole: DefusalRole;
}
export interface DefusalIdentity { localNodeId: string; sessionCode?: string | null; relayUrl?: string | null; sessionMode?: string }
export function serializeDefusalRuntime(value: DefusalSaveable, localNodeId: string): string | undefined {
  if (!value.mode) return undefined;
  const a = value.authority;
  const authority = a ? {
    id: a.id, hostId: a.hostId, mode: a.mode, seed: a.game.seed, tutorial: a.game.tutorial,
    players: a.players, status: a.status, stageIndex: a.stageIndex, revision: a.revision,
    strikes: a.strikes, startedAt: a.startedAt, deadline: a.deadline, finishedAt: a.finishedAt,
    cooldownUntil: a.cooldownUntil, readyNodeIds: a.readyNodeIds, seenActionIds: a.seenActionIds, feedback: a.feedback,
  } : undefined;
  return JSON.stringify(persistedSchema.parse({ version: 1, mode: value.mode, localNodeId, code: value.code, relayUrl: value.relayUrl, practiceRole: value.practiceRole, authority, guestView: a ? undefined : value.guestView }));
}
export function parseDefusalRuntime(serialized: string, identity: DefusalIdentity, now: number): DefusalSaveable | undefined {
  try {
    const result = persistedSchema.safeParse(JSON.parse(serialized));
    if (!result.success) return undefined;
    const data = result.data;
    if (data.mode === 'live' && (identity.sessionMode !== 'lan' || data.localNodeId !== identity.localNodeId || data.code !== identity.sessionCode || data.relayUrl !== identity.relayUrl)) return undefined;
    if (data.authority && data.guestView) return undefined;
    const saved = data.authority;
    let authority: DefusalState | undefined;
    if (saved) {
      // Only the stored host identity can recover a compiled device with answers.
      if (saved.hostId !== data.localNodeId || saved.mode !== data.mode || saved.players[0].id !== saved.hostId || saved.players[0].role !== 'operator') return undefined;
      const game = compileDefusal(saved.seed, saved.tutorial);
      if (saved.stageIndex > game.modules.length || saved.strikes > game.maxStrikes) return undefined;
      if (saved.status === 'defused' && saved.stageIndex !== game.modules.length) return undefined;
      if (saved.status === 'playing' && (saved.stageIndex === game.modules.length || saved.startedAt === undefined || saved.deadline !== saved.startedAt + game.durationMs)) return undefined;
      if (new Set(saved.players.map((player) => player.id)).size !== saved.players.length || saved.readyNodeIds.some((nodeId) => !saved.players.some((player) => player.id === nodeId))) return undefined;
      const { seed: _seed, tutorial: _tutorial, ...fields } = saved;
      authority = tickDefusal({ ...fields, game }, now);
    }
    if (data.guestView && (!data.guestView.players.some((player) => player.id === data.localNodeId && player.role === data.guestView!.role) || data.mode !== 'live')) return undefined;
    return { mode: data.mode, code: data.code, relayUrl: data.relayUrl, practiceRole: data.practiceRole, authority, guestView: data.guestView };
  } catch { return undefined; }
}

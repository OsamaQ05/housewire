import { z } from 'zod';
import type { DefusalAction, DefusalView } from '../../domain/defusal';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const role = z.enum(['operator', 'archivist', 'witness']);
const paper = z.object({ heading: z.string().max(120), lines: z.array(z.string().max(600)).max(10) }).strict();
const device = z.object({
  instruction: z.string().max(700),
  options: z.array(z.object({ id, label: z.string().max(80), detail: z.string().max(100).optional(), x: z.number().min(0).max(3).optional(), y: z.number().min(0).max(3).optional() }).strict()).max(12),
  selectionCount: z.number().int().min(1).max(9), ordered: z.boolean(), textEntry: z.boolean().optional(),
  indicator: z.string().max(100).optional(), edges: z.array(z.tuple([id, id])).max(24).optional(), start: id.optional(), end: id.optional(),
}).strict();
export const defusalViewSchema: z.ZodType<DefusalView> = z.object({
  id, mode: z.enum(['practice', 'live']), tutorial: z.boolean(), status: z.enum(['waiting', 'playing', 'defused', 'failed']), role,
  players: z.array(z.object({ id, name: z.string().trim().min(1).max(24), role }).strict()).min(1).max(4),
  stageIndex: z.number().int().min(0).max(4), moduleCount: z.number().int().min(1).max(4), revision: z.number().int().min(0).max(1_000_000),
  strikes: z.number().int().min(0).max(5), maxStrikes: z.number().int().min(1).max(5),
  startedAt: time.optional(), deadline: time.optional(), finishedAt: time.optional(), cooldownUntil: time,
  readyNodeIds: z.array(id).max(4), seals: z.array(z.object({ title: z.string().max(100), text: z.string().max(100) }).strict()).max(4), feedback: z.string().max(500).optional(),
  module: z.object({ id, kind: z.enum(['sockets', 'leads', 'route', 'phrase']), title: z.string().max(120), objective: z.string().max(300), device: device.optional(), manual: paper.optional(), witness: paper.optional() }).strict().optional(),
  review: z.array(z.object({ title: z.string().max(120), answer: z.string().max(1000), explanation: z.string().max(4000) }).strict()).max(4).optional(),
}).strict().superRefine((view, context) => {
  if (view.review && view.status !== 'failed') context.addIssue({ code: 'custom', message: 'Answers cannot be revealed while the game is active.' });
  if (view.module?.device && view.role !== 'operator') context.addIssue({ code: 'custom', message: 'A reader cannot receive device data.' });
  if (view.module?.manual && view.role !== 'archivist') context.addIssue({ code: 'custom', message: 'Only the Archivist receives manual data.' });
  if (view.module?.witness && view.role !== 'witness' && !(view.role === 'archivist' && view.mode === 'live' && view.players.length === 2)) context.addIssue({ code: 'custom', message: 'Witness clues require the Witness role or combined two-player role.' });
});
const actionBase = { actionId: id, operationId: id, stageIndex: z.number().int().min(0).max(3) };
export const defusalActionSchema: z.ZodType<DefusalAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), ...actionBase }).strict(),
  z.object({ type: z.literal('commit'), ...actionBase, answer: z.array(z.string().max(160)).min(1).max(9) }).strict(),
]);
export const defusalMessageSchema = z.discriminatedUnion('type', [
  z.object({ channel: z.literal('last-light-v1'), type: z.literal('join'), name: z.string().trim().min(1).max(24) }).strict(),
  z.object({ channel: z.literal('last-light-v1'), type: z.literal('request') }).strict(),
  z.object({ channel: z.literal('last-light-v1'), type: z.literal('action'), action: defusalActionSchema }).strict(),
  z.object({ channel: z.literal('last-light-v1'), type: z.literal('snapshot'), recipientId: id, hostNow: time, view: defusalViewSchema }).strict(),
  z.object({ channel: z.literal('last-light-v1'), type: z.literal('notice'), text: z.string().max(500) }).strict(),
]);
export type DefusalMessage = z.infer<typeof defusalMessageSchema>;

import { z } from 'zod';

import { STORY_CONTENT_VERSION, STORY_ROOM_IDS, type StoryAction, type StoryState } from './types';
import { getStoryRoom } from './catalog';
import { allowsStoryChoice } from './interaction-rules';
import { isActivityKind } from './activities/contracts';
import { activityMoveSchema, activityStateSchema, isActivitySolved } from './activities/registry';

const id = z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const timestamp = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const stageIndex = z.number().int().min(0).max(9);
const playerSchema = z.object({ id, name: z.string().trim().min(1).max(24) }).strict();

/** Public board and lifecycle only. Authored solutions/private clues never travel in this state. */
export const storyStateSchema = z.object({
  version: z.literal(1), contentVersion: z.literal(STORY_CONTENT_VERSION), operationId: id, roomId: z.enum(STORY_ROOM_IDS),
  seed: z.number().int().min(0).max(0xffff_ffff),
  players: z.array(playerSchema).min(2).max(4),
  stageIndex, draft: z.array(z.string().max(64)).max(16),
  revision: z.number().int().min(0).max(100_000),
  attemptsUsed: z.number().int().min(0).max(5), startedAt: timestamp, deadlineAt: timestamp,
  status: z.enum(['playing', 'stage-solved', 'won', 'failed', 'aborted']),
  solvedStages: z.array(stageIndex).max(10), assistedStages: z.array(stageIndex).max(10).default([]),
  chapterAttemptsUsed: z.number().int().min(0).max(5).default(0), processedActionIds: z.array(id).max(512),
  feedback: z.string().max(2000).optional(), lastSubmittedDraft: z.array(z.string().max(64)).max(16).optional(),
  activeProbe: id.optional(),
  activity: activityStateSchema.optional(),
  endedAt: timestamp.optional(),
}).strict().superRefine((state, context) => {
  const room = getStoryRoom(state.roomId, state.seed);
  const stage = room.stages[state.stageIndex];
  const activity = isActivityKind(stage?.interaction?.kind);
  if (!stage || state.draft.length !== (activity ? 0 : stage.slots.length) || state.draft.some((value, slot) => !allowsStoryChoice(stage, slot, value))) {
    context.addIssue({ code: 'custom', message: 'The board must match this authored chapter.', path: ['draft'] });
  }
  if (activity ? !state.activity || state.activity.kind !== stage?.interaction?.kind : state.activity !== undefined) {
    context.addIssue({ code: 'custom', message: 'Physical progress must match this chapter’s activity.', path: ['activity'] });
  }
  if (activity && state.activity && (state.status === 'stage-solved' || state.status === 'won') && !state.assistedStages.includes(state.stageIndex) && !isActivitySolved(state.activity)) {
    context.addIssue({ code: 'custom', message: 'A clean finish requires completing the physical activity.', path: ['activity'] });
  }
  if (state.attemptsUsed > room.attemptLimit || state.chapterAttemptsUsed > room.attemptLimit || state.deadlineAt !== state.startedAt + room.minutes * 60_000) {
    context.addIssue({ code: 'custom', message: 'The original room limits cannot change.', path: ['deadlineAt'] });
  }
  if (state.activeProbe && !stage?.experiments?.some((probe) => probe.id === state.activeProbe)) {
    context.addIssue({ code: 'custom', message: 'The experiment must belong to this chapter.', path: ['activeProbe'] });
  }
  if (state.status === 'won' && (state.stageIndex !== room.stages.length - 1 || state.solvedStages.length + state.assistedStages.length !== room.stages.length)) {
    context.addIssue({ code: 'custom', message: 'Every chapter must be solved or explicitly revealed before the room ends.', path: ['status'] });
  }
  if (new Set(state.players.map((player) => player.id)).size !== state.players.length) {
    context.addIssue({ code: 'custom', message: 'A story role belongs to one phone only.', path: ['players'] });
  }
  if (state.deadlineAt <= state.startedAt || state.deadlineAt - state.startedAt > 2 * 60 * 60_000) {
    context.addIssue({ code: 'custom', message: 'The story needs a bounded original deadline.', path: ['deadlineAt'] });
  }
  if (new Set(state.processedActionIds).size !== state.processedActionIds.length) {
    context.addIssue({ code: 'custom', message: 'Action receipts must be unique.', path: ['processedActionIds'] });
  }
  if (new Set(state.solvedStages).size !== state.solvedStages.length || state.solvedStages.some((index) => index > state.stageIndex)) {
    context.addIssue({ code: 'custom', message: 'Solved chapters cannot skip into the future.', path: ['solvedStages'] });
  }
  if (new Set(state.assistedStages).size !== state.assistedStages.length || state.assistedStages.some((index) => index > state.stageIndex || state.solvedStages.includes(index))) {
    context.addIssue({ code: 'custom', message: 'Revealed chapters cannot be future chapters or earn solved credit.', path: ['assistedStages'] });
  }
});

export const storyActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('act'), id, stageIndex, ...activityMoveSchema.shape }).strict(),
  z.object({ kind: z.literal('edit'), id, stageIndex, slot: z.number().int().min(0).max(15), value: z.string().max(64) }).strict(),
  z.object({ kind: z.literal('submit'), id, stageIndex }).strict(),
  z.object({ kind: z.literal('continue'), id, stageIndex }).strict(),
  z.object({ kind: z.literal('abort'), id, stageIndex }).strict(),
  z.object({ kind: z.literal('reveal'), id, stageIndex }).strict(),
  z.object({ kind: z.literal('probe'), id, stageIndex, probeId: id }).strict(),
]);

export const storySnapshotSchema = z.object({
  kind: z.literal('story.snapshot'), roomId: z.enum(STORY_ROOM_IDS),
  operationId: id, hostNodeId: id, sentAt: timestamp, state: storyStateSchema,
}).strict();

export const storyActionEventSchema = z.object({
  kind: z.literal('story.action'), roomId: z.enum(STORY_ROOM_IDS),
  operationId: id, nodeId: id, action: storyActionSchema, sentAt: timestamp,
}).strict();

export const storyRequestSchema = z.object({
  kind: z.literal('story.request'), roomId: z.enum(STORY_ROOM_IDS),
  nodeId: id, knownOperationId: id.optional(), sentAt: timestamp,
}).strict();

export const storyEventSchema = z.discriminatedUnion('kind', [
  storySnapshotSchema, storyActionEventSchema, storyRequestSchema,
]);
export type StoryNetworkEvent = z.infer<typeof storyEventSchema>;
export type StorySnapshot = z.infer<typeof storySnapshotSchema>;

export function makeStorySnapshot(state: StoryState, sentAt: number): StorySnapshot {
  return storySnapshotSchema.parse({
    kind: 'story.snapshot', roomId: state.roomId, operationId: state.operationId,
    hostNodeId: state.players[0].id, sentAt: Math.round(sentAt), state,
  });
}

/** Trust relay sender metadata, never an identity claimed inside the payload. */
export function authenticateStoryAction(state: StoryState, raw: unknown, senderId: string): StoryAction | undefined {
  const parsed = storyActionEventSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const event = parsed.data;
  if (senderId !== event.nodeId || event.roomId !== state.roomId || event.operationId !== state.operationId ||
      event.action.stageIndex !== state.stageIndex || !state.players.some((player) => player.id === senderId)) return undefined;
  if ((event.action.kind === 'continue' || event.action.kind === 'abort' || event.action.kind === 'reveal') && senderId !== state.players[0].id) return undefined;
  if (event.action.kind === 'act') {
    const stage = getStoryRoom(state.roomId, state.seed).stages[state.stageIndex];
    const player = state.players.findIndex(member => member.id === senderId);
    if (!isActivityKind(stage.interaction?.kind) || !state.activity || state.activity.kind !== stage.interaction.kind || stage.slots[event.action.control]?.seat % state.players.length !== player) return undefined;
  }
  return event.action;
}

export function acceptStorySnapshot(options: {
  raw: unknown; senderId: string; hostNodeId: string; localNodeId: string;
  roomId: StoryState['roomId']; current?: StoryState;
}): StorySnapshot | undefined {
  const parsed = storySnapshotSchema.safeParse(options.raw);
  if (!parsed.success) return undefined;
  const event = parsed.data;
  const next = event.state;
  if (options.senderId !== options.hostNodeId || event.hostNodeId !== options.hostNodeId ||
      event.hostNodeId !== next.players[0].id || event.roomId !== options.roomId || next.roomId !== options.roomId ||
      event.operationId !== next.operationId || !next.players.some((player) => player.id === options.localNodeId)) return undefined;
  const current = options.current;
  if (current?.operationId === next.operationId) {
    if (next.revision < current.revision || next.startedAt !== current.startedAt || next.deadlineAt !== current.deadlineAt ||
        next.seed !== current.seed || JSON.stringify(next.players) !== JSON.stringify(current.players) ||
        current.assistedStages.some((index) => !next.assistedStages.includes(index))) return undefined;
    // Same revision may update clock synchronisation, never the board.
    if (next.revision === current.revision && JSON.stringify(next) !== JSON.stringify(storyStateSchema.parse(current))) return undefined;
  } else if (current && next.startedAt <= current.startedAt) return undefined;
  return event;
}

import type { StoryInteraction } from './interaction-types';
import type { ActivityState } from './activities/registry';

export const STORY_ROOM_IDS = ['line-13', 'night-glass', 'long-table'] as const;
export const STORY_CONTENT_VERSION = 6 as const;
export type StoryRoomId = (typeof STORY_ROOM_IDS)[number];
export type StoryKind = 'rhythm' | 'investigation' | 'circuit' | 'sequence' | 'map' | 'table' | 'routing';
export interface StoryOption { id: string; label: string; detail?: string; icon?: string; turn?: number }
export interface StorySlot { id: string; label: string; seat: number; optionIds?: string[] }
export interface StoryClue {
  id: string; title: string; lines: string[]; seat: number;
  /** Positive beat values are tones in ms; negative values are silent group gaps. */
  medium: 'note' | 'audio' | 'lens'; beats?: number[]; spokenText?: string;
  illustration?: 'station' | 'floorplan' | 'table' | 'duct' | 'light';
  diagram?: { nodes: string[]; caption: string };
  scanTargetSeat?: number;
  observations?: { probeId: string; lines: string[]; beats?: number[] }[];
}
export type StoryConstraint =
  | { kind: 'at'; item: string; slot: number }
  | { kind: 'not-at'; item: string; slot: number }
  | { kind: 'before'; first: string; second: string }
  | { kind: 'adjacent'; first: string; second: string }
  | { kind: 'grid-adjacent'; first: string; second: string }
  | { kind: 'offset'; first: string; second: string; distance: number }
  | { kind: 'include'; item: string }
  | { kind: 'exclude'; item: string };
export interface StoryStage {
  id: string; title: string; story: string; objective: string; instruction: string;
  kind: StoryKind; slots: StorySlot[]; options: StoryOption[]; clues: StoryClue[];
  layout?: 'grid' | 'line' | 'table' | 'circuit';
  interaction?: StoryInteraction;
  constraints: StoryConstraint[]; answer: string[];
  revelation: string; explanation: string; hints: string[];
  experiments?: { id: string; label: string }[];
}
export interface StoryRoom {
  id: StoryRoomId; title: string; subtitle: string; opening: string; ending: string;
  accent: string; paper: string; minutes: number; attemptLimit: number;
  roles: [string, string, string, string]; stages: StoryStage[];
}
export interface StoryPlayer { id: string; name: string }
export interface StoryState {
  version: 1; contentVersion: typeof STORY_CONTENT_VERSION; operationId: string; roomId: StoryRoomId; seed: number;
  players: StoryPlayer[]; stageIndex: number; draft: string[]; revision: number;
  attemptsUsed: number; startedAt: number; deadlineAt: number;
  status: 'playing' | 'stage-solved' | 'won' | 'failed' | 'aborted';
  solvedStages: number[]; assistedStages: number[]; chapterAttemptsUsed: number;
  processedActionIds: string[]; feedback?: string;
  activeProbe?: string;
  activity?: ActivityState;
  lastSubmittedDraft?: string[];
  endedAt?: number;
}
export type StoryAction =
  | { kind: 'act'; id: string; stageIndex: number; control: number; command: string; value?: number }
  | { kind: 'edit'; id: string; stageIndex: number; slot: number; value: string }
  | { kind: 'submit'; id: string; stageIndex: number }
  | { kind: 'continue'; id: string; stageIndex: number }
  | { kind: 'abort'; id: string; stageIndex: number }
  | { kind: 'reveal'; id: string; stageIndex: number }
  | { kind: 'probe'; id: string; stageIndex: number; probeId: string };
export interface StoryPlayerView {
  room: Omit<StoryRoom, 'stages'>; stage: Omit<StoryStage, 'answer' | 'constraints' | 'explanation'>;
  playerId: string; ownedSlots: number[]; roleNames: string[];
}
export function isStoryRoomId(value: string): value is StoryRoomId {
  return (STORY_ROOM_IDS as readonly string[]).includes(value);
}

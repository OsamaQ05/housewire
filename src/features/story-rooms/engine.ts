import { getStoryRoom } from './catalog';
import { allowsStoryChoice, filmComposite, initialStoryDraft, interactionIssues, optionsForSlot, projectInteraction, satisfiesInteraction } from './interaction-rules';
import { STORY_CONTENT_VERSION, isStoryRoomId, type StoryAction, type StoryConstraint, type StoryPlayer, type StoryPlayerView, type StoryRoom, type StoryRoomId, type StoryStage, type StoryState } from './types';
import { isActivityKind } from './activities/contracts';
import { activityStateSchema, createActivityState, isActivitySolved, reduceActivityState, type ActivityState } from './activities/registry';

const MAX_PROCESSED_ACTIONS = 256;

function satisfies(answer: string[], constraint: StoryConstraint): boolean {
  if (constraint.kind === 'include') return answer.includes(constraint.item);
  if (constraint.kind === 'exclude') return !answer.includes(constraint.item);
  if (constraint.kind === 'at') return answer[constraint.slot] === constraint.item;
  if (constraint.kind === 'not-at') return answer[constraint.slot] !== constraint.item;
  const first = answer.indexOf(constraint.first);
  const second = answer.indexOf(constraint.second);
  if (first < 0 || second < 0) return false;
  if (constraint.kind === 'before') return first < second;
  if (constraint.kind === 'adjacent') return Math.abs(second - first) === 1;
  if (constraint.kind === 'grid-adjacent') return Math.abs((first % 2) - (second % 2)) + Math.abs(Math.floor(first / 2) - Math.floor(second / 2)) === 1;
  return second - first === constraint.distance;
}

/** Small finite search: at most 6! arrangements, independently checks authored solutions. */
export function solveStage(stage: StoryStage): string[][] {
  if (isActivityKind(stage.interaction?.kind)) return [];
  if (stage.options.length > 24 || stage.slots.length > 6 || stage.slots.length > stage.options.length) return [];
  if (stage.options.length > 6 && stage.slots.some(slot => !slot.optionIds)) return [];
  const results: string[][] = [];
  const visit = (draft: string[]) => {
    if (draft.length === stage.slots.length) {
      if (stage.constraints.every((constraint) => satisfies(draft, constraint)) && satisfiesInteraction(stage, draft)) results.push(draft);
      return;
    }
    for (const option of optionsForSlot(stage, draft.length)) if (!draft.includes(option.id)) visit([...draft, option.id]);
  };
  visit([]);
  return results;
}

export function validateStoryRoom(room: StoryRoom): string[] {
  const issues: string[] = [];
  if (!isStoryRoomId(room.id)) issues.push('Unknown room ID.');
  if (!Number.isFinite(room.minutes) || room.minutes <= 0 || room.minutes > 90) issues.push('Room duration must be between 1 and 90 minutes.');
  if (!Number.isInteger(room.attemptLimit) || room.attemptLimit < 3 || room.attemptLimit > 5) issues.push('Attempts must be limited to 3–5.');
  if (room.roles.length !== 4 || room.roles.some((role) => !role.trim())) issues.push('Four named evidence roles are required.');
  if (!room.stages.length) issues.push('A room needs stages.');
  if (room.stages.filter(stage => stage.clues.length > 0 && !isActivityKind(stage.interaction?.kind)).length > 2) issues.push('A room may contain at most two written-clue answer chapters.');
  if (new Set(room.stages.map((stage) => stage.id)).size !== room.stages.length) issues.push('Stage IDs must be unique.');
  room.stages.forEach((stage) => {
    const prefix = `${stage.id}: `;
    const activity = isActivityKind(stage.interaction?.kind);
    const optionIds = stage.options.map((option) => option.id);
    if (stage.slots.length < 4 || stage.slots.length > 6) issues.push(`${prefix}use 4–6 shared controls.`);
    if (stage.layout === 'grid' && stage.slots.length !== 4) issues.push(`${prefix}the map must contain exactly four row-major positions.`);
    if (!activity && (stage.options.length < stage.slots.length || stage.options.length > (stage.slots.every(slot => slot.optionIds) ? 24 : 6))) issues.push(`${prefix}use at most six options per control.`);
    issues.push(...interactionIssues(stage).map(issue => prefix + issue));
    if (new Set(optionIds).size !== optionIds.length || optionIds.some((id) => !id)) issues.push(`${prefix}option IDs must be nonempty and unique.`);
    if (new Set(stage.slots.map((slot) => slot.id)).size !== stage.slots.length) issues.push(`${prefix}slot IDs must be unique.`);
    if (new Set(stage.clues.map((clue) => clue.id)).size !== stage.clues.length) issues.push(`${prefix}clue IDs must be unique.`);
    for (let seat = 0; seat < 4; seat += 1) {
      if (!stage.slots.some((slot) => slot.seat === seat)) issues.push(`${prefix}seat ${seat} needs a control.`);
      if (!activity && stage.interaction?.kind !== 'lightbox' && !stage.clues.some((clue) => clue.seat === seat)) issues.push(`${prefix}seat ${seat} needs private evidence.`);
    }
    if ([...stage.slots, ...stage.clues].some(({ seat }) => !Number.isInteger(seat) || seat < 0 || seat > 3)) issues.push(`${prefix}evidence seats must be 0–3.`);
    if (stage.clues.some((clue) => !clue.lines.length || clue.lines.some((line) => !line.trim()))) issues.push(`${prefix}evidence must be readable without sensors.`);
    if (stage.clues.some((clue) => clue.beats?.some((beat) => !Number.isFinite(beat) || beat === 0 || Math.abs(beat) > 5000))) issues.push(`${prefix}audio timings must be bounded nonzero milliseconds; negative values are silent gaps.`);
    if (stage.clues.some((clue) => clue.scanTargetSeat !== undefined && (!Number.isInteger(clue.scanTargetSeat) || clue.scanTargetSeat < 0 || clue.scanTargetSeat > 3))) issues.push(`${prefix}lens targets must name an evidence seat.`);
    const experimentIds = stage.experiments?.map((experiment) => experiment.id) ?? [];
    if (new Set(experimentIds).size !== experimentIds.length || experimentIds.some((id) => !id)) issues.push(`${prefix}experiment IDs must be nonempty and unique.`);
    if (stage.clues.some((clue) => clue.observations?.some((observation) => !experimentIds.includes(observation.probeId) || !observation.lines.length))) issues.push(`${prefix}observations need a known experiment and readable evidence.`);
    for (const constraint of stage.constraints) {
      const references = 'item' in constraint ? [constraint.item] : [constraint.first, constraint.second];
      if (references.some((id) => !optionIds.includes(id))) issues.push(`${prefix}constraint references an unknown option.`);
      if ('slot' in constraint && (!Number.isInteger(constraint.slot) || constraint.slot < 0 || constraint.slot >= stage.slots.length)) issues.push(`${prefix}constraint references an invalid slot.`);
      if (constraint.kind === 'offset' && (!Number.isInteger(constraint.distance) || !constraint.distance || Math.abs(constraint.distance) >= stage.slots.length)) issues.push(`${prefix}invalid positional offset.`);
      if (constraint.kind === 'grid-adjacent' && (stage.layout !== 'grid' || stage.slots.length !== 4)) issues.push(`${prefix}grid-adjacent requires a four-position grid layout.`);
    }
    if (isActivityKind(stage.interaction?.kind)) {
      if (stage.slots.length !== 4 || stage.options.length || stage.constraints.length || stage.answer.length) issues.push(`${prefix}activities need four controls and no arrangement answer.`);
      const initial = createActivityState(stage.interaction.kind);
      if (!activityStateSchema.safeParse(initial).success || initial.kind !== stage.interaction.kind || isActivitySolved(initial)) issues.push(`${prefix}the activity needs a valid unsolved initial state.`);
    } else {
      if (stage.answer.length !== stage.slots.length || new Set(stage.answer).size !== stage.answer.length || stage.answer.some((id) => !optionIds.includes(id))) issues.push(`${prefix}answer must fill every slot with a different valid option.`);
      const solutions = solveStage(stage);
      if (solutions.length !== 1) issues.push(`${prefix}expected exactly one solution; found ${solutions.length}.`);
      else if (solutions[0].join('|') !== stage.answer.join('|')) issues.push(`${prefix}authored answer does not match evidence constraints.`);
    }
    if (!stage.objective.trim() || !stage.instruction.trim() || !stage.explanation.trim() || !stage.revelation.trim() || !stage.hints.length) issues.push(`${prefix}objective, instructions, hints, and debrief are required.`);
  });
  return issues;
}

export function createStoryState(roomId: StoryRoomId, players: StoryPlayer[], seed: number, operationId: string, now: number): StoryState {
  if (!isStoryRoomId(roomId)) throw new Error('Choose an available story room.');
  if (!players.length || players.length > 4 || players.some((player) => !player.id.trim()) || new Set(players.map((player) => player.id)).size !== players.length) throw new Error('A story needs 1–4 different players.');
  if (!operationId.trim() || operationId.length > 160 || !Number.isFinite(now) || !Number.isFinite(seed) || !Number.isInteger(seed)) throw new Error('Invalid story session.');
  const room = getStoryRoom(roomId, seed);
  return {
    version: 1, contentVersion: STORY_CONTENT_VERSION, operationId, roomId, seed: seed >>> 0,
    players: players.map((player, index) => ({ id: player.id, name: player.name.trim().slice(0, 24) || `Player ${index + 1}` })),
    stageIndex: 0, draft: initialStoryDraft(room.stages[0]), revision: 0,
    activity: isActivityKind(room.stages[0].interaction?.kind) ? createActivityState(room.stages[0].interaction.kind) : undefined,
    attemptsUsed: 0, startedAt: now, deadlineAt: now + room.minutes * 60_000,
    status: 'playing', solvedStages: [], assistedStages: [], chapterAttemptsUsed: 0, processedActionIds: [],
  };
}

export function expireStoryState(state: StoryState, now: number): StoryState {
  // Revealing a chapter turns this into an unranked, untimed exploration. The
  // original deadline remains in the record; it is never silently extended.
  if (!state.assistedStages.length && Number.isFinite(now) && now >= state.deadlineAt && (state.status === 'playing' || state.status === 'stage-solved')) {
    return { ...state, revision: state.revision + 1, status: 'failed', endedAt: state.deadlineAt, feedback: 'Time is up. Your evidence and the explanation are ready to review.' };
  }
  return state;
}

export function reduceStoryAction(state: StoryState, action: StoryAction, senderId: string, now: number): StoryState {
  if (!Number.isFinite(now)) return state;
  const seat = state.players.findIndex((player) => player.id === senderId);
  if (seat < 0 || !action || typeof action.id !== 'string' || !action.id.trim() || action.id.length > 160 || action.stageIndex !== state.stageIndex || state.processedActionIds.includes(action.id)) return state;
  // A failed room may still be explored, but only after the host explicitly
  // reveals its current chapter. Late edits/submits never revive it.
  if (action.kind !== 'reveal') {
    const expired = expireStoryState(state, now);
    if (expired !== state) return expired;
  }
  if (state.status !== 'playing' && state.status !== 'stage-solved' && !(state.status === 'failed' && action.kind === 'reveal')) return state;
  if (!['edit', 'act', 'submit', 'continue', 'abort', 'probe', 'reveal'].includes(action.kind)) return state;
  const room = getStoryRoom(state.roomId, state.seed);
  const stage = room.stages[state.stageIndex];
  if ((action.kind === 'continue' || action.kind === 'abort' || action.kind === 'reveal') && seat !== 0) return state;
  if (action.kind === 'continue' && state.status !== 'stage-solved') return state;
  if (action.kind === 'reveal' && state.status !== 'playing' && state.status !== 'failed') return state;
  if ((action.kind === 'edit' || action.kind === 'act' || action.kind === 'submit' || action.kind === 'probe') && state.status !== 'playing') return state;
  const activityStage = isActivityKind(stage.interaction?.kind);
  if (activityStage && (action.kind === 'edit' || action.kind === 'probe')) return state;
  let movedActivity: ActivityState | undefined;
  if (action.kind === 'act') {
    if (!activityStage || !state.activity || state.activity.kind !== stage.interaction?.kind || !Number.isInteger(action.control) || !stage.slots[action.control] || stage.slots[action.control].seat % state.players.length !== seat) return state;
    movedActivity = reduceActivityState(state.activity, { control: action.control, command: action.command, ...(action.value === undefined ? {} : { value: action.value }) });
    if (movedActivity === state.activity) return state;
  }
  if (action.kind === 'probe' && !stage.experiments?.some((experiment) => experiment.id === action.probeId)) return state;
  if (action.kind === 'edit' && (!Number.isInteger(action.slot) || !stage.slots[action.slot] || stage.slots[action.slot].seat % state.players.length !== seat || !allowsStoryChoice(stage, action.slot, action.value))) return state;
  const next: StoryState = {
    ...state,
    revision: state.revision + 1,
    processedActionIds: [...state.processedActionIds, action.id].slice(-MAX_PROCESSED_ACTIONS),
  };
  if (action.kind === 'abort') return { ...next, status: 'aborted', endedAt: Math.max(state.startedAt, now), feedback: 'Room ended. You can start another whenever you like.' };
  if (action.kind === 'act') return { ...next, activity: movedActivity!, feedback: undefined };
  if (action.kind === 'reveal') {
    const final = state.stageIndex === room.stages.length - 1;
    return {
      ...next, status: final ? 'won' : 'stage-solved', draft: [...stage.answer],
      assistedStages: [...state.assistedStages, state.stageIndex],
      endedAt: final ? Math.max(state.startedAt, now) : undefined,
      feedback: final ? 'Story explored. Revealed chapters do not count as solved.' : 'Answer revealed. Compare the clues, then continue at your own pace.',
    };
  }
  if (action.kind === 'probe') return { ...next, activeProbe: action.probeId, feedback: 'Test signal sent. Compare what each station received. No attempt used.' };
  if (action.kind === 'continue') {
    const stageIndex = state.stageIndex + 1;
    if (!room.stages[stageIndex]) return state;
    const upcoming = room.stages[stageIndex];
    return { ...next, stageIndex, status: 'playing', draft: initialStoryDraft(upcoming), activity: isActivityKind(upcoming.interaction?.kind) ? createActivityState(upcoming.interaction.kind) : undefined, chapterAttemptsUsed: 0, lastSubmittedDraft: undefined, activeProbe: undefined, feedback: undefined };
  }
  if (action.kind === 'edit') {
    const draft = [...state.draft];
    draft[action.slot] = action.value;
    return { ...next, draft, feedback: undefined };
  }
  if (activityStage) {
    if (!state.activity || state.activity.kind !== stage.interaction?.kind || !activityStateSchema.safeParse(state.activity).success) return state;
    if (!isActivitySolved(state.activity)) return { ...next, feedback: 'Keep exploring together. The activity is not finished yet. Trying things does not use an attempt.' };
    const final = state.stageIndex === room.stages.length - 1;
    return { ...next, status: final ? 'won' : 'stage-solved', endedAt: final ? Math.max(state.startedAt, now) : undefined, solvedStages: [...state.solvedStages, state.stageIndex], feedback: final ? room.ending : stage.revelation };
  }
  if (state.draft.length !== stage.slots.length || state.draft.some((id, slot) => !id || !allowsStoryChoice(stage, slot, id))) return { ...next, feedback: 'Fill every position together before testing the plan. No attempt used.' };
  if (new Set(state.draft).size !== state.draft.length) return { ...next, feedback: 'Each piece can be used once. Resolve the repeated choice together. No attempt used.' };
  if (state.lastSubmittedDraft?.every((id, index) => id === state.draft[index])) return { ...next, feedback: 'You already tested this plan. Change a placement before trying again. No attempt used.' };
  const shapeMaking = stage.interaction?.kind === 'lightbox';
  if (shapeMaking ? satisfiesInteraction(stage, state.draft) : stage.answer.every((id, index) => id === state.draft[index]) && satisfiesInteraction(stage, state.draft)) {
    const final = state.stageIndex === room.stages.length - 1;
    return { ...next, status: final ? 'won' : 'stage-solved', endedAt: final ? Math.max(state.startedAt, now) : undefined, solvedStages: [...state.solvedStages, state.stageIndex], lastSubmittedDraft: [...state.draft], feedback: final ? room.ending : stage.revelation };
  }
  if (shapeMaking) return { ...next, feedback: 'Not quite the same picture yet. Compare the live image with the target and turn your layers together. No attempt used.' };
  const attemptsUsed = Math.min(room.attemptLimit, state.attemptsUsed + 1);
  const chapterAttemptsUsed = state.chapterAttemptsUsed + 1;
  const remaining = room.attemptLimit - (state.assistedStages.length ? chapterAttemptsUsed : attemptsUsed);
  return {
    ...next, attemptsUsed, chapterAttemptsUsed, lastSubmittedDraft: [...state.draft], status: remaining > 0 ? 'playing' : 'failed', endedAt: remaining > 0 ? undefined : Math.max(state.startedAt, now),
    feedback: remaining > 0 ? `The whole plan does not fit the evidence. Compare your clues. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left.` : 'No attempts left. Reveal this chapter to keep exploring together.',
  };
}

export function projectStoryView(state: StoryState, playerId: string): StoryPlayerView {
  const seat = state.players.findIndex((player) => player.id === playerId);
  if (seat < 0) throw new Error('Only players in this room can open its evidence.');
  const fullRoom = getStoryRoom(state.roomId, state.seed);
  const { stages, ...room } = fullRoom;
  const fullStage = stages[state.stageIndex];
  // Do not spread secret solution fields into transport/UI payloads.
  const { answer, constraints: _constraints, explanation, ...publicStage } = fullStage;
  const failed = state.status === 'failed';
  const revealed = state.status === 'stage-solved' || state.status === 'won';
  const assisted = state.assistedStages.includes(state.stageIndex);
  const ownedSlots = fullStage.slots.flatMap((slot, index) => slot.seat % state.players.length === seat ? [index] : []);
  const answerLabels = answer.map((id) => fullStage.options.find((option) => option.id === id)?.label ?? id);
  return {
    room: { ...room, ending: state.status === 'won' ? room.ending : '' }, playerId,
    stage: {
      ...publicStage,
      interaction: projectInteraction(publicStage.interaction?.kind === 'lightbox'
        ? { ...publicStage.interaction, preview: filmComposite(fullStage, state.draft) }
        : publicStage.interaction, ownedSlots, assisted || revealed),
      clues: fullStage.clues.filter((clue) => assisted || clue.seat % state.players.length === seat).map((clue) => ({ ...clue, observations: assisted ? clue.observations : clue.observations?.filter((observation) => observation.probeId === state.activeProbe) })),
      revelation: failed || assisted ? `${answerLabels.length ? `The plan: ${answerLabels.join(' → ')}. ` : ''}${explanation}` : revealed ? fullStage.revelation : '',
    },
    ownedSlots,
    roleNames: fullRoom.roles.filter((_, index) => index % state.players.length === seat),
  };
}

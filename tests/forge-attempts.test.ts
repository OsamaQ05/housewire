import { describe, expect, it } from 'vitest';
import { createForgeRun, FORGE_MAX_ATTEMPTS, forgeFailureReview, generateOfflineForgeCase, parseStoredForgeRun, reduceForgeRunSubmission, type ForgeCase, type ForgeStageSubmission } from '../src/domain/case-forge';
import { assignForgeLiveNode, createForgeLiveRuntime, forgeLiveRuntimeFromSnapshot, forgeLiveSnapshot, forgePlayerProjectionForNode, reduceForgeLiveSubmission, startForgeLiveRun } from '../src/features/forge/live-coordinator';
import { forgeLiveCheckpointKey, parseForgeLiveCheckpoint } from '../src/features/forge/live-checkpoint';
import { housewireSessionEventSchema } from '../src/features/session/protocol';

function game(): ForgeCase {
  return generateOfflineForgeCase({ seed: 'TRY-LIMIT', generatedAt: 1_800_000_000_000, playerIds: ['a', 'b'], playerNames: { a: 'Amina', b: 'Omar' }, difficulty: 3, targetMinutes: 30, tone: 'mystery', intensity: 'balanced', safeMovement: true, noiseAllowed: true });
}
function riddle(game: ForgeCase) { return game.stages.findIndex((stage) => stage.solution.kind === 'word'); }
const wrong: ForgeStageSubmission = { kind: 'word', value: 'definitely-not-this' };
function playing(game: ForgeCase) {
  const waiting = assignForgeLiveNode(createForgeLiveRuntime(game, 'host', 'operation', 1_000), game, 'guest', 'Omar', 1_100);
  return { ...startForgeLiveRun(waiting, game, ['host', 'guest'], 2_000), stageIndex: riddle(game) };
}
function submitter(game: ForgeCase, state: ReturnType<typeof playing>) {
  return state.assignments.find((assignment) => game.stages[state.stageIndex].submitterPlayerIds.includes(assignment.playerId))!.nodeId;
}

describe('Case Forge bounded attempts', () => {
  it('closes the solo run on the fifth wrong answer and rejects a subsequent correct answer', () => {
    const file = game();
    const index = riddle(file);
    let run = { ...createForgeRun(file.id, 'a', 1_000), stageIndex: index };
    for (let attempt = 1; attempt <= FORGE_MAX_ATTEMPTS; attempt += 1) {
      const reduced = reduceForgeRunSubmission(run, file, wrong, 2_000 + attempt);
      run = reduced.run;
      expect(run.attemptsUsed).toBe(attempt);
      expect(run.failedAt !== null).toBe(attempt === FORGE_MAX_ATTEMPTS);
    }
    const solution = file.stages[index].solution;
    if (solution.kind !== 'word') throw new Error('Expected word');
    expect(reduceForgeRunSubmission(run, file, { kind: 'word', value: solution.answer }, 3_000).run).toBe(run);
    expect(run.completedAt).toBeNull();
    expect(forgeFailureReview(file, run.stageIndex).map((entry) => entry.stageId)).toEqual(file.stages.slice(index).map((stage) => stage.id));
  });

  it('persists four used tries and terminal failure; migrates pre-limit checkpoints', () => {
    const file = game();
    const initial = { ...createForgeRun(file.id, 'a', 1_000), stageIndex: riddle(file) };
    let run = initial;
    for (let index = 0; index < 4; index += 1) run = reduceForgeRunSubmission(run, file, wrong, 2_000 + index).run;
    const restored = parseStoredForgeRun(JSON.parse(JSON.stringify(run)), file.id, 5)!;
    expect(restored.attemptsUsed).toBe(4);
    const failure = reduceForgeRunSubmission(restored, file, wrong, 3_000).run;
    expect(parseStoredForgeRun(JSON.parse(JSON.stringify(failure)), file.id, 5)).toEqual(failure);
    const legacy = { ...initial, attemptsUsed: undefined, failedAt: undefined };
    expect(parseStoredForgeRun(legacy, file.id, 5)).toMatchObject({ attemptsUsed: 0, failedAt: null, stageIndex: initial.stageIndex });
    expect(parseStoredForgeRun({ ...failure, failedAt: null }, file.id, 5)?.failedAt).not.toBeNull();
    expect(parseStoredForgeRun({ ...initial, attemptsUsed: 6 }, file.id, 5)).toBeNull();
    expect(parseStoredForgeRun({ ...failure, completedAt: 3_000 }, file.id, 5)).toBeNull();
  });

  it('does not charge empty submissions, wrong input kinds, or successful answers', () => {
    const file = game();
    let run = { ...createForgeRun(file.id, 'a', 1_000), stageIndex: riddle(file), attemptsUsed: 4 };
    expect(reduceForgeRunSubmission(run, file, { kind: 'word', value: '' }, 2_000).run).toBe(run);
    expect(reduceForgeRunSubmission(run, file, { kind: 'code', value: '1234' }, 2_000).run).toBe(run);
    const solution = file.stages[run.stageIndex].solution;
    if (solution.kind !== 'word') throw new Error('Expected word');
    run = reduceForgeRunSubmission(run, file, { kind: 'word', value: solution.answer }, 2_000).run;
    expect(run.attemptsUsed).toBe(4);
    expect(run.failedAt).toBeNull();
  });

  it('shares one five-try budget and keeps every answer sealed until total live failure', () => {
    const file = game();
    let state = playing(file);
    const actor = submitter(file, state);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      state = reduceForgeLiveSubmission(state, file, actor, state.stageIndex, wrong, 2_100 + attempt).state;
      const snapshot = forgeLiveSnapshot(state);
      expect(snapshot.attemptsUsed).toBe(attempt);
      if (attempt < 5) {
        expect(state.status).toBe('playing');
        expect(snapshot.failureReview).toEqual([]);
        expect(JSON.stringify(forgePlayerProjectionForNode(file, state, 'guest'))).not.toContain('"solution"');
      } else {
        expect(state.status).toBe('failed');
        expect(snapshot.failureReview.length).toBe(5 - state.stageIndex);
        expect(state.finishedAt).toBeUndefined();
        expect(forgeLiveRuntimeFromSnapshot(snapshot)).toEqual(state);
      }
    }
    expect(reduceForgeLiveSubmission(state, file, actor, state.stageIndex, wrong, 4_000).state).toBe(state);
  });

  it('rejects premature review data and illegal attempt budgets at the protocol boundary', () => {
    const file = game();
    const state = playing(file);
    const snapshot = forgeLiveSnapshot(state);
    expect(housewireSessionEventSchema.safeParse({ ...snapshot, failureReview: forgeFailureReview(file, state.stageIndex) }).success).toBe(false);
    expect(housewireSessionEventSchema.safeParse({ ...snapshot, attemptsUsed: 5 }).success).toBe(false);
    expect(housewireSessionEventSchema.safeParse({ ...snapshot, attemptsUsed: -1 }).success).toBe(false);
    expect(housewireSessionEventSchema.safeParse({ ...snapshot, status: 'failed', attemptsUsed: 5, failedAt: 3_000 }).success).toBe(false);
  });

  it('restores attempts from the phone checkpoint and never charges duplicate stale or unassigned requests', () => {
    const file = game();
    let state = playing(file);
    expect(reduceForgeLiveSubmission(state, file, 'intruder', state.stageIndex, wrong, 2_100).state).toBe(state);
    expect(reduceForgeLiveSubmission(state, file, 'host', 5, wrong, 2_100).state).toBe(state);
    state = reduceForgeLiveSubmission(state, file, submitter(file, state), state.stageIndex, wrong, 2_100).state;
    const serialized = JSON.stringify(forgeLiveSnapshot(state));
    expect(parseForgeLiveCheckpoint(serialized, file.id, 'host')?.attemptsUsed).toBe(1);
    expect(parseForgeLiveCheckpoint(serialized, file.id, 'intruder')).toBeUndefined();
    expect(parseForgeLiveCheckpoint('{bad', file.id, 'host')).toBeUndefined();
    expect(forgeLiveCheckpointKey('ABCD1', file.id, 'host')).not.toEqual(forgeLiveCheckpointKey('ABCD2', file.id, 'host'));
  });

  it('reviews named objects and landmarks, not opaque token or cell IDs', () => {
    const file = game();
    const review = forgeFailureReview(file, 0);
    expect(review).toHaveLength(5);
    expect(review.every((entry) => entry.answer.length > 0 && entry.explanation.length > 0)).toBe(true);
    const route = file.stages.find((stage) => stage.solution.kind === 'route');
    if (route) expect(review.find((entry) => entry.stageId === route.id)?.answer).toContain(' → ');
  });
});

import { describe, expect, it } from 'vitest';
import { escapeAttemptLimit, escapeDurationMs } from '../src/domain/attempt-rules';
import { escapeAnswerReview } from '../src/domain/escape-answer-review';
import { createEscapeMissionRuntime, escapeSnapshotFromRuntime, runtimeFromEscapeSnapshot, reduceEscapeMistake, reduceEscapeProof, expireEscapeMission, compiledCaseForRuntime } from '../src/features/session/escape-mission-coordinator';
import { housewireSessionEventSchema, type EscapeStartEvent } from '../src/features/session/protocol';
import { createDefusalState, startDefusal, applyDefusalAction, projectDefusal, tickDefusal } from '../src/domain/defusal';
import { defusalViewSchema } from '../src/features/defusal/protocol';
import { parseDefusalRuntime, serializeDefusalRuntime } from '../src/features/defusal/runtime-state';

const start: EscapeStartEvent = { kind: 'escape.start', missionId: 'dead-air', operationId: 'attempt-test', hostNodeId: 'a', seed: 415, startsAt: 1000, liveNodeIds: ['a', 'b', 'c'] };
const mistake = (id = 'first') => ({ missionId: 'dead-air', operationId: start.operationId, nodeId: 'b', attemptId: id, stageIndex: 0 });

describe('authored room attempt budget', () => {
  it('uses 3–5 tries depending on the game', () => {
    expect(['line-13','dead-air','night-glass','long-table'].map(escapeAttemptLimit)).toEqual([3,4,4,5]);
  });
  it('charges genuine reports once, ignoring outsiders and stale stages', () => {
    const initial = createEscapeMissionRuntime(start);
    expect(reduceEscapeMistake(initial, mistake(), 'intruder', 2000)).toBe(initial);
    expect(reduceEscapeMistake(initial, { ...mistake(), stageIndex: 1 }, 'b', 2000)).toBe(initial);
    const next = reduceEscapeMistake(initial, mistake(), 'b', 2000);
    expect(next.mistakes).toBe(1);
    expect(reduceEscapeMistake(next, mistake(), 'b', 2100)).toBe(next);
  });
  it('ends at the fourth mistake, round-trips its failed snapshot and refuses future progress', () => {
    let state = createEscapeMissionRuntime(start);
    for (let i = 0; i < 4; i++) state = reduceEscapeMistake(state, mistake(`try-${i}`), 'b', 2000 + i);
    expect(state).toMatchObject({ mistakes: 4, failedAt: 2003, failureReason: 'attempts' });
    expect(reduceEscapeMistake(state, mistake('extra'), 'b', 3000)).toBe(state);
    const parsed = housewireSessionEventSchema.parse(escapeSnapshotFromRuntime(state));
    if (parsed.kind !== 'escape.snapshot') throw new Error('wrong snapshot');
    expect(runtimeFromEscapeSnapshot(parsed).failedAt).toBe(2003);
    expect(reduceEscapeProof(state, { kind: 'escape.proof', missionId: 'dead-air', operationId: state.operationId, stageIndex: 0, nodeId: 'a', proofKey: 'duct-order', answerToken: 'ANY', observedAt: 3000 }, 'a', 3000).accepted).toBe(false);
    const review = escapeAnswerReview(compiledCaseForRuntime(state), 2);
    expect(review.map(i => i.title)).toEqual(['Private words', 'Echo matrix', 'Countertone']);
    expect(review[0].answer.length).toBeGreaterThan(10);
  });
  it('time expiry is terminal and cannot replace a finished game', () => {
    const state = createEscapeMissionRuntime(start);
    const deadline = state.startedAt + escapeDurationMs(state.missionId);
    expect(expireEscapeMission(state, deadline - 1)).toBe(state);
    expect(expireEscapeMission(state, deadline)).toMatchObject({ failedAt: deadline, failureReason: 'time' });
    const done = { ...state, finishedAt: 2000 };
    expect(expireEscapeMission(done, deadline + 10)).toBe(done);
  });
});

describe('Last Light post-game answer reveal', () => {
  it('never projects answer reviews during play, but includes missed modules on failure', () => {
    let state = startDefusal(createDefusalState({ id: 'solo', hostId: 'local', seed: 749, mode: 'practice', players: [{ id: 'local', name: 'You' }] }), 'local', 1000).state;
    expect(projectDefusal(state, 'local')?.review).toBeUndefined();
    const module = state.game.modules[0];
    const wrong = module.device.options.filter(o => !module.solution.includes(o.id)).slice(0, 3).map(o => o.id);
    for (let i = 0; i < state.game.maxStrikes; i++) state = applyDefusalAction(state, 'local', { type: 'commit', actionId: `bad-${i}`, operationId: state.id, stageIndex: 0, answer: wrong }, 2000 + i * 5000).state;
    expect(state.status).toBe('failed');
    const view = projectDefusal(state, 'local')!;
    expect(view.review).toHaveLength(4);
    expect(defusalViewSchema.safeParse(view).success).toBe(true);
    expect(defusalViewSchema.safeParse({ ...view, status: 'playing' }).success).toBe(false);
    const saved = serializeDefusalRuntime({ mode: 'practice', authority: state, practiceRole: 'operator' }, 'local');
    expect(parseDefusalRuntime(saved!, { localNodeId: 'local' }, 10000)?.authority?.status).toBe('failed');
  });
  it('reveals unfinished modules when time runs out', () => {
    const state = startDefusal(createDefusalState({ id: 'timer', hostId: 'local', seed: 55, mode: 'practice', players: [{ id: 'local', name: 'You' }] }), 'local', 1000).state;
    const ended = tickDefusal({ ...state, stageIndex: 2 }, state.deadline!);
    expect(projectDefusal(ended, 'local')?.review).toHaveLength(2);
  });
});

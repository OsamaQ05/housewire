import { describe, expect, it } from 'vitest';
import { circuitRaceAnswerReview, compileCircuitRace, type CircuitRaceSubmission } from '../../domain/circuit-race';
import { CIRCUIT_RACE_TIME_LIMIT_MS, createPracticeTeamEscapeRace, createTeamEscapeRaceProofEvent, expireCircuitRace, rankTeamEscapeRace, reduceTeamEscapeRaceProof, teamEscapeRacePhaseAt, type TeamEscapeRaceState } from '../../domain/team-escape-race';
import { acceptCircuitRaceSnapshotFrame, createCircuitRacePlayerSnapshot, createCircuitRaceProofSubmissionFromState, projectCircuitRacePlayerSnapshot, reduceCircuitRaceProofFrame } from './coordinator';
import { createSignedCircuitRacePlayerSnapshot, makeCircuitRaceProofResultMessage, makeCircuitRaceSnapshotMessage } from './protocol';
import { circuitRaceResultFromSnapshot, circuitRaceStageInputs, parsePersistedCircuitRaceState, serializeCircuitRaceState } from './runtime-state';
import { parseCircuitRaceCheckpoint, serializeCircuitRaceCheckpoint } from './checkpoint';

const course = compileCircuitRace(15, 'host');
const startsAt = 10_000;
function initial(): TeamEscapeRaceState {
  return createPracticeTeamEscapeRace({ localNodeId: 'local', operationId: 'cap-test', seed: 15, stages: circuitRaceStageInputs(course), startsAt, simulatedPlayerCount: 1 });
}
function wrongSubmission(state: TeamEscapeRaceState): CircuitRaceSubmission {
  const stage = course.stages[state.teams.find((team) => team.memberNodeIds.includes('local'))!.stageIndex];
  if (stage.mechanic === 'sequence-cipher') return { mechanic: stage.mechanic, code: '9999' };
  if (stage.mechanic === 'knock-pattern') return { mechanic: stage.mechanic, mode: 'accessible', pattern: stage.challenge.pulseDurationsMs.map((duration) => duration < 320 ? 'LONG' : 'SHORT') };
  if (stage.mechanic === 'flat-phone') return { mechanic: stage.mechanic, mode: 'decoded-signal', signalSequence: stage.challenge.tiltSequence.map((move) => move === 'TILT_LEFT' ? 'TIP_BACK' : 'TILT_LEFT') };
  return { mechanic: stage.mechanic, code: '9999' };
}
function wrongFrame(state: TeamEscapeRaceState, id: string, at = startsAt + 1_000) {
  const team = state.teams.find((candidate) => candidate.memberNodeIds.includes('local'))!;
  const message = createCircuitRaceProofSubmissionFromState({ raceId: 'race', state, nodeId: 'local', proofId: state.stages[team.stageIndex].proofIds[0], observedAt: at, requestId: id, submission: wrongSubmission(state), revealedHintCount: 0 });
  if (!message) throw new Error('Missing test submission');
  return { messageId: id, recipientId: 'local', senderId: 'local', serverTime: at, payload: message };
}
function reduce(state: TeamEscapeRaceState, id: string) {
  return reduceCircuitRaceProofFrame(state, wrongFrame(state, id), { course, hostNodeId: 'local', raceId: 'race' })!.reduction;
}
function exhaust(): TeamEscapeRaceState {
  let state = initial();
  for (let index = 0; index < 4; index += 1) state = reduce(state, `wrong-${index}`).state;
  return state;
}

describe('Circuit Race finite attempts', () => {
  it('charges a wrong full answer once, without advancing its stage', () => {
    const state = initial();
    const first = reduce(state, 'one');
    expect(first).toMatchObject({ accepted: false, changed: true, reason: 'INVALID_PROOF' });
    const team = first.state.teams.find((candidate) => candidate.memberNodeIds.includes('local'))!;
    expect(team).toMatchObject({ mistakes: 1, stageIndex: 0, missedStageIds: [course.stages[0].id] });
    expect(reduce(first.state, 'one')).toMatchObject({ changed: false });
    expect(reduce(first.state, 'one').state).toBe(first.state);
    expect(() => makeCircuitRaceProofResultMessage({ raceId: 'race', operationId: 'cap-test', requestId: 'one', accepted: false, changed: true, reason: 'INVALID_PROOF', revision: 1 })).not.toThrow();
  });

  it('four mistakes fails the crew; new request ids cannot unlock another attempt', () => {
    const state = exhaust();
    const team = state.teams.find((candidate) => candidate.memberNodeIds.includes('local'))!;
    expect(team).toMatchObject({ mistakes: 4, failureReason: 'attempts', failedAt: 11_000 });
    expect(createTeamEscapeRaceProofEvent(state, 'local', state.stages[0].proofIds[0], 12_000, 'fifth')).toBeUndefined();
    const snapshot = createCircuitRacePlayerSnapshot(state, 'race', 'local', course);
    expect(projectCircuitRacePlayerSnapshot(snapshot, 12_000, ['local']).teams.find((candidate) => candidate.isLocalTeam)).toMatchObject({ canSubmit: false, mistakes: 4 });
  });

  it('does not charge another player for malformed or impersonated submissions', () => {
    const state = initial();
    const frame = wrongFrame(state, 'spoof');
    const result = reduceCircuitRaceProofFrame(state, { ...frame, senderId: 'stranger' }, { course, hostNodeId: 'local', raceId: 'race' });
    expect(result?.reduction.state).toBe(state);
    expect(result?.reduction.changed).toBe(false);
    expect(reduceCircuitRaceProofFrame(state, { ...frame, recipientId: 'stranger' }, { course, hostNodeId: 'local', raceId: 'race' })).toBeUndefined();
  });

  it('mistakes are retained across successfully completed stages', () => {
    let state = reduce(initial(), 'one').state;
    const event = createTeamEscapeRaceProofEvent(state, 'local', state.stages[0].proofIds[0], 12_000, 'correct')!;
    state = reduceTeamEscapeRaceProof(state, { event, eventId: 'correct', senderId: 'local', serverTime: 12_000 }, { isAuthority: true, localNodeId: 'local' }).state;
    expect(state.teams.find((team) => team.memberNodeIds.includes('local'))).toMatchObject({ mistakes: 1, stageIndex: 1 });
    expect(reduce(state, 'two').state.teams.find((team) => team.memberNodeIds.includes('local'))?.mistakes).toBe(2);
  });

  it('does not send answers to a failed crew while its rival is still playing', () => {
    const state = exhaust();
    for (const player of state.participants) {
      const snapshot = createCircuitRacePlayerSnapshot(state, 'race', player.nodeId, course);
      const { authoritySignature: _signature, ...unsigned } = snapshot;
      expect(snapshot.answerReview).toBeUndefined();
      expect(() => createSignedCircuitRacePlayerSnapshot({ ...unsigned, answerReview: circuitRaceAnswerReview(course, [course.stages[0].id]) })).toThrow(/Answers remain sealed/);
    }
  });

  it('deadline fails unfinished crews and opens every missed or unsolved answer', () => {
    const active = exhaust();
    expect(expireCircuitRace(active, startsAt + CIRCUIT_RACE_TIME_LIMIT_MS - 1)).toBe(active);
    const state = expireCircuitRace(active, startsAt + CIRCUIT_RACE_TIME_LIMIT_MS);
    expect(teamEscapeRacePhaseAt(state, startsAt + CIRCUIT_RACE_TIME_LIMIT_MS)).toBe('complete');
    expect(expireCircuitRace(state, startsAt + CIRCUIT_RACE_TIME_LIMIT_MS + 1)).toBe(state);
    const snapshot = createCircuitRacePlayerSnapshot(state, 'race', 'local', course);
    expect(snapshot.answerReview).toHaveLength(4);
    expect(snapshot.answerReview?.every((item) => item.answer.length > 0 && item.explanation.length > 0)).toBe(true);
    expect(rankTeamEscapeRace(state, startsAt + CIRCUIT_RACE_TIME_LIMIT_MS).every((row) => row.rank === undefined)).toBe(true);
  });

  it('persists DNF without inventing a winner, retaining answer review', () => {
    const state = expireCircuitRace(exhaust(), startsAt + CIRCUIT_RACE_TIME_LIMIT_MS);
    const snapshot = createCircuitRacePlayerSnapshot(state, 'race', 'local', course);
    const result = circuitRaceResultFromSnapshot(snapshot)!;
    expect(result.winningTeamIds).toEqual([]);
    expect(result.standings.every((row) => row.failed)).toBe(true);
    const saved = serializeCircuitRaceState({ launchMode: 'practice', seed: 15, history: [result] });
    expect(parsePersistedCircuitRaceState(saved)?.history[0]).toEqual(result);
  });

  it('rejects a reconnect snapshot that restores exhausted tries', () => {
    const state = exhaust();
    const snapshot = createCircuitRacePlayerSnapshot(state, 'race', 'local', course);
    const { authoritySignature: _signature, ...unsigned } = snapshot;
    const next = createSignedCircuitRacePlayerSnapshot({ ...unsigned, revision: snapshot.revision + 1, ownTeam: { ...snapshot.ownTeam, mistakes: 0, failedAt: undefined, failureReason: undefined } });
    const accepted = acceptCircuitRaceSnapshotFrame({ messageId: 'rollback', payload: makeCircuitRaceSnapshotMessage(next), recipientId: 'local', senderId: 'local', serverTime: 15_000 }, { current: snapshot, expectedHostNodeId: 'local', localNodeId: 'local', raceId: 'race' });
    expect(accepted).toMatchObject({ accepted: false, reason: 'STALE_OPERATION' });
  });

  it('restores the same spent budget after reopening, but never into a different course', () => {
    const state = exhaust();
    const snapshot = createCircuitRacePlayerSnapshot(state, 'race', 'local', course);
    const serialized = serializeCircuitRaceCheckpoint({ version: 1, key: 'practice:15:race:local', authority: state, snapshot });
    const restored = parseCircuitRaceCheckpoint(serialized, 'practice:15:race:local');
    expect(restored?.authority?.teams.find((team) => team.memberNodeIds.includes('local'))).toMatchObject({ mistakes: 4, failedAt: 11_000 });
    expect(restored?.snapshot.ownTeam.mistakes).toBe(4);
    expect(parseCircuitRaceCheckpoint(serialized, 'practice:16:new-race:local')).toBeUndefined();
    expect(parseCircuitRaceCheckpoint('{"version":1}', 'practice:15:race:local')).toBeUndefined();
  });
});

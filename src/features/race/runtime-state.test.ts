import { describe, expect, it } from 'vitest';

import { compileCircuitRace } from '../../domain/circuit-race';
import {
  acceptTeamEscapeRaceStart,
  createTeamEscapeRaceProofEvent,
  createTeamEscapeRaceStartEvent,
  reduceTeamEscapeRaceProof,
  type TeamEscapeRaceState,
} from '../../domain/team-escape-race';
import { createCircuitRacePlayerSnapshot } from './coordinator';
import {
  circuitRaceResultFromSnapshot,
  circuitRaceStageInputs,
  parsePersistedCircuitRaceState,
  serializeCircuitRaceState,
  type CircuitRaceResult,
} from './runtime-state';

const STARTS_AT = 10_000;
const COURSE = compileCircuitRace(19, 'course');

function liveState(): TeamEscapeRaceState {
  const event = createTeamEscapeRaceStartEvent({
    hostNodeId: 'phone-1',
    mode: 'live',
    operationId: 'runtime-result',
    participants: [
      { nodeId: 'phone-1', label: 'One', simulated: false, skill: 5 },
      { nodeId: 'phone-2', label: 'Two', simulated: false, skill: 5 },
    ],
    seed: 19,
    stages: circuitRaceStageInputs(COURSE),
    startsAt: STARTS_AT,
    teamIds: ['ember', 'mint'],
  });
  const accepted = acceptTeamEscapeRaceStart({
    event,
    eventId: 'runtime-start',
    senderId: 'phone-1',
    serverTime: STARTS_AT - 1_000,
  }, 'phone-1');
  if (!accepted.accepted) throw new Error(`Fixture rejected: ${accepted.reason}`);
  return accepted.state;
}

function finishTeam(state: TeamEscapeRaceState, teamId: string, firstAcceptedAt: number): TeamEscapeRaceState {
  let next = state;
  let acceptedAt = firstAcceptedAt;
  while (next.teams.find((team) => team.teamId === teamId)?.finishedAt === undefined) {
    const team = next.teams.find((candidate) => candidate.teamId === teamId);
    if (!team) throw new Error('Missing fixture team.');
    const stage = next.stages[team.stageIndex];
    const proofId = stage.proofIds.find((candidate) =>
      !team.acceptedProofs.some((proof) => proof.proofId === candidate),
    );
    if (!proofId) throw new Error('Missing fixture proof.');
    const submissionId = `proof-${teamId}-${team.stageIndex}-${acceptedAt}`;
    const event = createTeamEscapeRaceProofEvent(
      next,
      team.memberNodeIds[0],
      proofId,
      acceptedAt,
      submissionId,
    );
    if (!event) throw new Error('Could not create fixture proof.');
    const reduction = reduceTeamEscapeRaceProof(next, {
      event,
      eventId: submissionId,
      senderId: team.memberNodeIds[0],
      serverTime: acceptedAt,
    }, { isAuthority: true, localNodeId: next.hostNodeId });
    if (!reduction.accepted) throw new Error(`Proof rejected: ${reduction.reason}`);
    next = reduction.state;
    acceptedAt += 1_000;
  }
  return next;
}

describe('Circuit Race runtime state helpers', () => {
  it('projects the compiled course into domain stage inputs without leaking challenge answers', () => {
    const course = compileCircuitRace(73, 'course');
    const stages = circuitRaceStageInputs(course);

    expect(stages).toHaveLength(course.stages.length);
    expect(stages).toEqual(course.stages.map((stage) => ({
      id: stage.id,
      label: stage.title,
      proofIds: [stage.proofId],
    })));
    expect(JSON.stringify(stages)).not.toContain('challenge');
    expect(JSON.stringify(stages)).not.toContain('breakerFragments');
  });

  it('derives a completed result from either team private projection', () => {
    let state = liveState();
    const firstTeamId = state.teams[0].teamId;
    const secondTeamId = state.teams[1].teamId;
    state = finishTeam(state, firstTeamId, 11_000);
    state = finishTeam(state, secondTeamId, 20_000);

    for (const team of state.teams) {
      const snapshot = createCircuitRacePlayerSnapshot(state, 'ABCDE', team.memberNodeIds[0], COURSE);
      const result = circuitRaceResultFromSnapshot(snapshot, new Date('2026-09-08T12:00:00.000Z'));
      expect(result).toMatchObject({
        id: 'runtime-result',
        mode: 'live',
        playedAt: '2026-09-08T12:00:00.000Z',
        winningTeamIds: [firstTeamId],
      });
      expect(result?.standings).toHaveLength(2);
      expect(result?.standings.every((standing) => standing.elapsedMs !== undefined)).toBe(true);
    }
  });

  it('does not create a result before every crew finishes or for an invalid date', () => {
    const state = liveState();
    const snapshot = createCircuitRacePlayerSnapshot(state, 'ABCDE', state.participants[0].nodeId, COURSE);

    expect(circuitRaceResultFromSnapshot(snapshot)).toBeUndefined();
    expect(circuitRaceResultFromSnapshot(snapshot, Number.NaN)).toBeUndefined();
  });

  it('round-trips bounded persistence and migrates the history-only format', () => {
    const result: CircuitRaceResult = {
      id: 'race-one',
      playedAt: '2026-09-08T12:00:00.000Z',
      mode: 'practice',
      winningTeamIds: ['ember'],
      standings: [
        { teamId: 'ember', elapsedMs: 42_000 },
        { teamId: 'mint', elapsedMs: 45_000 },
      ],
    };
    const serialized = serializeCircuitRaceState({ launchMode: 'live', seed: 99, history: [result] });

    expect(parsePersistedCircuitRaceState(serialized)).toEqual({
      version: 1,
      launchMode: 'live',
      seed: 99,
      history: [result],
    });
    expect(parsePersistedCircuitRaceState(JSON.stringify({ history: [result] }))).toEqual({
      version: 1,
      launchMode: 'practice',
      seed: 1,
      history: [result],
    });
  });

  it('rejects corrupt, unbounded, and future persistence shapes', () => {
    expect(parsePersistedCircuitRaceState('{oops')).toBeUndefined();
    expect(parsePersistedCircuitRaceState(JSON.stringify({ version: 2, launchMode: 'live', seed: 2, history: [] }))).toBeUndefined();
    expect(parsePersistedCircuitRaceState(JSON.stringify({ version: 1, launchMode: 'live', seed: 2, history: [], injected: true }))).toBeUndefined();
    expect(parsePersistedCircuitRaceState(JSON.stringify({
      version: 1,
      launchMode: 'live',
      seed: 2,
      history: [{
        id: 'race',
        playedAt: 'not-a-date',
        mode: 'live',
        winningTeamIds: ['ember'],
        standings: [{ teamId: 'ember' }, { teamId: 'mint' }],
      }],
    }))).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';

import {
  TEAM_ESCAPE_RACE_DEFAULT_TIE_WINDOW_MS,
  acceptTeamEscapeRaceStart,
  assignFairEscapeRaceTeams,
  createPracticeTeamEscapeRace,
  createTeamEscapeRaceProofEvent,
  createTeamEscapeRaceStartEvent,
  projectTeamEscapeRace,
  rankTeamEscapeRace,
  reduceTeamEscapeRaceProof,
  simulatePracticeTeamEscapeRace,
  teamEscapeRacePhaseAt,
  teamEscapeRaceProofToken,
  type TeamEscapeRaceParticipantInput,
  type TeamEscapeRaceProofEvent,
  type TeamEscapeRaceState,
} from '../src/domain/team-escape-race';

const STARTS_AT = 10_000;
const STAGES = [
  { id: 'door', label: 'The Split Door', proofIds: ['left-seal', 'right-seal'] },
  { id: 'vault', label: 'The Vault', proofIds: ['vault-code'] },
] as const;
const PARTICIPANTS: readonly TeamEscapeRaceParticipantInput[] = [
  { nodeId: 'node-a', label: 'Ari', skill: 9 },
  { nodeId: 'node-b', label: 'Bea', skill: 8 },
  { nodeId: 'node-c', label: 'Cam', skill: 4 },
  { nodeId: 'node-d', label: 'Dee', skill: 3 },
];

function startState(options: { teamIds?: readonly string[]; participants?: readonly TeamEscapeRaceParticipantInput[] } = {}) {
  const event = createTeamEscapeRaceStartEvent({
    hostNodeId: 'node-a',
    operationId: 'race-one',
    participants: options.participants ?? PARTICIPANTS,
    seed: 73,
    stages: STAGES,
    startsAt: STARTS_AT,
    teamIds: options.teamIds,
  });
  const accepted = acceptTeamEscapeRaceStart({
    event,
    eventId: 'race-start',
    senderId: 'node-a',
    serverTime: STARTS_AT - 2_000,
  }, 'node-a');
  if (!accepted.accepted) throw new Error(`Start fixture was rejected: ${accepted.reason}`);
  return accepted.state;
}

function submit(
  state: TeamEscapeRaceState,
  nodeId: string,
  proofId: string,
  serverTime: number,
  eventId: string,
) {
  const event = createTeamEscapeRaceProofEvent(state, nodeId, proofId, serverTime, eventId);
  if (!event) throw new Error(`Could not create ${proofId} for ${nodeId}.`);
  return reduceTeamEscapeRaceProof(state, { event, eventId, senderId: nodeId, serverTime }, {
    isAuthority: true,
    localNodeId: state.hostNodeId,
  });
}

function firstMember(state: TeamEscapeRaceState, teamId: string): string {
  const member = state.teams.find((team) => team.teamId === teamId)?.memberNodeIds[0];
  if (!member) throw new Error(`No member for ${teamId}.`);
  return member;
}

describe('fair team assignment', () => {
  it('is deterministic, input-order independent, balanced, and uses every player once', () => {
    const first = assignFairEscapeRaceTeams(PARTICIPANTS, ['amber', 'cyan'], 73);
    const second = assignFairEscapeRaceTeams([...PARTICIPANTS].reverse(), ['amber', 'cyan'], 73);
    expect(second).toEqual(first);

    const rosters = first.map((team) => team.memberNodeIds.length);
    expect(Math.max(...rosters) - Math.min(...rosters)).toBeLessThanOrEqual(1);
    expect(first.flatMap((team) => team.memberNodeIds).sort()).toEqual(
      PARTICIPANTS.map((participant) => participant.nodeId).sort(),
    );

    const skill = new Map(PARTICIPANTS.map((participant) => [participant.nodeId, participant.skill ?? 5]));
    const totals = first.map((team) =>
      team.memberNodeIds.reduce((total, nodeId) => total + (skill.get(nodeId) ?? 0), 0),
    );
    expect(Math.abs(totals[0] - totals[1])).toBeLessThanOrEqual(2);
  });

  it('rejects duplicate players and impossible team counts', () => {
    expect(() => assignFairEscapeRaceTeams([...PARTICIPANTS, PARTICIPANTS[0]], ['amber', 'cyan'], 1)).toThrow(
      'assigned only once',
    );
    expect(() => assignFairEscapeRaceTeams(PARTICIPANTS.slice(0, 2), ['a', 'b', 'c'], 1)).toThrow(
      'two to four',
    );
  });
});

describe('authoritative synchronized start', () => {
  it('derives countdown and running from one host-authored server timestamp', () => {
    const state = startState();
    expect(state.startsAt).toBe(STARTS_AT);
    expect(teamEscapeRacePhaseAt(state, STARTS_AT - 1)).toBe('countdown');
    expect(teamEscapeRacePhaseAt(state, STARTS_AT)).toBe('running');
    expect(projectTeamEscapeRace(state, STARTS_AT - 400, state.participants.map((item) => item.nodeId))).toMatchObject({
      phase: 'countdown',
      startsInMs: 400,
      authorityConnected: true,
    });
  });

  it('rejects a forged host and a non-canonical team assignment', () => {
    const event = createTeamEscapeRaceStartEvent({
      hostNodeId: 'node-a', operationId: 'race-forged', participants: PARTICIPANTS,
      seed: 73, stages: STAGES, startsAt: STARTS_AT,
    });
    expect(acceptTeamEscapeRaceStart({
      event, eventId: 'forged-start', senderId: 'node-b', serverTime: STARTS_AT - 1,
    }, 'node-a')).toEqual({ accepted: false, reason: 'UNTRUSTED_HOST' });

    const tampered = {
      ...event,
      assignments: event.assignments.map((assignment, index) => ({
        ...assignment,
        memberNodeIds: [...event.assignments[index === 0 ? 1 : 0].memberNodeIds],
      })),
    };
    expect(acceptTeamEscapeRaceStart({
      event: tampered, eventId: 'tampered-start', senderId: 'node-a', serverTime: STARTS_AT - 1,
    }, 'node-a')).toEqual({ accepted: false, reason: 'UNFAIR_ASSIGNMENT' });
  });
});

describe('independent team progress and proof ownership', () => {
  it('advances one team without moving its opponent', () => {
    let state = startState();
    const [racingTeam, waitingTeam] = state.teams;
    const racer = racingTeam.memberNodeIds[0];

    let reduction = submit(state, racer, 'left-seal', STARTS_AT + 1_000, 'proof-left');
    expect(reduction).toMatchObject({ accepted: true, changed: true });
    state = reduction.state;
    reduction = submit(state, racer, 'right-seal', STARTS_AT + 2_000, 'proof-right');
    state = reduction.state;

    expect(state.teams.find((team) => team.teamId === racingTeam.teamId)).toMatchObject({
      stageIndex: 1,
      acceptedProofs: [],
    });
    expect(state.teams.find((team) => team.teamId === waitingTeam.teamId)).toMatchObject({
      stageIndex: 0,
      acceptedProofs: [],
    });
    expect(state.revision).toBe(2);
  });

  it('rejects a valid player claiming another team, even with that team proof token', () => {
    const state = startState();
    const ownTeam = state.teams[0];
    const otherTeam = state.teams[1];
    const nodeId = ownTeam.memberNodeIds[0];
    const valid = createTeamEscapeRaceProofEvent(state, nodeId, 'left-seal', STARTS_AT + 1_000, 'cross-team');
    if (!valid) throw new Error('Expected a valid proof fixture.');
    const forged: TeamEscapeRaceProofEvent = {
      ...valid,
      teamId: otherTeam.teamId,
      proofToken: teamEscapeRaceProofToken(state, otherTeam.teamId, valid.stageId, valid.proofId),
    };
    const reduction = reduceTeamEscapeRaceProof(state, {
      event: forged,
      eventId: 'cross-team',
      senderId: nodeId,
      serverTime: STARTS_AT + 1_000,
    }, { isAuthority: true, localNodeId: state.hostNodeId });

    expect(reduction).toMatchObject({ accepted: false, changed: false, reason: 'TEAM_MISMATCH' });
    expect(reduction.state).toBe(state);
  });

  it('uses relay time and host authority, rejecting early, spoofed, and client-only acceptance', () => {
    const state = startState();
    const nodeId = state.teams[0].memberNodeIds[0];
    const event = createTeamEscapeRaceProofEvent(state, nodeId, 'left-seal', STARTS_AT, 'guarded-proof');
    if (!event) throw new Error('Expected a valid proof fixture.');

    expect(reduceTeamEscapeRaceProof(state, {
      event, eventId: 'guarded-proof', senderId: nodeId, serverTime: STARTS_AT - 1,
    }, { isAuthority: true, localNodeId: state.hostNodeId }).reason).toBe('NOT_STARTED');
    expect(reduceTeamEscapeRaceProof(state, {
      event, eventId: 'guarded-proof', senderId: 'node-intruder', serverTime: STARTS_AT,
    }, { isAuthority: true, localNodeId: state.hostNodeId }).reason).toBe('UNTRUSTED_SENDER');
    expect(reduceTeamEscapeRaceProof(state, {
      event, eventId: 'guarded-proof', senderId: nodeId, serverTime: STARTS_AT,
    }, { isAuthority: false, localNodeId: nodeId }).reason).toBe('NOT_AUTHORITY');
  });

  it('is idempotent for relay retries and duplicate stage proofs', () => {
    const state = startState();
    const nodeId = state.teams[0].memberNodeIds[0];
    const first = submit(state, nodeId, 'left-seal', STARTS_AT + 1_000, 'same-proof');
    const event = createTeamEscapeRaceProofEvent(first.state, nodeId, 'left-seal', STARTS_AT + 1_100, 'new-envelope');
    if (!event) throw new Error('Expected duplicate proof event to be constructible.');

    const retried = reduceTeamEscapeRaceProof(first.state, {
      event: { ...event, submissionId: 'same-proof' },
      eventId: 'same-proof',
      senderId: nodeId,
      serverTime: STARTS_AT + 1_100,
    }, { isAuthority: true, localNodeId: first.state.hostNodeId });
    const duplicate = reduceTeamEscapeRaceProof(first.state, {
      event,
      eventId: 'new-envelope',
      senderId: nodeId,
      serverTime: STARTS_AT + 1_100,
    }, { isAuthority: true, localNodeId: first.state.hostNodeId });

    expect(retried).toMatchObject({ accepted: true, changed: false });
    expect(duplicate).toMatchObject({ accepted: true, changed: false });
    expect(duplicate.state.revision).toBe(1);
  });
});

describe('finish ranking and disconnect projection', () => {
  it('uses competition ranking for server-time ties', () => {
    const participants = Array.from({ length: 6 }, (_, index) => ({
      nodeId: `rank-${index + 1}`,
      label: `Racer ${index + 1}`,
      skill: 5,
    }));
    const event = createTeamEscapeRaceStartEvent({
      hostNodeId: 'rank-1',
      operationId: 'rank-race',
      participants,
      seed: 9,
      stages: [{ id: 'only-stage', proofIds: ['finish'] }],
      startsAt: 1_000,
      teamIds: ['amber', 'cyan', 'mint'],
      tieWindowMs: TEAM_ESCAPE_RACE_DEFAULT_TIE_WINDOW_MS,
    });
    const accepted = acceptTeamEscapeRaceStart({
      event, eventId: 'rank-start', senderId: 'rank-1', serverTime: 900,
    }, 'rank-1');
    if (!accepted.accepted) throw new Error('Ranking race failed to start.');
    let state = accepted.state;
    const finishTimes = [10_000, 10_500, 12_000];
    for (let index = 0; index < state.teams.length; index += 1) {
      const teamId = state.teams[index].teamId;
      const result = submit(state, firstMember(state, teamId), 'finish', finishTimes[index], `finish-${index}`);
      expect(result.accepted).toBe(true);
      state = result.state;
    }

    expect(rankTeamEscapeRace(state, 13_000).map(({ teamId, rank, tied }) => ({ teamId, rank, tied }))).toEqual([
      { teamId: state.teams[0].teamId, rank: 1, tied: true },
      { teamId: state.teams[1].teamId, rank: 1, tied: true },
      { teamId: state.teams[2].teamId, rank: 3, tied: false },
    ]);
    expect(teamEscapeRacePhaseAt(state, 13_000)).toBe('complete');
  });

  it('preserves progress while phones disconnect and recovers by stable node id', () => {
    let state = startState();
    const team = state.teams.find((candidate) => !candidate.memberNodeIds.includes(state.hostNodeId)) ?? state.teams[0];
    state = submit(state, team.memberNodeIds[0], 'left-seal', STARTS_AT + 1_000, 'durable-proof').state;

    const degraded = projectTeamEscapeRace(state, STARTS_AT + 2_000, [team.memberNodeIds[0]]);
    const projectedTeam = degraded.teams.find((candidate) => candidate.teamId === team.teamId);
    expect(projectedTeam).toMatchObject({
      acceptedProofCount: 1,
      canSubmit: true,
      connectionStatus: 'degraded',
    });
    expect(degraded.authorityConnected).toBe(team.memberNodeIds.includes(state.hostNodeId));

    const recovered = projectTeamEscapeRace(state, STARTS_AT + 3_000, state.participants.map((item) => item.nodeId));
    expect(recovered.teams.find((candidate) => candidate.teamId === team.teamId)).toMatchObject({
      acceptedProofCount: 1,
      connectionStatus: 'online',
      offlineNodeIds: [],
    });
  });
});

describe('local practice simulation', () => {
  it('creates a complete two-team race and advances only simulated opponents by default', () => {
    const initial = createPracticeTeamEscapeRace({
      localNodeId: 'local',
      operationId: 'practice-race',
      seed: 101,
      stages: STAGES,
      startsAt: 1_000,
    });
    expect(initial.mode).toBe('practice');
    expect(initial.participants).toHaveLength(4);
    expect(initial.teams).toHaveLength(2);

    const localTeamId = initial.teams.find((team) => team.memberNodeIds.includes('local'))?.teamId;
    const tick = simulatePracticeTeamEscapeRace(initial, 100_000, { paceMs: 1_000 });
    expect(tick.generatedFrames.length).toBeGreaterThan(0);
    const localTeam = tick.state.teams.find((team) => team.teamId === localTeamId);
    expect(localTeam).toMatchObject({
      stageIndex: 0,
      acceptedProofs: [],
    });
    expect(localTeam?.finishedAt).toBeUndefined();
    expect(tick.state.teams.find((team) => team.teamId !== localTeamId)?.finishedAt).toBeDefined();

    const repeated = simulatePracticeTeamEscapeRace(tick.state, 100_000, { paceMs: 1_000 });
    expect(repeated.generatedFrames).toEqual([]);
    expect(repeated.state).toBe(tick.state);
  });
});

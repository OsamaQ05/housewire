import { describe, expect, it } from 'vitest';

import {
  compileCircuitRace,
  type CircuitRaceOpeningStage,
  type CircuitRaceSubmission,
} from '../../domain/circuit-race';
import {
  acceptTeamEscapeRaceStart,
  createPracticeTeamEscapeRace,
  createTeamEscapeRaceProofEvent,
  createTeamEscapeRaceStartEvent,
  reduceTeamEscapeRaceProof,
  simulatePracticeTeamEscapeRace,
  type TeamEscapeRaceParticipantInput,
  type TeamEscapeRaceStageInput,
  type TeamEscapeRaceState,
} from '../../domain/team-escape-race';

import {
  acceptCircuitRaceSnapshotFrame,
  acceptCircuitRaceStartFrame,
  createCircuitRacePlayerSnapshot,
  createCircuitRaceProofSubmissionFromSnapshot,
  isCircuitRacePendingProofAcknowledged,
  projectCircuitRacePlayerSnapshot,
  reduceCircuitRaceProofFrame,
} from './coordinator';
import {
  createSignedCircuitRacePlayerSnapshot,
  makeCircuitRaceProofResultMessage,
  makeCircuitRaceSnapshotMessage,
  makeCircuitRaceSnapshotRequestMessage,
  makeCircuitRaceStartMessage,
  parseCircuitRaceDirectMessage,
} from './protocol';
import { projectCircuitRaceCourseForPlayer, projectCircuitRaceCoursePreview } from './course-projection';

const STARTS_AT = 10_000;
const RACE_ID = 'breaker-circuit';
const COURSE = compileCircuitRace(0x51_c0_17, 'authority');
const STAGES: readonly TeamEscapeRaceStageInput[] = COURSE.stages.map((stage, index) => ({
  id: stage.id,
  label: stage.title,
  proofIds: [`opaque-proof-${index + 1}`],
}));
const FIRST_PROOF = STAGES[0].proofIds[0];
const VALID_FIRST_SUBMISSION = validOpeningSubmission(COURSE.stages[0]);
const VALID_EVIDENCE = { submission: VALID_FIRST_SUBMISSION, revealedHintCount: 0 } as const;

function validOpeningSubmission(stage: CircuitRaceOpeningStage): CircuitRaceSubmission {
  if (stage.mechanic === 'sequence-cipher') {
    return {
      mechanic: stage.mechanic,
      code: [...stage.challenge.panels]
        .sort((left, right) => left.pulseOrder - right.pulseOrder)
        .map((panel) => stage.challenge.cipherWheel.find((entry) => entry.glyph === panel.glyph)!.digit)
        .join(''),
    };
  }
  if (stage.mechanic === 'knock-pattern') {
    return {
      mechanic: stage.mechanic,
      mode: 'accessible',
      pattern: stage.challenge.pulseDurationsMs.map((duration) => duration < 320 ? 'SHORT' : 'LONG'),
    };
  }
  return {
    heldMs: stage.challenge.fallback.minimumHoldMs,
    mechanic: stage.mechanic,
    mode: 'manual-hold',
  };
}

function snapshotFor(state: TeamEscapeRaceState, recipientNodeId: string) {
  return createCircuitRacePlayerSnapshot(state, RACE_ID, recipientNodeId, COURSE);
}

function nestedKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(nestedKeys);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...nestedKeys(child)]);
}

function participants(count = 4): TeamEscapeRaceParticipantInput[] {
  return Array.from({ length: count }, (_, index) => ({
    nodeId: `node-${index + 1}`,
    label: `Phone ${index + 1}`,
    skill: 5,
    simulated: false,
  }));
}

function stateAt(
  startsAt = STARTS_AT,
  operationId = 'race-operation',
  count = 4,
): TeamEscapeRaceState {
  const event = createTeamEscapeRaceStartEvent({
    hostNodeId: 'node-1',
    operationId,
    participants: participants(count),
    seed: 73,
    stages: STAGES,
    startsAt,
  });
  const accepted = acceptTeamEscapeRaceStart({
    event,
    eventId: `start-${operationId}`,
    senderId: 'node-1',
    serverTime: Math.max(0, startsAt - 1_000),
  }, 'node-1');
  if (!accepted.accepted) throw new Error(`Fixture start rejected: ${accepted.reason}`);
  return accepted.state;
}

function submittingGuest(state: TeamEscapeRaceState): string {
  const nodeId = state.teams
    .map((team) => team.memberNodeIds[1])
    .find((candidate) => candidate && candidate !== state.hostNodeId);
  if (!nodeId) throw new Error('Fixture needs a non-host input-station player.');
  return nodeId;
}

function acceptProof(
  state: TeamEscapeRaceState,
  nodeId: string,
  proofId: string,
  serverTime: number,
  submissionId: string,
): TeamEscapeRaceState {
  const event = createTeamEscapeRaceProofEvent(state, nodeId, proofId, serverTime, submissionId);
  if (!event) throw new Error('Could not build the proof fixture.');
  const reduction = reduceTeamEscapeRaceProof(state, {
    event,
    eventId: submissionId,
    senderId: nodeId,
    serverTime,
  }, { isAuthority: true, localNodeId: state.hostNodeId });
  if (!reduction.accepted) throw new Error(`Proof fixture rejected: ${reduction.reason}`);
  return reduction.state;
}

describe('strict Circuit Race direct protocol', () => {
  it('signs symmetric live starts and rejects mutation, simulation, unknown fields, and unfair counts', () => {
    for (const count of [2, 4]) {
      const state = stateAt(STARTS_AT, `race-${count}`, count);
      const event = createTeamEscapeRaceStartEvent({
        hostNodeId: state.hostNodeId,
        operationId: state.operationId,
        participants: state.participants,
        seed: state.seed,
        stages: state.stages,
        startsAt: state.startsAt,
      });
      expect(parseCircuitRaceDirectMessage(makeCircuitRaceStartMessage(
        RACE_ID,
        event,
        projectCircuitRaceCoursePreview(COURSE),
      ))?.kind).toBe('circuit-race.start');
    }

    const event = createTeamEscapeRaceStartEvent({
      hostNodeId: 'node-1', operationId: 'signed-start', participants: participants(),
      seed: 4, stages: STAGES, startsAt: STARTS_AT,
    });
    const message = makeCircuitRaceStartMessage(RACE_ID, event, projectCircuitRaceCoursePreview(COURSE));
    expect(parseCircuitRaceDirectMessage({ ...message, event: { ...event, seed: 5 } })).toBeUndefined();
    expect(parseCircuitRaceDirectMessage({ ...message, extra: 'unbounded' })).toBeUndefined();

    const three = createTeamEscapeRaceStartEvent({
      hostNodeId: 'node-1', operationId: 'three-live', participants: participants(3),
      seed: 4, stages: STAGES, startsAt: STARTS_AT,
    });
    expect(() => makeCircuitRaceStartMessage(RACE_ID, three, projectCircuitRaceCoursePreview(COURSE))).toThrow(/exactly two or four/i);

    const simulated = createTeamEscapeRaceStartEvent({
      hostNodeId: 'node-1', operationId: 'simulated-live',
      participants: participants().map((player, index) => ({ ...player, simulated: index === 2 })),
      seed: 4, stages: STAGES, startsAt: STARTS_AT,
    });
    expect(() => makeCircuitRaceStartMessage(RACE_ID, simulated, projectCircuitRaceCoursePreview(COURSE))).toThrow(/simulated/i);
    const rated = createTeamEscapeRaceStartEvent({
      hostNodeId: 'node-1', operationId: 'rated-live',
      participants: participants().map((player, index) => ({ ...player, skill: index === 1 ? 8 : 5 })),
      seed: 4, stages: STAGES, startsAt: STARTS_AT,
    });
    expect(() => makeCircuitRaceStartMessage(RACE_ID, rated, projectCircuitRaceCoursePreview(COURSE))).toThrow(/private player ratings/i);
    const five = createTeamEscapeRaceStartEvent({
      hostNodeId: 'node-1', operationId: 'five-live', participants: participants(5),
      seed: 4, stages: STAGES, startsAt: STARTS_AT,
    });
    expect(() => makeCircuitRaceStartMessage(RACE_ID, five, projectCircuitRaceCoursePreview(COURSE))).toThrow(/exactly two or four/i);

    for (const teamIds of [['one', 'two', 'three'], ['one', 'two', 'three', 'four']]) {
      const extraCrews = createTeamEscapeRaceStartEvent({
        hostNodeId: 'node-1',
        operationId: `extra-crews-${teamIds.length}`,
        participants: participants(4),
        seed: 4,
        stages: STAGES,
        startsAt: STARTS_AT,
        teamIds,
      });
      expect(() => makeCircuitRaceStartMessage(
        RACE_ID,
        extraCrews,
        projectCircuitRaceCoursePreview(COURSE),
      )).toThrow(/exactly two crews/i);
    }
  });

  it('strictly validates results and reconnect requests', () => {
    expect(() => makeCircuitRaceProofResultMessage({
      raceId: RACE_ID,
      operationId: 'op-result',
      requestId: 'proof-result',
      accepted: false,
      changed: false,
      revision: 0,
    })).toThrow(/reason/i);
    expect(() => makeCircuitRaceSnapshotRequestMessage({
      raceId: RACE_ID,
      requestId: 'request-state',
      knownRevision: 2,
    })).toThrow(/operation/i);
    const request = makeCircuitRaceSnapshotRequestMessage({
      raceId: RACE_ID,
      requestId: 'request-state',
      knownOperationId: 'race-operation',
      knownRevision: 2,
    });
    expect(parseCircuitRaceDirectMessage(request)).toEqual(request);
    expect(parseCircuitRaceDirectMessage({ ...request, freeText: 'please trust me' })).toBeUndefined();
  });
});

describe('relay-authenticated starts and reconnect snapshots', () => {
  it('accepts a host start only for the addressed participant', () => {
    const state = stateAt();
    const event = createTeamEscapeRaceStartEvent({
      hostNodeId: state.hostNodeId,
      operationId: state.operationId,
      participants: state.participants,
      seed: state.seed,
      stages: state.stages,
      startsAt: state.startsAt,
      tieWindowMs: state.tieWindowMs,
    });
    const payload = makeCircuitRaceStartMessage(
      RACE_ID,
      event,
      projectCircuitRaceCourseForPlayer(COURSE, state, 'node-2'),
    );
    const frame = {
      messageId: 'direct-start', payload, recipientId: 'node-2', senderId: 'node-1', serverTime: 9_100,
    };
    const accepted = acceptCircuitRaceStartFrame(frame, {
      expectedHostNodeId: 'node-1', localNodeId: 'node-2', raceId: RACE_ID,
    });
    expect(accepted).toMatchObject({ accepted: true, snapshot: { recipientNodeId: 'node-2', revision: 0 } });
    expect(acceptCircuitRaceStartFrame({ ...frame, senderId: 'node-3' }, {
      expectedHostNodeId: 'node-1', localNodeId: 'node-2', raceId: RACE_ID,
    })).toEqual({ accepted: false, reason: 'UNTRUSTED_HOST' });
    expect(acceptCircuitRaceStartFrame({ ...frame, recipientId: 'node-4' }, {
      expectedHostNodeId: 'node-1', localNodeId: 'node-2', raceId: RACE_ID,
    })).toEqual({ accepted: false, reason: 'WRONG_RECIPIENT' });

    const team = state.teams.find((candidate) => candidate.memberNodeIds.length === 2)!;
    const slotZero = team.memberNodeIds[0];
    const slotOne = team.memberNodeIds[1];
    const wrongRolePayload = makeCircuitRaceStartMessage(
      RACE_ID,
      event,
      projectCircuitRaceCourseForPlayer(COURSE, state, slotZero),
    );
    expect(() => acceptCircuitRaceStartFrame({
      ...frame,
      messageId: 'wrong-role-start',
      payload: wrongRolePayload,
      recipientId: slotOne,
    }, {
      expectedHostNodeId: 'node-1', localNodeId: slotOne, raceId: RACE_ID,
    })).not.toThrow();
    expect(acceptCircuitRaceStartFrame({
      ...frame,
      messageId: 'wrong-role-start',
      payload: wrongRolePayload,
      recipientId: slotOne,
    }, {
      expectedHostNodeId: 'node-1', localNodeId: slotOne, raceId: RACE_ID,
    })).toEqual({ accepted: false, reason: 'MALFORMED' });
  });

  it('redacts completed proof records while retaining each team stage replay', () => {
    let state = stateAt();
    const ownTeam = state.teams[0];
    const rivalTeam = state.teams[1];
    state = acceptProof(state, rivalTeam.memberNodeIds[0], FIRST_PROOF, 11_000, 'rival-secret-event');
    state = acceptProof(state, ownTeam.memberNodeIds[0], FIRST_PROOF, 11_100, 'own-replay-event');

    const snapshot = snapshotFor(state, ownTeam.memberNodeIds[0]);
    expect(snapshot.ownTeam).toMatchObject({ acceptedProofs: [], stageIndex: 1 });
    expect(snapshot.opponents[0]).toEqual({
      teamId: rivalTeam.teamId,
      stageIndex: 1,
      acceptedProofCount: 0,
      finishedAt: undefined,
    });
    expect(snapshot.opponents[0]).not.toHaveProperty('acceptedProofs');
    expect(snapshot.opponents[0]).not.toHaveProperty('proofId');
    expect(JSON.stringify(snapshot)).not.toContain('rival-secret-event');
    expect(JSON.stringify(snapshot)).not.toContain('own-replay-event');
    expect(snapshot.participants[0]).not.toHaveProperty('skill');
  });

  it('projects only the addressed 2v2 strip and never transmits the content seed', () => {
    const initial = stateAt();
    const state = {
      ...initial,
      teams: initial.teams.map((team) => ({ ...team, stageIndex: 3 })),
    };
    const team = state.teams[0];
    expect(snapshotFor(initial, team.memberNodeIds[0]).course.breakerFragments).toEqual([]);
    const first = snapshotFor(state, team.memberNodeIds[0]);
    const second = snapshotFor(state, team.memberNodeIds[1]);

    expect(first.assignmentSeed).toBe(state.seed);
    expect(first.assignmentSeed).not.toBe(COURSE.seed);
    expect(first.course.breakerFragments).toHaveLength(1);
    expect(second.course.breakerFragments).toHaveLength(1);
    expect(first.course.breakerFragments[0].ownerSlot).not.toBe(second.course.breakerFragments[0].ownerSlot);
    expect(JSON.stringify(first)).not.toContain(second.course.breakerFragments[0].fragmentId);
    expect(JSON.stringify(first.course)).not.toContain(COURSE.breakerFragments[0].fragmentId);
    expect(JSON.stringify(first.course)).not.toContain(COURSE.breakerFragments[1].fragmentId);
    const sequenceStage = COURSE.stages.find((stage) => stage.mechanic === 'sequence-cipher');
    if (!sequenceStage || sequenceStage.mechanic !== 'sequence-cipher') {
      throw new Error('Fixture needs a riddle stage.');
    }
    for (const panel of sequenceStage.challenge.panels) {
      expect(JSON.stringify(first.course)).not.toContain(panel.panelId);
    }
    expect(nestedKeys(first.course)).not.toEqual(expect.arrayContaining([
      'answers',
      'contentId',
      'proofId',
      'seed',
    ]));
  });

  it('rejects reconnect projections with more than two crews', () => {
    const event = createTeamEscapeRaceStartEvent({
      hostNodeId: 'node-1',
      operationId: 'three-crew-snapshot',
      participants: participants(4),
      seed: 33,
      stages: STAGES,
      startsAt: STARTS_AT,
      teamIds: ['one', 'two', 'three'],
    });
    const accepted = acceptTeamEscapeRaceStart({
      event,
      eventId: 'three-crew-start',
      senderId: 'node-1',
      serverTime: STARTS_AT - 1_000,
    }, 'node-1');
    if (!accepted.accepted) throw new Error(`Fixture start rejected: ${accepted.reason}`);
    expect(() => createCircuitRacePlayerSnapshot(
      accepted.state,
      RACE_ID,
      'node-1',
      projectCircuitRaceCoursePreview(COURSE),
    )).toThrow(/symmetric 1v1 or 2v2|exactly 1 item|opponents/i);
  });

  it('accepts monotonic host snapshots and rejects redirects, mutation, and older operations', () => {
    const state = stateAt(20_000, 'current-race');
    const localNodeId = state.teams[0].memberNodeIds[0];
    const snapshot = snapshotFor(state, localNodeId);
    const payload = makeCircuitRaceSnapshotMessage(snapshot);
    const frame = {
      messageId: 'snapshot-one', payload, recipientId: localNodeId, senderId: state.hostNodeId, serverTime: 19_000,
    };
    expect(acceptCircuitRaceSnapshotFrame(frame, {
      expectedHostNodeId: state.hostNodeId, localNodeId, raceId: RACE_ID,
    })).toMatchObject({ accepted: true, changed: true });
    expect(acceptCircuitRaceSnapshotFrame(frame, {
      current: snapshot, expectedHostNodeId: state.hostNodeId, localNodeId, raceId: RACE_ID,
    })).toMatchObject({ accepted: true, changed: false });
    expect(acceptCircuitRaceSnapshotFrame({ ...frame, recipientId: 'node-4' }, {
      expectedHostNodeId: state.hostNodeId, localNodeId, raceId: RACE_ID,
    })).toMatchObject({ accepted: false, reason: 'WRONG_RECIPIENT' });

    const mutatedPayload = {
      ...payload,
      snapshot: {
        ...payload.snapshot,
        opponents: payload.snapshot.opponents.map((team, index) =>
          index === 0 ? { ...team, acceptedProofCount: 1 } : team,
        ),
      },
    };
    expect(acceptCircuitRaceSnapshotFrame({ ...frame, payload: mutatedPayload }, {
      expectedHostNodeId: state.hostNodeId, localNodeId, raceId: RACE_ID,
    })).toMatchObject({ accepted: false, reason: 'MALFORMED' });

    const staleState = stateAt(19_000, 'older-race');
    const stalePayload = makeCircuitRaceSnapshotMessage(
      snapshotFor(staleState, localNodeId),
    );
    expect(acceptCircuitRaceSnapshotFrame({ ...frame, messageId: 'snapshot-old', payload: stalePayload }, {
      current: snapshot, expectedHostNodeId: state.hostNodeId, localNodeId, raceId: RACE_ID,
    })).toMatchObject({ accepted: false, changed: false, reason: 'STALE_OPERATION' });

    const { authoritySignature: _signature, ...unsignedSnapshot } = snapshot;
    const changedSeed = createSignedCircuitRacePlayerSnapshot({
      ...unsignedSnapshot,
      assignmentSeed: snapshot.assignmentSeed === 0 ? 1 : snapshot.assignmentSeed - 1,
      revision: snapshot.revision + 1,
    });
    expect(acceptCircuitRaceSnapshotFrame({
      ...frame,
      messageId: 'snapshot-changed-seed',
      payload: makeCircuitRaceSnapshotMessage(changedSeed),
    }, {
      current: snapshot, expectedHostNodeId: state.hostNodeId, localNodeId, raceId: RACE_ID,
    })).toMatchObject({ accepted: false, changed: false, reason: 'STALE_OPERATION' });

    const changedClock = createSignedCircuitRacePlayerSnapshot({
      ...unsignedSnapshot,
      revision: snapshot.revision + 1,
      startsAt: snapshot.startsAt + 1_000,
    });
    expect(acceptCircuitRaceSnapshotFrame({
      ...frame,
      messageId: 'snapshot-changed-clock',
      payload: makeCircuitRaceSnapshotMessage(changedClock),
    }, {
      current: snapshot, expectedHostNodeId: state.hostNodeId, localNodeId, raceId: RACE_ID,
    })).toMatchObject({ accepted: false, changed: false, reason: 'STALE_OPERATION' });
  });

  it('treats a newer stage snapshot as proof acknowledgment when the result frame is lost', () => {
    const state = stateAt();
    const nodeId = submittingGuest(state);
    const before = snapshotFor(state, nodeId);
    const advancedState = acceptProof(state, nodeId, FIRST_PROOF, 11_000, 'snapshot-ack-proof');
    const after = snapshotFor(advancedState, nodeId);

    expect(isCircuitRacePendingProofAcknowledged({
      operationId: before.operationId,
      revision: before.revision,
      stageIndex: before.ownTeam.stageIndex,
    }, after)).toBe(true);
    expect(isCircuitRacePendingProofAcknowledged({
      operationId: before.operationId,
      revision: before.revision,
      stageIndex: before.ownTeam.stageIndex,
    }, before)).toBe(false);
  });
});

describe('private proof submission and authoritative relay time', () => {
  it('builds a proof only for the snapshot recipient and their current stage', () => {
    const state = stateAt();
    const guestId = state.participants.find((participant) => participant.nodeId !== state.hostNodeId)!.nodeId;
    const snapshot = snapshotFor(state, guestId);
    const message = createCircuitRaceProofSubmissionFromSnapshot({
      snapshot, nodeId: guestId, proofId: FIRST_PROOF, observedAt: 11_000, requestId: 'proof-request',
      ...VALID_EVIDENCE,
    });
    expect(message).toMatchObject({
      kind: 'circuit-race.proof.submit',
      event: { nodeId: guestId, proofId: FIRST_PROOF, submissionId: 'proof-request' },
    });
    expect(createCircuitRaceProofSubmissionFromSnapshot({
      snapshot, nodeId: state.hostNodeId, proofId: FIRST_PROOF, observedAt: 11_000, requestId: 'wrong-node',
      ...VALID_EVIDENCE,
    })).toBeUndefined();
    expect(createCircuitRaceProofSubmissionFromSnapshot({
      snapshot, nodeId: guestId, proofId: 'made-up-proof', observedAt: 11_000, requestId: 'wrong-proof',
      ...VALID_EVIDENCE,
    })).toBeUndefined();
  });

  it('records relay time—not the guest clock—and rejects spoofed or wildly skewed proofs', () => {
    const state = stateAt();
    const guestId = submittingGuest(state);
    const snapshot = snapshotFor(state, guestId);
    const message = createCircuitRaceProofSubmissionFromSnapshot({
      snapshot, nodeId: guestId, proofId: FIRST_PROOF, observedAt: 10_100, requestId: 'relay-timed-proof',
      ...VALID_EVIDENCE,
    });
    if (!message) throw new Error('Expected a proof message.');
    const frame = {
      messageId: 'transport-envelope', payload: message, recipientId: state.hostNodeId,
      senderId: guestId, serverTime: 12_345,
    };
    const handled = reduceCircuitRaceProofFrame(state, frame, { course: COURSE, hostNodeId: state.hostNodeId, raceId: RACE_ID });
    expect(handled?.reduction).toMatchObject({ accepted: true, changed: true });
    const team = handled?.reduction.state.teams.find((candidate) => candidate.memberNodeIds.includes(guestId));
    expect(team?.stageStartedAt).toBe(12_345);

    expect(reduceCircuitRaceProofFrame(state, { ...frame, senderId: 'node-99' }, {
      course: COURSE, hostNodeId: state.hostNodeId, raceId: RACE_ID,
    })?.reduction.reason).toBe('UNTRUSTED_SENDER');

    const skewed = createCircuitRaceProofSubmissionFromSnapshot({
      snapshot, nodeId: guestId, proofId: FIRST_PROOF, observedAt: 900_000, requestId: 'skewed-proof',
      ...VALID_EVIDENCE,
    });
    if (!skewed) throw new Error('Expected a skewed proof message.');
    expect(reduceCircuitRaceProofFrame(state, { ...frame, payload: skewed }, {
      course: COURSE, hostNodeId: state.hostNodeId, raceId: RACE_ID,
    })?.reduction.reason).toBe('CLOCK_SKEW');
  });

  it('rejects a forged answer even when its proof token and relay identity are valid', () => {
    const state = stateAt();
    const guestId = submittingGuest(state);
    const snapshot = snapshotFor(state, guestId);
    const forged = createCircuitRaceProofSubmissionFromSnapshot({
      snapshot,
      nodeId: guestId,
      proofId: FIRST_PROOF,
      observedAt: 11_000,
      requestId: 'forged-answer',
      submission: { mechanic: 'sequence-cipher', code: '0000' },
      revealedHintCount: 0,
    });
    if (!forged) throw new Error('Expected a structurally valid forged proof.');

    const rejected = reduceCircuitRaceProofFrame(state, {
      messageId: 'forged-frame',
      payload: forged,
      recipientId: state.hostNodeId,
      senderId: guestId,
      serverTime: 11_000,
    }, { course: COURSE, hostNodeId: state.hostNodeId, raceId: RACE_ID });
    expect(rejected?.reduction).toMatchObject({
      accepted: false,
      changed: false,
      reason: 'INVALID_PROOF',
      state: { revision: 0 },
    });

    const { submission: _submission, ...bareProof } = forged;
    expect(parseCircuitRaceDirectMessage(bareProof)).toBeUndefined();
  });

  it('uses the logical proof request for idempotent direct replay', () => {
    const state = stateAt();
    const guestId = submittingGuest(state);
    const snapshot = snapshotFor(state, guestId);
    const message = createCircuitRaceProofSubmissionFromSnapshot({
      snapshot, nodeId: guestId, proofId: FIRST_PROOF, observedAt: 11_000, requestId: 'stable-request',
      ...VALID_EVIDENCE,
    });
    if (!message) throw new Error('Expected a proof message.');
    const first = reduceCircuitRaceProofFrame(state, {
      messageId: 'transport-one', payload: message, recipientId: state.hostNodeId,
      senderId: guestId, serverTime: 11_000,
    }, { course: COURSE, hostNodeId: state.hostNodeId, raceId: RACE_ID });
    if (!first) throw new Error('Expected the proof to be handled.');
    const replay = reduceCircuitRaceProofFrame(first.reduction.state, {
      messageId: 'transport-two', payload: message, recipientId: state.hostNodeId,
      senderId: guestId, serverTime: 11_100,
    }, { course: COURSE, hostNodeId: state.hostNodeId, raceId: RACE_ID });
    expect(replay?.reduction).toMatchObject({ accepted: true, changed: false });
    expect(replay?.reduction.state.revision).toBe(1);
  });

  it('allows only the complementary input station to submit early 2v2 proofs', () => {
    const state = stateAt();
    const team = state.teams[0];
    const readerId = team.memberNodeIds[0];
    const snapshot = snapshotFor(state, readerId);
    const message = createCircuitRaceProofSubmissionFromSnapshot({
      snapshot,
      nodeId: readerId,
      proofId: FIRST_PROOF,
      observedAt: 11_000,
      requestId: 'wrong-station-proof',
      ...VALID_EVIDENCE,
    });
    if (!message) throw new Error('Expected a structurally valid station proof.');
    expect(reduceCircuitRaceProofFrame(state, {
      messageId: 'wrong-station-frame',
      payload: message,
      recipientId: state.hostNodeId,
      senderId: readerId,
      serverTime: 11_000,
    }, { course: COURSE, hostNodeId: state.hostNodeId, raceId: RACE_ID })?.reduction).toMatchObject({
      accepted: false,
      changed: false,
      reason: 'INVALID_PROOF',
      state: { revision: 0 },
    });
  });
});

describe('player projection and practice compatibility', () => {
  it('shows rival progress without adding rival proof identities to the view', () => {
    let state = stateAt();
    const ownTeam = state.teams[0];
    const rivalTeam = state.teams[1];
    state = acceptProof(state, ownTeam.memberNodeIds[0], FIRST_PROOF, 11_000, 'own-proof');
    state = acceptProof(state, rivalTeam.memberNodeIds[0], FIRST_PROOF, 11_200, 'private-rival-proof');
    const snapshot = snapshotFor(state, ownTeam.memberNodeIds[0]);
    const view = projectCircuitRacePlayerSnapshot(
      snapshot,
      12_000,
      state.participants.map((participant) => participant.nodeId),
    );
    expect(view.phase).toBe('running');
    expect(view.teams.find((team) => team.isLocalTeam)).toMatchObject({ acceptedProofIds: [], stageIndex: 1 });
    const rivalView = view.teams.find((team) => team.teamId === rivalTeam.teamId);
    expect(rivalView).toMatchObject({ acceptedProofCount: 0, isLocalTeam: false, stageIndex: 1 });
    expect(rivalView).not.toHaveProperty('acceptedProofIds');
    expect(JSON.stringify(view)).not.toContain('private-rival-proof');
  });

  it('projects and advances the same shape from deterministic local practice state', () => {
    const practice = createPracticeTeamEscapeRace({
      localNodeId: 'local',
      operationId: 'practice-operation',
      seed: 91,
      simulatedPlayerCount: 3,
      stages: STAGES,
      startsAt: 1_000,
    });
    const initialSnapshot = snapshotFor(practice, 'local');
    expect(initialSnapshot).toMatchObject({ mode: 'practice', recipientNodeId: 'local' });
    expect(projectCircuitRacePlayerSnapshot(
      initialSnapshot,
      1_000,
      practice.participants.map((participant) => participant.nodeId),
    )).toMatchObject({ mode: 'practice', phase: 'running' });

    const practiceProofId = practice.stages[0].proofIds[0];
    const practiceSubmission = createCircuitRaceProofSubmissionFromSnapshot({
      snapshot: initialSnapshot,
      nodeId: 'local',
      proofId: practiceProofId,
      observedAt: 1_100,
      requestId: 'practice-visible-answer',
      ...VALID_EVIDENCE,
    });
    if (!practiceSubmission) throw new Error('Expected a local practice proof.');
    expect(practice.teams.find((team) => team.memberNodeIds.includes('local'))?.memberNodeIds.indexOf('local')).toBe(0);
    expect(reduceCircuitRaceProofFrame(practice, {
      messageId: 'practice-visible-frame',
      payload: practiceSubmission,
      recipientId: 'local',
      senderId: 'local',
      serverTime: 1_100,
    }, { course: COURSE, hostNodeId: 'local', raceId: RACE_ID })?.reduction).toMatchObject({
      accepted: true,
      changed: true,
      state: { revision: 1 },
    });

    const tick = simulatePracticeTeamEscapeRace(practice, 100_000, { paceMs: 1_000 });
    expect(tick.state.revision).toBeGreaterThan(0);
    expect(() => snapshotFor(tick.state, 'local')).not.toThrow();
  });
});

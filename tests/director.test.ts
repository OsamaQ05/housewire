import { describe, expect, it } from 'vitest';
import { compileMission } from '../src/domain/capability-compiler';
import { inferDifficulty, learnHouseholdSkill } from '../src/domain/adaptive-difficulty';
import { assessStagePressure, directorDecisionToEvent, LocalMissionDirector } from '../src/domain/director';
import { LINE_13 } from '../src/domain/line-13';
import { createInitialMissionState, reduceMission } from '../src/domain/state-machine';
import { compileInput } from './fixtures';

describe('local mission director', () => {
  it('offers bounded help after a stall without declaring completion', () => {
    expect(assessStagePressure({
      attempts: 0,
      secondsSinceProgress: 44,
      sensorAvailable: true,
    })).toMatchObject({ offerHint: true, preferManualFallback: false });
    expect(assessStagePressure({
      attempts: 1,
      secondsSinceProgress: 8,
      sensorAvailable: false,
    })).toMatchObject({ preferManualFallback: true });
  });

  it('learns a stable household prior and raises help as implicit struggle grows', () => {
    const practiced = learnHouseholdSkill([
      { durationSeconds: 310, retries: 0 },
      { durationSeconds: 360, retries: 1 },
      { durationSeconds: 330, retries: 0 },
    ]);
    const newHousehold = learnHouseholdSkill([]);
    expect(practiced).toBeGreaterThan(newHousehold);

    const calm = inferDifficulty({
      attempts: 0,
      secondsSinceProgress: 9,
      sensorAvailable: true,
    });
    const struggling = inferDifficulty({
      attempts: 3,
      secondsSinceProgress: 48,
      sensorAvailable: true,
      meanRejectedConfidence: 0.52,
    });
    expect(struggling.struggleProbability).toBeGreaterThan(calm.struggleProbability);
  });

  it('unlocks a fallback when the assigned sensor disappears', () => {
    const mission = compileMission(LINE_13, compileInput(2));
    const state = reduceMission(createInitialMissionState(mission), { type: 'SESSION_STARTED', id: 'start', at: 0 });
    const action = mission.stages[0].actions[0];
    const director = new LocalMissionDirector();
    const decisions = director.evaluate(state, {
      now: 20_000,
      actions: [{ actionId: action.id, attempts: 1, secondsSinceProgress: 20, sensorAvailable: false }],
      participation: [],
    });
    const fallback = decisions.find((decision) => decision.kind === 'UNLOCK_MANUAL_FALLBACK');
    expect(fallback).toBeDefined();
    const event = directorDecisionToEvent(fallback!, 'adapt-1', 20_000)!;
    const adapted = reduceMission(state, event);
    expect(adapted.progress[action.id].manualFallbackUnlocked).toBe(true);
  });

  it('relaxes a near-miss threshold without declaring success', () => {
    const mission = compileMission(LINE_13, compileInput(2));
    const state = reduceMission(createInitialMissionState(mission), { type: 'SESSION_STARTED', id: 'start', at: 0 });
    const action = mission.stages[0].actions[0];
    const decisions = new LocalMissionDirector().evaluate(state, {
      now: 35_000,
      actions: [{
        actionId: action.id,
        attempts: 3,
        meanRejectedConfidence: 0.64,
        secondsSinceProgress: 31,
        sensorAvailable: true,
      }],
      participation: [],
    });
    const relaxation = decisions.find((decision) => decision.kind === 'RELAX_CONFIDENCE');
    expect(relaxation).toMatchObject({ actionId: action.id });
    expect(state.progress[action.id].status).toBe('pending');
  });

  it('suggests moving agency toward an underused player', () => {
    const mission = compileMission(LINE_13, compileInput(2));
    let state = reduceMission(createInitialMissionState(mission), { type: 'SESSION_STARTED', id: 'start', at: 0 });
    const action = mission.stages[0].actions[0];
    // Put the mission in a stage with pending actions after the caller has dominated earlier play.
    state = reduceMission(state, {
      type: 'SENSOR_EVIDENCE', id: 'answer', at: 1_000, actionId: action.id,
      evidence: {
        kind: action.selectedVariant.evidenceKind,
        confidence: 1,
        participantId: action.participantId,
        deviceId: action.deviceId,
        observedAt: 1_000,
      },
    });
    const pending = mission.stages[1].actions[0];
    const dominantId = pending.participantId;
    const otherId = mission.roleAssignments.find((assignment) => assignment.playerId !== dominantId)!.playerId;
    const decisions = new LocalMissionDirector().evaluate(state, {
      now: 8_000,
      actions: mission.stages[1].actions.map((item) => ({
        actionId: item.id, attempts: 0, secondsSinceProgress: 7, sensorAvailable: true,
      })),
      participation: [
        { participantId: dominantId, acceptedActions: 4, activeSeconds: 30 },
        { participantId: otherId, acceptedActions: 1, activeSeconds: 4 },
      ],
    });
    expect(decisions).toContainEqual(expect.objectContaining({
      kind: 'REBALANCE_NEXT_ACTION',
      actionId: pending.id,
      suggestedParticipantId: otherId,
    }));
  });
});

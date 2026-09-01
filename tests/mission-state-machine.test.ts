import { describe, expect, it } from 'vitest';
import { compileMission } from '../src/domain/capability-compiler';
import { LINE_13 } from '../src/domain/line-13';
import { createInitialMissionState, reduceMission, replayMission } from '../src/domain/state-machine';
import type { CompiledAction, MissionEvent, MissionState, SensorEvidence } from '../src/domain/types';
import { compileInput } from './fixtures';

function evidenceFor(action: CompiledAction, observedAt: number): SensorEvidence {
  return {
    kind: action.selectedVariant.evidenceKind,
    confidence: 1,
    participantId: action.participantId,
    deviceId: action.deviceId,
    observedAt,
    value: action.selectedVariant.expectedValue,
  };
}

describe('mission state machine', () => {
  it('plays LINE 13 from ringing receiver through synchronized hang-up', () => {
    const mission = compileMission(LINE_13, compileInput(3));
    const events: MissionEvent[] = [{ type: 'SESSION_STARTED', id: 'start', at: 2_000 }];
    let state = replayMission(mission, events);
    let timestamp = 3_000;

    while (state.phase === 'running') {
      const stage = state.mission.stages[state.stageIndex];
      for (const action of stage.actions) {
        const event: MissionEvent = {
          type: 'SENSOR_EVIDENCE',
          id: `e-${events.length}`,
          at: timestamp,
          actionId: action.id,
          evidence: evidenceFor(action, timestamp),
        };
        events.push(event);
        state = reduceMission(state, event);
        timestamp += action.synchronizationGroup ? 300 : 1_000;
      }
    }

    expect(state.phase).toBe('completed');
    expect(state.completedAt).toBeDefined();
    expect(replayMission(mission, events)).toEqual(state);
  });

  it('is idempotent for duplicate network events', () => {
    const mission = compileMission(LINE_13, compileInput(2));
    let state = reduceMission(createInitialMissionState(mission), { type: 'SESSION_STARTED', id: 'start', at: 0 });
    const action = mission.stages[0].actions[0];
    const event: MissionEvent = {
      type: 'SENSOR_EVIDENCE',
      id: 'same-event',
      at: 1_000,
      actionId: action.id,
      evidence: evidenceFor(action, 1_000),
    };
    state = reduceMission(state, event);
    const afterFirst = state;
    state = reduceMission(state, event);
    expect(state).toEqual(afterFirst);
    expect(state.stageIndex).toBe(1);
  });

  it('rejects low-confidence lift and destination receipt evidence', () => {
    const mission = compileMission(LINE_13, compileInput(2));
    let state: MissionState = reduceMission(createInitialMissionState(mission), { type: 'SESSION_STARTED', id: 'start', at: 0 });

    const lift = mission.stages[0].actions[0];
    state = reduceMission(state, {
      type: 'SENSOR_EVIDENCE', id: 'weak-lift', at: 1_000, actionId: lift.id,
      evidence: { ...evidenceFor(lift, 1_000), confidence: 0.2 },
    });
    expect(state.stageIndex).toBe(0);
    state = reduceMission(state, {
      type: 'SENSOR_EVIDENCE', id: 'lift', at: 2_000, actionId: lift.id, evidence: evidenceFor(lift, 2_000),
    });

    for (const action of mission.stages[1].actions) {
      state = reduceMission(state, {
        type: 'SENSOR_EVIDENCE', id: `cipher-${action.id}`, at: 3_000, actionId: action.id, evidence: evidenceFor(action, 3_000),
      });
    }
    const receipt = mission.stages[2].actions.find(
      (action) => action.requirementId === 'release-destination-receipt',
    )!;
    state = reduceMission(state, {
      type: 'SENSOR_EVIDENCE', id: 'weak-receipt', at: 4_000, actionId: receipt.id,
      evidence: { ...evidenceFor(receipt, 4_000), confidence: 0.5 },
    });
    expect(state.progress[receipt.id].status).toBe('pending');
  });

  it('resets an early synchronized receiver outside the allowed window', () => {
    const mission = compileMission(LINE_13, compileInput(2));
    let state = reduceMission(createInitialMissionState(mission), { type: 'SESSION_STARTED', id: 'start', at: 0 });

    // Reach the final stage directly while retaining the real compiled action definitions.
    for (let stageIndex = 0; stageIndex < mission.stages.length - 1; stageIndex += 1) {
      for (const action of mission.stages[stageIndex].actions) {
        state = reduceMission(state, {
          type: 'SENSOR_EVIDENCE', id: `advance-${action.id}`, at: stageIndex * 10_000 + 1_000,
          actionId: action.id, evidence: evidenceFor(action, stageIndex * 10_000 + 1_000),
        });
      }
    }

    const [first, second] = mission.stages[4].actions;
    state = reduceMission(state, {
      type: 'SENSOR_EVIDENCE', id: 'hangup-1', at: 50_000, actionId: first.id, evidence: evidenceFor(first, 50_000),
    });
    state = reduceMission(state, {
      type: 'SENSOR_EVIDENCE', id: 'hangup-2-late', at: 52_500, actionId: second.id, evidence: evidenceFor(second, 52_500),
    });
    expect(state.phase).toBe('running');
    expect(state.progress[first.id].status).toBe('pending');
    expect(state.progress[second.id].status).toBe('completed');
  });
});

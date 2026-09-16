import { createContext, useContext, useEffect, useMemo, type PropsWithChildren } from 'react';

import { compileCircuitRace } from '@/src/domain/circuit-race';
import { useCircuitRaceStore } from '@/src/store/use-circuit-race-store';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useFamilyClubStore } from '@/src/store/use-family-club-store';
import { raceRecord } from '../family-club/records';

import { useCircuitRaceCoordinator } from './use-circuit-race-coordinator';
import { circuitRaceResultFromSnapshot } from './runtime-state';
import { projectCircuitRaceCoursePreview, type CircuitRaceDisplayCourse } from './course-projection';

type CircuitRaceRuntimeValue = ReturnType<typeof useCircuitRaceCoordinator> & {
  course: CircuitRaceDisplayCourse;
};

const CircuitRaceRuntimeContext = createContext<CircuitRaceRuntimeValue | null>(null);

export function CircuitRaceRuntimeProvider({ children }: PropsWithChildren) {
  const mode = useCircuitRaceStore((state) => state.launchMode);
  const seed = useCircuitRaceStore((state) => state.seed);
  const setRaceState = useCircuitRaceStore((state) => state.setRaceState);
  const recordResult = useCircuitRaceStore((state) => state.recordResult);
  const sessionCode = useHousewireStore((state) => state.sessionCode);
  const courseTemplate = useMemo(() => compileCircuitRace(seed, 'course'), [seed]);
  const coordinator = useCircuitRaceCoordinator({
    raceId: sessionCode ?? 'practice-local',
    course: courseTemplate,
    mode,
    teamIds: ['ember', 'mint'],
    countdownMs: 4_000,
    practice: {
      includeLocalTeamBots: false,
      paceMs: 24_000,
      simulatedPlayerCount: 3,
    },
  });
  const previewCourse = useMemo(() => projectCircuitRaceCoursePreview(courseTemplate), [courseTemplate]);
  const course = coordinator.snapshot?.course ?? previewCourse;

  useEffect(() => {
    if (!coordinator.authorityState) return;
    setRaceState(coordinator.authorityState);
  }, [coordinator.authorityState, setRaceState]);

  useEffect(() => {
    if (coordinator.view?.phase !== 'complete' || !coordinator.snapshot) return;
    const result = circuitRaceResultFromSnapshot(coordinator.snapshot);
    if (result) {
      useFamilyClubStore.getState().record(raceRecord(result, coordinator.snapshot.participants));
      recordResult(result);
    }
  }, [coordinator.snapshot, coordinator.view?.phase, recordResult]);

  const value = useMemo(() => ({ ...coordinator, course }), [coordinator, course]);
  return <CircuitRaceRuntimeContext.Provider value={value}>{children}</CircuitRaceRuntimeContext.Provider>;
}

export function useCircuitRaceRuntime(): CircuitRaceRuntimeValue {
  const value = useContext(CircuitRaceRuntimeContext);
  if (!value) throw new Error('useCircuitRaceRuntime must be used inside CircuitRaceRuntimeProvider.');
  return value;
}

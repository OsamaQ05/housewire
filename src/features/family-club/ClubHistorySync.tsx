import { useEffect } from 'react';
import { useHousewireStore } from '../../store/use-housewire-store';
import { useFamilyFrequencyStore } from '../../store/use-family-frequency-store';
import { useCircuitRaceStore } from '../../store/use-circuit-race-store';
import { useFamilyClubStore } from '../../store/use-family-club-store';
import { escapeRecord, oldFrequencyRecord, raceRecord } from './records';

/** Imports old receipts once, without inventing participant details absent in older saves. */
export function ClubHistorySync() {
  const escapeReady = useHousewireStore((s) => s.hydrated);
  const escapes = useHousewireStore((s) => s.results);
  const frequencyReady = useFamilyFrequencyStore((s) => s.hydrated);
  const frequency = useFamilyFrequencyStore((s) => s.history);
  const raceReady = useCircuitRaceStore((s) => s.hydrated);
  const races = useCircuitRaceStore((s) => s.history);
  const ready = useFamilyClubStore((s) => s.hydrated);
  useEffect(() => {
    if (!ready || !escapeReady || !frequencyReady || !raceReady) return;
    useFamilyClubStore.getState().recordMany([
      ...escapes.map((result) => escapeRecord(result)),
      ...frequency.map(oldFrequencyRecord),
      ...races.map((result) => raceRecord(result)),
    ]);
  }, [ready, escapeReady, frequencyReady, raceReady, escapes, frequency, races]);
  return null;
}

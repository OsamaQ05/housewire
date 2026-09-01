import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface StoredForgeRun {
  activePlayerId: string;
  caseId: string;
  completedAt: number | null;
  hintsByStage: Readonly<Record<string, number>>;
  startedAt: number;
  stageIndex: number;
}

const RUN_KEY_PREFIX = 'housewire-forge-run-v1:';

export function clearStoredForgeRun(caseId: string): Promise<void> {
  return AsyncStorage.removeItem(`${RUN_KEY_PREFIX}${caseId}`);
}

export function useForgeRun(caseId: string | null, firstPlayerId: string | null, stageCount: number) {
  const initial = useMemo<StoredForgeRun | null>(() => {
    if (!caseId || !firstPlayerId) return null;
    return {
      activePlayerId: firstPlayerId,
      caseId,
      completedAt: null,
      hintsByStage: {},
      startedAt: Date.now(),
      stageIndex: 0,
    };
  }, [caseId, firstPlayerId]);
  const [run, setRun] = useState<StoredForgeRun | null>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    if (!caseId || !firstPlayerId) {
      setRun(null);
      setHydrated(true);
      return () => {
        cancelled = true;
      };
    }

    void AsyncStorage.getItem(`${RUN_KEY_PREFIX}${caseId}`)
      .then((serialized) => {
        if (cancelled) return;
        if (!serialized) {
          setRun(initial);
          return;
        }
        const parsed: unknown = JSON.parse(serialized);
        if (!isStoredForgeRun(parsed, caseId, stageCount)) {
          setRun(initial);
          return;
        }
        setRun(parsed);
      })
      .catch(() => {
        if (!cancelled) setRun(initial);
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [caseId, firstPlayerId, initial, stageCount]);

  useEffect(() => {
    if (!hydrated || !run) return;
    void AsyncStorage.setItem(`${RUN_KEY_PREFIX}${run.caseId}`, JSON.stringify(run)).catch(() => undefined);
  }, [hydrated, run]);

  const setActivePlayerId = useCallback((activePlayerId: string) => {
    setRun((value) => value ? { ...value, activePlayerId } : value);
  }, []);

  const revealHint = useCallback((stageId: string, maximum: number) => {
    setRun((value) => {
      if (!value) return value;
      const next = Math.min(maximum, (value.hintsByStage[stageId] ?? 0) + 1);
      return { ...value, hintsByStage: { ...value.hintsByStage, [stageId]: next } };
    });
  }, []);

  const advance = useCallback(() => {
    setRun((value) => {
      if (!value) return value;
      const nextStage = Math.min(stageCount, value.stageIndex + 1);
      return {
        ...value,
        completedAt: nextStage >= stageCount ? Date.now() : null,
        stageIndex: nextStage,
      };
    });
  }, [stageCount]);

  const restart = useCallback(() => {
    if (!caseId || !firstPlayerId) return;
    setRun({
      activePlayerId: firstPlayerId,
      caseId,
      completedAt: null,
      hintsByStage: {},
      startedAt: Date.now(),
      stageIndex: 0,
    });
  }, [caseId, firstPlayerId]);

  return { advance, hydrated, restart, revealHint, run, setActivePlayerId };
}

function isStoredForgeRun(value: unknown, caseId: string, stageCount: number): value is StoredForgeRun {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredForgeRun>;
  return (
    candidate.caseId === caseId &&
    typeof candidate.activePlayerId === 'string' &&
    typeof candidate.startedAt === 'number' &&
    Number.isSafeInteger(candidate.startedAt) &&
    candidate.startedAt > 0 &&
    typeof candidate.stageIndex === 'number' &&
    Number.isInteger(candidate.stageIndex) &&
    candidate.stageIndex >= 0 &&
    candidate.stageIndex <= stageCount &&
    (candidate.completedAt === null || (typeof candidate.completedAt === 'number' && Number.isSafeInteger(candidate.completedAt))) &&
    Boolean(candidate.hintsByStage) &&
    typeof candidate.hintsByStage === 'object'
  );
}

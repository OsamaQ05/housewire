import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createForgeRun, parseStoredForgeRun, reduceForgeRunSubmission, type ForgeCase, type ForgeStageSubmission, type StoredForgeRun, type ForgeSubmissionResult } from '../../domain/case-forge';

const RUN_KEY_PREFIX = 'housewire-forge-run-v1:';

export function clearStoredForgeRun(caseId: string): Promise<void> {
  return AsyncStorage.removeItem(`${RUN_KEY_PREFIX}${caseId}`);
}

export function useForgeRun(caseId: string | null, firstPlayerId: string | null, stageCount: number) {
  const initial = useMemo<StoredForgeRun | null>(() => {
    if (!caseId || !firstPlayerId) return null;
    return createForgeRun(caseId, firstPlayerId, Date.now());
  }, [caseId, firstPlayerId]);
  const [run, setRun] = useState<StoredForgeRun | null>(initial);
  const [hydrated, setHydrated] = useState(false);
  const runRef = useRef(run);
  const writesRef = useRef(Promise.resolve());
  const commit = useCallback((next: StoredForgeRun | null, persist = true) => {
    runRef.current = next;
    setRun(next);
    if (next && persist) {
      const serialized = JSON.stringify(next);
      writesRef.current = writesRef.current.then(() => AsyncStorage.setItem(`${RUN_KEY_PREFIX}${next.caseId}`, serialized)).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    commit(null, false);
    if (!caseId || !firstPlayerId) {
      setHydrated(true);
      return () => {
        cancelled = true;
      };
    }

    void writesRef.current.then(() => AsyncStorage.getItem(`${RUN_KEY_PREFIX}${caseId}`))
      .then((serialized) => {
        if (cancelled) return;
        if (!serialized) {
          commit(initial);
          return;
        }
        const parsed: unknown = JSON.parse(serialized);
        commit(parseStoredForgeRun(parsed, caseId, stageCount) ?? initial);
      })
      .catch(() => {
        if (!cancelled) commit(initial);
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [caseId, firstPlayerId, initial, stageCount, commit]);

  const setActivePlayerId = useCallback((activePlayerId: string) => {
    if (runRef.current) commit({ ...runRef.current, activePlayerId });
  }, [commit]);

  const revealHint = useCallback((stageId: string, maximum: number) => {
    const value = runRef.current;
    if (!value || value.failedAt !== null || value.completedAt !== null) return;
    const next = Math.min(maximum, (value.hintsByStage[stageId] ?? 0) + 1);
    commit({ ...value, hintsByStage: { ...value.hintsByStage, [stageId]: next } });
  }, [commit]);

  const submit = useCallback((game: ForgeCase, submission: ForgeStageSubmission): ForgeSubmissionResult => {
    const value = runRef.current;
    if (!hydrated || !value) return { accepted: false, code: 'INVALID_STAGE' };
    const reduced = reduceForgeRunSubmission(value, game, submission, Date.now());
    if (reduced.run !== value) commit(reduced.run);
    return reduced.result;
  }, [commit, hydrated]);

  const restart = useCallback(() => {
    if (!caseId || !firstPlayerId) return;
    commit(createForgeRun(caseId, firstPlayerId, Date.now()));
  }, [caseId, firstPlayerId, commit]);

  return { submit, hydrated, restart, revealHint, run, setActivePlayerId };
}

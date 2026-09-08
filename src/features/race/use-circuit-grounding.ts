import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  CircuitFlatFace,
  CircuitFlatPhoneSample,
  CircuitMotionMove,
} from '@/src/domain/circuit-race';
import { ExpoSensorProvider } from '@/src/services/sensors';

export interface CircuitGroundingChallenge {
  holdMs: number;
  maxTiltDegrees: number;
  minimumSamples: number;
  moveCount: 3;
  requiredFace: CircuitFlatFace | null;
  tiltSequence: readonly CircuitMotionMove[] | null;
}

export interface CircuitGroundingSnapshot {
  active: boolean;
  available: boolean | null;
  denied: boolean;
  faceCorrect: boolean;
  level: number;
  moveIndex: number;
  lastMove?: CircuitMotionMove;
  progress: number;
  start(): Promise<boolean>;
  stop(): Promise<void>;
}

export function useCircuitGrounding(
  challenge: CircuitGroundingChallenge,
  onGrounded: (samples: readonly CircuitFlatPhoneSample[]) => void,
): CircuitGroundingSnapshot {
  const providerRef = useRef<ExpoSensorProvider | undefined>(undefined);
  if (!providerRef.current) providerRef.current = new ExpoSensorProvider({ updateIntervalMs: 50 });
  const samplesRef = useRef<CircuitFlatPhoneSample[]>([]);
  const stableSinceRef = useRef<number | undefined>(undefined);
  const moveIndexRef = useRef(0);
  const waitingForCenterRef = useRef(false);
  const completedRef = useRef(false);
  const mountedRef = useRef(true);
  const startGenerationRef = useRef(0);
  const startingRef = useRef(false);
  const callbackRef = useRef(onGrounded);
  callbackRef.current = onGrounded;
  const [active, setActive] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [denied, setDenied] = useState(false);
  const [faceCorrect, setFaceCorrect] = useState(false);
  const [level, setLevel] = useState(0);
  const [moveIndex, setMoveIndex] = useState(0);
  const [lastMove, setLastMove] = useState<CircuitMotionMove>();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let disposed = false;
    const provider = providerRef.current!;
    void provider.probe().then((result) => {
      if (!disposed) setAvailable(result.capabilities.includes('motion'));
    });
    const unsubscribe = provider.subscribe((event) => {
      if (event.stream !== 'motion' || completedRef.current) return;
      const raw = event.sample;
      const magnitude = Math.max(0.001, Math.hypot(raw.x, raw.y, raw.z));
      const gravityZ = raw.z / magnitude;
      // Gravity-derived tilt works the same with the screen facing up or down.
      // Absolute beta/gamma orientation makes a face-down landing look 180°
      // tilted on several devices, which used to make that valid route fail.
      const pitchDegrees = Math.atan2(raw.x, Math.hypot(raw.y, raw.z)) * (180 / Math.PI);
      const rollDegrees = Math.atan2(raw.y, Math.hypot(raw.x, raw.z)) * (180 / Math.PI);
      const levelValue = Math.max(0, Math.min(1, 1 - Math.max(Math.abs(pitchDegrees), Math.abs(rollDegrees)) / 35));
      const expectedFace = challenge.requiredFace === null || (challenge.requiredFace === 'FACE_UP' ? gravityZ >= 0.72 : gravityZ <= -0.72);
      const flat = Math.abs(pitchDegrees) <= challenge.maxTiltDegrees && Math.abs(rollDegrees) <= challenge.maxTiltDegrees;
      const centered = Math.abs(pitchDegrees) <= 9 && Math.abs(rollDegrees) <= 9;
      const sample: CircuitFlatPhoneSample = { at: Math.round(raw.timestampMs), gravityZ, pitchDegrees, rollDegrees };
      samplesRef.current.push(sample);
      if (samplesRef.current.length > 260) samplesRef.current.shift();
      setLevel(levelValue);

      if (moveIndexRef.current < challenge.moveCount || waitingForCenterRef.current) {
        stableSinceRef.current = undefined;
        setProgress(0);
        setFaceCorrect(false);
        if (waitingForCenterRef.current) {
          if (centered) {
            waitingForCenterRef.current = false;
            setLastMove(undefined);
          }
          return;
        }
        const move = classifyMove(pitchDegrees, rollDegrees);
        if (!move) return;
        const expectedMove = challenge.tiltSequence?.[moveIndexRef.current];
        if (!expectedMove || move === expectedMove) {
          moveIndexRef.current += 1;
          setMoveIndex(moveIndexRef.current);
          setLastMove(move);
          waitingForCenterRef.current = true;
          return;
        }
        moveIndexRef.current = move === challenge.tiltSequence?.[0] ? 1 : 0;
        setMoveIndex(moveIndexRef.current);
        setLastMove(moveIndexRef.current ? move : undefined);
        waitingForCenterRef.current = moveIndexRef.current > 0;
        return;
      }

      setFaceCorrect(flat && expectedFace);
      if (!flat || !expectedFace) {
        stableSinceRef.current = undefined;
        setProgress(0);
        return;
      }
      if (stableSinceRef.current === undefined) stableSinceRef.current = sample.at;
      const heldMs = sample.at - stableSinceRef.current;
      setProgress(Math.min(1, heldMs / challenge.holdMs));
      if (heldMs >= challenge.holdMs && samplesRef.current.length >= challenge.minimumSamples) {
        completedRef.current = true;
        callbackRef.current([...samplesRef.current]);
        void provider.stop().finally(() => setActive(false));
      }
    });
    return () => {
      disposed = true;
      startGenerationRef.current += 1;
      unsubscribe();
      void provider.stop();
    };
  }, [challenge.holdMs, challenge.maxTiltDegrees, challenge.minimumSamples, challenge.moveCount, challenge.requiredFace, challenge.tiltSequence]);

  useEffect(() => {
    startGenerationRef.current += 1;
    void providerRef.current?.stop();
    completedRef.current = false;
    samplesRef.current = [];
    stableSinceRef.current = undefined;
    moveIndexRef.current = 0;
    waitingForCenterRef.current = false;
    setActive(false);
    setDenied(false);
    setFaceCorrect(false);
    setLevel(0);
    setMoveIndex(0);
    setLastMove(undefined);
    setProgress(0);
  }, [challenge.holdMs, challenge.maxTiltDegrees, challenge.minimumSamples, challenge.moveCount, challenge.requiredFace, challenge.tiltSequence]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startGenerationRef.current += 1;
      void providerRef.current?.stop();
    };
  }, []);

  const start = useCallback(async () => {
    if (startingRef.current) return false;
    startingRef.current = true;
    const generation = ++startGenerationRef.current;
    completedRef.current = false;
    samplesRef.current = [];
    stableSinceRef.current = undefined;
    moveIndexRef.current = 0;
    waitingForCenterRef.current = false;
    setFaceCorrect(false);
    setLevel(0);
    setMoveIndex(0);
    setLastMove(undefined);
    setProgress(0);
    try {
      await providerRef.current?.start(['motion']);
      if (!mountedRef.current || generation !== startGenerationRef.current) {
        await providerRef.current?.stop();
        return false;
      }
      setActive(true);
      setDenied(false);
      return true;
    } catch {
      if (mountedRef.current && generation === startGenerationRef.current) {
        setActive(false);
        setDenied(true);
      }
      return false;
    } finally {
      startingRef.current = false;
    }
  }, []);

  const stop = useCallback(async () => {
    startGenerationRef.current += 1;
    await providerRef.current?.stop();
    if (mountedRef.current) setActive(false);
  }, []);

  return { active, available, denied, faceCorrect, lastMove, level, moveIndex, progress, start, stop };
}

function classifyMove(pitchDegrees: number, rollDegrees: number): CircuitMotionMove | undefined {
  if (Math.max(Math.abs(pitchDegrees), Math.abs(rollDegrees)) < 18) return undefined;
  if (Math.abs(rollDegrees) >= Math.abs(pitchDegrees)) {
    return rollDegrees < 0 ? 'TILT_LEFT' : 'TILT_RIGHT';
  }
  return pitchDegrees < 0 ? 'TIP_FORWARD' : 'TIP_BACK';
}

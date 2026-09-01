import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ImageBackground,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  interpolate,
  SlideInRight,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-svg';

import { GlyphMark, ScreenShell } from '@/src/components';
import {
  generateLine13Game,
  isCorrectCircuit,
  LINE_13_GLYPHS,
  line13RouteProof,
  line13SeedFromCode,
  type LensMarker,
  type Line13Glyph,
  type Line13Game,
  type RouteScrap,
} from '@/src/domain/line-13-game';
import { assessStagePressure } from '@/src/domain/director';
import type { EvidenceKind } from '@/src/domain/types';
import { useSharedMissionCoordinator } from '@/src/features/session';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useTerminalMotion, type TerminalMotionSnapshot } from '@/src/hooks/use-terminal-motion';
import { useHousewireStore, type CrewNode } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';
import { formatClock } from '@/src/utils/format';
import { EscapeCaseMission } from '@/src/features/cases/EscapeCaseMission';

type StageKind = 'answer' | 'cipher' | 'lens' | 'route' | 'finale';

interface StageDefinition {
  id: string;
  kind: StageKind;
  title: string;
  objective: string;
  hints: readonly [string, string, string];
}

interface CompletionEvidence {
  confidence: number;
  kind: EvidenceKind;
  observedAt?: number;
}

const STAGES: readonly StageDefinition[] = [
  {
    id: 'incoming-call',
    kind: 'answer',
    title: 'Answer',
    objective: 'Lift the ringing phone.',
    hints: ['Only one phone is ringing.', 'Lift it once, then hold steady.', 'No motion? Hold the red receiver.'],
  },
  {
    id: 'split-cipher',
    kind: 'cipher',
    title: 'Decode',
    objective: 'Share clues. Enter four digits.',
    hints: ['Each knock count is a position.', 'Say: position, symbol, then digit.', 'Order the decoded digits from one to four.'],
  },
  {
    id: 'courier-transfer',
    kind: 'lens',
    title: 'Lens run',
    objective: 'Carry steadily. Find each seal.',
    hints: ['Other phones hold the decoded symbols.', 'Follow the four-glyph order you recovered.', 'The final seal is in the destination room.'],
  },
  {
    id: 'route-reconstruction',
    kind: 'route',
    title: 'Close the loop',
    objective: 'Speak tiles. Rebuild the circuit.',
    hints: ['Start with the tile marked Source.', 'Match each exit to the next entrance.', 'The final exit reconnects to the Source.'],
  },
  {
    id: 'synchronized-hangup',
    kind: 'finale',
    title: 'Hang up',
    objective: 'Count down. Place phones flat.',
    hints: ['Everyone acts on the same countdown.', 'Screens face up on a flat surface.', 'All phones must close within 1.6 seconds.'],
  },
] as const;

const MISSION_SECONDS = 13 * 60;
const HOUSE_ART = require('@/assets/art/line13-house-v2.png');
const FLOORPLAN_ART = require('@/assets/art/line13-floorplan-v2.png');

export default function MissionScreen() {
  const selectedMission = useHousewireStore((state) => state.selectedMission);
  const missionInProgressId = useHousewireStore((state) => state.missionInProgressId);
  const activeMission = missionInProgressId ?? selectedMission;
  if (activeMission === 'dead-air' || activeMission === 'night-glass') {
    return <EscapeCaseMission missionId={activeMission} />;
  }
  return <Line13MissionScreen />;
}

function Line13MissionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ cut?: string }>();
  const { height } = useWindowDimensions();
  const { theme } = useHousewireTheme();
  const { play, playKnocks } = useHousewireSound();
  const sessionMode = useHousewireStore((state) => state.sessionMode);
  const sessionCode = useHousewireStore((state) => state.sessionCode);
  const localNodeId = useHousewireStore((state) => state.localNodeId);
  const crew = useHousewireStore((state) => state.crew);
  const calibration = useHousewireStore((state) => state.calibration);
  const settings = useHousewireStore((state) => state.settings);
  const previousRuns = useHousewireStore((state) => state.results);
  const missionStartedAt = useHousewireStore((state) => state.missionStartedAt);
  const persistedStageIndex = useHousewireStore((state) => state.missionStageIndex);
  const persistedRetries = useHousewireStore((state) => state.missionRetries);
  const updateMissionProgress = useHousewireStore((state) => state.updateMissionProgress);
  const completeMission = useHousewireStore((state) => state.completeMission);
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const setLocalNodeId = useHousewireStore((state) => state.setLocalNodeId);
  const shared = useSharedMissionCoordinator();
  const sharedActive = sessionMode === 'lan';
  const judgeCut = params.cut === '1' && !sharedActive;
  const initialStartedAtRef = useRef(missionStartedAt ?? Date.now());
  const previewDeadlineRef = useRef(initialStartedAtRef.current + MISSION_SECONDS * 1_000);
  const pauseStartedAtRef = useRef<number | undefined>(undefined);

  const nodeIds = useMemo(() => {
    if (sharedActive && shared.liveNodeIds.length >= 2) {
      return [...shared.liveNodeIds].sort((left, right) => left.localeCompare(right));
    }
    const connected = crew.filter((node) => node.connected).slice(0, 4).map((node) => node.id);
    return connected.length >= 2 ? connected : [connected[0] ?? localNodeId, 'sim-backup'];
  }, [crew, localNodeId, shared.liveNodeIds, sharedActive]);

  const game = useMemo(
    () => generateLine13Game(
      sharedActive && shared.seed !== undefined ? shared.seed : line13SeedFromCode(sessionCode ?? 'LINE13'),
      nodeIds,
      shared.startedAt ?? initialStartedAtRef.current,
      sharedActive ? undefined : localNodeId,
    ),
    [localNodeId, nodeIds, sessionCode, shared.seed, shared.startedAt, sharedActive],
  );

  const [stageIndex, setStageIndex] = useState(
    sharedActive ? 0 : judgeCut ? 1 : Math.max(0, Math.min(STAGES.length - 1, persistedStageIndex)),
  );
  const [secondsLeft, setSecondsLeft] = useState(MISSION_SECONDS);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [retries, setRetries] = useState(sharedActive ? 0 : persistedRetries);
  const [stageRetries, setStageRetries] = useState(0);
  const [directorTick, setDirectorTick] = useState(Date.now());
  const [submittedStageIndex, setSubmittedStageIndex] = useState<number | null>(null);
  const [recoveryTimedOut, setRecoveryTimedOut] = useState(false);
  const completedRef = useRef(false);
  const leavingRef = useRef(false);
  const eventLogRef = useRef<string[]>([]);
  const stageEnteredAtRef = useRef(Date.now());
  const autoHintedStageRef = useRef<string | undefined>(undefined);
  const pressureRef = useRef(0);
  const finaleWindowRef = useRef(false);
  const startedAtRef = useRef(missionStartedAt ?? Date.now());
  const stage = STAGES[stageIndex];

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void activateKeepAwakeAsync('line-13-mission').catch(() => undefined);
    return () => void deactivateKeepAwake('line-13-mission');
  }, []);

  useEffect(() => {
    if (!sharedActive && missionStartedAt) updateMissionProgress(stageIndex, retries);
  }, [missionStartedAt, retries, sharedActive, stageIndex, updateMissionProgress]);

  const appendEvent = useCallback((event: string) => {
    eventLogRef.current = [...eventLogRef.current, event];
  }, []);
  const setFinaleWindow = useCallback((open: boolean) => {
    finaleWindowRef.current = open;
  }, []);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    play('complete', 0.82);
    if (settings.haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    completeMission({
      completedAt: new Date().toISOString(),
      durationSeconds: Math.max(1, Math.round(((sharedActive ? Date.now() + shared.clockOffsetMs : Date.now()) - startedAtRef.current) / 1_000)),
      events: [...eventLogRef.current, 'The call from thirteen minutes ahead was closed.'],
      missionId: 'line-13',
      retries,
      routeSeed: game.seed,
    });
    router.replace('/debrief');
  }, [completeMission, game.seed, play, retries, router, settings.haptics, shared.clockOffsetMs, sharedActive]);

  useEffect(() => {
    if (!sharedActive || shared.startedAt === undefined) return;
    startedAtRef.current = shared.startedAt;
    if (shared.stageIndex === stageIndex) return;
    stageEnteredAtRef.current = Date.now();
    autoHintedStageRef.current = undefined;
    setStageRetries(0);
    setHintLevel(0);
    setSubmittedStageIndex(null);
    setStageIndex(shared.stageIndex);
    appendEvent(`Phase ${shared.stageIndex + 1} opened.`);
    play('relay', 0.48);
  }, [appendEvent, play, shared.stageIndex, shared.startedAt, sharedActive, stageIndex]);

  useEffect(() => {
    if (sharedActive && shared.finishedAt !== undefined) finish();
  }, [finish, shared.finishedAt, sharedActive]);

  useEffect(() => {
    if (!sharedActive || shared.startedAt !== undefined) {
      setRecoveryTimedOut(false);
      return;
    }
    const timeout = setTimeout(() => setRecoveryTimedOut(true), 8_000);
    return () => clearTimeout(timeout);
  }, [shared.startedAt, sharedActive]);

  useEffect(() => {
    if (!sharedActive || submittedStageIndex !== stageIndex || shared.completedNodeIds.includes(localNodeId)) return;
    const handoffExpired = stage.kind === 'lens' && localNodeId === game.courierNodeId && shared.handoffExpired;
    const timeout = setTimeout(() => {
      setSubmittedStageIndex((current) => current === stageIndex ? null : current);
      setRetries((current) => current + 1);
      setStageRetries((current) => current + 1);
      appendEvent(handoffExpired ? 'The courier handoff expired; its lens reopened.' : 'No authority receipt returned; local proof reopened.');
    }, handoffExpired ? 0 : 5_000);
    return () => clearTimeout(timeout);
  }, [appendEvent, game.courierNodeId, localNodeId, shared.completedNodeIds, shared.handoffExpired, sharedActive, stage.kind, stageIndex, submittedStageIndex]);

  const publishSharedCompletion = useCallback(async (evidence?: CompletionEvidence) => {
    const fallback = { evidenceKind: 'MANUAL_HOLD' as const, confidence: 1 };
    const observedAt = evidence?.observedAt === undefined ? undefined : evidence.observedAt + shared.clockOffsetMs;
    if (stageIndex === 0) {
      return shared.submitLocalCompletion(evidence?.kind === 'LIFTED'
        ? { evidenceKind: 'LIFTED', confidence: evidence.confidence, observedAt }
        : fallback);
    }
    if (stageIndex === 1) {
      return shared.submitLocalCompletion({ actionId: 'lock-full-warning', evidenceKind: 'WARNING_RECONSTRUCTED', confidence: 1, value: game.pin });
    }
    if (stageIndex === 2) {
      if (shared.localNodeId === game.destinationNodeId) {
        return shared.submitLocalCompletion({ actionId: 'release-destination-receipt', evidenceKind: 'RECEIPT_RELEASED', confidence: 1, value: game.transferCode });
      }
      if (shared.localNodeId !== game.courierNodeId) return false;
      return shared.submitLocalCompletion(evidence?.kind === 'CARRY_STEADY'
        ? { actionId: 'carry-warning', evidenceKind: 'CARRY_STEADY', confidence: evidence.confidence, observedAt }
        : { actionId: 'carry-warning', ...fallback });
    }
    if (stageIndex === 3) {
      return shared.submitLocalCompletion({ evidenceKind: 'ROUTE_RECONSTRUCTED', confidence: 1, value: line13RouteProof(game) });
    }
    return shared.submitLocalCompletion(evidence?.kind === 'PLACED_FLAT'
      ? { evidenceKind: 'PLACED_FLAT', confidence: evidence.confidence, observedAt }
      : fallback);
  }, [game, shared, stageIndex]);

  const advanceStage = useCallback((event: string, evidence?: CompletionEvidence, force = false) => {
    if (completedRef.current || (!force && (paused || failed)) || Date.now() - stageEnteredAtRef.current < 320) return;
    if (sharedActive) {
      if (submittedStageIndex === stageIndex || !shared.requiredNodeIds.includes(shared.localNodeId)) return;
      setSubmittedStageIndex(stageIndex);
      appendEvent(event);
      play('accept', 0.66);
      void publishSharedCompletion(evidence).then((accepted) => {
        if (accepted) return;
        setSubmittedStageIndex((current) => current === stageIndex ? null : current);
        setRetries((current) => current + 1);
        setStageRetries((current) => current + 1);
      });
      return;
    }
    appendEvent(event);
    play('accept', 0.66);
    if (settings.haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    if (stageIndex === STAGES.length - 1) {
      finish();
      return;
    }
    stageEnteredAtRef.current = Date.now();
    autoHintedStageRef.current = undefined;
    setHintLevel(0);
    setStageRetries(0);
    setStageIndex((current) => current + 1);
  }, [appendEvent, failed, finish, paused, play, publishSharedCompletion, settings.haptics, shared.localNodeId, shared.requiredNodeIds, sharedActive, stageIndex, submittedStageIndex]);

  const registerFault = useCallback((event: string) => {
    appendEvent(event);
    setRetries((current) => current + 1);
    setStageRetries((current) => current + 1);
    play('warning', 0.5);
    if (settings.haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  }, [appendEvent, play, settings.haptics]);

  const handleEvidence = useCallback((evidence: { kind: string; confidence: number; observedAt: number }) => {
    if (paused || failed || evidence.observedAt < stageEnteredAtRef.current) return;
    const adaptiveThreshold = sharedActive ? 0.72 : Math.max(0.64, 0.72 - pressureRef.current * 0.08);
    if (stage.kind === 'answer' && evidence.kind === 'LIFTED' && evidence.confidence >= adaptiveThreshold) {
      advanceStage('The ringing receiver was lifted.', { confidence: evidence.confidence, kind: 'LIFTED', observedAt: evidence.observedAt });
    }
    if (stage.kind === 'finale' && finaleWindowRef.current && evidence.kind === 'PLACED_FLAT' && evidence.confidence >= adaptiveThreshold + 0.02) {
      advanceStage('The local receiver closed flat.', { confidence: evidence.confidence, kind: 'PLACED_FLAT', observedAt: evidence.observedAt });
    }
  }, [advanceStage, failed, paused, sharedActive, stage.kind]);

  const expectedEvidence = useMemo<readonly EvidenceKind[]>(() => {
    if (stage.kind === 'answer') return ['LIFTED'];
    if (stage.kind === 'lens' && localNodeId === game.courierNodeId) return ['CARRY_STEADY'];
    if (stage.kind === 'finale') return ['PLACED_FLAT'];
    return [];
  }, [game.courierNodeId, localNodeId, stage.kind]);
  const motion = useTerminalMotion(handleEvidence, expectedEvidence);
  const startMotion = motion.start;

  useEffect(() => {
    if (
      calibration.motion &&
      !calibration.fallbackMode &&
      expectedEvidence.length > 0 &&
      motion.available !== false &&
      !motion.denied &&
      !motion.active
    ) void startMotion();
  }, [calibration.fallbackMode, calibration.motion, expectedEvidence.length, motion.active, motion.available, motion.denied, startMotion]);

  useEffect(() => {
    const interval = setInterval(() => setDirectorTick(Date.now()), 2_000);
    return () => clearInterval(interval);
  }, []);

  const pressure = useMemo(() => assessStagePressure({
    attempts: stageRetries,
    history: previousRuns
      .filter((result) => result.missionId === 'line-13')
      .map((result) => ({ durationSeconds: result.durationSeconds, retries: result.retries })),
    secondsSinceProgress: Math.max(0, (directorTick - stageEnteredAtRef.current) / 1_000),
    sensorAvailable: !calibration.fallbackMode && motion.available !== false,
    stageIndex,
  }), [calibration.fallbackMode, directorTick, motion.available, previousRuns, stageIndex, stageRetries]);

  useEffect(() => {
    pressureRef.current = pressure.pressure;
  }, [pressure.pressure]);

  useEffect(() => {
    if (!pressure.offerHint || autoHintedStageRef.current === stage.id) return;
    autoHintedStageRef.current = stage.id;
    setHintLevel((current) => Math.max(1, current));
    appendEvent('The local adaptive director opened hint one.');
  }, [appendEvent, pressure.offerHint, stage.id]);

  useEffect(() => {
    if (failed || completedRef.current || (sharedActive && !shared.startedAt)) return;
    if (!sharedActive && paused) return;
    const tick = () => {
      const remaining = sharedActive && shared.startedAt !== undefined
        ? Math.max(0, MISSION_SECONDS - Math.floor((Date.now() + shared.clockOffsetMs - shared.startedAt) / 1_000))
        : Math.max(0, Math.ceil((previewDeadlineRef.current - Date.now()) / 1_000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        setFailed(true);
        play('warning', 0.72);
      }
    };
    tick();
    const interval = setInterval(tick, 1_000);
    return () => clearInterval(interval);
  }, [failed, paused, play, shared.clockOffsetMs, shared.startedAt, sharedActive]);

  const setPauseState = (next: boolean) => {
    if (!sharedActive) {
      if (next) pauseStartedAtRef.current = Date.now();
      else if (pauseStartedAtRef.current !== undefined) {
        previewDeadlineRef.current += Date.now() - pauseStartedAtRef.current;
        pauseStartedAtRef.current = undefined;
      }
    }
    setPaused(next);
  };

  const leaveOperation = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLocalNodeId('local');
    prepareSession('preview');
    router.replace('/home');
  }, [prepareSession, router, setLocalNodeId]);

  const endOperation = useCallback(() => {
    if (!sharedActive) {
      leaveOperation();
      return;
    }
    void shared.abortOperation().finally(leaveOperation);
  }, [leaveOperation, shared, sharedActive]);

  useEffect(() => {
    if (sharedActive && shared.abortedAt !== undefined) leaveOperation();
  }, [leaveOperation, shared.abortedAt, sharedActive]);

  const recoverTime = () => {
    previewDeadlineRef.current += 60_000;
    setFailed(false);
    setRetries((current) => current + 1);
  };

  const sharedRequired = !sharedActive || shared.requiredNodeIds.includes(shared.localNodeId);
  const sharedLocalComplete = shared.completedNodeIds.includes(shared.localNodeId);
  const awaitingAuthority = sharedActive && (!shared.startedAt || !sharedRequired || sharedLocalComplete || submittedStageIndex === stageIndex);
  const compact = height < 730;

  return (
    <ScreenShell padded={false} texture={false}>
      <View style={[styles.screen, compact && styles.screenCompact]}>
        <MissionHeader compact={compact} failed={failed} onPause={() => setPauseState(true)} preview={!sharedActive} secondsLeft={secondsLeft} stageIndex={stageIndex} />
        <Animated.View entering={settings.reducedMotion ? undefined : SlideInRight.duration(340)} key={`${stage.id}-${awaitingAuthority ? 'waiting' : 'active'}`} style={styles.scene}>
          <View style={[styles.sceneTitleRow, compact && styles.sceneTitleRowCompact]}>
            <View>
              <Text style={[styles.stageTitle, compact && styles.stageTitleCompact, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{stage.title}</Text>
              <Text style={[styles.objective, compact && styles.objectiveCompact, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{stage.objective}</Text>
            </View>
            {judgeCut ? <Seal label="SIMULATION" tone="warning" /> : null}
          </View>
          <View style={styles.clueCanvas}>
            {sharedActive && shared.membershipError ? (
              <MissingScene onEnd={endOperation} />
            ) : awaitingAuthority ? (
              <WaitingScene completedNodeIds={shared.completedNodeIds} crew={crew} game={game} localNodeId={localNodeId} onAbandon={recoveryTimedOut ? endOperation : undefined} playKnocks={playKnocks} requiredNodeIds={shared.requiredNodeIds} stage={stage} />
            ) : (
              <ActiveScene advanceStage={advanceStage} allowManualFallback={pressure.preferManualFallback || calibration.fallbackMode || motion.available === false || motion.denied} clockOffsetMs={shared.clockOffsetMs} compact={compact} completedNodeIds={shared.completedNodeIds} crew={crew} game={game} handoffCourierReady={shared.handoffCourierReady} handoffRemainingMs={shared.handoffRemainingMs} localNodeId={localNodeId} motion={motion} onFault={registerFault} onFinaleWindowChange={setFinaleWindow} play={play} playKnocks={playKnocks} preview={!sharedActive} sharedActive={sharedActive} stage={stage} stageStartedAt={shared.stageStartedAt} />
            )}
          </View>
        </Animated.View>
        <MissionDock compact={compact} completedNodeIds={shared.completedNodeIds} crew={crew} hintLevel={hintLevel} localNodeId={localNodeId} onHint={() => {
          setHintLevel((current) => current >= 3 ? 0 : current + 1);
          if (hintLevel === 0) appendEvent(`A hint opened during ${stage.id}.`);
        }} sharedActive={sharedActive} />
        {hintLevel > 0 ? <HintSheet level={hintLevel} onClose={() => setHintLevel(0)} onNext={() => setHintLevel((current) => Math.min(3, current + 1))} text={stage.hints[hintLevel - 1]} /> : null}
        {paused || failed ? <InterruptionSheet failed={failed} live={sharedActive} onBypass={() => {
          setPauseState(false);
          setFailed(false);
          registerFault(`Accessible bypass used on ${stage.id}.`);
          advanceStage('The phase closed through its fallback.', undefined, true);
        }} onEnd={endOperation} onRecover={recoverTime} onResume={() => setPauseState(false)} /> : null}
      </View>
    </ScreenShell>
  );
}

function MissionHeader({ compact, failed, onPause, preview, secondsLeft, stageIndex }: {
  compact: boolean;
  failed: boolean;
  onPause: () => void;
  preview: boolean;
  secondsLeft: number;
  stageIndex: number;
}) {
  const { theme } = useHousewireTheme();
  return (
    <View style={[styles.header, compact && styles.headerCompact]}>
      <View style={styles.brandLockup}>
        <View style={[styles.brandSlash, { backgroundColor: theme.colors.wire }]} />
        <View>
          <Text style={[styles.brand, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>LINE 13</Text>
          <Text style={[styles.mode, { color: theme.colors.muted, fontFamily: theme.typography.families.mono }]}>{preview ? 'solo rehearsal' : 'live house'}</Text>
        </View>
      </View>
      <View accessibilityLabel={`Phase ${stageIndex + 1} of ${STAGES.length}`} style={styles.phaseWire}>
        {STAGES.map((item, index) => (
          <View key={item.id} style={styles.phasePiece}>
            {index > 0 ? <View style={[styles.phaseLine, { backgroundColor: index <= stageIndex ? theme.colors.wire : theme.colors.draft }]} /> : null}
            <View style={[styles.phaseDot, { borderColor: index <= stageIndex ? theme.colors.wire : theme.colors.draft, backgroundColor: index < stageIndex ? theme.colors.wire : theme.colors.background }]} />
          </View>
        ))}
      </View>
      <View style={styles.timeBlock}>
        <Text accessibilityLabel={`${secondsLeft} seconds remaining`} style={[styles.clock, { color: failed || secondsLeft < 45 ? theme.colors.fault : theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{formatClock(secondsLeft)}</Text>
        <Pressable accessibilityLabel="Pause game" accessibilityRole="button" hitSlop={12} onPress={onPause}>
          <Ionicons color={theme.colors.muted} name="pause" size={22} />
        </Pressable>
      </View>
    </View>
  );
}

function ActiveScene({ advanceStage, allowManualFallback, clockOffsetMs, compact, completedNodeIds, crew, game, handoffCourierReady, handoffRemainingMs, localNodeId, motion, onFault, onFinaleWindowChange, play, playKnocks, preview, sharedActive, stage, stageStartedAt }: {
  advanceStage: (event: string, evidence?: CompletionEvidence) => void;
  allowManualFallback: boolean;
  clockOffsetMs: number;
  compact: boolean;
  completedNodeIds: readonly string[];
  crew: CrewNode[];
  game: Line13Game;
  handoffCourierReady: boolean;
  handoffRemainingMs?: number;
  localNodeId: string;
  motion: ReturnType<typeof useTerminalMotion>;
  onFault: (event: string) => void;
  onFinaleWindowChange: (open: boolean) => void;
  play: ReturnType<typeof useHousewireSound>['play'];
  playKnocks: ReturnType<typeof useHousewireSound>['playKnocks'];
  preview: boolean;
  sharedActive: boolean;
  stage: StageDefinition;
  stageStartedAt?: number;
}) {
  if (stage.kind === 'answer') {
    return <AnswerScene allowManualFallback={allowManualFallback} motion={motion} onComplete={() => advanceStage('The receiver was answered by accessible hold.')} onStartMotion={() => void motion.start()} play={play} />;
  }
  if (stage.kind === 'cipher') {
    return <CipherScene compact={compact} crew={crew} game={game} localNodeId={localNodeId} onComplete={() => advanceStage('The family decoded the four-digit warning.')} onFault={() => onFault('The line rejected the four-digit warning.')} playKnocks={playKnocks} preview={preview} />;
  }
  if (stage.kind === 'lens') {
    if (sharedActive && localNodeId === game.destinationNodeId) {
      return <MarkerStationScene arrivalEnabled={handoffCourierReady} arrivalLabel={crewName(game.courierNodeId, crew)} arrivalRemainingMs={handoffRemainingMs} markers={game.lensMarkers.filter((marker) => marker.ownerNodeId === localNodeId)} onArrival={() => advanceStage('The courier reached the destination.', { confidence: 1, kind: 'RECEIPT_RELEASED', observedAt: Date.now() })} />;
    }
    return <CourierScene allowManualFallback={allowManualFallback} destination={crewName(game.destinationNodeId, crew)} game={game} motion={motion} onComplete={(evidence) => advanceStage('The scanned call crossed the house.', evidence)} onFault={onFault} onStartMotion={() => void motion.start()} play={play} preview={preview} />;
  }
  if (stage.kind === 'route') {
    return <RouteScene compact={compact} crew={crew} game={game} localNodeId={localNodeId} onComplete={() => advanceStage('Every route tile closed into one circuit.')} onFault={onFault} preview={preview} />;
  }
  return <FinaleScene allowManualFallback={allowManualFallback} clockOffsetMs={clockOffsetMs} completedNodeIds={completedNodeIds} crew={crew} motion={motion} onComplete={() => advanceStage('Every receiver closed together.')} onStartMotion={() => void motion.start()} onWindowChange={onFinaleWindowChange} play={play} preview={preview} sharedActive={sharedActive} stageStartedAt={stageStartedAt} />;
}

function AnswerScene({ allowManualFallback, motion, onComplete, onStartMotion, play }: {
  allowManualFallback: boolean;
  motion: TerminalMotionSnapshot;
  onComplete: () => void;
  onStartMotion: () => void;
  play: ReturnType<typeof useHousewireSound>['play'];
}) {
  const { theme } = useHousewireTheme();
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const ringPhase = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    ringPhase.value = withRepeat(withTiming(1, { duration: 820, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(ringPhase);
  }, [reducedMotion, ringPhase]);
  const receiverMotion = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${-8 + Math.sin(ringPhase.value * Math.PI * 4) * 1.8}deg` },
      { scale: interpolate(ringPhase.value, [0, 1], [1, 1.025]) },
    ],
  }));
  const ringMotion = useAnimatedStyle(() => ({
    opacity: interpolate(ringPhase.value, [0, 1], [0.58, 0.05]),
    transform: [{ scale: interpolate(ringPhase.value, [0, 1], [0.72, 1.2]) }],
  }));
  useEffect(() => play('ring', 0.42), [play]);
  return (
    <View style={styles.centerScene}>
      <Animated.View entering={FadeIn.duration(500)} style={[styles.receiverObject, receiverMotion]}>
        <View style={[styles.receiverBar, { backgroundColor: theme.colors.wire }]} />
        <View style={[styles.receiverEnd, styles.receiverEndLeft, { borderColor: theme.colors.wire }]} />
        <View style={[styles.receiverEnd, styles.receiverEndRight, { borderColor: theme.colors.wire }]} />
        <Animated.View style={[styles.ringOne, { borderColor: theme.colors.wire }, ringMotion]} />
        <View style={[styles.ringTwo, { borderColor: theme.colors.wire }]} />
      </Animated.View>
      <Text style={[styles.bigPrompt, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Pick up.</Text>
      <Text style={[styles.microcopy, { color: theme.colors.muted, fontFamily: theme.typography.families.mono }]}>{motion.active ? `motion live · ${Math.round(motion.steadiness * 100)}% steady` : 'the phone can feel the lift'}</Text>
      {!motion.active && motion.available !== false && !motion.denied ? <QuietButton icon="phone-portrait-outline" label="Use motion" onPress={onStartMotion} /> : null}
      {allowManualFallback ? <HoldDial durationMs={1_100} label="Accessible hold" onComplete={onComplete} /> : null}
    </View>
  );
}

function CipherScene({ compact, crew, game, localNodeId, onComplete, onFault, playKnocks, preview }: {
  compact: boolean;
  crew: CrewNode[];
  game: Line13Game;
  localNodeId: string;
  onComplete: () => void;
  onFault: () => void;
  playKnocks: ReturnType<typeof useHousewireSound>['playKnocks'];
  preview: boolean;
}) {
  const { theme } = useHousewireTheme();
  const [viewIndex, setViewIndex] = useState(Math.max(0, game.nodeIds.indexOf(localNodeId)));
  const [heardGlyph, setHeardGlyph] = useState<Line13Glyph | undefined>(undefined);
  const [entered, setEntered] = useState('');
  const [rejected, setRejected] = useState(false);
  const viewedNodeId = preview ? game.nodeIds[viewIndex] : localNodeId;
  const fragment = game.cipherFragments.find((item) => item.nodeId === viewedNodeId);
  const decoder = game.decoderFragments.find((item) => item.nodeId === viewedNodeId);

  useEffect(() => {
    setHeardGlyph(undefined);
  }, [viewedNodeId]);

  const listen = (clue: NonNullable<typeof fragment>['positions'][number]) => {
    const count = Math.max(1, Math.min(4, clue.index)) as 1 | 2 | 3 | 4;
    playKnocks(count, 0.92);
    setHeardGlyph(clue.glyph);
  };
  const submit = () => {
    if (entered === game.pin) {
      onComplete();
      return;
    }
    setRejected(true);
    setEntered('');
    onFault();
    setTimeout(() => setRejected(false), 900);
  };

  return (
    <View style={styles.puzzleScene}>
      <RoomStepper crew={crew} index={viewIndex} nodeId={viewedNodeId} onChange={setViewIndex} preview={preview} total={game.nodeIds.length} />
      <View style={[styles.soundClueRow, compact && styles.soundClueRowCompact]}>
        {(fragment?.positions ?? []).map((clue) => (
          <Pressable accessibilityLabel={`Play knock clue for ${clue.glyph}`} accessibilityRole="button" key={clue.glyph} onPress={() => listen(clue)} style={({ pressed }) => [styles.symbolPlate, { borderColor: heardGlyph === clue.glyph ? theme.colors.wire : theme.colors.draft }, pressed && styles.pressed]}>
            <GlyphMark color={theme.colors.text} glyph={clue.glyph} size={58} />
            <View style={styles.clueListen}><Ionicons color={theme.colors.wire} name="ear-outline" size={18} /><Text style={[styles.clueListenText, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{heardGlyph === clue.glyph ? 'REPLAY' : 'LISTEN'}</Text></View>
          </Pressable>
        ))}
      </View>
      <View style={[styles.decoderRow, compact && styles.decoderRowCompact]}>{(decoder?.mappings ?? []).map((mapping) => (
        <View key={mapping.glyph} style={styles.mapping}>
          <GlyphMark color={theme.colors.muted} glyph={mapping.glyph} size={28} strokeWidth={3} />
          <Text style={[styles.mappingDigit, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{mapping.digit}</Text>
        </View>
      ))}</View>
      <CodePad compact={compact} entered={entered} rejected={rejected} onChange={setEntered} onSubmit={submit} />
    </View>
  );
}

function CourierScene({ allowManualFallback, destination, game, motion, onComplete, onFault, onStartMotion, play, preview }: {
  allowManualFallback: boolean;
  destination: string;
  game: Line13Game;
  motion: TerminalMotionSnapshot;
  onComplete: (evidence: CompletionEvidence) => void;
  onFault: (event: string) => void;
  onStartMotion: () => void;
  play: ReturnType<typeof useHousewireSound>['play'];
  preview: boolean;
}) {
  const { theme } = useHousewireTheme();
  const [lensSolved, setLensSolved] = useState(false);
  const [moving, setMoving] = useState(false);
  const evidenceAtStartRef = useRef<number | undefined>(undefined);
  const steadyEvidenceRef = useRef<CompletionEvidence | undefined>(undefined);

  useEffect(() => {
    if (!moving || motion.lastEvidence?.kind !== 'CARRY_STEADY' || motion.lastEvidence.confidence < 0.68 || motion.lastEvidence.observedAt === evidenceAtStartRef.current) return;
    const evidence = { confidence: motion.lastEvidence.confidence, kind: 'CARRY_STEADY' as const, observedAt: motion.lastEvidence.observedAt };
    steadyEvidenceRef.current = evidence;
    if (lensSolved) onComplete(evidence);
  }, [lensSolved, motion.lastEvidence, moving, onComplete]);

  const finishLens = () => {
    setLensSolved(true);
    play('relay', 0.7);
    if (steadyEvidenceRef.current) onComplete(steadyEvidenceRef.current);
  };

  if (!moving) {
    return (
      <View style={styles.centerScene}>
        <View style={[styles.carryOrb, { borderColor: theme.colors.wire }]}>
          <Ionicons color={theme.colors.wire} name="walk-outline" size={54} />
          <View style={[styles.carryOrbit, { borderColor: theme.colors.draft }]} />
        </View>
        <Text style={[styles.bigPrompt, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Carry the open line.</Text>
        <Text style={[styles.microcopy, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Keep level. Find the decoded seals. Finish at {destination}.</Text>
        <PrimaryButton icon="walk-outline" label="Arm the courier" onPress={() => {
          evidenceAtStartRef.current = motion.lastEvidence?.observedAt;
          steadyEvidenceRef.current = undefined;
          setMoving(true);
          if (!motion.active) onStartMotion();
        }} />
      </View>
    );
  }
  if (!lensSolved) return <LensScanner markers={game.lensMarkers} motion={motion} onFault={onFault} onSolved={finishLens} play={play} preview={preview} />;
  return (
    <View style={styles.centerScene}>
      <View style={[styles.carryOrb, { borderColor: theme.colors.wire }]}>
        <Ionicons color={theme.colors.wire} name="walk-outline" size={54} />
        <View style={[styles.carryOrbit, { borderColor: theme.colors.draft }]} />
      </View>
      <Seal label="ALL SEALS FOUND" tone="ready" />
      <Text style={[styles.bigPrompt, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Hold at {destination}.</Text>
      <Text style={[styles.microcopy, { color: theme.colors.muted, fontFamily: theme.typography.families.mono }]}>{Math.round(motion.steadiness * 100)}% line stability</Text>
      {allowManualFallback ? <HoldDial durationMs={2_600} label="Accessible carry" onComplete={() => onComplete({ confidence: 1, kind: 'MANUAL_HOLD', observedAt: Date.now() })} /> : <Seal label="SENSOR VERIFYING THE CARRY" tone="ready" />}
    </View>
  );
}

function LensScanner({ markers, motion, onFault, onSolved, play, preview }: {
  markers: readonly LensMarker[];
  motion: TerminalMotionSnapshot;
  onFault: (event: string) => void;
  onSolved: () => void;
  play: ReturnType<typeof useHousewireSound>['play'];
  preview: boolean;
}) {
  const { theme } = useHousewireTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [index, setIndex] = useState(0);
  const [manual, setManual] = useState(Platform.OS === 'web');
  const [scanLocked, setScanLocked] = useState(false);
  const [cameraError, setCameraError] = useState<string>();
  const acceptedTokensRef = useRef(new Set<string>());
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const expected = markers[index];
  const accept = useCallback(() => {
    if (!expected) return;
    acceptedTokensRef.current.add(expected.qrToken);
    play('switch', 0.76);
    if (index >= markers.length - 1) onSolved();
    else setIndex((current) => current + 1);
  }, [expected, index, markers.length, onSolved, play]);
  useEffect(() => () => {
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
  }, []);
  const handleScan = ({ data }: BarcodeScanningResult) => {
    if (scanLocked || !expected || acceptedTokensRef.current.has(data)) return;
    setScanLocked(true);
    if (data === expected.qrToken) accept();
    else onFault(`Lens saw the wrong marker for position ${expected.position}.`);
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(() => {
      unlockTimerRef.current = undefined;
      setScanLocked(false);
    }, 700);
  };

  if (preview) {
    return (
      <ImageBackground imageStyle={styles.previewLensImage} source={HOUSE_ART} style={styles.lensFrame}>
        <View style={styles.lensShade} />
        <LensOverlay glyph={expected?.glyph} index={index} steadiness={motion.steadiness} total={markers.length} />
        {expected ? <GlyphMark color={theme.colors.text} glyph={expected.glyph} size={88} /> : null}
        <Seal label="SIMULATED CAMERA" tone="warning" />
        <PrimaryButton icon="scan-outline" label="Lock marker" onPress={accept} />
      </ImageBackground>
    );
  }
  if (manual) {
    return (
      <View style={styles.centerScene}>
        <LensOverlay glyph={expected?.glyph} index={index} steadiness={motion.steadiness} total={markers.length} />
        {cameraError ? <Seal label="CAMERA UNAVAILABLE — MANUAL LENS" tone="warning" /> : null}
        <Text style={[styles.smallPrompt, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Choose the matching seal.</Text>
        <View style={styles.manualGlyphGrid}>{LINE_13_GLYPHS.map((glyph) => (
          <Pressable accessibilityLabel={`${glyph} marker`} accessibilityRole="button" key={glyph} onPress={() => glyph === expected?.glyph ? accept() : onFault('The manual lens rejected that symbol.')} style={({ pressed }) => [styles.manualGlyph, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
            <GlyphMark color={theme.colors.text} glyph={glyph} size={42} />
          </Pressable>
        ))}</View>
        {!cameraError ? <QuietButton icon="camera-outline" label="Use camera" onPress={() => setManual(false)} /> : null}
      </View>
    );
  }
  if (!permission?.granted) {
    return (
      <View style={styles.centerScene}>
        <View style={[styles.lensIcon, { borderColor: theme.colors.wire }]}><Ionicons color={theme.colors.wire} name="camera-outline" size={54} /></View>
        <Text style={[styles.smallPrompt, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Open the spectral lens.</Text>
        <Text style={[styles.microcopy, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Scans clues only. Saves nothing.</Text>
        <PrimaryButton icon="camera-outline" label="Open camera" onPress={() => void requestPermission().then((result) => {
          if (!result.granted && !result.canAskAgain) setManual(true);
        })} />
        <QuietButton icon="keypad-outline" label="Manual lens" onPress={() => setManual(true)} />
      </View>
    );
  }
  return (
    <View style={[styles.lensFrame, { borderColor: theme.colors.wire }]}>
      <CameraView barcodeScannerSettings={{ barcodeTypes: ['qr'] }} facing="back" onBarcodeScanned={scanLocked ? undefined : handleScan} onMountError={(error) => {
        setCameraError(error.message || 'Camera could not start.');
        setManual(true);
      }} style={StyleSheet.absoluteFill} />
      <View style={styles.cameraTint} />
      <LensOverlay glyph={expected?.glyph} index={index} steadiness={motion.steadiness} total={markers.length} />
      <Pressable accessibilityLabel="Use manual marker entry" hitSlop={10} onPress={() => setManual(true)} style={styles.manualCorner}><Ionicons color={theme.colors.text} name="keypad-outline" size={22} /></Pressable>
    </View>
  );
}

function LensOverlay({ glyph, index, steadiness, total }: { glyph?: Line13Game['cipher'][number]; index: number; steadiness: number; total: number }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <View style={[styles.reticle, { borderColor: theme.colors.wire }]}>
        <View style={[styles.reticleHorizontal, { backgroundColor: theme.colors.wire }]} />
        <View style={[styles.reticleVertical, { backgroundColor: theme.colors.wire }]} />
      </View>
      <View style={styles.lensCounter}>
        <Text style={[styles.lensCounterText, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>FIND</Text>
        {glyph ? <GlyphMark color={theme.colors.wire} glyph={glyph} size={34} strokeWidth={3} /> : null}
        <Text style={[styles.lensCounterText, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{index + 1}/{total} · {Math.round(steadiness * 100)}%</Text>
      </View>
    </View>
  );
}

function MarkerStationScene({ arrivalEnabled = false, arrivalLabel, arrivalRemainingMs, markers, onArrival }: {
  arrivalEnabled?: boolean;
  arrivalLabel?: string;
  arrivalRemainingMs?: number;
  markers: readonly LensMarker[];
  onArrival?: () => void;
}) {
  const { theme } = useHousewireTheme();
  const [index, setIndex] = useState(0);
  const marker = markers[index];
  if (!marker) {
    return <View style={styles.centerScene}><Ionicons color={theme.colors.muted} name="navigate-circle-outline" size={76} /><Text style={[styles.smallPrompt, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Guide the courier.</Text><Text style={[styles.microcopy, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Your voice is the clue.</Text></View>;
  }
  return (
    <View style={styles.markerScene}>
      <View style={styles.markerTopline}>
        <Seal label="PRIVATE SEAL" tone="wire" />
        {markers.length > 1 ? <View style={styles.markerPager}><IconButton disabled={index === 0} icon="chevron-back" label="Previous marker" onPress={() => setIndex((current) => current - 1)} /><IconButton disabled={index === markers.length - 1} icon="chevron-forward" label="Next marker" onPress={() => setIndex((current) => current + 1)} /></View> : null}
      </View>
      <View style={[styles.qrPlate, { backgroundColor: theme.colors.text }]}>
        <QRCode backgroundColor="#FFF9EB" color="#090B09" ecl="H" quietZone={8} size={154} value={marker.qrToken} />
        <View style={[styles.qrGlyph, { backgroundColor: '#090B09' }]}><GlyphMark color="#FFF9EB" glyph={marker.glyph} size={28} /></View>
      </View>
      <Text style={[styles.markerInstruction, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Show when called.</Text>
      {markers.length > 1 ? <Text style={[styles.microcopy, { color: theme.colors.muted, fontFamily: theme.typography.families.mono }]}>after the beep, switch seal</Text> : null}
      {onArrival ? (
        <View style={styles.arrivalDock}>
          <Text style={[styles.microcopy, { color: theme.colors.muted, fontFamily: theme.typography.families.mono }]}>
            {arrivalEnabled
              ? `${arrivalLabel} is ready · ${Math.max(1, Math.ceil((arrivalRemainingMs ?? 0) / 1_000))}s to confirm`
              : arrivalRemainingMs === 0
                ? 'Handoff expired · courier is re-arming'
                : `Waiting for ${arrivalLabel} to lock every seal`}
          </Text>
          {arrivalEnabled ? <HoldDial durationMs={1_100} label="Courier arrived" onComplete={onArrival} /> : <Seal label="WAITING FOR COURIER" tone="warning" />}
        </View>
      ) : null}
    </View>
  );
}

function RouteScene({ compact, crew, game, localNodeId, onComplete, onFault, preview }: {
  compact: boolean;
  crew: CrewNode[];
  game: Line13Game;
  localNodeId: string;
  onComplete: () => void;
  onFault: (event: string) => void;
  preview: boolean;
}) {
  const { theme } = useHousewireTheme();
  const [viewIndex, setViewIndex] = useState(Math.max(0, game.nodeIds.indexOf(localNodeId)));
  const [attempt, setAttempt] = useState<Line13Glyph[]>([]);
  const [rejected, setRejected] = useState(false);
  const viewedNodeId = preview ? game.nodeIds[viewIndex] : localNodeId;
  const scraps = game.routeScraps.filter((item) => item.nodeId === viewedNodeId);
  const submit = () => {
    if (isCorrectCircuit(game, attempt)) {
      onComplete();
      return;
    }
    let prefix = 0;
    while (prefix < attempt.length && attempt[prefix] === game.circuitOrder[prefix]) prefix += 1;
    setAttempt(attempt.slice(0, prefix));
    setRejected(true);
    onFault('The route reached a false exit; its correct prefix stayed wired.');
    setTimeout(() => setRejected(false), 900);
  };
  return (
    <ImageBackground imageStyle={styles.floorplanImage} source={FLOORPLAN_ART} style={[styles.routeScene, compact && styles.routeSceneCompact]}>
      <View style={styles.floorplanShade} />
      <RoomStepper crew={crew} index={viewIndex} nodeId={viewedNodeId} onChange={setViewIndex} preview={preview} total={game.nodeIds.length} />
      <View style={styles.routeClue}>
        <Seal label={`${game.phase} WIRE`} tone="warning" />
        <View style={styles.routeTileStack}>{scraps.map((scrap) => <CircuitTile compact={compact} game={game} key={scrap.incoming} scrap={scrap} />)}</View>
      </View>
      <View style={[styles.pathStrip, rejected && { borderColor: theme.colors.fault }]}>{game.circuitOrder.map((_, index) => (
        <View key={index} style={styles.pathSlot}>{attempt[index] ? <GlyphMark color={theme.colors.text} glyph={attempt[index]} size={25} strokeWidth={3} /> : <Text style={[styles.pathSlotText, { color: theme.colors.faint, fontFamily: theme.typography.families.display }]}>{index + 1}</Text>}</View>
      ))}<Ionicons color={theme.colors.wire} name="repeat" size={18} /></View>
      <View style={styles.roomChoices}>{LINE_13_GLYPHS.map((glyph) => (
        <Pressable accessibilityLabel={`Add ${glyph} tile`} accessibilityRole="button" disabled={attempt.includes(glyph)} key={glyph} onPress={() => setAttempt((current) => [...current, glyph])} style={({ pressed }) => [styles.roomChoice, { borderColor: attempt.includes(glyph) ? theme.colors.faint : theme.colors.draft }, pressed && styles.pressed]}>
          <GlyphMark color={attempt.includes(glyph) ? theme.colors.faint : theme.colors.text} glyph={glyph} size={34} strokeWidth={3} />
        </Pressable>
      ))}</View>
      <View style={styles.routeActions}><QuietButton icon="arrow-undo-outline" label="Undo" onPress={() => setAttempt((current) => current.slice(0, -1))} /><PrimaryButton disabled={attempt.length !== game.circuitOrder.length} icon="flash-outline" label="Close circuit" onPress={submit} /></View>
    </ImageBackground>
  );
}

function FinaleScene({ allowManualFallback, clockOffsetMs, completedNodeIds, crew, motion, onComplete, onStartMotion, onWindowChange, play, preview, sharedActive, stageStartedAt }: {
  allowManualFallback: boolean;
  clockOffsetMs: number;
  completedNodeIds: readonly string[];
  crew: CrewNode[];
  motion: TerminalMotionSnapshot;
  onComplete: () => void;
  onStartMotion: () => void;
  onWindowChange: (open: boolean) => void;
  play: ReturnType<typeof useHousewireSound>['play'];
  preview: boolean;
  sharedActive: boolean;
  stageStartedAt?: number;
}) {
  const { theme } = useHousewireTheme();
  const [beat, setBeat] = useState<'READY' | '3' | '2' | '1' | 'FLAT'>('READY');
  const localOriginRef = useRef(stageStartedAt ?? Date.now());
  const previousBeatRef = useRef<typeof beat>('READY');
  const activeCrew = crew.filter((node) => node.connected).slice(0, 4);
  useEffect(() => {
    const tick = () => {
      const elapsed = Math.max(0, Date.now() + clockOffsetMs - (stageStartedAt ?? localOriginRef.current)) % 6_000;
      const next = elapsed < 1_500 ? 'READY' : elapsed < 2_500 ? '3' : elapsed < 3_500 ? '2' : elapsed < 4_500 ? '1' : elapsed < 5_500 ? 'FLAT' : 'READY';
      if (next === previousBeatRef.current) return;
      previousBeatRef.current = next;
      setBeat(next);
      onWindowChange(next === 'FLAT');
      play(next === 'FLAT' ? 'accept' : 'switch', next === 'FLAT' ? 0.6 : 0.28);
    };
    tick();
    const interval = setInterval(tick, 80);
    return () => {
      clearInterval(interval);
      onWindowChange(false);
    };
  }, [clockOffsetMs, onWindowChange, play, stageStartedAt]);
  return (
    <View style={styles.centerScene}>
      <View style={styles.finalContacts}>{activeCrew.map((node) => {
        const closed = sharedActive ? completedNodeIds.includes(node.id) : beat === 'FLAT';
        return <View key={node.id} style={styles.finalContactItem}><View style={[styles.finalContact, { borderColor: node.color, backgroundColor: closed ? node.color : 'transparent' }]} /><Text style={[styles.finalContactLabel, { color: closed ? theme.colors.text : theme.colors.muted, fontFamily: theme.typography.families.mono }]}>{node.nodeNumber}</Text></View>;
      })}</View>
      <View style={[styles.flatPhone, { borderColor: theme.colors.wire }]}><View style={[styles.flatPhoneSpeaker, { backgroundColor: theme.colors.wire }]} /><Ionicons color={theme.colors.wire} name="arrow-down" size={38} /></View>
      <Text style={[styles.countdownBeat, { color: beat === 'FLAT' ? theme.colors.ready : theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{beat === 'READY' ? 'GET READY' : beat}</Text>
      <Text style={[styles.microcopy, { color: theme.colors.muted, fontFamily: theme.typography.families.mono }]}>{motion.active ? `flatness ${Math.round(motion.flatness * 100)}%` : preview ? 'simulated family follows the beat' : 'place screen-up together'}</Text>
      {!motion.active && motion.available !== false && !motion.denied ? <QuietButton icon="phone-portrait-outline" label="Arm motion" onPress={onStartMotion} /> : null}
      {allowManualFallback && beat === 'FLAT' ? <PrimaryButton icon="power-outline" label="Close now" onPress={onComplete} /> : <Seal label={beat === 'FLAT' ? 'PLACE FLAT NOW' : 'WAIT FOR FLAT'} tone="ready" />}
    </View>
  );
}

function WaitingScene({ completedNodeIds, crew, game, localNodeId, onAbandon, playKnocks, requiredNodeIds, stage }: {
  completedNodeIds: readonly string[];
  crew: CrewNode[];
  game: Line13Game;
  localNodeId: string;
  onAbandon?: () => void;
  playKnocks: ReturnType<typeof useHousewireSound>['playKnocks'];
  requiredNodeIds: readonly string[];
  stage: StageDefinition;
}) {
  const { theme } = useHousewireTheme();
  const markers = game.lensMarkers.filter((marker) => marker.ownerNodeId === localNodeId);
  if (stage.kind === 'lens' && markers.length > 0 && localNodeId !== game.courierNodeId) return <MarkerStationScene markers={markers} />;
  const localComplete = completedNodeIds.includes(localNodeId);
  const isClueStation = !requiredNodeIds.includes(localNodeId);
  if ((localComplete || isClueStation) && (stage.kind === 'cipher' || stage.kind === 'route')) {
    return <PrivateClueCache game={game} localNodeId={localNodeId} playKnocks={playKnocks} stage={stage.kind} statusLabel={localComplete ? 'PROOF SENT — KEEP HELPING' : 'CLUE STATION — HELP THE SWITCHBOARD'} />;
  }
  const copy = stage.kind === 'finale'
    ? localComplete
      ? 'Stay flat. Waiting for the others.'
      : completedNodeIds.length > 0
        ? 'Missed the window. Count again.'
        : 'Count together. Flat on zero.'
    : isClueStation
      ? stage.kind === 'answer' ? 'Another phone is ringing.' : 'Help the active rooms.'
      : localComplete ? 'Your proof is locked.' : 'Reconnecting the house…';
  return (
    <View style={styles.centerScene}>
      <View style={styles.waitOrbit}><View style={[styles.waitRing, { borderColor: theme.colors.draft }]} /><Ionicons color={theme.colors.wire} name={localComplete ? 'checkmark' : 'radio-outline'} size={48} /></View>
      <Text style={[styles.bigPrompt, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{copy}</Text>
      <View style={styles.crewWaitRow}>{requiredNodeIds.map((nodeId) => <View key={nodeId} style={[styles.waitDot, { borderColor: crew.find((node) => node.id === nodeId)?.color ?? theme.colors.wire, backgroundColor: completedNodeIds.includes(nodeId) ? theme.colors.ready : 'transparent' }]} />)}</View>
      {onAbandon ? <QuietButton icon="exit-outline" label="Leave game" onPress={onAbandon} /> : null}
    </View>
  );
}

function PrivateClueCache({ game, localNodeId, playKnocks, stage, statusLabel }: {
  game: Line13Game;
  localNodeId: string;
  playKnocks: ReturnType<typeof useHousewireSound>['playKnocks'];
  stage: 'cipher' | 'route';
  statusLabel: string;
}) {
  const { theme } = useHousewireTheme();
  if (stage === 'cipher') {
    const fragment = game.cipherFragments.find((item) => item.nodeId === localNodeId);
    const decoder = game.decoderFragments.find((item) => item.nodeId === localNodeId);
    return (
      <View style={styles.puzzleScene}>
        <Seal label={statusLabel} tone="ready" />
        <View style={styles.soundClueRow}>
          {(fragment?.positions ?? []).map((clue) => (
            <Pressable accessibilityLabel={`Replay knocks for ${clue.glyph}`} accessibilityRole="button" key={clue.glyph} onPress={() => playKnocks(Math.max(1, Math.min(4, clue.index)) as 1 | 2 | 3 | 4, 0.92)} style={[styles.symbolPlate, { borderColor: theme.colors.draft }]}>
              <GlyphMark color={theme.colors.text} glyph={clue.glyph} size={54} />
              <Ionicons color={theme.colors.wire} name="ear-outline" size={20} />
            </Pressable>
          ))}
        </View>
        <View style={styles.decoderRow}>{(decoder?.mappings ?? []).map((mapping) => (
          <View key={mapping.glyph} style={styles.mapping}>
            <GlyphMark color={theme.colors.muted} glyph={mapping.glyph} size={28} strokeWidth={3} />
            <Text style={[styles.mappingDigit, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{mapping.digit}</Text>
          </View>
        ))}</View>
      </View>
    );
  }
  const scraps = game.routeScraps.filter((item) => item.nodeId === localNodeId);
  return (
    <View style={styles.centerScene}>
      <Seal label={statusLabel} tone="ready" />
      <Seal label={`${game.phase} WIRE`} tone="warning" />
      <View style={styles.routeTileStack}>{scraps.map((scrap) => <CircuitTile game={game} key={scrap.incoming} scrap={scrap} />)}</View>
    </View>
  );
}

function CircuitTile({ compact = false, game, scrap }: { compact?: boolean; game: Line13Game; scrap: RouteScrap }) {
  const { theme } = useHousewireTheme();
  const exit = game.phase === 'SOLID' ? scrap.solidExit : scrap.brokenExit;
  const source = scrap.incoming === game.circuitOrder[0];
  return (
    <View style={[styles.circuitTile, compact && styles.circuitTileCompact, { borderColor: source ? theme.colors.ready : theme.colors.draft }]}>
      {source ? <View style={[styles.sourceNotch, { backgroundColor: theme.colors.ready }]} /> : null}
      {source ? <Text style={[styles.sourceLabel, { color: theme.colors.ready, fontFamily: theme.typography.families.monoMedium }]}>SOURCE</Text> : null}
      <GlyphMark color={theme.colors.text} glyph={scrap.incoming} size={38} />
      <Ionicons color={theme.colors.wire} name="arrow-forward" size={19} />
      <GlyphMark color={theme.colors.wire} glyph={exit} size={38} />
    </View>
  );
}

function MissingScene({ onEnd }: { onEnd: () => void }) {
  const { theme } = useHousewireTheme();
  return <View style={styles.centerScene}><Ionicons color={theme.colors.fault} name="unlink-outline" size={72} /><Text style={[styles.bigPrompt, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>A phone went dark.</Text><Text style={[styles.microcopy, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Reconnect it to continue.</Text><QuietButton icon="exit-outline" label="End game" onPress={onEnd} /></View>;
}

function CodePad({ compact, entered, onChange, onSubmit, rejected }: {
  compact: boolean;
  entered: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  rejected: boolean;
}) {
  const { theme } = useHousewireTheme();
  const keys: readonly (number | 'back' | 'go')[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'back', 0, 'go'];
  return (
    <View style={styles.codePad}>
      <View style={[styles.pinSlots, compact && styles.pinSlotsCompact]}>{Array.from({ length: 4 }, (_, index) => <View key={index} style={[styles.pinSlot, compact && styles.pinSlotCompact, { borderColor: rejected ? theme.colors.fault : entered[index] ? theme.colors.wire : theme.colors.draft }]}><Text style={[styles.pinDigit, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{entered[index] ?? '·'}</Text></View>)}</View>
      <View style={styles.keyGrid}>{keys.map((key) => (
        <Pressable accessibilityLabel={key === 'back' ? 'Delete digit' : key === 'go' ? 'Submit code' : `Digit ${key}`} accessibilityRole="button" disabled={key === 'go' && entered.length !== 4} key={key} onPress={() => {
          if (key === 'back') onChange(entered.slice(0, -1));
          else if (key === 'go') onSubmit();
          else if (entered.length < 4) onChange(`${entered}${key}`);
        }} style={({ pressed }) => [styles.numberKey, { borderColor: key === 'go' ? theme.colors.wire : theme.colors.draft, opacity: key === 'go' && entered.length !== 4 ? 0.3 : 1 }, pressed && styles.pressed]}>
          {key === 'back' || key === 'go' ? <Ionicons color={key === 'go' ? theme.colors.wire : theme.colors.muted} name={key === 'back' ? 'backspace-outline' : 'enter-outline'} size={20} /> : <Text style={[styles.numberKeyText, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{key}</Text>}
        </Pressable>
      ))}</View>
    </View>
  );
}

function RoomStepper({ crew, index, nodeId, onChange, preview, total }: {
  crew: CrewNode[];
  index: number;
  nodeId: string;
  onChange: (index: number) => void;
  preview: boolean;
  total: number;
}) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.roomStepper}>
      {preview ? <IconButton disabled={index === 0} icon="chevron-back" label="Previous simulated room" onPress={() => onChange(index - 1)} /> : <View style={styles.iconSpacer} />}
      <View style={styles.roomIdentity}><Text style={[styles.roomName, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{crewName(nodeId, crew)}</Text><Text style={[styles.roomMode, { color: preview ? theme.colors.warning : theme.colors.ready, fontFamily: theme.typography.families.mono }]}>{preview ? `simulated room ${index + 1}/${total}` : 'your private clue'}</Text></View>
      {preview ? <IconButton disabled={index === total - 1} icon="chevron-forward" label="Next simulated room" onPress={() => onChange(index + 1)} /> : <View style={styles.iconSpacer} />}
    </View>
  );
}

function HoldDial({ durationMs, label, onComplete, onHoldingChange, onProgress, tone = 'wire' }: {
  durationMs: number;
  label: string;
  onComplete: () => void;
  onHoldingChange?: (holding: boolean) => void;
  onProgress?: (progress: number) => void;
  tone?: 'wire' | 'ready';
}) {
  const { theme } = useHousewireTheme();
  const [progress, setProgress] = useState(0);
  const startedAtRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const completedRef = useRef(false);
  const color = tone === 'ready' ? theme.colors.ready : theme.colors.wire;
  const clear = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = undefined;
  }, []);
  useEffect(() => clear, [clear]);
  const begin = (_event: GestureResponderEvent) => {
    clear();
    completedRef.current = false;
    startedAtRef.current = Date.now();
    setProgress(0);
    onProgress?.(0);
    onHoldingChange?.(true);
    intervalRef.current = setInterval(() => {
      const next = Math.min(1, (Date.now() - startedAtRef.current) / durationMs);
      setProgress(next);
      onProgress?.(next);
      if (next >= 1) {
        clear();
        completedRef.current = true;
        onHoldingChange?.(false);
        onComplete();
      }
    }, 45);
  };
  const end = (_event: GestureResponderEvent) => {
    clear();
    onHoldingChange?.(false);
    if (!completedRef.current) {
      setProgress(0);
      onProgress?.(0);
    }
  };
  return (
    <Pressable accessibilityHint="Keep holding until the line closes" accessibilityLabel={label} accessibilityRole="button" onPressIn={begin} onPressOut={end} style={({ pressed }) => [styles.holdDial, { borderColor: color }, pressed && styles.holdDialPressed]}>
      <View style={[styles.holdDialFill, { backgroundColor: color, width: `${Math.max(2, progress * 100)}%` }]} />
      <Text style={[styles.holdDialLabel, { color: progress > 0.58 ? theme.colors.background : color, fontFamily: theme.typography.families.display }]}>{progress > 0 ? `${Math.round(progress * 100)}%` : label}</Text>
    </Pressable>
  );
}

function MissionDock({ compact, completedNodeIds, crew, hintLevel, localNodeId, onHint, sharedActive }: {
  compact: boolean;
  completedNodeIds: readonly string[];
  crew: CrewNode[];
  hintLevel: number;
  localNodeId: string;
  onHint: () => void;
  sharedActive: boolean;
}) {
  const { theme } = useHousewireTheme();
  return (
    <View style={[styles.dock, compact && styles.dockCompact, { borderColor: theme.colors.draft }]}>
      <View style={styles.dockCrew}>{crew.filter((node) => node.connected).slice(0, 4).map((node) => (
        <View key={node.id} style={[styles.dockNode, { borderColor: node.id === localNodeId ? node.color : theme.colors.draft, backgroundColor: completedNodeIds.includes(node.id) ? theme.colors.ready : theme.colors.surface }]}><Text style={[styles.dockNodeText, { color: completedNodeIds.includes(node.id) ? theme.colors.background : node.color, fontFamily: theme.typography.families.monoMedium }]}>{node.nodeNumber}</Text></View>
      ))}<Text style={[styles.dockMode, { color: theme.colors.muted, fontFamily: theme.typography.families.mono }]}>{sharedActive ? 'connected' : 'rehearsal'}</Text></View>
      <Pressable accessibilityLabel="Open a progressive hint" accessibilityRole="button" onPress={onHint} style={[styles.hintButton, { borderColor: hintLevel ? theme.colors.warning : theme.colors.draft }]}><Text style={[styles.hintButtonText, { color: hintLevel ? theme.colors.warning : theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>? {hintLevel || ''}</Text></Pressable>
    </View>
  );
}

function HintSheet({ level, onClose, onNext, text }: { level: number; onClose: () => void; onNext: () => void; text: string }) {
  const { theme } = useHousewireTheme();
  return (
    <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(150)} style={[styles.hintSheet, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.warning }]}>
      <View style={styles.hintTopline}><Seal label={`HINT ${level} / 3`} tone="warning" /><IconButton icon="close" label="Close hint" onPress={onClose} /></View>
      <Text style={[styles.hintText, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{text}</Text>
      {level < 3 ? <QuietButton icon="arrow-forward" label="Another hint" onPress={onNext} /> : null}
    </Animated.View>
  );
}

function InterruptionSheet({ failed, live, onBypass, onEnd, onRecover, onResume }: {
  failed: boolean;
  live: boolean;
  onBypass: () => void;
  onEnd: () => void;
  onRecover: () => void;
  onResume: () => void;
}) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.interruptionBackdrop}>
      <Animated.View entering={FadeInDown.duration(220)} style={[styles.interruption, { backgroundColor: theme.colors.surfaceRaised, borderColor: failed ? theme.colors.fault : theme.colors.draft }]}>
        <Seal label={failed ? 'LINE LOST' : 'PAUSED'} tone={failed ? 'fault' : 'warning'} />
        <Text style={[styles.interruptionTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{failed ? 'Time caught the call.' : live ? 'Your screen is paused.' : 'The house is waiting.'}</Text>
        {!failed ? <PrimaryButton icon="play" label="Resume" onPress={onResume} /> : !live ? <PrimaryButton icon="time-outline" label="Add one minute" onPress={onRecover} /> : null}
        <QuietButton icon="accessibility-outline" label="Skip this puzzle" onPress={onBypass} />
        <QuietButton icon="exit-outline" label="End game" onPress={onEnd} />
      </Animated.View>
    </View>
  );
}

function PrimaryButton({ disabled, icon, label, onPress }: { disabled?: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { theme } = useHousewireTheme();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.colors.wire, opacity: disabled ? 0.35 : pressed ? 0.78 : 1 }]}><Ionicons color={theme.colors.background} name={icon} size={20} /><Text style={[styles.primaryButtonText, { color: theme.colors.background, fontFamily: theme.typography.families.display }]}>{label}</Text></Pressable>;
}

function QuietButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { theme } = useHousewireTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quietButton, { borderColor: theme.colors.draft }, pressed && styles.pressed]}><Ionicons color={theme.colors.muted} name={icon} size={18} /><Text style={[styles.quietButtonText, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{label}</Text></Pressable>;
}

function IconButton({ disabled, icon, label, onPress }: { disabled?: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { theme } = useHousewireTheme();
  return <Pressable accessibilityLabel={label} accessibilityRole="button" disabled={disabled} hitSlop={8} onPress={onPress} style={[styles.iconButton, { borderColor: theme.colors.draft, opacity: disabled ? 0.25 : 1 }]}><Ionicons color={theme.colors.text} name={icon} size={20} /></Pressable>;
}

function Seal({ label, tone }: { label: string; tone: 'wire' | 'ready' | 'warning' | 'fault' }) {
  const { theme } = useHousewireTheme();
  const color = tone === 'wire' ? theme.colors.wire : tone === 'ready' ? theme.colors.ready : tone === 'fault' ? theme.colors.fault : theme.colors.warning;
  return <View style={[styles.seal, { borderColor: color }]}><Text style={[styles.sealText, { color, fontFamily: theme.typography.families.monoMedium }]}>{label}</Text></View>;
}

function crewName(nodeId: string, crew: readonly CrewNode[]): string {
  return crew.find((node) => node.id === nodeId)?.name ?? `Room ${nodeId.slice(-2)}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, paddingBottom: 10, paddingTop: 8 },
  screenCompact: { paddingBottom: 4, paddingTop: 4 },
  header: { alignItems: 'center', flexDirection: 'row', height: 62, justifyContent: 'space-between' },
  headerCompact: { height: 54 },
  brandLockup: { alignItems: 'center', flexDirection: 'row', gap: 8, minWidth: 82 },
  brandSlash: { height: 36, transform: [{ rotate: '13deg' }], width: 4 },
  brand: { fontSize: 22, letterSpacing: 0.8, lineHeight: 22 },
  mode: { fontSize: 7, letterSpacing: 0.8, textTransform: 'uppercase' },
  phaseWire: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  phasePiece: { alignItems: 'center', flexDirection: 'row' },
  phaseLine: { height: 1, width: 13 },
  phaseDot: { borderRadius: 10, borderWidth: 2, height: 10, width: 10 },
  timeBlock: { alignItems: 'flex-end', flexDirection: 'row', gap: 10, justifyContent: 'flex-end', minWidth: 82 },
  clock: { fontSize: 16, letterSpacing: -0.4 },
  scene: { flex: 1 },
  sceneTitleRow: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', minHeight: 64, paddingBottom: 10 },
  sceneTitleRowCompact: { minHeight: 48, paddingBottom: 5 },
  stageTitle: { fontSize: 35, lineHeight: 35 },
  stageTitleCompact: { fontSize: 29, lineHeight: 30 },
  objective: { fontSize: 13, lineHeight: 18 },
  objectiveCompact: { fontSize: 11, lineHeight: 14 },
  clueCanvas: { flex: 1, minHeight: 0 },
  centerScene: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  puzzleScene: { flex: 1, gap: 9 },
  bigPrompt: { fontSize: 34, lineHeight: 37, textAlign: 'center' },
  smallPrompt: { fontSize: 28, lineHeight: 31, textAlign: 'center' },
  microcopy: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
  receiverObject: { height: 118, position: 'relative', transform: [{ rotate: '-8deg' }], width: 230 },
  receiverBar: { height: 24, left: 28, position: 'absolute', top: 45, width: 174 },
  receiverEnd: { borderWidth: 7, height: 76, position: 'absolute', top: 18, width: 50 },
  receiverEndLeft: { left: 4, transform: [{ rotate: '-12deg' }] },
  receiverEndRight: { right: 4, transform: [{ rotate: '12deg' }] },
  ringOne: { borderLeftWidth: 2, borderRadius: 60, borderRightWidth: 2, height: 110, left: 59, opacity: 0.5, position: 'absolute', top: 4, width: 110 },
  ringTwo: { borderLeftWidth: 1, borderRadius: 76, borderRightWidth: 1, height: 146, left: 41, opacity: 0.22, position: 'absolute', top: -14, width: 146 },
  soundClueRow: { flexDirection: 'row', gap: 10, height: 112 },
  soundClueRowCompact: { height: 92 },
  symbolPlate: { alignItems: 'center', borderWidth: 1, flex: 1, justifyContent: 'center', position: 'relative' },
  clueListen: { alignItems: 'center', bottom: 6, flexDirection: 'row', gap: 4, position: 'absolute' },
  clueListenText: { fontSize: 7, letterSpacing: 0.7 },
  miniPager: { bottom: 7, flexDirection: 'row', gap: 5, position: 'absolute' },
  miniDot: { borderRadius: 4, height: 6, width: 18 },
  listenButton: { alignItems: 'center', borderWidth: 1, flex: 1, gap: 2, justifyContent: 'center' },
  listenLabel: { fontSize: 20 },
  knockRail: { alignItems: 'center', flexDirection: 'row', gap: 4, height: 20 },
  knockBar: { width: 3 },
  decoderRow: { alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 48 },
  decoderRowCompact: { minHeight: 38 },
  mapping: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  mappingDigit: { fontSize: 23 },
  codePad: { alignSelf: 'center', flex: 1, maxWidth: 330, width: '100%' },
  pinSlots: { flexDirection: 'row', gap: 7, justifyContent: 'center', marginBottom: 7 },
  pinSlotsCompact: { marginBottom: 3 },
  pinSlot: { alignItems: 'center', borderBottomWidth: 2, height: 34, justifyContent: 'center', width: 42 },
  pinSlotCompact: { height: 29 },
  pinDigit: { fontSize: 24 },
  keyGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center' },
  numberKey: { alignItems: 'center', borderWidth: 1, height: '22%', justifyContent: 'center', minHeight: 34, width: '30%' },
  numberKeyText: { fontSize: 18 },
  roomStepper: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 42 },
  roomIdentity: { alignItems: 'center' },
  roomName: { fontSize: 19, lineHeight: 20 },
  roomMode: { fontSize: 7, letterSpacing: 0.8, textTransform: 'uppercase' },
  iconSpacer: { width: 38 },
  carryOrb: { alignItems: 'center', borderRadius: 80, borderWidth: 2, height: 134, justifyContent: 'center', position: 'relative', width: 134 },
  carryOrbit: { borderRadius: 90, borderWidth: 1, height: 162, position: 'absolute', transform: [{ rotate: '23deg' }], width: 112 },
  lensFrame: { alignItems: 'center', borderWidth: 1, flex: 1, justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  previewLensImage: { opacity: 0.5 },
  lensShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,7,5,0.46)' },
  cameraTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,38,27,0.2)' },
  reticle: { borderWidth: 2, height: 158, left: '50%', marginLeft: -79, marginTop: -79, position: 'absolute', top: '50%', width: 158 },
  reticleHorizontal: { height: 1, left: -19, position: 'absolute', top: 77, width: 194 },
  reticleVertical: { height: 194, left: 77, position: 'absolute', top: -19, width: 1 },
  lensCounter: { left: 12, position: 'absolute', top: 12 },
  lensCounterText: { fontSize: 10, letterSpacing: 1 },
  manualCorner: { bottom: 12, padding: 10, position: 'absolute', right: 12 },
  lensIcon: { alignItems: 'center', borderRadius: 60, borderWidth: 2, height: 112, justifyContent: 'center', width: 112 },
  manualGlyphGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 310 },
  manualGlyph: { alignItems: 'center', borderWidth: 1, height: 72, justifyContent: 'center', width: '29%' },
  markerScene: { alignItems: 'center', flex: 1, gap: 8, justifyContent: 'center' },
  markerTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  markerPager: { flexDirection: 'row', gap: 6 },
  qrPlate: { alignItems: 'center', justifyContent: 'center', padding: 12, position: 'relative' },
  qrGlyph: { alignItems: 'center', height: 36, justifyContent: 'center', position: 'absolute', width: 36 },
  markerInstruction: { fontSize: 25, lineHeight: 28, textAlign: 'center' },
  arrivalDock: { alignItems: 'center', gap: 6, width: '100%' },
  routeScene: { flex: 1, gap: 8, justifyContent: 'space-between', padding: 8 },
  routeSceneCompact: { gap: 4, padding: 4 },
  floorplanImage: { opacity: 0.2 },
  floorplanShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,8,6,0.35)' },
  routeClue: { alignItems: 'center', gap: 6, width: '100%' },
  routeGlyphs: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  routeFlags: { flexDirection: 'row', gap: 5 },
  routeTileStack: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', width: '100%' },
  circuitTile: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 5, height: 68, justifyContent: 'center', maxWidth: 138, minWidth: 96, paddingHorizontal: 8, position: 'relative' },
  circuitTileCompact: { height: 58 },
  sourceNotch: { height: 4, left: -1, position: 'absolute', right: -1, top: -1 },
  sourceLabel: { fontSize: 6, left: 5, letterSpacing: 0.7, position: 'absolute', top: 6 },
  pathStrip: { alignItems: 'center', borderColor: 'transparent', borderWidth: 1, flexDirection: 'row', gap: 4, padding: 4 },
  pathSlot: { alignItems: 'center', borderBottomColor: '#625A4B', borderBottomWidth: 1, flex: 1, height: 29, justifyContent: 'center' },
  pathSlotText: { fontSize: 14 },
  roomChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center' },
  roomChoice: { alignItems: 'center', borderWidth: 1, justifyContent: 'center', minHeight: 48, width: '30%' },
  roomChoiceText: { fontSize: 16 },
  routeActions: { flexDirection: 'row', gap: 7, justifyContent: 'center' },
  finalContacts: { alignItems: 'center', flexDirection: 'row', gap: 18, justifyContent: 'center' },
  finalContactItem: { alignItems: 'center', gap: 4 },
  finalContact: { borderRadius: 20, borderWidth: 2, height: 28, width: 28 },
  finalContactLabel: { fontSize: 8 },
  countdownBeat: { fontSize: 48, letterSpacing: 1.2, lineHeight: 50, textAlign: 'center' },
  flatPhone: { alignItems: 'center', borderWidth: 2, height: 130, justifyContent: 'center', transform: [{ perspective: 600 }, { rotateX: '55deg' }], width: 190 },
  flatPhoneSpeaker: { height: 3, position: 'absolute', top: 8, width: 34 },
  waitOrbit: { alignItems: 'center', height: 116, justifyContent: 'center', position: 'relative', width: 116 },
  waitRing: { borderRadius: 58, borderStyle: 'dashed', borderWidth: 1, height: 116, position: 'absolute', transform: [{ rotate: '13deg' }], width: 116 },
  crewWaitRow: { flexDirection: 'row', gap: 10 },
  waitDot: { borderRadius: 12, borderWidth: 2, height: 20, width: 20 },
  holdDial: { alignItems: 'center', borderWidth: 1, height: 48, justifyContent: 'center', maxWidth: 330, overflow: 'hidden', width: '100%' },
  holdDialPressed: { transform: [{ scale: 0.99 }] },
  holdDialFill: { height: '100%', left: 0, position: 'absolute', top: 0 },
  holdDialLabel: { fontSize: 18, letterSpacing: 0.2 },
  dock: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', height: 54, justifyContent: 'space-between', paddingTop: 8 },
  dockCompact: { height: 46, paddingTop: 4 },
  dockCrew: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  dockNode: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 30, justifyContent: 'center', width: 30 },
  dockNodeText: { fontSize: 10 },
  dockMode: { fontSize: 8, marginLeft: 3, textTransform: 'uppercase' },
  hintButton: { alignItems: 'center', borderRadius: 20, borderWidth: 1, height: 36, justifyContent: 'center', width: 44 },
  hintButtonText: { fontSize: 13 },
  hintSheet: { borderTopWidth: 2, bottom: 0, gap: 15, left: 0, paddingBottom: 24, paddingHorizontal: 20, paddingTop: 16, position: 'absolute', right: 0, zIndex: 20 },
  hintTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  hintText: { fontSize: 28, lineHeight: 31 },
  interruptionBackdrop: { ...StyleSheet.absoluteFillObject, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: 20, zIndex: 30 },
  interruption: { borderWidth: 1, gap: 11, maxWidth: 360, padding: 20, width: '100%' },
  interruptionTitle: { fontSize: 30, lineHeight: 33 },
  primaryButton: { alignItems: 'center', flexDirection: 'row', gap: 8, height: 46, justifyContent: 'center', maxWidth: 330, paddingHorizontal: 18, width: '100%' },
  primaryButtonText: { fontSize: 18 },
  quietButton: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 7, height: 42, justifyContent: 'center', maxWidth: 330, paddingHorizontal: 15 },
  quietButtonText: { fontSize: 16 },
  iconButton: { alignItems: 'center', borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  seal: { alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3 },
  sealText: { fontSize: 8, letterSpacing: 1 },
  pressed: { opacity: 0.62, transform: [{ scale: 0.985 }] },
});

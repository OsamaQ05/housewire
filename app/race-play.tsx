import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInRight } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { ScreenShell } from '@/src/components/ScreenShell';
import type { CircuitRaceSubmission } from '@/src/domain/circuit-race';
import { assessStagePressure } from '@/src/domain/director';
import { CircuitChallenge } from '@/src/features/race/CircuitChallenge';
import { useCircuitRaceRuntime } from '@/src/features/race';
import { HouseLineDock, useHouseLine } from '@/src/features/comms';
import { useHousewireSessionContext } from '@/src/features/session';
import { useAcousticMeter } from '@/src/hooks/use-acoustic-meter';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useCircuitRaceStore } from '@/src/store/use-circuit-race-store';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

const EMBER = '#FF6846';
const MINT = '#5FE0D0';
const GOLD = '#F2C14E';

export default function RacePlayScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const runtime = useCircuitRaceRuntime();
  const session = useHousewireSessionContext();
  const acoustic = useAcousticMeter();
  const { play } = useHousewireSound();
  const mode = useCircuitRaceStore((state) => state.launchMode);
  const clearRace = useCircuitRaceStore((state) => state.clearRace);
  const raceHistory = useCircuitRaceStore((state) => state.history);
  const settings = useHousewireStore((state) => state.settings);
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const [error, setError] = useState<string>();
  const [attempts, setAttempts] = useState(0);
  const [hintCount, setHintCount] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [lineOpen, setLineOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [penaltyUntil, setPenaltyUntil] = useState(0);
  const [penaltyLabel, setPenaltyLabel] = useState<'FALLBACK' | 'GUIDE'>('GUIDE');
  const startedPracticeRef = useRef(false);
  const resultNavigationRef = useRef(false);
  const continuingToResultsRef = useRef(false);
  const delayedProofTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const acousticStopRef = useRef(acoustic.stop);
  acousticStopRef.current = acoustic.stop;
  const view = runtime.view;
  const runtimeSnapshot = runtime.snapshot;
  const startPractice = runtime.startPractice;
  const localTeam = view?.teams.find((team) => team.isLocalTeam);
  const opponent = view?.teams.find((team) => !team.isLocalTeam);
  const stage = localTeam?.finishedAt === undefined ? runtime.course.stages[localTeam?.stageIndex ?? 0] : undefined;
  const accent = view?.localTeamId === 'mint' ? MINT : EMBER;
  const localMembers = view?.participants.filter((participant) => participant.teamId === view.localTeamId) ?? [];
  const breakerFragments = stage?.id === 'breaker-code'
    ? runtime.course.breakerFragments
    : [];
  const penaltyRemaining = Math.max(0, penaltyUntil - (view?.serverNow ?? Date.now()));
  const teamPeerIds = localMembers.map((participant) => participant.nodeId);
  const teamLine = useHouseLine({
    acoustic,
    channelId: view?.operationId,
    clockOffsetMs: session.clockEstimate?.offsetMs,
    enabled: mode === 'live' && view?.phase === 'running' && localTeam?.finishedAt === undefined &&
      Boolean(view?.operationId) && localMembers.length > 1,
    hapticsEnabled: settings.haptics,
    localNodeId: runtime.localNodeId,
    peers: localMembers.map((participant) => ({ id: participant.nodeId, label: participant.label })),
    session,
    trustedPeerIds: teamPeerIds,
  });
  const acousticActive = acoustic.active;
  const stopAcoustic = acoustic.stop;
  const cancelTeamLine = teamLine.cancelTalking;
  const teamLineRecording = teamLine.recording;
  const cancelLineRef = useRef(teamLine.cancelTalking);
  cancelLineRef.current = teamLine.cancelTalking;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void activateKeepAwakeAsync('circuit-race').catch(() => undefined);
    return () => void deactivateKeepAwake('circuit-race');
  }, []);

  useEffect(() => () => {
    if (delayedProofTimerRef.current) clearTimeout(delayedProofTimerRef.current);
    void cancelLineRef.current()
      .catch(() => undefined)
      .finally(() => acousticStopRef.current().catch(() => undefined));
    if (!continuingToResultsRef.current) {
      clearRace();
      prepareSession('preview');
    }
  }, [clearRace, prepareSession]);

  useEffect(() => {
    if (mode !== 'practice' || runtimeSnapshot || startedPracticeRef.current) return;
    // The persistent provider resets after setup changes the seed/session. Start
    // on the next task so that reset cannot erase the newly-created practice race.
    const timer = setTimeout(() => {
      if (runtimeSnapshot || startedPracticeRef.current) return;
      startedPracticeRef.current = true;
      const started = startPractice();
      if (!started.started && started.reason !== 'ALREADY_STARTED') {
        setError('Practice grid could not start. Return and try again.');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [mode, runtimeSnapshot, startPractice]);

  useEffect(() => {
    if (delayedProofTimerRef.current) {
      clearTimeout(delayedProofTimerRef.current);
      delayedProofTimerRef.current = undefined;
    }
    setAttempts(0);
    setHintCount(0);
    setPenaltyUntil(0);
    setPenaltyLabel('GUIDE');
    setSubmitting(false);
    setError(undefined);
  }, [stage?.id]);

  useEffect(() => {
    resultNavigationRef.current = false;
  }, [view?.operationId]);

  useEffect(() => {
    if ((view?.phase !== 'running' || localTeam?.finishedAt !== undefined) && (acousticActive || teamLineRecording)) {
      void cancelTeamLine()
        .catch(() => undefined)
        .finally(() => stopAcoustic().catch(() => undefined));
    }
  }, [acousticActive, cancelTeamLine, localTeam?.finishedAt, stopAcoustic, teamLineRecording, view?.phase]);

  useEffect(() => {
    if (view?.phase !== 'complete' || resultNavigationRef.current) return;
    resultNavigationRef.current = true;
    play('complete', 0.75);
    const timeout = setTimeout(() => {
      continuingToResultsRef.current = true;
      router.replace({ pathname: '/race-results', params: { operationId: view.operationId } });
    }, 850);
    return () => clearTimeout(timeout);
  }, [play, router, view?.operationId, view?.phase]);

  const houseLineEnabled = mode === 'live' && localMembers.length > 1 && view?.phase === 'running' &&
    localTeam?.finishedAt === undefined;
  const guideAssessment = useMemo(() => assessStagePressure({
    attempts,
    history: raceHistory.map((result) => ({
      durationSeconds: Math.max(...result.standings.map((standing) => standing.elapsedMs ?? 0)) / 1_000,
      retries: 0,
    })),
    secondsSinceProgress: stage && view
      ? Math.max(0, view.serverNow - (localTeam?.stageStartedAt ?? view.startsAt)) / 1_000
      : 0,
    sensorAvailable: true,
    stageIndex: stage?.index,
  }), [attempts, localTeam?.stageStartedAt, raceHistory, stage, view]);
  const guideReady = guideAssessment.offerHint;
  const activeGuideBars = hintCount > 0 || guideReady ? 3 : guideAssessment.pressure >= 0.36 ? 2 : 1;

  const abandonRace = () => {
    const leave = () => {
      continuingToResultsRef.current = true;
      clearRace();
      prepareSession('preview');
      router.replace('/modes');
    };
    if (Platform.OS === 'web') {
      if (typeof globalThis.confirm !== 'function' || globalThis.confirm('Leave this race? Your current circuit progress will be lost.')) leave();
      return;
    }
    Alert.alert('Leave Circuit Race?', 'Your current circuit progress on this phone will be lost.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave race', style: 'destructive', onPress: leave },
    ]);
  };

  const submit = (submission: CircuitRaceSubmission): boolean => {
    if (!stage || submitting || penaltyRemaining > 0) return false;
    setSubmitting(true);
    setError(undefined);
    const deliverProof = () => {
      delayedProofTimerRef.current = undefined;
      void runtime.submitStage(submission, hintCount).then((result) => {
        setSubmitting(false);
        if (result.accepted) {
          play('accept', 0.62);
          if (settings.haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        } else {
          setAttempts((current) => current + 1);
          play('warning', 0.45);
          if (settings.haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
          setError(result.reason === 'OFFLINE' || result.reason === 'TIMEOUT'
            ? 'The host did not receive that proof. Reconnect and try once.'
            : result.reason === 'INVALID_PROOF'
              ? 'That does not close this circuit.'
              : 'The start clock rejected that proof.');
        }
      }).catch(() => {
        setSubmitting(false);
        setError('The proof line broke. Reconnect and try once.');
      });
    };
    const inputPenaltyMs = stage.mechanic === 'flat-phone' && 'fallback' in stage.challenge &&
      submission.mechanic === 'flat-phone' && submission.mode === 'manual-hold'
      ? stage.challenge.fallback.penaltyMs
      : 0;
    if (inputPenaltyMs > 0) {
      setPenaltyLabel('FALLBACK');
      setPenaltyUntil((view?.serverNow ?? Date.now()) + inputPenaltyMs);
      delayedProofTimerRef.current = setTimeout(deliverProof, inputPenaltyMs);
    } else {
      deliverProof();
    }
    return true;
  };

  const revealHint = () => {
    if (!stage || !guideReady || hintCount >= stage.hints.length || penaltyRemaining > 0) return;
    const hint = stage.hints[hintCount];
    setHintCount((current) => current + 1);
    setPenaltyLabel('GUIDE');
    setPenaltyUntil((view?.serverNow ?? Date.now()) + hint.penaltyMs);
    if (settings.haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  };

  if (!view || !localTeam) {
    return (
      <ScreenShell texture={false}>
        <View style={styles.loading}>
          <RaceExitButton color={theme.colors.text} onPress={abandonRace} />
          <RacePulse />
          <Text style={[styles.loadingTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>LOCKING START CLOCK</Text>
          <Text style={[styles.loadingBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{mode === 'live' ? 'Waiting for the host race packet…' : 'Building the mirrored circuit…'}</Text>
          {error || runtime.lastError ? <Text style={[styles.loadingError, { color: theme.colors.fault, fontFamily: theme.typography.families.body }]}>{error ?? runtime.lastError}</Text> : null}
          {mode === 'live' ? <Pressable onPress={() => void runtime.requestSnapshot()} style={[styles.reconnectButton, { borderColor: MINT }]}><Text style={[styles.reconnectText, { color: MINT, fontFamily: theme.typography.families.bodyMedium }]}>Ask host to resend</Text></Pressable> : null}
        </View>
      </ScreenShell>
    );
  }

  if (view.phase === 'countdown') {
    const count = Math.max(1, Math.ceil(view.startsInMs / 1_000));
    return (
      <ScreenShell texture={false}>
        <View style={[styles.countdown, { backgroundColor: accent }]}> 
          <RaceExitButton color="#07100E" onPress={abandonRace} />
          <Text style={[styles.countdownKicker, { fontFamily: theme.typography.families.monoMedium }]}>{view.localTeamId.toUpperCase()} CREW · READY</Text>
          <Text style={[styles.countdownNumber, { fontFamily: theme.typography.families.displayHeavy }]}>{count}</Text>
          <Text style={[styles.countdownText, { fontFamily: theme.typography.families.displayHeavy }]}>SAME PUZZLES. SAME SECOND.</Text>
          <Text style={[styles.countdownBody, { fontFamily: theme.typography.families.body }]}>When the trace turns live, move fast—but do not run between rooms.</Text>
        </View>
      </ScreenShell>
    );
  }

  if (localTeam.finishedAt !== undefined) {
    const first = opponent?.finishedAt === undefined || localTeam.finishedAt <= opponent.finishedAt;
    return (
      <ScreenShell texture={false}>
        <View style={styles.finishedWait}>
          <RaceExitButton color={theme.colors.text} onPress={abandonRace} />
          <RacePulse color={accent} />
          <Text style={[styles.finishedKicker, { color: accent, fontFamily: theme.typography.families.monoMedium }]}>{first ? 'YOUR BREAKER LANDED FIRST' : 'BREAKER CLOSED'}</Text>
          <Text style={[styles.finishedTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{view.phase === 'complete' ? 'RACE SEALED.' : 'HOLD THE LINE.'}</Text>
          <Text style={[styles.finishedBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{view.phase === 'complete' ? 'Comparing the host timestamps…' : 'The other crew is still inside its mirrored circuit.'}</Text>
          <RaceRail localStage={4} opponentStage={opponent?.stageIndex ?? 0} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <View style={[styles.topbar, { borderBottomColor: theme.colors.draft }]}> 
        <Pressable accessibilityLabel="Leave Circuit Race" accessibilityRole="button" hitSlop={9} onPress={abandonRace} style={styles.topbarExit}>
          <Ionicons color={theme.colors.muted} name="close" size={22} />
        </Pressable>
        <View style={styles.teamIdentity}>
          <View style={[styles.teamLamp, { backgroundColor: accent }]} />
          <View>
            <Text style={[styles.teamLabel, { color: accent, fontFamily: theme.typography.families.monoMedium }]}>{view.localTeamId.toUpperCase()} CREW</Text>
            <Text style={[styles.timer, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{formatTime(Math.max(0, view.serverNow - view.startsAt))}</Text>
          </View>
        </View>
        <RaceRail localStage={localTeam.stageIndex} opponentStage={opponent?.stageIndex ?? 0} />
      </View>

      <ScrollView contentContainerStyle={[styles.page, houseLineEnabled && styles.pageWithDock]} showsVerticalScrollIndicator={false}>
        {stage ? (
          <Animated.View entering={settings.reducedMotion ? undefined : SlideInRight.duration(320)} key={stage.id} style={styles.stage}>
            <View style={styles.stageHeader}>
              <View>
                <Text style={[styles.stageKicker, { color: accent, fontFamily: theme.typography.families.monoMedium }]}>{stage.kicker}</Text>
                <Text style={[styles.stageTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{stage.title.toUpperCase()}</Text>
              </View>
              <View style={[styles.stageIndex, { borderColor: accent }]}><Text style={[styles.stageIndexText, { color: accent, fontFamily: theme.typography.families.displayHeavy }]}>{stage.index + 1}/4</Text></View>
            </View>
            <Text style={[styles.instruction, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{stage.instruction}</Text>

            <View style={[(penaltyRemaining > 0 || submitting) && styles.blockedChallenge, { pointerEvents: penaltyRemaining > 0 || submitting ? 'none' : 'auto' }]}>
              <CircuitChallenge accent={accent} breakerFragments={breakerFragments} onSubmit={submit} stage={stage} />
            </View>

            {penaltyRemaining > 0 ? (
              <Animated.View entering={FadeIn.duration(180)} style={[styles.penalty, { backgroundColor: GOLD }]}>
                <Ionicons color="#171309" name="hourglass-outline" size={20} />
                <Text style={[styles.penaltyText, { fontFamily: theme.typography.families.displayHeavy }]}>{penaltyLabel} DELAY · {Math.ceil(penaltyRemaining / 1_000)}s</Text>
              </Animated.View>
            ) : null}
            {submitting ? <Text style={[styles.accepting, { color: accent, fontFamily: theme.typography.families.monoMedium }]}>PROOF SENT TO START CLOCK…</Text> : null}
            {error ? <Animated.View entering={FadeInDown.duration(180)} style={[styles.errorBand, { borderColor: theme.colors.fault }]}><Ionicons color={theme.colors.fault} name="warning-outline" size={18} /><Text style={[styles.errorText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{error}</Text></Animated.View> : null}

            <Pressable accessibilityRole="button" onPress={() => setGuideOpen(true)} style={[styles.guideButton, { borderColor: guideReady ? GOLD : theme.colors.draft }]}>
              <View style={styles.guideBars}>{[9, 16, 23].map((height, index) => <View key={height} style={[styles.guideBar, { backgroundColor: index < activeGuideBars ? GOLD : theme.colors.draft, height }]} />)}</View>
              <View style={styles.guideCopy}>
                <Text style={[styles.guideLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>AI GUIDE · LOCAL MODEL</Text>
                <Text style={[styles.guideValue, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{guideReady ? 'A nudge is ready' : hintCount ? `${hintCount} nudge used` : `Pressure ${Math.round(guideAssessment.pressure * 100)}%`}</Text>
              </View>
              <Ionicons color={guideReady ? GOLD : theme.colors.faint} name="chevron-up" size={19} />
            </Pressable>
          </Animated.View>
        ) : null}
      </ScrollView>

      {houseLineEnabled ? <HouseLineDock accent={accent} controller={teamLine} expanded={lineOpen} guideState={guideReady ? 'ready' : attempts ? 'watching' : 'clear'} onExpandedChange={setLineOpen} onGuidePress={() => setGuideOpen(true)} /> : null}

      <Modal animationType="slide" onRequestClose={() => setGuideOpen(false)} transparent visible={guideOpen}>
        <View style={styles.modalBackdrop}>
          <Pressable accessibilityLabel="Close AI Guide" onPress={() => setGuideOpen(false)} style={StyleSheet.absoluteFill} />
          <View style={[styles.guideSheet, { backgroundColor: theme.colors.background, borderColor: GOLD }]}>
            <View style={styles.sheetHeader}><View><Text style={[styles.guideLabel, { color: GOLD, fontFamily: theme.typography.families.monoMedium }]}>ADAPTIVE AI GUIDE</Text><Text style={[styles.sheetTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>ONE NUDGE AT A TIME</Text></View><Pressable onPress={() => setGuideOpen(false)}><Ionicons color={theme.colors.faint} name="close" size={24} /></Pressable></View>
            <Text style={[styles.sheetBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{guideAssessment.summary} The model stays on this phone and never reads your microphone or invents the answer.</Text>
            {stage?.hints.slice(0, hintCount).map((hint, index) => <View key={hint.id} style={[styles.hint, { borderColor: GOLD }]}><Text style={[styles.hintIndex, { color: GOLD, fontFamily: theme.typography.families.displayHeavy }]}>{index + 1}</Text><Text style={[styles.hintText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{hint.text}</Text></View>)}
            {stage && hintCount < stage.hints.length ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: !guideReady || penaltyRemaining > 0 }} disabled={!guideReady || penaltyRemaining > 0} onPress={revealHint} style={[styles.hintButton, { backgroundColor: GOLD }, (!guideReady || penaltyRemaining > 0) && styles.disabled]}><Text style={[styles.hintButtonText, { fontFamily: theme.typography.families.displayHeavy }]}>{guideReady ? `REVEAL NUDGE · +${Math.round(stage.hints[hintCount].penaltyMs / 1_000)}s` : `LOCAL MODEL WATCHING · ${Math.round(guideAssessment.pressure * 100)}%`}</Text></Pressable> : <Text style={[styles.noHints, { color: theme.colors.faint, fontFamily: theme.typography.families.mono }]}>ALL AVAILABLE NUDGES SHOWN</Text>}
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

function RaceRail({ localStage, opponentStage }: { localStage: number; opponentStage: number }) {
  const localProgress = Math.max(0, Math.min(4, localStage));
  const opponentProgress = Math.max(0, Math.min(4, opponentStage));
  const progressLabel = (progress: number) => progress >= 4 ? 'finished' : `stage ${progress + 1} of 4`;
  return (
    <View accessibilityLabel={`Your crew ${progressLabel(localProgress)}; opposing crew ${progressLabel(opponentProgress)}`} accessible style={styles.rail}>
      <View style={styles.railRow}><Text style={styles.railLetter}>Y</Text>{[0,1,2,3].map((step) => <View key={step} style={[styles.railSegment, { backgroundColor: step <= localProgress ? '#F2C14E' : '#353129' }]} />)}</View>
      <View style={styles.railRow}><Text style={styles.railLetter}>R</Text>{[0,1,2,3].map((step) => <View key={step} style={[styles.railSegment, { backgroundColor: step <= opponentProgress ? '#A69F90' : '#353129' }]} />)}</View>
    </View>
  );
}

function RaceExitButton({ color, onPress }: { color: string; onPress(): void }) {
  return (
    <Pressable accessibilityLabel="Leave Circuit Race" accessibilityRole="button" hitSlop={10} onPress={onPress} style={styles.raceExit}>
      <Ionicons color={color} name="close-circle-outline" size={29} />
    </Pressable>
  );
}

function RacePulse({ color = GOLD }: { color?: string }) {
  return <Svg height="74" viewBox="0 0 260 74" width="260"><Path d="M0 37 L44 37 L58 11 L72 64 L90 21 L108 48 L126 37 L161 37 L174 8 L189 67 L207 17 L223 50 L239 37 L260 37" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" /></Svg>;
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1_000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${Math.floor((ms % 1_000) / 100)}`;
}

const styles = StyleSheet.create({
  accepting: { fontSize: 8, letterSpacing: 1.2, textAlign: 'center' },
  blockedChallenge: { opacity: 0.38 },
  countdown: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  countdownBody: { color: '#1F2A27', fontSize: 14, lineHeight: 20, marginTop: 12, maxWidth: 330, textAlign: 'center' },
  countdownKicker: { color: '#17302B', fontSize: 9, letterSpacing: 1.7 },
  countdownNumber: { color: '#07100E', fontSize: 170, lineHeight: 170 },
  countdownText: { color: '#07100E', fontSize: 25, letterSpacing: 0.4 },
  disabled: { opacity: 0.36 },
  errorBand: { alignItems: 'center', borderLeftWidth: 3, flexDirection: 'row', gap: 8, padding: 10 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17 },
  finishedBody: { fontSize: 15, lineHeight: 21, maxWidth: 330, textAlign: 'center' },
  finishedKicker: { fontSize: 8, letterSpacing: 1.5 },
  finishedTitle: { fontSize: 52, lineHeight: 50, textAlign: 'center' },
  finishedWait: { alignItems: 'center', flex: 1, gap: 9, justifyContent: 'center', paddingHorizontal: 24 },
  guideBar: { width: 3 },
  guideBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 2, height: 24 },
  guideButton: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 58, paddingHorizontal: 12 },
  guideCopy: { flex: 1, gap: 2 },
  guideLabel: { fontSize: 7, letterSpacing: 1.1 },
  guideSheet: { borderTopWidth: 4, gap: 14, paddingBottom: 34, paddingHorizontal: 20, paddingTop: 20 },
  guideValue: { fontSize: 13 },
  hint: { alignItems: 'center', borderLeftWidth: 3, flexDirection: 'row', gap: 11, padding: 11 },
  hintButton: { alignItems: 'center', justifyContent: 'center', minHeight: 58 },
  hintButtonText: { color: '#171309', fontSize: 17, letterSpacing: 0.3 },
  hintIndex: { fontSize: 25 },
  hintText: { flex: 1, fontSize: 14, lineHeight: 19 },
  instruction: { fontSize: 15, lineHeight: 21 },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  loadingBody: { fontSize: 14, marginTop: 6 },
  loadingError: { fontSize: 12, marginTop: 12, textAlign: 'center' },
  loadingTitle: { fontSize: 32, letterSpacing: 0.3 },
  modalBackdrop: { backgroundColor: 'rgba(0,0,0,0.72)', flex: 1, justifyContent: 'flex-end' },
  noHints: { fontSize: 8, letterSpacing: 1, paddingVertical: 12, textAlign: 'center' },
  page: { flexGrow: 1, paddingBottom: 35, paddingHorizontal: 20, paddingTop: 20 },
  pageWithDock: { paddingBottom: 116 },
  penalty: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 47, marginTop: 13 },
  penaltyText: { color: '#171309', fontSize: 17 },
  rail: { gap: 5, minWidth: 118 },
  railLetter: { color: '#8C8373', fontSize: 8, width: 10 },
  railRow: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  railSegment: { borderRadius: 2, flex: 1, height: 5 },
  raceExit: { position: 'absolute', right: 18, top: 18, zIndex: 4 },
  reconnectButton: { borderWidth: 1, marginTop: 16, paddingHorizontal: 18, paddingVertical: 11 },
  reconnectText: { fontSize: 14 },
  sheetBody: { fontSize: 13, lineHeight: 18 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 28, lineHeight: 29 },
  stage: { gap: 15 },
  stageHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  stageIndex: { alignItems: 'center', borderWidth: 1, height: 43, justifyContent: 'center', width: 48 },
  stageIndexText: { fontSize: 20 },
  stageKicker: { fontSize: 8, letterSpacing: 1.3 },
  stageTitle: { fontSize: 38, lineHeight: 38 },
  teamIdentity: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  teamLabel: { fontSize: 7, letterSpacing: 1.1 },
  teamLamp: { borderRadius: 6, height: 11, width: 11 },
  timer: { fontSize: 22, lineHeight: 22 },
  topbar: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 72, paddingHorizontal: 20 },
  topbarExit: { alignItems: 'center', height: 38, justifyContent: 'center', width: 32 },
});

import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ScreenShell } from '@/src/components';
import {
  compileEscapeCase,
  escapeCaseSeedFromCode,
  type EscapeCaseId,
} from '@/src/domain/escape-case-compiler';
import { GuideChat, guideMechanicFor, escapeGuideContext } from '@/src/features/director';
import { AnswerReview } from '@/src/components/AnswerReview';
import { escapeAttemptLimit } from '@/src/domain/attempt-rules';
import { escapeAnswerReview } from '@/src/domain/escape-answer-review';
import { PuzzleAttemptProvider } from './RiddleSeal';
import { HouseLineDock, useHouseLine } from '@/src/features/comms';
import {
  escapeStageRequiresEveryNode,
  useEscapeCaseCoordinator,
  useHousewireSessionContext,
} from '@/src/features/session';
import { useAcousticMeter, type WhisperPayload } from '@/src/hooks/use-acoustic-meter';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useTerminalMotion } from '@/src/hooks/use-terminal-motion';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useFamilyClubStore } from '@/src/store/use-family-club-store';
import { useHousewireTheme } from '@/src/theme';
import { formatClock } from '@/src/utils/format';

import { ActionButton, StagePanel, TechnicalLabel } from './CaseMissionPrimitives';
import { DeadAirStageView, type PrivateWordDelivery } from './DeadAirStages';
import { LongTableStageView } from './LongTableStages';
import { NightGlassStageView } from './NightGlassStages';

const CASE_META = {
  'dead-air': {
    accent: '#C8F26A',
    minutes: 18,
    stageNames: ['Three ducts', 'Service plates', 'Service pair', 'Echo matrix', 'Countertone'],
  },
  'night-glass': {
    accent: '#9AE9F5',
    minutes: 18,
    stageNames: ['Threshold', 'Parallax doors', 'Floorplan', 'Corridor', 'Final fold'],
  },
  'long-table': {
    accent: '#E4A84A',
    minutes: 22,
    stageNames: ['Take your places', 'Stolen photograph', 'What the house kept', 'Service pass', 'Last bell'],
  },
} as const;


interface WhisperDirectPayload {
  kind: 'housewire.whisper.v1';
  missionId: 'dead-air';
  operationId: string;
  round: number;
  mode: 'authored' | 'recorded';
  codeword?: string;
  audio?: WhisperPayload;
  sentAt: number;
  ttlMs: 10_000;
}

export function EscapeCaseMission({ missionId }: { missionId: EscapeCaseId }) {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const meta = CASE_META[missionId];
  const { play } = useHousewireSound();
  const acoustic = useAcousticMeter();
  const motion = useTerminalMotion();
  const session = useHousewireSessionContext();
  const consumeDirect = session.consumeDirect;
  const directFeed = session.directFeed;
  const coordinator = useEscapeCaseCoordinator(missionId);
  const playback = useAudioPlayer(null);
  const sessionMode = useHousewireStore((state) => state.sessionMode);
  const sessionCode = useHousewireStore((state) => state.sessionCode);
  const localNodeId = useHousewireStore((state) => state.localNodeId);
  const crew = useHousewireStore((state) => state.crew);
  const rooms = useHousewireStore((state) => state.rooms);
  const settings = useHousewireStore((state) => state.settings);
  const relayUrl = useHousewireStore((state) => state.relayUrl);
  const missionStartedAt = useHousewireStore((state) => state.missionStartedAt);
  const persistedStageIndex = useHousewireStore((state) => state.missionStageIndex);
  const persistedRetries = useHousewireStore((state) => state.missionRetries);
  const updateMissionProgress = useHousewireStore((state) => state.updateMissionProgress);
  const completeMission = useHousewireStore((state) => state.completeMission);
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const shared = sessionMode === 'lan';
  const nodeIds = useMemo(() => {
    const source = shared && coordinator.liveNodeIds?.length
      ? coordinator.liveNodeIds
      : crew.filter((node) => node.connected).map((node) => node.id);
    const stable = [...new Set(source)].sort((left, right) => left.localeCompare(right)).slice(0, 4);
    return stable.length >= 2 ? stable : [stable[0] ?? localNodeId, 'sim-backup'];
  }, [coordinator.liveNodeIds, crew, localNodeId, shared]);
  const game = useMemo(() => {
    if (coordinator.game) return coordinator.game;
    return compileEscapeCase(
      missionId,
      escapeCaseSeedFromCode(`${missionId}:${sessionCode ?? 'BLACKLINE'}`),
      nodeIds,
    );
  }, [coordinator.game, missionId, nodeIds, sessionCode]);
  const [previewStage, setPreviewStage] = useState(Math.max(0, Math.min(4, persistedStageIndex)));
  const [previewProofs, setPreviewProofs] = useState<string[]>([]);
  const previewProofsRef = useRef<string[]>([]);
  const pendingAdvanceRef = useRef(false);
  const stageIndex = shared ? coordinator.stageIndex ?? 0 : previewStage;
  const [activeNodeId, setActiveNodeId] = useState(localNodeId);
  const [secondsLeft, setSecondsLeft] = useState(meta.minutes * 60);
  const [paused, setPaused] = useState(false);
  const overtimeAccepted = false;
  const [guideOpen, setGuideOpen] = useState(false);
  const [lineOpen, setLineOpen] = useState(false);
  const [privateDeliveries, setPrivateDeliveries] = useState<PrivateWordDelivery[]>([]);
  const [retries, setRetries] = useState(persistedRetries);
  const retriesRef = useRef(persistedRetries);
  const limit = escapeAttemptLimit(missionId);
  const attemptsUsed = shared ? coordinator.mistakes ?? 0 : retries;
  const failed = shared ? coordinator.failedAt !== undefined : retries >= limit || secondsLeft === 0;
  const failureRef = useRef(failed);
  failureRef.current = failed;
  const [error, setError] = useState<string>();
  const [endingRun, setEndingRun] = useState(false);
  const completedRef = useRef(false);
  const startedAtRef = useRef(coordinator.startedAt ?? missionStartedAt ?? Date.now());
  const handledWhispersRef = useRef(new Set<string>());
  const eventLogRef = useRef<string[]>([]);
  const previewDeadlineRef = useRef(startedAtRef.current + meta.minutes * 60_000);
  const stageEnteredAtRef = useRef(Date.now());
  const pausedAtRef = useRef<number | undefined>(undefined);
  const houseLinePeers = useMemo(() => session.peers.map((peer) => ({
    id: peer.id,
    label: peer.label,
    roomLabel: rooms.find((room) => crew.find((node) => node.id === peer.id)?.roomId === room.id)?.label,
  })), [crew, rooms, session.peers]);
  const houseLine = useHouseLine({
    acoustic,
    channelId: coordinator.operationId,
    clockOffsetMs: coordinator.clockOffsetMs,
    enabled: shared && !failed && coordinator.finishedAt === undefined && coordinator.abortedAt === undefined,
    hapticsEnabled: settings.haptics,
    localNodeId,
    peers: houseLinePeers,
    session,
    trustedPeerIds: coordinator.liveNodeIds ?? nodeIds,
  });

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void activateKeepAwakeAsync(`${missionId}-mission`).catch(() => undefined);
    return () => void deactivateKeepAwake(`${missionId}-mission`);
  }, [missionId]);

  useEffect(() => {
    if (!shared) updateMissionProgress(previewStage, retries);
  }, [previewStage, retries, shared, updateMissionProgress]);

  useEffect(() => {
    if (coordinator.startedAt !== undefined) startedAtRef.current = coordinator.startedAt;
  }, [coordinator.startedAt]);

  useEffect(() => {
    if (paused) return;
    const tick = () => {
      const now = shared ? Date.now() + coordinator.clockOffsetMs : Date.now();
      const deadline = shared
        ? startedAtRef.current + meta.minutes * 60_000
        : previewDeadlineRef.current;
      setSecondsLeft(Math.max(0, Math.ceil((deadline - now) / 1_000)));
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [coordinator.clockOffsetMs, meta.minutes, paused, shared]);

  useEffect(() => {
    setGuideOpen(false);
    setError(undefined);
    if (!shared) { setPreviewProofs([]); previewProofsRef.current = []; pendingAdvanceRef.current = false; }
    stageEnteredAtRef.current = Date.now();
    // Browsers reject effect-driven audio before the first direct gesture.
    // Native devices do not have that restriction; web still plays every
    // button-triggered cue without leaving a rejected autoplay promise.
    if (Platform.OS !== 'web') play('relay', 0.36);
  }, [play, shared, stageIndex]);



  useEffect(() => {
    if (!failed) return;
    const ended = coordinator.failedAt ?? Date.now();
    useFamilyClubStore.getState().record({
      id: `escape-failed:${missionId}:${coordinator.operationId ?? startedAtRef.current}`, mode: 'escape', title: `${caseName(missionId)} · Not escaped`,
      playedAt: new Date(ended).toISOString(), durationSeconds: Math.max(0, (ended - startedAtRef.current) / 1000),
      retries: attemptsUsed, caseId: missionId, practice: !shared, source: 'authored',
      participants: crew.filter(p => !p.simulated).map(p => ({ name: p.name, won: false })),
    });
  }, [attemptsUsed, coordinator.failedAt, coordinator.operationId, crew, failed, missionId, shared]);

  const onMiss = useCallback(() => {
    if (failureRef.current) return;
    if (shared) void coordinator.reportMistake();
    else { const next = Math.min(limit, retriesRef.current + 1); retriesRef.current = next; if (next >= limit) failureRef.current = true; setRetries(next); updateMissionProgress(stageIndex, next); }
  }, [coordinator, limit, shared, stageIndex, updateMissionProgress]);

  const finish = useCallback(() => {
    if (!shared && Date.now() >= previewDeadlineRef.current) { failureRef.current = true; setSecondsLeft(0); return; }
    if (completedRef.current || failureRef.current) return;
    completedRef.current = true;
    play('complete', 0.88);
    if (settings.haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    completeMission({
      completedAt: new Date().toISOString(),
      durationSeconds: Math.max(1, Math.round(((shared ? Date.now() + coordinator.clockOffsetMs : Date.now()) - startedAtRef.current) / 1_000)),
      events: [...eventLogRef.current, closingEvent(missionId)],
      missionId,
      retries: attemptsUsed,
      routeSeed: game.effectiveSeed,
    });
    router.replace('/debrief');
  }, [attemptsUsed, completeMission, coordinator.clockOffsetMs, game.effectiveSeed, missionId, play, router, settings.haptics, shared]);

  useEffect(() => {
    if (shared && coordinator.finishedAt !== undefined) finish();
  }, [coordinator.finishedAt, finish, shared]);

  const completedProofKeys = useMemo(() => {
    if (!shared) return previewProofs;
    return [...new Set((coordinator.completions ?? []).flatMap((completion) => [
      completion.proofKey,
      `${completion.proofKey}:${completion.nodeId}`,
    ]))];
  }, [coordinator.completions, previewProofs, shared]);

  const onProof = useCallback(async (proofKey: string) => {
    if (!shared && Date.now() >= previewDeadlineRef.current) { failureRef.current = true; setSecondsLeft(0); return false; }
    if (failureRef.current || pendingAdvanceRef.current) return false;
    setError(undefined);
    if (shared) {
      const accepted = await coordinator.submitProof(proofKey);
      if (!accepted) {
        setError('This instrument cannot submit that proof yet. Check the active role and connection.');
        return false;
      }
      eventLogRef.current.push(`${meta.stageNames[stageIndex]} accepted ${proofKey}.`);
      play('accept', 0.48);
      return true;
    }

    const stage = game.stages[stageIndex];
    const synchronized = escapeStageRequiresEveryNode(game, stageIndex);
    const storedProofKey = synchronized ? `${proofKey}:${activeNodeId}` : proofKey;
    if (previewProofsRef.current.includes(storedProofKey)) return true;
    const next = [...previewProofsRef.current, storedProofKey];
    previewProofsRef.current = next;
    setPreviewProofs(next);
    eventLogRef.current.push(`${meta.stageNames[stageIndex]} accepted ${proofKey}.`);
    play('accept', 0.48);
    const complete = synchronized
      ? stage.requiredNodeIds.every((nodeId) => next.includes(`${proofKey}:${nodeId}`))
      : stage.expectedProofKeys.every((key) => next.includes(key));
    if (complete) {
      pendingAdvanceRef.current = true;
      if (stageIndex >= game.stages.length - 1) finish();
      else setTimeout(() => { if (!failureRef.current) setPreviewStage((current) => current === stageIndex ? Math.min(4, stageIndex + 1) : current); }, 320);
    }
    return true;
  }, [activeNodeId, coordinator, finish, game, meta.stageNames, play, shared, stageIndex]);

  const onSignal = useCallback(async (input: Parameters<typeof coordinator.publishSignal>[0]) => coordinator.publishSignal(input), [coordinator]);

  const isWhisperPayload = useCallback((value: unknown): value is WhisperDirectPayload => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<WhisperDirectPayload>;
    return candidate.kind === 'housewire.whisper.v1' &&
      candidate.missionId === 'dead-air' &&
      candidate.operationId === coordinator.operationId &&
      typeof candidate.round === 'number' &&
      (candidate.mode === 'authored' || candidate.mode === 'recorded') &&
      typeof candidate.sentAt === 'number' &&
      candidate.ttlMs === 10_000;
  }, [coordinator.operationId]);

  useEffect(() => {
    for (const item of directFeed) {
      if (
        item.recipientId !== localNodeId ||
        handledWhispersRef.current.has(item.messageId) ||
        !isWhisperPayload(item.payload)
      ) continue;
      const whisper = item.payload;
      handledWhispersRef.current.add(item.messageId);
      if (item.serverTime - whisper.sentAt > whisper.ttlMs) {
        consumeDirect(item.messageId);
        continue;
      }
      setPrivateDeliveries((current) => [
        ...current.filter((delivery) => delivery.round !== whisper.round),
        {
          codeword: whisper.mode === 'authored' ? whisper.codeword : undefined,
          mode: whisper.mode,
          round: whisper.round,
        },
      ]);
      if (whisper.mode !== 'recorded' || !whisper.audio) {
        consumeDirect(item.messageId);
        continue;
      }
      const payload = whisper.audio;
      const playRecorded = async () => {
        if (Platform.OS === 'web') {
          playback.replace({ uri: `data:${payload.mimeType};base64,${payload.base64}` });
          playback.play();
          setTimeout(() => playback.replace(null), Math.max(4_000, payload.durationMs + 1_500));
          return;
        }
        const extension = payload.mimeType === 'audio/mp4' ? 'm4a' : payload.mimeType === 'audio/webm' ? 'webm' : 'ogg';
        const uri = `${FileSystem.cacheDirectory}housewire-${item.messageId}.${extension}`;
        await FileSystem.writeAsStringAsync(uri, payload.base64, { encoding: FileSystem.EncodingType.Base64 });
        playback.replace({ uri });
        playback.play();
        setTimeout(() => void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined), Math.max(5_000, payload.durationMs + 2_500));
      };
      void playRecorded()
        .catch(() => setError('The private word arrived, but this phone could not play its audio. Use the authored voice fallback.'))
        .finally(() => consumeDirect(item.messageId));
    }
  }, [consumeDirect, directFeed, isWhisperPayload, localNodeId, playback]);

  const onPrivateWord = useCallback(async ({ codeword, recipientNodeId, round, recorded }: { codeword: string; recipientNodeId: string; round: number; recorded: boolean }) => {
    if (!coordinator.operationId || session.connectionState !== 'connected') return false;
    let audio: WhisperPayload | undefined;
    if (recorded) {
      const armed = await acoustic.start(6);
      if (!armed) return false;
      await new Promise<void>((resolve) => setTimeout(resolve, 6_050));
      audio = await acoustic.finishWhisper();
      if (!audio) return false;
    }
    if (failureRef.current) return false;
    const payload: WhisperDirectPayload = {
      kind: 'housewire.whisper.v1',
      missionId: 'dead-air',
      operationId: coordinator.operationId,
      round,
      mode: recorded ? 'recorded' : 'authored',
      codeword: recorded ? undefined : codeword,
      audio,
      sentAt: Date.now() + coordinator.clockOffsetMs,
      ttlMs: 10_000,
    };
    try {
      await session.publishDirect(recipientNodeId, payload);
      return true;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The private word could not be delivered.');
      return false;
    }
  }, [acoustic, coordinator.clockOffsetMs, coordinator.operationId, session]);

  const leaveLocally = useCallback(() => {
    void acoustic.stop();
    prepareSession('preview');
    router.replace('/home');
  }, [acoustic, prepareSession, router]);

  const endRunForHouse = useCallback(async () => {
    if (!shared || !coordinator.isHost) {
      leaveLocally();
      return;
    }
    if (endingRun) return;
    if (session.connectionState !== 'connected') {
      setPaused(false);
      setError('Reconnect before ending the run for every phone. You can still leave only this phone.');
      return;
    }
    setEndingRun(true);
    const ended = await coordinator.abortOperation();
    if (ended) {
      leaveLocally();
      return;
    }
    setEndingRun(false);
    setPaused(false);
    setError('The relay did not accept the end command. Reconnect and try again so every phone receives it.');
  }, [coordinator, endingRun, leaveLocally, session.connectionState, shared]);

  useEffect(() => {
    if (!shared || coordinator.abortedAt === undefined || endingRun) return;
    leaveLocally();
  }, [coordinator.abortedAt, endingRun, leaveLocally, shared]);

  const pause = () => {
    pausedAtRef.current = Date.now();
    setPaused(true);
  };

  const resume = () => {
    if (!shared && pausedAtRef.current !== undefined) {
      previewDeadlineRef.current += Date.now() - pausedAtRef.current;
      stageEnteredAtRef.current += Date.now() - pausedAtRef.current;
    }
    pausedAtRef.current = undefined;
    setPaused(false);
  };

  if (shared && !coordinator.game) {
    return (
      <ScreenShell edgeWire="none">
        <View style={styles.recovery}>
          <Ionicons color={meta.accent} name="radio-outline" size={42} />
          <Text style={[styles.recoveryTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>Rejoining the case…</Text>
          <Text style={[styles.recoveryCopy, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{coordinator.coordinationGuidance ?? 'The host is sending the latest authoritative stage. Solved clues will not reset. If it does not arrive, confirm the host is still in the room.'}</Text>
          <ActionButton accent={meta.accent} icon="refresh" label="Reconnect now" onPress={session.reconnect} secondary />
          <ActionButton accent={meta.accent} icon="exit-outline" label={coordinator.isHost ? 'Return home' : 'Leave this phone'} onPress={leaveLocally} secondary />
        </View>
      </ScreenShell>
    );
  }

  if (failed) return <ScreenShell edgeWire="none"><ScrollView contentContainerStyle={{ gap: 22, paddingBottom: 40 }}><TechnicalLabel color={theme.colors.fault}>{attemptsUsed >= limit ? 'No tries left' : 'Time is up'}</TechnicalLabel><Text style={[styles.pauseTitle, { color: theme.colors.text }]}>{caseName(missionId)} ended</Text><Text style={{ color: theme.colors.muted }}>{Math.max(0, limit - attemptsUsed)} tries remaining · This run is not counted as an escape.</Text><AnswerReview items={escapeAnswerReview(game, stageIndex)} /><ActionButton accent={meta.accent} icon="home-outline" label="Back to games" onPress={leaveLocally} /></ScrollView></ScreenShell>;

  return (
    <PuzzleAttemptProvider onMistake={onMiss}>
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <View style={styles.screen}>
        <View style={[styles.header, { borderColor: theme.colors.draft }]}>
          <View style={styles.headerTopline}>
            <Pressable accessibilityLabel="Pause case" accessibilityRole="button" hitSlop={8} onPress={pause}>
              <Ionicons color={theme.colors.text} name="pause" size={22} />
            </Pressable>
            <View style={styles.caseIdentity}>
              <View style={[styles.liveDot, { backgroundColor: meta.accent }]} />
              <Text style={[styles.caseName, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{caseName(missionId)}</Text>
            </View>
            <Text style={[styles.clock, { color: secondsLeft < 120 ? theme.colors.fault : theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{secondsLeft === 0 && overtimeAccepted ? 'OVERTIME' : formatClock(secondsLeft)}</Text>
          </View>
          <View style={styles.progressRail}>{meta.stageNames.map((name, index) => <View key={name} style={[styles.progressSegment, { backgroundColor: index < stageIndex ? theme.colors.ready : index === stageIndex ? meta.accent : theme.colors.draft }]} />)}</View>
          <View style={styles.stageMeta}>
            <TechnicalLabel color={meta.accent}>Part {stageIndex + 1} of 5 · {Math.max(0, limit - attemptsUsed)} tries left</TechnicalLabel>
            <Pressable accessibilityRole="button" onPress={() => setGuideOpen((current) => !current)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: meta.accent, fontFamily: theme.typography.families.bodyMedium }}>Ask the guide</Text></Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={[styles.content, shared && styles.contentWithDock]} showsVerticalScrollIndicator={false}>
          {shared && coordinator.coordinationGuidance ? (
            <StagePanel tone={session.connectionState === 'connected' ? theme.colors.warning : theme.colors.fault}>
              <TechnicalLabel color={session.connectionState === 'connected' ? theme.colors.warning : theme.colors.fault}>
                {session.connectionState === 'connected' ? 'REQUIRED PHONE OFFLINE' : 'HOUSE LINK INTERRUPTED'}
              </TechnicalLabel>
              <Text style={[styles.recoveryCopy, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{coordinator.coordinationGuidance}</Text>
              {session.connectionState !== 'connected' ? (
                <ActionButton accent={meta.accent} icon="refresh" label="Reconnect now" onPress={session.reconnect} secondary />
              ) : null}
              {session.connectionState === 'connected' && coordinator.isHost ? (
                <ActionButton accent={meta.accent} disabled={endingRun} icon="exit-outline" label={endingRun ? 'Ending for everyone…' : 'End this run'} onPress={() => void endRunForHouse()} secondary />
              ) : null}
              {!coordinator.isHost || session.connectionState !== 'connected' ? (
                <ActionButton accent={meta.accent} icon="exit-outline" label="Leave only this phone" onPress={leaveLocally} secondary />
              ) : null}
            </StagePanel>
          ) : null}
          {(!shared || session.connectionState === 'connected') && missionId === 'dead-air' && game.id === 'dead-air' ? (
            <DeadAirStageView
              acoustic={acoustic}
              activeNodeId={activeNodeId}
              completedProofKeys={completedProofKeys}
              crew={crew.filter((node) => nodeIds.includes(node.id))}
              directReady={!shared || session.connectionState === 'connected'}
              game={game}
              inbox={privateDeliveries}
              motion={motion}
              onChangeNode={setActiveNodeId}
              onMiss={onMiss}
              onPrivateWord={onPrivateWord}
              onProof={onProof}
              onSignal={onSignal}
              onStartMotion={() => void motion.start()}
              play={play}
              preview={!shared}
              signals={coordinator.signals}
              stageIndex={stageIndex}
            />
          ) : null}
          {(!shared || session.connectionState === 'connected') && missionId === 'night-glass' && game.id === 'night-glass' ? (
            <NightGlassStageView
              activeNodeId={activeNodeId}
              completedProofKeys={completedProofKeys}
              crew={crew.filter((node) => nodeIds.includes(node.id))}
              game={game}
              motion={motion}
              onChangeNode={setActiveNodeId}
              onMiss={onMiss}
              onProof={onProof}
              onSignal={onSignal}
              onStartMotion={() => void motion.start()}
              play={play}
              preview={!shared}
              signals={coordinator.signals}
              stageIndex={stageIndex}
            />
          ) : null}
          {(!shared || session.connectionState === 'connected') && missionId === 'long-table' && game.id === 'long-table' ? (
            <LongTableStageView
              acoustic={acoustic}
              activeNodeId={activeNodeId}
              completedProofKeys={completedProofKeys}
              crew={crew.filter((node) => nodeIds.includes(node.id))}
              game={game}
              motion={motion}
              onChangeNode={setActiveNodeId}
              onMiss={onMiss}
              onProof={onProof}
              onSignal={onSignal}
              onStartMotion={() => void motion.start()}
              play={play}
              preview={!shared}
              signals={coordinator.signals}
              stageIndex={stageIndex}
            />
          ) : null}

            <GuideChat
              context={escapeGuideContext(game, stageIndex, activeNodeId, completedProofKeys)}
              hideLauncher open={guideOpen} onOpenChange={setGuideOpen}
              accent={meta.accent}
              runId={`${missionId}:${coordinator.operationId ?? startedAtRef.current}`}
              stageId={String(stageIndex)}
              roleLabel={activeNodeId}
              mechanic={guideMechanicFor(stageIndex === 0 && missionId === 'night-glass' ? 'split-riddle' : game.stages[stageIndex]?.proofKind ?? 'deduction')}
              relayUrl={relayUrl ?? undefined}
            />
          {error ? <View style={[styles.error, { borderColor: theme.colors.fault }]}><TechnicalLabel color={theme.colors.fault}>Something went wrong</TechnicalLabel><Text style={[styles.errorText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{error}</Text></View> : null}
          {shared ? <View style={styles.liveStatus}><View style={[styles.connectionDot, { backgroundColor: session.connectionState === 'connected' ? theme.colors.ready : theme.colors.fault }]} /><Text style={[styles.liveStatusText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{session.connectionState === 'connected' ? `${coordinator.liveNodeIds?.length ?? nodeIds.length} phones connected` : 'Trying to reconnect'}</Text></View> : <TechnicalLabel color={theme.colors.warning}>One-phone preview · switch players above each puzzle</TechnicalLabel>}
        </ScrollView>

        {shared && !paused && (secondsLeft > 0 || overtimeAccepted) ? (
          <HouseLineDock
            accent={meta.accent}
            controller={houseLine}
            expanded={lineOpen}
            guideState={guideOpen ? 'ready' : 'clear'}
            onExpandedChange={setLineOpen}
            onGuidePress={() => setGuideOpen(true)}
          />
        ) : null}

        {paused ? (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.pauseBackdrop}>
            <StagePanel tone={meta.accent}>
              <TechnicalLabel color={meta.accent}>Case paused</TechnicalLabel>
              <Text style={[styles.pauseTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>Keep the house safe.</Text>
              <Text style={[styles.pauseCopy, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{shared && coordinator.isHost ? 'Stop moving before looking at the screen. Ending the run here closes it on every connected phone.' : shared ? 'Stop moving before looking at the screen. Leaving closes the case only on this phone; the host run continues.' : 'Stop moving before looking at the screen. Live phones retain the same authoritative stage.'}</Text>
              <ActionButton accent={meta.accent} icon="play" label="Resume" onPress={resume} />
              <ActionButton accent={meta.accent} disabled={endingRun} icon="exit-outline" label={shared && coordinator.isHost ? endingRun ? 'Ending for everyone…' : 'End this run' : shared ? 'Leave this phone' : 'End this run'} onPress={() => void endRunForHouse()} secondary />
            </StagePanel>
          </Animated.View>
        ) : null}

        {secondsLeft === 0 && !overtimeAccepted && !paused ? (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.pauseBackdrop}>
            <StagePanel tone={theme.colors.fault}>
              <TechnicalLabel color={theme.colors.fault}>Time is up</TechnicalLabel>
              <Text style={[styles.pauseTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>The case has ended.</Text>
              <Text style={[styles.pauseCopy, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Answers open after the host confirms the result.</Text>
              <Text style={[styles.pauseCopy, { color: theme.colors.muted }]}>Waiting for the host to confirm the end of the case…</Text>
              <ActionButton accent={meta.accent} disabled={endingRun} icon="exit-outline" label={shared && coordinator.isHost ? endingRun ? 'Ending for everyone…' : 'End this run' : shared ? 'Leave this phone' : 'End this run'} onPress={() => void endRunForHouse()} secondary />
            </StagePanel>
          </Animated.View>
        ) : null}
      </View>
    </ScreenShell>
    </PuzzleAttemptProvider>
  );
}

function caseName(missionId: EscapeCaseId): string {
  if (missionId === 'dead-air') return 'Dead Air';
  if (missionId === 'night-glass') return 'Night Glass';
  return 'The Long Table';
}

function closingEvent(missionId: EscapeCaseId): string {
  if (missionId === 'dead-air') return 'The Quiet Machine went silent.';
  if (missionId === 'night-glass') return 'The Red Corridor folded shut.';
  return 'Every place was served before the last bell.';
}

const styles = StyleSheet.create({
  caseIdentity: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  caseName: { fontSize: 20 },
  clock: { fontSize: 13, letterSpacing: 0.6 },
  connectionDot: { borderRadius: 5, height: 7, width: 7 },
  content: { gap: 18, paddingBottom: 48, paddingHorizontal: 18, paddingTop: 18 },
  contentWithDock: { paddingBottom: 126 },
  error: { borderLeftWidth: 3, gap: 4, paddingLeft: 11, paddingVertical: 4 },
  errorText: { fontSize: 13, lineHeight: 18 },
  header: { borderBottomWidth: 1, gap: 10, paddingBottom: 11, paddingHorizontal: 18, paddingTop: 10 },
  headerTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  liveDot: { borderRadius: 5, height: 8, width: 8 },
  liveStatus: { alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'center', paddingTop: 6 },
  liveStatusText: { fontSize: 12, lineHeight: 16 },
  pauseBackdrop: { backgroundColor: 'rgba(0,0,0,0.86)', bottom: 0, justifyContent: 'center', left: 0, padding: 20, position: 'absolute', right: 0, top: 0, zIndex: 10 },
  pauseCopy: { fontSize: 14, lineHeight: 20 },
  pauseTitle: { fontSize: 38, lineHeight: 38 },
  progressRail: { flexDirection: 'row', gap: 4 },
  progressSegment: { borderRadius: 4, flex: 1, height: 4 },
  recovery: { flex: 1, gap: 16, justifyContent: 'center' },
  recoveryCopy: { fontSize: 15, lineHeight: 21 },
  recoveryTitle: { fontSize: 43, lineHeight: 43 },
  screen: { flex: 1 },
  stageMeta: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
});

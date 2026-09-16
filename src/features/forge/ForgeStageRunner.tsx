import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {
  ForgeClue,
  ForgeCluePayload,
  ForgePlayerStage,
  ForgeRole,
  ForgeStage,
  ForgeStageSubmission,
  ForgeSubmissionResult,
} from '@/src/domain/case-forge/types';
import { QrMarker, QrScanner } from '@/src/features/cases/CaseMissionPrimitives';
import { PuzzleAttemptProvider, RiddleSeal } from '@/src/features/cases/RiddleSeal';
import { attemptCooldownSeconds, routeLandmark } from '@/src/domain/case-forge/route-landmarks';
import { useHousewireTheme } from '@/src/theme';
import { useMusicSilence } from '@/src/features/music/HousewireMusic';

import { forgeColors } from './ForgePrimitives';
import { RouteMap } from './RouteMap';

interface ForgeSyncProof {
  at: number;
  evidenceMode: 'sensor' | 'manual';
}

interface ForgeStageRunnerProps {
  activePlayerId: string;
  liveMode?: boolean;
  onChangePlayer: (playerId: string) => void;
  onSubmit: (submission: ForgeStageSubmission) => ForgeSubmissionResult | Promise<ForgeSubmissionResult>;
  roles: readonly ForgeRole[];
  stage: ForgeStage | ForgePlayerStage;
}

export function ForgeStageRunner({
  activePlayerId,
  liveMode = false,
  onChangePlayer,
  onSubmit,
  roles,
  stage,
}: ForgeStageRunnerProps) {
  const { theme } = useHousewireTheme();
  const [lastResult, setLastResult] = useState<ForgeSubmissionResult | null>(null);
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);
  const [riddleAnswer, setRiddleAnswer] = useState('');
  const [symbolCode, setSymbolCode] = useState<string[]>([]);
  const [relayTokens, setRelayTokens] = useState<Record<number, string>>({});
  const [route, setRoute] = useState<number[]>([]);
  const [syncStartedAt, setSyncStartedAt] = useState<number | null>(null);
  const [syncProofs, setSyncProofs] = useState<Record<string, ForgeSyncProof>>({});
  const [submitting, setSubmitting] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const wrongAttempts = useRef(0);
  const [spentAudioClueIds, setSpentAudioClueIds] = useState<string[]>([]);
  const stageIdRef = useRef(stage.id);
  stageIdRef.current = stage.id;
  const routeStartCell = stage.mechanic.kind === 'route-grid' ? stage.mechanic.startCell : 0;

  useEffect(() => {
    setLastResult(null);
    setSelectedTokens([]);
    setRiddleAnswer('');
    setSymbolCode([]);
    setRelayTokens({});
    setRoute(routeStartCell ? [routeStartCell] : []);
    setSyncStartedAt(null);
    setSyncProofs({});
    setSubmitting(false);
    setRetryAfter(0);
    setCooldown(0);
    wrongAttempts.current = 0;
    setSpentAudioClueIds([]);
    void Speech.stop();
  }, [routeStartCell, stage.id]);

  useEffect(() => {
    if (!retryAfter) return;
    const tick = () => setCooldown(Math.max(0, Math.ceil((retryAfter - Date.now()) / 1_000)));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [retryAfter]);

  useEffect(() => () => {
    void Speech.stop();
  }, []);

  const activeRole = roles.find((role) => role.playerId === activePlayerId) ?? roles[0];
  const clues = stage.clues.filter((clue) => clue.audiencePlayerIds.includes(activePlayerId));
  if (!liveMode && stage.mechanic.kind === 'symbol-lock' && stage.mechanic.revealMode === 'camera') {
    clues.push(...onePhoneScannerClues(stage.clues, activePlayerId));
  }
  const canSubmit = stage.submitterPlayerIds.includes(activePlayerId);

  const submit = async (submission: ForgeStageSubmission) => {
    if (submitting || Date.now() < retryAfter) return;
    const submittedStageId = stage.id;
    setSubmitting(true);
    try {
      const result = await onSubmit(submission);
      if (stageIdRef.current === submittedStageId) {
        setLastResult(result);
        if (result.code === 'WRONG_VALUE') {
          wrongAttempts.current += 1;
          setRetryAfter(Date.now() + attemptCooldownSeconds(wrongAttempts.current) * 1_000);
        }
      }
    } finally {
      if (stageIdRef.current === submittedStageId) setSubmitting(false);
    }
  };

  return (
    <PuzzleAttemptProvider onMistake={() => {
      if (stage.mechanic.kind !== 'motion-sync') return;
      const assignments = liveMode ? stage.mechanic.assignments.filter((item) => item.playerId === activePlayerId) : stage.mechanic.assignments;
      // Legacy word seals share the run's authority and budget instead of local infinite retries.
      void onSubmit({ kind: 'sync', startedAt: 0, completedAt: 0, proofs: assignments.map((assignment) => ({
        ...assignment,
        vocalCue: assignment.playerId === activePlayerId ? (assignment.vocalCue === 'NONE' ? 'LOW_HUM' : 'NONE') : assignment.vocalCue,
        evidenceMode: 'manual',
      })) });
    }}>
    <View style={styles.stagePage}>
      <View style={styles.storyBlock}>
        <Text style={[styles.scene, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>SCENE {String(stage.index + 1).padStart(2, '0')} · {stage.durationMinutes} MIN</Text>
        <Text style={[styles.stageTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{stage.title}</Text>
        <Text style={[styles.storyBeat, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{stage.mechanic.kind === 'motion-sync' ? 'The final contacts are locked behind words. Each role must solve a seal, then the crew opens the exit together.' : stage.storyBeat}</Text>
        <View style={[styles.directive, { borderColor: forgeColors.ink }]}>
          <Ionicons color={forgeColors.ink} name="navigate-outline" size={18} />
          <Text style={[styles.directiveText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{stage.mechanic.kind === 'motion-sync' ? 'Read your riddle to the others. Find the word, then count down and unlock together. No pressure hold is needed.' : stage.instruction}</Text>
        </View>
      </View>

      <View style={styles.channelBlock}>
        <View style={styles.channelTopline}>
          <Text style={[styles.sectionLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{liveMode ? 'YOUR PRIVATE ROLE CHANNEL' : 'PRIVATE ROLE CHANNEL'}</Text>
          <Text style={[styles.passLabel, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>{liveMode ? 'ONE ROLE · ONE PHONE' : 'PASS THE PHONE'}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.roleRail} horizontal showsHorizontalScrollIndicator={false}>
          {roles.map((role) => {
            const selected = role.playerId === activePlayerId;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                disabled={liveMode}
                key={role.id}
                onPress={() => onChangePlayer(role.playerId)}
                style={({ pressed }) => [styles.roleTab, { backgroundColor: selected ? role.accent : 'transparent', borderColor: selected ? role.accent : theme.colors.draft }, pressed && styles.pressed]}
              >
                <Text style={[styles.roleName, { color: selected ? forgeColors.dark : theme.colors.text, fontFamily: theme.typography.families.display }]}>{role.playerName}</Text>
                <Text style={[styles.roleTitle, { color: selected ? '#403A1A' : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{role.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={[styles.roleBrief, { borderColor: activeRole?.accent ?? forgeColors.ink }]}>
          <Ionicons color={activeRole?.accent ?? forgeColors.ink} name="lock-closed" size={16} />
          <Text style={[styles.roleBriefText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{activeRole?.brief}</Text>
        </View>
      </View>

      {stage.mechanic.kind !== 'motion-sync' ? <View style={styles.cluesBlock}>
        <Text style={[styles.sectionLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>ONLY {activeRole?.playerName.toUpperCase()} CAN SEE</Text>
        {clues.length ? clues.map((clue) => (
          <ForgeCluePanel
            audioSpent={spentAudioClueIds.includes(clue.id)}
            clue={clue}
            key={clue.id}
            liveMode={liveMode}
            onSpendAudio={() => setSpentAudioClueIds((current) => current.includes(clue.id) ? current : [...current, clue.id])}
            routeWidth={stage.mechanic.kind === 'route-grid' ? stage.mechanic.width : undefined}
          />
        )) : (
          <View style={[styles.noClue, { borderColor: theme.colors.draft }]}>
            <Ionicons color={theme.colors.faint} name="eye-off-outline" size={24} />
            <Text style={[styles.noClueText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>This role has no fragment in this scene. Listen to the others.</Text>
          </View>
        )}
      </View> : null}

      <View style={[styles.workbench, { borderColor: canSubmit ? forgeColors.ink : theme.colors.draft }]}>
        <View style={styles.workbenchTopline}>
          <Text style={[styles.sectionLabel, { color: canSubmit ? forgeColors.ink : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>ASSEMBLY TABLE</Text>
          <Text style={[styles.submitter, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{canSubmit ? 'YOUR CONTROL' : 'SUBMITTER ONLY'}</Text>
        </View>
        {canSubmit ? (
          <MechanicWorkbench
            activePlayerId={activePlayerId}
            onRouteChange={(value) => {
              setLastResult(null);
              setRoute(value);
            }}
            onSequenceChange={(value) => {
              setLastResult(null);
              setSelectedTokens(value);
            }}
            onRiddleChange={(value) => {
              setLastResult(null);
              setRiddleAnswer(value);
            }}
            onSymbolChange={(value) => {
              setLastResult(null);
              setSymbolCode(value);
            }}
            onRelayChange={(value) => {
              setLastResult(null);
              setRelayTokens(value);
            }}
            onSyncProof={(playerId, evidenceMode) => {
              const now = Date.now();
              setLastResult(null);
              setSyncStartedAt((value) => value ?? now);
              setSyncProofs((value) => ({ ...value, [playerId]: { at: now, evidenceMode } }));
            }}
            relayTokens={relayTokens}
            riddleAnswer={riddleAnswer}
            route={route}
            roles={roles}
            selectedTokens={selectedTokens}
            stage={stage}
            symbolCode={symbolCode}
            syncProofs={syncProofs}
            liveMode={liveMode}
          />
        ) : (
          <Text style={[styles.handoffCopy, { color: theme.colors.muted, fontFamily: theme.typography.families.storyBold }]}>Tell your fragment to {roleNames(stage.submitterPlayerIds, roles)}—their channel owns the controls.</Text>
        )}

        {canSubmit ? (
          <Pressable
            accessibilityRole="button"
            disabled={submitting || cooldown > 0 || !workbenchReady(stage, selectedTokens, riddleAnswer, symbolCode, route, relayTokens, syncProofs, activePlayerId, liveMode)}
            onPress={() => {
              switch (stage.mechanic.kind) {
                case 'distributed-order':
                  void submit({ kind: 'sequence', value: selectedTokens });
                  break;
                case 'split-riddle':
                  void submit({ kind: 'word', value: riddleAnswer });
                  break;
                case 'symbol-lock':
                  void submit({ kind: 'code', value: symbolCode.join('') });
                  break;
                case 'private-relay':
                  void submit({
                    kind: 'relay',
                    rounds: stage.mechanic.rounds
                      .filter((round) => !liveMode || round.recipientPlayerId === activePlayerId)
                      .map((round) => ({
                      recipientPlayerId: round.recipientPlayerId,
                      round: round.round,
                      token: relayTokens[round.round]?.trim() ?? '',
                      })),
                  });
                  break;
                case 'route-grid':
                  void submit({ kind: 'route', value: route });
                  break;
                case 'motion-sync': {
                  const completedAt = Math.max(Date.now(), ...Object.values(syncProofs).map((proof) => proof.at));
                  void submit({
                    completedAt,
                    kind: 'sync',
                    proofs: stage.mechanic.assignments
                      .filter((assignment) => Boolean(syncProofs[assignment.playerId]))
                      .map((assignment) => ({
                        ...assignment,
                        evidenceMode: syncProofs[assignment.playerId].evidenceMode,
                      })),
                    startedAt: syncStartedAt ?? completedAt,
                  });
                  break;
                }
              }
            }}
            style={({ pressed }) => [styles.commitButton, { backgroundColor: forgeColors.ink, opacity: cooldown > 0 || !workbenchReady(stage, selectedTokens, riddleAnswer, symbolCode, route, relayTokens, syncProofs, activePlayerId, liveMode) ? 0.45 : 1 }, pressed && styles.pressed]}
          >
            <Text style={[styles.commitText, { color: forgeColors.dark, fontFamily: theme.typography.families.bodyMedium }]}>{submitting ? 'Checking…' : cooldown > 0 ? `Compare clues · ${cooldown}s` : stage.mechanic.kind === 'route-grid' ? 'Try this route' : stage.mechanic.kind === 'split-riddle' ? 'Lock our answer' : 'Try our solution'}</Text>
            <Ionicons color={forgeColors.dark} name={submitting ? 'radio-outline' : 'key-outline'} size={20} />
          </Pressable>
        ) : null}

        {lastResult ? (
          <SubmissionFeedback
            result={lastResult}
            waitingForCrew={
              liveMode &&
              lastResult.code === 'INCOMPLETE' &&
              (stage.mechanic.kind === 'private-relay' || stage.mechanic.kind === 'motion-sync')
            }
          />
        ) : null}
      </View>

    </View>
    </PuzzleAttemptProvider>
  );
}

function ForgeCluePanel({
  audioSpent,
  clue,
  liveMode,
  onSpendAudio,
  routeWidth,
}: {
  audioSpent: boolean;
  clue: ForgeClue;
  liveMode: boolean;
  onSpendAudio: () => void;
  routeWidth?: 3 | 4;
}) {
  const { theme } = useHousewireTheme();
  const [revealed, setRevealed] = useState(clue.payload.kind !== 'audio-token');
  const [speaking, setSpeaking] = useState(false);
  useMusicSilence(speaking);
  const [audioFailed, setAudioFailed] = useState(false);

  useEffect(() => {
    setRevealed(clue.payload.kind !== 'audio-token');
    setSpeaking(false);
    setAudioFailed(false);
    return () => {
      if (clue.payload.kind === 'audio-token') void Speech.stop();
    };
  }, [clue.id, clue.payload.kind]);

  const playPrivateToken = () => {
    const payload = clue.payload;
    if (payload.kind !== 'audio-token' || audioSpent) return;
    onSpendAudio();
    setSpeaking(true);
    setAudioFailed(false);
    void Speech.stop().then(() => {
      Speech.speak(payload.spokenText, {
        language: 'en-US',
        pitch: 0.72,
        rate: 0.72,
        onDone: () => setSpeaking(false),
        onError: () => {
          setSpeaking(false);
          setAudioFailed(true);
          setRevealed(true);
        },
        onStopped: () => setSpeaking(false),
      });
    }).catch(() => {
      setSpeaking(false);
      setAudioFailed(true);
      setRevealed(true);
    });
  };

  return (
    <View style={[styles.cluePanel, { borderColor: clue.private ? forgeColors.orange : theme.colors.draft }]}>
      <View style={styles.clueTopline}>
        <Text style={[styles.clueTitle, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{clue.title}</Text>
        {clue.private ? <Ionicons color={forgeColors.orange} name="ear-outline" size={17} /> : null}
      </View>
      {clue.payload.kind === 'audio-token' && !revealed ? (
        <View style={styles.audioClue}>
          <Pressable accessibilityHint="Speaks the private token once using this phone" accessibilityRole="button" disabled={audioSpent} onPress={playPrivateToken} style={({ pressed }) => [styles.listenButton, { borderColor: audioSpent ? theme.colors.draft : forgeColors.orange, opacity: audioSpent ? 0.55 : 1 }, pressed && styles.pressed]}>
            <Ionicons color={audioSpent ? theme.colors.faint : forgeColors.orange} name={speaking ? 'volume-high' : audioSpent ? 'lock-closed' : 'volume-high'} size={24} />
            <Text style={[styles.listenText, { color: audioSpent ? theme.colors.faint : forgeColors.orange, fontFamily: theme.typography.families.monoMedium }]}>{speaking ? 'BURST PLAYING' : audioSpent ? 'BURST SPENT' : 'PLAY ONCE IN PRIVATE'}</Text>
          </Pressable>
          <Pressable accessibilityLabel="Reveal private token as text" accessibilityRole="button" onPress={() => setRevealed(true)}>
            <Text style={[styles.fallbackLink, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Can&apos;t hear it? Reveal the text fallback</Text>
          </Pressable>
        </View>
      ) : <><CluePayloadView liveMode={liveMode} payload={clue.payload} routeWidth={routeWidth} />{audioFailed ? <Text accessibilityLiveRegion="polite" style={[styles.fallbackLink, { color: theme.colors.warning, fontFamily: theme.typography.families.body }]}>Audio failed, so the text fallback opened automatically.</Text> : null}</>}
    </View>
  );
}

function onePhoneScannerClues(allClues: readonly ForgeClue[], playerId: string): ForgeClue[] {
  const scanners: ForgeClue[] = [];
  for (const marker of allClues) {
    if (marker.payload.kind !== 'camera-marker') continue;
    const suffix = marker.id.match(/marker-([1-9][0-9]*)$/)?.[1];
    const decoder = suffix ? allClues.find((clue) => clue.id === `decoder-${suffix}`) : undefined;
    if (!decoder?.audiencePlayerIds.includes(playerId)) continue;
    scanners.push({
      id: `scanner-${suffix}`,
      title: `Lens target ${suffix}`,
      audiencePlayerIds: [playerId],
      private: true,
      payload: {
        kind: 'camera-scanner',
        markerToken: marker.payload.markerToken,
        symbol: marker.payload.symbol,
      },
    });
  }
  return scanners;
}

function CluePayloadView({ liveMode, payload, routeWidth }: { liveMode: boolean; payload: ForgeCluePayload; routeWidth?: 3 | 4 }) {
  const { theme } = useHousewireTheme();
  switch (payload.kind) {
    case 'text':
      return <Text selectable style={[styles.clueHero, { color: forgeColors.ink, fontFamily: theme.typography.families.storyBold }]}>{routeWidth ? payload.text.replace(/cell (\d+)/gi, (_match, cell: string) => routeLandmark(Number(cell)).label) : payload.text}</Text>;
    case 'riddle-fragment':
      return (
        <View style={[styles.riddleClue, { borderColor: forgeColors.ink }]}>
          <Text style={[styles.riddleQuote, { color: forgeColors.ink, fontFamily: theme.typography.families.storyBold }]}>“{payload.text}”</Text>
          <Text style={[styles.riddleWitness, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>READ ALOUD · DO NOT SHOW YOUR SCREEN</Text>
        </View>
      );
    case 'sequence':
      return <View style={styles.payloadRow}>{payload.items.map((item, index) => <PayloadChip key={`${item}-${index}`} text={`${index + 1} · ${item}`} />)}</View>;
    case 'mapping':
      return <View style={styles.mapping}>{payload.pairs.map((pair, index) => <View key={`${pair.left}-${index}`} style={styles.mappingRow}><PayloadChip text={pair.left} /><Ionicons color={theme.colors.faint} name="arrow-forward" size={16} /><PayloadChip text={pair.right} /></View>)}</View>;
    case 'grid-edges':
      return <RouteMap edges={payload.edges} width={routeWidth ?? 4} />;
    case 'audio-token':
      return <Text selectable style={[styles.clueHero, { color: forgeColors.orange, fontFamily: theme.typography.families.storyBold }]}>{payload.fallbackText}</Text>;
    case 'camera-marker':
      return <CameraMarkerPayload liveMode={liveMode} markerToken={payload.markerToken} />;
    case 'camera-display':
      return <CameraMarkerPayload liveMode markerToken={payload.markerToken} />;
    case 'camera-scanner':
      return <CameraScannerPayload markerToken={payload.markerToken} symbol={payload.symbol} />;
    case 'pose':
      return <View style={styles.pose}><Ionicons color={forgeColors.ink} name="phone-portrait-outline" size={32} /><Text style={[styles.poseText, { color: forgeColors.ink, fontFamily: theme.typography.families.display }]}>{poseLabel(payload.pose)}</Text><Text style={[styles.poseHold, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{(payload.holdMs / 1000).toFixed(1)} SEC HOLD</Text></View>;
  }
}

function CameraMarkerPayload({ liveMode, markerToken }: { liveMode: boolean; markerToken: string }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.markerCard}>
      <QrMarker accent={forgeColors.ink} label={liveMode ? 'SHOW TO THE DECODER' : 'PASS THIS SEAL'} token={markerToken} />
      <Text style={[styles.markerInstruction, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{liveMode ? 'Hold this seal up. The matching decoder scans it on their own phone; the encoded symbol is not stored in this role file.' : 'Let the next role scan this plate. On one phone, remember or read aloud the five-character seal, then switch roles and enter it in their lens.'}</Text>
    </View>
  );
}

function CameraScannerPayload({ markerToken, symbol }: { markerToken: string; symbol: string }) {
  const { theme } = useHousewireTheme();
  const [decoded, setDecoded] = useState(false);
  if (decoded) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.markerDecoded}>
        <View style={[styles.markerFrame, { borderColor: forgeColors.ink }]}><Text style={[styles.markerSymbol, { color: forgeColors.ink }]}>{symbol}</Text></View>
        <View style={styles.markerDecodedCopy}><Text style={[styles.markerDecodedLabel, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>OTHER PHONE VERIFIED</Text><Text style={[styles.markerDecodedText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Use your private decoder strip for this symbol.</Text></View>
      </View>
    );
  }
  return <QrScanner accent={forgeColors.ink} expectedToken={markerToken} onScanned={() => setDecoded(true)} />;
}

function MechanicWorkbench({
  activePlayerId,
  onRelayChange,
  onRiddleChange,
  onRouteChange,
  onSequenceChange,
  onSymbolChange,
  onSyncProof,
  relayTokens,
  riddleAnswer,
  roles,
  route,
  selectedTokens,
  stage,
  symbolCode,
  syncProofs,
  liveMode,
}: {
  activePlayerId: string;
  onRelayChange: (value: Record<number, string>) => void;
  onRiddleChange: (value: string) => void;
  onRouteChange: (value: number[]) => void;
  onSequenceChange: (value: string[]) => void;
  onSymbolChange: (value: string[]) => void;
  onSyncProof: (playerId: string, evidenceMode: ForgeSyncProof['evidenceMode']) => void;
  relayTokens: Record<number, string>;
  riddleAnswer: string;
  roles: readonly ForgeRole[];
  route: number[];
  selectedTokens: string[];
  stage: ForgeStage | ForgePlayerStage;
  symbolCode: string[];
  syncProofs: Record<string, ForgeSyncProof>;
  liveMode: boolean;
}) {
  const { theme } = useHousewireTheme();
  const mechanic = stage.mechanic;

  switch (mechanic.kind) {
    case 'distributed-order': {
      const available = mechanic.tokens.filter((token) => !selectedTokens.includes(token.id));
      return (
        <View style={styles.assembly}>
          <Text style={[styles.assemblyInstruction, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Tap the fragments in the order your crew deduced.</Text>
          <View style={[styles.sequenceTray, { borderColor: theme.colors.draft }]}>
            {selectedTokens.length ? selectedTokens.map((id, index) => {
              const token = mechanic.tokens.find((item) => item.id === id);
              return <View key={id} style={[styles.sequenceSlot, { borderColor: forgeColors.ink }]}><Text style={[styles.sequenceNumber, { color: forgeColors.ink }]}>{index + 1}</Text><Text style={[styles.sequenceToken, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{token?.label ?? id}</Text></View>;
            }) : <Text style={[styles.emptyTray, { color: theme.colors.faint, fontFamily: theme.typography.families.mono }]}>EMPTY CIRCUIT</Text>}
          </View>
          <View style={styles.tokenPool}>{available.map((token) => <SmallControl key={token.id} label={token.label} onPress={() => onSequenceChange([...selectedTokens, token.id])} />)}</View>
          {selectedTokens.length ? <SmallControl icon="arrow-undo" label="Undo last" onPress={() => onSequenceChange(selectedTokens.slice(0, -1))} /> : null}
        </View>
      );
    }
    case 'split-riddle':
      return (
        <View style={styles.assembly}>
          <View style={styles.riddleLockHeader}>
            <View style={[styles.riddleKeyhole, { borderColor: riddleAnswer ? forgeColors.ink : theme.colors.draft }]}>
              <Ionicons color={riddleAnswer ? forgeColors.ink : theme.colors.faint} name={riddleAnswer ? 'lock-open' : 'lock-closed'} size={22} />
            </View>
            <View style={styles.riddleLockCopy}>
              <Text style={[styles.assemblyInstruction, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Read your witness lines to each other. Name the one object that fits every line.</Text>
              <Text style={[styles.riddleCount, { color: forgeColors.orange, fontFamily: theme.typography.families.monoMedium }]}>{mechanic.fragmentCount} FRAGMENTS · ONE ANSWER</Text>
            </View>
          </View>
          <TextInput accessibilityLabel="Our riddle answer" autoCorrect={false} autoCapitalize="none" maxLength={48} onChangeText={onRiddleChange} placeholder="What could it be?" placeholderTextColor={theme.colors.faint} value={riddleAnswer} style={[styles.riddleInput, { color: theme.colors.text, borderColor: forgeColors.ink, fontFamily: theme.typography.families.bodyMedium }]} />
          <Text style={[styles.assemblyInstruction, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Objects found here — a word bank, not an answer key:</Text>
          <View style={styles.riddleCandidateGrid}>
            {mechanic.candidates.map((candidate) => {
              const selected = candidate.id === riddleAnswer;
              return (
                <View
                  key={candidate.id}
                  style={[
                    styles.riddleCandidate,
                    {
                      backgroundColor: selected ? forgeColors.ink : 'transparent',
                      borderColor: selected ? forgeColors.ink : theme.colors.draft,
                    },
                  ]}
                >
                  <Text style={[styles.riddleSigil, { color: selected ? forgeColors.dark : forgeColors.ink, fontFamily: theme.typography.families.displayHeavy }]}>{candidate.sigil}</Text>
                  <Text style={[styles.riddleCandidateLabel, { color: selected ? forgeColors.dark : theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{candidate.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      );
    case 'symbol-lock':
      return (
        <View style={styles.assembly}>
          <Text style={[styles.assemblyInstruction, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Build the decoded symbol key. The camera marker and mapping fragments belong together.</Text>
          <View style={[styles.codeDisplay, { borderColor: forgeColors.ink }]}><Text style={[styles.codeText, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>{symbolCode.join('') || '— — — —'}</Text></View>
          <View style={styles.symbolPad}>{['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => <Pressable accessibilityLabel={`Enter ${digit}`} accessibilityRole="button" key={digit} onPress={() => onSymbolChange([...symbolCode, digit].slice(0, mechanic.encodedSequence.length))} style={({ pressed }) => [styles.symbolKey, { borderColor: theme.colors.draft }, pressed && styles.pressed]}><Text style={[styles.symbolKeyText, { color: theme.colors.text }]}>{digit}</Text></Pressable>)}</View>
          {symbolCode.length ? <SmallControl icon="backspace-outline" label="Delete" onPress={() => onSymbolChange(symbolCode.slice(0, -1))} /> : null}
        </View>
      );
    case 'private-relay': {
      const visibleRounds = mechanic.rounds.filter((round) => round.recipientPlayerId === activePlayerId);
      return (
        <View style={styles.assembly}>
          <Text style={[styles.assemblyInstruction, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{liveMode ? 'Enter only the gate word delivered to you. The host combines every receiver’s sealed answer.' : 'Recipients enter only what reached them. The excluded role should never see the token.'}</Text>
          {visibleRounds.map((round) => (
            <View key={round.round} style={styles.relayInputRow}>
              <View style={styles.relayRound}><Text style={[styles.relayRoundText, { color: forgeColors.orange, fontFamily: theme.typography.families.displayHeavy }]}>{round.round}</Text></View>
              <View style={styles.relayCopy}><Text style={[styles.relayRecipient, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{roleNames([round.recipientPlayerId], roles)}</Text><Text style={[styles.relayGate, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{round.gate}</Text></View>
              <TextInput
                accessibilityLabel={`Token received by ${roleNames([round.recipientPlayerId], roles)}`}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={20}
                onChangeText={(text) => onRelayChange({ ...relayTokens, [round.round]: text })}
                placeholder="TOKEN"
                placeholderTextColor={theme.colors.faint}
                style={[styles.relayInput, { borderColor: theme.colors.draft, color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}
                value={relayTokens[round.round] ?? ''}
              />
            </View>
          ))}
          {visibleRounds.length === 0 ? <Text style={[styles.handoffCopy, { color: theme.colors.muted, fontFamily: theme.typography.families.storyBold }]}>You are a sender in this scene. Deliver your private word; the receiver owns its sealed input.</Text> : null}
        </View>
      );
    }
    case 'route-grid': {
      return (
        <View style={styles.assembly}>
          <Text style={[styles.assemblyInstruction, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Start at {routeLandmark(mechanic.startCell).label}. Reach {routeLandmark(mechanic.exitCell).label}. Ask everyone which doorways they see, then tap neighboring landmarks to draw your route. A glowing circle is reachable, not necessarily safe.</Text>
          <RouteMap width={mechanic.width} route={route} startCell={mechanic.startCell} exitCell={mechanic.exitCell} onRouteChange={onRouteChange} />
          {route.length > 1 ? <SmallControl icon="arrow-undo" label="Undo last step" onPress={() => onRouteChange(route.slice(0, -1))} /> : null}
        </View>
      );
    }
    case 'motion-sync': {
      const assignment = mechanic.assignments.find((item) => item.playerId === activePlayerId);
      return (
        <View style={styles.assembly}>
          <Text style={[styles.assemblyInstruction, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>This saved case now uses word seals instead of pressure holds. Solve each role’s riddle, then unlock together.</Text>
          {syncProofs[activePlayerId] ? <Text style={[styles.assemblyInstruction, { color: forgeColors.ink, fontFamily: theme.typography.families.bodyMedium }]}>Your seal is ready. Submit it when the crew is ready.</Text> : assignment ? <RiddleSeal accent={forgeColors.ink} puzzleKey={`${stage.id}:${activePlayerId}:${assignment.pose}`} waitForCrew onComplete={() => onSyncProof(activePlayerId, 'manual')} /> : null}
        </View>
      );
    }
  }
}


function SubmissionFeedback({
  result,
  waitingForCrew,
}: {
  result: ForgeSubmissionResult;
  waitingForCrew: boolean;
}) {
  const { theme } = useHousewireTheme();
  const message = waitingForCrew
    ? `Your proof is sealed${typeof result.expectedLength === 'number' ? ` · ${result.acceptedPrefixLength ?? 0}/${result.expectedLength}` : ''}. Waiting for the other role phones.`
    : result.accepted
    ? 'Mechanism accepted. The next scene is unlocked.'
    : result.code === 'INCOMPLETE'
      ? 'Finish the whole arrangement before trying the lock.'
      : result.code === 'TIMING_WINDOW'
        ? 'The roles armed too far apart. Reset and move faster.'
        : 'The mechanism rejected that arrangement. Re-check every private fragment.';
  return (
    <View accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: waitingForCrew ? forgeColors.ink : result.accepted ? theme.colors.ready : theme.colors.fault }]}>
      <Ionicons color={waitingForCrew ? forgeColors.dark : theme.colors.textInverse} name={waitingForCrew ? 'radio-outline' : result.accepted ? 'checkmark-circle' : 'close-circle'} size={19} />
      <Text style={[styles.feedbackText, { color: waitingForCrew ? forgeColors.dark : theme.colors.textInverse, fontFamily: theme.typography.families.bodyMedium }]}>{message}</Text>
    </View>
  );
}

function PayloadChip({ text }: { text: string }) {
  const { theme } = useHousewireTheme();
  return <View style={[styles.payloadChip, { borderColor: theme.colors.draft }]}><Text selectable style={[styles.payloadChipText, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{text}</Text></View>;
}

function SmallControl({ icon, label, onPress }: { icon?: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { theme } = useHousewireTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.smallControl, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>{icon ? <Ionicons color={forgeColors.ink} name={icon} size={16} /> : null}<Text style={[styles.smallControlText, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{label}</Text></Pressable>;
}

function workbenchReady(stage: ForgeStage | ForgePlayerStage, sequence: readonly string[], word: string, code: readonly string[], route: readonly number[], relay: Record<number, string>, proofs: Record<string, ForgeSyncProof>, playerId: string, live: boolean): boolean {
  const mechanic = stage.mechanic;
  switch (mechanic.kind) {
    case 'distributed-order': return sequence.length === mechanic.tokens.length;
    case 'split-riddle': return word.trim().length > 1;
    case 'symbol-lock': return code.length === mechanic.encodedSequence.length;
    case 'route-grid': return route.length > 1 && route.at(-1) === mechanic.exitCell;
    case 'private-relay': return mechanic.rounds.filter((round) => !live || round.recipientPlayerId === playerId).every((round) => !!relay[round.round]?.trim());
    case 'motion-sync': return mechanic.assignments.filter((assignment) => !live || assignment.playerId === playerId).every((assignment) => !!proofs[assignment.playerId]);
  }
}

function poseLabel(pose: string): string {
  return pose.replaceAll('_', ' ');
}

function roleNames(playerIds: readonly string[], roles: readonly ForgeRole[]): string {
  return playerIds.map((id) => roles.find((role) => role.playerId === id)?.playerName ?? id).join(' + ');
}

const styles = StyleSheet.create({
  assembly: { gap: 11 },
  assemblyInstruction: { fontSize: 13, lineHeight: 18 },
  audioClue: { alignItems: 'center', gap: 10, paddingVertical: 12 },
  channelBlock: { gap: 9 },
  channelTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  clueHero: { fontSize: 26, lineHeight: 30, paddingVertical: 8 },
  cluePanel: { borderLeftWidth: 3, borderTopWidth: 1, gap: 9, minHeight: 94, padding: 13 },
  clueTitle: { fontSize: 20, lineHeight: 22, textTransform: 'uppercase' },
  cluesBlock: { gap: 9 },
  clueTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  codeDisplay: { alignItems: 'center', borderWidth: 1, justifyContent: 'center', minHeight: 64 },
  codeText: { fontSize: 27, letterSpacing: 5 },
  commitButton: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 55, paddingHorizontal: 15 },
  commitText: { fontSize: 17 },
  directive: { alignItems: 'center', borderLeftWidth: 3, flexDirection: 'row', gap: 10, paddingLeft: 11, paddingVertical: 7 },
  directiveText: { flex: 1, fontSize: 14, lineHeight: 20 },
  emptyTray: { fontSize: 9, letterSpacing: 1.5 },
  fallbackLink: { fontSize: 11, textDecorationLine: 'underline' },
  feedback: { alignItems: 'center', flexDirection: 'row', gap: 8, padding: 11 },
  feedbackText: { flex: 1, fontSize: 13, lineHeight: 17 },
  gridBoard: { alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  gridCell: { alignItems: 'center', aspectRatio: 1, borderWidth: 1, justifyContent: 'center' },
  gridCellText: { fontSize: 11 },
  gridVisit: { fontSize: 7, position: 'absolute', right: 4, top: 3 },
  handoffCopy: { fontSize: 19, lineHeight: 24, paddingVertical: 7 },
  hintButton: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 45, paddingHorizontal: 13 },
  hintButtonText: { fontSize: 9, letterSpacing: 1 },
  hintCopy: { flex: 1, gap: 5 },
  hints: { alignItems: 'flex-start', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 13 },
  hintText: { fontSize: 12, lineHeight: 17 },
  listenButton: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 52, paddingHorizontal: 17 },
  listenText: { fontSize: 9, letterSpacing: 1.1 },
  manualFallbackTitle: { fontSize: 19, lineHeight: 20, textTransform: 'uppercase' },
  mapping: { gap: 7 },
  mappingRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  markerCard: { gap: 10 },
  markerDecoded: { alignItems: 'center', flexDirection: 'row', gap: 13 },
  markerDecodedCopy: { flex: 1, gap: 4 },
  markerDecodedLabel: { fontSize: 8, letterSpacing: 1.1 },
  markerDecodedText: { fontSize: 11, lineHeight: 16 },
  markerInstruction: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
  markerScanner: { gap: 9 },
  markerFrame: { alignItems: 'center', borderWidth: 2, height: 58, justifyContent: 'center', width: 58 },
  markerSymbol: { fontSize: 30 },
  markerToken: { flex: 1, fontSize: 11, letterSpacing: 0.6 },
  noClue: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 70, paddingHorizontal: 13 },
  noClueText: { flex: 1, fontSize: 13, lineHeight: 18 },
  passLabel: { fontSize: 7, letterSpacing: 1.1 },
  payloadChip: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6 },
  payloadChipText: { fontSize: 10, letterSpacing: 0.4 },
  payloadRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pose: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  poseHold: { fontSize: 8, letterSpacing: 0.8 },
  poseText: { flex: 1, fontSize: 22, textTransform: 'uppercase' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  relayCopy: { flex: 1 },
  relayGate: { fontSize: 7, letterSpacing: 0.8 },
  relayInput: { borderBottomWidth: 1, fontSize: 13, height: 40, textAlign: 'center', width: 88 },
  relayInputRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  relayRecipient: { fontSize: 18, lineHeight: 20, textTransform: 'uppercase' },
  relayRound: { alignItems: 'center', borderColor: '#FF7048', borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  relayRoundText: { fontSize: 20 },
  riddleCandidate: { alignItems: 'center', borderWidth: 1, flexBasis: '47%', flexGrow: 1, gap: 5, justifyContent: 'center', minHeight: 86, padding: 10 },
  riddleCandidateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  riddleInput: { borderWidth: 1.5, borderRadius: 14, padding: 15, minHeight: 54, fontSize: 18 },
  riddleCandidateLabel: { fontSize: 9, letterSpacing: 1.1 },
  riddleClue: { borderBottomWidth: 1, borderTopWidth: 1, gap: 8, paddingVertical: 14 },
  riddleCount: { fontSize: 8, letterSpacing: 1 },
  riddleKeyhole: { alignItems: 'center', borderWidth: 1, height: 48, justifyContent: 'center', transform: [{ rotate: '45deg' }], width: 48 },
  riddleLockCopy: { flex: 1, gap: 6 },
  riddleLockHeader: { alignItems: 'center', flexDirection: 'row', gap: 15 },
  riddleQuote: { fontSize: 22, lineHeight: 28 },
  riddleSigil: { fontSize: 31, lineHeight: 34 },
  riddleWitness: { fontSize: 7, letterSpacing: 1 },
  roleBrief: { alignItems: 'center', borderLeftWidth: 2, flexDirection: 'row', gap: 8, minHeight: 48, paddingLeft: 10 },
  roleBriefText: { flex: 1, fontSize: 12, lineHeight: 17 },
  roleName: { fontSize: 19, lineHeight: 20, textTransform: 'uppercase' },
  roleRail: { gap: 7 },
  roleTab: { borderWidth: 1, minWidth: 112, paddingHorizontal: 11, paddingVertical: 8 },
  roleTitle: { fontSize: 7, letterSpacing: 0.8 },
  scene: { fontSize: 8, letterSpacing: 1.5 },
  sectionLabel: { fontSize: 8, letterSpacing: 1.3 },
  sequenceNumber: { fontFamily: 'SplineSansMono_600SemiBold', fontSize: 8 },
  sequenceSlot: { alignItems: 'center', borderBottomWidth: 1, gap: 4, minWidth: 54, padding: 6 },
  sequenceToken: { fontSize: 17, textTransform: 'uppercase' },
  sequenceTray: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5, minHeight: 66, padding: 8 },
  sensorBody: { gap: 11 },
  sensorButton: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 49, paddingHorizontal: 12 },
  sensorButtonText: { fontSize: 9, letterSpacing: 1 },
  sensorConsole: { borderTopWidth: 2, gap: 13, padding: 12 },
  sensorError: { fontSize: 11, lineHeight: 16 },
  sensorFill: { height: '100%' },
  sensorFootnote: { fontSize: 10, lineHeight: 15 },
  sensorLabel: { fontSize: 8, letterSpacing: 1.2 },
  sensorPrivacy: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  sensorPrivacyText: { fontSize: 6, letterSpacing: 0.8 },
  sensorProgressCopy: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sensorProgressLabel: { fontSize: 8, letterSpacing: 0.8 },
  sensorProgressRow: { gap: 5 },
  sensorProgressValue: { fontSize: 8, letterSpacing: 0.8 },
  sensorTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sensorTrack: { height: 4, overflow: 'hidden' },
  syncAssignment: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  smallControl: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 38, paddingHorizontal: 10 },
  smallControlText: { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  stagePage: { gap: 24 },
  stageTitle: { fontSize: 47, letterSpacing: 0.2, lineHeight: 45, textTransform: 'uppercase' },
  storyBeat: { fontSize: 20, lineHeight: 25 },
  storyBlock: { gap: 8 },
  submitter: { fontSize: 7, letterSpacing: 1 },
  symbolKey: { alignItems: 'center', borderWidth: 1, height: 51, justifyContent: 'center', width: 51 },
  symbolKeyText: { fontSize: 24 },
  symbolPad: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center' },
  syncCopy: { flex: 1 },
  syncHold: { fontSize: 8, letterSpacing: 0.9 },
  syncPlate: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 57, paddingHorizontal: 11 },
  syncPlayer: { fontSize: 19, lineHeight: 20, textTransform: 'uppercase' },
  syncPose: { fontSize: 7, letterSpacing: 0.7 },
  tokenPool: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  workbench: { borderTopWidth: 3, gap: 13, paddingTop: 13 },
  workbenchTopline: { flexDirection: 'row', justifyContent: 'space-between' },
});

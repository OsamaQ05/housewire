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
  MotionSyncMechanic,
} from '@/src/domain/case-forge/types';
import { QrMarker, QrScanner } from '@/src/features/cases/CaseMissionPrimitives';
import { useAcousticMeter } from '@/src/hooks/use-acoustic-meter';
import { useTerminalMotion } from '@/src/hooks/use-terminal-motion';
import { useHousewireTheme } from '@/src/theme';

import { forgeColors } from './ForgePrimitives';
import {
  evaluateForgePose,
  FORGE_MIC_CALIBRATION_MS,
  FORGE_POSE_HOLD_MS,
  forgeVocalCueMatches,
  forgeVocalHoldMs,
} from './forge-sensor-evidence';

interface ForgeSyncProof {
  at: number;
  evidenceMode: 'sensor' | 'manual';
}

interface ForgeStageRunnerProps {
  activePlayerId: string;
  hintsRevealed: number;
  liveMode?: boolean;
  onChangePlayer: (playerId: string) => void;
  onRevealHint: () => void;
  onSubmit: (submission: ForgeStageSubmission) => ForgeSubmissionResult | Promise<ForgeSubmissionResult>;
  roles: readonly ForgeRole[];
  stage: ForgeStage | ForgePlayerStage;
}

export function ForgeStageRunner({
  activePlayerId,
  hintsRevealed,
  liveMode = false,
  onChangePlayer,
  onRevealHint,
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
    setSpentAudioClueIds([]);
    void Speech.stop();
  }, [routeStartCell, stage.id]);

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
    if (submitting) return;
    const submittedStageId = stage.id;
    setSubmitting(true);
    try {
      const result = await onSubmit(submission);
      if (stageIdRef.current === submittedStageId) setLastResult(result);
    } finally {
      if (stageIdRef.current === submittedStageId) setSubmitting(false);
    }
  };

  return (
    <View style={styles.stagePage}>
      <View style={styles.storyBlock}>
        <Text style={[styles.scene, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>SCENE {String(stage.index + 1).padStart(2, '0')} · {stage.durationMinutes} MIN</Text>
        <Text style={[styles.stageTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{stage.title}</Text>
        <Text style={[styles.storyBeat, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{stage.storyBeat}</Text>
        <View style={[styles.directive, { borderColor: forgeColors.ink }]}>
          <Ionicons color={forgeColors.ink} name="navigate-outline" size={18} />
          <Text style={[styles.directiveText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{stage.instruction}</Text>
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

      <View style={styles.cluesBlock}>
        <Text style={[styles.sectionLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>ONLY {activeRole?.playerName.toUpperCase()} CAN SEE</Text>
        {clues.length ? clues.map((clue) => (
          <ForgeCluePanel
            audioSpent={spentAudioClueIds.includes(clue.id)}
            clue={clue}
            key={clue.id}
            liveMode={liveMode}
            onSpendAudio={() => setSpentAudioClueIds((current) => current.includes(clue.id) ? current : [...current, clue.id])}
          />
        )) : (
          <View style={[styles.noClue, { borderColor: theme.colors.draft }]}>
            <Ionicons color={theme.colors.faint} name="eye-off-outline" size={24} />
            <Text style={[styles.noClueText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>This role has no fragment in this scene. Listen to the others.</Text>
          </View>
        )}
      </View>

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
            disabled={submitting}
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
            style={({ pressed }) => [styles.commitButton, { backgroundColor: forgeColors.ink }, pressed && styles.pressed]}
          >
            <Text style={[styles.commitText, { color: forgeColors.dark, fontFamily: theme.typography.families.bodyMedium }]}>{submitting ? 'Sending to the host…' : 'Test the mechanism'}</Text>
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

      <View style={[styles.hints, { borderColor: theme.colors.draft }]}>
        <View style={styles.hintCopy}>
          <Text style={[styles.sectionLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>PRESSURE RELEASE</Text>
          {hintsRevealed === 0 ? (
            <Text style={[styles.hintText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Stuck? The case can reveal up to three authored nudges.</Text>
          ) : stage.hints.slice(0, hintsRevealed).map((hint) => (
            <Text key={hint.level} style={[styles.hintText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{hint.level}. {hint.text}</Text>
          ))}
        </View>
        {hintsRevealed < stage.hints.length ? (
          <Pressable accessibilityRole="button" onPress={onRevealHint} style={({ pressed }) => [styles.hintButton, { borderColor: theme.colors.warning }, pressed && styles.pressed]}>
            <Ionicons color={theme.colors.warning} name="flashlight-outline" size={18} />
            <Text style={[styles.hintButtonText, { color: theme.colors.warning, fontFamily: theme.typography.families.monoMedium }]}>REVEAL {hintsRevealed + 1}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ForgeCluePanel({
  audioSpent,
  clue,
  liveMode,
  onSpendAudio,
}: {
  audioSpent: boolean;
  clue: ForgeClue;
  liveMode: boolean;
  onSpendAudio: () => void;
}) {
  const { theme } = useHousewireTheme();
  const [revealed, setRevealed] = useState(clue.payload.kind !== 'audio-token');
  const [speaking, setSpeaking] = useState(false);
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
      ) : <><CluePayloadView liveMode={liveMode} payload={clue.payload} />{audioFailed ? <Text accessibilityLiveRegion="polite" style={[styles.fallbackLink, { color: theme.colors.warning, fontFamily: theme.typography.families.body }]}>Audio failed, so the text fallback opened automatically.</Text> : null}</>}
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

function CluePayloadView({ liveMode, payload }: { liveMode: boolean; payload: ForgeCluePayload }) {
  const { theme } = useHousewireTheme();
  switch (payload.kind) {
    case 'text':
      return <Text selectable style={[styles.clueHero, { color: forgeColors.ink, fontFamily: theme.typography.families.storyBold }]}>{payload.text}</Text>;
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
      return <View style={styles.payloadRow}>{payload.edges.map(([from, to]) => <PayloadChip key={`${from}-${to}`} text={`CELL ${from}—${to}`} />)}</View>;
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
              <Text style={[styles.assemblyInstruction, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Combine every private witness line. Tap the only object that survives all of them.</Text>
              <Text style={[styles.riddleCount, { color: forgeColors.orange, fontFamily: theme.typography.families.monoMedium }]}>{mechanic.fragmentCount} FRAGMENTS · ONE ANSWER</Text>
            </View>
          </View>
          <View style={styles.riddleCandidateGrid}>
            {mechanic.candidates.map((candidate) => {
              const selected = candidate.id === riddleAnswer;
              return (
                <Pressable
                  accessibilityLabel={`${candidate.label}${selected ? ', selected' : ''}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={candidate.id}
                  onPress={() => onRiddleChange(selected ? '' : candidate.id)}
                  style={({ pressed }) => [
                    styles.riddleCandidate,
                    {
                      backgroundColor: selected ? forgeColors.ink : 'transparent',
                      borderColor: selected ? forgeColors.ink : theme.colors.draft,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.riddleSigil, { color: selected ? forgeColors.dark : forgeColors.ink, fontFamily: theme.typography.families.displayHeavy }]}>{candidate.sigil}</Text>
                  <Text style={[styles.riddleCandidateLabel, { color: selected ? forgeColors.dark : theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{candidate.label}</Text>
                </Pressable>
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
      const current = route.at(-1) ?? mechanic.startCell;
      const currentRow = Math.floor((current - 1) / mechanic.width);
      const currentColumn = (current - 1) % mechanic.width;
      const connected = mechanic.cells.filter((candidate) => {
        const row = Math.floor((candidate - 1) / mechanic.width);
        const column = (candidate - 1) % mechanic.width;
        return Math.abs(row - currentRow) + Math.abs(column - currentColumn) === 1;
      });
      return (
        <View style={styles.assembly}>
          <Text style={[styles.assemblyInstruction, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Trace from {cellName(mechanic.startCell, mechanic.width)} to {cellName(mechanic.exitCell, mechanic.width)}. The board accepts any adjacent step; only the crew&apos;s combined route will pass the mechanism.</Text>
          <View style={[styles.gridBoard, { width: mechanic.width * 55 }]}>
            {mechanic.cells.map((cell) => {
              const visitedAt = route.indexOf(cell);
              const allowed = connected.includes(cell) && !route.includes(cell);
              const isCurrent = cell === current;
              return (
                <Pressable
                  accessibilityLabel={`Cell ${cellName(cell, mechanic.width)}${allowed ? ', available' : ''}`}
                  accessibilityRole="button"
                  disabled={!allowed}
                  key={cell}
                  onPress={() => onRouteChange([...route, cell])}
                  style={[styles.gridCell, { backgroundColor: isCurrent ? forgeColors.ink : visitedAt >= 0 ? '#4D4520' : 'transparent', borderColor: allowed ? forgeColors.ink : theme.colors.draft, width: 51 }]}
                >
                  <Text style={[styles.gridCellText, { color: isCurrent ? forgeColors.dark : allowed ? forgeColors.ink : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{cellName(cell, mechanic.width)}</Text>
                  {visitedAt >= 0 ? <Text style={[styles.gridVisit, { color: isCurrent ? forgeColors.dark : forgeColors.ink }]}>{visitedAt + 1}</Text> : null}
                </Pressable>
              );
            })}
          </View>
          {route.length > 1 ? <SmallControl icon="arrow-undo" label="Retrace one cell" onPress={() => onRouteChange(route.slice(0, -1))} /> : null}
        </View>
      );
    }
    case 'motion-sync':
      return (
        <MotionSyncWorkbench
          activePlayerId={activePlayerId}
          liveMode={liveMode}
          mechanic={mechanic}
          onSyncProof={onSyncProof}
          roles={roles}
          syncProofs={syncProofs}
        />
      );
  }
}

function MotionSyncWorkbench({
  activePlayerId,
  liveMode,
  mechanic,
  onSyncProof,
  roles,
  syncProofs,
}: {
  activePlayerId: string;
  liveMode: boolean;
  mechanic: MotionSyncMechanic;
  onSyncProof: (playerId: string, evidenceMode: ForgeSyncProof['evidenceMode']) => void;
  roles: readonly ForgeRole[];
  syncProofs: Record<string, ForgeSyncProof>;
}) {
  const { theme } = useHousewireTheme();
  const assignment = mechanic.assignments.find((item) => item.playerId === activePlayerId);
  const motion = useTerminalMotion();
  const acoustic = useAcousticMeter();
  const [arming, setArming] = useState(false);
  const [sensorArmed, setSensorArmed] = useState(false);
  const [sensorError, setSensorError] = useState<string>();
  const [poseHeldMs, setPoseHeldMs] = useState(0);
  const [voiceHeldMs, setVoiceHeldMs] = useState(0);
  const [poseVerified, setPoseVerified] = useState(false);
  const [voiceVerified, setVoiceVerified] = useState(assignment?.vocalCue === 'NONE');
  const poseStartedAtRef = useRef<number | null>(null);
  const voiceStartedAtRef = useRef<number | null>(null);
  const armedAtRef = useRef(0);
  const proofSentRef = useRef(false);
  const stopMotion = motion.stop;
  const stopAcoustic = acoustic.stop;
  const readyProof = assignment ? syncProofs[assignment.playerId] : undefined;
  const poseReading = assignment
    ? evaluateForgePose(assignment.pose, motion)
    : { matched: false, sensorVerifiable: false };
  const sensorsRequested = mechanic.inputMode === 'motion' && poseReading.sensorVerifiable;
  const needsVoice = assignment?.vocalCue !== 'NONE';

  useEffect(() => {
    proofSentRef.current = Boolean(readyProof);
  }, [readyProof]);

  useEffect(() => {
    setArming(false);
    setSensorArmed(false);
    setSensorError(undefined);
    setPoseHeldMs(0);
    setVoiceHeldMs(0);
    setPoseVerified(false);
    setVoiceVerified(assignment?.vocalCue === 'NONE');
    poseStartedAtRef.current = null;
    voiceStartedAtRef.current = null;
    armedAtRef.current = 0;
    proofSentRef.current = Boolean(readyProof);
    void stopMotion();
    void stopAcoustic();
  }, [assignment?.playerId, assignment?.vocalCue, readyProof, stopAcoustic, stopMotion]);

  useEffect(() => () => {
    void stopMotion();
    void stopAcoustic();
  }, [stopAcoustic, stopMotion]);

  useEffect(() => {
    if (!sensorArmed) return;
    const timeout = setTimeout(() => {
      setSensorArmed(false);
      setSensorError('The local proof window expired. Arm again or use the hold fallback.');
      void stopMotion();
      void stopAcoustic();
    }, 20_000);
    return () => clearTimeout(timeout);
  }, [sensorArmed, stopAcoustic, stopMotion]);

  useEffect(() => {
    if (!sensorArmed || !motion.active) return;
    if (!poseReading.matched) {
      poseStartedAtRef.current = null;
      setPoseHeldMs(0);
      if (poseVerified) setPoseVerified(false);
      return;
    }
    if (poseVerified) return;
    const now = Date.now();
    poseStartedAtRef.current ??= now;
    const heldMs = now - poseStartedAtRef.current;
    setPoseHeldMs(Math.min(FORGE_POSE_HOLD_MS, heldMs));
    if (heldMs >= FORGE_POSE_HOLD_MS) setPoseVerified(true);
  }, [motion.active, motion.flatness, motion.steadiness, motion.tiltX, poseReading.matched, poseVerified, sensorArmed]);

  useEffect(() => {
    if (!assignment || assignment.vocalCue === 'NONE') {
      setVoiceVerified(true);
      return;
    }
    if (!sensorArmed || !acoustic.active) return;
    const now = Date.now();
    if (now - armedAtRef.current < FORGE_MIC_CALIBRATION_MS) {
      voiceStartedAtRef.current = null;
      setVoiceHeldMs(0);
      return;
    }
    const vocalCueMatches = forgeVocalCueMatches(assignment.vocalCue, acoustic.band);
    if (voiceVerified) {
      if (assignment.vocalCue === 'LOW_HUM' && !poseVerified && !vocalCueMatches) {
        setVoiceVerified(false);
        voiceStartedAtRef.current = null;
        setVoiceHeldMs(0);
      }
      return;
    }
    if (!vocalCueMatches) {
      voiceStartedAtRef.current = null;
      setVoiceHeldMs(0);
      return;
    }
    voiceStartedAtRef.current ??= now;
    const targetMs = forgeVocalHoldMs(assignment.vocalCue);
    const heldMs = now - voiceStartedAtRef.current;
    setVoiceHeldMs(Math.min(targetMs, heldMs));
    if (heldMs >= targetMs) setVoiceVerified(true);
  }, [acoustic.active, acoustic.band, assignment, poseVerified, sensorArmed, voiceVerified]);

  useEffect(() => {
    if (!assignment || readyProof || proofSentRef.current || !sensorArmed || !poseVerified || !voiceVerified) return;
    proofSentRef.current = true;
    setSensorArmed(false);
    onSyncProof(assignment.playerId, 'sensor');
    void stopMotion();
    void stopAcoustic();
  }, [assignment, onSyncProof, poseVerified, readyProof, sensorArmed, stopAcoustic, stopMotion, voiceVerified]);

  if (!assignment) {
    return <Text style={[styles.handoffCopy, { color: theme.colors.muted, fontFamily: theme.typography.families.storyBold }]}>This role has no contact in the final formation.</Text>;
  }

  const armSensors = async () => {
    if (!sensorsRequested || arming || sensorArmed || readyProof) return;
    setArming(true);
    setSensorError(undefined);
    setPoseHeldMs(0);
    setVoiceHeldMs(0);
    setPoseVerified(false);
    setVoiceVerified(assignment.vocalCue === 'NONE');
    poseStartedAtRef.current = null;
    voiceStartedAtRef.current = null;
    proofSentRef.current = false;
    const motionStarted = await motion.start();
    if (!motionStarted) {
      setSensorError('Motion access failed. Use the hold fallback below.');
      setArming(false);
      return;
    }
    if (needsVoice) {
      const microphoneStarted = await acoustic.start(20);
      if (!microphoneStarted) {
        await motion.stop();
        setSensorError('Microphone access failed. Use the hold fallback below.');
        setArming(false);
        return;
      }
    }
    armedAtRef.current = Date.now();
    setSensorArmed(true);
    setArming(false);
  };

  const completeManually = () => {
    if (readyProof || proofSentRef.current) return;
    proofSentRef.current = true;
    setSensorArmed(false);
    onSyncProof(assignment.playerId, 'manual');
    void motion.stop();
    void acoustic.stop();
  };

  const manualOnly = mechanic.inputMode === 'touch' || !poseReading.sensorVerifiable;
  const poseProgress = Math.max(0, Math.min(1, poseHeldMs / FORGE_POSE_HOLD_MS));
  const voiceTargetMs = forgeVocalHoldMs(assignment.vocalCue);
  const voiceProgress = voiceTargetMs === 0 ? 1 : Math.max(0, Math.min(1, voiceHeldMs / voiceTargetMs));
  const issue = sensorError ?? acoustic.error ?? (motion.denied ? 'Motion permission was denied. The fallback still works.' : acoustic.permissionDenied ? 'Microphone permission was denied. The fallback still works.' : undefined);

  return (
    <View style={styles.assembly}>
      <Text style={[styles.assemblyInstruction, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{liveMode ? 'Lock this phone, then keep the formation while the other phones arm inside the timing window.' : 'Pass the phone quickly. Each role locks its own private position.'}</Text>

      <View style={[styles.sensorConsole, { borderColor: readyProof ? forgeColors.ink : theme.colors.draft }]}>
        <View style={styles.sensorTopline}>
          <Text style={[styles.sensorLabel, { color: readyProof ? forgeColors.ink : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{manualOnly ? 'TACTILE CONTACT' : 'LOCAL SENSOR LOCK'}</Text>
          <View style={styles.sensorPrivacy}><Ionicons color={theme.colors.faint} name="shield-checkmark-outline" size={13} /><Text style={[styles.sensorPrivacyText, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>RAW DATA NEVER LEAVES</Text></View>
        </View>

        <View style={styles.syncAssignment}>
          <Ionicons color={readyProof ? forgeColors.ink : theme.colors.text} name={readyProof ? 'checkmark-circle' : 'phone-portrait-outline'} size={30} />
          <View style={styles.syncCopy}>
            <Text style={[styles.syncPlayer, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{roleNames([assignment.playerId], roles)}</Text>
            <Text style={[styles.syncPose, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{poseLabel(assignment.pose)}{needsVoice ? ` · ${assignment.vocalCue.replaceAll('_', ' ')}` : ''}</Text>
          </View>
          <Text style={[styles.syncHold, { color: readyProof ? forgeColors.ink : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{readyProof ? readyProof.evidenceMode.toUpperCase() : sensorArmed ? 'LISTENING' : 'OPEN'}</Text>
        </View>

        {!manualOnly && !readyProof ? (
          <View style={styles.sensorBody}>
            {sensorArmed ? (
              <>
                <SensorProgress label={poseVerified ? 'POSE LOCKED' : poseReading.matched ? 'HOLD POSITION' : 'FIND POSITION'} progress={poseVerified ? 1 : poseProgress} />
                {needsVoice ? <SensorProgress label={voiceVerified ? 'SOUND LOCKED' : Date.now() - armedAtRef.current < FORGE_MIC_CALIBRATION_MS ? 'CALIBRATING ROOM' : assignment.vocalCue === 'LOW_HUM' ? 'SUSTAIN A SOUND' : 'MAKE ONE SHORT SOUND'} progress={voiceVerified ? 1 : voiceProgress} value={acoustic.band} /> : null}
                <Text style={[styles.sensorFootnote, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>Motion checks posture and steadiness. The mic checks relative level and duration only—not words, pitch, identity, or emotion.</Text>
              </>
            ) : (
              <Pressable accessibilityHint="Requests motion access and, only if this role has a sound cue, microphone access" accessibilityRole="button" disabled={arming || motion.available === false} onPress={() => void armSensors()} style={({ pressed }) => [styles.sensorButton, { borderColor: motion.available === false ? theme.colors.draft : forgeColors.ink, opacity: motion.available === false ? 0.55 : 1 }, pressed && styles.pressed]}>
                <Ionicons color={motion.available === false ? theme.colors.faint : forgeColors.ink} name={needsVoice ? 'mic-outline' : 'pulse-outline'} size={20} />
                <Text style={[styles.sensorButtonText, { color: motion.available === false ? theme.colors.faint : forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>{arming ? 'ARMING…' : motion.available === false ? 'MOTION UNAVAILABLE' : needsVoice ? 'ARM MOTION + MIC' : 'ARM DEVICE MOTION'}</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {!poseReading.sensorVerifiable && !readyProof ? <Text style={[styles.sensorFootnote, { color: theme.colors.warning, fontFamily: theme.typography.families.body }]}>Screen-down cannot be proven from normalized motion data, so this role uses the human-confirmed hold.</Text> : null}
        {issue && !readyProof ? <Text accessibilityLiveRegion="polite" style={[styles.sensorError, { color: theme.colors.warning, fontFamily: theme.typography.families.bodyMedium }]}>{issue}</Text> : null}
      </View>

      {!readyProof ? (
        <Pressable
          accessibilityActions={[{ label: 'Confirm with touch fallback', name: 'activate' }]}
          accessibilityHint="Hold to confirm this role without sensors"
          accessibilityRole="button"
          delayLongPress={700}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'activate') completeManually();
          }}
          onLongPress={completeManually}
          style={({ pressed }) => [styles.syncPlate, { backgroundColor: pressed ? '#3B3517' : 'transparent', borderColor: theme.colors.draft }]}
        >
          <Ionicons color={forgeColors.ink} name="finger-print-outline" size={21} />
          <View style={styles.syncCopy}><Text style={[styles.manualFallbackTitle, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>HOLD FALLBACK</Text><Text style={[styles.syncPose, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>SAME POSE + CUE · 0.7 SEC</Text></View>
          <Text style={[styles.syncHold, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>HOLD</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SensorProgress({ label, progress, value }: { label: string; progress: number; value?: string }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.sensorProgressRow}>
      <View style={styles.sensorProgressCopy}><Text style={[styles.sensorProgressLabel, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{label}</Text>{value ? <Text style={[styles.sensorProgressValue, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>{value}</Text> : null}</View>
      <View style={[styles.sensorTrack, { backgroundColor: theme.colors.draft }]}><View style={[styles.sensorFill, { backgroundColor: forgeColors.ink, width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }]} /></View>
    </View>
  );
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
      ? `The circuit is incomplete${typeof result.expectedLength === 'number' ? ` · ${result.acceptedPrefixLength ?? 0}/${result.expectedLength}` : ''}.`
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

function cellName(cell: number, width = 4): string {
  const offset = Math.max(0, cell - 1);
  const row = Math.floor(offset / width);
  const column = offset % width;
  return `${String.fromCharCode(65 + column)}${row + 1}`;
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

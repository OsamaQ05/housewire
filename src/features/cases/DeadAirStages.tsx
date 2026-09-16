import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlyphMark } from '@/src/components';
import {
  validateDeadAirDuctOrder,
  validateDeadAirEnvelope,
  type DeadAirCase,
  type EnvelopeLevel,
  type ToneBand,
} from '@/src/domain/escape-case-compiler';
import type { EscapeSignalEvent } from '@/src/features/session';
import type { useAcousticMeter } from '@/src/hooks/use-acoustic-meter';
import type { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import type { TerminalMotionSnapshot } from '@/src/hooks/use-terminal-motion';
import type { CrewNode } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

import {
  ActionButton,
  CaseStageScaffold,
  ChoiceChip,
  PoseLock,
  QrMarker,
  QrScanner,
  RoleStepper,
  StagePanel,
  TechnicalLabel,
  WaitingPanel,
} from './CaseMissionPrimitives';

const ACCENT = '#C8F26A';
const WORDS = ['EMBER', 'HOLLOW', 'SEVEN', 'RIVER', 'LANTERN', 'COPPER', 'WINDOW', 'ORBIT'] as const;

export interface PrivateWordDelivery {
  codeword?: string;
  mode: 'authored' | 'recorded' | 'text';
  round: number;
}

export interface DeadAirStageProps {
  acoustic: ReturnType<typeof useAcousticMeter>;
  activeNodeId: string;
  completedProofKeys: readonly string[];
  crew: readonly CrewNode[];
  directReady: boolean;
  game: DeadAirCase;
  inbox: readonly PrivateWordDelivery[];
  motion: TerminalMotionSnapshot;
  onChangeNode: (nodeId: string) => void;
  onMiss: () => void;
  onPrivateWord: (input: { codeword: string; recipientNodeId: string; round: number; recorded: boolean }) => Promise<boolean>;
  onProof: (proofKey: string) => Promise<boolean>;
  onSignal: (input: Omit<EscapeSignalEvent, 'kind' | 'missionId' | 'operationId' | 'nodeId' | 'observedAt'>) => Promise<boolean>;
  onStartMotion: () => void;
  play: ReturnType<typeof useHousewireSound>['play'];
  preview: boolean;
  signals: readonly (EscapeSignalEvent & { senderId: string; serverTime: number })[];
  stageIndex: number;
}

export function DeadAirStageView(props: DeadAirStageProps) {
  if (props.stageIndex === 0) return <DuctStage {...props} />;
  if (props.stageIndex === 1) return <ServicePlateStage {...props} />;
  if (props.stageIndex === 2) return <PrivateChannelStage {...props} />;
  if (props.stageIndex === 3) return <EchoMatrixStage {...props} />;
  return <CountertoneStage {...props} />;
}

function DuctStage({ activeNodeId, crew, game, onChangeNode, onMiss, onProof, play, preview }: DeadAirStageProps) {
  const { theme } = useHousewireTheme();
  const [attempt, setAttempt] = useState<string[]>([]);
  const [rejected, setRejected] = useState(false);
  const [routeFeedback, setRouteFeedback] = useState<string>();
  const ownClue = game.ductClues.find((clue) => clue.clueOwnerNodeId === activeNodeId);
  const decoderClues = game.ductClues.filter((clue) => clue.decoderOwnerNodeId === activeNodeId);

  const playSignature = (signature: readonly ToneBand[]) => {
    signature.forEach((band, index) => {
      setTimeout(() => {
        play(band === 'LOW' ? 'node1' : band === 'MID' ? 'node2' : 'node3', 0.72);
        void Haptics.impactAsync(
          band === 'LOW' ? Haptics.ImpactFeedbackStyle.Soft :
            band === 'MID' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy,
        ).catch(() => undefined);
      }, index * 660);
    });
  };

  const submit = async () => {
    const validation = validateDeadAirDuctOrder(game, attempt);
    if (validation.status === 'complete') {
      setRouteFeedback(undefined);
      await onProof('duct-order');
      return;
    }
    setAttempt((current) => current.slice(0, validation.acceptedPrefixLength));
    setRouteFeedback(
      validation.acceptedPrefixLength === 0
        ? 'Wrong route. No positions were kept.'
        : `${validation.acceptedPrefixLength} ${validation.acceptedPrefixLength === 1 ? 'position is' : 'positions are'} correct and stayed wired. Rebuild from the next slot.`,
    );
    onMiss();
    setRejected(true);
    setTimeout(() => setRejected(false), 700);
  };

  return (
    <CaseStageScaffold accent={ACCENT} instruction="Match each three-tone signature to somebody else’s duct table. Then order the phones." stageNumber={1} title="Three ducts">
      <RoleStepper activeNodeId={activeNodeId} crew={crew} enabled={preview} onChange={onChangeNode} />
      <StagePanel tone={rejected ? theme.colors.fault : ACCENT}>
        {ownClue ? (
          <>
            <View style={styles.panelTopline}>
              <TechnicalLabel color={ACCENT}>YOUR DUCT SIGNATURE</TechnicalLabel>
              <Ionicons color={ACCENT} name="volume-high-outline" size={20} />
            </View>
            <View style={styles.toneBars}>
              {ownClue.signature.map((band, index) => <ToneBar band={band} index={index} key={`${band}-${index}`} />)}
            </View>
            <ActionButton accent={ACCENT} icon="play" label="Play my three tones" onPress={() => playSignature(ownClue.signature)} secondary />
          </>
        ) : null}
        {decoderClues.length > 0 ? (
          <View style={styles.decoderBlock}>
            <TechnicalLabel color={theme.colors.warning}>PRIVATE LOOKUP PLATE</TechnicalLabel>
            {decoderClues.map((clue) => (
              <View key={clue.subjectNodeId} style={[styles.lookupRow, { borderColor: theme.colors.draft }]}>
                <View style={styles.miniBars}>{clue.signature.map((band, index) => <View key={`${band}-${index}`} style={[styles.miniBar, { backgroundColor: bandColor(band), height: band === 'LOW' ? 10 : band === 'MID' ? 18 : 27 }]} />)}</View>
                <Text style={[styles.lookupEquals, { color: theme.colors.muted }]}>→</Text>
                <Text style={[styles.ductRoman, { color: ACCENT, fontFamily: theme.typography.families.displayHeavy }]}>DUCT {clue.duct}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </StagePanel>

      <View style={styles.orderBlock}>
        <View style={styles.orderHeader}>
          <TechnicalLabel>SWITCHBOARD ORDER</TechnicalLabel>
          <Text style={[styles.prefix, { color: rejected ? theme.colors.fault : theme.colors.muted, fontFamily: theme.typography.families.mono }]}>{attempt.length}/{game.ductOrder.length}</Text>
        </View>
        <View style={styles.orderSlots}>
          {game.ductOrder.map((_, index) => (
            <View key={index} style={[styles.orderSlot, { borderColor: attempt[index] ? ACCENT : theme.colors.draft }]}>
              <Text style={[styles.orderSlotText, { color: attempt[index] ? theme.colors.text : theme.colors.faint, fontFamily: theme.typography.families.display }]}>{attempt[index] ? crewName(attempt[index], crew) : String(index + 1)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.choiceWrap}>
          {game.nodeIds.map((nodeId) => <ChoiceChip accent={ACCENT} disabled={attempt.includes(nodeId)} key={nodeId} label={crewName(nodeId, crew)} onPress={() => {
            setRouteFeedback(undefined);
            setAttempt((current) => [...current, nodeId]);
          }} />)}
        </View>
        <View style={styles.actionRow}>
          <ActionButton accent={ACCENT} disabled={attempt.length === 0} icon="arrow-undo" label="Undo" onPress={() => {
            setRouteFeedback(undefined);
            setAttempt((current) => current.slice(0, -1));
          }} secondary />
          <ActionButton accent={ACCENT} disabled={attempt.length !== game.ductOrder.length} icon="git-merge-outline" label="Route ducts" onPress={() => void submit()} />
        </View>
        {routeFeedback ? (
          <Text accessibilityLiveRegion="polite" style={[styles.routeFeedback, { color: theme.colors.fault, fontFamily: theme.typography.families.bodyMedium }]}>{routeFeedback}</Text>
        ) : null}
      </View>
    </CaseStageScaffold>
  );
}

function ToneBar({ band, index }: { band: ToneBand; index: number }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.toneColumn}>
      <View style={[styles.toneBar, { backgroundColor: bandColor(band), height: band === 'LOW' ? 42 : band === 'MID' ? 78 : 114 }]} />
      <Text style={[styles.toneLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{index + 1} · {band}</Text>
    </View>
  );
}

function bandColor(band: ToneBand) {
  if (band === 'LOW') return '#8F7A45';
  if (band === 'MID') return '#C8F26A';
  return '#F1F6DA';
}

function ServicePlateStage(props: DeadAirStageProps) {
  const { theme } = useHousewireTheme();
  const index = props.game.serviceScans.findIndex((scan) => !props.completedProofKeys.includes(`service-scan:${scan.step}`));
  const scan = props.game.serviceScans[Math.max(0, index)];
  const finished = index < 0;
  const [scanned, setScanned] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [rejected, setRejected] = useState(false);
  if (finished) return <WaitingPanel accent={ACCENT} detail="Every signed plate is in the right duct. The service pair is opening." title="Valves routed." />;
  const active = props.activeNodeId;
  const scanner = active === scan.scannerNodeId;
  const markerOwner = active === scan.markerOwnerNodeId;
  const decoder = active === scan.corrosionDecoderOwnerNodeId;
  const submit = async () => {
    if (selected === scan.liveValve && scanned) {
      const accepted = await props.onProof(`service-scan:${scan.step}`);
      if (!accepted) return;
      setSelected(undefined);
      setScanned(false);
      return;
    }
    props.onMiss();
    setRejected(true);
    setTimeout(() => setRejected(false), 700);
  };
  return (
    <CaseStageScaffold accent={ACCENT} instruction={`Plate ${scan.step} of ${props.game.serviceScans.length}. The scanner, plate, and corrosion rule live on different phones.`} stageNumber={2} title="Service plates">
      <RoleStepper activeNodeId={active} crew={props.crew} enabled={props.preview} onChange={props.onChangeNode} />
      <View style={styles.roleBadgeRow}>
        <RoleBadge active={scanner} label="SCANNER" />
        <RoleBadge active={markerOwner} label="PLATE" />
        <RoleBadge active={decoder} label="CORROSION" />
      </View>
      {markerOwner ? <QrMarker accent={ACCENT} label={`SERVICE PLATE ${scan.step}`} token={scan.markerToken} /> : null}
      {decoder ? (
        <StagePanel tone={ACCENT}>
          <TechnicalLabel color={ACCENT}>CORROSION RULE · SAY IT, DON&apos;T SHOW IT</TechnicalLabel>
          <View style={styles.valveRule}>
            <GlyphMark color={ACCENT} glyph={scan.liveValve} size={76} />
            <Text style={[styles.valveRuleText, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>The live valve has this cut.</Text>
          </View>
        </StagePanel>
      ) : null}
      {scanner ? (
        <>
          {!scanned ? <QrScanner accent={ACCENT} expectedToken={scan.markerToken} onScanned={() => setScanned(true)} /> : (
            <StagePanel tone={rejected ? theme.colors.fault : ACCENT}>
              <TechnicalLabel color={ACCENT}>LENS OPEN · ASK THE CORROSION KEEPER</TechnicalLabel>
              <View style={styles.glyphChoices}>
                {scan.candidates.map((glyph) => (
                  <Pressable accessibilityLabel={`Select ${glyph} valve`} accessibilityRole="button" key={glyph} onPress={() => setSelected(glyph)} style={[styles.glyphChoice, { backgroundColor: selected === glyph ? ACCENT : 'transparent', borderColor: selected === glyph ? ACCENT : theme.colors.draft }]}>
                    <GlyphMark color={selected === glyph ? '#07100D' : theme.colors.text} glyph={glyph} size={58} />
                    <Text style={[styles.glyphName, { color: selected === glyph ? '#07100D' : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{glyph}</Text>
                  </Pressable>
                ))}
              </View>
              <ActionButton accent={ACCENT} disabled={!selected} label="Seat this valve" onPress={() => void submit()} />
            </StagePanel>
          )}
        </>
      ) : null}
      {!scanner && !markerOwner && !decoder ? <WaitingPanel accent={ACCENT} detail="Keep this phone beside its assigned room station. The next plate may route through it." /> : null}
    </CaseStageScaffold>
  );
}

function PrivateChannelStage(props: DeadAirStageProps) {
  const { theme } = useHousewireTheme();
  const index = props.game.privateChannel.rounds.findIndex((round) => !props.completedProofKeys.includes(`whisper:${round.round}`));
  const round = props.game.privateChannel.rounds[Math.max(0, index)];
  const [soloGate, setSoloGate] = useState<number>();
  const [soloDelivery, setSoloDelivery] = useState<PrivateWordDelivery>();
  const [sending, setSending] = useState(false);
  const [selection, setSelection] = useState<string>();
  const finished = index < 0;
  if (finished) return <WaitingPanel accent={ACCENT} detail="Four private words reached only their intended receiver. The tuner never received content." title="Channel stripped." />;
  const caller = props.activeNodeId === props.game.privateChannel.callerNodeId;
  const receiver = props.activeNodeId === props.game.privateChannel.receiverNodeId;
  const gatekeeperNodeId = props.game.privateChannel.tunerNodeId ?? props.game.privateChannel.callerNodeId;
  const tuner = props.activeNodeId === gatekeeperNodeId;
  const gateOpen = props.preview
    ? soloGate === round.round
    : props.signals.some((signal) => signal.round === round.round && signal.signal === 'gate-open' && signal.senderId === gatekeeperNodeId);
  const delivery = props.preview && soloDelivery?.round === round.round
    ? soloDelivery
    : props.inbox.find((item) => item.round === round.round);

  const openGate = async () => {
    if (props.preview) setSoloGate(round.round);
    else await props.onSignal({ round: round.round, signal: 'gate-open', value: round.gate });
  };
  const send = async (recorded: boolean) => {
    if (!gateOpen || sending) return;
    setSending(true);
    if (props.preview) {
      setSoloDelivery({ codeword: round.codeword, mode: recorded ? 'recorded' : 'authored', round: round.round });
      props.play('relay', 0.5);
    } else {
      const sent = await props.onPrivateWord({ codeword: round.codeword, recipientNodeId: props.game.privateChannel.receiverNodeId, round: round.round, recorded });
      if (sent) await props.onSignal({ round: round.round, signal: 'whisper-sent', targetNodeId: props.game.privateChannel.receiverNodeId });
    }
    setSending(false);
  };
  const acknowledge = async () => {
    if (selection !== round.codeword || !delivery) {
      props.onMiss();
      props.play('warning', 0.3);
      return;
    }
    if (!props.preview) await props.onSignal({ round: round.round, signal: 'whisper-heard', targetNodeId: props.game.privateChannel.callerNodeId });
    const accepted = await props.onProof(`whisper:${round.round}`);
    if (!accepted) return;
    setSelection(undefined);
    setSoloDelivery(undefined);
    setSoloGate(undefined);
  };

  return (
    <CaseStageScaffold accent={ACCENT} instruction={`Private burst ${round.round} of 4. The tuner opens Duct ${round.gate}, but this phone never receives the word.`} stageNumber={3} title="The service pair">
      <RoleStepper activeNodeId={props.activeNodeId} crew={props.crew} enabled={props.preview} onChange={props.onChangeNode} />
      <View style={styles.channelTopology}>
        <ChannelNode active={caller} icon="mic-outline" label="CALLER" />
        <View style={[styles.channelLine, { backgroundColor: gateOpen ? ACCENT : theme.colors.draft }]} />
        <ChannelNode active={receiver} icon="ear-outline" label="RECEIVER" />
        <View style={[styles.excludedBranch, { borderColor: theme.colors.draft }]}>
          <Ionicons color={theme.colors.warning} name="eye-off-outline" size={17} />
          <Text style={[styles.excludedText, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>TUNER EXCLUDED</Text>
        </View>
      </View>

      {tuner ? (
        <StagePanel tone={gateOpen ? ACCENT : undefined}>
          <TechnicalLabel color={ACCENT}>QUIET MACHINE CONTROL</TechnicalLabel>
          <Text style={[styles.gateTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>DUCT {round.gate}</Text>
          <Text style={[styles.roleCopy, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{props.game.privateChannel.tunerNodeId ? 'Open the route when Caller and Receiver say they are ready. You will see delivery status—but never the word or its duration.' : 'Two-phone mode puts the gate valve beside the Caller. Open it before recording; the Receiver remains the only phone that receives the burst.'}</Text>
          <ActionButton accent={ACCENT} disabled={gateOpen} icon="lock-open-outline" label={gateOpen ? 'Gate is open' : 'Open private gate'} onPress={() => void openGate()} />
        </StagePanel>
      ) : null}

      {caller ? (
        <StagePanel tone={gateOpen ? ACCENT : theme.colors.warning}>
          <TechnicalLabel color={gateOpen ? ACCENT : theme.colors.warning}>{gateOpen ? `DUCT ${round.gate} OPEN` : 'WAIT FOR THE TUNER'}</TechnicalLabel>
          <Text style={[styles.codeword, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{round.codeword}</Text>
          <Text style={[styles.roleCopy, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Say exactly this one game word. It is delivered once, never transcribed, never archived, and deleted after delivery.</Text>
          <Text style={[styles.roleCopy, { color: theme.colors.muted }]}>After allowing the microphone, you have six seconds to say the word clearly.</Text>
          <ActionButton accent={ACCENT} disabled={!gateOpen || sending || (!props.preview && !props.directReady)} icon="mic" label={sending ? 'Recording + sending…' : 'Record a 6-second word'} onPress={() => void send(true)} />
          <ActionButton accent={ACCENT} disabled={!gateOpen || sending || (!props.preview && !props.directReady)} icon="volume-high-outline" label="Send authored voice instead" onPress={() => void send(false)} secondary />
          {!props.preview && !props.directReady ? <Text style={[styles.privateStatus, { color: theme.colors.warning, fontFamily: theme.typography.families.mono }]}>PRIVATE RELAY RECONNECTING</Text> : null}
        </StagePanel>
      ) : null}

      {receiver ? (
        <StagePanel tone={delivery ? ACCENT : undefined}>
          <TechnicalLabel color={delivery ? ACCENT : theme.colors.muted}>{delivery ? 'ONE-TIME WORD RECEIVED' : 'PRIVATE EARPIECE ARMED'}</TechnicalLabel>
          {delivery ? (
            <>
              {delivery.mode === 'recorded'
                ? <ActionButton accent={ACCENT} disabled icon="ear-outline" label="Played once on arrival" onPress={() => undefined} />
                : <ActionButton accent={ACCENT} icon="ear-outline" label="Play once" onPress={() => playWord(delivery.codeword ?? round.codeword, props.play)} />}
              <View style={styles.choiceWrap}>{WORDS.map((word) => <ChoiceChip accent={ACCENT} key={word} label={word} onPress={() => setSelection(word)} selected={selection === word} />)}</View>
              <ActionButton accent={ACCENT} disabled={!selection} icon="checkmark" label="Lock what I heard" onPress={() => void acknowledge()} />
            </>
          ) : <WaitingPanel accent={ACCENT} detail="Only this phone will receive the short word. The tuner sees a closed-channel pulse." />}
        </StagePanel>
      ) : null}

      {!caller && !receiver && !tuner ? <WaitingPanel accent={ACCENT} detail="This fourth phone is a line monitor. It sees acknowledgements only and receives no audio payload." title="Channel content blocked." /> : null}
    </CaseStageScaffold>
  );
}

function ChannelNode({ active, icon, label }: { active: boolean; icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.channelNode}>
      <View style={[styles.channelNodeIcon, { backgroundColor: active ? ACCENT : theme.colors.surface, borderColor: active ? ACCENT : theme.colors.draft }]}><Ionicons color={active ? '#07100D' : theme.colors.muted} name={icon} size={22} /></View>
      <Text style={[styles.channelNodeLabel, { color: active ? ACCENT : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{label}</Text>
    </View>
  );
}

function EchoMatrixStage(props: DeadAirStageProps) {
  const { theme } = useHousewireTheme();
  const [attempt, setAttempt] = useState<EnvelopeLevel[]>([]);
  const [rejected, setRejected] = useState(false);
  const ownsOrder = props.game.echoMatrix.resonatorOrderOwnerNodeId === props.activeNodeId;
  const ownsMirror = props.game.echoMatrix.mirrorRuleOwnerNodeId === props.activeNodeId;
  const mappings = props.game.echoMatrix.mappings.filter((mapping) => mapping.decoderOwnerNodeId === props.activeNodeId);
  const submit = async () => {
    const result = validateDeadAirEnvelope(props.game, attempt);
    if (result.status === 'complete') {
      await props.onProof('echo-envelope');
      return;
    }
    setAttempt((current) => current.slice(0, result.acceptedPrefixLength));
    props.onMiss();
    setRejected(true);
    setTimeout(() => setRejected(false), 700);
  };
  return (
    <CaseStageScaffold accent={ACCENT} instruction="Combine the receiver’s glyph order with pressure mappings held on other phones." stageNumber={4} title="Echo matrix">
      <RoleStepper activeNodeId={props.activeNodeId} crew={props.crew} enabled={props.preview} onChange={props.onChangeNode} />
      <StagePanel tone={ACCENT}>
        {ownsOrder ? (
          <View style={styles.clueSection}>
            <TechnicalLabel color={ACCENT}>RESONATOR ORDER</TechnicalLabel>
            <View style={styles.glyphSequence}>{props.game.privateChannel.rounds.map((round) => <GlyphMark color={theme.colors.text} glyph={round.decodedGlyph} key={round.round} size={46} />)}</View>
          </View>
        ) : null}
        {mappings.length ? (
          <View style={styles.clueSection}>
            <TechnicalLabel color={theme.colors.warning}>PRESSURE MAPPINGS</TechnicalLabel>
            {mappings.map((mapping) => <View key={mapping.glyph} style={styles.mappingRow}><GlyphMark color={theme.colors.text} glyph={mapping.glyph} size={39} /><Text style={[styles.mappingEquals, { color: theme.colors.faint }]}>→</Text><EnvelopeGlyph level={mapping.level} /></View>)}
          </View>
        ) : null}
        {ownsMirror ? <View style={[styles.mirrorRule, { borderColor: theme.colors.draft }]}><Ionicons color={ACCENT} name="swap-horizontal-outline" size={22} /><Text style={[styles.mirrorText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>The machine reads the spoken order exactly once. Do not reverse a REST.</Text></View> : null}
        {!ownsOrder && mappings.length === 0 && !ownsMirror ? <WaitingPanel accent={ACCENT} detail="Listen to the resonator order and mappings. The full pressure envelope exists only in the conversation." /> : null}
      </StagePanel>
      <View style={[styles.envelopeBuilder, { borderColor: rejected ? theme.colors.fault : theme.colors.draft }]}>
        <View style={styles.envelopeSlots}>{props.game.echoMatrix.envelope.map((_, index) => <View key={index} style={[styles.envelopeSlot, { borderColor: attempt[index] ? ACCENT : theme.colors.draft }]}>{attempt[index] ? <EnvelopeGlyph level={attempt[index]} /> : <Text style={[styles.envelopeSlotIndex, { color: theme.colors.faint, fontFamily: theme.typography.families.display }]}>{index + 1}</Text>}</View>)}</View>
        <View style={styles.choiceWrap}>{(['SOFT', 'STRONG', 'REST'] as const).map((level) => <ChoiceChip accent={ACCENT} key={level} label={level} onPress={() => setAttempt((current) => current.length < 4 ? [...current, level] : current)} />)}</View>
        <View style={styles.actionRow}><ActionButton accent={ACCENT} disabled={!attempt.length} label="Undo" onPress={() => setAttempt((current) => current.slice(0, -1))} secondary /><ActionButton accent={ACCENT} disabled={attempt.length !== 4} label="Load envelope" onPress={() => void submit()} /></View>
      </View>
    </CaseStageScaffold>
  );
}

function EnvelopeGlyph({ level }: { level: EnvelopeLevel }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.envelopeGlyph}>
      <View style={[styles.envelopeBar, { backgroundColor: level === 'REST' ? theme.colors.faint : ACCENT, height: level === 'STRONG' ? 34 : level === 'SOFT' ? 18 : 3 }]} />
      <Text style={[styles.envelopeLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{level}</Text>
    </View>
  );
}

function CountertoneStage(props: DeadAirStageProps) {
  const { theme } = useHousewireTheme();
  const stopAcoustic = props.acoustic.stop;
  const vocalist = props.game.countertone.vocalistNodeIds.includes(props.activeNodeId);
  const tuner = props.game.countertone.tunerNodeId === props.activeNodeId;
  const myBeats = useMemo(() => props.game.countertone.beats.filter((beat) => beat.performerNodeIds.includes(props.activeNodeId)), [props.activeNodeId, props.game.countertone.beats]);
  const [beatIndex, setBeatIndex] = useState(0);
  const [touchMode, setTouchMode] = useState(false);
  const [done, setDone] = useState(false);
  const already = props.completedProofKeys.includes(`countertone:${props.activeNodeId}`);
  const expected = myBeats[beatIndex]?.level;

  useEffect(() => {
    setBeatIndex(0);
    setTouchMode(false);
    setDone(false);
    void stopAcoustic();
  }, [props.activeNodeId, stopAcoustic]);

  const lockBand = async (band: EnvelopeLevel) => {
    if (band !== expected) {
      props.onMiss();
      props.play('warning', 0.3);
      return;
    }
    if (beatIndex < myBeats.length - 1) {
      setBeatIndex((current) => current + 1);
      props.play('accept', 0.3);
      return;
    }
    await props.acoustic.stop();
    const accepted = await props.onProof('countertone');
    if (accepted) setDone(true);
  };

  if (!vocalist && !tuner) return (
    <CaseStageScaffold accent={ACCENT} instruction="The service pair performs the cancellation while this monitor watches the machine collapse." stageNumber={5} title="Countertone">
      <WaitingPanel accent={ACCENT} detail="No microphone or contact evidence is assigned to this fourth monitor. The case will close when every required instrument locks." />
    </CaseStageScaffold>
  );

  if (already) return (
    <CaseStageScaffold accent={ACCENT} instruction="Keep this instrument locked while the remaining countertone parts finish." stageNumber={5} title="Countertone">
      <RoleStepper activeNodeId={props.activeNodeId} crew={props.crew} enabled={props.preview} onChange={props.onChangeNode} />
      <WaitingPanel accent={ACCENT} detail="This phone's pressure or contact evidence is locked. The Quiet Machine is waiting for the other required instruments." title="Countertone held." />
    </CaseStageScaffold>
  );

  return (
    <CaseStageScaffold accent={ACCENT} instruction="Perform the four-beat pressure envelope. The app classifies only relative loudness—never words, pitch, identity, or emotion." stageNumber={5} title="Countertone">
      <RoleStepper activeNodeId={props.activeNodeId} crew={props.crew} enabled={props.preview} onChange={props.onChangeNode} />
      {tuner ? <PoseLock puzzleKey={`${props.game.effectiveSeed}:${props.stageIndex}:${props.activeNodeId}`} accent={ACCENT} motion={props.motion} onArmMotion={props.onStartMotion} onComplete={() => void props.onProof('countertone')} pose={props.game.countertone.tunerPose} /> : null}
      {vocalist ? (
        <StagePanel tone={done ? theme.colors.ready : ACCENT}>
          <View style={styles.meterTopline}>
            <TechnicalLabel color={ACCENT}>LOCAL PRESSURE CLASSIFIER</TechnicalLabel>
            <Text style={[styles.meterValue, { color: theme.colors.muted, fontFamily: theme.typography.families.mono }]}>{Math.round(props.acoustic.levelDecibels)} dBFS</Text>
          </View>
          <View style={styles.beatRail}>{myBeats.map((beat, index) => <View key={beat.beat} style={[styles.beat, { backgroundColor: index < beatIndex || done ? ACCENT : index === beatIndex ? theme.colors.warning : theme.colors.draft }]} />)}</View>
          <View style={styles.meterDial}>
            <View style={[styles.meterCore, { backgroundColor: props.acoustic.band === 'STRONG' ? ACCENT : props.acoustic.band === 'SOFT' ? theme.colors.warning : theme.colors.surfaceRaised }]}>
              <Text style={[styles.meterBand, { color: props.acoustic.band === 'STRONG' ? '#07100D' : theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{props.acoustic.band}</Text>
            </View>
            <Text style={[styles.meterTarget, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>TARGET {expected ?? 'LOCKED'}</Text>
          </View>
          {!props.acoustic.active && !touchMode && !done ? <ActionButton accent={ACCENT} icon="mic" label="Calibrate room + arm voice" onPress={() => void props.acoustic.start()} /> : null}
          {props.acoustic.active && expected ? <ActionButton accent={ACCENT} disabled={props.acoustic.band !== expected} icon="radio-button-on" label={`Lock ${expected}`} onPress={() => void lockBand(props.acoustic.band)} /> : null}
          {props.acoustic.permissionDenied || touchMode ? (
            <View style={styles.choiceWrap}>{(['SOFT', 'STRONG', 'REST'] as const).map((level) => <ChoiceChip accent={ACCENT} key={level} label={`PRESS ${level}`} onPress={() => void lockBand(level)} />)}</View>
          ) : null}
          {!touchMode && !done ? <Pressable accessibilityRole="button" onPress={() => setTouchMode(true)}><Text style={[styles.touchFallback, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>No microphone? Reproduce the same envelope with pressure controls.</Text></Pressable> : null}
          {done ? <TechnicalLabel color={theme.colors.ready}>YOUR COUNTERTONE IS LOCKED · WAIT FOR THE HOUSE</TechnicalLabel> : null}
        </StagePanel>
      ) : null}
    </CaseStageScaffold>
  );
}

function RoleBadge({ active, label }: { active: boolean; label: string }) {
  const { theme } = useHousewireTheme();
  return <View style={[styles.roleBadge, { backgroundColor: active ? ACCENT : 'transparent', borderColor: active ? ACCENT : theme.colors.draft }]}><Text style={[styles.roleBadgeText, { color: active ? '#07100D' : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{label}</Text></View>;
}

function crewName(nodeId: string, crew: readonly CrewNode[]) {
  return crew.find((node) => node.id === nodeId)?.name ?? `Node ${nodeId.slice(-2)}`;
}

function playWord(word: string, play: ReturnType<typeof useHousewireSound>['play']) {
  const sound = WORD_SOUND[word as keyof typeof WORD_SOUND];
  if (sound) play(sound, 0.9);
}

const WORD_SOUND = { EMBER: 'wordEmber', HOLLOW: 'wordHollow', SEVEN: 'wordSeven', RIVER: 'wordRiver', LANTERN: 'wordLantern', COPPER: 'wordCopper', WINDOW: 'wordWindow', ORBIT: 'wordOrbit' } as const;

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', gap: 8 },
  beat: { flex: 1, height: 5 },
  beatRail: { flexDirection: 'row', gap: 5 },
  channelLine: { height: 2, marginTop: 24, width: 70 },
  channelNode: { alignItems: 'center', gap: 5 },
  channelNodeIcon: { alignItems: 'center', borderWidth: 1, height: 48, justifyContent: 'center', width: 48 },
  channelNodeLabel: { fontSize: 8, letterSpacing: 1 },
  channelTopology: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'center', minHeight: 100, paddingTop: 4 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  clueSection: { gap: 10 },
  codeword: { fontSize: 57, lineHeight: 57 },
  decoderBlock: { gap: 8 },
  ductRoman: { flex: 1, fontSize: 24 },
  envelopeBar: { minWidth: 22 },
  envelopeBuilder: { borderBottomWidth: 1, borderTopWidth: 1, gap: 13, paddingVertical: 14 },
  envelopeGlyph: { alignItems: 'center', gap: 4, justifyContent: 'flex-end', minHeight: 49 },
  envelopeLabel: { fontSize: 7, letterSpacing: 0.6 },
  envelopeSlot: { alignItems: 'center', borderWidth: 1, flex: 1, height: 68, justifyContent: 'center' },
  envelopeSlotIndex: { fontSize: 23 },
  envelopeSlots: { flexDirection: 'row', gap: 7 },
  excludedBranch: { alignItems: 'center', borderTopWidth: 1, gap: 4, left: '50%', paddingTop: 7, position: 'absolute', top: 71, transform: [{ translateX: -55 }], width: 110 },
  excludedText: { fontSize: 7, letterSpacing: 0.8 },
  gateTitle: { fontSize: 61, lineHeight: 61 },
  glyphChoice: { alignItems: 'center', borderWidth: 1, flex: 1, gap: 3, minHeight: 105, padding: 10 },
  glyphChoices: { flexDirection: 'row', gap: 10 },
  glyphName: { fontSize: 8, letterSpacing: 1 },
  glyphSequence: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lookupEquals: { fontSize: 20 },
  lookupRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 13, minHeight: 51 },
  mappingEquals: { fontSize: 19 },
  mappingRow: { alignItems: 'center', flexDirection: 'row', gap: 17 },
  meterBand: { fontSize: 34 },
  meterCore: { alignItems: 'center', borderRadius: 70, height: 124, justifyContent: 'center', width: 124 },
  meterDial: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  meterTarget: { fontSize: 8, letterSpacing: 1 },
  meterTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  meterValue: { fontSize: 9 },
  miniBar: { width: 6 },
  miniBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 4, height: 30, width: 38 },
  mirrorRule: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 11, paddingTop: 11 },
  mirrorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  orderBlock: { gap: 12 },
  orderHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  orderSlot: { alignItems: 'center', borderBottomWidth: 2, flex: 1, justifyContent: 'center', minHeight: 54 },
  orderSlotText: { fontSize: 17, textAlign: 'center' },
  orderSlots: { flexDirection: 'row', gap: 7 },
  panelTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  prefix: { fontSize: 9 },
  routeFeedback: { fontSize: 13, lineHeight: 19, minHeight: 19 },
  privateStatus: { fontSize: 8, letterSpacing: 1, textAlign: 'center' },
  roleBadge: { borderWidth: 1, flex: 1, paddingHorizontal: 5, paddingVertical: 7 },
  roleBadgeRow: { flexDirection: 'row', gap: 6 },
  roleBadgeText: { fontSize: 7, letterSpacing: 0.7, textAlign: 'center' },
  roleCopy: { fontSize: 14, lineHeight: 20 },
  toneBar: { width: 32 },
  toneBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 25, height: 142, justifyContent: 'center' },
  toneColumn: { alignItems: 'center', gap: 8 },
  toneLabel: { fontSize: 7, letterSpacing: 0.6 },
  touchFallback: { fontSize: 12, lineHeight: 17, textAlign: 'center', textDecorationLine: 'underline' },
  valveRule: { alignItems: 'center', flexDirection: 'row', gap: 18 },
  valveRuleText: { flex: 1, fontSize: 22, lineHeight: 25 },
});

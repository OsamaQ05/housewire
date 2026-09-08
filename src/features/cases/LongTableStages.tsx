import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  validateLongTableArtifactOrder,
  type EnvelopeLevel,
  type LongTableArtifact,
  type LongTableArtifactId,
  type LongTableCase,
  type PhotoAnchor,
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
  HoldContact,
  PoseLock,
  QrMarker,
  QrScanner,
  RoleStepper,
  StagePanel,
  TechnicalLabel,
  WaitingPanel,
} from './CaseMissionPrimitives';

const AMBER = '#E4A84A';
const CREAM = '#F1E2C2';
const OXBLOOD = '#5D1F24';
const BOTTLE = '#153C35';
const CASE_ART = require('@/assets/art/long-table-case.png');

export interface LongTableStageProps {
  acoustic: ReturnType<typeof useAcousticMeter>;
  activeNodeId: string;
  completedProofKeys: readonly string[];
  crew: readonly CrewNode[];
  game: LongTableCase;
  motion: TerminalMotionSnapshot;
  onChangeNode: (nodeId: string) => void;
  onMiss: () => void;
  onProof: (proofKey: string) => Promise<boolean>;
  onSignal: (input: Omit<EscapeSignalEvent, 'kind' | 'missionId' | 'operationId' | 'nodeId' | 'observedAt'>) => Promise<boolean>;
  onStartMotion: () => void;
  play: ReturnType<typeof useHousewireSound>['play'];
  preview: boolean;
  signals: readonly (EscapeSignalEvent & { senderId: string; serverTime: number })[];
  stageIndex: number;
}

export function LongTableStageView(props: LongTableStageProps) {
  if (props.stageIndex === 0) return <PlacesStage {...props} />;
  if (props.stageIndex === 1) return <PhotographStage {...props} />;
  if (props.stageIndex === 2) return <KeepsakeStage {...props} />;
  if (props.stageIndex === 3) return <ServicePassStage {...props} />;
  return <LastBellStage {...props} />;
}

function PlacesStage(props: LongTableStageProps) {
  const { theme } = useHousewireTheme();
  const [attempt, setAttempt] = useState<LongTableArtifactId[]>([]);
  const [locallySet, setLocallySet] = useState(false);
  const [rejected, setRejected] = useState(false);
  const owned = props.game.artifacts.filter((artifact) => artifact.ownerNodeId === props.activeNodeId);
  const captain = props.activeNodeId === props.game.tableCaptainNodeId;
  const tableSet = props.preview
    ? locallySet
    : props.signals.some((signal) => signal.signal === 'table-set' && signal.senderId === props.game.tableCaptainNodeId);
  const already = props.completedProofKeys.includes(`seat-order:${props.activeNodeId}`);

  const verify = async () => {
    const result = validateLongTableArtifactOrder(props.game, attempt);
    if (result.status !== 'complete') {
      setAttempt((current) => current.slice(0, result.acceptedPrefixLength));
      setRejected(true);
      props.onMiss();
      props.play('warning', 0.38);
      setTimeout(() => setRejected(false), 700);
      return;
    }
    setLocallySet(true);
    props.play('ring', 0.42);
    if (!props.preview) await props.onSignal({ round: 1, signal: 'table-set' });
  };

  return (
    <CaseStageScaffold accent={AMBER} instruction="Each phone owns pieces from a different decade. Speak the clues, order the objects oldest to newest, then lay every phone flat around one surface." stageNumber={1} title="Take your places">
      <RoleStepper activeNodeId={props.activeNodeId} crew={props.crew} enabled={props.preview} onChange={props.onChangeNode} />
      <View style={styles.placeHeader}>
        <View style={[styles.plateRing, { borderColor: AMBER }]}><View style={[styles.plateCore, { borderColor: CREAM }]}><Ionicons color={AMBER} name="restaurant-outline" size={31} /></View></View>
        <View style={styles.placeHeaderCopy}>
          <TechnicalLabel color={AMBER}>{captain ? 'YOU HOLD THE SERVICE LEDGER' : 'YOUR OBJECTS · KEEP THEM PRIVATE UNTIL ASKED'}</TechnicalLabel>
          <Text style={[styles.placeHeadline, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{captain ? 'Call the decades.' : 'You remember these.'}</Text>
        </View>
      </View>

      <View style={styles.artifactStack}>
        {owned.map((artifact) => <ArtifactTicket artifact={artifact} key={artifact.id} />)}
      </View>

      {captain && !tableSet ? (
        <View style={[styles.ledger, { borderColor: rejected ? theme.colors.fault : AMBER }]}> 
          <TechnicalLabel color={rejected ? theme.colors.fault : AMBER}>SERVICE LEDGER · OLDEST → NEWEST</TechnicalLabel>
          <View style={styles.orderSlots}>
            {props.game.artifactOrder.map((_, index) => (
              <View key={index} style={[styles.orderSlot, { borderColor: attempt[index] ? AMBER : theme.colors.draft }]}>
                <Text numberOfLines={1} style={[styles.orderSlotText, { color: attempt[index] ? theme.colors.text : theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>{attempt[index] ?? `0${index + 1}`}</Text>
              </View>
            ))}
          </View>
          <View style={styles.choiceWrap}>
            {props.game.artifacts.map((artifact) => (
              <ChoiceChip accent={AMBER} disabled={attempt.includes(artifact.id)} key={artifact.id} label={artifact.id} onPress={() => setAttempt((current) => [...current, artifact.id])} />
            ))}
          </View>
          <View style={styles.twoActions}>
            <ActionButton accent={AMBER} disabled={!attempt.length} label="Undo" onPress={() => setAttempt((current) => current.slice(0, -1))} secondary />
            <ActionButton accent={AMBER} disabled={attempt.length !== 4} icon="restaurant-outline" label="Set the table" onPress={() => void verify()} />
          </View>
        </View>
      ) : null}

      {!captain && !tableSet ? <WaitingPanel accent={AMBER} detail={`${crewName(props.game.tableCaptainNodeId, props.crew)} is arranging the service ledger. Describe your objects without showing the screen.`} title="The ledger needs your decade." /> : null}
      {tableSet && !already ? <PoseLock accent={AMBER} motion={props.motion} onArmMotion={props.onStartMotion} onComplete={() => void props.onProof('seat-order')} pose="FLAT" /> : null}
      {already ? <WaitingPanel accent={AMBER} detail="Keep this phone flat. Every place must settle inside the same eight-second service window." title="Your place is set." /> : null}
    </CaseStageScaffold>
  );
}

function ArtifactTicket({ artifact }: { artifact: LongTableArtifact }) {
  const { theme } = useHousewireTheme();
  return (
    <Animated.View entering={FadeInDown.duration(280)} style={[styles.ticket, { backgroundColor: CREAM }]}> 
      <View style={styles.ticketIcon}><Ionicons color={OXBLOOD} name={artifact.icon} size={34} /></View>
      <View style={styles.ticketCopy}>
        <Text style={[styles.ticketTitle, { color: '#281D17', fontFamily: theme.typography.families.displayHeavy }]}>{artifact.id}</Text>
        <Text style={[styles.ticketClue, { color: '#594638', fontFamily: theme.typography.families.body }]}>{artifact.clue}</Text>
      </View>
      <View style={styles.ticketNotch} />
    </Animated.View>
  );
}

function PhotographStage(props: LongTableStageProps) {
  const { theme } = useHousewireTheme();
  const [selectedAnchors, setSelectedAnchors] = useState<PhotoAnchor[]>([]);
  const [rejected, setRejected] = useState(false);
  const fragments = props.game.photograph.fragments.filter((fragment) => fragment.ownerNodeId === props.activeNodeId);
  const keeper = props.activeNodeId === props.game.photograph.keeperNodeId;
  const ruleOwner = props.activeNodeId === props.game.photograph.ruleOwnerNodeId;
  const expectedAnchors = props.game.photograph.readOrder.map((position) =>
    props.game.photograph.fragments.find((fragment) => fragment.position === position)?.anchor,
  );
  const submit = async () => {
    if (selectedAnchors.some((anchor, index) => anchor !== expectedAnchors[index])) {
      setSelectedAnchors([]);
      setRejected(true);
      props.onMiss();
      props.play('warning', 0.36);
      setTimeout(() => setRejected(false), 700);
      return;
    }
    await props.onProof('photo-code');
  };
  return (
    <CaseStageScaffold accent={AMBER} instruction="Each torn corner hides an object riddle. Solve all four, then let the rule keeper call the order while the Photo Keeper rebuilds the picture." stageNumber={2} title="The stolen photograph">
      <RoleStepper activeNodeId={props.activeNodeId} crew={props.crew} enabled={props.preview} onChange={props.onChangeNode} />
      <View style={styles.photoWell}>
        <Image contentFit="cover" source={CASE_ART} style={StyleSheet.absoluteFill} />
        <View style={styles.photoShade} />
        <View style={styles.photoFrame} />
        <Text style={[styles.photoStamp, { color: CREAM, fontFamily: theme.typography.families.monoMedium }]}>MEAL / RECORD DAMAGED</Text>
      </View>
      {fragments.map((fragment) => <PhotoFragment fragment={fragment} key={fragment.position} />)}
      {ruleOwner ? (
        <View style={[styles.ruleStrip, { backgroundColor: OXBLOOD }]}> 
          <TechnicalLabel color={CREAM}>PRIVATE READING RULE</TechnicalLabel>
          <View style={styles.ruleOrder}>{props.game.photograph.readOrder.map((position, index) => <View key={position} style={styles.ruleStep}><Text style={[styles.ruleIndex, { color: AMBER, fontFamily: theme.typography.families.displayHeavy }]}>{index + 1}</Text><Text style={[styles.rulePosition, { color: CREAM, fontFamily: theme.typography.families.monoMedium }]}>{position}</Text></View>)}</View>
        </View>
      ) : null}
      {keeper ? (
        <View style={[styles.keypadPanel, { borderColor: rejected ? theme.colors.fault : AMBER }]}> 
          <TechnicalLabel color={rejected ? theme.colors.fault : AMBER}>PHOTO KEEPER · REBUILD THE FOUR CORNERS</TechnicalLabel>
          <View style={styles.photoSlots}>{Array.from({ length: 4 }, (_, index) => { const anchor = selectedAnchors[index]; return <View key={index} style={[styles.photoSlot, { borderColor: anchor ? AMBER : theme.colors.draft }]}>{anchor ? <><Ionicons color={AMBER} name={photoIcon(anchor)} size={25} /><Text style={[styles.photoSlotName, { color: CREAM, fontFamily: theme.typography.families.monoMedium }]}>{anchor}</Text></> : <Text style={[styles.photoSlotIndex, { color: theme.colors.faint, fontFamily: theme.typography.families.displayHeavy }]}>{index + 1}</Text>}</View>; })}</View>
          <View style={styles.anchorGrid}>{(['KEY', 'CASSETTE', 'CAMERA', 'GAME PAD'] as const).filter((anchor) => !selectedAnchors.includes(anchor)).map((anchor) => <Pressable accessibilityLabel={`Place ${anchor} next`} accessibilityRole="button" key={anchor} onPress={() => setSelectedAnchors((current) => current.length < 4 ? [...current, anchor] : current)} style={[styles.anchorButton, { borderColor: theme.colors.draft }]}><Ionicons color={AMBER} name={photoIcon(anchor)} size={29} /><Text style={[styles.anchorName, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{anchor}</Text></Pressable>)}</View>
          <View style={styles.twoActions}><ActionButton accent={AMBER} disabled={!selectedAnchors.length} label="Undo" onPress={() => setSelectedAnchors((current) => current.slice(0, -1))} secondary /><ActionButton accent={AMBER} disabled={selectedAnchors.length !== 4} icon="camera-outline" label="Develop photo" onPress={() => void submit()} /></View>
        </View>
      ) : <WaitingPanel accent={AMBER} detail={`${crewName(props.game.photograph.keeperNodeId, props.crew)} holds the photo dial. Speak only the fragments this phone owns.`} />}
    </CaseStageScaffold>
  );
}

function PhotoFragment({ fragment }: { fragment: LongTableCase['photograph']['fragments'][number] }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={[styles.fragment, { borderColor: AMBER }]}> 
      <View style={styles.fragmentIcon}><Ionicons color={AMBER} name="help" size={35} /></View>
      <View style={styles.fragmentCopy}><TechnicalLabel color={AMBER}>{fragment.position} TORN CORNER</TechnicalLabel><Text style={[styles.fragmentRiddle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{PHOTO_RIDDLES[fragment.anchor]}</Text></View>
    </View>
  );
}

const PHOTO_RIDDLES: Readonly<Record<PhotoAnchor, string>> = {
  KEY: 'Small metal teeth, but I never eat. I make a locked room surrender.',
  CASSETTE: 'Two tiny reels remember a voice, but only when I am turned.',
  CAMERA: 'I borrow a moment through one glass eye and give it back later.',
  'GAME PAD': 'Two thumbs steer worlds that fit inside a screen.',
};

function KeepsakeStage(props: LongTableStageProps) {
  const { theme } = useHousewireTheme();
  const [previewFramed, setPreviewFramed] = useState<number[]>([]);
  const currentIndex = props.game.keepsakes.findIndex((assignment) => !props.completedProofKeys.includes(`keepsake:${assignment.round}`));
  const assignment = props.game.keepsakes[Math.max(0, currentIndex)];
  const finished = currentIndex < 0;
  const seeker = assignment && props.activeNodeId === assignment.seekerNodeId;
  const witness = assignment && props.activeNodeId === assignment.witnessNodeId;
  const framed = assignment && (props.preview
    ? previewFramed.includes(assignment.round)
    : props.signals.some((signal) => signal.signal === 'keepsake-framed' && signal.round === assignment.round && signal.senderId === assignment.seekerNodeId && signal.targetNodeId === assignment.witnessNodeId));
  if (finished) return <WaitingPanel accent={AMBER} detail="Every object was witnessed in person. No image left the phone." title="The house accepts what stayed." />;
  const frame = async () => {
    setPreviewFramed((current) => [...new Set([...current, assignment.round])]);
    props.play('accept', 0.42);
    if (!props.preview) await props.onSignal({ round: assignment.round, signal: 'keepsake-framed', targetNodeId: assignment.witnessNodeId, value: assignment.markerToken.slice(-16) });
  };
  return (
    <CaseStageScaffold accent={AMBER} instruction={`Object ${assignment.round} of ${props.game.keepsakes.length}. Find it in the real home. A different family member must inspect and confirm it.`} stageNumber={3} title="What the house kept">
      <RoleStepper activeNodeId={props.activeNodeId} crew={props.crew} enabled={props.preview} onChange={props.onChangeNode} />
      <View style={[styles.promptPlate, { backgroundColor: BOTTLE }]}> 
        <Ionicons color={CREAM} name="home-outline" size={31} />
        <Text style={[styles.promptText, { color: CREAM, fontFamily: theme.typography.families.storyBold }]}>{assignment.prompt}</Text>
      </View>
      {seeker && !framed ? <KeepsakeCamera onFramed={() => void frame()} /> : null}
      {seeker && framed ? <WaitingPanel accent={AMBER} detail={`${crewName(assignment.witnessNodeId, props.crew)} must walk over, inspect the real object, and hold their witness seal.`} title="Object framed." /> : null}
      {witness && !framed ? <WaitingPanel accent={AMBER} detail={`${crewName(assignment.seekerNodeId, props.crew)} is finding the object. Do not accept a description from across the room—inspect it beside them.`} title="You are the witness." /> : null}
      {witness && framed ? <StagePanel tone={AMBER}><TechnicalLabel color={AMBER}>IN-PERSON WITNESS · IMAGE NEVER SENT</TechnicalLabel><HoldContact accent={AMBER} durationMs={1_400} label="I inspected this object" onComplete={() => void props.onProof(`keepsake:${assignment.round}`)} /></StagePanel> : null}
      {!seeker && !witness ? <WaitingPanel accent={AMBER} detail={`${crewName(assignment.seekerNodeId, props.crew)} is searching; ${crewName(assignment.witnessNodeId, props.crew)} must verify.`} /> : null}
    </CaseStageScaffold>
  );
}

function KeepsakeCamera({ onFramed }: { onFramed: () => void }) {
  const { theme } = useHousewireTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [open, setOpen] = useState(false);
  const [fallback, setFallback] = useState(false);
  const openLens = async () => {
    const result = permission?.granted ? permission : await requestPermission();
    if (result.granted) setOpen(true);
    else setFallback(true);
  };
  if (!open) return <StagePanel tone={AMBER}><TechnicalLabel color={AMBER}>OBJECT LENS · LIVE VIEW ONLY</TechnicalLabel><Text style={[styles.cameraPrivacy, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Nothing is photographed, uploaded, recognized, or saved. Another person—not an algorithm—confirms the object.</Text><ActionButton accent={AMBER} disabled={permission?.canAskAgain === false && !fallback} icon="camera-outline" label="Open object lens" onPress={() => void openLens()} />{fallback || permission?.canAskAgain === false ? <HoldContact accent={AMBER} durationMs={1_200} label="Use in-person inspection" onComplete={onFramed} /> : null}</StagePanel>;
  return (
    <View style={styles.keepsakeLens}>
      <CameraView facing="back" onMountError={() => { setOpen(false); setFallback(true); }} style={StyleSheet.absoluteFill} />
      <View style={styles.keepsakeShade} />
      <View style={[styles.objectReticle, { borderColor: AMBER }]}><View style={[styles.reticleDot, { backgroundColor: AMBER }]} /></View>
      <Pressable accessibilityLabel="Close camera" accessibilityRole="button" onPress={() => setOpen(false)} style={styles.closeLens}><Ionicons color={CREAM} name="close" size={23} /></Pressable>
      <View style={styles.lensFooter}><TechnicalLabel color={CREAM}>FIT ONE REAL OBJECT INSIDE THE PLATE</TechnicalLabel><HoldContact accent={AMBER} durationMs={1_500} label="Frame this object" onComplete={() => { setOpen(false); onFramed(); }} /></View>
    </View>
  );
}

function ServicePassStage(props: LongTableStageProps) {
  const { theme } = useHousewireTheme();
  const currentIndex = props.game.serviceRoute.findIndex((step) => !props.completedProofKeys.includes(`pass:${step.step}`));
  const step = props.game.serviceRoute[Math.max(0, currentIndex)];
  const finished = currentIndex < 0;
  const [poseReadyStep, setPoseReadyStep] = useState<number>();
  const [scannedStep, setScannedStep] = useState<number>();
  useEffect(() => {
    setPoseReadyStep(undefined);
    setScannedStep(undefined);
  }, [step?.step]);
  if (finished) return <WaitingPanel accent={AMBER} detail="The service route reached every place at the table." title="Pass complete." />;
  const courier = props.activeNodeId === step.courierNodeId;
  const station = props.activeNodeId === step.stationOwnerNodeId;
  return (
    <CaseStageScaffold accent={AMBER} instruction={`Pass ${step.step} of ${props.game.serviceRoute.length}. The courier locks a pose, walks to the named person, then scans that person's place seal.`} stageNumber={4} title="Run the service pass">
      <RoleStepper activeNodeId={props.activeNodeId} crew={props.crew} enabled={props.preview} onChange={props.onChangeNode} />
      <View style={styles.routeBand}><View style={[styles.routeNode, { backgroundColor: OXBLOOD }]}><Text style={[styles.routeInitials, { color: CREAM, fontFamily: theme.typography.families.displayHeavy }]}>{initials(crewName(step.courierNodeId, props.crew))}</Text></View><View style={[styles.routeLine, { backgroundColor: AMBER }]} /><Ionicons color={AMBER} name="restaurant" size={23} /><View style={[styles.routeLine, { backgroundColor: AMBER }]} /><View style={[styles.routeNode, { backgroundColor: BOTTLE }]}><Text style={[styles.routeInitials, { color: CREAM, fontFamily: theme.typography.families.displayHeavy }]}>{initials(crewName(step.stationOwnerNodeId, props.crew))}</Text></View></View>
      {station ? <QrMarker accent={AMBER} label={`PLACE SEAL ${step.step}`} token={step.markerToken} /> : null}
      {courier && poseReadyStep !== step.step ? <PoseLock accent={AMBER} motion={props.motion} onArmMotion={props.onStartMotion} onComplete={() => setPoseReadyStep(step.step)} pose={step.requiredPose} /> : null}
      {courier && poseReadyStep === step.step && scannedStep !== step.step ? <><StagePanel tone={AMBER}><TechnicalLabel color={AMBER}>POSE LOCKED · WALK TO {crewName(step.stationOwnerNodeId, props.crew).toUpperCase()}</TechnicalLabel><Text style={[styles.passCopy, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Stop beside them before opening the lens.</Text></StagePanel><QrScanner accent={AMBER} expectedToken={step.markerToken} onScanned={() => setScannedStep(step.step)} /></> : null}
      {courier && scannedStep === step.step ? <ActionButton accent={AMBER} icon="checkmark" label="Serve this place" onPress={() => void props.onProof(`pass:${step.step}`)} /> : null}
      {!courier && !station ? <WaitingPanel accent={AMBER} detail={`${crewName(step.courierNodeId, props.crew)} is moving toward ${crewName(step.stationOwnerNodeId, props.crew)}.`} /> : null}
    </CaseStageScaffold>
  );
}

function LastBellStage(props: LongTableStageProps) {
  const { theme } = useHousewireTheme();
  const assignment = props.game.finale.assignments.find((item) => item.nodeId === props.activeNodeId);
  const [poseReady, setPoseReady] = useState<string[]>([]);
  const [voiceReady, setVoiceReady] = useState<string[]>([]);
  const already = props.completedProofKeys.includes(`last-bell:${props.activeNodeId}`);
  if (!assignment) return <WaitingPanel accent={AMBER} detail="This phone has no final place assignment." />;
  const poseLocked = poseReady.includes(props.activeNodeId);
  const voiceLocked = voiceReady.includes(props.activeNodeId);
  return (
    <CaseStageScaffold accent={AMBER} instruction="Lock your private position and sound level. On the final bell, every person holds the rim inside the same eight-second window." stageNumber={5} title="Serve as one">
      <RoleStepper activeNodeId={props.activeNodeId} crew={props.crew} enabled={props.preview} onChange={(nodeId) => { void props.acoustic.stop(); props.onChangeNode(nodeId); }} />
      <View style={styles.finalPlate}>
        <View style={[styles.finalOuter, { borderColor: AMBER }]} />
        <View style={[styles.finalInner, { borderColor: CREAM }]} />
        <Ionicons color={AMBER} name="restaurant-outline" size={47} />
        <Text style={[styles.finalName, { color: CREAM, fontFamily: theme.typography.families.storyBold }]}>{crewName(props.activeNodeId, props.crew)}</Text>
      </View>
      {already ? <WaitingPanel accent={AMBER} detail="Keep your place held while the remaining settings lock." title="Your place is served." /> : null}
      {!already && !poseLocked ? <PoseLock accent={AMBER} motion={props.motion} onArmMotion={props.onStartMotion} onComplete={() => setPoseReady((current) => [...new Set([...current, props.activeNodeId])])} pose={assignment.pose} /> : null}
      {!already && poseLocked && !voiceLocked ? <VoiceSetting acoustic={props.acoustic} expected={assignment.voiceLevel} onComplete={() => setVoiceReady((current) => [...new Set([...current, props.activeNodeId])])} /> : null}
      {!already && poseLocked && voiceLocked ? <StagePanel tone={AMBER}><TechnicalLabel color={AMBER}>POSITION + SOUND LOCKED · WAIT FOR THE BELL</TechnicalLabel><HoldContact accent={AMBER} durationMs={1_700} label="Hold the plate rim" onComplete={() => { props.play('ring', 0.68); void props.onProof('last-bell'); }} /><Text style={[styles.finalHint, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>In live play, every connected phone must hold within eight seconds.</Text></StagePanel> : null}
    </CaseStageScaffold>
  );
}

function VoiceSetting({ acoustic, expected, onComplete }: { acoustic: ReturnType<typeof useAcousticMeter>; expected: EnvelopeLevel; onComplete: () => void }) {
  const { theme } = useHousewireTheme();
  const [touch, setTouch] = useState(false);
  const finish = async () => { await acoustic.stop(); onComplete(); };
  if (expected === 'REST') return <StagePanel tone={BOTTLE}><TechnicalLabel color={CREAM}>YOUR COURSE IS SILENCE</TechnicalLabel><HoldContact accent={AMBER} durationMs={1_200} label="Hold a quiet place" onComplete={onComplete} /></StagePanel>;
  return (
    <StagePanel tone={acoustic.band === expected ? AMBER : BOTTLE}>
      <TechnicalLabel color={AMBER}>PRIVATE SOUND SETTING · {expected}</TechnicalLabel>
      <View style={styles.voiceMeter}><View style={[styles.voiceCore, { backgroundColor: acoustic.band === 'STRONG' ? AMBER : acoustic.band === 'SOFT' ? CREAM : BOTTLE }]}><Text style={[styles.voiceBand, { color: acoustic.band === 'STRONG' ? '#281D17' : theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{acoustic.band}</Text></View><Text style={[styles.voiceDb, { color: theme.colors.muted, fontFamily: theme.typography.families.mono }]}>{Math.round(acoustic.levelDecibels)} dBFS</Text></View>
      {!acoustic.active && !touch ? <ActionButton accent={AMBER} icon="mic-outline" label="Arm room sound" onPress={() => void acoustic.start()} /> : null}
      {acoustic.active ? <ActionButton accent={AMBER} disabled={acoustic.band !== expected} icon="radio-button-on" label={`Lock ${expected}`} onPress={() => void finish()} /> : null}
      {acoustic.permissionDenied || touch ? <HoldContact accent={AMBER} durationMs={1_250} label={`Hold ${expected}`} onComplete={onComplete} /> : <ActionButton accent={AMBER} label="Use pressure control" onPress={() => { void acoustic.stop(); setTouch(true); }} secondary />}
    </StagePanel>
  );
}

function photoIcon(anchor: PhotoAnchor): keyof typeof Ionicons.glyphMap {
  if (anchor === 'KEY') return 'key-outline';
  if (anchor === 'CASSETTE') return 'musical-notes-outline';
  if (anchor === 'CAMERA') return 'camera-outline';
  return 'game-controller-outline';
}

function crewName(nodeId: string, crew: readonly CrewNode[]) {
  return crew.find((node) => node.id === nodeId)?.name ?? `Place ${nodeId.slice(-2)}`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '•';
}

const styles = StyleSheet.create({
  anchorButton: { alignItems: 'center', borderWidth: 1, flexBasis: '46%', flexDirection: 'row', flexGrow: 1, gap: 9, minHeight: 58, paddingHorizontal: 11 },
  anchorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  anchorName: { flex: 1, fontSize: 12 },
  artifactStack: { gap: 9 },
  cameraPrivacy: { fontSize: 13, lineHeight: 19 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  closeLens: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.52)', height: 42, justifyContent: 'center', position: 'absolute', right: 12, top: 12, width: 42 },
  codeDisplay: { fontSize: 58, letterSpacing: 12, lineHeight: 65, textAlign: 'center' },
  finalHint: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  finalInner: { borderRadius: 99, borderWidth: 1, height: 150, position: 'absolute', width: 150 },
  finalName: { bottom: 17, fontSize: 19, position: 'absolute' },
  finalOuter: { borderRadius: 99, borderWidth: 2, height: 194, position: 'absolute', width: 194 },
  finalPlate: { alignItems: 'center', backgroundColor: '#17130E', height: 230, justifyContent: 'center', overflow: 'hidden' },
  fragment: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: 13, minHeight: 82, paddingVertical: 10 },
  fragmentCopy: { flex: 1 },
  fragmentIcon: { alignItems: 'center', height: 48, justifyContent: 'center', width: 48 },
  fragmentName: { fontSize: 25, lineHeight: 27 },
  fragmentRiddle: { fontSize: 17, lineHeight: 21 },
  keepsakeLens: { borderWidth: 1, height: 440, justifyContent: 'center', overflow: 'hidden' },
  keepsakeShade: { backgroundColor: 'rgba(16,8,2,0.18)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  key: { alignItems: 'center', borderWidth: 1, flexBasis: '29%', flexGrow: 1, height: 54, justifyContent: 'center' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  keypadPanel: { borderWidth: 1, gap: 12, padding: 15 },
  keyText: { fontSize: 25 },
  ledger: { borderWidth: 1, gap: 13, padding: 14 },
  lensFooter: { backgroundColor: 'rgba(20,13,7,0.86)', bottom: 0, gap: 10, left: 0, padding: 14, position: 'absolute', right: 0 },
  objectReticle: { alignItems: 'center', alignSelf: 'center', borderRadius: 150, borderWidth: 2, height: 240, justifyContent: 'center', width: 240 },
  orderSlot: { alignItems: 'center', borderBottomWidth: 2, flex: 1, height: 46, justifyContent: 'center' },
  orderSlots: { flexDirection: 'row', gap: 6 },
  orderSlotText: { fontSize: 8, letterSpacing: 0.4, textAlign: 'center' },
  perforation: { height: 5, width: 9 },
  perforations: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'flex-end', width: 34 },
  photoFrame: { borderColor: AMBER, borderWidth: 1, bottom: 16, left: 16, position: 'absolute', right: 16, top: 16 },
  photoShade: { backgroundColor: 'rgba(28,15,6,0.30)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  photoStamp: { bottom: 27, fontSize: 8, left: 27, letterSpacing: 1.2, position: 'absolute' },
  photoSlot: { alignItems: 'center', borderWidth: 1, flex: 1, gap: 3, height: 76, justifyContent: 'center', paddingHorizontal: 3 },
  photoSlotIndex: { fontSize: 25 },
  photoSlotName: { fontSize: 7, letterSpacing: 0.5, textAlign: 'center' },
  photoSlots: { flexDirection: 'row', gap: 6 },
  photoWell: { height: 220, overflow: 'hidden' },
  placeHeader: { alignItems: 'center', flexDirection: 'row', gap: 15 },
  placeHeaderCopy: { flex: 1, gap: 3 },
  placeHeadline: { fontSize: 28, lineHeight: 29 },
  plateCore: { alignItems: 'center', borderRadius: 32, borderWidth: 1, height: 64, justifyContent: 'center', width: 64 },
  plateRing: { alignItems: 'center', borderRadius: 39, borderWidth: 2, height: 78, justifyContent: 'center', width: 78 },
  promptPlate: { alignItems: 'center', borderBottomLeftRadius: 90, borderBottomRightRadius: 90, borderTopLeftRadius: 90, borderTopRightRadius: 90, flexDirection: 'row', gap: 16, minHeight: 118, paddingHorizontal: 24, paddingVertical: 20 },
  promptText: { flex: 1, fontSize: 22, lineHeight: 25 },
  reticleDot: { borderRadius: 5, height: 8, width: 8 },
  routeBand: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  routeInitials: { fontSize: 20 },
  routeLine: { height: 1, width: 48 },
  routeNode: { alignItems: 'center', borderRadius: 32, height: 62, justifyContent: 'center', width: 62 },
  ruleIndex: { fontSize: 26 },
  ruleOrder: { flexDirection: 'row', gap: 6 },
  rulePosition: { fontSize: 7, letterSpacing: 0.45 },
  ruleStep: { alignItems: 'center', flex: 1, gap: 1 },
  ruleStrip: { gap: 11, padding: 16 },
  ticket: { alignItems: 'center', flexDirection: 'row', gap: 13, minHeight: 112, overflow: 'hidden', padding: 14 },
  ticketClue: { fontSize: 12, lineHeight: 17 },
  ticketCopy: { flex: 1, gap: 3 },
  ticketIcon: { alignItems: 'center', borderColor: OXBLOOD, borderRadius: 35, borderWidth: 1, height: 66, justifyContent: 'center', width: 66 },
  ticketNotch: { backgroundColor: '#0B0E0D', borderRadius: 12, height: 24, position: 'absolute', right: -12, width: 24 },
  ticketTitle: { fontSize: 25, lineHeight: 27 },
  twoActions: { flexDirection: 'row', gap: 8 },
  voiceBand: { fontSize: 23 },
  voiceCore: { alignItems: 'center', borderRadius: 45, height: 88, justifyContent: 'center', width: 88 },
  voiceDb: { fontSize: 9 },
  voiceMeter: { alignItems: 'center', gap: 7 },
  passCopy: { fontSize: 24, lineHeight: 27 },
});

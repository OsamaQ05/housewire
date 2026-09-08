import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlyphMark } from '@/src/components';
import {
  validateNightGlassMazePath,
  type Bearing,
  type NightGlassCase,
  type NightGlassMaze,
} from '@/src/domain/escape-case-compiler';
import type { EscapeSignalEvent } from '@/src/features/session';
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

const ACCENT = '#9AE9F5';
const RED = '#FF3B32';

const NIGHT_ROOMS: Record<number, { icon: keyof typeof Ionicons.glyphMap; name: string }> = {
  1: { icon: 'flame-outline', name: 'LANTERN' },
  2: { icon: 'diamond-outline', name: 'MIRROR' },
  3: { icon: 'notifications-outline', name: 'BELL' },
  4: { icon: 'key-outline', name: 'KEY' },
  5: { icon: 'eye-outline', name: 'EYE' },
  6: { icon: 'book-outline', name: 'BOOK' },
  7: { icon: 'time-outline', name: 'CLOCK' },
  8: { icon: 'exit-outline', name: 'DOOR' },
  9: { icon: 'moon-outline', name: 'MOON' },
};

export interface NightGlassStageProps {
  activeNodeId: string;
  completedProofKeys: readonly string[];
  crew: readonly CrewNode[];
  game: NightGlassCase;
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

export function NightGlassStageView(props: NightGlassStageProps) {
  if (props.stageIndex === 0) return <ThresholdStage {...props} />;
  if (props.stageIndex === 1) return <ParallaxStage {...props} />;
  if (props.stageIndex === 2) return <MazeStage {...props} />;
  if (props.stageIndex === 3) return <CorridorStage {...props} />;
  return <FoldStage {...props} />;
}

function ThresholdStage(props: NightGlassStageProps) {
  const { theme } = useHousewireTheme();
  const assignment = props.game.threshold.assignments.find((item) => item.nodeId === props.activeNodeId);
  if (!assignment) return <WaitingPanel accent={ACCENT} detail="This monitor is outside the three-pane threshold." />;
  const already = props.completedProofKeys.includes(`threshold:${props.activeNodeId}`);
  return (
    <CaseStageScaffold accent={ACCENT} instruction="Every phone is one pane. Hold your assigned angle until the broken red threshold becomes one line." stageNumber={1} title="Draw the threshold">
      <RoleStepper activeNodeId={props.activeNodeId} crew={props.crew} enabled={props.preview} onChange={props.onChangeNode} />
      <View style={styles.thresholdView}>
        <View style={[styles.thresholdGhost, { borderColor: theme.colors.draft }]} />
        <View style={[styles.thresholdLine, { backgroundColor: RED, transform: [{ rotate: poseLineRotation(assignment.pose) }] }]} />
        <View style={styles.thresholdCopy}>
          <TechnicalLabel color={RED}>PANE {props.game.nodeIds.indexOf(props.activeNodeId) + 1}</TechnicalLabel>
          <Text style={[styles.thresholdTitle, { color: '#F5F1E8', fontFamily: theme.typography.families.storyBold }]}>The line continues off-screen.</Text>
        </View>
      </View>
      {already ? <WaitingPanel accent={ACCENT} detail="Your pane is locked. Hold the phone while the remaining red edges align." title="Threshold held." /> : <PoseLock accent={RED} motion={props.motion} onArmMotion={props.onStartMotion} onComplete={() => void props.onProof('threshold')} pose={assignment.pose} />}
    </CaseStageScaffold>
  );
}

function poseLineRotation(pose: string) {
  if (pose === 'LEFT') return '-14deg';
  if (pose === 'RIGHT') return '14deg';
  if (pose === 'AWAY') return '7deg';
  if (pose === 'TOWARD') return '-7deg';
  return '0deg';
}

function ParallaxStage(props: NightGlassStageProps) {
  const { theme } = useHousewireTheme();
  const index = props.game.parallaxRounds.findIndex((round) => !props.completedProofKeys.includes(`parallax:${round.round}`));
  const round = props.game.parallaxRounds[Math.max(0, index)];
  const finished = index < 0;
  const [soloHingeRound, setSoloHingeRound] = useState<number>();
  const [scanned, setScanned] = useState(false);
  const [bearing, setBearing] = useState<Bearing>();
  if (finished) return <WaitingPanel accent={ACCENT} detail="All three optical bearings are fixed. The reflected floorplan is surfacing." title="Doors found." />;
  const watcher = props.activeNodeId === round.watcherNodeId;
  const frame = props.activeNodeId === round.frameNodeId;
  const hinge = props.activeNodeId === round.hingeNodeId;
  const ownsTarget = props.activeNodeId === round.targetClueOwnerNodeId;
  const hingeLocked = props.preview
    ? soloHingeRound === round.round
    : props.signals.some((signal) => signal.round === round.round && signal.signal === 'frame-locked' && signal.senderId === round.hingeNodeId);
  const lockHinge = async () => {
    if (props.preview) setSoloHingeRound(round.round);
    else await props.onSignal({ round: round.round, signal: 'frame-locked', targetNodeId: round.watcherNodeId });
  };
  const submit = async () => {
    if (bearing !== round.revealedBearing || !scanned || !hingeLocked) {
      props.onMiss();
      props.play('warning', 0.35);
      return;
    }
    const accepted = await props.onProof(`parallax:${round.round}`);
    if (!accepted) return;
    setScanned(false);
    setBearing(undefined);
    setSoloHingeRound(undefined);
  };
  return (
    <CaseStageScaffold accent={ACCENT} instruction={`Optical door ${round.round} of 3. Frame, Hinge, and Watcher cause one view that none can create alone.`} stageNumber={2} title="Parallax doors">
      <RoleStepper activeNodeId={props.activeNodeId} crew={props.crew} enabled={props.preview} onChange={props.onChangeNode} />
      <View style={styles.roleRail}>
        <RoleBadge active={watcher} icon="scan-outline" label="WATCHER" />
        <RoleBadge active={frame} icon="tablet-landscape-outline" label="FRAME" />
        <RoleBadge active={hinge} icon="move-outline" label="HINGE" />
      </View>
      {ownsTarget ? (
        <StagePanel tone={ACCENT}>
          <TechnicalLabel color={ACCENT}>TARGET ETCHED IN THIS PANE</TechnicalLabel>
          <View style={styles.targetGlyph}><GlyphMark color={theme.colors.text} glyph={round.targetGlyph} size={94} /><Text style={[styles.targetName, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{round.targetGlyph}</Text></View>
        </StagePanel>
      ) : null}
      {frame ? <QrMarker accent={RED} label={`OPTICAL FRAME ${round.round}`} token={round.markerToken} /> : null}
      {hinge ? (
        <View style={styles.hingeStack}>
          <TechnicalLabel color={RED}>YOU CONTROL A DOOR YOU CANNOT SEE</TechnicalLabel>
          <PoseLock accent={RED} motion={props.motion} onArmMotion={props.onStartMotion} onComplete={() => void lockHinge()} pose={round.requiredPose} />
          {hingeLocked ? <TechnicalLabel color={ACCENT}>HINGE LOCKED · TELL THE WATCHER</TechnicalLabel> : null}
        </View>
      ) : null}
      {watcher ? (
        <>
          {!scanned ? <QrScanner accent={ACCENT} expectedToken={round.markerToken} onScanned={() => setScanned(true)} /> : (
            <StagePanel tone={hingeLocked ? RED : theme.colors.warning}>
              <ParallaxLens bearing={round.revealedBearing} hingeLocked={hingeLocked} />
              <TechnicalLabel color={hingeLocked ? ACCENT : theme.colors.warning}>{hingeLocked ? 'THE CAMERA-ONLY DOOR HAS MOVED' : 'WAIT FOR THE HINGE TO TILT'}</TechnicalLabel>
              <View style={styles.bearingRow}>{(['N', 'E', 'S', 'W'] as const).map((item) => <ChoiceChip accent={RED} key={item} label={item} onPress={() => setBearing(item)} selected={bearing === item} />)}</View>
              <ActionButton accent={RED} disabled={!hingeLocked || !bearing} icon="compass-outline" label="Fix this bearing" onPress={() => void submit()} />
            </StagePanel>
          )}
        </>
      ) : null}
    </CaseStageScaffold>
  );
}

function ParallaxLens({ bearing, hingeLocked }: { bearing: Bearing; hingeLocked: boolean }) {
  const { theme } = useHousewireTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [permissionError, setPermissionError] = useState(false);
  const live = permission?.granted === true;
  const openLiveLayer = async () => {
    const result = await requestPermission();
    setPermissionError(!result.granted);
  };
  return (
    <View style={styles.lensStack}>
      <View
        accessibilityLabel={live ? 'Live rear camera with impossible door overlay' : 'Simulated impossible door lens'}
        style={styles.lensWindow}
      >
        {live ? <CameraView facing="back" style={StyleSheet.absoluteFill} /> : <View style={styles.simulatedLens} />}
        <View style={styles.lensShade} />
        <View style={[styles.lensScanline, styles.lensScanlineTop, { backgroundColor: ACCENT }]} />
        <View style={[styles.lensScanline, styles.lensScanlineBottom, { backgroundColor: RED }]} />
        <View style={[styles.impossibleDoor, { borderColor: hingeLocked ? RED : theme.colors.draft, transform: [{ perspective: 500 }, { rotateY: hingeLocked ? '38deg' : '0deg' }] }]}>
          <View style={[styles.doorSeam, { backgroundColor: hingeLocked ? RED : theme.colors.faint }]} />
        </View>
        <Text style={[styles.bearingReveal, { color: hingeLocked ? '#F5F1E8' : theme.colors.faint, fontFamily: theme.typography.families.displayHeavy }]}>{hingeLocked ? bearing : '—'}</Text>
        <Text style={[styles.lensMode, { color: live ? ACCENT : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{live ? 'LIVE ROOM LAYER' : 'SIMULATED LENS'}</Text>
      </View>
      {!live ? (
        <ActionButton
          accent={ACCENT}
          disabled={permission?.canAskAgain === false}
          icon="camera-outline"
          label={permission?.canAskAgain === false ? 'Camera unavailable · simulation active' : 'Open live room layer'}
          onPress={() => void openLiveLayer()}
          secondary
        />
      ) : null}
      {permissionError ? <Text style={[styles.cameraFeedback, { color: theme.colors.warning, fontFamily: theme.typography.families.body }]}>Camera stayed private. The simulated lens preserves the same door logic.</Text> : null}
    </View>
  );
}

function MazeStage(props: NightGlassStageProps) {
  const { theme } = useHousewireTheme();
  const [attempt, setAttempt] = useState<number[]>([]);
  const [rejected, setRejected] = useState(false);
  const maze = props.game.maze;
  const ownsLabels = maze.roomLabelsOwnerNodeId === props.activeNodeId;
  const ownsWalls = maze.wallLayerOwnerNodeId === props.activeNodeId;
  const ownsTransform = maze.transformDecoderOwnerNodeId === props.activeNodeId;
  const ownsEndpoints = maze.startExitOwnerNodeId === props.activeNodeId;
  const submit = async () => {
    const validation = validateNightGlassMazePath(props.game, attempt);
    if (validation.status === 'complete') {
      await props.onProof('maze-path');
      return;
    }
    setAttempt((current) => current.slice(0, validation.acceptedPrefixLength));
    props.onMiss();
    setRejected(true);
    setTimeout(() => setRejected(false), 700);
  };
  return (
    <CaseStageScaffold accent={ACCENT} instruction="One phone sees named rooms, one sees doors, one sees how the glass was turned. Describe—never show—your layer." stageNumber={3} title="Impossible floorplan">
      <RoleStepper activeNodeId={props.activeNodeId} crew={props.crew} enabled={props.preview} onChange={props.onChangeNode} />
      <StagePanel tone={ACCENT}>
        {ownsLabels ? <PrivateMazeGrid maze={maze} mode="labels" /> : null}
        {ownsWalls ? <PrivateMazeGrid maze={maze} mode="walls" /> : null}
        {ownsTransform ? <View style={styles.transformClue}><Ionicons color={RED} name="sync-outline" size={58} style={{ transform: [{ rotate: `${maze.wallLayerRotation}deg` }] }} /><View style={styles.transformCopy}><TechnicalLabel color={RED}>HOW THE GLASS LIES</TechnicalLabel><Text style={[styles.transformValue, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{rotationPhrase(maze.wallLayerRotation)}</Text><Text style={[styles.transformText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Rotate the spoken wall map the opposite way before the pathfinder touches a room.</Text></View></View> : null}
        {ownsEndpoints ? <View style={styles.endpointClue}><Endpoint label="START" value={maze.startCell} /><Ionicons color={theme.colors.faint} name="arrow-forward" size={26} /><Endpoint label="EXIT" value={maze.exitCell} /></View> : null}
        {!ownsLabels && !ownsWalls && !ownsTransform && !ownsEndpoints ? <WaitingPanel accent={ACCENT} detail="This fourth pane holds no map layer. Coordinate the spoken route and watch for a contradiction." /> : null}
      </StagePanel>
      <View style={[styles.pathBuilder, { borderColor: rejected ? theme.colors.fault : theme.colors.draft }]}>
        <View style={styles.routeHeader}>
          <View><TechnicalLabel color={RED}>PATHFINDER&apos;S GLASS</TechnicalLabel><Text style={[styles.routeTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Touch the rooms as they call them.</Text></View>
          <Text style={[styles.routeCount, { color: ACCENT, fontFamily: theme.typography.families.monoMedium }]}>{attempt.length}/{maze.path.length}</Text>
        </View>
        <View style={styles.routeGrid}>
          {maze.cells.map((cell) => {
            const room = NIGHT_ROOMS[cell];
            const visitIndex = attempt.indexOf(cell);
            const visited = visitIndex >= 0;
            return (
              <Pressable
                accessibilityLabel={`${room.name} room${visited ? `, route step ${visitIndex + 1}` : ''}`}
                disabled={visited || attempt.length >= maze.path.length}
                key={cell}
                onPress={() => setAttempt((current) => [...current, cell])}
                style={({ pressed }) => [
                  styles.routeRoom,
                  { backgroundColor: visited ? RED : '#05090B', borderColor: visited ? RED : theme.colors.draft },
                  pressed && { transform: [{ scale: 0.96 }] },
                ]}
              >
                <Ionicons color={visited ? '#05090B' : ACCENT} name={room.icon} size={25} />
                <Text style={[styles.routeRoomName, { color: visited ? '#05090B' : theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{room.name}</Text>
                {visited ? <View style={styles.routeOrder}><Text style={[styles.routeOrderText, { fontFamily: theme.typography.families.displayHeavy }]}>{visitIndex + 1}</Text></View> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={styles.routeThread}>
          {attempt.map((cell, index) => {
            const room = NIGHT_ROOMS[cell];
            return <View key={`${cell}-${index}`} style={styles.routeThreadStep}><Ionicons color={RED} name={room.icon} size={17} />{index < attempt.length - 1 ? <Ionicons color={theme.colors.faint} name="arrow-forward" size={12} /> : null}</View>;
          })}
          {!attempt.length ? <Text style={[styles.emptyRoute, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>Your first room becomes the start of a glowing thread.</Text> : null}
        </View>
        <View style={styles.actionRow}><ActionButton accent={RED} disabled={!attempt.length} label="Undo last room" onPress={() => setAttempt((current) => current.slice(0, -1))} secondary /><ActionButton accent={RED} disabled={attempt.length !== maze.path.length} icon="navigate-outline" label="Open the exit" onPress={() => void submit()} /></View>
      </View>
    </CaseStageScaffold>
  );
}

function PrivateMazeGrid({ maze, mode }: { maze: NightGlassMaze; mode: 'labels' | 'walls' }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.mazeBlock}>
      <TechnicalLabel color={mode === 'walls' ? RED : ACCENT}>{mode === 'walls' ? 'UNLABELLED · ROTATED DOOR PANE' : 'NAMED ROOM PANE · NO DOORS'}</TechnicalLabel>
      <View
        accessible
        accessibilityLabel={mode === 'walls' ? 'Unlabelled rotated maze door pane' : 'Nine named rooms without their doors'}
        style={[styles.maze, mode === 'walls' && { transform: [{ rotate: `${maze.wallLayerRotation}deg` }] }]}
      >
        {maze.cells.map((cell) => {
          const neighbors = maze.edges.flatMap(([left, right]) => left === cell ? [right] : right === cell ? [left] : []);
          const wallStyle = mode === 'walls' ? {
            backgroundColor: '#070A0B',
            borderBottomColor: neighbors.includes(cell + 3) ? 'transparent' : RED,
            borderLeftColor: neighbors.includes(cell - 1) && (cell - 1) % 3 !== 0 ? 'transparent' : RED,
            borderRightColor: neighbors.includes(cell + 1) && cell % 3 !== 0 ? 'transparent' : RED,
            borderTopColor: neighbors.includes(cell - 3) ? 'transparent' : RED,
          } : { borderColor: theme.colors.draft };
          return (
            <View key={cell} style={[styles.mazeCell, wallStyle]}>
              {mode === 'labels'
                ? <View style={styles.mazeRoomIdentity}><Ionicons color={ACCENT} name={NIGHT_ROOMS[cell].icon} size={25} /><Text style={[styles.mazeCellText, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{NIGHT_ROOMS[cell].name}</Text></View>
                : <View style={[styles.wallJunction, { backgroundColor: ACCENT }]} />}
            </View>
          );
        })}
      </View>
      {mode === 'walls' ? <Text style={[styles.mazeLegend, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Open red borders are doorways. Another phone owns room names; a third knows which way this pane was turned.</Text> : null}
    </View>
  );
}

function Endpoint({ label, value }: { label: string; value: number }) {
  const { theme } = useHousewireTheme();
  const room = NIGHT_ROOMS[value];
  return <View style={styles.endpoint}><TechnicalLabel color={label === 'START' ? ACCENT : RED}>{label}</TechnicalLabel><Ionicons color={label === 'START' ? ACCENT : RED} name={room.icon} size={36} /><Text style={[styles.endpointName, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{room.name}</Text></View>;
}

function rotationPhrase(rotation: number) {
  if (rotation === 90) return 'ONE TURN RIGHT';
  if (rotation === 180) return 'UPSIDE DOWN';
  if (rotation === 270) return 'ONE TURN LEFT';
  return 'NO TURN';
}

function CorridorStage(props: NightGlassStageProps) {
  const { theme } = useHousewireTheme();
  const index = props.game.corridor.anchorSteps.findIndex((step) => !props.completedProofKeys.includes(`anchor:${step.step}`));
  const step = props.game.corridor.anchorSteps[Math.max(0, index)];
  const finished = index < 0;
  const [carryArmed, setCarryArmed] = useState(false);
  const [movementDetected, setMovementDetected] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [scanned, setScanned] = useState(false);
  const courier = props.activeNodeId === step.courierNodeId;
  const anchor = props.activeNodeId === step.anchorOwnerNodeId;
  if (finished) return <WaitingPanel accent={ACCENT} detail="The courier crossed every pre-cleared station. Nothing tracked distance or room identity." title="Corridor crossed." />;
  const complete = async () => {
    if (!scanned || !stopped) return;
    const accepted = await props.onProof(`anchor:${step.step}`);
    if (!accepted) return;
    setCarryArmed(false);
    setMovementDetected(false);
    setStopped(false);
    setScanned(false);
  };
  return (
    <CaseStageScaffold accent={ACCENT} instruction={`Door seal ${step.step} of ${props.game.corridor.anchorSteps.length}. Move only after dimming the screen; stop before opening the lens.`} stageNumber={4} title="Walk the corridor">
      <RoleStepper activeNodeId={props.activeNodeId} crew={props.crew} enabled={props.preview} onChange={props.onChangeNode} />
      {anchor ? <QrMarker accent={RED} label={`DOOR SEAL ${step.step}`} token={step.markerToken} /> : null}
      {courier ? (
        <>
          {!carryArmed ? <StagePanel tone={RED}><TechnicalLabel color={RED}>CHECK THE REAL FLOOR · THEN DIM THIS SCREEN</TechnicalLabel><Text style={[styles.carryTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Move with the phone at your side.</Text><Text style={[styles.carryCopy, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>The screen stays dim until you confirm that you reached the named station safely.</Text><ActionButton accent={RED} icon="walk-outline" label="Start safe carry" onPress={() => { setMovementDetected(false); setCarryArmed(true); }} /></StagePanel> : null}
          {carryArmed && !movementDetected && !stopped ? (
            <View style={styles.dimCarry}>
              <View style={[styles.carryPulse, { borderColor: props.motion.lastEvidence?.kind === 'CARRY_STEADY' ? ACCENT : RED }]} />
              <Text style={[styles.dimTitle, { color: '#F5F1E8', fontFamily: theme.typography.families.displayHeavy }]}>MOVE NOW</Text>
              <Text style={[styles.dimCopy, { color: '#AFA99F', fontFamily: theme.typography.families.monoMedium }]}>WALK SAFELY WITH THE PHONE DOWN · THE RING LOCKS AFTER A STEADY CARRY</Text>
              <HoldContact accent={ACCENT} durationMs={1_800} label="Confirm safe arrival" onComplete={() => setMovementDetected(true)} />
            </View>
          ) : null}
          {carryArmed && movementDetected && !stopped ? (
            <View style={styles.dimCarry}>
              <View style={[styles.carryPulse, { borderColor: ACCENT }]} />
              <Text style={[styles.dimTitle, { color: '#F5F1E8', fontFamily: theme.typography.families.displayHeavy }]}>ARRIVED?</Text>
              <Text style={[styles.dimCopy, { color: '#AFA99F', fontFamily: theme.typography.families.monoMedium }]}>STOP COMPLETELY BEFORE OPENING THE LENS</Text>
              <HoldContact accent={ACCENT} durationMs={1_300} label="I am stopped" onComplete={() => setStopped(true)} />
            </View>
          ) : null}
          {stopped && !scanned ? <QrScanner accent={RED} expectedToken={step.markerToken} onScanned={() => setScanned(true)} /> : null}
          {stopped && scanned ? <StagePanel tone={ACCENT}><TechnicalLabel color={ACCENT}>DOOR SEAL VERIFIED</TechnicalLabel><ActionButton accent={RED} icon="enter-outline" label="Cross this door" onPress={() => void complete()} /></StagePanel> : null}
        </>
      ) : null}
      {!courier && !anchor ? <WaitingPanel accent={ACCENT} detail={`Keep this station clear. The courier is moving toward ${crewName(step.anchorOwnerNodeId, props.crew)}.`} /> : null}
    </CaseStageScaffold>
  );
}

function FoldStage(props: NightGlassStageProps) {
  const { theme } = useHousewireTheme();
  const assignment = props.game.finale.assignments.find((item) => item.nodeId === props.activeNodeId);
  const [poseReady, setPoseReady] = useState(false);
  const already = props.completedProofKeys.includes(`finale:${props.activeNodeId}`);
  if (!assignment) return <WaitingPanel accent={ACCENT} detail="This monitor is outside the final three-pane fold." />;
  return (
    <CaseStageScaffold accent={ACCENT} instruction="Hold your private contact, then press the red glass edge. Every pane must fold inside the same window." stageNumber={5} title="Fold the corridor">
      <RoleStepper activeNodeId={props.activeNodeId} crew={props.crew} enabled={props.preview} onChange={props.onChangeNode} />
      <View style={styles.foldVisual}>
        <View style={[styles.foldPane, styles.foldLeft, { borderColor: RED }]} />
        <View style={[styles.foldPane, styles.foldRight, { borderColor: ACCENT }]} />
        <View style={[styles.foldSeam, { backgroundColor: poseReady ? '#F5F1E8' : RED }]} />
        <Text style={[styles.foldWord, { color: '#F5F1E8', fontFamily: theme.typography.families.storyBold }]}>One house. No reflection.</Text>
      </View>
      {already ? <WaitingPanel accent={ACCENT} detail="Your glass edge is held. Do not release until the remaining panes close." title="Pane folded." /> : (
        <>
          {!poseReady ? <PoseLock accent={RED} motion={props.motion} onArmMotion={props.onStartMotion} onComplete={() => setPoseReady(true)} pose={assignment.pose} /> : null}
          {poseReady ? <StagePanel tone={RED}><TechnicalLabel color={RED}>CONTACT LOCKED · HOLD THE GLASS EDGE</TechnicalLabel><HoldContact accent={RED} durationMs={1_500} label="Hold red edge" onComplete={() => void props.onProof('finale')} /><Text style={[styles.foldHint, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Keep the edge pressed until its progress rail closes.</Text></StagePanel> : null}
        </>
      )}
    </CaseStageScaffold>
  );
}

function RoleBadge({ active, icon, label }: { active: boolean; icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const { theme } = useHousewireTheme();
  return <View style={[styles.roleBadge, { borderColor: active ? ACCENT : theme.colors.draft }]}><Ionicons color={active ? ACCENT : theme.colors.faint} name={icon} size={18} /><Text style={[styles.roleBadgeText, { color: active ? theme.colors.text : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{label}</Text></View>;
}

function crewName(nodeId: string, crew: readonly CrewNode[]) {
  return crew.find((node) => node.id === nodeId)?.name ?? `Node ${nodeId.slice(-2)}`;
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', gap: 8 },
  bearingReveal: { fontSize: 78, lineHeight: 80, position: 'absolute' },
  bearingRow: { flexDirection: 'row', gap: 7, justifyContent: 'center' },
  carryCopy: { fontSize: 14, lineHeight: 20 },
  cameraFeedback: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  carryPulse: { borderRadius: 70, borderWidth: 2, height: 128, width: 128 },
  carryTitle: { fontSize: 28, lineHeight: 31 },
  dimCarry: { alignItems: 'center', backgroundColor: '#020303', gap: 13, minHeight: 420, padding: 26 },
  dimCopy: { fontSize: 8, letterSpacing: 1, textAlign: 'center' },
  dimTitle: { fontSize: 35 },
  doorSeam: { bottom: 0, position: 'absolute', right: 5, top: 0, width: 3 },
  endpoint: { alignItems: 'center', flex: 1, gap: 4 },
  endpointClue: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  endpointName: { fontSize: 18, lineHeight: 21 },
  foldHint: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  foldLeft: { left: 24, transform: [{ perspective: 500 }, { rotateY: '38deg' }] },
  foldPane: { borderWidth: 2, height: 170, position: 'absolute', top: 28, width: 118 },
  foldRight: { right: 24, transform: [{ perspective: 500 }, { rotateY: '-38deg' }] },
  foldSeam: { height: 190, position: 'absolute', top: 18, width: 3 },
  foldVisual: { alignItems: 'center', backgroundColor: '#020405', height: 235, justifyContent: 'center', overflow: 'hidden' },
  foldWord: { bottom: 16, fontSize: 21, position: 'absolute' },
  hingeStack: { gap: 9 },
  impossibleDoor: { borderWidth: 2, height: 145, width: 94 },
  lensWindow: { alignItems: 'center', backgroundColor: '#020405', height: 210, justifyContent: 'center', overflow: 'hidden' },
  lensStack: { gap: 8 },
  lensShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(1, 8, 10, 0.28)' },
  lensMode: { bottom: 10, fontSize: 8, left: 12, letterSpacing: 1.2, position: 'absolute' },
  lensScanline: { height: 1, left: 0, opacity: 0.75, position: 'absolute', right: 0 },
  lensScanlineBottom: { bottom: 44 },
  lensScanlineTop: { top: 45 },
  maze: { flexDirection: 'row', flexWrap: 'wrap', height: 240, width: 240 },
  mazeBlock: { alignItems: 'center', gap: 12 },
  mazeCell: { alignItems: 'center', borderWidth: 1, height: 80, justifyContent: 'center', width: 80 },
  mazeCellText: { fontSize: 7, letterSpacing: 0.7 },
  mazeRoomIdentity: { alignItems: 'center', gap: 7 },
  mazeLegend: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  pathBuilder: { borderBottomWidth: 1, borderTopWidth: 1, gap: 13, paddingVertical: 14 },
  emptyRoute: { fontSize: 12, lineHeight: 17 },
  routeCount: { fontSize: 11, letterSpacing: 1 },
  routeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  routeHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  routeOrder: { alignItems: 'center', backgroundColor: '#F5F1E8', borderRadius: 11, height: 22, justifyContent: 'center', position: 'absolute', right: 5, top: 5, width: 22 },
  routeOrderText: { color: '#05090B', fontSize: 11 },
  routeRoom: { alignItems: 'center', aspectRatio: 1, borderWidth: 1, gap: 6, justifyContent: 'center', width: '31%' },
  routeRoomName: { fontSize: 7, letterSpacing: 0.65 },
  routeThread: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 4, minHeight: 25 },
  routeThreadStep: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  routeTitle: { fontSize: 20, lineHeight: 23, marginTop: 4 },
  roleBadge: { alignItems: 'center', borderWidth: 1, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 39 },
  roleBadgeText: { fontSize: 7, letterSpacing: 0.8 },
  roleRail: { flexDirection: 'row', gap: 6 },
  simulatedLens: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#061014' },
  targetGlyph: { alignItems: 'center', flexDirection: 'row', gap: 20, justifyContent: 'center' },
  targetName: { fontSize: 34 },
  thresholdCopy: { bottom: 17, left: 17, position: 'absolute' },
  thresholdGhost: { borderWidth: 1, height: 170, position: 'absolute', transform: [{ rotate: '45deg' }], width: 170 },
  thresholdLine: { height: 3, left: -20, position: 'absolute', right: -20 },
  thresholdTitle: { fontSize: 24, lineHeight: 26, maxWidth: 260 },
  thresholdView: { alignItems: 'center', backgroundColor: '#020405', height: 250, justifyContent: 'center', overflow: 'hidden' },
  transformClue: { alignItems: 'center', flexDirection: 'row', gap: 25 },
  transformCopy: { flex: 1, gap: 2 },
  transformText: { fontSize: 13, lineHeight: 18 },
  transformValue: { fontSize: 61, lineHeight: 61 },
  wallJunction: { borderRadius: 3, height: 5, opacity: 0.72, width: 5 },
});

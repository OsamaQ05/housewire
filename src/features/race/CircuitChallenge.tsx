import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import {
  circuitBreakerDigitForGesture,
  circuitBreakerGestureForDigit,
  type CircuitBreakerFragment,
  type CircuitFlatPhoneSubmission,
  type CircuitGlyph,
  type CircuitKnock,
  type CircuitMotionMove,
  type CircuitRaceSubmission,
  type CircuitSwipeDirection,
} from '@/src/domain/circuit-race';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';
import { decorativeAccessibilityProps } from '@/src/utils/accessibility';

import type { CircuitRaceDisplayStage } from './course-projection';
import { useCircuitGrounding } from './use-circuit-grounding';

const EMBER = '#FF6846';
const MINT = '#5FE0D0';
const GOLD = '#F2C14E';

export interface CircuitChallengeProps {
  accent: string;
  breakerFragments: readonly CircuitBreakerFragment[];
  onSubmit(submission: CircuitRaceSubmission): boolean;
  stage: CircuitRaceDisplayStage;
}

export function CircuitChallenge({ accent, breakerFragments, onSubmit, stage }: CircuitChallengeProps) {
  switch (stage.mechanic) {
    case 'sequence-cipher':
      return <SequenceChallenge accent={accent} onSubmit={onSubmit} stage={stage} />;
    case 'knock-pattern':
      return <KnockChallenge accent={accent} onSubmit={onSubmit} stage={stage} />;
    case 'flat-phone':
      return <GroundChallenge accent={accent} onSubmit={onSubmit} stage={stage} />;
    case 'breaker-code':
      return <BreakerChallenge accent={accent} fragments={breakerFragments} onSubmit={onSubmit} stage={stage} />;
  }
}

function SequenceChallenge({ accent, onSubmit, stage }: ExtractProps<'sequence-cipher'>) {
  const { theme } = useHousewireTheme();
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(false);
  const plates = stage.challenge.station === 'FULL' || stage.challenge.station === 'PLATES'
    ? stage.challenge.panels
    : undefined;
  const wheel = stage.challenge.station === 'FULL' || stage.challenge.station === 'WHEEL'
    ? stage.challenge.cipherWheel
    : undefined;
  const canEnter = stage.challenge.station !== 'PLATES';
  const selectedGlyphs = wheel
    ? code.split('').map((digit) => wheel.find((entry) => String(entry.digit) === digit)?.glyph)
    : [];
  const submit = () => {
    const valid = onSubmit({ mechanic: 'sequence-cipher', code });
    if (!valid) {
      setWrong(true);
      setCode('');
    }
  };
  return (
    <View style={styles.challenge}>
      {stage.challenge.station !== 'FULL' ? <RoleStation accent={accent} icon={plates ? 'book-outline' : 'hand-left-outline'} label={plates ? 'Riddle reader' : 'Object runner'} text={plates ? 'Read each clue aloud, in order. Do not say the hidden answer.' : 'Listen, solve, and tap the matching object. Your teammate cannot touch this board.'} /> : null}
      {plates ? <View style={styles.riddleStack}>
        {plates.map((panel) => (
          <View accessibilityLabel={`Riddle ${panel.pulseOrder}: ${panel.clue}`} accessible key={panel.panelId} style={[styles.riddleCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.draft }]}> 
            <View style={[styles.riddleIndex, { backgroundColor: GOLD }]}><Text style={[styles.riddleIndexText, { fontFamily: theme.typography.families.displayHeavy }]}>{panel.pulseOrder}</Text></View>
            <Text style={[styles.riddleText, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{panel.clue}</Text>
          </View>
        ))}
      </View> : null}
      {wheel ? <View style={[styles.wheel, { borderColor: theme.colors.draft }]}> 
        <View style={styles.wheelHeader}>
          <Text style={[styles.microLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.bodyMedium }]}>Tap the four answers</Text>
          <Text style={[styles.wheelHelp, { color: accent, fontFamily: theme.typography.families.bodyMedium }]}>{canEnter ? 'Hit one answer for each riddle, 1 → 4' : 'Call the four answers in order'}</Text>
        </View>
        <View style={styles.wheelEntries}>
          {wheel.map((entry) => (
            <Pressable
              accessibilityLabel={`${entry.glyph}${canEnter ? ', select as the next answer' : ''}`}
              accessibilityRole={canEnter ? 'button' : undefined}
              disabled={!canEnter || code.length >= 4}
              key={entry.glyph}
              onPress={() => {
                setWrong(false);
                setCode((current) => current.length < 4 ? `${current}${entry.digit}` : current);
              }}
              style={({ pressed }) => [styles.objectSwitch, { backgroundColor: theme.colors.surface, borderColor: canEnter ? theme.colors.draft : 'transparent' }, pressed && styles.pressed]}
            >
              <CircuitGlyphMark color={accent} glyph={entry.glyph} size={34} />
              <Text style={[styles.objectName, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{entry.glyph}</Text>
            </Pressable>
          ))}
        </View>
      </View> : null}
      {canEnter ? (
        <View style={styles.answerConsole}>
          <Text style={[styles.microLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.bodyMedium }]}>Your four answers</Text>
          <View style={styles.answerRail}>{Array.from({ length: 4 }, (_, index) => (
            <View key={index} style={[styles.answerSocket, { backgroundColor: selectedGlyphs[index] ? accent : theme.colors.surface, borderColor: selectedGlyphs[index] ? accent : theme.colors.draft }]}>
              {selectedGlyphs[index] ? <CircuitGlyphMark color="#08100F" glyph={selectedGlyphs[index]!} size={27} /> : <Text style={[styles.answerIndex, { color: theme.colors.faint, fontFamily: theme.typography.families.displayHeavy }]}>{index + 1}</Text>}
            </View>
          ))}</View>
          <View style={styles.actionRow}>
            <Pressable accessibilityRole="button" disabled={!code.length} onPress={() => setCode((current) => current.slice(0, -1))} style={[styles.undoButton, { borderColor: theme.colors.draft }, !code.length && styles.disabled]}><Ionicons color={theme.colors.text} name="arrow-undo" size={20} /><Text style={[styles.undoText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Undo</Text></Pressable>
            <View style={styles.submitGrow}><SubmitBar accent={accent} disabled={code.length !== 4} label="Send answers" onPress={submit} /></View>
          </View>
        </View>
      ) : <WaitingForTeammate accent={accent} text="Keep reading. Your teammate is solving on the private switchboard." />}
      {wrong ? <ErrorLine text="One answer is wrong. Re-read the riddles, not the symbols." /> : null}
    </View>
  );
}

function KnockChallenge({ accent, onSubmit, stage }: ExtractProps<'knock-pattern'>) {
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const haptics = useHousewireStore((state) => state.settings.haptics);
  const [pattern, setPattern] = useState<(CircuitKnock | undefined)[]>(Array(5).fill(undefined));
  const [performed, setPerformed] = useState<number[]>([]);
  const [pressing, setPressing] = useState(false);
  const [accessibleMode, setAccessibleMode] = useState(false);
  const [isPlayingLine, setIsPlayingLine] = useState(false);
  const [playingIndex, setPlayingIndex] = useState(-1);
  const [replays, setReplays] = useState(0);
  const [wrong, setWrong] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pressStartedAtRef = useRef<number | undefined>(undefined);
  const playback = stage.challenge.station === 'FULL' || stage.challenge.station === 'PLAYBACK'
    ? stage.challenge
    : undefined;
  const consoleStation = stage.challenge.station === 'FULL' || stage.challenge.station === 'CONSOLE'
    ? stage.challenge
    : undefined;

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const playLine = () => {
    if (!playback || isPlayingLine || replays >= playback.replayLimit) return;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setIsPlayingLine(true);
    setReplays((current) => current + 1);
    let offset = 0;
    playback.pulseDurationsMs.forEach((duration, index) => {
      const startsAt = offset;
      timersRef.current.push(setTimeout(() => {
        setPlayingIndex(index);
        play(duration < 320 ? 'circuitShort' : 'circuitLong', 0.82);
        if (haptics) void Haptics.impactAsync(duration < 320 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
      }, startsAt));
      timersRef.current.push(setTimeout(() => setPlayingIndex(-1), startsAt + duration));
      offset += duration + 250;
    });
    timersRef.current.push(setTimeout(() => {
      setPlayingIndex(-1);
      setIsPlayingLine(false);
    }, offset));
  };

  const choose = (index: number, knock: CircuitKnock) => {
    setPattern((current) => current.map((value, currentIndex) => currentIndex === index ? knock : value));
    setWrong(false);
  };
  const submit = () => {
    if (accessibleMode ? pattern.some((value) => !value) : performed.length !== 5) return;
    const valid = accessibleMode
      ? onSubmit({ mechanic: 'knock-pattern', mode: 'accessible', pattern: pattern as CircuitKnock[] })
      : onSubmit({ mechanic: 'knock-pattern', mode: 'timed', pressDurationsMs: performed });
    if (!valid) {
      setWrong(true);
      setPattern(Array(5).fill(undefined));
      setPerformed([]);
    }
  };

  const startEcho = () => {
    if (performed.length >= 5 || pressing) return;
    pressStartedAtRef.current = Date.now();
    setPressing(true);
    setWrong(false);
    if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };

  const finishEcho = () => {
    if (!pressing || pressStartedAtRef.current === undefined) return;
    const heldMs = Math.max(40, Math.min(900, Date.now() - pressStartedAtRef.current));
    setPerformed((current) => current.length < 5 ? [...current, heldMs] : current);
    setPressing(false);
    pressStartedAtRef.current = undefined;
    play(heldMs < 320 ? 'circuitShort' : 'circuitLong', 0.5);
    if (haptics) void Haptics.impactAsync(heldMs < 320 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  };

  return (
    <View style={styles.challenge}>
      {stage.challenge.station !== 'FULL' ? (
        <RoleStation
          accent={accent}
          icon={playback ? 'ear-outline' : 'keypad-outline'}
          label={playback ? 'LINE LISTENER' : 'ECHO OPERATOR'}
          text={playback ? 'Play the trapped line and call its rhythm using TAP and HOLD.' : 'Your teammate hears it. Perform the five-beat rhythm on the live echo plate.'}
        />
      ) : null}
      {playback ? (
        <View style={[styles.listenPanel, { backgroundColor: theme.colors.surface, borderColor: accent }]}>
          <View accessibilityLabel={playingIndex < 0 ? 'Five neutral sound positions' : `Sound ${playingIndex + 1} is playing`} accessible style={styles.waveBars}>
            {playback.pulseDurationsMs.map((_, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.waveBar,
                  {
                    backgroundColor: playingIndex === index ? accent : theme.colors.draft,
                    height: playingIndex === index ? 52 : 14,
                  },
                ]}
              />
            ))}
          </View>
          <Pressable
            accessibilityLabel="Play the trapped knock line"
            accessibilityRole="button"
            accessibilityState={{ disabled: isPlayingLine || replays >= playback.replayLimit }}
            disabled={isPlayingLine || replays >= playback.replayLimit}
            onPress={playLine}
            style={({ pressed }) => [styles.listenButton, { borderColor: accent }, (isPlayingLine || replays >= playback.replayLimit) && styles.disabled, pressed && styles.pressed]}
          >
            <Ionicons color={accent} name={isPlayingLine ? 'volume-high' : 'ear-outline'} size={22} />
            <Text style={[styles.listenText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{isPlayingLine ? 'Line playing…' : replays === 0 ? 'Play trapped line' : replays < playback.replayLimit ? 'Replay once' : 'Replays used'}</Text>
          </Pressable>
        </View>
      ) : null}
      {consoleStation ? (
        <>
          {!accessibleMode ? (
            <View style={styles.echoConsole}>
              <View style={styles.echoTopline}><Text style={[styles.microLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>LIVE ECHO PLATE</Text><Text style={[styles.echoCount, { color: accent, fontFamily: theme.typography.families.displayHeavy }]}>{performed.length}/5</Text></View>
              <View style={styles.echoRail}>{Array.from({ length: 5 }, (_, index) => {
                const duration = performed[index];
                return <View key={index} style={[styles.echoBeat, { borderColor: duration ? accent : theme.colors.draft }]}><View style={[styles.echoBeatCore, { backgroundColor: duration ? accent : theme.colors.draft, height: duration ? (duration < 320 ? 18 : 52) : 5 }]} /></View>;
              })}</View>
              <Pressable
                accessibilityHint="Tap briefly for a short beat or hold for a long beat"
                accessibilityLabel="Echo rhythm pad"
                accessibilityRole="button"
                disabled={performed.length >= 5}
                onPressIn={startEcho}
                onPressOut={finishEcho}
                style={[styles.echoPad, { backgroundColor: pressing ? accent : theme.colors.surface, borderColor: accent }, performed.length >= 5 && styles.disabled]}
              >
                <View style={[styles.echoPadRing, { borderColor: pressing ? '#08100F' : accent }]}><Ionicons color={pressing ? '#08100F' : accent} name={pressing ? 'radio-button-on' : 'finger-print-outline'} size={36} /></View>
                <Text style={[styles.echoPadTitle, { color: pressing ? '#08100F' : theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{pressing ? 'HOLD… RELEASE' : 'TAP / HOLD'}</Text>
                <Text style={[styles.echoPadHelp, { color: pressing ? '#17302B' : theme.colors.muted, fontFamily: theme.typography.families.body }]}>Perform one beat at a time</Text>
              </Pressable>
              <View style={styles.actionRow}><Pressable accessibilityRole="button" disabled={!performed.length} onPress={() => setPerformed((current) => current.slice(0, -1))} style={[styles.undoButton, { borderColor: theme.colors.draft }, !performed.length && styles.disabled]}><Ionicons color={theme.colors.text} name="arrow-undo" size={20} /><Text style={[styles.undoText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Undo beat</Text></Pressable><View style={styles.submitGrow}><SubmitBar accent={accent} disabled={performed.length !== 5} label="SEND ECHO" onPress={submit} /></View></View>
            </View>
          ) : (
            <View style={styles.knockRows}>
              {pattern.map((value, index) => (
                <View key={index} style={styles.knockRow}>
                  <Text style={[styles.knockIndex, { color: theme.colors.faint, fontFamily: theme.typography.families.displayHeavy }]}>{index + 1}</Text>
                  {consoleStation.accessibleChoices.map((knock) => (
                    <Pressable accessibilityLabel={`Sound ${index + 1}, ${knock.toLowerCase()}`} accessibilityRole="radio" accessibilityState={{ checked: value === knock }} key={knock} onPress={() => choose(index, knock)} style={[styles.knockChoice, { backgroundColor: value === knock ? accent : theme.colors.surface, borderColor: value === knock ? accent : theme.colors.draft }]}>
                      <View style={[styles.knockMark, { backgroundColor: value === knock ? '#08100F' : accent, width: knock === 'SHORT' ? 20 : 48 }]} />
                      <Text style={[styles.knockText, { color: value === knock ? '#08100F' : theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{knock === 'SHORT' ? 'TAP' : 'HOLD'}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
              <SubmitBar accent={accent} disabled={pattern.some((value) => !value)} label="SEND ACCESSIBLE ECHO" onPress={submit} />
            </View>
          )}
          <Pressable accessibilityRole="button" onPress={() => { setAccessibleMode((current) => !current); setPattern(Array(5).fill(undefined)); setPerformed([]); }}><Text style={[styles.accessibleLink, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{accessibleMode ? 'Use the live tap-and-hold plate' : 'Need an accessible TAP / HOLD selector?'}</Text></Pressable>
        </>
      ) : <WaitingForTeammate accent={accent} />}
      {wrong ? <ErrorLine text="The rhythm breaks. Listen for length." /> : null}
    </View>
  );
}

function GroundChallenge({ accent, onSubmit, stage }: ExtractProps<'flat-phone'>) {
  if (stage.challenge.station === 'ORIENTATION') {
    return <GroundOrientationStation accent={accent} requiredFace={stage.challenge.requiredFace} tiltSequence={stage.challenge.tiltSequence} />;
  }
  return <GroundActionStation accent={accent} challenge={stage.challenge} onSubmit={onSubmit} />;
}

function GroundOrientationStation({ accent, requiredFace, tiltSequence }: { accent: string; requiredFace: 'FACE_UP' | 'FACE_DOWN'; tiltSequence: readonly CircuitMotionMove[] }) {
  const { theme } = useHousewireTheme();
  const faceLabel = requiredFace === 'FACE_UP' ? 'SCREEN UP' : 'SCREEN DOWN';
  return (
    <View style={styles.challenge}>
      <RoleStation accent={accent} icon="compass-outline" label="Flight director" text="Call one move at a time. Wait for your teammate to say CENTER before calling the next." />
      <View accessibilityLabel={`Flight path ${tiltSequence.map(motionMoveLabel).join(', ')}, then ${faceLabel}`} accessible style={[styles.flightPlan, { borderColor: accent }]}> 
        <Text style={[styles.orientationLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.bodyMedium }]}>Secret flight plan · call in order</Text>
        <View style={styles.flightMoves}>{tiltSequence.map((move, index) => <View key={`${move}-${index}`} style={styles.flightMove}><View style={[styles.flightArrow, { borderColor: accent }]}><Ionicons color={accent} name={motionMoveIcon(move)} size={28} /></View><Text style={[styles.flightIndex, { color: GOLD, fontFamily: theme.typography.families.displayHeavy }]}>{index + 1}</Text><Text style={[styles.flightLabel, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{motionMoveLabel(move)}</Text></View>)}</View>
        <View style={[styles.landingStrip, { backgroundColor: accent }]}><Ionicons color="#08100F" name={requiredFace === 'FACE_UP' ? 'phone-portrait-outline' : 'phone-portrait'} size={25} /><Text style={[styles.landingText, { fontFamily: theme.typography.families.displayHeavy }]}>LAND {faceLabel}</Text></View>
      </View>
      <WaitingForTeammate accent={accent} text="Keep directing. Their motion proof advances both phones." />
    </View>
  );
}

type GroundActionChallenge = Extract<
  Extract<CircuitRaceDisplayStage, { mechanic: 'flat-phone' }>['challenge'],
  { station: 'FULL' | 'GROUND' }
>;

function GroundActionStation({ accent, challenge, onSubmit }: {
  accent: string;
  challenge: GroundActionChallenge;
  onSubmit(submission: CircuitRaceSubmission): boolean;
}) {
  const { theme } = useHousewireTheme();
  const [manualStartedAt, setManualStartedAt] = useState<number>();
  const [manualMoves, setManualMoves] = useState<CircuitMotionMove[]>([]);
  const [manualMode, setManualMode] = useState(false);
  const [wrong, setWrong] = useState(false);
  const ground = useCircuitGrounding(challenge, (samples) => {
    const submission: CircuitFlatPhoneSubmission = { mechanic: 'flat-phone', mode: 'sensor', samples };
    if (!onSubmit(submission)) setWrong(true);
  });
  const fallbackDone = () => {
    if (!manualStartedAt) return;
    const heldMs = Date.now() - manualStartedAt;
    setManualStartedAt(undefined);
    if (!onSubmit({ mechanic: 'flat-phone', mode: 'manual-hold', heldMs })) setWrong(true);
  };
  const addManualMove = (move: CircuitMotionMove) => {
    if (manualMoves.length >= challenge.moveCount) return;
    const expected = challenge.tiltSequence?.[manualMoves.length];
    if (expected && expected !== move) {
      setWrong(true);
      setManualMoves([]);
      return;
    }
    setWrong(false);
    setManualMoves((current) => [...current, move]);
  };
  return (
    <View style={styles.challenge}>
      {challenge.station === 'GROUND' ? <RoleStation accent={accent} icon="phone-portrait-outline" label="Hidden-route pilot" text="You cannot see the route. Follow each direction your teammate calls, return to center, then land as ordered." /> : <RoleStation accent={accent} icon="navigate-circle-outline" label="One-phone flight" text="Fly the three shown movements in order. Return to center between moves, then land the phone." />}
      <View style={styles.moveRail}>
        {Array.from({ length: challenge.moveCount }, (_, index) => {
          const complete = ground.moveIndex > index;
          const knownMove = challenge.tiltSequence?.[index];
          return <View key={index} style={[styles.moveSlot, { backgroundColor: complete ? accent : theme.colors.surface, borderColor: complete ? accent : theme.colors.draft }]}>{knownMove ? <Ionicons color={complete ? '#08100F' : theme.colors.text} name={motionMoveIcon(knownMove)} size={22} /> : <Text style={[styles.moveSlotText, { color: complete ? '#08100F' : theme.colors.faint, fontFamily: theme.typography.families.displayHeavy }]}>{complete ? '✓' : index + 1}</Text>}</View>;
        })}
        <Ionicons color={ground.moveIndex >= challenge.moveCount ? accent : theme.colors.faint} name="arrow-forward" size={20} />
        <View style={[styles.moveSlot, { backgroundColor: ground.faceCorrect ? accent : theme.colors.surface, borderColor: ground.faceCorrect ? accent : theme.colors.draft }]}><Ionicons color={ground.faceCorrect ? '#08100F' : theme.colors.faint} name="download-outline" size={22} /></View>
      </View>
      <View
        accessibilityLabel={`Flight moves ${ground.moveIndex} of ${challenge.moveCount}; landing stability ${Math.round(ground.progress * 100)} percent`}
        accessibilityRole="progressbar"
        accessibilityValue={{ max: 100, min: 0, now: Math.round(ground.progress * 100) }}
        style={[styles.levelPlate, { borderColor: ground.faceCorrect ? accent : theme.colors.draft }]}
      >
        <View style={[styles.levelRing, { borderColor: theme.colors.draft }]}>
          <Animated.View style={[styles.levelBubble, { backgroundColor: ground.faceCorrect ? accent : GOLD, left: `${44 + ground.level * 6}%`, top: `${44 + ground.level * 3}%` }]} />
        </View>
        <View style={[styles.progressTrack, { backgroundColor: theme.colors.draft }]}><View style={[styles.progressFill, { backgroundColor: accent, width: `${Math.round(ground.progress * 100)}%` }]} /></View>
        <Text style={[styles.levelValue, { color: ground.faceCorrect ? accent : theme.colors.muted, fontFamily: theme.typography.families.displayHeavy }]}>{ground.moveIndex < challenge.moveCount ? `${ground.moveIndex}/${challenge.moveCount}` : `${Math.round(ground.progress * 100)}%`}</Text>
        <Text style={[styles.levelMeta, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>{ground.moveIndex < challenge.moveCount ? (ground.lastMove ? 'RETURN TO CENTER' : 'WAITING FOR CALLED MOVE') : ground.faceCorrect ? 'LANDING LOCK · DO NOT TOUCH' : challenge.requiredFace ? `LAND ${challenge.requiredFace.replace('_', ' ')} · KEEP LEVEL` : 'LAND AS CALLED · KEEP LEVEL'}</Text>
      </View>
      {!ground.active ? (
        <Pressable accessibilityLabel="Arm phone motion sensor" accessibilityRole="button" onPress={() => void ground.start()} style={({ pressed }) => [styles.armButton, { backgroundColor: accent }, pressed && styles.pressed]}>
          <Ionicons color="#08100F" name="navigate-circle-outline" size={23} />
          <Text style={[styles.armText, { fontFamily: theme.typography.families.displayHeavy }]}>Start motion challenge</Text>
        </Pressable>
      ) : null}
      {(ground.available === false || ground.denied || manualMode) ? (
        <View style={[styles.fallback, { borderColor: theme.colors.draft }]}> 
          <Text style={[styles.fallbackText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Use the four direction keys to reproduce the same route. After three moves, hold the landing plate. A 5-second race penalty applies.</Text>
          <View style={styles.manualDirections}>{(['TILT_LEFT', 'TIP_FORWARD', 'TIP_BACK', 'TILT_RIGHT'] as const).map((move) => <Pressable accessibilityLabel={motionMoveLabel(move)} accessibilityRole="button" disabled={manualMoves.length >= challenge.moveCount} key={move} onPress={() => addManualMove(move)} style={[styles.manualDirection, { borderColor: accent }]}><Ionicons color={accent} name={motionMoveIcon(move)} size={25} /></Pressable>)}</View>
          <Pressable
            accessibilityRole="button"
            disabled={manualMoves.length !== challenge.moveCount}
            onPressIn={() => { setManualStartedAt(Date.now()); setWrong(false); }}
            onPressOut={fallbackDone}
            style={({ pressed }) => [styles.holdButton, { borderColor: accent, backgroundColor: pressed ? accent : theme.colors.surface }, manualMoves.length !== challenge.moveCount && styles.disabled]}
          >
            <Text style={[styles.holdText, { color: manualStartedAt ? '#08100F' : accent, fontFamily: theme.typography.families.displayHeavy }]}>HOLD LANDING {((challenge.fallback.minimumHoldMs) / 1_000).toFixed(1)}s</Text>
          </Pressable>
        </View>
      ) : null}
      {ground.available !== false && !ground.denied && !manualMode ? <Pressable accessibilityRole="button" onPress={() => setManualMode(true)}><Text style={[styles.accessibleLink, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>Motion difficult? Use the direction-pad fallback</Text></Pressable> : null}
      {wrong ? <ErrorLine text="The route broke. Start again and return through center after every move." /> : null}
    </View>
  );
}

function BreakerChallenge({ accent, fragments, onSubmit, stage }: {
  accent: string;
  fragments: readonly CircuitBreakerFragment[];
  onSubmit(submission: CircuitRaceSubmission): boolean;
  stage: Extract<CircuitRaceDisplayStage, { mechanic: 'breaker-code' }>;
}) {
  const { theme } = useHousewireTheme();
  const [directions, setDirections] = useState<CircuitSwipeDirection[]>([]);
  const [wrong, setWrong] = useState(false);
  const submit = () => {
    const code = directions.map(circuitBreakerDigitForGesture).join('');
    const valid = onSubmit({ mechanic: 'breaker-code', code });
    if (!valid) {
      setWrong(true);
      setDirections([]);
    }
  };
  return (
    <View style={styles.challenge}>
      {stage.challenge.station !== 'FULL' ? (
        <RoleStation
          accent={accent}
          icon="git-merge-outline"
          label={`${stage.challenge.station === 'ODD' ? 'A' : 'B'} WEAVE HOLDER`}
          text="You own two alternating gestures. Call the direction and beat number; then weave all four on either phone."
        />
      ) : null}
      <View style={styles.fragmentStack}>
        {fragments.map((fragment) => (
          <Animated.View entering={FadeInDown.duration(340)} key={fragment.fragmentId} style={[styles.fragment, { backgroundColor: theme.colors.surface, borderColor: fragment.line === 'ODD' ? EMBER : MINT }]}> 
            <Text style={[styles.fragmentLine, { color: fragment.line === 'ODD' ? EMBER : MINT, fontFamily: theme.typography.families.monoMedium }]}>{fragment.line === 'ODD' ? 'A' : 'B'} STRIP · KEEP PRIVATE</Text>
            <View style={styles.fragmentDigits}>
              {fragment.digits.map((digit, index) => (
                <View key={index} style={styles.fragmentDigitBlock}>
                  <View style={[styles.gestureToken, { borderColor: fragment.line === 'ODD' ? EMBER : MINT }]}><Ionicons color={theme.colors.text} name={swipeIcon(circuitBreakerGestureForDigit(digit))} size={34} /></View>
                  <Text style={[styles.fragmentPosition, { color: theme.colors.faint, fontFamily: theme.typography.families.mono }]}>BEAT {fragment.positions[index]} · {circuitBreakerGestureForDigit(digit)}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        ))}
      </View>
      {fragments.length === 1 ? <Text style={[styles.teammateNote, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Your teammate owns the missing beats. Use Team Line—opponents cannot hear it.</Text> : null}
      <GestureWeavePad accent={accent} directions={directions} onChange={(value) => { setDirections(value); setWrong(false); }} />
      <View style={styles.actionRow}><Pressable accessibilityRole="button" disabled={!directions.length} onPress={() => setDirections((current) => current.slice(0, -1))} style={[styles.undoButton, { borderColor: theme.colors.draft }, !directions.length && styles.disabled]}><Ionicons color={theme.colors.text} name="arrow-undo" size={20} /><Text style={[styles.undoText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Undo swipe</Text></Pressable><View style={styles.submitGrow}><SubmitBar accent={accent} disabled={directions.length !== 4} label="CLOSE CIRCUIT" onPress={submit} /></View></View>
      {wrong ? <ErrorLine text="The weave snapped. Check every beat and direction with your teammate." /> : null}
    </View>
  );
}

function GestureWeavePad({ accent, directions, onChange }: { accent: string; directions: readonly CircuitSwipeDirection[]; onChange(value: CircuitSwipeDirection[]): void }) {
  const { theme } = useHousewireTheme();
  const haptics = useHousewireStore((state) => state.settings.haptics);
  const originRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const appendDirection = useCallback((direction: CircuitSwipeDirection) => {
    if (directions.length >= 4) return;
    onChange([...directions, direction]);
    if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, [directions, haptics, onChange]);
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 8,
    onPanResponderGrant: (event) => {
      originRef.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
    },
    onPanResponderRelease: (event, gesture) => {
      if (directions.length >= 4) return;
      const dx = gesture.dx || (originRef.current ? event.nativeEvent.pageX - originRef.current.x : 0);
      const dy = gesture.dy || (originRef.current ? event.nativeEvent.pageY - originRef.current.y : 0);
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 34) return;
      const direction: CircuitSwipeDirection = Math.abs(dx) > Math.abs(dy)
        ? dx > 0 ? 'RIGHT' : 'LEFT'
        : dy > 0 ? 'DOWN' : 'UP';
      appendDirection(direction);
    },
    onPanResponderTerminate: () => { originRef.current = undefined; },
  }), [appendDirection, directions.length]);
  return (
    <View style={[styles.weaveFrame, { borderColor: accent }]}>
      <View {...responder.panHandlers} accessibilityHint="Swipe the four directions your team assembled, or use the arrow buttons below" accessibilityLabel={`Gesture weave, ${directions.length} of 4 swipes entered`} accessible style={[styles.weavePad, { backgroundColor: theme.colors.surface }]}> 
        <View style={styles.weaveCross}><View style={[styles.weaveVertical, { backgroundColor: theme.colors.draft }]} /><View style={[styles.weaveHorizontal, { backgroundColor: theme.colors.draft }]} /></View>
        <Ionicons color={accent} name={directions.length === 4 ? 'flash' : 'move-outline'} size={50} />
        <Text style={[styles.weaveTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{directions.length === 4 ? 'WEAVE READY' : 'SWIPE THE PATH'}</Text>
        <Text style={[styles.weaveHelp, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>One continuous-feeling sequence · lift between swipes</Text>
      </View>
      <View style={styles.weaveRail}>{Array.from({ length: 4 }, (_, index) => <View key={index} style={[styles.weaveStep, { backgroundColor: directions[index] ? accent : theme.colors.background, borderColor: directions[index] ? accent : theme.colors.draft }]}>{directions[index] ? <Ionicons color="#08100F" name={swipeIcon(directions[index])} size={23} /> : <Text style={[styles.weaveStepText, { color: theme.colors.faint, fontFamily: theme.typography.families.displayHeavy }]}>{index + 1}</Text>}</View>)}</View>
      <View style={styles.weaveArrowControls}>
        {(['UP', 'RIGHT', 'DOWN', 'LEFT'] as const).map((direction) => (
          <Pressable
            accessibilityLabel={`Add ${direction.toLowerCase()} swipe`}
            accessibilityRole="button"
            accessibilityState={{ disabled: directions.length >= 4 }}
            disabled={directions.length >= 4}
            key={direction}
            onPress={() => appendDirection(direction)}
            style={({ pressed }) => [styles.weaveArrowButton, { borderColor: theme.colors.draft }, directions.length >= 4 && styles.disabled, pressed && styles.pressed]}
          >
            <Ionicons color={accent} name={swipeIcon(direction)} size={22} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SubmitBar({ accent, disabled, label, onPress }: { accent: string; disabled: boolean; label: string; onPress(): void }) {
  const { theme } = useHousewireTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.submit, { backgroundColor: accent }, disabled && styles.disabled, pressed && styles.pressed]}><Text style={[styles.submitText, { fontFamily: theme.typography.families.displayHeavy }]}>{label}</Text><Ionicons color="#08100F" name="arrow-forward" size={21} /></Pressable>;
}

function motionMoveLabel(move: CircuitMotionMove): string {
  switch (move) {
    case 'TILT_LEFT': return 'TILT LEFT';
    case 'TILT_RIGHT': return 'TILT RIGHT';
    case 'TIP_FORWARD': return 'TIP FORWARD';
    case 'TIP_BACK': return 'TIP BACK';
  }
}

function motionMoveIcon(move: CircuitMotionMove): keyof typeof Ionicons.glyphMap {
  switch (move) {
    case 'TILT_LEFT': return 'arrow-back';
    case 'TILT_RIGHT': return 'arrow-forward';
    case 'TIP_FORWARD': return 'arrow-up';
    case 'TIP_BACK': return 'arrow-down';
  }
}

function swipeIcon(direction: CircuitSwipeDirection): keyof typeof Ionicons.glyphMap {
  switch (direction) {
    case 'UP': return 'arrow-up';
    case 'RIGHT': return 'arrow-forward';
    case 'DOWN': return 'arrow-down';
    case 'LEFT': return 'arrow-back';
  }
}

function RoleStation({ accent, icon, label, text }: {
  accent: string;
  icon: 'book-outline' | 'compass-outline' | 'disc-outline' | 'ear-outline' | 'git-merge-outline' | 'grid-outline' | 'hand-left-outline' | 'keypad-outline' | 'navigate-circle-outline' | 'phone-portrait-outline';
  label: string;
  text: string;
}) {
  const { theme } = useHousewireTheme();
  return (
    <View accessibilityLabel={`${label}. ${text}`} accessible style={[styles.roleStation, { backgroundColor: theme.colors.surface, borderColor: accent }]}> 
      <View style={[styles.roleIcon, { borderColor: accent }]}><Ionicons color={accent} name={icon} size={22} /></View>
      <View style={styles.roleCopy}>
        <Text style={[styles.roleLabel, { color: accent, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
        <Text style={[styles.roleText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{text}</Text>
      </View>
    </View>
  );
}

function WaitingForTeammate({ accent, text = 'Stay on Team Line. This circuit advances when your teammate submits the combined answer.' }: { accent: string; text?: string }) {
  const { theme } = useHousewireTheme();
  return (
    <View accessibilityLiveRegion="polite" style={[styles.waiting, { borderColor: theme.colors.draft }]}> 
      <View style={[styles.waitingPulse, { backgroundColor: accent }]} />
      <Text style={[styles.waitingText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{text}</Text>
    </View>
  );
}

function ErrorLine({ text }: { text: string }) {
  const { theme } = useHousewireTheme();
  return <Animated.View entering={FadeIn.duration(180)} style={[styles.errorLine, { borderColor: theme.colors.fault }]}><Ionicons color={theme.colors.fault} name="close-circle-outline" size={18} /><Text style={[styles.errorText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{text}</Text></Animated.View>;
}

type ExtractProps<M extends CircuitRaceDisplayStage['mechanic']> = {
  accent: string;
  onSubmit(submission: CircuitRaceSubmission): boolean;
  stage: Extract<CircuitRaceDisplayStage, { mechanic: M }>;
};

function CircuitGlyphMark({ color, glyph, size }: { color: string; glyph: CircuitGlyph; size: number }) {
  const common = { fill: 'none', stroke: color, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2.6 };
  return (
    <Svg {...decorativeAccessibilityProps} height={size} viewBox="0 0 40 40" width={size}>
      {glyph === 'ARC' ? <Path d="M5 28 Q20 7 35 28" {...common} /> : null}
      {glyph === 'BELL' ? <><Path d="M10 28 H30 M13 26 V18 C13 9 27 9 27 18 V26 M17 31 Q20 34 23 31" {...common} /></> : null}
      {glyph === 'COIL' ? <><Circle cx="20" cy="20" r="13" {...common} /><Circle cx="20" cy="20" r="7" {...common} /><Circle cx="20" cy="20" fill={color} r="2.2" /></> : null}
      {glyph === 'DOOR' ? <><Rect height="27" rx="1" width="20" x="10" y="7" {...common} /><Circle cx="25" cy="21" fill={color} r="1.8" /></> : null}
      {glyph === 'EYE' ? <><Path d="M4 20 Q20 7 36 20 Q20 33 4 20 Z" {...common} /><Circle cx="20" cy="20" fill={color} r="4" /></> : null}
      {glyph === 'FORK' ? <><Line x1="20" x2="20" y1="18" y2="34" {...common} /><Path d="M20 19 L10 9 M20 19 L30 9 M10 9 V15 M30 9 V15" {...common} /></> : null}
      {glyph === 'KEY' ? <><Circle cx="13" cy="16" r="7" {...common} /><Path d="M18 21 L32 35 M25 28 L29 24 M29 32 L33 28" {...common} /></> : null}
      {glyph === 'WAVE' ? <><Path d="M4 14 Q12 7 20 14 T36 14 M4 26 Q12 19 20 26 T36 26" {...common} /></> : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  accessibleLink: { fontSize: 12, lineHeight: 18, textAlign: 'center', textDecorationLine: 'underline' },
  actionRow: { alignItems: 'stretch', flexDirection: 'row', gap: 8 },
  answerConsole: { gap: 10 },
  answerIndex: { fontSize: 22 },
  answerRail: { flexDirection: 'row', gap: 7 },
  answerSocket: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flex: 1, height: 57, justifyContent: 'center' },
  armButton: { alignItems: 'center', borderRadius: 15, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 61 },
  armText: { color: '#08100F', fontSize: 20 },
  challenge: { gap: 15 },
  disabled: { opacity: 0.35 },
  echoBeat: { alignItems: 'center', borderBottomWidth: 2, flex: 1, height: 62, justifyContent: 'flex-end', paddingBottom: 3 },
  echoBeatCore: { borderRadius: 3, width: 12 },
  echoConsole: { gap: 12 },
  echoCount: { fontSize: 23 },
  echoPad: { alignItems: 'center', borderRadius: 18, borderWidth: 2, gap: 5, justifyContent: 'center', minHeight: 190 },
  echoPadHelp: { fontSize: 12 },
  echoPadRing: { alignItems: 'center', borderRadius: 36, borderWidth: 2, height: 72, justifyContent: 'center', width: 72 },
  echoPadTitle: { fontSize: 31, lineHeight: 32 },
  echoRail: { flexDirection: 'row', gap: 8 },
  echoTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  errorLine: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 9 },
  errorText: { flex: 1, fontSize: 12 },
  fallback: { borderTopWidth: 1, gap: 10, paddingTop: 13 },
  fallbackText: { fontSize: 12, lineHeight: 17 },
  flightArrow: { alignItems: 'center', borderRadius: 29, borderWidth: 1, height: 58, justifyContent: 'center', width: 58 },
  flightIndex: { fontSize: 17 },
  flightLabel: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
  flightMove: { alignItems: 'center', flex: 1, gap: 5 },
  flightMoves: { flexDirection: 'row', gap: 8 },
  flightPlan: { borderRadius: 18, borderWidth: 2, gap: 17, padding: 16 },
  fragment: { borderRadius: 14, borderWidth: 1, gap: 9, padding: 13 },
  fragmentDigit: { fontSize: 43, lineHeight: 43 },
  fragmentDigitBlock: { alignItems: 'center' },
  fragmentDigits: { flexDirection: 'row', gap: 35 },
  fragmentLine: { fontSize: 8, letterSpacing: 1.2 },
  fragmentPosition: { fontSize: 7, letterSpacing: 0.8 },
  fragmentStack: { gap: 8 },
  gestureToken: { alignItems: 'center', borderRadius: 32, borderWidth: 2, height: 64, justifyContent: 'center', width: 64 },
  glyphName: { fontSize: 8, letterSpacing: 0.9 },
  holdButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, justifyContent: 'center', minHeight: 58 },
  holdText: { fontSize: 18 },
  knockChoice: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, minHeight: 47, paddingHorizontal: 10 },
  knockIndex: { fontSize: 22, width: 22 },
  knockMark: { height: 3 },
  knockRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  knockRows: { gap: 7 },
  knockText: { fontSize: 8, letterSpacing: 0.8 },
  levelBubble: { borderRadius: 10, height: 20, position: 'absolute', width: 20 },
  levelMeta: { fontSize: 11, lineHeight: 15 },
  levelPlate: { alignItems: 'center', borderRadius: 18, borderWidth: 1, gap: 10, padding: 17 },
  levelRing: { borderRadius: 62, borderWidth: 3, height: 124, position: 'relative', width: 124 },
  levelValue: { fontSize: 30, lineHeight: 30 },
  landingStrip: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 52 },
  landingText: { color: '#08100F', fontSize: 21 },
  listenButton: { alignItems: 'center', alignSelf: 'stretch', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 52 },
  listenPanel: { alignItems: 'center', borderRadius: 18, borderWidth: 1, gap: 14, padding: 15 },
  listenText: { fontSize: 14 },
  manualDirection: { alignItems: 'center', borderRadius: 13, borderWidth: 1, height: 52, justifyContent: 'center', width: '22%' },
  manualDirections: { flexDirection: 'row', gap: 7, justifyContent: 'space-between' },
  microLabel: { fontSize: 12, lineHeight: 16 },
  moveRail: { alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'center' },
  moveSlot: { alignItems: 'center', borderRadius: 13, borderWidth: 1, height: 47, justifyContent: 'center', width: 47 },
  moveSlotText: { fontSize: 20 },
  objectName: { fontSize: 9, letterSpacing: 0.8 },
  objectSwitch: { alignItems: 'center', borderRadius: 14, borderWidth: 1, gap: 7, minHeight: 82, padding: 9, width: '31%' },
  orientationFace: { fontSize: 39, lineHeight: 42, textAlign: 'center' },
  orientationLabel: { fontSize: 12, lineHeight: 16 },
  orientationPlate: { alignItems: 'center', borderRadius: 18, borderWidth: 2, gap: 10, minHeight: 210, justifyContent: 'center', padding: 20 },
  plate: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flex: 1, gap: 5, minHeight: 112, justifyContent: 'center', paddingVertical: 8 },
  plateRail: { flexDirection: 'row', gap: 6 },
  plateStep: { fontSize: 8, letterSpacing: 0.8 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  progressFill: { height: 6 },
  progressTrack: { height: 6, overflow: 'hidden', width: '100%' },
  pulse: { borderRadius: 4, height: 7, width: 7 },
  pulses: { flexDirection: 'row', gap: 3 },
  roleCopy: { flex: 1, gap: 3 },
  roleIcon: { alignItems: 'center', borderRadius: 13, borderWidth: 1, height: 43, justifyContent: 'center', width: 43 },
  roleLabel: { fontSize: 13, lineHeight: 17 },
  roleStation: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 12 },
  roleText: { fontSize: 13, lineHeight: 18 },
  riddleCard: { alignItems: 'center', borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 82, padding: 11 },
  riddleIndex: { alignItems: 'center', borderRadius: 11, height: 39, justifyContent: 'center', width: 39 },
  riddleIndexText: { color: '#171309', fontSize: 22 },
  riddleStack: { gap: 7 },
  riddleText: { flex: 1, fontSize: 16, lineHeight: 21 },
  submit: { alignItems: 'center', borderRadius: 15, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 15 },
  submitGrow: { flex: 1 },
  submitText: { color: '#08100F', fontSize: 19, letterSpacing: 0.4 },
  teammateNote: { fontSize: 13, lineHeight: 18 },
  undoButton: { alignItems: 'center', borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 58, paddingHorizontal: 12 },
  undoText: { fontSize: 12 },
  waiting: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 9, paddingTop: 12 },
  waitingPulse: { borderRadius: 4, height: 8, width: 8 },
  waitingText: { flex: 1, fontSize: 12, lineHeight: 17 },
  waveBar: { borderRadius: 2, width: 16 },
  waveBars: { alignItems: 'center', flexDirection: 'row', gap: 10, height: 66 },
  wheel: { borderBottomWidth: 1, borderTopWidth: 1, gap: 10, paddingVertical: 11 },
  wheelDigit: { fontSize: 21 },
  wheelEntries: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, justifyContent: 'space-between' },
  wheelEntry: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 5, minHeight: 48, paddingHorizontal: 8, width: '31%' },
  wheelHeader: { gap: 3 },
  wheelHelp: { fontSize: 12, lineHeight: 16 },
  wheelLine: { height: 1, width: 9 },
  wheelName: { flex: 1, fontSize: 7, letterSpacing: 0.5 },
  weaveCross: { alignItems: 'center', height: 120, justifyContent: 'center', opacity: 0.46, position: 'absolute', width: 120 },
  weaveArrowButton: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 42 },
  weaveArrowControls: { flexDirection: 'row', gap: 6 },
  weaveFrame: { borderTopWidth: 3, gap: 10, paddingTop: 11 },
  weaveHelp: { fontSize: 11 },
  weaveHorizontal: { height: 1, position: 'absolute', width: 120 },
  weavePad: { alignItems: 'center', gap: 4, justifyContent: 'center', minHeight: 205, overflow: 'hidden' },
  weaveRail: { flexDirection: 'row', gap: 7 },
  weaveStep: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flex: 1, height: 49, justifyContent: 'center' },
  weaveStepText: { fontSize: 21 },
  weaveTitle: { fontSize: 31, lineHeight: 32 },
  weaveVertical: { height: 120, position: 'absolute', width: 1 },
});

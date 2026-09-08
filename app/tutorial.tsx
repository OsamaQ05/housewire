import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { ScreenShell } from '@/src/components/ScreenShell';
import {
  FIRST_LIGHT_SEALS,
  FIRST_LIGHT_STEPS,
  firstLightGuideHint,
  isFirstLightSealCorrect,
  nextFirstLightStep,
  type FirstLightSealOption,
} from '@/src/domain/first-light';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

const GOLD = '#FFD166';
const MINT = '#6DD6C9';
const CORAL = '#FF7657';
const INK = '#07100D';

interface PracticeMessage {
  id: string;
  name: string;
  room: string;
  body: string;
  local?: boolean;
}

export default function TutorialScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const completeTutorial = useHousewireStore((state) => state.completeTutorial);
  const finishOnboarding = useHousewireStore((state) => state.finishOnboarding);
  const hapticsEnabled = useHousewireStore((state) => state.settings.haptics);
  const [stepIndex, setStepIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideReason, setGuideReason] = useState('You asked for a small nudge.');
  const [contactComplete, setContactComplete] = useState(false);
  const step = FIRST_LIGHT_STEPS[stepIndex];

  useEffect(() => {
    setGuideOpen(false);
    setGuideReason('You asked for a small nudge.');
    const timer = setTimeout(() => {
      setGuideReason('There has been no progress for a little while.');
      setGuideOpen(true);
    }, 18_000);
    return () => clearTimeout(timer);
  }, [stepIndex]);

  const advance = () => {
    setGuideOpen(false);
    play('relay', 0.48);
    setStepIndex((current) => nextFirstLightStep(current));
  };

  const finish = () => {
    finishOnboarding();
    completeTutorial();
    setFinished(true);
    play('complete', 0.88);
    if (hapticsEnabled) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    }
  };

  const restart = () => {
    setStepIndex(0);
    setFinished(false);
    setContactComplete(false);
    setGuideOpen(false);
  };

  const requestGuide = (reason = 'You asked for a small nudge.') => {
    setGuideReason(reason);
    setGuideOpen(true);
    play('switch', 0.32);
  };

  if (finished) {
    return (
      <ScreenShell edgeWire="both" padded={false} texture={false}>
        <ScrollView contentContainerStyle={styles.completeScreen} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(420)} style={styles.completeMark}>
            <View style={[styles.completeHalo, { borderColor: GOLD }]} />
            <View style={[styles.completeHaloSmall, { borderColor: MINT }]} />
            <Ionicons color={GOLD} name="home-outline" size={54} />
          </Animated.View>
          <View style={styles.completeCopy}>
            <Text style={[styles.kicker, { color: MINT, fontFamily: theme.typography.families.monoMedium }]}>CASE 00 · COMPLETE</Text>
            <Text accessibilityRole="header" style={[styles.completeTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>The house is listening.</Text>
            <Text style={[styles.completeBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>You used the line, combined private clues, held a shared contact and finished together. You’re ready for a full case.</Text>
          </View>
          <View style={styles.completeActions}>
            <PrimaryAction icon="grid-outline" label="Choose a game" onPress={() => router.replace('/modes')} />
            <SecondaryAction icon="refresh" label="Replay First Light" onPress={restart} />
          </View>
        </ScrollView>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell edgeWire="both" padded={false} texture={false}>
      <View style={styles.screen}>
        <View style={[styles.header, { borderColor: theme.colors.draft }]}>
          <View style={styles.headerTopline}>
            <Pressable accessibilityLabel="Leave practice" accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={({ pressed }) => pressed && styles.pressed}>
              <Ionicons color={theme.colors.text} name="close" size={23} />
            </Pressable>
            <View style={styles.caseLabel}>
              <View style={[styles.liveDot, { backgroundColor: GOLD }]} />
              <Text style={[styles.caseLabelText, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>FIRST LIGHT</Text>
            </View>
            <Pressable accessibilityLabel="Ask the adaptive Guide for a hint" accessibilityRole="button" onPress={() => requestGuide()} style={({ pressed }) => [styles.guideButton, { borderColor: guideOpen ? GOLD : theme.colors.draft }, pressed && styles.pressed]}>
              <Ionicons color={guideOpen ? GOLD : theme.colors.muted} name="compass-outline" size={17} />
              <Text style={[styles.guideButtonText, { color: guideOpen ? GOLD : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>GUIDE</Text>
            </Pressable>
          </View>
          <View accessibilityLabel={`Step ${stepIndex + 1} of ${FIRST_LIGHT_STEPS.length}`} style={styles.progress}>
            {FIRST_LIGHT_STEPS.map((item, index) => (
              <View key={item.id} style={[styles.progressSegment, { backgroundColor: index < stepIndex ? MINT : index === stepIndex ? GOLD : theme.colors.draft }]} />
            ))}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(300)} key={step.id} style={styles.stepHeading}>
            <Text style={[styles.kicker, { color: GOLD, fontFamily: theme.typography.families.monoMedium }]}>{step.eyebrow}</Text>
            <Text accessibilityRole="header" style={[styles.stepTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{step.title}</Text>
            <View style={[styles.doNow, { backgroundColor: theme.colors.surface, borderColor: GOLD }]}>
              <Text style={[styles.doNowLabel, { color: GOLD, fontFamily: theme.typography.families.monoMedium }]}>DO THIS NOW</Text>
              <Text style={[styles.doNowText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{step.instruction}</Text>
            </View>
          </Animated.View>

          {step.id === 'house-line' ? <HouseLineStep onAdvance={advance} play={play} /> : null}
          {step.id === 'private-seal' ? <PrivateSealStep onAdvance={advance} onNeedGuide={requestGuide} play={play} /> : null}
          {step.id === 'carry-signal' ? (
            <ContactStep complete={contactComplete} onAdvance={advance} onComplete={() => { setContactComplete(true); play('accept', 0.58); }} />
          ) : null}
          {step.id === 'finale' ? <FinaleStep onFinish={finish} play={play} /> : null}

          {guideOpen ? (
            <Animated.View entering={FadeInDown.duration(220)} style={[styles.guidePanel, { backgroundColor: theme.colors.surfaceRaised, borderColor: GOLD }]}>
              <View style={styles.guideTopline}>
                <View style={styles.guideIdentity}>
                  <Ionicons color={GOLD} name="compass-outline" size={20} />
                  <View>
                    <Text style={[styles.guideEyebrow, { color: GOLD, fontFamily: theme.typography.families.monoMedium }]}>ON-DEVICE AI GUIDE · NUDGE 1/1</Text>
                    <Text style={[styles.guideWhy, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>{guideReason}</Text>
                  </View>
                </View>
                <Pressable accessibilityLabel="Close Guide" accessibilityRole="button" hitSlop={10} onPress={() => setGuideOpen(false)}>
                  <Ionicons color={theme.colors.muted} name="close" size={20} />
                </Pressable>
              </View>
              <Text style={[styles.guideHint, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{firstLightGuideHint(stepIndex)}</Text>
              <Text style={[styles.guidePrivacy, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>The Guide uses time and attempts—not conversations.</Text>
            </Animated.View>
          ) : null}
        </ScrollView>
      </View>
    </ScreenShell>
  );
}

function HouseLineStep({ onAdvance, play }: { onAdvance: () => void; play: ReturnType<typeof useHousewireSound>['play'] }) {
  const { theme } = useHousewireTheme();
  const [talking, setTalking] = useState(false);
  const [sent, setSent] = useState(false);
  const [messages, setMessages] = useState<PracticeMessage[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const talkingRef = useRef(false);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const send = () => {
    if (!talkingRef.current || sent) return;
    talkingRef.current = false;
    setTalking(false);
    setSent(true);
    setMessages([{ id: 'you', name: 'You', room: 'Living room', body: 'Living room ready.', local: true }]);
    play('relay', 0.58);
    timersRef.current.push(setTimeout(() => {
      setMessages((current) => [...current, { id: 'mara', name: 'Mara', room: 'Hall', body: 'Hall ready.' }]);
      play('node2', 0.45);
    }, 620));
    timersRef.current.push(setTimeout(() => {
      setMessages((current) => [...current, { id: 'samir', name: 'Samir', room: 'Kitchen', body: 'Kitchen ready.' }]);
      play('node3', 0.45);
    }, 1_220));
  };

  return (
    <View style={styles.stepBody}>
      <View style={[styles.lineStatus, { borderColor: MINT }]}>
        <View style={[styles.lineDot, { backgroundColor: MINT }]} />
        <Text style={[styles.lineStatusText, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>PRACTICE HOUSE LINE · 3 ROOMS</Text>
      </View>

      <View style={styles.messageStack}>
        {messages.length === 0 ? (
          <View style={[styles.emptyMessage, { borderColor: theme.colors.draft }]}>
            <Ionicons color={theme.colors.faint} name="radio-outline" size={30} />
            <Text style={[styles.emptyMessageText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>The other rooms are waiting for your call.</Text>
          </View>
        ) : messages.map((message) => <MessageBubble key={message.id} message={message} />)}
      </View>

      <Pressable
        accessibilityHint="Hold, speak, then release"
        accessibilityLabel={sent ? 'Practice message sent' : 'Hold to talk on the House Line'}
        accessibilityRole="button"
        disabled={sent}
        onPressIn={() => { talkingRef.current = true; setTalking(true); play('pulse', 0.25); }}
        onPressOut={send}
        onPress={send}
        style={({ pressed }) => [styles.talkRing, { backgroundColor: talking || pressed ? GOLD : CORAL, borderColor: talking ? '#FFF2B8' : GOLD }, sent && styles.completedControl]}
      >
        <View style={styles.waveform}>
          {[16, 28, 40, 25, 34].map((height, index) => <View key={index} style={[styles.waveBar, { backgroundColor: INK, height: talking ? height : Math.max(8, height / 3) }]} />)}
        </View>
        <Text style={[styles.talkLabel, { color: INK, fontFamily: theme.typography.families.displayHeavy }]}>{sent ? 'SENT' : talking ? 'SPEAK NOW' : 'HOLD TO TALK'}</Text>
      </Pressable>

      <Text style={[styles.practiceNote, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>These replies are simulated for practice. In a live game, they come from your family’s phones.</Text>
      {messages.length === 3 ? <PrimaryAction icon="arrow-forward" label="The line works" onPress={onAdvance} /> : null}
    </View>
  );
}

function MessageBubble({ message }: { message: PracticeMessage }) {
  const { theme } = useHousewireTheme();
  return (
    <Animated.View entering={FadeInDown.duration(220)} style={[styles.message, { alignSelf: message.local ? 'flex-end' : 'flex-start', backgroundColor: message.local ? CORAL : theme.colors.surfaceRaised, borderColor: message.local ? CORAL : MINT }]}>
      <Text style={[styles.messageMeta, { color: message.local ? INK : MINT, fontFamily: theme.typography.families.monoMedium }]}>{message.name.toUpperCase()} · {message.room.toUpperCase()}</Text>
      <Text style={[styles.messageBody, { color: message.local ? INK : theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{message.body}</Text>
    </Animated.View>
  );
}

function PrivateSealStep({ onAdvance, onNeedGuide, play }: { onAdvance: () => void; onNeedGuide: (reason?: string) => void; play: ReturnType<typeof useHousewireSound>['play'] }) {
  const { theme } = useHousewireTheme();
  const [remoteClues, setRemoteClues] = useState<PracticeMessage[]>([]);
  const [opened, setOpened] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [solved, setSolved] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const openLine = () => {
    if (opened) return;
    setOpened(true);
    play('switch', 0.42);
    timersRef.current.push(setTimeout(() => {
      setRemoteClues([{ id: 'mara-clue', name: 'Mara', room: 'Hall', body: 'My private detail is THREE.' }]);
      play('node2', 0.44);
    }, 450));
    timersRef.current.push(setTimeout(() => {
      setRemoteClues((current) => [...current, { id: 'samir-clue', name: 'Samir', room: 'Kitchen', body: 'My private detail is TRIANGLE.' }]);
      play('node3', 0.44);
    }, 980));
  };

  const choose = (id: string) => {
    if (isFirstLightSealCorrect(id)) {
      setSolved(true);
      setWrong(false);
      play('accept', 0.62);
      return;
    }
    setWrong(true);
    play('warning', 0.46);
    onNeedGuide('That seal missed one of the three private details.');
  };

  return (
    <View style={styles.stepBody}>
      <View style={[styles.privateCard, { backgroundColor: '#123A46', borderColor: MINT }]}>
        <View style={styles.privateTopline}>
          <Ionicons color={MINT} name="lock-closed-outline" size={19} />
          <Text style={[styles.privateLabel, { color: MINT, fontFamily: theme.typography.families.monoMedium }]}>YOUR PRIVATE DETAIL · TELL THE HOUSE</Text>
        </View>
        <Text style={[styles.privateValue, { color: '#B8EAF2', fontFamily: theme.typography.families.displayHeavy }]}>BLUE</Text>
      </View>

      {remoteClues.map((message) => <MessageBubble key={message.id} message={message} />)}
      {!opened ? <PrimaryAction icon="ear-outline" label="Hear the other rooms" onPress={openLine} /> : null}

      {remoteClues.length === 2 ? (
        <Animated.View entering={FadeInDown.duration(250)} style={styles.sealArea}>
          <Text style={[styles.chooseLabel, { color: wrong ? theme.colors.fault : theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{wrong ? 'Almost. Match all three details.' : 'Which seal uses every detail?'}</Text>
          <View style={styles.sealRow}>
            {FIRST_LIGHT_SEALS.map((seal) => <SealChoice disabled={solved} key={seal.id} onPress={() => choose(seal.id)} seal={seal} selected={solved && isFirstLightSealCorrect(seal.id)} />)}
          </View>
        </Animated.View>
      ) : null}

      {solved ? (
        <Animated.View entering={FadeIn.duration(220)} style={[styles.successBand, { borderColor: MINT }]}>
          <Ionicons color={MINT} name="checkmark-circle" size={28} />
          <Text style={[styles.successText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Blue · three · triangle. The private pieces became one answer.</Text>
        </Animated.View>
      ) : null}
      {solved ? <PrimaryAction icon="arrow-forward" label="Continue" onPress={onAdvance} /> : null}
    </View>
  );
}

function SealChoice({ disabled, onPress, seal, selected }: { disabled: boolean; onPress: () => void; seal: FirstLightSealOption; selected: boolean }) {
  const { theme } = useHousewireTheme();
  const color = seal.color === 'BLUE' ? '#69CCDF' : seal.color === 'AMBER' ? GOLD : CORAL;
  const shape = seal.shape === 'TRIANGLE' ? '△' : seal.shape === 'DIAMOND' ? '◇' : '○';
  return (
    <Pressable accessibilityLabel={`${seal.color}, ${seal.count}, ${seal.shape}`} accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.sealChoice, { borderColor: selected ? MINT : color, backgroundColor: selected ? '#153C35' : theme.colors.surface }, pressed && styles.pressed]}>
      <Text style={[styles.sealShape, { color, fontFamily: theme.typography.families.displayHeavy }]}>{shape}</Text>
      <Text style={[styles.sealCount, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{seal.count}</Text>
      <Text style={[styles.sealColor, { color, fontFamily: theme.typography.families.monoMedium }]}>{seal.color}</Text>
    </Pressable>
  );
}

function ContactStep({ complete, onAdvance, onComplete }: { complete: boolean; onAdvance: () => void; onComplete: () => void }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.stepBody}>
      <View style={styles.motionStage}>
        <View style={[styles.roomDoor, { borderColor: complete ? MINT : GOLD }]}>
          <Text style={[styles.roomDoorLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>SHARED CONTACT</Text>
          <Ionicons color={complete ? MINT : GOLD} name={complete ? 'checkmark-circle' : 'finger-print-outline'} size={62} />
        </View>
      </View>

      <View style={[styles.sensorPanel, { backgroundColor: theme.colors.surface, borderColor: complete ? MINT : theme.colors.draft }]}>
        <View style={styles.sensorTopline}>
          <Text style={[styles.sensorState, { color: complete ? MINT : GOLD, fontFamily: theme.typography.families.monoMedium }]}>{complete ? 'CONTACT LOCKED' : 'CONTACT OPEN'}</Text>
          <Text style={[styles.sensorPercent, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{complete ? '100' : '0'}%</Text>
        </View>
        <View style={[styles.sensorRail, { backgroundColor: theme.colors.draft }]}><View style={[styles.sensorFill, { backgroundColor: complete ? MINT : GOLD, width: complete ? '100%' : '6%' }]} /></View>
      </View>

      {!complete ? (
        <Pressable accessibilityHint="Hold for one second" accessibilityLabel="Hold the shared contact" accessibilityRole="button" delayLongPress={900} onLongPress={onComplete} style={({ pressed }) => [styles.holdFallback, { backgroundColor: pressed ? GOLD : theme.colors.surfaceRaised, borderColor: GOLD }]}>
          <Ionicons color={GOLD} name="hand-left-outline" size={24} />
          <Text style={[styles.holdFallbackText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Hold to lock the contact</Text>
        </Pressable>
      ) : null}
      {complete ? <PrimaryAction icon="checkmark" label="Contact locked" onPress={onAdvance} /> : null}
    </View>
  );
}

function FinaleStep({ onFinish, play }: { onFinish: () => void; play: ReturnType<typeof useHousewireSound>['play'] }) {
  const { theme } = useHousewireTheme();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [windowOpen, setWindowOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const startCountdown = () => {
    if (countdown !== null || windowOpen) return;
    setCountdown(3);
    play('ring', 0.34);
    timersRef.current.push(setTimeout(() => { setCountdown(2); play('ring', 0.38); }, 720));
    timersRef.current.push(setTimeout(() => { setCountdown(1); play('ring', 0.43); }, 1_440));
    timersRef.current.push(setTimeout(() => { setCountdown(0); setWindowOpen(true); play('pulse', 0.7); }, 2_160));
  };

  const lock = () => {
    if (!windowOpen || locked) return;
    setLocked(true);
    play('accept', 0.7);
  };

  return (
    <View style={styles.stepBody}>
      <View style={styles.finalRooms}>
        {['MARA · HALL', 'YOU · LIVING', 'SAMIR · KITCHEN'].map((label, index) => {
          const ready = windowOpen && (index !== 1 || locked);
          return (
            <View key={label} style={styles.finalRoom}>
              <View style={[styles.finalRoomLight, { backgroundColor: ready ? GOLD : theme.colors.surface, borderColor: ready ? '#FFF0A8' : theme.colors.draft }]}>
                <Ionicons color={ready ? INK : theme.colors.faint} name="bulb-outline" size={28} />
              </View>
              <Text style={[styles.finalRoomLabel, { color: ready ? theme.colors.text : theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>{label}</Text>
            </View>
          );
        })}
      </View>

      <View style={[styles.countdownWell, { borderColor: windowOpen ? GOLD : theme.colors.draft }]}>
        <Text style={[styles.countdownLabel, { color: windowOpen ? GOLD : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{windowOpen ? 'ALL ROOMS ARE HOLDING' : 'SHARED COUNTDOWN'}</Text>
        <Text style={[styles.countdownNumber, { color: windowOpen ? GOLD : theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{countdown === null ? '—' : countdown === 0 ? 'NOW' : countdown}</Text>
        {countdown === null ? <PrimaryAction icon="play" label="Start countdown" onPress={startCountdown} /> : null}
        {windowOpen && !locked ? (
          <Pressable accessibilityHint="Hold until the light locks" accessibilityLabel="Hold your light" accessibilityRole="button" delayLongPress={1_050} onLongPress={lock} style={({ pressed }) => [styles.finalHold, { backgroundColor: pressed ? GOLD : CORAL, borderColor: GOLD }]}>
            <Ionicons color={INK} name="finger-print-outline" size={30} />
            <Text style={[styles.finalHoldText, { color: INK, fontFamily: theme.typography.families.displayHeavy }]}>HOLD YOUR LIGHT</Text>
          </Pressable>
        ) : null}
        {locked ? <View style={styles.lockedLine}><Ionicons color={MINT} name="checkmark-circle" size={26} /><Text style={[styles.lockedText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Every room lit together.</Text></View> : null}
      </View>
      {locked ? <PrimaryAction icon="sunny-outline" label="Finish practice" onPress={onFinish} /> : null}
    </View>
  );
}

function PrimaryAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.primaryAction, { backgroundColor: GOLD, borderColor: GOLD }, pressed && styles.pressed]}>
      <Text style={[styles.primaryActionText, { color: INK, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
      <Ionicons color={INK} name={icon} size={21} />
    </Pressable>
  );
}

function SecondaryAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondaryAction, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
      <Ionicons color={theme.colors.text} name={icon} size={20} />
      <Text style={[styles.secondaryActionText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  caseLabel: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  caseLabelText: { fontSize: 18, letterSpacing: 0.6 },
  chooseLabel: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  completeActions: { gap: 10, width: '100%' },
  completeBody: { fontSize: 18, lineHeight: 27, textAlign: 'center' },
  completeCopy: { alignItems: 'center', gap: 10 },
  completeHalo: { borderRadius: 100, borderWidth: 1, height: 180, position: 'absolute', width: 180 },
  completeHaloSmall: { borderRadius: 74, borderWidth: 2, height: 132, position: 'absolute', width: 132 },
  completeMark: { alignItems: 'center', height: 200, justifyContent: 'center', width: 200 },
  completeScreen: { alignItems: 'center', flexGrow: 1, gap: 28, justifyContent: 'center', paddingBottom: 36, paddingHorizontal: 22, paddingTop: 30 },
  completeTitle: { fontSize: 52, letterSpacing: 0.1, lineHeight: 50, textAlign: 'center' },
  completedControl: { opacity: 0.55 },
  content: { gap: 20, paddingBottom: 42, paddingHorizontal: 20, paddingTop: 20 },
  countdownLabel: { fontSize: 10, letterSpacing: 1.2 },
  countdownNumber: { fontSize: 68, lineHeight: 72 },
  countdownWell: { alignItems: 'center', borderWidth: 1, gap: 18, minHeight: 260, padding: 22 },
  doNow: { borderLeftWidth: 3, gap: 6, paddingHorizontal: 14, paddingVertical: 13 },
  doNowLabel: { fontSize: 9, letterSpacing: 1.2 },
  doNowText: { fontSize: 17, lineHeight: 24 },
  emptyMessage: { alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 72, padding: 14 },
  emptyMessageText: { flex: 1, fontSize: 15, lineHeight: 21 },
  fallbackToggle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, minHeight: 42 },
  fallbackToggleText: { fontSize: 15 },
  finalHold: { alignItems: 'center', borderRadius: 50, borderWidth: 2, gap: 6, height: 100, justifyContent: 'center', width: 190 },
  finalHoldText: { fontSize: 18, letterSpacing: 0.5 },
  finalRoom: { alignItems: 'center', flex: 1, gap: 8 },
  finalRoomLabel: { fontSize: 8, letterSpacing: 0.6, textAlign: 'center' },
  finalRoomLight: { alignItems: 'center', borderRadius: 34, borderWidth: 1, height: 66, justifyContent: 'center', width: 66 },
  finalRooms: { flexDirection: 'row', gap: 8 },
  guideButton: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 5, minHeight: 34, paddingHorizontal: 9 },
  guideButtonText: { fontSize: 9, letterSpacing: 0.8 },
  guideEyebrow: { fontSize: 9, letterSpacing: 0.8 },
  guideHint: { fontSize: 22, lineHeight: 27 },
  guideIdentity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10 },
  guidePanel: { borderLeftWidth: 3, gap: 13, padding: 16 },
  guidePrivacy: { fontSize: 12, lineHeight: 17 },
  guideTopline: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  guideWhy: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  header: { borderBottomWidth: 1, gap: 13, paddingBottom: 13, paddingHorizontal: 18, paddingTop: 12 },
  headerTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  holdFallback: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 58, paddingHorizontal: 16 },
  holdFallbackText: { fontSize: 16 },
  kicker: { fontSize: 10, letterSpacing: 1.25 },
  lineDot: { borderRadius: 5, height: 9, width: 9 },
  lineStatus: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: 9, paddingVertical: 11 },
  lineStatusText: { fontSize: 9, letterSpacing: 0.9 },
  liveDot: { borderRadius: 5, height: 9, width: 9 },
  lockedLine: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  lockedText: { fontSize: 17 },
  message: { borderLeftWidth: 3, gap: 4, maxWidth: '88%', minWidth: '62%', paddingHorizontal: 13, paddingVertical: 11 },
  messageBody: { fontSize: 16, lineHeight: 21 },
  messageMeta: { fontSize: 8, letterSpacing: 0.8 },
  messageStack: { gap: 8 },
  motionPrompt: { fontSize: 23, lineHeight: 27, textAlign: 'center' },
  motionStage: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  phoneProp: { alignItems: 'center', borderRadius: 6, borderWidth: 2, height: 92, justifyContent: 'center', width: 54 },
  phonePropDot: { borderRadius: 4, bottom: 7, height: 7, position: 'absolute', width: 7 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  primaryAction: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 17 },
  primaryActionText: { fontSize: 17 },
  privateCard: { borderWidth: 1, gap: 16, padding: 18 },
  privateLabel: { fontSize: 9, letterSpacing: 0.9 },
  privateTopline: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  privateValue: { fontSize: 58, letterSpacing: 1.5, lineHeight: 60 },
  practiceNote: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  progress: { flexDirection: 'row', gap: 5 },
  progressSegment: { flex: 1, height: 3 },
  roomDoor: { alignItems: 'center', borderWidth: 1, gap: 12, height: 144, justifyContent: 'center', padding: 8, width: 112 },
  roomDoorLabel: { fontSize: 8, letterSpacing: 0.7 },
  routeArrow: { alignItems: 'center', flexDirection: 'row', width: 58 },
  routeLine: { flex: 1, height: 2 },
  screen: { flex: 1 },
  sealArea: { gap: 11 },
  sealChoice: { alignItems: 'center', borderWidth: 1, flex: 1, gap: 3, minHeight: 118, paddingHorizontal: 5, paddingVertical: 10 },
  sealColor: { fontSize: 8, letterSpacing: 0.6 },
  sealCount: { fontSize: 24, lineHeight: 27 },
  sealRow: { flexDirection: 'row', gap: 8 },
  sealShape: { fontSize: 35, lineHeight: 38 },
  secondaryAction: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 54, paddingHorizontal: 16 },
  secondaryActionText: { fontSize: 16 },
  sensorFill: { height: 5 },
  sensorPanel: { borderWidth: 1, gap: 15, padding: 16 },
  sensorPercent: { fontSize: 27 },
  sensorRail: { height: 5, overflow: 'hidden' },
  sensorState: { fontSize: 9, letterSpacing: 0.9 },
  sensorTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  stepBody: { gap: 15 },
  stepHeading: { gap: 10 },
  stepTitle: { fontSize: 48, letterSpacing: 0.1, lineHeight: 46 },
  successBand: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 13 },
  successText: { flex: 1, fontSize: 15, lineHeight: 21 },
  talkLabel: { fontSize: 20, letterSpacing: 0.5 },
  talkRing: { alignItems: 'center', alignSelf: 'center', borderRadius: 100, borderWidth: 3, gap: 10, height: 174, justifyContent: 'center', width: 174 },
  waveform: { alignItems: 'center', flexDirection: 'row', gap: 5, height: 44 },
  waveBar: { borderRadius: 3, width: 5 },
});

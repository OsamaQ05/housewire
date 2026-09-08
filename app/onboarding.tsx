import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { ScreenShell } from '@/src/components/ScreenShell';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

const GOLD = '#FFD166';
const MINT = '#6DD6C9';
const CORAL = '#FF7657';
const INK = '#07100D';

const pages = [
  {
    eyebrow: 'WELCOME TO HOUSEWIRE',
    title: 'Your home is the game board.',
    body: 'Choose a story escape, a family prediction game, or a two-team race. Every mode gets people doing something together.',
    action: 'See how escapes work',
  },
  {
    eyebrow: 'BEFORE THE CASE',
    title: 'Start together. Then split up.',
    body: 'One person creates the game. Everyone else scans one QR. Then each player takes a phone to a safe room.',
    action: 'Next: stay connected',
  },
  {
    eyebrow: 'THE HOUSE LINE',
    title: 'Talk between rooms.',
    body: 'Hold the orange ring, speak, then release. Every room hears your short voice pulse. Private lines clearly name the only listener.',
    action: 'I’ve got it',
  },
  {
    eyebrow: 'ON-DEVICE AI GUIDE',
    title: 'Help appears when you need it.',
    body: 'The Guide uses time, retries and unavailable sensors—not your conversations—to offer one small nudge. It never solves the puzzle for you.',
    action: 'Play First Light',
  },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const finishOnboarding = useHousewireStore((state) => state.finishOnboarding);
  const [page, setPage] = useState(0);
  const [talking, setTalking] = useState(false);
  const [lineTested, setLineTested] = useState(false);
  const [replyVisible, setReplyVisible] = useState(false);
  const [guideHintVisible, setGuideHintVisible] = useState(false);
  const talkingRef = useRef(false);
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = pages[page];

  useEffect(() => () => {
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
  }, []);

  const skip = () => {
    finishOnboarding();
    play('switch', 0.38);
    router.replace('/modes');
  };

  const advance = () => {
    if (page === pages.length - 1) {
      finishOnboarding();
      play('relay', 0.58);
      router.replace('/tutorial');
      return;
    }
    play('switch', 0.36);
    setPage((value) => value + 1);
  };

  const finishLinePulse = () => {
    if (!talkingRef.current) return;
    talkingRef.current = false;
    setTalking(false);
    setLineTested(true);
    play('relay', 0.5);
    replyTimerRef.current = setTimeout(() => {
      setReplyVisible(true);
      play('node2', 0.42);
    }, 620);
  };

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <ScrollView contentContainerStyle={styles.screen} overScrollMode="never" showsVerticalScrollIndicator={false}>
        <View style={styles.topline}>
          <Text style={[styles.brand, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>HOUSEWIRE</Text>
          <Pressable accessibilityHint="Skips the introduction and opens the game modes" accessibilityRole="button" hitSlop={10} onPress={skip} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={[styles.skip, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>Skip tour</Text>
          </Pressable>
        </View>

        <Animated.View entering={FadeIn.duration(260)} key={page} style={styles.page}>
          <View style={styles.visual}>
            {page === 0 ? <HomeVisual /> : null}
            {page === 1 ? <JoinVisual /> : null}
            {page === 2 ? (
              <LineVisual
                lineTested={lineTested}
                onPressIn={() => { talkingRef.current = true; setTalking(true); play('pulse', 0.24); }}
                onPressOut={finishLinePulse}
                replyVisible={replyVisible}
                talking={talking}
              />
            ) : null}
            {page === 3 ? <GuideVisual hintVisible={guideHintVisible} onReveal={() => { setGuideHintVisible(true); play('accept', 0.42); }} /> : null}
          </View>

          <View style={styles.copy}>
            <Text style={[styles.eyebrow, { color: page === 2 ? CORAL : GOLD, fontFamily: theme.typography.families.monoMedium }]}>{current.eyebrow}</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{current.title}</Text>
            <Text style={[styles.body, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{current.body}</Text>
          </View>
        </Animated.View>

        <View style={styles.controls}>
          <View accessibilityLabel={`Step ${page + 1} of ${pages.length}`} accessible style={styles.dots}>
            {pages.map((item, index) => <View key={item.eyebrow} style={[styles.dot, { backgroundColor: index <= page ? GOLD : theme.colors.draft }]} />)}
          </View>
          <Pressable accessibilityRole="button" onPress={advance} style={({ pressed }) => [styles.action, { backgroundColor: GOLD }, pressed && styles.pressed]}>
            <Text style={[styles.actionText, { color: INK, fontFamily: theme.typography.families.bodyMedium }]}>{current.action}</Text>
            <Ionicons color={INK} name="arrow-forward" size={21} />
          </Pressable>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function HomeVisual() {
  const { theme } = useHousewireTheme();
  return (
    <View accessibilityLabel="Three family phones in different rooms connected by one glowing line" accessibilityRole="image" style={styles.house}>
      <View style={[styles.roofLeft, { borderBottomColor: theme.colors.draft }]} />
      <View style={[styles.roofRight, { borderBottomColor: theme.colors.draft }]} />
      <View style={[styles.houseBody, { borderColor: theme.colors.draft }]}>
        <View style={[styles.houseDividerVertical, { backgroundColor: theme.colors.draft }]} />
        <View style={[styles.houseDividerHorizontal, { backgroundColor: theme.colors.draft }]} />
        <View style={[styles.houseWire, { backgroundColor: GOLD }]} />
        {[
          { left: 34, top: 26 },
          { left: 178, top: 26 },
          { left: 105, top: 137 },
        ].map((position, index) => (
          <View key={index} style={[styles.miniPhone, position, { backgroundColor: theme.colors.surfaceRaised, borderColor: index === 0 ? CORAL : MINT }]}>
            <Ionicons color={index === 0 ? CORAL : MINT} name="phone-portrait-outline" size={30} />
          </View>
        ))}
      </View>
    </View>
  );
}

function JoinVisual() {
  const { theme } = useHousewireTheme();
  return (
    <View accessibilityLabel="One host phone shares a QR with two joining phones" accessibilityRole="image" style={styles.joinVisual}>
      <View style={[styles.hostPhone, { borderColor: GOLD }]}>
        <Text style={[styles.hostLabel, { color: GOLD, fontFamily: theme.typography.families.monoMedium }]}>HOST</Text>
        <View style={styles.qrMock}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((cell) => <View key={cell} style={[styles.qrCell, { backgroundColor: cell % 2 === 0 || cell === 5 ? INK : 'transparent' }]} />)}
        </View>
      </View>
      <View style={styles.joinArrow}>
        <View style={[styles.joinArrowLine, { backgroundColor: GOLD }]} />
        <Ionicons color={GOLD} name="arrow-forward" size={23} />
      </View>
      <View style={styles.guestStack}>
        {[0, 1].map((index) => <View key={index} style={[styles.guestPhone, { backgroundColor: theme.colors.surface, borderColor: MINT }]}><Ionicons color={MINT} name={index === 0 ? 'scan-outline' : 'checkmark-circle-outline'} size={32} /></View>)}
      </View>
      <View style={[styles.checklist, { backgroundColor: theme.colors.surface }]}>
        {['Same Wi‑Fi', 'Sound on', 'Clear paths'].map((label) => <View key={label} style={styles.checkItem}><Ionicons color={MINT} name="checkmark" size={16} /><Text style={[styles.checkText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text></View>)}
      </View>
    </View>
  );
}

function LineVisual({ lineTested, onPressIn, onPressOut, replyVisible, talking }: { lineTested: boolean; onPressIn: () => void; onPressOut: () => void; replyVisible: boolean; talking: boolean }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.lineVisual}>
      <View style={[styles.linePill, { borderColor: MINT }]}><View style={[styles.lineLiveDot, { backgroundColor: MINT }]} /><Text style={[styles.linePillText, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>HOUSE LINE · ALL ROOMS</Text></View>
      <Pressable accessibilityHint="This is a visual practice control; no microphone permission is requested" accessibilityLabel="Hold to practise the House Line" accessibilityRole="button" onPress={onPressOut} onPressIn={onPressIn} onPressOut={onPressOut} style={({ pressed }) => [styles.talkButton, { backgroundColor: talking || pressed ? GOLD : CORAL, borderColor: GOLD }]}>
        <Ionicons color={INK} name={lineTested ? 'checkmark' : 'mic-outline'} size={37} />
        <Text style={[styles.talkButtonText, { color: INK, fontFamily: theme.typography.families.displayHeavy }]}>{lineTested ? 'SENT' : talking ? 'SPEAK' : 'HOLD'}</Text>
      </Pressable>
      <Text style={[styles.tryLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{replyVisible ? 'Mara · Hall: “Heard you.”' : lineTested ? 'Waiting for Hall…' : 'Try it: hold, speak, release.'}</Text>
    </View>
  );
}

function GuideVisual({ hintVisible, onReveal }: { hintVisible: boolean; onReveal: () => void }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={[styles.guideCard, { backgroundColor: theme.colors.surface, borderColor: GOLD }]}>
      <View style={styles.guideTopline}>
        <View style={[styles.guideIcon, { borderColor: GOLD }]}><Ionicons color={GOLD} name="compass-outline" size={28} /></View>
        <View style={styles.guideCopy}>
          <Text style={[styles.guideLabel, { color: GOLD, fontFamily: theme.typography.families.monoMedium }]}>ON-DEVICE AI GUIDE</Text>
          <Text style={[styles.guideReason, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>You’ve paused on this step.</Text>
        </View>
      </View>
      <Text style={[styles.guideQuestion, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{hintVisible ? 'Try combining one detail from every room.' : 'Want one small nudge?'}</Text>
      {!hintVisible ? <Pressable accessibilityRole="button" onPress={onReveal} style={[styles.guideReveal, { borderColor: GOLD }]}><Text style={[styles.guideRevealText, { color: GOLD, fontFamily: theme.typography.families.bodyMedium }]}>Show one clue</Text><Ionicons color={GOLD} name="arrow-forward" size={18} /></Pressable> : <Animated.View entering={FadeInDown.duration(220)} style={styles.guidePrivacy}><Ionicons color={MINT} name="shield-checkmark-outline" size={18} /><Text style={[styles.guidePrivacyText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>No voice or camera content is analyzed.</Text></Animated.View>}
    </View>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 59, paddingHorizontal: 18 },
  actionText: { fontSize: 18 },
  body: { fontSize: 17, lineHeight: 25 },
  brand: { fontSize: 26, letterSpacing: 0.5 },
  checkItem: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  checkText: { fontSize: 13 },
  checklist: { bottom: 0, flexDirection: 'row', gap: 13, justifyContent: 'center', left: 0, paddingHorizontal: 10, paddingVertical: 11, position: 'absolute', right: 0 },
  controls: { gap: 18 },
  copy: { gap: 9 },
  dot: { flex: 1, height: 4 },
  dots: { flexDirection: 'row', gap: 6 },
  eyebrow: { fontSize: 10, letterSpacing: 1.3 },
  guestPhone: { alignItems: 'center', borderWidth: 1, height: 76, justifyContent: 'center', width: 48 },
  guestStack: { gap: 12 },
  guideCard: { borderLeftWidth: 3, gap: 17, padding: 18, width: '100%' },
  guideCopy: { flex: 1, gap: 2 },
  guideIcon: { alignItems: 'center', borderRadius: 28, borderWidth: 1, height: 54, justifyContent: 'center', width: 54 },
  guideLabel: { fontSize: 10, letterSpacing: 1.1 },
  guidePrivacy: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  guidePrivacyText: { fontSize: 12 },
  guideQuestion: { fontSize: 25, lineHeight: 29 },
  guideReason: { fontSize: 13, lineHeight: 18 },
  guideReveal: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 13 },
  guideRevealText: { fontSize: 15 },
  guideTopline: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  hostLabel: { fontSize: 8, letterSpacing: 0.9 },
  hostPhone: { alignItems: 'center', borderWidth: 2, gap: 9, height: 142, justifyContent: 'center', width: 88 },
  house: { alignItems: 'center', height: 275, justifyContent: 'flex-end', width: 300 },
  houseBody: { borderWidth: 1, height: 214, overflow: 'hidden', width: 282 },
  houseDividerHorizontal: { height: 1, left: 0, position: 'absolute', right: 0, top: 106 },
  houseDividerVertical: { bottom: 0, left: 140, position: 'absolute', top: 0, width: 1 },
  houseWire: { height: 3, left: 30, position: 'absolute', right: 30, top: 103 },
  joinArrow: { alignItems: 'center', flexDirection: 'row', width: 52 },
  joinArrowLine: { flex: 1, height: 2 },
  joinVisual: { alignItems: 'center', flexDirection: 'row', height: 275, justifyContent: 'center', paddingBottom: 48, width: '100%' },
  lineLiveDot: { borderRadius: 5, height: 9, width: 9 },
  linePill: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: 8, paddingVertical: 9 },
  linePillText: { fontSize: 9, letterSpacing: 0.9 },
  lineVisual: { alignItems: 'center', gap: 18, justifyContent: 'center', minHeight: 275, width: '100%' },
  miniPhone: { alignItems: 'center', borderWidth: 1, height: 62, justifyContent: 'center', position: 'absolute', width: 40 },
  page: { gap: 22 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
  qrCell: { height: 12, width: 12 },
  qrMock: { backgroundColor: '#F1E9D7', flexDirection: 'row', flexWrap: 'wrap', height: 44, padding: 4, width: 44 },
  roofLeft: { borderBottomWidth: 54, borderLeftColor: 'transparent', borderLeftWidth: 0, borderRightColor: 'transparent', borderRightWidth: 142, height: 0, left: 9, position: 'absolute', top: 8, width: 0 },
  roofRight: { borderBottomWidth: 54, borderLeftColor: 'transparent', borderLeftWidth: 142, borderRightColor: 'transparent', borderRightWidth: 0, height: 0, position: 'absolute', right: 9, top: 8, width: 0 },
  screen: { flexGrow: 1, gap: 20, justifyContent: 'space-between', paddingBottom: 28, paddingHorizontal: 20, paddingTop: 14 },
  skip: { fontSize: 15 },
  talkButton: { alignItems: 'center', borderRadius: 72, borderWidth: 3, gap: 5, height: 142, justifyContent: 'center', width: 142 },
  talkButtonText: { fontSize: 20 },
  title: { fontSize: 46, letterSpacing: 0.1, lineHeight: 45 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  tryLabel: { fontSize: 14 },
  visual: { alignItems: 'center', justifyContent: 'center', minHeight: 280 },
});

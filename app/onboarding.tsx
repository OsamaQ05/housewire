import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { ScreenShell } from '@/src/components/ScreenShell';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';
import { decorativeAccessibilityProps } from '@/src/utils/accessibility';

const NIGHT = '#15223A';
const PAPER = '#FFF6E5';
const INK = '#182033';
const CORAL = '#FF7657';
const SUN = '#FFD166';
const MINT = '#6ED8C7';
const LILAC = '#B9A7F8';

const PAGES = [
  {
    title: 'Pick a game.',
    body: 'Escape together, race in teams, or find out how well you know each other.',
    note: 'No account or setup quiz.',
  },
  {
    title: 'One phone hosts.',
    body: 'For multiplayer games, the host shows a QR. Everyone else scans it and receives a private role.',
    note: 'You can preview every game on one phone.',
  },
  {
    title: 'Help appears when needed.',
    body: 'The AI Guide notices when you are stuck and offers a small hint. Camera or microphone access appears only inside a puzzle that needs it.',
    note: 'Permissions are optional.',
  },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const finishOnboarding = useHousewireStore((state) => state.finishOnboarding);
  const haptics = useHousewireStore((state) => state.settings.haptics);
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const [page, setPage] = useState(0);
  const current = PAGES[page];
  const finalPage = page === PAGES.length - 1;

  const finish = (practice: boolean) => {
    finishOnboarding();
    if (haptics) void Haptics.selectionAsync().catch(() => undefined);
    play(practice ? 'relay' : 'switch', 0.42);
    router.replace(practice ? '/tutorial' : '/modes');
  };

  const next = () => {
    if (finalPage) {
      finish(false);
      return;
    }
    if (haptics) void Haptics.selectionAsync().catch(() => undefined);
    play('switch', 0.25);
    setPage((value) => value + 1);
  };

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: NIGHT }]} />
      <View style={styles.topbar}>
        <Pressable accessibilityLabel="Close how it works" accessibilityRole="button" hitSlop={10} onPress={() => finish(false)} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Ionicons color={PAPER} name="close" size={23} />
        </Pressable>
        <Text style={[styles.brand, { fontFamily: theme.typography.families.displayHeavy }]}>HOW HOUSEWIRE WORKS</Text>
        <Text style={[styles.count, { fontFamily: theme.typography.families.bodyMedium }]}>{page + 1}/{PAGES.length}</Text>
      </View>

      <View style={styles.body}>
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(260)} key={`visual-${page}`} style={styles.visual}>
          {page === 0 ? <ModeVisual /> : page === 1 ? <PhoneVisual /> : <GuideVisual />}
        </Animated.View>

        <Animated.View entering={reducedMotion ? undefined : FadeInRight.duration(300)} key={`copy-${page}`} style={styles.copy}>
          <Text accessibilityRole="header" style={[styles.title, { fontFamily: theme.typography.families.storyBold }]}>{current.title}</Text>
          <Text style={[styles.description, { fontFamily: theme.typography.families.body }]}>{current.body}</Text>
          <View style={styles.note}>
            <Ionicons color={MINT} name="checkmark-circle" size={19} />
            <Text style={[styles.noteText, { fontFamily: theme.typography.families.bodyMedium }]}>{current.note}</Text>
          </View>
        </Animated.View>
      </View>

      <View style={styles.bottom}>
        <View accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`} style={styles.dots}>
          {PAGES.map((item, index) => <View key={item.title} style={[styles.dot, index === page && styles.dotActive]} />)}
        </View>
        {finalPage ? (
          <View style={styles.finalActions}>
            <Pressable accessibilityRole="button" onPress={() => finish(false)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={[styles.primaryText, { fontFamily: theme.typography.families.bodyMedium }]}>Choose a game</Text>
              <Ionicons color={INK} name="arrow-forward" size={21} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => finish(true)} style={({ pressed }) => [styles.practice, pressed && styles.pressed]}>
              <Ionicons color={SUN} name="sunny" size={18} />
              <Text style={[styles.practiceText, { fontFamily: theme.typography.families.bodyMedium }]}>Play the 2-minute tutorial</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={next} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text style={[styles.primaryText, { fontFamily: theme.typography.families.bodyMedium }]}>Next</Text>
            <Ionicons color={INK} name="arrow-forward" size={21} />
          </Pressable>
        )}
      </View>
    </ScreenShell>
  );
}

function ModeVisual() {
  return (
    <View {...decorativeAccessibilityProps} style={styles.modeVisual}>
      <View style={[styles.modeTile, { backgroundColor: CORAL, transform: [{ rotate: '-5deg' }] }]}><Ionicons color={INK} name="key" size={38} /></View>
      <View style={[styles.modeTile, styles.modeTileMiddle, { backgroundColor: SUN }]}><Ionicons color={INK} name="radio" size={38} /></View>
      <View style={[styles.modeTile, { backgroundColor: MINT, transform: [{ rotate: '5deg' }] }]}><Ionicons color={INK} name="flag" size={38} /></View>
    </View>
  );
}

function PhoneVisual() {
  return (
    <View {...decorativeAccessibilityProps} style={styles.phoneVisual}>
      <Svg height="225" viewBox="0 0 330 225" width="330">
        <Path d="M32 111 C84 40 117 177 164 112 S246 57 298 111" fill="none" stroke={CORAL} strokeLinecap="round" strokeWidth="7" />
        <Rect fill={PAPER} height="142" rx="22" stroke={SUN} strokeWidth="6" width="82" x="124" y="41" />
        <Rect fill={INK} height="71" rx="7" width="58" x="136" y="70" />
        <Rect fill={PAPER} height="21" width="21" x="143" y="77" /><Rect fill={PAPER} height="15" width="14" x="174" y="78" /><Rect fill={PAPER} height="13" width="20" x="142" y="113" /><Rect fill={PAPER} height="21" width="15" x="173" y="107" />
        <Circle cx="165" cy="162" fill={MINT} r="8" />
        <Rect fill={PAPER} height="96" rx="16" stroke={LILAC} strokeWidth="5" width="57" x="30" y="79" /><Circle cx="58" cy="144" fill={CORAL} r="8" />
        <Rect fill={PAPER} height="96" rx="16" stroke={MINT} strokeWidth="5" width="57" x="243" y="79" /><Circle cx="271" cy="144" fill={SUN} r="8" />
      </Svg>
    </View>
  );
}

function GuideVisual() {
  return (
    <View {...decorativeAccessibilityProps} style={styles.guideVisual}>
      <View style={styles.guideHouse}><Ionicons color={INK} name="home" size={72} /></View>
      <View style={[styles.permission, styles.permissionCamera]}><Ionicons color={INK} name="camera" size={27} /></View>
      <View style={[styles.permission, styles.permissionSound]}><Ionicons color={INK} name="volume-high" size={27} /></View>
      <View style={[styles.permission, styles.permissionMotion]}><Ionicons color={INK} name="phone-portrait" size={27} /></View>
      <View style={styles.guideBubble}><Ionicons color={INK} name="compass" size={28} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 22 }, bottom: { gap: 17, paddingBottom: 24, paddingHorizontal: 22 }, brand: { color: PAPER, fontSize: 18, letterSpacing: 0.6 }, close: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 13, height: 42, justifyContent: 'center', width: 42 }, copy: { gap: 12 }, count: { color: '#B9C2D0', fontSize: 13, width: 42, textAlign: 'right' }, description: { color: '#D5DCE8', fontSize: 17, lineHeight: 25 }, dot: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, height: 7, width: 7 }, dotActive: { backgroundColor: SUN, width: 28 }, dots: { flexDirection: 'row', gap: 7, justifyContent: 'center' }, finalActions: { gap: 10 }, guideBubble: { alignItems: 'center', backgroundColor: LILAC, borderRadius: 18, height: 56, justifyContent: 'center', position: 'absolute', right: 48, top: 18, transform: [{ rotate: '7deg' }], width: 56 }, guideHouse: { alignItems: 'center', backgroundColor: PAPER, borderRadius: 36, height: 150, justifyContent: 'center', width: 190 }, guideVisual: { alignItems: 'center', height: 255, justifyContent: 'center', width: 330 }, modeTile: { alignItems: 'center', borderRadius: 24, height: 112, justifyContent: 'center', width: 92 }, modeTileMiddle: { marginHorizontal: -4, marginTop: -25, transform: [{ rotate: '1deg' }] }, modeVisual: { alignItems: 'center', flexDirection: 'row', height: 250, justifyContent: 'center' }, note: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: 'rgba(110,216,199,0.12)', borderRadius: 999, flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingVertical: 9 }, noteText: { color: PAPER, fontSize: 13 }, permission: { alignItems: 'center', borderRadius: 16, height: 52, justifyContent: 'center', position: 'absolute', width: 52 }, permissionCamera: { backgroundColor: CORAL, left: 40, top: 36, transform: [{ rotate: '-8deg' }] }, permissionMotion: { backgroundColor: MINT, bottom: 22, right: 38, transform: [{ rotate: '8deg' }] }, permissionSound: { backgroundColor: SUN, bottom: 14, left: 56, transform: [{ rotate: '5deg' }] }, phoneVisual: { alignItems: 'center', height: 250, justifyContent: 'center' }, practice: { alignItems: 'center', borderColor: 'rgba(255,209,102,0.4)', borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 52 }, practiceText: { color: SUN, fontSize: 15 }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] }, primary: { alignItems: 'center', backgroundColor: SUN, borderRadius: 15, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 18 }, primaryText: { color: INK, fontSize: 17 }, title: { color: PAPER, fontSize: 41, lineHeight: 44 }, topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 10 }, visual: { alignItems: 'center', height: 270, justifyContent: 'center' },
});

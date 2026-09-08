import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { ScreenShell } from '@/src/components/ScreenShell';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';
import { decorativeAccessibilityProps } from '@/src/utils/accessibility';

type IoniconName = keyof typeof Ionicons.glyphMap;

const MODES = [
  {
    accent: '#F04A2E',
    eyebrow: 'STORY ESCAPE · 2–4 PHONES',
    icon: 'key-outline' as IoniconName,
    route: '/home',
    title: 'ESCAPE CASES',
    promise: 'Split clues across rooms. Talk your way out.',
  },
  {
    accent: '#F2C14E',
    eyebrow: 'NO-PREP TRIVIA · 2–4 PEOPLE',
    icon: 'radio-outline' as IoniconName,
    route: '/trivia-setup',
    title: 'FAMILY FREQUENCY',
    promise: 'Pick, order, tune and match signals only your family knows.',
  },
  {
    accent: '#64D8D1',
    eyebrow: 'TEAM RACE · 2 OR 4 PHONES',
    icon: 'stopwatch-outline' as IoniconName,
    route: '/race-setup',
    title: 'CIRCUIT RACE',
    promise: 'Two crews. Mirrored puzzles. One final breaker.',
  },
] as const;

export default function ModesScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const haptics = useHousewireStore((state) => state.settings.haptics);

  const open = (route: string) => {
    if (haptics) void Haptics.selectionAsync().catch(() => undefined);
    router.push(route as never);
  };

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" hitSlop={10} onPress={() => router.back()}>
            <Ionicons color={theme.colors.text} name="arrow-back" size={23} />
          </Pressable>
          <Text style={[styles.brand, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>HOUSEWIRE</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(480)} style={styles.hero}>
          <SwitchboardGlyph />
          <Text style={[styles.kicker, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>CHOOSE TONIGHT&apos;S CIRCUIT</Text>
          <Text style={[styles.heroTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>WHAT KIND OF NIGHT?</Text>
          <Text style={[styles.heroBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Each mode gets people looking up, comparing clues and doing something together.</Text>
        </Animated.View>

        <View style={styles.modeStack}>
          {MODES.map((mode, index) => (
            <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(90 * index).duration(420)} key={mode.title}>
              <Pressable
                accessibilityHint={mode.promise}
                accessibilityRole="button"
                onPress={() => open(mode.route)}
                style={({ pressed }) => [
                  styles.mode,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.draft },
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.modeRail, { backgroundColor: mode.accent }]} />
                <View style={[styles.modeIcon, { borderColor: mode.accent }]}>
                  <Ionicons color={mode.accent} name={mode.icon} size={25} />
                </View>
                <View style={styles.modeCopy}>
                  <Text style={[styles.modeEyebrow, { color: mode.accent, fontFamily: theme.typography.families.monoMedium }]}>{mode.eyebrow}</Text>
                  <Text style={[styles.modeTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{mode.title}</Text>
                  <Text style={[styles.modePromise, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{mode.promise}</Text>
                </View>
                <Ionicons color={mode.accent} name="arrow-forward" size={22} />
              </Pressable>
            </Animated.View>
          ))}
        </View>

        <View style={[styles.rule, { backgroundColor: theme.colors.draft }]} />
        <Text style={[styles.footer, { color: theme.colors.faint, fontFamily: theme.typography.families.mono }]}>NO ACCOUNTS · OFFLINE DEMOS · AI STAYS BEHIND THE SCENES</Text>
      </ScrollView>
    </ScreenShell>
  );
}

function SwitchboardGlyph() {
  return (
    <View {...decorativeAccessibilityProps} style={styles.glyph}>
      <Svg height="112" viewBox="0 0 260 112" width="260">
        <Path d="M15 86 C42 24 78 24 105 86 C130 132 161 16 190 61 C211 94 225 88 245 40" fill="none" stroke="#F04A2E" strokeLinecap="round" strokeWidth="4" />
        <Line stroke="#4D463B" strokeWidth="1" x1="15" x2="245" y1="87" y2="87" />
        <Circle cx="15" cy="86" fill="#070806" r="8" stroke="#F2C14E" strokeWidth="3" />
        <Circle cx="105" cy="86" fill="#070806" r="8" stroke="#64D8D1" strokeWidth="3" />
        <Circle cx="190" cy="61" fill="#070806" r="8" stroke="#F04A2E" strokeWidth="3" />
        <Circle cx="245" cy="40" fill="#F2C14E" r="6" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 23, letterSpacing: 0.8 },
  footer: { fontSize: 8, letterSpacing: 1.1, lineHeight: 14, paddingHorizontal: 20, textAlign: 'center' },
  glyph: { alignItems: 'center', height: 112, justifyContent: 'center', marginBottom: -4 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 },
  headerSpacer: { width: 23 },
  hero: { alignItems: 'center', paddingHorizontal: 28 },
  heroBody: { fontSize: 15, lineHeight: 21, maxWidth: 380, textAlign: 'center' },
  heroTitle: { fontSize: 46, letterSpacing: 0.2, lineHeight: 44, marginBottom: 8, textAlign: 'center' },
  kicker: { fontSize: 8, letterSpacing: 1.8, marginBottom: 7 },
  mode: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 118, overflow: 'hidden', paddingHorizontal: 15, paddingVertical: 14 },
  modeCopy: { flex: 1, gap: 2 },
  modeEyebrow: { fontSize: 7, letterSpacing: 1.15 },
  modeIcon: { alignItems: 'center', borderRadius: 28, borderWidth: 1, height: 54, justifyContent: 'center', width: 54 },
  modePromise: { fontSize: 12, lineHeight: 17 },
  modeRail: { bottom: 0, left: 0, position: 'absolute', top: 0, width: 4 },
  modeStack: { gap: 10, paddingHorizontal: 20 },
  modeTitle: { fontSize: 29, letterSpacing: 0.3, lineHeight: 29 },
  page: { flexGrow: 1, gap: 18, paddingBottom: 30 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.992 }] },
  rule: { height: 1, marginHorizontal: 52, marginTop: 2 },
});

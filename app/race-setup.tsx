import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { ScreenShell } from '@/src/components/ScreenShell';
import { createCircuitRaceContentSeed } from '@/src/features/race';
import { useCircuitRaceStore } from '@/src/store/use-circuit-race-store';
import { useHousewireStore, type CrewNode } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';
import { decorativeAccessibilityProps } from '@/src/utils/accessibility';

const EMBER = '#FF6846';
const MINT = '#5FE0D0';

export default function RaceSetupScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const setCrew = useHousewireStore((state) => state.setCrew);
  const setLocalNodeId = useHousewireStore((state) => state.setLocalNodeId);
  const safeRoom = useHousewireStore((state) => state.rooms.find((room) => room.safe));
  const haptics = useHousewireStore((state) => state.settings.haptics);
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const clearRace = useCircuitRaceStore((state) => state.clearRace);
  const raceHistory = useCircuitRaceStore((state) => state.history);
  const setLaunchMode = useCircuitRaceStore((state) => state.setLaunchMode);
  const setSeed = useCircuitRaceStore((state) => state.setSeed);

  const hostLive = () => {
    const host: CrewNode = {
      id: 'local',
      name: 'Host phone',
      initials: 'H',
      nodeNumber: 1,
      role: 'relay',
      roomId: safeRoom?.id ?? 'living',
      color: EMBER,
      connected: true,
      simulated: false,
    };
    if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    clearRace();
    setLaunchMode('live');
    setSeed(createCircuitRaceContentSeed());
    setCrew([host]);
    setLocalNodeId('local');
    prepareSession('lan');
    router.push('/race-lobby' as never);
  };

  const practice = () => {
    if (haptics) void Haptics.selectionAsync().catch(() => undefined);
    clearRace();
    setLaunchMode('practice');
    setSeed(createCircuitRaceContentSeed());
    setLocalNodeId('local');
    prepareSession('preview');
    router.push('/race-play' as never);
  };

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" hitSlop={10} onPress={() => router.back()}>
            <Ionicons color={theme.colors.text} name="arrow-back" size={23} />
          </Pressable>
          <Text style={[styles.brand, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>CIRCUIT RACE</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(480)} style={styles.hero}>
          <RaceScope />
          <Text style={[styles.kicker, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>BLACKLINE SUBSTATION · TWO MIRRORED ROUTES</Text>
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>OUTRUN THE OVERLOAD.</Text>
          <Text style={[styles.subtitle, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Two crews get the same escape track at the same second. First to the breaker wins.</Text>
        </Animated.View>

        <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(100).duration(420)} style={[styles.rules, { borderColor: theme.colors.draft }]}>
          <Rule accent={EMBER} icon="people-outline" label="Split" value="Race with 2 phones (1v1) or 4 phones (2v2)." />
          <View style={[styles.ruleDivider, { backgroundColor: theme.colors.draft }]} />
          <Rule accent={MINT} icon="git-compare-outline" label="Race" value="Solve identical riddles, rhythms, motion routes and gesture locks." />
          <View style={[styles.ruleDivider, { backgroundColor: theme.colors.draft }]} />
          <Rule accent="#F2C14E" icon="link-outline" label="Reunite" value="Teammates exchange private fragments to close their breaker." />
        </Animated.View>

        <View style={styles.actions}>
          <Pressable accessibilityHint="Creates a nearby race room and QR code" accessibilityRole="button" onPress={hostLive} style={({ pressed }) => [styles.liveButton, pressed && styles.pressed]}>
            <View style={[styles.liveHalf, { backgroundColor: EMBER }]} />
            <View style={[styles.liveHalf, { backgroundColor: MINT }]} />
            <View style={styles.liveCopy}>
              <Text style={[styles.actionOverline, { fontFamily: theme.typography.families.monoMedium }]}>SAME WI-FI OR PHONE HOTSPOT</Text>
              <Text style={[styles.liveTitle, { fontFamily: theme.typography.families.displayHeavy }]}>HOST LIVE RACE</Text>
            </View>
            <Ionicons color="#08100F" name="arrow-forward-circle" size={29} />
          </Pressable>

          <View style={styles.secondaryRow}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/race-join')} style={({ pressed }) => [styles.secondary, { borderColor: MINT }, pressed && styles.pressed]}>
              <Ionicons color={MINT} name="scan-outline" size={21} />
              <Text style={[styles.secondaryText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Join crew</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={practice} style={({ pressed }) => [styles.secondary, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
              <Ionicons color={theme.colors.text} name="phone-portrait-outline" size={21} />
              <Text style={[styles.secondaryText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Try vs ghost</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.fairBand, { borderColor: theme.colors.draft }]}> 
          <View style={[styles.fairLamp, { backgroundColor: MINT }]} />
          <Text style={[styles.fairText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>The host clock starts every phone together. AI Guide pauses the phone that opens a hint.</Text>
        </View>

        {raceHistory[0] ? (
          <View style={styles.recentRun}>
            <Text style={[styles.recentLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>LAST CIRCUIT · {raceHistory[0].mode.toUpperCase()}</Text>
            <Text style={[styles.recentValue, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{raceHistory[0].winningTeamIds.length === 1 ? `${raceHistory[0].winningTeamIds[0].toUpperCase()} WON` : 'PHOTO FINISH'}</Text>
            <Text style={[styles.recentTime, { color: MINT, fontFamily: theme.typography.families.monoMedium }]}>{formatRaceTime(Math.min(...raceHistory[0].standings.map((standing) => standing.elapsedMs ?? Number.MAX_SAFE_INTEGER)))}</Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

function Rule({ accent, icon, label, value }: { accent: string; icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.rule}>
      <View style={[styles.ruleIcon, { borderColor: accent }]}><Ionicons color={accent} name={icon} size={19} /></View>
      <View style={styles.ruleCopy}>
        <Text style={[styles.ruleLabel, { color: accent, fontFamily: theme.typography.families.monoMedium }]}>{label.toUpperCase()}</Text>
        <Text style={[styles.ruleValue, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{value}</Text>
      </View>
    </View>
  );
}

function RaceScope() {
  return (
    <View {...decorativeAccessibilityProps} style={styles.scope}>
      <Svg height="160" viewBox="0 0 320 160" width="320">
        <Circle cx="160" cy="80" fill="none" r="67" stroke="#39352D" strokeWidth="1" />
        <Circle cx="160" cy="80" fill="none" r="51" stroke="#39352D" strokeDasharray="3 6" strokeWidth="1" />
        <Line stroke="#39352D" x1="14" x2="306" y1="80" y2="80" />
        <Path d="M16 91 L53 91 L66 41 L80 121 L96 63 L110 91 L146 91" fill="none" stroke={EMBER} strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
        <Path d="M174 69 L207 69 L221 113 L235 38 L249 96 L264 69 L304 69" fill="none" stroke={MINT} strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
        <Circle cx="160" cy="80" fill="#090A08" r="19" stroke="#F2C14E" strokeWidth="4" />
        <Circle cx="160" cy="80" fill="#F2C14E" r="5" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  actionOverline: { color: '#23413C', fontSize: 7, letterSpacing: 1.1 },
  actions: { gap: 10, paddingHorizontal: 20 },
  brand: { fontSize: 21, letterSpacing: 0.8 },
  fairBand: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: 10, marginHorizontal: 20, paddingVertical: 13 },
  fairLamp: { borderRadius: 5, height: 9, width: 9 },
  fairText: { flex: 1, fontSize: 12, lineHeight: 17 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 },
  headerSpacer: { width: 23 },
  hero: { alignItems: 'center', paddingHorizontal: 24 },
  kicker: { fontSize: 7, letterSpacing: 1.45 },
  liveButton: { alignItems: 'center', flexDirection: 'row', minHeight: 80, overflow: 'hidden', paddingHorizontal: 17 },
  liveCopy: { flex: 1, gap: 2, zIndex: 2 },
  liveHalf: { bottom: 0, position: 'absolute', top: 0, width: '50%' },
  liveTitle: { color: '#08100F', fontSize: 24, letterSpacing: 0.5, lineHeight: 25 },
  page: { flexGrow: 1, gap: 20, paddingBottom: 38 },
  pressed: { opacity: 0.73, transform: [{ scale: 0.993 }] },
  rule: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  ruleCopy: { flex: 1, gap: 2 },
  ruleDivider: { height: 1, marginLeft: 48 },
  ruleIcon: { alignItems: 'center', borderRadius: 20, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  ruleLabel: { fontSize: 7, letterSpacing: 1.2 },
  ruleValue: { fontSize: 13, lineHeight: 18 },
  rules: { borderBottomWidth: 1, borderTopWidth: 1, gap: 12, marginHorizontal: 20, paddingVertical: 15 },
  recentLabel: { fontSize: 9, letterSpacing: 1.2 },
  recentRun: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'center', paddingHorizontal: 20 },
  recentTime: { fontSize: 10, letterSpacing: 0.7 },
  recentValue: { fontSize: 18, letterSpacing: 0.3 },
  scope: { height: 154 },
  secondary: { alignItems: 'center', borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 58 },
  secondaryRow: { flexDirection: 'row', gap: 9 },
  secondaryText: { fontSize: 14 },
  subtitle: { fontSize: 15, lineHeight: 21, marginTop: 7, maxWidth: 360, textAlign: 'center' },
  title: { fontSize: 48, letterSpacing: 0.2, lineHeight: 46, marginTop: 7, textAlign: 'center' },
});

function formatRaceTime(ms: number): string {
  if (!Number.isFinite(ms)) return '--:--';
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

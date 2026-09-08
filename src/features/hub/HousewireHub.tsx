import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { ScreenShell } from '@/src/components/ScreenShell';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useCircuitRaceStore } from '@/src/store/use-circuit-race-store';
import { useFamilyFrequencyStore } from '@/src/store/use-family-frequency-store';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';
import { decorativeAccessibilityProps } from '@/src/utils/accessibility';

type Route = '/home' | '/join' | '/onboarding' | '/race-join' | '/race-play' | '/race-setup' | '/settings' | '/trivia-play' | '/trivia-results' | '/trivia-setup' | '/tutorial' | '/mission';
type GameKind = 'escape' | 'frequency' | 'race';

const NIGHT = '#15223A';
const PAPER = '#FFF6E5';
const INK = '#182033';
const CORAL = '#FF7657';
const SUN = '#FFD166';
const MINT = '#6ED8C7';
const LILAC = '#B9A7F8';

interface GameDefinition {
  kind: GameKind;
  color: string;
  shadow: string;
  title: string;
  description: string;
  meta: readonly string[];
  action: string;
  route: Route;
  joinRoute?: Route;
}

const GAMES: readonly GameDefinition[] = [
  {
    kind: 'escape', color: CORAL, shadow: '#9C3F35', title: 'Escape Cases',
    description: 'Split into rooms, combine private clues, and escape one story together.',
    meta: ['2–4 people', '20–35 min', 'phones become props'], action: 'Pick a story', route: '/home', joinRoute: '/join',
  },
  {
    kind: 'frequency', color: SUN, shadow: '#9A7122', title: 'Family Frequency',
    description: 'Predict the little things only your family would know—then let them make the final call.',
    meta: ['2–4 people', '8–20 min', 'one phone works'], action: 'Play together', route: '/trivia-setup',
  },
  {
    kind: 'race', color: MINT, shadow: '#327C77', title: 'Circuit Race',
    description: 'Two sides race through the same riddles, sounds, movement, and final team lock.',
    meta: ['2 or 4 people', '10–18 min', 'live or practice'], action: 'Set up a race', route: '/race-setup', joinRoute: '/race-join',
  },
] as const;

export function HousewireHub() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const haptics = useHousewireStore((state) => state.settings.haptics);
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const missionStartedAt = useHousewireStore((state) => state.missionStartedAt);
  const missionInProgressId = useHousewireStore((state) => state.missionInProgressId);
  const triviaSession = useFamilyFrequencyStore((state) => state.session);
  const raceState = useCircuitRaceStore((state) => state.raceState);

  const open = (route: Route, sound: 'relay' | 'switch' = 'switch') => {
    if (haptics) void Haptics.selectionAsync().catch(() => undefined);
    play(sound, sound === 'relay' ? 0.5 : 0.3);
    router.push(route as never);
  };

  const resumeItems: { color: string; detail: string; label: string; route: Route }[] = [];
  if (missionStartedAt && missionInProgressId) {
    resumeItems.push({ color: CORAL, detail: 'Escape case in progress', label: 'Continue your case', route: '/mission' });
  }
  if (triviaSession) {
    resumeItems.push({
      color: SUN,
      detail: triviaSession.phase === 'complete' ? 'Final scores are ready' : `Round ${triviaSession.questionIndex + 1} of ${triviaSession.pack.questions.length}`,
      label: triviaSession.phase === 'complete' ? 'See Family Frequency results' : 'Continue Family Frequency',
      route: triviaSession.phase === 'complete' ? '/trivia-results' : '/trivia-play',
    });
  }
  if (raceState && raceState.teams.some((team) => team.finishedAt === undefined)) {
    resumeItems.push({ color: MINT, detail: 'Race in progress', label: 'Continue Circuit Race', route: '/race-play' });
  }

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: NIGHT }]} />
      <View {...decorativeAccessibilityProps} style={[styles.ambientBlob, styles.ambientCoral]} />
      <View {...decorativeAccessibilityProps} style={[styles.ambientBlob, styles.ambientMint]} />
      <ScrollView contentContainerStyle={styles.page} overScrollMode="never" showsVerticalScrollIndicator={false}>
        <View style={styles.topbar}>
          <View style={styles.wordmarkRow}>
            <View style={styles.houseMark}><Ionicons color={INK} name="home" size={18} /></View>
            <Text style={[styles.wordmark, { fontFamily: theme.typography.families.displayHeavy }]}>HOUSEWIRE</Text>
          </View>
          <View style={styles.topActions}>
            <RoundIcon accessibilityLabel="How to play" icon="help" onPress={() => open('/onboarding')} />
            <RoundIcon accessibilityLabel="Settings" icon="settings-sharp" onPress={() => open('/settings')} />
          </View>
        </View>

        <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(420)} style={styles.hero}>
          <View style={styles.heroCopy}>
            <View style={styles.tonightPill}><View style={styles.tonightDot} /><Text style={[styles.tonightText, { fontFamily: theme.typography.families.bodyMedium }]}>Made for the people in this room</Text></View>
            <Text accessibilityRole="header" style={[styles.heroTitle, { fontFamily: theme.typography.families.storyBold }]}>What should we play?</Text>
            <Text style={[styles.heroBody, { fontFamily: theme.typography.families.body }]}>Pick a game. We&apos;ll explain the rest when it matters.</Text>
          </View>
          <HousePartyMark />
        </Animated.View>

        {resumeItems.length ? (
          <View style={styles.resumeSection}>
            <Text style={[styles.sectionLabel, { fontFamily: theme.typography.families.bodyMedium }]}>Jump back in</Text>
            {resumeItems.map((item) => (
              <Pressable accessibilityRole="button" key={item.label} onPress={() => open(item.route, 'relay')} style={({ pressed }) => [styles.resume, pressed && styles.pressed]}>
                <View style={[styles.resumeIcon, { backgroundColor: item.color }]}><Ionicons color={INK} name="play" size={18} /></View>
                <View style={styles.resumeCopy}>
                  <Text style={[styles.resumeLabel, { fontFamily: theme.typography.families.bodyMedium }]}>{item.label}</Text>
                  <Text style={[styles.resumeDetail, { fontFamily: theme.typography.families.body }]}>{item.detail}</Text>
                </View>
                <Ionicons color={PAPER} name="arrow-forward" size={19} />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.gameSection}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, { fontFamily: theme.typography.families.storyBold }]}>Choose your game</Text>
            <Pressable accessibilityRole="button" onPress={() => open('/tutorial')} style={({ pressed }) => [styles.practiceLink, pressed && styles.pressed]}>
              <Ionicons color={SUN} name="sunny" size={16} />
              <Text style={[styles.practiceText, { fontFamily: theme.typography.families.bodyMedium }]}>2-min practice</Text>
            </Pressable>
          </View>
          {GAMES.map((game, index) => (
            <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(index * 90).duration(430)} key={game.kind}>
              <GameCard game={game} onJoin={game.joinRoute ? () => open(game.joinRoute!, 'relay') : undefined} onOpen={() => open(game.route, 'relay')} />
            </Animated.View>
          ))}
        </View>

        <View style={styles.reassurance}>
          <Ionicons color={MINT} name="shield-checkmark" size={19} />
          <Text style={[styles.reassuranceText, { fontFamily: theme.typography.families.body }]}>No accounts. One phone is enough to try every game. AI quietly creates variety and hints—not conversation.</Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function GameCard({ game, onJoin, onOpen }: { game: GameDefinition; onJoin?: () => void; onOpen: () => void }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={[styles.gameCardShadow, { backgroundColor: game.shadow }]}>
      <View style={[styles.gameCard, { backgroundColor: game.color }]}>
        <View style={styles.gameTopline}>
          <GameMark kind={game.kind} />
          <View style={styles.metaWrap}>
            {game.meta.slice(0, 2).map((item) => <View key={item} style={styles.metaPill}><Text style={[styles.metaText, { fontFamily: theme.typography.families.bodyMedium }]}>{item}</Text></View>)}
          </View>
        </View>
        <Text style={[styles.gameTitle, { fontFamily: theme.typography.families.displayHeavy }]}>{game.title}</Text>
        <Text style={[styles.gameDescription, { fontFamily: theme.typography.families.body }]}>{game.description}</Text>
        <View style={styles.gameActions}>
          <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.playButton, pressed && styles.buttonPressed]}>
            <Text style={[styles.playButtonText, { fontFamily: theme.typography.families.bodyMedium }]}>{game.action}</Text><Ionicons color={PAPER} name="arrow-forward" size={20} />
          </Pressable>
          {onJoin ? (
            <Pressable accessibilityRole="button" onPress={onJoin} style={({ pressed }) => [styles.joinButton, pressed && styles.buttonPressed]}>
              <Ionicons color={INK} name="scan" size={19} /><Text style={[styles.joinButtonText, { fontFamily: theme.typography.families.bodyMedium }]}>Join</Text>
            </Pressable>
          ) : (
            <View style={styles.onePhonePill}><Ionicons color={INK} name="phone-portrait-outline" size={16} /><Text style={[styles.onePhoneText, { fontFamily: theme.typography.families.bodyMedium }]}>{game.meta[2]}</Text></View>
          )}
        </View>
      </View>
    </View>
  );
}

function GameMark({ kind }: { kind: GameKind }) {
  return (
    <View {...decorativeAccessibilityProps} style={styles.gameMark}>
      {kind === 'escape' ? <Ionicons color={INK} name="key" size={30} /> : null}
      {kind === 'frequency' ? <Svg height="38" viewBox="0 0 48 38" width="48"><Path d="M2 21 C8 4 14 4 20 21 S32 38 38 21 S44 4 47 15" fill="none" stroke={INK} strokeLinecap="round" strokeWidth="4" /><Circle cx="24" cy="21" fill={INK} r="5" /></Svg> : null}
      {kind === 'race' ? <Svg height="40" viewBox="0 0 48 40" width="48"><Path d="M4 8 H23 C35 8 35 32 44 32" fill="none" stroke={INK} strokeLinecap="round" strokeWidth="4" /><Path d="M4 32 H23 C35 32 35 8 44 8" fill="none" stroke={INK} strokeLinecap="round" strokeWidth="4" /><Circle cx="4" cy="8" fill={INK} r="4" /><Circle cx="4" cy="32" fill={INK} r="4" /></Svg> : null}
    </View>
  );
}

function HousePartyMark() {
  return (
    <View {...decorativeAccessibilityProps} style={styles.heroMark}>
      <Svg height="124" viewBox="0 0 150 124" width="150">
        <Path d="M14 55 L75 10 L136 55" fill={CORAL} stroke={PAPER} strokeLinejoin="round" strokeWidth="5" />
        <Rect fill={PAPER} height="65" rx="8" width="112" x="19" y="50" />
        <Line stroke={INK} strokeOpacity="0.16" strokeWidth="2" x1="75" x2="75" y1="53" y2="112" />
        <Path d="M34 80 C53 60 61 101 79 79 S106 65 119 82" fill="none" stroke={CORAL} strokeLinecap="round" strokeWidth="6" />
        <Circle cx="36" cy="80" fill={SUN} r="8" /><Circle cx="78" cy="80" fill={MINT} r="8" /><Circle cx="118" cy="82" fill={LILAC} r="8" />
        <Circle cx="36" cy="80" fill={INK} r="3" /><Circle cx="78" cy="80" fill={INK} r="3" /><Circle cx="118" cy="82" fill={INK} r="3" />
      </Svg>
    </View>
  );
}

function RoundIcon({ accessibilityLabel, icon, onPress }: { accessibilityLabel: string; icon: keyof typeof Ionicons.glyphMap; onPress(): void }) {
  return <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.roundIcon, pressed && styles.pressed]}><Ionicons color={PAPER} name={icon} size={20} /></Pressable>;
}

const styles = StyleSheet.create({
  ambientBlob: { borderRadius: 999, opacity: 0.11, position: 'absolute' }, ambientCoral: { backgroundColor: CORAL, height: 260, right: -130, top: 70, width: 260 }, ambientMint: { backgroundColor: MINT, bottom: 120, height: 230, left: -150, width: 230 },
  buttonPressed: { opacity: 0.84, transform: [{ translateY: 1 }] }, gameActions: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 5 }, gameCard: { borderRadius: 24, gap: 10, minHeight: 236, padding: 18, transform: [{ translateY: -5 }] }, gameCardShadow: { borderRadius: 24, marginBottom: 4 }, gameDescription: { color: INK, fontSize: 16, lineHeight: 22, maxWidth: 480 }, gameMark: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.48)', borderRadius: 18, height: 62, justifyContent: 'center', width: 68 }, gameSection: { gap: 16 }, gameTitle: { color: INK, fontSize: 38, letterSpacing: 0.1, lineHeight: 39 }, gameTopline: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  hero: { alignItems: 'center', flexDirection: 'row', minHeight: 156 }, heroBody: { color: '#D9DEEB', fontSize: 16, lineHeight: 22, maxWidth: 310 }, heroCopy: { flex: 1, gap: 7 }, heroMark: { alignItems: 'center', height: 124, justifyContent: 'center', marginRight: -14, width: 140 }, heroTitle: { color: PAPER, fontSize: 42, lineHeight: 43 }, houseMark: { alignItems: 'center', backgroundColor: SUN, borderRadius: 12, height: 36, justifyContent: 'center', transform: [{ rotate: '-3deg' }], width: 36 },
  joinButton: { alignItems: 'center', borderColor: 'rgba(24,32,51,0.28)', borderRadius: 14, borderWidth: 2, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 52, paddingHorizontal: 16 }, joinButtonText: { color: INK, fontSize: 15 }, metaPill: { backgroundColor: 'rgba(255,255,255,0.45)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }, metaText: { color: INK, fontSize: 11 }, metaWrap: { alignItems: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: 210 }, onePhonePill: { alignItems: 'center', flexDirection: 'row', gap: 5, paddingHorizontal: 6 }, onePhoneText: { color: INK, fontSize: 12 },
  page: { gap: 26, paddingBottom: 44, paddingHorizontal: 18, paddingTop: 10 }, playButton: { alignItems: 'center', backgroundColor: INK, borderRadius: 14, flex: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, paddingHorizontal: 16 }, playButtonText: { color: PAPER, fontSize: 17 }, practiceLink: { alignItems: 'center', backgroundColor: 'rgba(255,209,102,0.12)', borderRadius: 999, flexDirection: 'row', gap: 6, minHeight: 38, paddingHorizontal: 12 }, practiceText: { color: SUN, fontSize: 13 }, pressed: { opacity: 0.74, transform: [{ scale: 0.98 }] }, reassurance: { alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, flexDirection: 'row', gap: 10, padding: 14 }, reassuranceText: { color: '#C8CFDC', flex: 1, fontSize: 13, lineHeight: 19 },
  resume: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.14)', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 66, padding: 10 }, resumeCopy: { flex: 1, gap: 2 }, resumeDetail: { color: '#B6BECC', fontSize: 12 }, resumeIcon: { alignItems: 'center', borderRadius: 12, height: 44, justifyContent: 'center', width: 44 }, resumeLabel: { color: PAPER, fontSize: 15 }, resumeSection: { gap: 9 }, roundIcon: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)', borderRadius: 14, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 }, sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, sectionLabel: { color: '#C4CBD7', fontSize: 13 }, sectionTitle: { color: PAPER, fontSize: 27 },
  tonightDot: { backgroundColor: MINT, borderRadius: 5, height: 8, width: 8 }, tonightPill: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 7 }, tonightText: { color: '#BAC4D2', fontSize: 11 }, topActions: { flexDirection: 'row', gap: 8 }, topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, wordmark: { color: PAPER, fontSize: 25, letterSpacing: 0.7 }, wordmarkRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
});

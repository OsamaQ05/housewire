import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { ScreenShell } from '@/src/components/ScreenShell';
import { compareFamilyTriviaTeamRates, familyTriviaTeamRateBasisPoints } from '@/src/domain/family-trivia';
import { useFamilyFrequencyStore } from '@/src/store/use-family-frequency-store';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';
import { decorativeAccessibilityProps } from '@/src/utils/accessibility';

const GOLD = '#FFD166';
const CYAN = '#6ED8C7';
const CORAL = '#FF7657';

export default function TriviaResultsScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const hydrated = useFamilyFrequencyStore((state) => state.hydrated);
  const session = useFamilyFrequencyStore((state) => state.session);
  const source = useFamilyFrequencyStore((state) => state.source);
  const history = useFamilyFrequencyStore((state) => state.history);
  const clearGame = useFamilyFrequencyStore((state) => state.clearGame);
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const haptics = useHousewireStore((state) => state.settings.haptics);

  const board = useMemo(() => {
    if (!session) return [];
    if (session.setup.teams.length) {
      return session.teamScores.map((score, index) => ({
        color: index === 0 ? CORAL : CYAN,
        exact: score.exactMatches,
        id: score.teamId,
        label: session.setup.teams.find((team) => team.id === score.teamId)?.name ?? score.teamId,
        opportunities: score.opportunities,
        points: familyTriviaTeamRateBasisPoints(score),
      }));
    }
    return session.playerScores.map((score, index) => ({
      color: [GOLD, CYAN, CORAL, '#B8A5F2'][index] ?? GOLD,
      exact: score.exactMatches,
      id: score.playerId,
      label: session.setup.players.find((player) => player.id === score.playerId)?.name ?? score.playerId,
      opportunities: undefined,
      points: score.points,
    }));
  }, [session]);

  const teamMode = session?.setup.teams.length !== 0;
  const sorted = [...board].sort((left, right) => teamMode
    ? compareFamilyTriviaTeamRates(
        { exactMatches: right.exact, opportunities: right.opportunities ?? 0 },
        { exactMatches: left.exact, opportunities: left.opportunities ?? 0 },
      )
    : right.points - left.points || right.exact - left.exact);
  const leader = sorted[0];
  const winners = sorted.filter((entry) => teamMode
    ? Boolean(leader && compareFamilyTriviaTeamRates(
        { exactMatches: entry.exact, opportunities: entry.opportunities ?? 0 },
        { exactMatches: leader.exact, opportunities: leader.opportunities ?? 0 },
      ) === 0)
    : entry.points === leader?.points && entry.exact === leader.exact);
  const exactTotal = session?.results.flatMap((result) => result.playerPoints).filter((result) => result.exact).length ?? 0;

  if (!hydrated) {
    return (
      <ScreenShell texture={false}>
        <View style={styles.missing}>
          <Ionicons color={CYAN} name="radio-outline" size={38} />
          <Text style={[styles.missingText, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>Getting the scores</Text>
        </View>
      </ScreenShell>
    );
  }

  if (!session || session.phase !== 'complete') {
    const canResume = Boolean(session);
    return (
      <ScreenShell texture={false}>
        <View style={styles.missing}>
          <Text style={[styles.missingText, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{canResume ? 'The game is still going' : 'No scores yet'}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace(canResume ? '/trivia-play' : '/trivia-setup')} style={[styles.outlineButton, { borderColor: GOLD }]}>
            <Text style={[styles.outlineText, { color: GOLD, fontFamily: theme.typography.families.bodyMedium }]}>{canResume ? 'Return to the current round' : 'Start Family Frequency'}</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  const replay = () => {
    clearGame();
    if (haptics) void Haptics.selectionAsync().catch(() => undefined);
    router.replace('/trivia-setup');
  };

  const leaveResults = () => {
    clearGame();
    router.replace('/modes');
  };

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(480)} style={styles.hero}>
          <ResultDial accent={winners[0]?.color ?? GOLD} />
          <Text style={[styles.kicker, { color: GOLD, fontFamily: theme.typography.families.bodyMedium }]}>That is the final signal</Text>
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{winners.length > 1 ? 'Same wavelength' : `${winners[0]?.label} takes it`}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.muted, fontFamily: theme.typography.families.story }]}>{exactTotal} exact {exactTotal === 1 ? 'match' : 'matches'} landed across {session.results.length} rounds.</Text>
        </Animated.View>

        <View style={styles.board}>
          {sorted.map((entry, index) => (
            <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(90 * index).duration(400)} key={entry.id} style={[styles.boardRow, { backgroundColor: theme.colors.surface, borderColor: index === 0 ? entry.color : theme.colors.draft }]}>
              <Text style={[styles.rank, { color: entry.color, fontFamily: theme.typography.families.displayHeavy }]}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={styles.boardCopy}>
                <Text style={[styles.boardName, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{entry.label}</Text>
                <Text style={[styles.boardMeta, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>{entry.opportunities === undefined ? `${entry.exact} exact` : `${entry.exact} of ${entry.opportunities} exact`}</Text>
              </View>
              <Text style={[styles.points, { color: entry.color, fontFamily: theme.typography.families.displayHeavy }]}>{entry.opportunities === undefined ? entry.points : formatTeamRate(entry.points)}</Text>
            </Animated.View>
          ))}
        </View>

        <View style={[styles.kept, { borderColor: theme.colors.draft }]}>
          <Ionicons color={source === 'ai' ? CYAN : GOLD} name="checkmark-circle-outline" size={22} />
          <View style={styles.keptCopy}>
            <Text style={[styles.keptTitle, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Tonight&apos;s answers stayed private</Text>
            <Text style={[styles.keptMeta, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>{source === 'ai' ? 'Fresh AI question mix' : 'Offline question mix'} · saved with {history.length} recent {history.length === 1 ? 'game' : 'games'}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={replay} style={({ pressed }) => [styles.primary, { backgroundColor: GOLD }, pressed && styles.pressed]}>
            <Ionicons color="#171309" name="refresh" size={21} />
            <Text style={[styles.primaryText, { fontFamily: theme.typography.families.displayHeavy }]}>Play a fresh mix</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={leaveResults} style={({ pressed }) => [styles.outlineButton, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
            <Text style={[styles.outlineText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Back to house modes</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function ResultDial({ accent }: { accent: string }) {
  return (
    <View {...decorativeAccessibilityProps} style={styles.dial}>
      <Svg height="152" viewBox="0 0 260 152" width="260">
        <Circle cx="130" cy="77" fill="none" r="57" stroke="#3B352B" strokeWidth="1" />
        <Circle cx="130" cy="77" fill="none" r="43" stroke={accent} strokeDasharray="7 7" strokeWidth="5" />
        <Path d="M58 76 C78 34 95 119 118 77 C141 31 160 118 203 76" fill="none" stroke={GOLD} strokeLinecap="round" strokeWidth="4" />
        <Line stroke={accent} strokeWidth="4" x1="130" x2="174" y1="77" y2="43" />
        <Circle cx="130" cy="77" fill={accent} r="9" />
      </Svg>
    </View>
  );
}

function formatTeamRate(points: number): string {
  const percent = points / 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
}

const styles = StyleSheet.create({
  actions: { gap: 9, paddingHorizontal: 20 },
  board: { gap: 8, paddingHorizontal: 20 },
  boardCopy: { flex: 1, gap: 2 },
  boardMeta: { fontSize: 12, lineHeight: 16 },
  boardName: { fontSize: 17 },
  boardRow: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 72, paddingHorizontal: 13 },
  dial: { height: 142 },
  hero: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 10 },
  kept: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 11, marginHorizontal: 20, paddingHorizontal: 13, paddingVertical: 14 },
  keptCopy: { flex: 1, gap: 3 },
  keptMeta: { fontSize: 11, lineHeight: 15 },
  keptTitle: { fontSize: 14 },
  kicker: { fontSize: 13, lineHeight: 18 },
  missing: { alignItems: 'center', flex: 1, gap: 16, justifyContent: 'center' },
  missingText: { fontSize: 34 },
  outlineButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, justifyContent: 'center', minHeight: 55, paddingHorizontal: 18 },
  outlineText: { fontSize: 15 },
  page: { flexGrow: 1, gap: 20, paddingBottom: 38 },
  points: { fontSize: 37, lineHeight: 38 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.993 }] },
  primary: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 64 },
  primaryText: { color: '#171309', fontSize: 20 },
  rank: { fontSize: 28, width: 32 },
  subtitle: { fontSize: 21, lineHeight: 25, maxWidth: 340, textAlign: 'center' },
  title: { fontSize: 43, lineHeight: 44, marginVertical: 7, textAlign: 'center' },
});

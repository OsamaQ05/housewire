import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { ScreenShell } from '@/src/components/ScreenShell';
import { FrequencyAvatar } from '@/src/features/trivia/FrequencyAvatar';
import { FrequencyCheer } from '@/src/features/trivia/FrequencyCheer';
import { FREQUENCY_COLORS as C, FrequencyMark } from '@/src/features/trivia/FrequencyIdentity';
import { buildFrequencyScoreboard } from '@/src/features/trivia/frequency-scoreboard';
import { useFamilyFrequencyStore } from '@/src/store/use-family-frequency-store';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

export default function TriviaResultsScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const fonts = theme.typography.families;
  const hydrated = useFamilyFrequencyStore((state) => state.hydrated);
  const session = useFamilyFrequencyStore((state) => state.session);
  const source = useFamilyFrequencyStore((state) => state.source);
  const history = useFamilyFrequencyStore((state) => state.history);
  const clearGame = useFamilyFrequencyStore((state) => state.clearGame);
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const haptics = useHousewireStore((state) => state.settings.haptics);
  const scoreboard = useMemo(() => session ? buildFrequencyScoreboard(session) : undefined, [session]);
  const winners = scoreboard?.entries.filter((entry) => entry.rank === 1) ?? [];

  if (!hydrated || !session || session.phase !== 'complete' || !scoreboard) {
    const canResume = Boolean(session);
    return <ScreenShell texture={false} manageStatusBar={false} style={styles.shell}><StatusBar style="dark" /><View style={styles.missing}><FrequencyMark size={120} /><Text style={[styles.missingText, { fontFamily: fonts.displayHeavy }]}>{!hydrated ? 'Finding your scores…' : canResume ? 'There’s more game to play' : 'Your next game starts here'}</Text>{hydrated ? <Pressable accessibilityRole="button" onPress={() => router.replace(canResume ? '/trivia-play' : '/trivia-setup')} style={styles.primary}><Text style={[styles.primaryText, { fontFamily: fonts.displayHeavy }]}>{canResume ? 'Back to your round' : 'Let’s play'}</Text></Pressable> : null}</View></ScreenShell>;
  }

  const replay = () => {
    clearGame();
    if (haptics) void Haptics.selectionAsync().catch(() => undefined);
    router.replace('/trivia-setup');
  };
  const leave = () => {
    clearGame();
    router.replace('/modes');
  };
  const playedRounds = session.results.filter((result) => !result.skipped).length;
  const skippedRounds = session.results.length - playedRounds;
  const groupReads = session.results.flatMap((result) => result.playerPoints);
  const sharedRoundCount = session.results.filter((result) => result.playerPoints.length > 0 && result.playerPoints.every((guess) => guess.exact)).length;
  const entryPlayers = (entryId: string) => {
    const playerIds = scoreboard.teamMode ? session.setup.teams.find((team) => team.id === entryId)?.memberPlayerIds ?? [] : [entryId];
    return session.setup.players.filter((player) => playerIds.includes(player.id));
  };
  const highlights = session.setup.players.map((player) => {
    const guesses = groupReads.filter((guess) => guess.playerId === player.id);
    const exact = guesses.filter((guess) => guess.exact).length;
    const close = guesses.filter((guess) => !guess.exact && guess.points > 0).length;
    const bestRound = Math.max(0, ...guesses.map((guess) => guess.points));
    const understood = session.results.reduce((count, result) => {
      const question = session.pack.questions.find((candidate) => candidate.id === result.questionId);
      return question?.authorityPlayerId === player.id ? count + result.playerPoints.filter((guess) => guess.exact).length : count;
    }, 0);
    let detail = exact > 0 ? exact + (exact === 1 ? ' exact read' : ' exact reads') : close > 0 ? close + (close === 1 ? ' close read' : ' close reads') : 'A few new things learned';
    if (bestRound > 0) detail += ' · best guess +' + bestRound;
    const subtitle = understood > 0 ? 'Your people read you ' + understood + (understood === 1 ? ' time' : ' times') : guesses.length + (guesses.length === 1 ? ' guess made' : ' guesses made');
    return { id: player.id, name: player.name, detail, subtitle };
  });

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false} manageStatusBar={false} style={styles.shell}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.header}><Text style={[styles.brand, { fontFamily: fonts.displayHeavy }]}>FAMILY FREQUENCY</Text><View style={styles.endTag}><Text style={[styles.endTagText, { fontFamily: fonts.bodyMedium }]}>That’s a wrap</Text></View></View>
        <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(440)} style={styles.hero}>
          <FrequencyMark size={118} />
          <Text style={[styles.kicker, { fontFamily: fonts.bodyMedium }]}>{winners.length > 1 ? 'SHARED FIRST. SHARED SPOTLIGHT.' : winners.length === 1 ? 'TONIGHT’S SPOTLIGHT' : 'YOUR PEOPLE. A FRESH PERSPECTIVE.'}</Text>
          <Text style={[styles.title, { fontFamily: fonts.displayHeavy }]}>{winners.length > 1 ? 'A shared spotlight!' : winners.length === 1 ? 'Take a bow!' : 'Same people.\nNew discoveries.'}</Text>
          <Text style={[styles.subtitle, { fontFamily: fonts.body }]}>{scoreboard.totalExact > 0 ? scoreboard.totalExact + (scoreboard.totalExact === 1 ? ' exact match. ' : ' exact matches. ') + 'That’s your kind of connection.' : 'Some surprises are worth more than points.'}</Text>
        </Animated.View>

        {winners.length ? <View style={styles.podium}>{winners.map((winner, index) => (
          <Animated.View key={winner.id} entering={reducedMotion ? undefined : FadeInDown.delay(120 + index * 80).duration(430)} style={[styles.winner, scoreboard.teamMode && styles.teamWinner, { backgroundColor: winner.color }]}>
            <View style={styles.winnerCharacters}>
              {entryPlayers(winner.id).map((player, playerIndex) => <FrequencyCheer key={player.id} name={player.name} size={scoreboard.teamMode ? 96 : 104} reducedMotion={reducedMotion} delay={440 + index * 80 + playerIndex * 100} />)}
            </View>
            <View style={styles.winnerBadge}><Ionicons name="ribbon-outline" color={C.ink} size={29} /><Text style={[styles.winnerRank, { fontFamily: fonts.displayHeavy }]}>1</Text></View>
            <Text style={[styles.winnerName, { fontFamily: fonts.displayHeavy }]}>{winner.label}</Text>
            <Text style={[styles.winnerPoints, { fontFamily: fonts.displayHeavy }]}>{winner.points}{scoreboard.teamMode ? '%' : ''}<Text style={[styles.winnerUnit, { fontFamily: fonts.bodyMedium }]}>{scoreboard.teamMode ? ' matched' : ' pts'}</Text></Text>
            {winners.length > 1 ? <Text style={[styles.tieLabel, { fontFamily: fonts.bodyMedium }]}>Shared first place</Text> : null}
          </Animated.View>
        ))}</View> : null}

        <View style={styles.sharedStrip}>
          <View style={styles.sharedStat}><Text style={[styles.sharedNumber, { fontFamily: fonts.displayHeavy }]}>{playedRounds}</Text><Text style={[styles.sharedLabel, { fontFamily: fonts.body }]}>{playedRounds === 1 ? 'round played' : 'rounds played'}</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.sharedStat}><Text style={[styles.sharedNumber, { fontFamily: fonts.displayHeavy }]}>{scoreboard.totalExact}</Text><Text style={[styles.sharedLabel, { fontFamily: fonts.body }]}>{scoreboard.totalExact === 1 ? 'exact match' : 'exact matches'}</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.sharedStat}><Text style={[styles.sharedNumber, { fontFamily: fonts.displayHeavy }]}>{sharedRoundCount}</Text><Text style={[styles.sharedLabel, { fontFamily: fonts.body }]}>{sharedRoundCount === 1 ? 'all-in-sync round' : 'all-in-sync rounds'}</Text></View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { fontFamily: fonts.displayHeavy }]}>The final line-up</Text><Text style={[styles.sectionMeta, { fontFamily: fonts.body }]}>{scoreboard.teamMode ? 'Exact-match rate' : 'Points, not speed'}</Text></View>
          {scoreboard.entries.map((entry, index) => (
            <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(80 * index).duration(360)} key={entry.id} style={styles.boardRow}>
              <View style={styles.boardCharacters}>
                {entryPlayers(entry.id).map((player, playerIndex) => <View key={player.id} style={playerIndex > 0 ? styles.pairedCharacter : undefined}><FrequencyAvatar name={player.name} size={scoreboard.teamMode ? 36 : 44} mood={entry.rank === 1 ? 'happy' : 'idle'} /></View>)}
                <View style={[styles.rankBadge, { backgroundColor: entry.color }]}><Text style={[styles.rank, { fontFamily: fonts.displayHeavy }]}>{entry.rank || '–'}</Text></View>
              </View>
              <View style={styles.grow}><Text style={[styles.boardName, { fontFamily: fonts.bodyMedium }]}>{entry.label}</Text><Text style={[styles.boardMeta, { fontFamily: fonts.body }]}>{entry.opportunities === undefined ? entry.exact + (entry.exact === 1 ? ' exact read' : ' exact reads') : entry.exact + ' of ' + entry.opportunities + ' matched'}{entry.rank === 1 && winners.length > 1 ? ' · tied first' : ''}</Text></View>
              <Text style={[styles.points, { fontFamily: fonts.displayHeavy }]}>{entry.points}{scoreboard.teamMode ? '%' : ''}</Text>
            </Animated.View>
          ))}
          {skippedRounds > 0 ? <Text style={[styles.sectionMeta, { fontFamily: fonts.body }]}>{skippedRounds} {skippedRounds === 1 ? 'round skipped' : 'rounds skipped'} · no points awarded for skips</Text> : null}
        </View>

        <View style={styles.section}><Text style={[styles.sectionTitle, { fontFamily: fonts.displayHeavy }]}>Everyone brought something</Text><Text style={[styles.sectionIntro, { fontFamily: fonts.body }]}>A little highlight from each side of the phone.</Text>{highlights.map((highlight) => <View key={highlight.id} style={styles.highlightRow}><FrequencyAvatar name={highlight.name} size={48} /><View style={styles.grow}><Text style={[styles.highlightName, { fontFamily: fonts.bodyMedium }]}>{highlight.name}</Text><Text style={[styles.highlightDetail, { fontFamily: fonts.body }]}>{highlight.detail}</Text><Text style={[styles.highlightMeta, { fontFamily: fonts.body }]}>{highlight.subtitle}</Text></View></View>)}</View>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={replay} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Ionicons color={C.paper} name="refresh" size={22} /><Text style={[styles.primaryText, { fontFamily: fonts.displayHeavy }]}>One more game?</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/family')} style={({ pressed }) => [styles.clubLink, pressed && styles.pressed]}><Ionicons color={C.ink} name="trophy-outline" size={23} /><View style={styles.grow}><Text style={[styles.clubTitle, { fontFamily: fonts.bodyMedium }]}>Your Family Club</Text><Text style={[styles.clubDetail, { fontFamily: fonts.body }]}>Standings, stats & game nights</Text></View><Ionicons color={C.ink} name="arrow-forward" size={20} /></Pressable>
          <Pressable accessibilityRole="button" onPress={leave} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><Text style={[styles.backText, { fontFamily: fonts.bodyMedium }]}>Back to all games</Text></Pressable>
        </View>

        <View style={styles.kept}><Ionicons color={C.ink} name="lock-closed-outline" size={17} /><Text style={[styles.keptText, { fontFamily: fonts.body }]}>Private answers stayed on this phone. {source === 'ai' ? 'AI-made prompt mix' : 'Offline prompt mix'} · {history.length} recent {history.length === 1 ? 'game' : 'games'} saved.</Text></View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  shell: { backgroundColor: C.paper },
  page: { gap: 24, paddingBottom: 30 },
  header: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, paddingHorizontal: 22, paddingTop: 20 },
  brand: { color: C.ink, fontSize: 20, letterSpacing: 0.8 },
  endTag: { backgroundColor: C.teal, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, transform: [{ rotate: '-3deg' }] },
  endTagText: { color: C.ink, fontSize: 11 },
  hero: { alignItems: 'center', paddingHorizontal: 24, marginTop: -8 },
  kicker: { color: C.muted, fontSize: 9, letterSpacing: 0.8, marginTop: 3, textAlign: 'center' },
  title: { color: C.ink, fontSize: 46, lineHeight: 48, marginVertical: 8, textAlign: 'center' },
  subtitle: { color: C.muted, fontSize: 15, lineHeight: 22, maxWidth: 300, textAlign: 'center' },
  podium: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingHorizontal: 20 },
  winner: { alignItems: 'center', borderRadius: 26, borderColor: C.ink, borderWidth: 2, borderBottomWidth: 6, flexBasis: 145, flexGrow: 1, paddingHorizontal: 15, paddingVertical: 20 },
  teamWinner: { flexBasis: 240 },
  winnerCharacters: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 4, paddingTop: 4 },
  winnerBadge: { alignItems: 'center', flexDirection: 'row', gap: 3, justifyContent: 'center', marginBottom: 6 },
  winnerRank: { color: C.ink, fontSize: 30 },
  winnerName: { color: C.ink, fontSize: 33, lineHeight: 36, textAlign: 'center' },
  winnerPoints: { color: C.ink, fontSize: 35, textAlign: 'center', marginTop: 3 },
  winnerUnit: { fontSize: 12 },
  tieLabel: { color: C.ink, fontSize: 10, marginTop: 5 },
  sharedStrip: { alignItems: 'center', flexDirection: 'row', marginHorizontal: 20, borderBottomColor: C.line, borderBottomWidth: 1, paddingBottom: 22 },
  sharedStat: { alignItems: 'center', flex: 1, gap: 3 },
  sharedNumber: { color: C.ink, fontSize: 34, lineHeight: 35 },
  sharedLabel: { color: C.muted, fontSize: 10, textAlign: 'center' },
  statDivider: { width: 1, height: 30, backgroundColor: C.line },
  section: { paddingHorizontal: 20, gap: 10 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'space-between' },
  sectionTitle: { color: C.ink, fontSize: 26, lineHeight: 29 },
  sectionIntro: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: -5, marginBottom: 3 },
  sectionMeta: { color: C.muted, fontSize: 11, lineHeight: 17 },
  boardRow: { alignItems: 'center', backgroundColor: C.white, borderRadius: 20, borderColor: C.line, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 77, paddingHorizontal: 13 },
  boardCharacters: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, marginRight: 2 },
  pairedCharacter: { marginLeft: -8 },
  rankBadge: { alignItems: 'center', justifyContent: 'center', borderColor: C.ink, borderWidth: 1, borderRadius: 8, height: 21, minWidth: 21, paddingHorizontal: 3, position: 'absolute', bottom: -5, right: -3 },
  rank: { color: C.ink, fontSize: 15, lineHeight: 18 },
  grow: { flex: 1, gap: 3, minWidth: 0 },
  boardName: { color: C.ink, fontSize: 16 },
  boardMeta: { color: C.muted, fontSize: 11, lineHeight: 16 },
  points: { color: C.ink, fontSize: 34 },
  highlightRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  highlightName: { color: C.ink, fontSize: 15 },
  highlightDetail: { color: C.ink, fontSize: 12, lineHeight: 18 },
  highlightMeta: { color: C.muted, fontSize: 11, lineHeight: 17 },
  actions: { gap: 10, paddingHorizontal: 20 },
  primary: { alignItems: 'center', backgroundColor: C.ink, borderRadius: 22, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 70, paddingHorizontal: 18 },
  primaryText: { color: C.paper, fontSize: 28 },
  clubLink: { alignItems: 'center', borderRadius: 20, backgroundColor: '#E0EEE0', flexDirection: 'row', gap: 12, minHeight: 74, paddingHorizontal: 16 },
  clubTitle: { color: C.ink, fontSize: 15 },
  clubDetail: { color: C.muted, fontSize: 11 },
  backButton: { alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  backText: { color: C.ink, fontSize: 14 },
  kept: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 30 },
  keptText: { color: C.muted, flex: 1, fontSize: 10, lineHeight: 16 },
  missing: { alignItems: 'center', flex: 1, gap: 18, justifyContent: 'center' },
  missingText: { color: C.ink, fontSize: 32, textAlign: 'center' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});

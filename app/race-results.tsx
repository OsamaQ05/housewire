import { Ionicons } from '@expo/vector-icons';
import { ClubLink } from '@/src/features/family-club/ClubLink';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { ScreenShell } from '@/src/components/ScreenShell';
import { useCircuitRaceRuntime } from '@/src/features/race';
import { useCircuitRaceStore } from '@/src/store/use-circuit-race-store';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';
import { circuitRaceResultFromSnapshot } from '@/src/features/race/runtime-state';

const EMBER = '#FF7657';
const MINT = '#6ED8C7';
const GOLD = '#FFD166';

export default function RaceResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ operationId?: string | string[] }>();
  const { theme } = useHousewireTheme();
  const runtime = useCircuitRaceRuntime();
  const clearRace = useCircuitRaceStore((state) => state.clearRace);
  const history = useCircuitRaceStore((state) => state.history);
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const leavingRef = useRef(false);
  const operationId = Array.isArray(params.operationId) ? params.operationId[0] : params.operationId;
  const storedResult = operationId ? history.find((result) => result.id === operationId) : undefined;
  const liveResult = runtime.snapshot ? circuitRaceResultFromSnapshot(runtime.snapshot) : undefined;
  const result = liveResult ?? storedResult;
  const rows = result?.standings ?? [];
  const winningTeamIds = result?.winningTeamIds ?? [];
  const answerReview = result?.answerReview ?? [];
  const winner = winningTeamIds.length === 1 ? winningTeamIds[0] : undefined;

  const leaveRace = (destination: '/modes' | '/race-setup') => {
    leavingRef.current = true;
    clearRace();
    prepareSession('preview');
    router.replace(destination);
  };

  const confirmLeaveUnfinished = () => {
    const leave = () => leaveRace('/modes');
    if (Platform.OS === 'web') {
      if (typeof globalThis.confirm !== 'function' || globalThis.confirm('Leave before the final race result arrives?')) leave();
      return;
    }
    Alert.alert('Leave without the result?', 'The host may still be comparing the two finish times.', [
      { text: 'Keep waiting', style: 'cancel' },
      { text: 'Leave race', style: 'destructive', onPress: leave },
    ]);
  };

  useEffect(() => () => {
    if (leavingRef.current) return;
    clearRace();
    prepareSession('preview');
  }, [clearRace, prepareSession]);

  if (rows.length < 2) {
    return (
      <ScreenShell texture={false}>
        <View style={styles.missing}>
          <Text style={[styles.missingTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>Waiting for both teams</Text>
          <Text style={[styles.missingBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>The host is checking both finish times.</Text>
          <Pressable onPress={() => void runtime.requestSnapshot()} style={[styles.outline, { borderColor: MINT }]}><Text style={[styles.outlineText, { color: MINT, fontFamily: theme.typography.families.bodyMedium }]}>Refresh from host</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={confirmLeaveUnfinished} style={[styles.outline, { borderColor: theme.colors.draft }]}><Text style={[styles.outlineText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Leave race</Text></Pressable>
        </View>
      </ScreenShell>
    );
  }

  const winnerColor = winner === 'mint' ? MINT : winner === 'ember' ? EMBER : GOLD;
  const ordered = [...rows].sort((left, right) => Number(Boolean(left.failed)) - Number(Boolean(right.failed)) || left.elapsedMs - right.elapsedMs);
  const bothFinished = ordered.every((row) => !row.failed);
  const gap = bothFinished && ordered.length > 1 ? ordered[1].elapsedMs - ordered[0].elapsedMs : 0;

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(480)} style={styles.hero}>
          <FinishGlyph accent={winner ? winnerColor : GOLD} />
          <Text style={[styles.kicker, { color: winner ? winnerColor : GOLD, fontFamily: theme.typography.families.bodyMedium }]}>Race ended</Text>
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{winner ? `${winner === 'mint' ? 'Mint' : 'Coral'} wins` : winningTeamIds.length ? 'Photo finish' : 'No crew finished'}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.muted, fontFamily: theme.typography.families.story }]}>{bothFinished ? winner ? `${formatGap(gap)} between the two crews.` : 'Both circuits closed inside the tie window.' : 'Four mistakes or fifteen minutes ends a crew’s run. Here’s what you missed.'}</Text>
        </Animated.View>

        <View style={styles.board}>
          {ordered.map((standing, index) => {
            const color = standing.teamId === 'mint' ? MINT : EMBER;
            return (
              <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(100 * index).duration(400)} key={standing.teamId} style={[styles.result, { backgroundColor: theme.colors.surface, borderColor: color }]}>
                <View style={[styles.position, { backgroundColor: color }]}><Text style={[styles.positionText, { fontFamily: theme.typography.families.displayHeavy }]}>{standing.failed ? '—' : index + 1}</Text></View>
                <View style={styles.resultCopy}>
                  <Text style={[styles.resultName, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{standing.teamId === 'mint' ? 'Mint team' : 'Coral team'}</Text>
                  <Text style={[styles.resultMeta, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>{standing.failed ? standing.failureReason === 'time' ? 'Time expired' : 'Four mistakes used' : '4 challenges · host verified'}</Text>
                </View>
                <Text style={[styles.resultTime, { color, fontFamily: theme.typography.families.displayHeavy }]}>{standing.failed ? 'DNF' : formatTime(standing.elapsedMs)}</Text>
              </Animated.View>
            );
          })}
        </View>

        {answerReview.length ? <View style={styles.board}>
          <Text style={[styles.resultName, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>Your missed answers</Text>
          <Text style={[styles.bondBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Now that every crew has stopped, you can see the solutions.</Text>
          {answerReview.map((item) => <View key={item.stageId} style={[styles.reviewCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.draft }]}>
            <Text style={[styles.bondTitle, { color: GOLD, fontFamily: theme.typography.families.bodyMedium }]}>{item.title}</Text>
            <Text selectable style={[styles.reviewAnswer, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{item.answer}</Text>
            <Text style={[styles.bondBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{item.explanation}</Text>
          </View>)}
        </View> : null}

        <View style={[styles.bond, { borderColor: theme.colors.draft }]}>
          <Ionicons color={GOLD} name="link-outline" size={24} />
          <View style={styles.bondCopy}>
            <Text style={[styles.bondTitle, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Speed still needed teamwork</Text>
            <Text style={[styles.bondBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>In 2v2, each crew split clues, used a private teammate line, and recombined its own two breaker strips.</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <ClubLink label="See your family standings" />
          <Pressable onPress={() => leaveRace('/race-setup')} style={({ pressed }) => [styles.primary, { backgroundColor: winnerColor }, pressed && styles.pressed]}>
            <Ionicons color="#08100F" name="refresh" size={21} />
            <Text style={[styles.primaryText, { fontFamily: theme.typography.families.displayHeavy }]}>Race again</Text>
          </Pressable>
          <Pressable onPress={() => leaveRace('/modes')} style={({ pressed }) => [styles.outline, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
            <Text style={[styles.outlineText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Back to house modes</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function FinishGlyph({ accent }: { accent: string }) {
  return <View style={styles.glyph}><Svg height="145" viewBox="0 0 280 145" width="280"><Circle cx="140" cy="73" fill="none" r="55" stroke="#38332A" strokeWidth="1" /><Path d="M10 82 L52 82 L66 24 L80 120 L96 48 L113 92 L128 73" fill="none" stroke={EMBER} strokeWidth="5" /><Path d="M152 73 L170 52 L186 103 L204 31 L219 93 L236 64 L270 64" fill="none" stroke={MINT} strokeWidth="5" /><Circle cx="140" cy="73" fill="#080A08" r="23" stroke={accent} strokeWidth="5" /><Circle cx="140" cy="73" fill={accent} r="7" /></Svg></View>;
}

function formatTime(ms: number): string { const total = Math.max(0, ms); const seconds = Math.floor(total / 1_000); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${Math.floor((total % 1_000) / 100)}`; }
function formatGap(ms: number): string { return ms < 1_000 ? `${Math.max(0, ms)} milliseconds` : `${(ms / 1_000).toFixed(1)} seconds`; }

const styles = StyleSheet.create({
  actions: { gap: 9, paddingHorizontal: 20 },
  board: { gap: 9, paddingHorizontal: 20 },
  bond: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 11, marginHorizontal: 20, paddingHorizontal: 13, paddingVertical: 14 },
  bondBody: { fontSize: 12, lineHeight: 17 },
  bondCopy: { flex: 1, gap: 3 },
  bondTitle: { fontSize: 15 },
  glyph: { height: 138 },
  hero: { alignItems: 'center', paddingHorizontal: 22, paddingTop: 10 },
  kicker: { fontSize: 13, lineHeight: 18 },
  missing: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center', paddingHorizontal: 24 },
  missingBody: { fontSize: 14 },
  missingTitle: { fontSize: 34, textAlign: 'center' },
  outline: { alignItems: 'center', borderRadius: 14, borderWidth: 1, justifyContent: 'center', minHeight: 55, paddingHorizontal: 18 },
  outlineText: { fontSize: 14 },
  page: { flexGrow: 1, gap: 21, paddingBottom: 38 },
  position: { alignItems: 'center', borderRadius: 12, height: 46, justifyContent: 'center', width: 42 },
  positionText: { color: '#08100F', fontSize: 27 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.993 }] },
  primary: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 64 },
  primaryText: { color: '#08100F', fontSize: 19 },
  result: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 80, paddingHorizontal: 11 },
  reviewCard: { borderRadius: 16, borderWidth: 1, gap: 9, padding: 17 },
  reviewAnswer: { fontSize: 25, lineHeight: 29 },
  resultCopy: { flex: 1 },
  resultMeta: { fontSize: 11, lineHeight: 15 },
  resultName: { fontSize: 22, lineHeight: 23 },
  resultTime: { fontSize: 25 },
  subtitle: { fontSize: 21, lineHeight: 25, marginTop: 7, textAlign: 'center' },
  title: { fontSize: 51, lineHeight: 52, marginTop: 7, textAlign: 'center' },
});

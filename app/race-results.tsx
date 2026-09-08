import { Ionicons } from '@expo/vector-icons';
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

const EMBER = '#FF6846';
const MINT = '#5FE0D0';
const GOLD = '#F2C14E';

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
  const liveFinished = (runtime.view?.standings ?? []).filter((standing) => standing.finishedAt !== undefined);
  const hasLiveResult = Boolean(runtime.view && liveFinished.length >= 2);
  const storedRows = storedResult?.standings.flatMap((standing) => standing.elapsedMs === undefined
    ? []
    : [{ teamId: standing.teamId, elapsedMs: standing.elapsedMs }]) ?? [];
  const rows = hasLiveResult
    ? liveFinished.map((standing) => ({
        teamId: standing.teamId,
        elapsedMs: standing.finishedAt! - runtime.view!.startsAt,
      }))
    : storedRows.length === storedResult?.standings.length ? storedRows : [];
  const firstElapsed = rows.length ? Math.min(...rows.map((standing) => standing.elapsedMs)) : 0;
  const winningTeamIds = hasLiveResult
    ? rows
        .filter((standing) => standing.elapsedMs - firstElapsed <= (runtime.snapshot?.tieWindowMs ?? 750))
        .map((standing) => standing.teamId)
    : storedResult?.winningTeamIds ?? [];
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
          <Text style={[styles.missingTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>RESULT STILL ON THE WIRE</Text>
          <Text style={[styles.missingBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Waiting for both breaker timestamps.</Text>
          <Pressable onPress={() => void runtime.requestSnapshot()} style={[styles.outline, { borderColor: MINT }]}><Text style={[styles.outlineText, { color: MINT, fontFamily: theme.typography.families.bodyMedium }]}>Refresh from host</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={confirmLeaveUnfinished} style={[styles.outline, { borderColor: theme.colors.draft }]}><Text style={[styles.outlineText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Leave race</Text></Pressable>
        </View>
      </ScreenShell>
    );
  }

  const winnerColor = winner === 'mint' ? MINT : winner === 'ember' ? EMBER : GOLD;
  const ordered = [...rows].sort((left, right) => left.elapsedMs - right.elapsedMs);
  const gap = ordered.length > 1 ? ordered[1].elapsedMs - ordered[0].elapsedMs : 0;

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(480)} style={styles.hero}>
          <FinishGlyph accent={winner ? winnerColor : GOLD} />
          <Text style={[styles.kicker, { color: winner ? winnerColor : GOLD, fontFamily: theme.typography.families.monoMedium }]}>MASTER BREAKER SEALED</Text>
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{winner ? `${winner.toUpperCase()} WINS.` : 'PHOTO FINISH.'}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.muted, fontFamily: theme.typography.families.story }]}>{winner ? `${formatGap(gap)} between the two crews.` : 'Both circuits closed inside the tie window.'}</Text>
        </Animated.View>

        <View style={styles.board}>
          {ordered.map((standing, index) => {
            const color = standing.teamId === 'mint' ? MINT : EMBER;
            return (
              <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(100 * index).duration(400)} key={standing.teamId} style={[styles.result, { backgroundColor: theme.colors.surface, borderColor: color }]}>
                <View style={[styles.position, { backgroundColor: color }]}><Text style={[styles.positionText, { fontFamily: theme.typography.families.displayHeavy }]}>{index + 1}</Text></View>
                <View style={styles.resultCopy}>
                  <Text style={[styles.resultName, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{standing.teamId.toUpperCase()} CREW</Text>
                  <Text style={[styles.resultMeta, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>4 CIRCUITS · HOST VERIFIED</Text>
                </View>
                <Text style={[styles.resultTime, { color, fontFamily: theme.typography.families.displayHeavy }]}>{formatTime(standing.elapsedMs)}</Text>
              </Animated.View>
            );
          })}
        </View>

        <View style={[styles.bond, { borderColor: theme.colors.draft }]}>
          <Ionicons color={GOLD} name="link-outline" size={24} />
          <View style={styles.bondCopy}>
            <Text style={[styles.bondTitle, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Speed still needed teamwork</Text>
            <Text style={[styles.bondBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>In 2v2, each crew split clues, used a private teammate line, and recombined its own two breaker strips.</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={() => leaveRace('/race-setup')} style={({ pressed }) => [styles.primary, { backgroundColor: winnerColor }, pressed && styles.pressed]}>
            <Ionicons color="#08100F" name="refresh" size={21} />
            <Text style={[styles.primaryText, { fontFamily: theme.typography.families.displayHeavy }]}>RACE A FRESH CIRCUIT</Text>
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
  bond: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: 11, marginHorizontal: 20, paddingVertical: 14 },
  bondBody: { fontSize: 12, lineHeight: 17 },
  bondCopy: { flex: 1, gap: 3 },
  bondTitle: { fontSize: 15 },
  glyph: { height: 138 },
  hero: { alignItems: 'center', paddingHorizontal: 22, paddingTop: 10 },
  kicker: { fontSize: 8, letterSpacing: 1.5 },
  missing: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center', paddingHorizontal: 24 },
  missingBody: { fontSize: 14 },
  missingTitle: { fontSize: 34, textAlign: 'center' },
  outline: { alignItems: 'center', borderWidth: 1, justifyContent: 'center', minHeight: 55, paddingHorizontal: 18 },
  outlineText: { fontSize: 14 },
  page: { flexGrow: 1, gap: 21, paddingBottom: 38 },
  position: { alignItems: 'center', height: 46, justifyContent: 'center', width: 42 },
  positionText: { color: '#08100F', fontSize: 27 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.993 }] },
  primary: { alignItems: 'center', flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 64 },
  primaryText: { color: '#08100F', fontSize: 19, letterSpacing: 0.4 },
  result: { alignItems: 'center', borderLeftWidth: 4, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 80, paddingHorizontal: 11 },
  resultCopy: { flex: 1 },
  resultMeta: { fontSize: 7, letterSpacing: 0.9 },
  resultName: { fontSize: 22, lineHeight: 23 },
  resultTime: { fontSize: 25 },
  subtitle: { fontSize: 21, lineHeight: 25, marginTop: 7, textAlign: 'center' },
  title: { fontSize: 53, lineHeight: 51, marginTop: 7, textAlign: 'center' },
});

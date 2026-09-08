import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';

import { ScreenShell } from '@/src/components/ScreenShell';
import {
  createQuickFamilyTriviaSetup,
  familyTriviaSeed,
} from '@/src/domain/family-trivia';
import { buildFamilyFrequencyPack } from '@/src/features/trivia/family-frequency-service';
import {
  familyFrequencySetupIssue,
  useFamilyFrequencyStore,
  type FamilyFrequencyFormat,
} from '@/src/store/use-family-frequency-store';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';
import { decorativeAccessibilityProps } from '@/src/utils/accessibility';

const GOLD = '#F2C14E';
const CYAN = '#63D9D1';
const CORAL = '#F46A4E';

export default function TriviaSetupScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const storedNames = useFamilyFrequencyStore((state) => state.names);
  const storedFormat = useFamilyFrequencyStore((state) => state.format);
  const storedCount = useFamilyFrequencyStore((state) => state.questionCount);
  const hydrated = useFamilyFrequencyStore((state) => state.hydrated);
  const activeSession = useFamilyFrequencyStore((state) => state.session);
  const history = useFamilyFrequencyStore((state) => state.history);
  const varietyLedger = useFamilyFrequencyStore((state) => state.varietyLedger);
  const setStoredNames = useFamilyFrequencyStore((state) => state.setNames);
  const setStoredFormat = useFamilyFrequencyStore((state) => state.setFormat);
  const setStoredCount = useFamilyFrequencyStore((state) => state.setQuestionCount);
  const startGame = useFamilyFrequencyStore((state) => state.startGame);
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const haptics = useHousewireStore((state) => state.settings.haptics);
  const [names, setNames] = useState(() => storedNames.slice(0, 4));
  const [format, setFormat] = useState<FamilyFrequencyFormat>(storedFormat);
  const [questionCount, setQuestionCount] = useState<4 | 8 | 12>(storedCount);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string>();
  const formDirty = useRef(false);
  const mounted = useRef(true);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  useEffect(() => {
    if (!hydrated || formDirty.current) return;
    setNames(storedNames.slice(0, 4));
    setFormat(storedFormat);
    setQuestionCount(storedCount);
  }, [hydrated, storedCount, storedFormat, storedNames]);

  const cleanNames = names.map((name) => name.trim()).filter(Boolean);
  const setupIssue = familyFrequencySetupIssue(names, format);
  const valid = setupIssue === undefined;

  const teamLabels = useMemo(() => names.map((_, index) => index % 2 === 0 ? 'COPPER' : 'CYAN'), [names]);

  const updateName = (index: number, value: string) => {
    formDirty.current = true;
    setStartError(undefined);
    setNames((current) => current.map((name, currentIndex) => currentIndex === index ? value.slice(0, 24) : name));
  };

  const begin = async () => {
    if (!valid || starting) return;
    setStarting(true);
    setStartError(undefined);
    if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    try {
      const setupBase = createQuickFamilyTriviaSetup(cleanNames, { teams: format === 'teams' });
      const setup = format === 'teams'
        ? {
            ...setupBase,
            teams: setupBase.teams.map((team, index) => ({ ...team, name: index === 0 ? 'Copper Side' : 'Cyan Side' })),
          }
        : setupBase;
      const seed = familyTriviaSeed(`${Date.now()}:${cleanNames.length}:${questionCount}:${format}`);
      const { pack, style } = await buildFamilyFrequencyPack({
        count: questionCount,
        seed,
        setup,
        varietyLedger,
      });
      if (!mounted.current) return;
      setStoredNames(cleanNames);
      setStoredFormat(format);
      setStoredCount(questionCount);
      startGame(setup, pack, style);
      setStarting(false);
      router.replace('/trivia-play');
    } catch {
      if (!mounted.current) return;
      setStarting(false);
      setStartError('We could not prepare the game. Check the names and try again.');
    }
  };

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable accessibilityLabel="Back" hitSlop={10} onPress={() => router.back()}>
              <Ionicons color={theme.colors.text} name="arrow-back" size={23} />
            </Pressable>
            <View style={styles.identity}>
              <View style={[styles.onAir, { backgroundColor: GOLD }]} />
              <Text style={[styles.identityText, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>FAMILY FREQUENCY</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(440)} style={styles.hero}>
            <FrequencyTuner />
            <Text style={[styles.heroTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>How well do you know each other?</Text>
            <Text style={[styles.heroBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Pass one phone around. Answer privately, predict each other, then reveal the truth together.</Text>
          </Animated.View>

          <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(80).duration(400)} style={[styles.how, { borderColor: theme.colors.draft }]}>
            {['ANSWER', 'PASS & GUESS', 'REVEAL'].map((step, index) => (
              <View key={step} style={styles.howStep}>
                <Text style={[styles.howNumber, { color: index === 0 ? GOLD : index === 1 ? CYAN : CORAL, fontFamily: theme.typography.families.displayHeavy }]}>{index + 1}</Text>
                <Text style={[styles.howLabel, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{step}</Text>
              </View>
            ))}
          </Animated.View>

          {activeSession ? (
            <Pressable
              accessibilityHint={activeSession.phase === 'complete' ? 'Opens the completed scoreboard' : 'Returns to the private handoff in progress'}
              accessibilityRole="button"
              onPress={() => router.replace(activeSession.phase === 'complete' ? '/trivia-results' : '/trivia-play')}
              style={({ pressed }) => [styles.resume, { backgroundColor: theme.colors.surface, borderColor: CYAN }, pressed && styles.pressed]}
            >
              <View style={[styles.resumeLamp, { backgroundColor: CYAN }]} />
              <View style={styles.resumeCopy}>
                <Text style={[styles.resumeKicker, { color: CYAN, fontFamily: theme.typography.families.monoMedium }]}>{activeSession.phase === 'complete' ? 'SCOREBOARD SAVED' : 'SIGNAL STILL LIVE'}</Text>
                <Text style={[styles.resumeTitle, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{activeSession.phase === 'complete' ? 'See the last result' : `Resume round ${activeSession.questionIndex + 1} of ${activeSession.pack.questions.length}`}</Text>
              </View>
              <Ionicons color={CYAN} name="arrow-forward" size={20} />
            </Pressable>
          ) : null}

          {history.length ? (
            <View style={styles.recentSection}>
              <View style={styles.recentHeader}>
                <Text style={[styles.sectionLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>RECENT SIGNALS</Text>
                <Text style={[styles.recentPrivate, { color: CYAN, fontFamily: theme.typography.families.monoMedium }]}>SAVED ON THIS PHONE</Text>
              </View>
              <ScrollView horizontal contentContainerStyle={styles.recentRail} showsHorizontalScrollIndicator={false}>
                {history.slice(0, 3).map((result) => {
                  const high = Math.max(0, ...result.scores.map((score) => score.points));
                  const normalizedTeamScore = result.format === 'teams' &&
                    result.scores.every((score) => score.opportunities !== undefined);
                  return (
                    <View key={result.id} style={[styles.recentCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.draft }]}>
                      <Text numberOfLines={1} style={[styles.recentWinner, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{result.winners.join(' + ')}</Text>
                      <Text style={[styles.recentScore, { color: result.format === 'teams' ? CYAN : GOLD, fontFamily: theme.typography.families.displayHeavy }]}>{normalizedTeamScore ? formatTeamRate(high) : `${high} pts`}</Text>
                      <Text style={[styles.recentMeta, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>{recentDate(result.playedAt)} · {result.roundCount} ROUNDS</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.bodyMedium }]}>Who is playing?</Text>
            <View style={styles.nameList}>
              {names.map((name, index) => (
                <View key={index} style={[styles.nameRow, { borderColor: theme.colors.draft, backgroundColor: theme.colors.surface }]}>
                  <View style={[styles.nameIndex, { borderColor: format === 'teams' ? (index % 2 === 0 ? CORAL : CYAN) : GOLD }]}>
                    <Text style={[styles.nameIndexText, { color: format === 'teams' ? (index % 2 === 0 ? CORAL : CYAN) : GOLD, fontFamily: theme.typography.families.displayHeavy }]}>{index + 1}</Text>
                  </View>
                  <TextInput
                    accessibilityLabel={`Player ${index + 1} name`}
                    autoCapitalize="words"
                    maxLength={24}
                    onChangeText={(value) => updateName(index, value)}
                    placeholder={`Player ${index + 1}`}
                    placeholderTextColor={theme.colors.faint}
                    returnKeyType="done"
                    style={[styles.nameInput, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}
                    value={name}
                  />
                  {format === 'teams' ? (
                    <Text style={[styles.teamTag, { color: index % 2 === 0 ? CORAL : CYAN, fontFamily: theme.typography.families.monoMedium }]}>{teamLabels[index]}</Text>
                  ) : null}
                  {names.length > 2 ? (
                    <Pressable accessibilityLabel={`Remove ${name || `player ${index + 1}`}`} hitSlop={8} onPress={() => {
                      formDirty.current = true;
                      setStartError(undefined);
                      setNames((current) => current.filter((_, currentIndex) => currentIndex !== index));
                    }}>
                      <Ionicons color={theme.colors.faint} name="close" size={19} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
            {names.length < 4 ? (
              <Pressable accessibilityRole="button" onPress={() => {
                formDirty.current = true;
                setStartError(undefined);
                setNames((current) => [...current, '']);
              }} style={styles.addPlayer}>
                <Ionicons color={GOLD} name="add" size={18} />
                <Text style={[styles.addPlayerText, { color: GOLD, fontFamily: theme.typography.families.bodyMedium }]}>Add player</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.bodyMedium }]}>Play as</Text>
            <View style={[styles.segment, { borderColor: theme.colors.draft }]}>
              <SegmentButton active={format === 'everyone'} label="Everyone" onPress={() => {
                formDirty.current = true;
                setFormat('everyone');
              }} />
              <SegmentButton active={format === 'teams'} label="2 Teams" onPress={() => {
                formDirty.current = true;
                setFormat('teams');
              }} />
            </View>
            {format === 'teams' ? (
              <Text style={[styles.teamHint, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Four players, two partner pairs. You only predict your own teammate—so bluffing can only hurt your side.</Text>
            ) : (
              <Text style={[styles.teamHint, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>A correct read rewards the guesser and the person understood. Nobody benefits from hiding the truth.</Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.bodyMedium }]}>How long?</Text>
            <View style={styles.lengthRow}>
              {([4, 8, 12] as const).map((count) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: questionCount === count }}
                  key={count}
                  onPress={() => {
                    formDirty.current = true;
                    setQuestionCount(count);
                  }}
                  style={[styles.lengthKey, { backgroundColor: questionCount === count ? GOLD : theme.colors.surface, borderColor: questionCount === count ? GOLD : theme.colors.draft }]}
                >
                  <Text style={[styles.lengthCount, { color: questionCount === count ? '#171309' : theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{count === 4 ? '5 min' : count === 8 ? '10 min' : '15 min'}</Text>
                  <Text style={[styles.lengthLabel, { color: questionCount === count ? '#4D3A12' : theme.colors.faint, fontFamily: theme.typography.families.bodyMedium }]}>{count} rounds</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {setupIssue ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.colors.fault, fontFamily: theme.typography.families.body }]}>{setupIssue}</Text> : null}
          {startError ? <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: theme.colors.fault, fontFamily: theme.typography.families.body }]}>{startError}</Text> : null}

          <Pressable
            accessibilityHint="Builds tonight's private-answer question mix"
            accessibilityRole="button"
            accessibilityState={{ disabled: !valid || starting }}
            disabled={!valid || starting}
            onPress={() => void begin()}
            style={({ pressed }) => [styles.start, { backgroundColor: GOLD }, (!valid || starting) && styles.disabled, pressed && styles.pressed]}
          >
            <View>
              <Text style={[styles.startOverline, { fontFamily: theme.typography.families.bodyMedium }]}>{starting ? 'Preparing a fresh mix…' : 'Private answers stay on this phone'}</Text>
              <Text style={[styles.startText, { fontFamily: theme.typography.families.displayHeavy }]}>{starting ? 'One moment' : 'Start Family Frequency'}</Text>
            </View>
            <Ionicons color="#171309" name="radio" size={27} />
          </Pressable>
          <Text style={[styles.aiNote, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>AI refreshes the question mix for your group. Private answers stay here.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

function recentDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'RECENT';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toLocaleUpperCase();
}

function formatTeamRate(points: number): string {
  const percent = points / 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
}

function SegmentButton({ active, label, onPress }: { active: boolean; label: string; onPress(): void }) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress} style={[styles.segmentKey, active && { backgroundColor: GOLD }]}>
      <Text style={[styles.segmentText, { color: active ? '#171309' : theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
    </Pressable>
  );
}

function FrequencyTuner() {
  return (
    <View {...decorativeAccessibilityProps} style={styles.tuner}>
      <Svg height="154" viewBox="0 0 300 154" width="300">
        <Path d="M28 117 A125 125 0 0 1 272 117" fill="none" stroke="#353028" strokeWidth="14" />
        <Path d="M28 117 A125 125 0 0 1 192 16" fill="none" stroke={GOLD} strokeLinecap="round" strokeWidth="5" />
        <G>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((tick) => {
            const angle = Math.PI + (Math.PI * tick) / 8;
            const x1 = 150 + Math.cos(angle) * 105;
            const y1 = 124 + Math.sin(angle) * 105;
            const x2 = 150 + Math.cos(angle) * 120;
            const y2 = 124 + Math.sin(angle) * 120;
            return <Line key={tick} stroke={tick < 6 ? GOLD : '#5A5142'} strokeWidth={tick % 2 === 0 ? 3 : 1} x1={x1} x2={x2} y1={y1} y2={y2} />;
          })}
        </G>
        <Line stroke={CORAL} strokeLinecap="round" strokeWidth="5" x1="150" x2="192" y1="124" y2="43" />
        <Circle cx="150" cy="124" fill="#11110D" r="22" stroke={CYAN} strokeWidth="3" />
        <Circle cx="150" cy="124" fill={CYAN} r="5" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  addPlayer: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 6, minHeight: 34 },
  addPlayerText: { fontSize: 13 },
  aiNote: { fontSize: 12, lineHeight: 17, paddingHorizontal: 28, textAlign: 'center' },
  disabled: { opacity: 0.36 },
  error: { fontSize: 13, marginTop: -5, textAlign: 'center' },
  flex: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 },
  headerSpacer: { width: 23 },
  hero: { alignItems: 'center', paddingHorizontal: 24 },
  heroBody: { fontSize: 15, lineHeight: 21, maxWidth: 370, textAlign: 'center' },
  heroTitle: { fontSize: 41, lineHeight: 43, marginBottom: 7, textAlign: 'center' },
  how: { borderRadius: 16, borderWidth: 1, flexDirection: 'row', marginHorizontal: 20, paddingVertical: 11 },
  howLabel: { fontSize: 10, letterSpacing: 0.5 },
  howNumber: { fontSize: 26, lineHeight: 27 },
  howStep: { alignItems: 'center', flex: 1 },
  identity: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  identityText: { fontSize: 19, letterSpacing: 0.7 },
  lengthCount: { fontSize: 21, lineHeight: 24 },
  lengthKey: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flex: 1, gap: 2, minHeight: 62, justifyContent: 'center' },
  lengthLabel: { fontSize: 11, lineHeight: 15 },
  lengthRow: { flexDirection: 'row', gap: 8 },
  nameIndex: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  nameIndexText: { fontSize: 20 },
  nameInput: { flex: 1, fontSize: 16, minHeight: 50, paddingVertical: 0 },
  nameList: { gap: 7 },
  nameRow: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 58, paddingHorizontal: 10 },
  onAir: { borderRadius: 5, height: 9, width: 9 },
  page: { gap: 20, paddingBottom: 42 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.992 }] },
  resume: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 11, marginHorizontal: 20, minHeight: 67, paddingHorizontal: 13 },
  resumeCopy: { flex: 1, gap: 3 },
  recentCard: { borderRadius: 14, borderWidth: 1, gap: 2, minHeight: 78, paddingHorizontal: 12, paddingVertical: 10, width: 154 },
  recentHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  recentMeta: { fontSize: 9, letterSpacing: 0.5, marginTop: 2 },
  recentPrivate: { fontSize: 9, letterSpacing: 0.7 },
  recentRail: { gap: 8, paddingHorizontal: 20 },
  recentScore: { fontSize: 22, lineHeight: 23 },
  recentSection: { gap: 9 },
  recentWinner: { fontSize: 14 },
  resumeKicker: { fontSize: 10, letterSpacing: 1 },
  resumeLamp: { borderRadius: 6, height: 11, width: 11 },
  resumeTitle: { fontSize: 15 },
  section: { gap: 10, paddingHorizontal: 20 },
  sectionLabel: { fontSize: 14, lineHeight: 18 },
  segment: { borderRadius: 16, borderWidth: 1, flexDirection: 'row', padding: 4 },
  segmentKey: { alignItems: 'center', borderRadius: 12, flex: 1, justifyContent: 'center', minHeight: 44 },
  segmentText: { fontSize: 15 },
  start: { alignItems: 'center', borderRadius: 18, flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 20, minHeight: 82, paddingHorizontal: 18 },
  startOverline: { color: '#5B4512', fontSize: 11, lineHeight: 15 },
  startText: { color: '#171309', fontSize: 23, lineHeight: 27 },
  teamHint: { fontSize: 12, lineHeight: 17 },
  teamTag: { fontSize: 10, letterSpacing: 0.7 },
  tuner: { height: 143, marginBottom: -4 },
});

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
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
import { FREQUENCY_COLORS as C, FrequencyMark } from '@/src/features/trivia/FrequencyIdentity';
import { FREQUENCY_SCORE_COLORS } from '@/src/features/trivia/frequency-scoreboard';
import { FrequencyAvatar } from '@/src/features/trivia/FrequencyAvatar';
import { FrequencyAvatarPicker } from '@/src/features/trivia/FrequencyAvatarPicker';
import { useFrequencyAvatarStore } from '@/src/store/use-frequency-avatar-store';

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
import { useFamilyClubStore } from '@/src/store/use-family-club-store';

const GOLD = C.sun;
const CYAN = C.teal;
const CORAL = C.tangerine;

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
  const avatarSaveError = useFrequencyAvatarStore((state) => state.storageError);
  const retryAvatarSave = useFrequencyAvatarStore((state) => state.retrySave);
  const [names, setNames] = useState(() => storedNames.slice(0, 4));
  const [format, setFormat] = useState<FamilyFrequencyFormat>(storedFormat);
  const [questionCount, setQuestionCount] = useState<4 | 8 | 12>(storedCount);
  const [starting, setStarting] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [avatarName, setAvatarName] = useState<string>();
  const [startError, setStartError] = useState<string>();
  const formDirty = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
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
    <ScreenShell edgeWire="none" padded={false} texture={false} manageStatusBar={false} style={{ backgroundColor: C.paper }}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable accessibilityLabel="Back to games" accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.back}>
              <Ionicons color={C.ink} name="arrow-back" size={23} />
            </Pressable>
            <View style={styles.identity}>
              <View style={[styles.onAir, { backgroundColor: GOLD }]} />
              <Text style={[styles.identityText, { color: C.ink, fontFamily: theme.typography.families.displayHeavy }]}>FAMILY FREQUENCY</Text>
            </View>
            <View style={styles.phoneTag}><Ionicons name="phone-portrait-outline" color={C.ink} size={18} /><Text style={styles.phoneNumber}>1</Text></View>
          </View>

          <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(440)} style={styles.hero}>
            <View style={styles.heroArt}><FrequencyMark size={126} /><View style={styles.familyTag}><Text style={[styles.familyTagText, { fontFamily: theme.typography.families.bodyMedium }]}>Your people. Your game.</Text></View></View>
            <Text style={[styles.heroTitle, { color: C.ink, fontFamily: theme.typography.families.displayHeavy }]}>Big guesses.{'\n'}Familiar faces.</Text>
            <Text style={[styles.heroBody, { color: C.muted, fontFamily: theme.typography.families.body }]}>One phone. A few surprises. Find out who’s on your wavelength.</Text>
          </Animated.View>

          <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(80).duration(400)} style={[styles.how, { borderColor: C.line }]}>
            {['Pick', 'Pass', 'Reveal'].map((step, index) => (
              <View key={step} style={styles.howStep}>
                <View style={[styles.stepIcon, { backgroundColor: index === 0 ? CORAL : index === 1 ? CYAN : GOLD }]}><Ionicons color={C.ink} size={23} name={index === 0 ? 'hand-left-outline' : index === 1 ? 'swap-horizontal' : 'sunny-outline'} /></View>
                <Text style={[styles.howLabel, { color: C.ink, fontFamily: theme.typography.families.displayHeavy }]}>{step}</Text>
                <Text style={[styles.stepDetail, { fontFamily: theme.typography.families.body }]}>{index === 0 ? 'Your secret answer' : index === 1 ? 'Everyone guesses' : 'See who gets you'}</Text>
              </View>
            ))}
          </Animated.View>

          {activeSession ? (
            <Pressable
              accessibilityHint={activeSession.phase === 'complete' ? 'Opens the completed scoreboard' : 'Returns to the private handoff in progress'}
              accessibilityRole="button"
              onPress={() => router.replace(activeSession.phase === 'complete' ? '/trivia-results' : '/trivia-play')}
              style={({ pressed }) => [styles.resume, { backgroundColor: C.white, borderColor: CYAN }, pressed && styles.pressed]}
            >
              <View style={[styles.resumeLamp, { backgroundColor: CYAN }]} />
              <View style={styles.resumeCopy}>
                <Text style={[styles.resumeKicker, { color: C.ink, fontFamily: theme.typography.families.bodyMedium }]}>{activeSession.phase === 'complete' ? 'Your last game' : 'Your game is still here'}</Text>
                <Text style={[styles.resumeTitle, { color: C.ink, fontFamily: theme.typography.families.bodyMedium }]}>{activeSession.phase === 'complete' ? 'See the last result' : `Resume round ${activeSession.questionIndex + 1} of ${activeSession.pack.questions.length}`}</Text>
              </View>
              <Ionicons color={CYAN} name="arrow-forward" size={20} />
            </Pressable>
          ) : null}


          <View style={styles.section}>
            <View style={styles.sectionHeading}><Text style={[styles.sectionLabel, { color: C.ink, fontFamily: theme.typography.families.displayHeavy }]}>Who’s in?</Text><Text style={[styles.sectionNote, { fontFamily: theme.typography.families.body }]}>2–4 people · one phone</Text></View>
            <SavedPlayers onChoose={(chosen) => {
              formDirty.current = true;
              setStartError(undefined);
              setNames((current) => {
                if (current.includes(chosen)) return current;
                const known = useFamilyClubStore.getState().members.map((m) => m.name);
                const replaceIndex = current.findIndex((n) => !known.includes(n));
                return replaceIndex >= 0 ? current.map((n, i) => i === replaceIndex ? chosen : n) : current.length < 4 ? [...current, chosen] : current;
              });
            }} />
            <View style={styles.nameList}>
              {names.map((name, index) => (
                <View key={index} style={[styles.nameRow, { borderColor: C.line, backgroundColor: C.white }]}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Choose avatar for ${name || `player ${index + 1}`}`} accessibilityHint={name.trim() ? 'Choose a character for this player' : 'Enter a name first'} accessibilityState={{ disabled: !name.trim() }} disabled={!name.trim()} onPress={() => { Keyboard.dismiss(); setAvatarName(name.trim()); }} style={[styles.avatarButton, { borderColor: format === 'teams' ? (index % 2 === 0 ? CORAL : CYAN) : FREQUENCY_SCORE_COLORS[index] }]}>
                    <FrequencyAvatar name={name || `Player ${index + 1}`} size={44} />
                    <View style={styles.avatarEdit}><Ionicons name="pencil" size={10} color={C.ink} /></View>
                  </Pressable>
                  <TextInput
                    accessibilityLabel={`Player ${index + 1} name`}
                    autoCapitalize="words"
                    maxLength={24}
                    onChangeText={(value) => updateName(index, value)}
                    placeholder={`Player ${index + 1}`}
                    placeholderTextColor={C.muted}
                    returnKeyType="done"
                    style={[styles.nameInput, { color: C.ink, fontFamily: theme.typography.families.bodyMedium }]}
                    value={name}
                  />
                  {format === 'teams' ? (
                    <Text style={[styles.teamTag, { color: C.ink, backgroundColor: index % 2 === 0 ? CORAL : CYAN, fontFamily: theme.typography.families.bodyMedium }]}>{teamLabels[index]}</Text>
                  ) : null}
                  {names.length > 2 ? (
                    <Pressable accessibilityLabel={`Remove ${name || `player ${index + 1}`}`} hitSlop={8} onPress={() => {
                      formDirty.current = true;
                      setStartError(undefined);
                      setNames((current) => current.filter((_, currentIndex) => currentIndex !== index));
                    }}>
                      <Ionicons color={C.muted} name="close" size={19} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
            {avatarSaveError ? <Pressable accessibilityRole="button" onPress={retryAvatarSave} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={[styles.avatarHint, { fontFamily: theme.typography.families.body }]}>Your character works for now. Tap to retry saving it.</Text></Pressable> : <Text style={[styles.avatarHint, { fontFamily: theme.typography.families.body }]}>Tap a face to choose your character.</Text>}
            {names.length < 4 ? (
              <Pressable accessibilityRole="button" onPress={() => {
                formDirty.current = true;
                setStartError(undefined);
                setNames((current) => [...current, '']);
              }} style={styles.addPlayer}>
                <Ionicons color={C.ink} name="add-circle-outline" size={21} />
                <Text style={[styles.addPlayerText, { color: C.ink, fontFamily: theme.typography.families.bodyMedium }]}>Room for one more</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: C.ink, fontFamily: theme.typography.families.displayHeavy }]}>Pick your side</Text>
            <View style={[styles.segment, { borderColor: C.line }]}>
              <SegmentButton active={format === 'everyone'} label="Everyone" onPress={() => {
                formDirty.current = true;
                setFormat('everyone');
              }} />
              <SegmentButton active={format === 'teams'} label="Two teams" onPress={() => {
                formDirty.current = true;
                setFormat('teams');
              }} />
            </View>
            {format === 'teams' ? (
              <Text style={[styles.teamHint, { color: C.muted, fontFamily: theme.typography.families.body }]}>Four players. Two pairs. Guess your teammate’s answers.</Text>
            ) : (
              <Text style={[styles.teamHint, { color: C.muted, fontFamily: theme.typography.families.body }]}>Guess each other. A match rewards both of you.</Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: C.ink, fontFamily: theme.typography.families.displayHeavy }]}>A little or a lot?</Text>
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
                  style={[styles.lengthKey, { backgroundColor: questionCount === count ? GOLD : C.white, borderColor: questionCount === count ? GOLD : C.line }]}
                >
                  <Text style={[styles.lengthLabel, { color: C.ink, fontFamily: theme.typography.families.bodyMedium }]}>{count === 4 ? 'Quick spin' : count === 8 ? 'Game night' : 'Encore'}</Text>
                  <Text style={[styles.lengthCount, { color: C.ink, fontFamily: theme.typography.families.displayHeavy }]}>{count} rounds</Text>
                  <Text style={[styles.lengthLabel, { color: C.muted, fontFamily: theme.typography.families.body }]}>{count === 4 ? '~5 min' : count === 8 ? '~10 min' : '~15 min'}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}><Pressable accessibilityRole="button" accessibilityState={{ expanded: showRules }} onPress={() => setShowRules((value) => !value)} style={styles.rulesToggle}><Ionicons color={C.ink} name="ribbon-outline" size={21} /><Text style={[styles.rulesLabel, { fontFamily: theme.typography.families.bodyMedium }]}>How points work</Text><Ionicons color={C.ink} name={showRules ? 'chevron-up' : 'chevron-down'} size={16} /></Pressable>{showRules ? <Text style={[styles.rulesCopy, { fontFamily: theme.typography.families.body }]}>Matches earn 2–4 points, depending on the round. Close answers can count too. In Everyone, the answer owner gets +1 for each exact match. Teams compete on their exact-match rate, not speed. For written answers, the answer owner can fairly review the score.</Text> : null}</View>

          {setupIssue ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: '#9F3129', fontFamily: theme.typography.families.body }]}>{setupIssue}</Text> : null}
          {startError ? <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: '#9F3129', fontFamily: theme.typography.families.body }]}>{startError}</Text> : null}

          <Pressable
            accessibilityHint="Builds tonight's private-answer question mix"
            accessibilityRole="button"
            accessibilityState={{ disabled: !valid || starting, busy: starting }}
            disabled={!valid || starting}
            onPress={() => void begin()}
            style={({ pressed }) => [styles.start, { backgroundColor: C.ink }, (!valid || starting) && styles.disabled, pressed && styles.pressed]}
          >
            <View>
              <Text style={[styles.startOverline, { fontFamily: theme.typography.families.bodyMedium }]}>{starting ? 'Preparing a fresh mix…' : `${cleanNames.length} people · ${questionCount} rounds · one phone`}</Text>
              <Text style={[styles.startText, { fontFamily: theme.typography.families.displayHeavy }]}>{starting ? 'Getting your game ready' : 'Let’s play'}</Text>
            </View>
            <Ionicons color={C.paper} name="arrow-forward-circle" size={36} />
          </Pressable>
          <Text style={[styles.aiNote, { color: C.muted, fontFamily: theme.typography.families.body }]}>Fresh AI prompts when connected. A ready-to-play mix offline. Your private answers stay on this phone.</Text>

          {history.length ? (
            <View style={styles.recentSection}>
              <View style={styles.recentHeader}>
                <Text style={[styles.sectionLabel, { color: C.ink, fontFamily: theme.typography.families.displayHeavy }]}>Last time together</Text>
                <Text style={[styles.recentPrivate, { color: C.muted, fontFamily: theme.typography.families.body }]}>On this phone</Text>
              </View>
              <ScrollView horizontal contentContainerStyle={styles.recentRail} showsHorizontalScrollIndicator={false}>
                {history.slice(0, 3).map((result) => {
                  const high = Math.max(0, ...result.scores.map((score) => score.points));
                  const normalizedTeamScore = result.format === 'teams' &&
                    result.scores.every((score) => score.opportunities !== undefined);
                  return (
                    <View key={result.id} style={[styles.recentCard, { backgroundColor: C.white, borderColor: C.line }]}>
                      <Text numberOfLines={1} style={[styles.recentWinner, { color: C.ink, fontFamily: theme.typography.families.bodyMedium }]}>{result.winners.length ? result.winners.join(' + ') : 'A night of discoveries'}</Text>
                      <Text style={[styles.recentScore, { color: C.ink, fontFamily: theme.typography.families.displayHeavy }]}>{normalizedTeamScore ? formatTeamRate(high) : `${high} pts`}</Text>
                      <Text style={[styles.recentMeta, { color: C.muted, fontFamily: theme.typography.families.monoMedium }]}>{recentDate(result.playedAt)} · {result.roundCount} ROUNDS</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

        </ScrollView>
      </KeyboardAvoidingView>
      <FrequencyAvatarPicker name={avatarName} onClose={() => setAvatarName(undefined)} />
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
      <Text style={[styles.segmentText, { color: active ? '#171309' : C.ink, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
    </Pressable>
  );
}

function SavedPlayers({ onChoose }: { onChoose(name: string): void }) {
  const members = useFamilyClubStore((state) => state.members);
  const { theme } = useHousewireTheme();
  if (!members.length) return null;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedRail}>{members.map((member) => <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${member.name}`} key={member.id} onPress={() => onChoose(member.name)} style={styles.savedChip}><Ionicons color={C.ink} name="add-circle-outline" size={18} /><Text style={[styles.savedName, { fontFamily: theme.typography.families.bodyMedium }]}>{member.name}</Text></Pressable>)}</ScrollView>;
}

const styles = StyleSheet.create({
  avatarButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 2 },
  avatarEdit: { position: 'absolute', bottom: -3, right: -3, width: 17, height: 17, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: C.sun, borderWidth: 1, borderColor: C.ink },
  avatarHint: { color: C.muted, fontSize: 11, lineHeight: 16 },
  addPlayer: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 6, minHeight: 44 },
  addPlayerText: { fontSize: 13 },
  aiNote: { fontSize: 12, lineHeight: 17, paddingHorizontal: 28, textAlign: 'center' },
  disabled: { opacity: 0.36 },
  error: { fontSize: 13, marginTop: -5, textAlign: 'center' },
  flex: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 8 },
  back: { alignItems: 'center', justifyContent: 'center', height: 44, width: 44 },
  phoneTag: { alignItems: 'center', flexDirection: 'row', gap: 2, justifyContent: 'center', width: 44 },
  phoneNumber: { color: C.ink, fontSize: 11, fontWeight: '700' },
  hero: { alignItems: 'center', paddingHorizontal: 24, marginTop: -14 },
  heroArt: { alignItems: 'center', height: 136, justifyContent: 'center', width: '100%' },
  familyTag: { position: 'absolute', bottom: 1, right: '5%', backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, transform: [{ rotate: '-5deg' }] },
  familyTagText: { color: C.ink, fontSize: 11 },
  heroBody: { fontSize: 15, lineHeight: 21, maxWidth: 300, textAlign: 'center' },
  heroTitle: { fontSize: 45, lineHeight: 45, marginBottom: 9, marginTop: 8, textAlign: 'center' },
  how: { flexDirection: 'row', marginHorizontal: 20, paddingVertical: 5 },
  howLabel: { fontSize: 23 },
  howStep: { alignItems: 'center', flex: 1, gap: 4 },
  stepIcon: { alignItems: 'center', borderRadius: 17, justifyContent: 'center', height: 43, width: 43 },
  stepDetail: { color: C.muted, fontSize: 10, textAlign: 'center' },
  identity: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  identityText: { fontSize: 19, letterSpacing: 0.7 },
  lengthCount: { fontSize: 25, lineHeight: 28 },
  lengthKey: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flex: 1, gap: 2, minHeight: 88, justifyContent: 'center' },
  lengthLabel: { fontSize: 11, lineHeight: 15 },
  lengthRow: { flexDirection: 'row', gap: 8 },
  nameIndex: { alignItems: 'center', borderRadius: 14, height: 36, justifyContent: 'center', width: 36 },
  nameIndexText: { fontSize: 24 },
  nameInput: { flex: 1, fontSize: 16, minHeight: 50, paddingVertical: 0 },
  nameList: { gap: 7 },
  nameRow: { alignItems: 'center', borderRadius: 19, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 59, paddingHorizontal: 10 },
  onAir: { borderRadius: 5, height: 9, width: 9 },
  page: { gap: 23, paddingBottom: 42 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.992 }] },
  resume: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 11, marginHorizontal: 20, minHeight: 67, paddingHorizontal: 15 },
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
  sectionLabel: { fontSize: 25, lineHeight: 28 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' },
  sectionNote: { color: C.muted, fontSize: 12 },
  segment: { backgroundColor: '#EDDFC8', borderRadius: 19, flexDirection: 'row', padding: 5 },
  segmentKey: { alignItems: 'center', borderRadius: 15, flex: 1, justifyContent: 'center', minHeight: 49 },
  segmentText: { fontSize: 15 },
  start: { alignItems: 'center', borderRadius: 23, flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 20, minHeight: 83, paddingHorizontal: 19 },
  startOverline: { color: C.paper, fontSize: 11, lineHeight: 17 },
  startText: { color: C.paper, fontSize: 29, lineHeight: 33 },
  teamHint: { fontSize: 12, lineHeight: 17 },
  teamTag: { fontSize: 10, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 5 },
  rulesToggle: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 44 },
  rulesLabel: { color: C.ink, flex: 1, fontSize: 13 },
  rulesCopy: { color: C.muted, fontSize: 13, lineHeight: 20 },
  savedRail: { gap: 8, paddingVertical: 3 },
  savedChip: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 12, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: C.line },
  savedName: { color: C.ink, fontSize: 13 },
});

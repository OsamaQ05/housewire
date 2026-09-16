import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { ScreenShell } from '@/src/components/ScreenShell';
import {
  currentFamilyTriviaQuestion,
  familyTriviaTeamRateBasisPoints,
  type FamilyTriviaAnswer,
  type FamilyTriviaOwnerVerdict,
  type FamilyTriviaQuestion,
  type FamilyTriviaSessionState,
} from '@/src/domain/family-trivia';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { FREQUENCY_COLORS as COLORS, FrequencyMark } from '@/src/features/trivia/FrequencyIdentity';
import { FrequencyRoundBoard } from '@/src/features/trivia/FrequencyRoundBoard';
import { FrequencyAvatar } from '@/src/features/trivia/FrequencyAvatar';
import { FrequencyCheer } from '@/src/features/trivia/FrequencyCheer';
import { FREQUENCY_SCORE_COLORS, FREQUENCY_TEAM_COLORS } from '@/src/features/trivia/frequency-scoreboard';
import { useFamilyFrequencyStore } from '@/src/store/use-family-frequency-store';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

const GOLD = COLORS.sun;
const CYAN = COLORS.teal;
const CORAL = COLORS.tangerine;

export default function TriviaPlayScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const hydrated = useFamilyFrequencyStore((state) => state.hydrated);
  const session = useFamilyFrequencyStore((state) => state.session);
  const submitReference = useFamilyFrequencyStore((state) => state.submitReference);
  const submitGuess = useFamilyFrequencyStore((state) => state.submitGuess);
  const reveal = useFamilyFrequencyStore((state) => state.reveal);
  const reviewTextGuess = useFamilyFrequencyStore((state) => state.reviewTextGuess);
  const advance = useFamilyFrequencyStore((state) => state.advance);
  const skip = useFamilyFrequencyStore((state) => state.skip);
  const clearGame = useFamilyFrequencyStore((state) => state.clearGame);
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const haptics = useHousewireStore((state) => state.settings.haptics);
  const [readyTurn, setReadyTurn] = useState<string>();
  const [choiceId, setChoiceId] = useState<string>();
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [spectrumValue, setSpectrumValue] = useState<number>();
  const [textValue, setTextValue] = useState('');
  const [revealStage, setRevealStage] = useState<{ questionId: string; step: 'answer' | 'scores' }>();
  const revealPulse = useSharedValue(0);

  const question = session ? currentFamilyTriviaQuestion(session) : undefined;
  const revealStep = revealStage?.questionId === question?.id ? revealStage?.step ?? 'gather' : 'gather';
  const questionGuesses = question && session ? session.guesses[question.id] ?? {} : {};
  const waitingIds = question
    ? question.respondentPlayerIds.filter((playerId) => questionGuesses[playerId] === undefined)
    : [];
  const actorId = session?.phase === 'reference'
    ? question?.authorityPlayerId
    : session?.phase === 'guessing'
      ? waitingIds[0]
      : undefined;
  const actor = session?.setup.players.find((player) => player.id === actorId);
  const owner = session?.setup.players.find((player) => player.id === question?.authorityPlayerId);
  const isReference = session?.phase === 'reference';
  // Readiness belongs to one person and one turn, never the following handoff.
  const turnKey = `${session?.id}:${question?.id}:${session?.phase}:${actorId}`;
  const privateReady = readyTurn === turnKey;

  useEffect(() => {
    setChoiceId(undefined);
    setOrderIds([]);
    setSpectrumValue(undefined);
    setTextValue('');
  }, [actorId, question?.id, session?.phase]);

  const sessionPhase = session?.phase;
  const sessionQuestionIndex = session?.questionIndex;

  useEffect(() => {
    if (sessionPhase !== 'revealed' || revealStep !== 'answer') return;
    revealPulse.value = 0;
    revealPulse.value = reducedMotion ? 1 : withSpring(1, { damping: 10, stiffness: 95 });
  }, [reducedMotion, revealPulse, sessionPhase, sessionQuestionIndex, revealStep]);

  const requestExit = useCallback(() => {
    if (!session) {
      router.back();
      return;
    }
    if (Platform.OS === 'web') {
      router.replace('/modes');
      return;
    }
    Alert.alert(
      'Pause your game?',
      'This round is saved on this phone. You can resume it from Family Frequency.',
      [
        { text: 'Keep playing', style: 'cancel' },
        { text: 'Leave for now', onPress: () => router.replace('/modes') },
        {
          text: 'End game',
          style: 'destructive',
          onPress: () => {
            clearGame();
            router.replace('/modes');
          },
        },
      ],
    );
  }, [clearGame, router, session]);

  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      requestExit();
      return true;
    });
    return () => listener.remove();
  }, [requestExit]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0.18, revealPulse.value),
    transform: [{ scale: 0.9 + revealPulse.value * 0.1 }],
  }));

  const scores = useMemo(() => {
    if (!session) return [];
    if (session.setup.teams.length) {
      return session.teamScores.map((score, index) => ({
        id: score.teamId,
        color: FREQUENCY_TEAM_COLORS[index % FREQUENCY_TEAM_COLORS.length],
        percentage: true,
        label: session.setup.teams.find((team) => team.id === score.teamId)?.name ?? score.teamId,
        points: familyTriviaTeamRateBasisPoints(score),
      }));
    }
    return session.playerScores.map((score, index) => ({
      id: score.playerId,
      color: FREQUENCY_SCORE_COLORS[index % FREQUENCY_SCORE_COLORS.length],
      percentage: false,
      label: session.setup.players.find((player) => player.id === score.playerId)?.name ?? score.playerId,
      points: score.points,
    }));
  }, [session]);

  if (!hydrated) {
    return (
      <ScreenShell texture={false}>
        <View style={styles.missing}>
          <Ionicons color={CYAN} name="radio-outline" size={38} />
          <Text style={[styles.missingTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>Getting your game ready</Text>
        </View>
      </ScreenShell>
    );
  }

  if (session?.phase === 'complete') {
    return (
      <ScreenShell texture={false}>
        <View style={styles.missing}>
          <Ionicons color={GOLD} name="podium-outline" size={38} />
          <Text style={[styles.missingTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>That was the last round</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/trivia-results')} style={[styles.smallButton, { borderColor: GOLD }]}>
            <Text style={[styles.smallButtonText, { color: GOLD, fontFamily: theme.typography.families.bodyMedium }]}>See the final board</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  if (!session || !question) {
    return (
      <ScreenShell texture={false}>
        <View style={styles.missing}>
          <Ionicons color={GOLD} name="radio-outline" size={38} />
          <Text style={[styles.missingTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>Start a game first</Text>
          <Pressable onPress={() => router.replace('/trivia-setup')} style={[styles.smallButton, { borderColor: GOLD }]}>
            <Text style={[styles.smallButtonText, { color: GOLD, fontFamily: theme.typography.families.bodyMedium }]}>Set up a round</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  const submit = () => {
    if (!actorId) return;
    const answer = draftFamilyTriviaAnswer(question, { choiceId, orderIds, spectrumValue, textValue });
    if (!answer) return;
    const accepted = isReference
      ? submitReference(actorId, answer)
      : submitGuess(actorId, answer);
    if (!accepted) return;
    if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    play('switch', 0.34);
    if (!isReference) {
      const latest = useFamilyFrequencyStore.getState().session;
      const latestQuestion = latest ? currentFamilyTriviaQuestion(latest) : undefined;
      const latestGuesses = latest && latestQuestion ? latest.guesses[latestQuestion.id] ?? {} : {};
      if (latestQuestion?.respondentPlayerIds.every((playerId) => latestGuesses[playerId] !== undefined)) {
        reveal();
      }
    }
  };

  const showReveal = () => {
    setRevealStage({ questionId: question.id, step: 'answer' });
    play('accept', 0.45);
    if (haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const next = () => {
    const final = session.questionIndex >= session.pack.questions.length - 1;
    if (!advance()) return;
    play(final ? 'complete' : 'relay', final ? 0.72 : 0.38);
    if (final) router.replace('/trivia-results');
  };

  const skipRound = () => {
    if (!actorId) return;
    const final = session.questionIndex >= session.pack.questions.length - 1;
    if (!skip(actorId)) return;
    play(final ? 'complete' : 'relay', final ? 0.55 : 0.3);
    if (final) router.replace('/trivia-results');
  };

  const reference = session.referenceAnswers[question.id];
  const latestResult = session.results.at(-1);
  const matches = latestResult?.playerPoints.filter((result) => result.exact).map((result) =>
    session.setup.players.find((player) => player.id === result.playerId)?.name ?? result.playerId,
  ) ?? [];
  const closeReads = latestResult?.playerPoints.filter((result) => !result.exact && result.points > 0).map((result) =>
    session.setup.players.find((player) => player.id === result.playerId)?.name ?? result.playerId,
  ) ?? [];
  const canLock = Boolean(draftFamilyTriviaAnswer(question, { choiceId, orderIds, spectrumValue, textValue }));

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <View style={[styles.top, { borderBottomColor: theme.colors.draft }]}>
        <View>
          <Text style={[styles.topLabel, { color: GOLD, fontFamily: theme.typography.families.bodyMedium }]}>Family Frequency</Text>
          <Text style={[styles.round, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>Round {session.questionIndex + 1}<Text style={{ color: theme.colors.faint }}> / {session.pack.questions.length}</Text></Text>
        </View>
        <View style={styles.scoreRail}>
          {session.phase === 'revealed' ? (
            <Text style={[styles.gatherHeader, { color: CYAN, fontFamily: theme.typography.families.bodyMedium }]}>{revealStep === 'scores' ? 'Round results' : 'Everyone look!'}</Text>
          ) : scores.map((score) => (
            <View key={score.id} style={styles.scoreItem}>
              <View style={[styles.scoreLamp, { backgroundColor: score.color }]} />
              <Text numberOfLines={1} style={[styles.scoreName, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{score.label}</Text>
              <Text style={[styles.scorePoints, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{score.percentage ? formatTeamRate(score.points) : score.points}</Text>
            </View>
          ))}
        </View>
        <Pressable accessibilityLabel="Leave Family Frequency" accessibilityRole="button" hitSlop={8} onPress={requestExit} style={styles.exitButton}>
          <Ionicons color={theme.colors.faint} name="close" size={21} />
        </Pressable>
      </View>
      <View accessible accessibilityLabel={`Round ${session.questionIndex + 1} of ${session.pack.questions.length}`} style={styles.roundTrack}>
        {session.pack.questions.map((round, index) => (
          <View key={round.id} style={[styles.roundSegment, { backgroundColor: index < session.questionIndex ? CYAN : index === session.questionIndex ? GOLD : theme.colors.draft }]} />
        ))}
      </View>

      {session.phase === 'revealed' ? (
        revealStep === 'gather' ? (
          <ScrollView contentContainerStyle={styles.gatherPage} showsVerticalScrollIndicator={false}>
            <FrequencyMark size={146} />
            <View style={styles.sealedTicket}>
              <View style={styles.ticketStamp}><Ionicons color={COLORS.ink} name="checkmark-done" size={24} /></View>
              <Text style={[styles.ticketKicker, { fontFamily: theme.typography.families.bodyMedium }]}>ALL GUESSES IN</Text>
              <Text style={[styles.gatherTitle, { fontFamily: theme.typography.families.displayHeavy }]}>On the same wavelength?</Text>
              <View style={styles.playerTokens}>
                {session.setup.players.filter((player) => player.id === question.authorityPlayerId || question.respondentPlayerIds.includes(player.id)).map((player) => (
                  <View key={player.id} style={[styles.playerToken, { backgroundColor: session.setup.teams.length ? FREQUENCY_TEAM_COLORS[session.setup.teams.findIndex((team) => team.memberPlayerIds.includes(player.id))] : FREQUENCY_SCORE_COLORS[session.setup.players.findIndex((candidate) => candidate.id === player.id)] }]}>
                    <FrequencyAvatar name={player.name} size={48} />
                  </View>
                ))}
              </View>
              <Text style={[styles.ticketHint, { fontFamily: theme.typography.families.body }]}>Put the phone where everyone can see.</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={showReveal} style={({ pressed }) => [styles.revealTogether, pressed && styles.pressed]}>
              <Text style={[styles.nextButtonText, { fontFamily: theme.typography.families.displayHeavy }]}>Reveal together</Text>
              <Ionicons color={COLORS.ink} name="radio-outline" size={24} />
            </Pressable>
            <Text style={[styles.gatherFootnote, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>No timer. Enjoy the reveal.</Text>
          </ScrollView>
        ) : revealStep === 'scores' ? (
          <ScrollView key={`scores-${question.id}`} style={{ backgroundColor: COLORS.paper }} contentContainerStyle={styles.playPage} showsVerticalScrollIndicator={false}>
            <Pressable accessibilityRole="button" onPress={() => setRevealStage({ questionId: question.id, step: 'answer' })} style={styles.backToAnswers}>
              <Ionicons color={COLORS.ink} name="arrow-back" size={18} />
              <Text style={[styles.backToAnswersText, { color: COLORS.ink, fontFamily: theme.typography.families.bodyMedium }]}>Back to answers</Text>
            </Pressable>
            <FrequencyRoundBoard session={session} reducedMotion={reducedMotion} onNext={next} nextLabel={session.questionIndex === session.pack.questions.length - 1 ? 'See final scores' : 'Next round'} />
          </ScrollView>
        ) : (
        <ScrollView key={`answer-${question.id}`} contentContainerStyle={styles.playPage} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.revealHero, revealStyle]}>
            <View style={styles.ticketAnswerMeta}>
              <FrequencyAvatar name={owner?.name ?? 'Player'} size={52} mood="happy" />
              <Text style={[styles.revealKicker, { color: COLORS.muted, fontFamily: theme.typography.families.bodyMedium }]}>{`${owner?.name ?? 'Player'}'s answer`}</Text>
            </View>
            <Text style={[styles.revealTitle, question.answerKind === 'ordering' && styles.revealOrder, { color: COLORS.ink, fontFamily: theme.typography.families.displayHeavy }]}>{answerLabel(question, reference)}</Text>
            <View style={styles.ticketPerforation} />
            <Text style={[styles.revealOwner, { color: COLORS.ink, fontFamily: theme.typography.families.bodyMedium }]}>{matches.length === question.respondentPlayerIds.length ? 'Everyone got it!' : matches.length ? 'You know them well.' : closeReads.length ? 'So close!' : 'Well, now you know!'}</Text>
          </Animated.View>

          <View style={[styles.matchStrip, { borderColor: theme.colors.draft }]}>
            <Text style={[styles.matchLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.bodyMedium }]}>Who guessed it?</Text>
            <Text style={[styles.matchNames, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{matches.length ? matches.join(' · ') : closeReads.length ? `${closeReads.join(' · ')} came close` : 'No exact match this round'}</Text>
          </View>

          <RevealReadouts question={question} session={session} />

          {question.answerKind === 'text' ? (
            <OwnerReviewPanel
              onReview={(playerId, verdict) => {
                if (!reviewTextGuess(playerId, verdict)) return;
                play('switch', 0.28);
                if (haptics) void Haptics.selectionAsync().catch(() => undefined);
              }}
              question={question}
              session={session}
            />
          ) : null}

          <Pressable accessibilityRole="button" onPress={() => { setRevealStage({ questionId: question.id, step: 'scores' }); play('relay', 0.35); }} style={({ pressed }) => [styles.nextButton, { backgroundColor: GOLD }, pressed && styles.pressed]}>
            <Text style={[styles.nextButtonText, { fontFamily: theme.typography.families.displayHeavy }]}>See round scores</Text>
            <Ionicons color="#171309" name="podium-outline" size={22} />
          </Pressable>
        </ScrollView>
        )
      ) : !privateReady ? (
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(220)} exiting={reducedMotion ? undefined : FadeOut.duration(160)} style={styles.handoff}>
          <View style={styles.handoffRadio}><FrequencyCheer key={turnKey} name={actor?.name ?? 'Player'} size={140} reducedMotion={reducedMotion} /></View>
          <Text style={[styles.handoffKicker, { color: isReference ? GOLD : CYAN, fontFamily: theme.typography.families.bodyMedium }]}>{isReference ? 'A secret for now' : `Your turn to guess ${owner?.name ?? 'their answer'}`}</Text>
          <Text style={[styles.handoffTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>Pass the phone to {actor?.name}</Text>
          <Text style={[styles.handoffBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{isReference
            ? session.setup.teams.length
              ? 'Answer honestly. Your teammate will try to match you.'
              : 'Answer honestly before anyone guesses. A correct guess gives both of you points.'
            : 'Keep the screen hidden until they have the phone.'}</Text>
          <Pressable accessibilityRole="button" onPress={() => setReadyTurn(turnKey)} style={({ pressed }) => [styles.readyButton, { borderColor: isReference ? GOLD : CYAN }, pressed && styles.pressed]}>
            <Ionicons color={isReference ? GOLD : CYAN} name="checkmark-circle-outline" size={22} />
            <Text style={[styles.readyText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>I&apos;m {actor?.name} — ready!</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
          style={styles.keyboardLayer}
        >
        <ScrollView
          contentContainerStyle={styles.playPage}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(320)} style={styles.questionBlock}>
            <View style={styles.questionMeta}>
              <Text style={[styles.questionRole, { color: COLORS.ink, fontFamily: theme.typography.families.bodyMedium }]}>{isReference ? 'Your honest answer' : `What would ${owner?.name ?? 'they'} answer?`}</Text>
              <Text style={[styles.questionKind, { color: COLORS.muted, fontFamily: theme.typography.families.body }]}>{roundKindLabel(question)}</Text>
            </View>
            <Text style={[styles.question, { color: COLORS.ink, fontFamily: theme.typography.families.displayHeavy }]}>{question.prompt}</Text>
          </Animated.View>

          {question.answerKind === 'choice' ? (
            <View accessibilityRole="radiogroup" style={styles.optionList}>
              {question.options.map((option, index) => {
                const selected = choiceId === option.id;
                const optionColor = [CORAL, GOLD, CYAN, COLORS.sky][index] ?? GOLD;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    key={option.id}
                    onPress={() => {
                      setChoiceId(option.id);
                      if (haptics) void Haptics.selectionAsync().catch(() => undefined);
                    }}
                    style={({ pressed }) => [styles.option, { backgroundColor: selected ? optionColor : `${optionColor}1F`, borderColor: optionColor }, pressed && styles.pressed]}
                  >
                    <Text style={[styles.optionIndex, { color: selected ? '#171309' : theme.colors.faint, fontFamily: theme.typography.families.displayHeavy }]}>{String.fromCharCode(65 + index)}</Text>
                    <Text style={[styles.optionText, { color: selected ? '#171309' : theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{option.label}</Text>
                    <View style={[styles.optionSocket, { borderColor: selected ? '#171309' : optionColor }, selected && { backgroundColor: '#171309' }]}>{selected ? <Ionicons color={optionColor} name="checkmark" size={15} /> : null}</View>
                  </Pressable>
                );
              })}
            </View>
          ) : question.answerKind === 'ordering' ? (
            <OrderingBoard onChange={setOrderIds} question={question} selectedIds={orderIds} />
          ) : question.answerKind === 'spectrum' ? (
            <SpectrumDial onChange={setSpectrumValue} question={question} value={spectrumValue} />
          ) : (
            <View style={styles.wordBoard}>
              <View style={[styles.wordBeacon, { borderColor: textValue.trim() ? (isReference ? GOLD : CYAN) : theme.colors.draft }]}>
                <Ionicons color={isReference ? GOLD : CYAN} name="radio" size={20} />
                <TextInput
                  accessibilityLabel={question.inputHint}
                  autoCapitalize="words"
                  autoCorrect
                  maxLength={question.maxLength}
                  onChangeText={setTextValue}
                  onSubmitEditing={submit}
                  placeholder={question.inputHint}
                  placeholderTextColor={theme.colors.faint}
                  returnKeyType="done"
                  submitBehavior="blurAndSubmit"
                  style={[styles.wordInput, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}
                  value={textValue}
                />
              </View>
              <Text style={[styles.wordPrivacy, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>Checked on this phone. Your answer is not sent to AI.</Text>
            </View>
          )}

          <View style={styles.lockArea}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canLock }}
              disabled={!canLock}
              onPress={submit}
              style={({ pressed }) => [styles.lockButton, { backgroundColor: isReference ? GOLD : CYAN }, !canLock && styles.disabled, pressed && styles.pressed]}
            >
              <Ionicons color="#171309" name="lock-closed" size={20} />
              <Text style={[styles.lockText, { fontFamily: theme.typography.families.displayHeavy }]}>{isReference ? 'Save my answer' : 'Save my guess'}</Text>
            </Pressable>
            {isReference && question.canSkip ? (
              <View style={styles.voidArea}>
                <Pressable accessibilityHint="Moves on without recording an answer or score" accessibilityRole="button" onPress={skipRound} style={({ pressed }) => [styles.skipButton, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
                  <Ionicons color={theme.colors.faint} name="play-skip-forward-outline" size={16} />
                  <Text style={[styles.skipText, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>This question does not fit us</Text>
                </Pressable>
                {session.setup.teams.length ? (
                  <Text style={[styles.voidNote, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>No points or attempts are counted.</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </ScrollView>
        </KeyboardAvoidingView>
      )}
    </ScreenShell>
  );
}

interface AnswerDraft {
  choiceId?: string;
  orderIds: readonly string[];
  spectrumValue?: number;
  textValue: string;
}

function draftFamilyTriviaAnswer(
  question: FamilyTriviaQuestion,
  draft: AnswerDraft,
): FamilyTriviaAnswer | undefined {
  switch (question.answerKind) {
    case 'choice':
      return draft.choiceId ? { kind: 'choice', optionId: draft.choiceId } : undefined;
    case 'ordering':
      return draft.orderIds.length === question.options.length
        ? { kind: 'ordering', optionIds: draft.orderIds }
        : undefined;
    case 'spectrum':
      return draft.spectrumValue === undefined
        ? undefined
        : { kind: 'spectrum', value: draft.spectrumValue };
    case 'text': {
      const value = draft.textValue.trim();
      return value ? { kind: 'text', value } : undefined;
    }
  }
}

function SpectrumDial({
  onChange,
  question,
  value,
}: {
  onChange(value: number): void;
  question: Extract<FamilyTriviaQuestion, { answerKind: 'spectrum' }>;
  value?: number;
}) {
  const { theme } = useHousewireTheme();
  const [trackWidth, setTrackWidth] = useState(1);
  const displayValue = value ?? 50;
  const changeFromTouch = (event: GestureResponderEvent) => {
    const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / trackWidth));
    const raw = question.scale.min + ratio * (question.scale.max - question.scale.min);
    const stepped = Math.round(raw / question.scale.step) * question.scale.step;
    onChange(Math.max(question.scale.min, Math.min(question.scale.max, stepped)));
  };
  const nudge = (direction: -1 | 1) => {
    const next = Math.max(question.scale.min, Math.min(question.scale.max, displayValue + question.scale.step * direction));
    onChange(next);
  };
  return (
    <View style={styles.spectrumBoard}>
      <View style={styles.dialReadout}>
        <Text style={[styles.dialValue, { color: value === undefined ? theme.colors.faint : CYAN, fontFamily: theme.typography.families.displayHeavy }]}>{value ?? '—'}</Text>
        <Text style={[styles.dialUnit, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>/ 100</Text>
      </View>
      <View
        accessibilityActions={[{ name: 'decrement', label: 'Decrease' }, { name: 'increment', label: 'Increase' }]}
        accessibilityLabel={`Spectrum from ${question.scale.minLabel} to ${question.scale.maxLabel}`}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: 100, now: value, text: value === undefined ? 'Not set' : String(value) }}
        onAccessibilityAction={(event) => nudge(event.nativeEvent.actionName === 'decrement' ? -1 : 1)}
        onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={changeFromTouch}
        onResponderMove={changeFromTouch}
        onStartShouldSetResponder={() => true}
        style={styles.dialTouch}
      >
        <View style={[styles.dialRail, { backgroundColor: theme.colors.draft }]} />
        <View style={[styles.dialFill, { backgroundColor: CYAN, width: `${displayValue}%` }]} />
        <View style={[styles.dialKnob, { backgroundColor: value === undefined ? theme.colors.faint : CYAN, left: `${displayValue}%` }]}>
          <View style={styles.dialKnobCore} />
        </View>
        {[0, 25, 50, 75, 100].map((tick) => <View key={tick} style={[styles.dialTick, { backgroundColor: theme.colors.background, left: `${tick}%` }]} />)}
      </View>
      <View style={styles.dialAnchors}>
        <Text style={[styles.dialAnchor, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{question.scale.minLabel}</Text>
        <Text style={[styles.dialAnchor, styles.dialAnchorRight, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{question.scale.maxLabel}</Text>
      </View>
      <Text style={[styles.dialHelp, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>Tap or drag. Within 5 is exact; within 15 is close.</Text>
    </View>
  );
}

function RevealReadouts({ question, session }: { question: FamilyTriviaQuestion; session: FamilyTriviaSessionState }) {
  const { theme } = useHousewireTheme();
  const result = session.results.at(-1);
  if (!result?.playerPoints.length) return null;
  return (
    <View style={styles.readoutList}>
      {result.playerPoints.map((entry) => {
        const player = session.setup.players.find((candidate) => candidate.id === entry.playerId);
        const guess = session.guesses[question.id]?.[entry.playerId];
        return (
          <View key={entry.playerId} style={[styles.readoutRow, { borderColor: theme.colors.draft }]}>
            <View style={styles.readoutCopy}>
              <Text style={[styles.readoutName, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>{player?.name?.toUpperCase()}</Text>
              <Text style={[styles.readoutAnswer, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{answerLabel(question, guess)}</Text>
            </View>
            <Text style={[styles.readoutPoints, { color: entry.exact ? CYAN : entry.points ? GOLD : CORAL, fontFamily: theme.typography.families.displayHeavy }]}>{entry.exact ? 'Exact' : entry.points ? 'Close' : 'Different'}{session.setup.teams.length ? '' : ` · +${entry.points}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

function OwnerReviewPanel({
  onReview,
  question,
  session,
}: {
  onReview(playerId: string, verdict: FamilyTriviaOwnerVerdict): void;
  question: Extract<FamilyTriviaQuestion, { answerKind: 'text' }>;
  session: FamilyTriviaSessionState;
}) {
  const { theme } = useHousewireTheme();
  const owner = session.setup.players.find((player) => player.id === question.authorityPlayerId);
  const result = session.results.at(-1);
  if (!result || result.questionId !== question.id) return null;
  const verdicts: readonly { color: string; label: string; value: FamilyTriviaOwnerVerdict }[] = [
    { color: CYAN, label: 'Exact', value: 'exact' },
    { color: GOLD, label: 'Close', value: 'close' },
    { color: CORAL, label: 'Miss', value: 'miss' },
  ];
  return (
    <View style={[styles.ownerReview, { backgroundColor: theme.colors.surface, borderColor: theme.colors.draft }]}>
      <View style={styles.ownerReviewHeader}>
        <View style={[styles.ownerReviewSeal, { backgroundColor: GOLD }]}>
          <Ionicons color="#171309" name="shield-checkmark" size={18} />
        </View>
        <View style={styles.ownerReviewCopy}>
          <Text style={[styles.ownerReviewKicker, { color: GOLD, fontFamily: theme.typography.families.bodyMedium }]}>Final say</Text>
          <Text style={[styles.ownerReviewTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{owner?.name ?? 'Answer owner'}, check the guesses</Text>
        </View>
      </View>
      <Text style={[styles.ownerReviewHelp, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Same meaning, different words? You have the final say. Scores update straight away.</Text>
      {result.playerPoints.map((entry) => {
        const player = session.setup.players.find((candidate) => candidate.id === entry.playerId);
        const selected: FamilyTriviaOwnerVerdict | undefined = entry.authorityReviewed
          ? entry.exact ? 'exact' : entry.points > 0 ? 'close' : 'miss'
          : undefined;
        return (
          <View key={entry.playerId} style={[styles.ownerReviewRow, { borderTopColor: theme.colors.draft }]}>
            <View style={styles.ownerReviewAnswerLine}>
              <Text style={[styles.ownerReviewName, { color: theme.colors.faint, fontFamily: theme.typography.families.bodyMedium }]}>{player?.name}</Text>
              <Text numberOfLines={2} style={[styles.ownerReviewAnswer, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{answerLabel(question, session.guesses[question.id]?.[entry.playerId])}</Text>
              <Text style={[styles.ownerReviewStatus, { color: entry.authorityReviewed ? CYAN : theme.colors.faint, fontFamily: theme.typography.families.body }]}>{entry.authorityReviewed ? 'Checked' : 'Suggested'}</Text>
            </View>
            <View style={styles.ownerVerdicts}>
              {verdicts.map((verdict) => {
                const isSelected = selected === verdict.value;
                return (
                  <Pressable
                    accessibilityLabel={`Score ${player?.name ?? 'this guess'} as ${verdict.label.toLowerCase()}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    key={verdict.value}
                    onPress={() => onReview(entry.playerId, verdict.value)}
                    style={({ pressed }) => [
                      styles.ownerVerdict,
                      { borderColor: isSelected ? verdict.color : theme.colors.draft },
                      isSelected && { backgroundColor: `${verdict.color}22` },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.ownerVerdictDot, { backgroundColor: verdict.color }]} />
                    <Text style={[styles.ownerVerdictText, { color: isSelected ? verdict.color : theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{verdict.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function OrderingBoard({ onChange, question, selectedIds }: { onChange(ids: string[]): void; question: FamilyTriviaQuestion; selectedIds: string[] }) {
  const { theme } = useHousewireTheme();
  const remaining = question.options.filter((option) => !selectedIds.includes(option.id));
  return (
    <View style={styles.orderBoard}>
      <Text style={[styles.orderHelp, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Tap from first to last.</Text>
      {selectedIds.length ? (
        <View style={styles.orderTrack}>
          {selectedIds.map((id, index) => {
            const option = question.options.find((candidate) => candidate.id === id);
            return (
              <Pressable
                accessibilityHint="Removes this choice and every choice after it"
                accessibilityLabel={`${index + 1}. ${option?.label ?? 'Selected choice'}`}
                accessibilityRole="button"
                key={id}
                onPress={() => onChange(selectedIds.slice(0, index))}
                style={[styles.orderLocked, { borderColor: GOLD }]}
              >
                <Text style={[styles.orderNumber, { color: GOLD, fontFamily: theme.typography.families.displayHeavy }]}>{index + 1}</Text>
                <Text style={[styles.orderText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{option?.label}</Text>
                <Ionicons color={theme.colors.faint} name="return-up-back" size={16} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={styles.remainingGrid}>
        {remaining.map((option) => (
          <Pressable accessibilityLabel={`Add ${option.label} next`} accessibilityRole="button" key={option.id} onPress={() => onChange([...selectedIds, option.id])} style={[styles.remainingOption, { backgroundColor: theme.colors.surface, borderColor: theme.colors.draft }]}>
            <Ionicons color={CYAN} name="add-circle-outline" size={19} />
            <Text style={[styles.remainingText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function answerLabel(question: FamilyTriviaQuestion, answer?: FamilyTriviaAnswer): string {
  if (!answer) return 'NO ANSWER';
  if (answer.kind === 'choice') return question.options.find((option) => option.id === answer.optionId)?.label.toUpperCase() ?? 'UNKNOWN';
  if (answer.kind === 'ordering') {
    return answer.optionIds
      .map((id, index) => `${index + 1}. ${question.options.find((option) => option.id === id)?.label ?? ''}`)
      .join('\n')
      .toUpperCase();
  }
  if (answer.kind === 'spectrum') return `${answer.value} / 100`;
  return answer.value.toUpperCase();
}

function formatTeamRate(points: number): string {
  const percent = points / 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
}

function roundKindLabel(question: FamilyTriviaQuestion): string {
  switch (question.kind) {
    case 'preference-match': return 'Quick choice';
    case 'who-knows-who': return 'One person in focus';
    case 'shared-memory-detail': return 'Shared memory';
    case 'family-lore-ordering': return 'Put it in order';
    case 'spectrum-read': return 'Move the dial';
    case 'same-wavelength': return 'Write your own answer';
  }
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.32 },
  dialAnchor: { flex: 1, fontSize: 13, lineHeight: 17 },
  dialAnchorRight: { textAlign: 'right' },
  dialAnchors: { flexDirection: 'row', gap: 24 },
  dialFill: { borderRadius: 4, height: 6, left: 0, position: 'absolute' },
  dialHelp: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  dialKnob: { alignItems: 'center', borderRadius: 17, height: 34, justifyContent: 'center', marginLeft: -17, position: 'absolute', width: 34 },
  dialKnobCore: { backgroundColor: '#171309', borderRadius: 5, height: 10, width: 10 },
  dialRail: { borderRadius: 4, height: 6, left: 0, position: 'absolute', right: 0 },
  dialReadout: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'center' },
  dialTick: { height: 12, marginLeft: -1, position: 'absolute', width: 2 },
  dialTouch: { height: 54, justifyContent: 'center', marginHorizontal: 4 },
  dialUnit: { fontSize: 12, letterSpacing: 0.8, marginLeft: 6 },
  dialValue: { fontSize: 62, lineHeight: 64 },
  exitButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  handoff: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: 44, paddingHorizontal: 28 },
  handoffBody: { fontSize: 15, lineHeight: 21, maxWidth: 320, textAlign: 'center' },
  handoffKicker: { fontSize: 13, lineHeight: 18, marginTop: 23 },
  handoffRadio: { alignItems: 'center', backgroundColor: COLORS.paper, borderRadius: 85, height: 170, justifyContent: 'center', width: 170, transform: [{ rotate: '-5deg' }] },
  handoffTitle: { fontSize: 40, lineHeight: 42, marginTop: 7, textAlign: 'center' },
  keyboardLayer: { flex: 1 },
  lockArea: { gap: 8, paddingTop: 4 },
  lockButton: { alignItems: 'center', borderRadius: 17, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 66 },
  lockText: { color: '#171309', fontSize: 21 },
  matchLabel: { fontSize: 13, lineHeight: 17 },
  matchNames: { fontSize: 16, lineHeight: 21 },
  matchStrip: { borderRadius: 14, borderWidth: 1, gap: 4, paddingHorizontal: 14, paddingVertical: 14 },
  missing: { alignItems: 'center', flex: 1, gap: 14, justifyContent: 'center' },
  missingTitle: { fontSize: 36 },
  nextButton: { alignItems: 'center', borderRadius: 17, flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, minHeight: 66, paddingHorizontal: 17 },
  nextButtonText: { color: '#171309', fontSize: 21 },
  option: { alignItems: 'center', borderRadius: 16, borderWidth: 2, borderBottomWidth: 5, flexDirection: 'row', gap: 12, minHeight: 72, paddingHorizontal: 14, paddingVertical: 12 },
  optionIndex: { fontSize: 26, width: 23 },
  optionList: { gap: 8 },
  optionSocket: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 2, height: 24, width: 24 },
  optionText: { flex: 1, fontSize: 15, lineHeight: 20 },
  ownerReview: { borderRadius: 18, borderWidth: 1, gap: 12, padding: 14 },
  ownerReviewAnswer: { flex: 1, fontSize: 15, lineHeight: 19 },
  ownerReviewAnswerLine: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  ownerReviewCopy: { flex: 1, gap: 2 },
  ownerReviewHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  ownerReviewHelp: { fontSize: 13, lineHeight: 18 },
  ownerReviewKicker: { fontSize: 12, lineHeight: 16 },
  ownerReviewName: { fontSize: 12, width: 54 },
  ownerReviewRow: { borderTopWidth: 1, gap: 9, paddingTop: 12 },
  ownerReviewSeal: { alignItems: 'center', borderRadius: 10, height: 34, justifyContent: 'center', width: 34 },
  ownerReviewStatus: { fontSize: 11 },
  ownerReviewTitle: { fontSize: 20, lineHeight: 23 },
  ownerVerdict: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 44 },
  ownerVerdictDot: { borderRadius: 3, height: 6, width: 6 },
  ownerVerdicts: { flexDirection: 'row', gap: 6 },
  ownerVerdictText: { fontSize: 12 },
  orderBoard: { gap: 9 },
  orderHelp: { fontSize: 13 },
  orderLocked: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 54, paddingHorizontal: 11 },
  orderNumber: { fontSize: 25, width: 22 },
  orderText: { flex: 1, fontSize: 14, lineHeight: 19 },
  orderTrack: { gap: 5 },
  playPage: { flexGrow: 1, gap: 18, paddingBottom: 32, paddingHorizontal: 20, paddingTop: 21 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.993 }] },
  question: { fontSize: 28, lineHeight: 32 },
  questionBlock: { backgroundColor: COLORS.paper, borderRadius: 22, borderBottomWidth: 5, borderColor: COLORS.line, gap: 16, padding: 20 },
  questionKind: { fontSize: 12 },
  questionMeta: { gap: 4 },
  questionRole: { fontSize: 13, lineHeight: 18 },
  readyButton: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: 22, minHeight: 58, paddingHorizontal: 24 },
  readyText: { fontSize: 16 },
  readoutAnswer: { fontSize: 15, lineHeight: 19 },
  readoutCopy: { flex: 1, gap: 2 },
  readoutList: { gap: 7 },
  readoutName: { fontSize: 11 },
  readoutPoints: { fontSize: 16 },
  readoutRow: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 58, paddingHorizontal: 12, paddingVertical: 8 },
  remainingGrid: { gap: 7 },
  remainingOption: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 9, minHeight: 51, paddingHorizontal: 11 },
  remainingText: { flex: 1, fontSize: 13, lineHeight: 18 },
  revealHero: { backgroundColor: COLORS.paper, borderRadius: 24, borderBottomWidth: 6, borderColor: COLORS.line, alignItems: 'center', gap: 10, padding: 22 },
  revealKicker: { fontSize: 14, lineHeight: 19, marginTop: 7 },
  revealOwner: { fontSize: 14, marginTop: 4 },
  revealTitle: { fontSize: 40, lineHeight: 41, maxWidth: 360, textAlign: 'center' },
  revealOrder: { alignSelf: 'stretch', fontSize: 25, lineHeight: 31, textAlign: 'left' },
  round: { fontSize: 23, lineHeight: 23 },
  scoreItem: { alignItems: 'center', flexDirection: 'row', gap: 4, maxWidth: 92 },
  scoreLamp: { borderRadius: 4, height: 7, width: 7 },
  scoreName: { flexShrink: 1, fontSize: 10, letterSpacing: 0.4 },
  scorePoints: { fontSize: 17 },
  scoreRail: { alignItems: 'center', flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'flex-end' },
  spectrumBoard: { gap: 8, paddingHorizontal: 5, paddingVertical: 6 },
  skipButton: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 44 },
  skipText: { fontSize: 12 },
  smallButton: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 12 },
  smallButtonText: { fontSize: 15 },
  top: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 76, paddingHorizontal: 20 },
  topLabel: { fontSize: 12 },
  wordBeacon: { alignItems: 'center', borderRadius: 16, borderWidth: 2, flexDirection: 'row', gap: 10, minHeight: 74, paddingHorizontal: 12 },
  wordBoard: { gap: 10, paddingTop: 6 },
  wordInput: { flex: 1, fontSize: 23, minHeight: 68, paddingVertical: 10 },
  wordPrivacy: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  voidArea: { gap: 3 },
  voidNote: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  backToAnswers: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 8, minHeight: 44 },
  backToAnswersText: { fontSize: 14 },
  gatherHeader: { fontSize: 13 },
  gatherPage: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  gatherTitle: { color: COLORS.ink, fontSize: 42, lineHeight: 44, textAlign: 'center' },
  gatherFootnote: { fontSize: 12 },
  sealedTicket: { alignItems: 'center', backgroundColor: COLORS.paper, borderRadius: 24, borderBottomWidth: 6, borderColor: COLORS.line, gap: 18, padding: 24, width: '100%', maxWidth: 430 },
  ticketStamp: { backgroundColor: CYAN, borderRadius: 18, padding: 8 },
  ticketKicker: { color: COLORS.muted, fontSize: 11, letterSpacing: 2 },
  ticketHint: { color: COLORS.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  ticketAnswerMeta: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  ticketPerforation: { alignSelf: 'stretch', borderTopWidth: 1, borderStyle: 'dashed', borderColor: COLORS.line, marginTop: 10 },
  playerTokens: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  playerToken: { alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderWidth: 2, borderBottomWidth: 5, borderColor: COLORS.ink, borderRadius: 19 },
  revealTogether: { alignItems: 'center', backgroundColor: GOLD, flexDirection: 'row', justifyContent: 'center', gap: 12, borderRadius: 18, borderBottomWidth: 5, borderColor: '#BC8A22', minHeight: 66, width: '100%', maxWidth: 430 },
  roundTrack: { flexDirection: 'row', gap: 5, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  roundSegment: { flex: 1, borderRadius: 4, height: 6 },
});

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  interpolate,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { FamilyTriviaSessionState } from '@/src/domain/family-trivia';
import { typography } from '@/src/theme';

import { FrequencyAvatar } from './FrequencyAvatar';
import { FREQUENCY_COLORS as color } from './FrequencyIdentity';
import {
  FREQUENCY_RANK_REVEAL_MS,
  FREQUENCY_RANK_SLIDE_MS,
  frequencyScoreArrival,
  frequencyScoreDisplayOrder,
} from './frequency-score-motion';
import { buildFrequencyScoreboard, type FrequencyScoreboardEntry } from './frequency-scoreboard';

interface FrequencyRoundBoardProps {
  session: FamilyTriviaSessionState;
  reducedMotion: boolean;
  onNext: () => void;
  nextLabel: string;
}

/** The round intermission. It projects committed scores; animations never award points. */
export function FrequencyRoundBoard({ session, reducedMotion, onNext, nextLabel }: FrequencyRoundBoardProps) {
  const board = useMemo(() => buildFrequencyScoreboard(session), [session]);
  const ownerId = session.pack.questions[session.questionIndex]?.authorityPlayerId;
  const roundKey = `${session.id}:${board.round.number}`;

  return (
    <View style={styles.board}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>ROUND {board.round.number} · SCORES</Text>
          <Text accessibilityRole="header" style={styles.title}>{board.round.title}</Text>
          <Text style={styles.summary}>{board.round.skipped
            ? 'No points change. On to the next one.'
            : board.round.exact > 0
              ? `${board.round.exact} exact ${board.round.exact === 1 ? 'match' : 'matches'} from ${board.round.answered} ${board.round.answered === 1 ? 'guess' : 'guesses'}.`
              : 'Different answers. Another round to tune in.'}</Text>
        </View>
        <RoundSignal exact={board.round.exact} total={board.round.answered} />
      </View>

      <View style={styles.boardLabel}>
        <Text style={styles.boardLabelText}>{board.teamMode ? 'TEAM BOARD' : 'THE BOARD'}</Text>
        <Text style={styles.boardUnit}>{board.teamMode ? 'Exact-match rate' : 'Total points'}</Text>
      </View>

      <ScoreEntries
        entries={board.entries}
        key={roundKey}
        ownerId={ownerId}
        reducedMotion={reducedMotion}
        session={session}
        teamMode={board.teamMode}
      />

      {board.teamMode ? (
        <Text style={styles.fairnessNote}>Exact matches ÷ guesses. Teams take turns, so compare rates—not totals.</Text>
      ) : (
        <Text style={styles.fairnessNote}>No speed bonus. Good guesses count, not fast fingers.</Text>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={onNext}
        style={({ pressed }) => [styles.next, pressed && styles.nextPressed]}
      >
        <Text style={styles.nextText}>{nextLabel}</Text>
        <Ionicons color={color.paper} name="arrow-forward" size={23} />
      </Pressable>
    </View>
  );
}

function ScoreEntries({ entries, ownerId, reducedMotion, session, teamMode }: {
  entries: FrequencyScoreboardEntry[];
  ownerId?: string;
  reducedMotion: boolean;
  session: FamilyTriviaSessionState;
  teamMode: boolean;
}) {
  // A correction is a new public result, not another arrival of the same award.
  const revision = JSON.stringify(entries);
  const [firstRevision] = useState(revision);
  const [ranksReordered, setRanksReordered] = useState(reducedMotion);
  const [ranksSettled, setRanksSettled] = useState(reducedMotion);
  const [motionStopped, setMotionStopped] = useState(reducedMotion);
  const animate = !reducedMotion && !motionStopped && revision === firstRevision;
  const settled = !animate || ranksSettled;
  const identities = teamMode ? session.setup.teams : session.setup.players;
  const identityIds = identities.map((identity) => identity.id);
  const displayedEntries = frequencyScoreDisplayOrder(entries, identityIds, !animate || ranksReordered);
  const previousEntries = frequencyScoreDisplayOrder(entries, identityIds, false);

  useEffect(() => {
    if (reducedMotion || revision !== firstRevision) {
      setMotionStopped(true);
      return;
    }
    if (motionStopped) return;
    const reorderTimer = setTimeout(() => setRanksReordered(true), FREQUENCY_RANK_REVEAL_MS);
    const settleTimer = setTimeout(() => setRanksSettled(true), FREQUENCY_RANK_REVEAL_MS + FREQUENCY_RANK_SLIDE_MS);
    return () => {
      clearTimeout(reorderTimer);
      clearTimeout(settleTimer);
    };
  }, [firstRevision, motionStopped, reducedMotion, revision]);

  return (
    <View style={styles.entries}>
      {displayedEntries.map((entry) => {
        const rank = settled ? entry.rank : entry.previousRank;
        const memberIds = teamMode
          ? session.setup.teams.find((team) => team.id === entry.id)?.memberPlayerIds ?? []
          : [entry.id];
        const members = memberIds.flatMap((id) => {
          const player = session.setup.players.find((candidate) => candidate.id === id);
          return player ? [player] : [];
        });
        return (
          <ScoreRow
            animate={animate}
            entry={entry}
            index={previousEntries.findIndex((previous) => previous.id === entry.id)}
            isOwner={!teamMode && entry.id === ownerId}
            key={entry.id}
            members={members}
            rank={rank}
            settled={settled}
            teamMode={teamMode}
            tied={rank > 0 && entries.some((other) => other.id !== entry.id && (settled ? other.rank : other.previousRank) === rank)}
          />
        );
      })}
    </View>
  );
}

function ScoreRow({ animate, entry, index, isOwner, members, rank, settled, teamMode, tied }: {
  animate: boolean;
  entry: FrequencyScoreboardEntry;
  index: number;
  isOwner: boolean;
  members: readonly { id: string; name: string }[];
  rank: number;
  settled: boolean;
  teamMode: boolean;
  tied: boolean;
}) {
  const arrival = frequencyScoreArrival(entry, index, teamMode);
  const shownPoints = useScoreCount(entry.previousPoints, entry.points, animate, arrival.totalDelay, arrival.totalDuration);
  const motion = useScoreArrivalMotion(entry, index, animate, teamMode, !isOwner);
  const rankGain = entry.previousRank > 0 && entry.rank > 0 ? entry.previousRank - entry.rank : 0;
  const scoreLabel = teamMode ? `${formatScore(entry.points, true)} exact-match rate` : `${entry.points} total points`;
  const deltaLabel = arrival.deltaLabel;
  const bonusLabel = isOwner
    ? entry.ownerBonus > 0 ? `+${entry.ownerBonus} answer bonus · they knew you!` : 'Your answer · no bonus this round'
    : entry.roundPoints > 0 ? `${entry.roundPoints} ${entry.roundPoints === 1 ? 'point' : 'points'} this round` : 'No points this round';
  const entering = useMemo(() => animate ? FadeInDown.duration(260).delay(index * 40) : undefined, [animate, index]);
  const layout = useMemo(() => animate ? LinearTransition.duration(FREQUENCY_RANK_SLIDE_MS).easing(Easing.ease) : undefined, [animate]);

  return (
    <Animated.View
      entering={entering}
      layout={layout}
      style={[styles.scoreRow, { borderColor: rank === 1 ? color.ink : color.line }]}
    >
      <View style={styles.rowMain}>
        <View accessible={false} style={[styles.playerToken, teamMode && styles.teamToken]}>
          <Animated.View style={[styles.avatars, motion.avatarStyle]}>
            {members.slice(0, 2).map((member, memberIndex) => (
              <View key={member.id} style={teamMode && memberIndex > 0 ? styles.secondAvatar : undefined}>
                <FrequencyAvatar mood={arrival.celebrates ? 'happy' : 'idle'} name={member.name} size={teamMode ? 38 : 52} />
              </View>
            ))}
          </Animated.View>
          <View style={styles.rankCoin}><Text style={styles.rankText}>{rank === 0 ? '–' : rank}</Text></View>
        </View>
        <View style={styles.playerCopy}>
          <Text numberOfLines={2} style={styles.playerName}>{entry.label}</Text>
          <View style={styles.playerMeta}>
            <Text style={styles.rankLabel}>{rank === 0 ? 'All to play for' : tied ? `Tied ${ordinal(rank)}` : `${ordinal(rank)} place`}</Text>
            {settled && rankGain !== 0 ? (
              <Text accessibilityLabel={`${Math.abs(rankGain)} ${Math.abs(rankGain) === 1 ? 'place' : 'places'} ${rankGain > 0 ? 'up' : 'down'}`} style={styles.rankMove}>{rankGain > 0 ? '↑' : '↓'}{Math.abs(rankGain)}</Text>
            ) : null}
          </View>
        </View>
        <View accessible accessibilityLabel={`${entry.label}: ${scoreLabel}. ${deltaLabel} this round. ${teamMode ? `${entry.exact} exact ${entry.exact === 1 ? 'match' : 'matches'} from ${entry.opportunities ?? 0} ${entry.opportunities === 1 ? 'guess' : 'guesses'}.` : bonusLabel}`} style={styles.scoreStack}>
          <Animated.Text style={[styles.total, motion.totalStyle]}>{teamMode ? formatScore(shownPoints, true) : Math.round(shownPoints)}</Animated.Text>
          <View style={[styles.delta, { backgroundColor: arrival.celebrates ? entry.color : color.paper }]}>
            <Text style={styles.deltaText}>{deltaLabel}</Text>
          </View>
          {animate && arrival.celebrates ? (
            <Animated.View accessible={false} aria-hidden pointerEvents="none" style={[styles.flyingPoints, { backgroundColor: entry.color, width: teamMode ? 128 : 76 }, motion.chipStyle]}>
              <Text numberOfLines={1} style={styles.flyingPointsText}>{deltaLabel}</Text>
              <Ionicons color={color.ink} name="ellipse-outline" size={12} />
            </Animated.View>
          ) : null}
        </View>
      </View>

      <View style={styles.rowFoot}>
        {teamMode ? (
          <View style={styles.teamReadout}>
            <View accessible={false} style={styles.rateTrack}><Animated.View style={[styles.rateFill, { backgroundColor: entry.color }, motion.rateStyle]} /></View>
            <Text style={styles.earnedLabel}>{entry.opportunities
              ? `${entry.exact}/${entry.opportunities} exact · ${entry.roundPoints} this round`
              : 'Your turn is coming'}</Text>
          </View>
        ) : (
          <View style={styles.earned}>
            {isOwner ? (
              <Ionicons accessible={false} color={color.ink} name="people-outline" size={16} />
            ) : (
              <View accessible={false} style={styles.pips}>
                {[0, 1, 2, 3].map((pip) => <View key={pip} style={[styles.pip, { backgroundColor: pip < entry.roundPoints ? entry.color : 'transparent', borderColor: pip < entry.roundPoints ? color.ink : color.line }]} />)}
              </View>
            )}
            <Text style={styles.earnedLabel}>{bonusLabel}</Text>
          </View>
        )}
        {entry.streak >= 2 ? (
          <Animated.View accessibilityLabel={`${entry.streak} exact guesses in a row. No extra points.`} style={[styles.streak, motion.streakStyle]}>
            <Ionicons accessible={false} color={color.ink} name="radio-outline" size={12} />
            <Text style={styles.streakText}>{entry.streak} in a row</Text>
          </Animated.View>
        ) : null}
      </View>
    </Animated.View>
  );
}

/** Count only at the chip's arrival; correction/reduced motion snaps to truth. */
function useScoreCount(from: number, to: number, animate: boolean, delay: number, duration: number) {
  const [displayed, setDisplayed] = useState(animate ? from : to);
  const current = useRef(animate ? from : to);
  useEffect(() => {
    if (!animate || current.current === to) {
      current.current = to;
      setDisplayed(to);
      return;
    }
    const initial = current.current;
    let started = 0;
    let frame: number | undefined;
    let active = true;
    const tick = () => {
      if (!active) return;
      const progress = Math.min(1, (Date.now() - started) / duration);
      current.current = initial + (to - initial) * (1 - (1 - progress) ** 3);
      setDisplayed(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => {
      started = Date.now();
      frame = requestAnimationFrame(tick);
    }, delay);
    return () => {
      active = false;
      clearTimeout(timer);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [animate, delay, duration, to]);
  return animate ? displayed : to;
}

function useScoreArrivalMotion(entry: FrequencyScoreboardEntry, index: number, animate: boolean, teamMode: boolean, canPulseStreak: boolean) {
  const { celebrates, flightDuration, launchDelay, totalDelay, totalDuration } = frequencyScoreArrival(entry, index, teamMode);
  const flight = useSharedValue(0);
  const avatarLift = useSharedValue(0);
  const avatarTilt = useSharedValue(0);
  const totalScale = useSharedValue(1);
  const streakScale = useSharedValue(1);
  const rate = useSharedValue(animate ? entry.previousPoints : entry.points);

  useEffect(() => {
    const values = [flight, avatarLift, avatarTilt, totalScale, streakScale, rate];
    values.forEach(cancelAnimation);
    flight.value = 0;
    avatarLift.value = 0;
    avatarTilt.value = 0;
    totalScale.value = 1;
    streakScale.value = 1;
    if (!animate) {
      rate.value = entry.points;
      return () => values.forEach(cancelAnimation);
    }
    rate.value = withDelay(totalDelay, withTiming(entry.points, { duration: totalDuration, easing: Easing.out(Easing.cubic) }));
    if (celebrates) {
      flight.value = withDelay(launchDelay, withTiming(1, { duration: flightDuration, easing: Easing.linear }));
      avatarLift.value = withDelay(launchDelay + 80, withSequence(
        withTiming(-10, { duration: 150 }),
        withTiming(2, { duration: 150 }),
        withTiming(-4, { duration: 110 }),
        withSpring(0, { damping: 12, stiffness: 190 }),
      ));
      avatarTilt.value = withDelay(launchDelay + 80, withSequence(
        withTiming(-8, { duration: 150 }),
        withTiming(6, { duration: 150 }),
        withTiming(-3, { duration: 110 }),
        withSpring(0, { damping: 12, stiffness: 190 }),
      ));
      totalScale.value = withDelay(totalDelay, withSequence(
        withTiming(1.2, { duration: 130 }),
        withSpring(1, { damping: 12, stiffness: 220 }),
      ));
      if (entry.streak >= 2 && canPulseStreak) {
        streakScale.value = withDelay(totalDelay + 100, withSequence(
          withTiming(1.08, { duration: 140 }),
          withTiming(1, { duration: 220 }),
        ));
      }
    }
    return () => values.forEach(cancelAnimation);
  }, [animate, avatarLift, avatarTilt, canPulseStreak, celebrates, entry.points, entry.streak, flight, flightDuration, launchDelay, rate, streakScale, totalDelay, totalDuration, totalScale]);

  const avatarStyle = useAnimatedStyle(() => ({ transform: [{ translateY: animate ? avatarLift.value : 0 }, { rotate: `${animate ? avatarTilt.value : 0}deg` }] }));
  const totalStyle = useAnimatedStyle(() => ({ transform: [{ scale: animate ? totalScale.value : 1 }] }));
  const streakStyle = useAnimatedStyle(() => ({ transform: [{ scale: animate ? streakScale.value : 1 }] }));
  const rateStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(100, animate ? rate.value : entry.points))}%` as `${number}%` }));
  const chipStyle = useAnimatedStyle(() => ({
    opacity: animate ? interpolate(flight.value, [0, 0.08, 0.8, 1], [0, 1, 1, 0]) : 0,
    transform: [
      { translateX: interpolate(flight.value, [0, 0.2, 0.65, 1], [-32, -20, -14, 6]) },
      { translateY: interpolate(flight.value, [0, 0.2, 0.65, 0.9, 1], [26, -16, -19, 1, -3]) },
      { scale: interpolate(flight.value, [0, 0.2, 0.65, 0.9, 1], [0.7, 1.15, 1, 1.12, 0.7]) },
      { rotate: `${interpolate(flight.value, [0, 0.3, 0.75, 1], [-10, 4, -3, 0])}deg` },
    ],
  }));
  return { avatarStyle, totalStyle, streakStyle, rateStyle, chipStyle };
}

function RoundSignal({ exact, total }: { exact: number; total: number }) {
  const count = Math.max(1, Math.min(6, total));
  return (
    <View accessible={false} style={styles.signal}>
      <View style={styles.signalBars}>
        {Array.from({ length: count }, (_, index) => <View key={index} style={[styles.signalBar, { backgroundColor: index < exact ? color.teal : color.line, height: index < exact ? 34 : 12 }]} />)}
      </View>
      <View style={styles.signalSmile} />
    </View>
  );
}

function formatScore(value: number, percentage: boolean) {
  const rounded = percentage ? Number(value.toFixed(1)) : Number.isInteger(value) ? value : Math.round(value * 10) / 10;
  return `${rounded}${percentage ? '%' : ''}`;
}

function ordinal(rank: number) {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return `${rank}th`;
}

const font = typography.families;
const styles = StyleSheet.create({
  board: { gap: 14, paddingTop: 6 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: { color: color.muted, fontFamily: font.bodyMedium, fontWeight: '700', fontSize: 10, letterSpacing: 1.3 },
  title: { color: color.ink, fontFamily: font.displayHeavy, fontSize: 35, lineHeight: 37 },
  summary: { color: color.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18 },
  signal: { alignItems: 'center', justifyContent: 'center', width: 68, height: 68, borderRadius: 22, backgroundColor: color.ink, gap: 7 },
  signalBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 34 },
  signalBar: { width: 5, borderRadius: 3 },
  signalSmile: { width: 24, height: 8, borderBottomWidth: 2, borderColor: color.paper, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  boardLabel: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', paddingTop: 5 },
  boardLabelText: { color: color.ink, fontFamily: font.bodyMedium, fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  boardUnit: { color: color.muted, fontFamily: font.body, fontSize: 11 },
  entries: { gap: 9 },
  scoreRow: { borderWidth: 1.5, borderRadius: 20, backgroundColor: color.white, paddingHorizontal: 13, paddingVertical: 14, gap: 10 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  playerToken: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  teamToken: { width: 64 },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  secondAvatar: { marginLeft: -12, marginTop: 13 },
  rankCoin: { position: 'absolute', bottom: -4, right: -5, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: color.ink },
  rankText: { color: color.paper, fontFamily: font.bodyMedium, fontWeight: '700', fontSize: 10 },
  playerCopy: { flex: 1, gap: 3, minWidth: 0 },
  playerName: { color: color.ink, fontFamily: font.bodyMedium, fontWeight: '700', fontSize: 15, lineHeight: 20 },
  playerMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  rankLabel: { color: color.muted, fontFamily: font.body, fontSize: 11 },
  rankMove: { color: color.ink, fontFamily: font.bodyMedium, fontWeight: '700', fontSize: 11 },
  scoreStack: { alignItems: 'flex-end', minWidth: 63, gap: 2 },
  total: { color: color.ink, fontFamily: font.displayHeavy, fontSize: 36, lineHeight: 38, fontVariant: ['tabular-nums'] },
  delta: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  deltaText: { color: color.ink, fontFamily: font.bodyMedium, fontWeight: '700', fontSize: 10 },
  flyingPoints: { position: 'absolute', top: 8, right: 12, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, borderWidth: 1.5, borderColor: color.ink, paddingHorizontal: 9, paddingVertical: 6, zIndex: 2 },
  flyingPointsText: { color: color.ink, fontFamily: font.displayHeavy, fontSize: 21, lineHeight: 23 },
  rowFoot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  earned: { flexDirection: 'row', alignItems: 'center', flex: 1, flexBasis: 'auto', flexWrap: 'wrap', gap: 7 },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 10, height: 10, borderRadius: 4, borderWidth: 1 },
  earnedLabel: { color: color.muted, fontFamily: font.body, fontSize: 10, lineHeight: 15 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: color.paper, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4 },
  streakText: { color: color.ink, fontFamily: font.bodyMedium, fontWeight: '600', fontSize: 9 },
  teamReadout: { flex: 1, gap: 5, minWidth: 150 },
  rateTrack: { width: '100%', height: 7, backgroundColor: color.paper, borderRadius: 4, overflow: 'hidden' },
  rateFill: { height: 7, borderRadius: 4 },
  fairnessNote: { color: color.muted, fontFamily: font.body, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  next: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 58, backgroundColor: color.ink, borderRadius: 18, paddingHorizontal: 20, paddingVertical: 11 },
  nextPressed: { opacity: 0.84 },
  nextText: { color: color.paper, fontFamily: font.displayHeavy, fontSize: 26, flexShrink: 1 },
});

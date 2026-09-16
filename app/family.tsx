import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenShell } from '@/src/components';
import { useHousewireTheme } from '@/src/theme';
import { useFamilyClubStore } from '@/src/store/use-family-club-store';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { Avatar, ClubButton, ClubEmblem, ClubHeader, ClubText, INK, ModeFilters, StatStrip, ui } from '@/src/features/family-club/ClubUI';
import { HistoryList } from '@/src/features/family-club/HistoryList';
import { countsForBoard, isSharedVictory, leaderboard, selectGames, weekStart, type ClubMode, type MemberStats } from '@/src/features/family-club/model';

export default function FamilyClubScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const members = useFamilyClubStore((s) => s.members);
  const games = useFamilyClubStore((s) => s.games);
  const hydrated = useFamilyClubStore((s) => s.hydrated);
  const storageError = useFamilyClubStore((s) => s.storageError);
  const settings = useHousewireStore((s) => s.settings);
  const [tab, setTab] = useState<'Board' | 'People' | 'History'>('Board');
  const [weekly, setWeekly] = useState(false);
  const [mode, setMode] = useState<ClubMode>();
  const [rules, setRules] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(20);
  const since = weekly ? weekStart() : undefined;
  const board = useMemo(() => leaderboard({ members, games }, tab === 'People' ? {} : { mode, since }), [members, games, mode, since, tab]);
  const filtered = useMemo(() => selectGames(games, { mode, since }), [games, mode, since]);
  const ranked = board.filter((r) => r.games > 0);
  const played = filtered.filter(countsForBoard);
  const nights = new Set(played.map((g) => new Date(g.playedAt).toLocaleDateString())).size;
  const openMember = (id?: string) => router.push({ pathname: '/family-player', params: id ? { id } : {} });
  const chooseTab = (value: typeof tab) => { setTab(value); if (settings.haptics) void Haptics.selectionAsync().catch(() => undefined); };

  return <ScreenShell padded={false} texture={false}>
    <ScrollView contentContainerStyle={ui.page} showsVerticalScrollIndicator={false}>
      <ClubHeader title="Family Club" action={<Pressable accessibilityRole="button" accessibilityLabel="Add family member" onPress={() => openMember()} style={[ui.iconButton, { backgroundColor: theme.colors.surface }]}><Ionicons name="person-add-outline" size={21} color={theme.colors.text} /></Pressable>} />
      <Animated.View entering={settings.reducedMotion ? undefined : FadeInDown.duration(350)} style={ui.row}>
        <View style={{ flex: 1, gap: 6 }}><ClubText kind="label" style={{ color: theme.colors.ready, letterSpacing: 1 }}>YOUR PEOPLE. YOUR RECORDS.</ClubText><ClubText accessibilityRole="header" kind="display" style={{ fontSize: 36, lineHeight: 38 }}>Good nights.{ '\n' }Great company.</ClubText><ClubText muted kind="label">A little friendly competition. A lot of shared wins.</ClubText></View><ClubEmblem />
      </Animated.View>
      <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: theme.colors.surface }]}>{(['Board', 'People', 'History'] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => chooseTab(value)} style={[styles.tab, tab === value && { backgroundColor: '#FFD166' }]}><ClubText style={{ fontWeight: '700', color: tab === value ? INK : theme.colors.muted }}>{value}</ClubText></Pressable>)}</View>
      {!hydrated ? <ActivityIndicator accessibilityLabel="Loading your family" color={theme.colors.wire} /> : <>
        {storageError ? <ClubButton secondary onPress={() => useFamilyClubStore.getState().retrySave()}>Phone storage needs another try. Tap to retry.</ClubButton> : null}
        {tab !== 'People' ? <>
          <View style={ui.between}><ClubText kind="title">{tab === 'Board' ? 'Family standings' : 'The game-night file'}</ClubText><Pressable accessibilityRole="button" accessibilityLabel={weekly ? 'Show all time' : 'Show this week'} onPress={() => { setWeekly(!weekly); setHistoryLimit(20); }} style={[styles.period, { borderColor: theme.colors.draft }]}><ClubText kind="label">{weekly ? 'This week' : 'All time'} ⌄</ClubText></Pressable></View>
          <ModeFilters selected={mode} onChange={(next) => { setMode(next); setHistoryLimit(20); }} />
        </> : null}
        {tab === 'Board' ? <>
          <StatStrip values={[{ value: String(played.length), label: 'games together' }, { value: String(nights), label: 'game nights' }, { value: String(played.filter(isSharedVictory).length), label: 'shared victories' }]} />
          {ranked.length ? <>
            <View style={styles.podium}>{(ranked.length >= 3 ? [ranked[1], ranked[0], ranked[2]] : ranked.slice(0, 2)).map((row) => <Pressable key={row.member.id} accessibilityRole="button" accessibilityLabel={`${row.member.name}, rank ${row.rank}, ${row.wins} wins. View stats`} onPress={() => openMember(row.member.id)} style={styles.podiumPlace}>
              {row.rank === 1 ? <Ionicons name="trophy" color={theme.colors.warning} size={23} /> : <View style={{ height: 23 }} />}
              <Avatar member={row.member} size={row.rank === 1 ? 66 : 53} />
              <ClubText numberOfLines={1} style={{ textAlign: 'center', fontWeight: '700', width: '100%' }}>{row.member.name}</ClubText>
              <View style={[styles.podiumBlock, { height: row.rank === 1 ? 103 : row.rank === 2 ? 81 : 66, backgroundColor: row.member.color }]}><ClubText kind="display" style={{ color: INK, fontSize: 33 }}>#{row.rank}</ClubText><ClubText kind="label" style={{ color: INK }}>{row.wins} {row.wins === 1 ? 'win' : 'wins'}</ClubText></View>
            </Pressable>)}</View>
            <View>{ranked.map((row) => <PlayerRow key={row.member.id} row={row} onPress={() => openMember(row.member.id)} />)}</View>
          </> : <View style={[styles.empty, { backgroundColor: theme.colors.surface }]}><Ionicons name="ribbon-outline" size={35} color={theme.colors.warning} /><ClubText kind="title">The first spot is open.</ClubText><ClubText muted style={{ textAlign: 'center' }}>{games.length ? 'No family games match this view yet. Practice stays in History.' : 'Finish a game together and your names will land here automatically.'}</ClubText><ClubButton onPress={() => router.push('/modes')}>Pick a game</ClubButton></View>}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: rules }} onPress={() => setRules(!rules)} style={ui.between}><ClubText kind="label" muted>How the board works</ClubText><Ionicons name={rules ? 'chevron-up' : 'information-circle-outline'} size={20} color={theme.colors.muted} /></Pressable>
          {rules ? <ClubText muted>Each successful escape or Last Light defusal gives every real player one shared win. An unsuccessful defusal counts as a game, not a win. Frequency and Circuit Race award one win to the winning players or team. Ties share a rank. Practice and older games without player details stay in History. Stats are saved on this phone.</ClubText> : null}
        </> : tab === 'People' ? <>
          <View style={ui.between}><ClubText kind="title">Meet the regulars</ClubText><ClubText muted kind="label">{members.length} {members.length === 1 ? 'person' : 'people'}</ClubText></View>
          <ClubText muted>Names from completed games appear here. Add someone now to pick them quickly next time.</ClubText>
          {board.map((row) => <PlayerRow key={row.member.id} row={row} onPress={() => openMember(row.member.id)} people />)}
          <ClubButton onPress={() => openMember()}>+ Add a family member</ClubButton>
        </> : <>
          {filtered.length ? <HistoryList games={filtered.slice(0, historyLimit)} members={members} /> : <View style={styles.empty}><Ionicons name="ticket-outline" size={42} color={theme.colors.warning} /><ClubText kind="title">Your next night starts here.</ClubText><ClubText muted style={{ textAlign: 'center' }}>Completed games save automatically, including practice.</ClubText><ClubButton onPress={() => router.push('/modes')}>Choose a game</ClubButton></View>}
          {filtered.length > historyLimit ? <ClubButton secondary onPress={() => setHistoryLimit(historyLimit + 20)}>Show earlier games</ClubButton> : null}
        </>}
        <ClubText muted kind="label" style={{ textAlign: 'center' }}>Saved on this phone · no account needed</ClubText>
      </>}
    </ScrollView>
  </ScreenShell>;
}

function PlayerRow({ row, onPress, people = false }: { row: MemberStats; onPress(): void; people?: boolean }) {
  const { theme } = useHousewireTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${row.member.name}'s stats`} onPress={onPress} style={({ pressed }) => [styles.playerRow, { borderColor: theme.colors.draft, opacity: pressed ? 0.7 : 1 }]}>
    {!people ? <ClubText kind="label" muted style={{ width: 20 }}>{row.rank || '—'}</ClubText> : null}<Avatar member={row.member} />
    <View style={{ flex: 1 }}><ClubText numberOfLines={1} style={{ fontWeight: '700' }}>{row.member.name}</ClubText><ClubText kind="label" muted>{row.games ? `${row.games} ${row.games === 1 ? 'game' : 'games'} · ${row.escapes} shared ${row.escapes === 1 ? 'victory' : 'victories'}` : 'Ready for a first game'}</ClubText></View>
    <View style={{ alignItems: 'flex-end' }}><ClubText kind="display" style={{ fontSize: 29, lineHeight: 31 }}>{row.wins}</ClubText><ClubText kind="label" muted>{row.wins === 1 ? 'win' : 'wins'}</ClubText></View><Ionicons name="chevron-forward" color={theme.colors.muted} size={16} />
  </Pressable>;
}
const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderRadius: 18, padding: 5, gap: 4 }, tab: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  period: { borderRadius: 22, borderWidth: 1, padding: 10, minHeight: 42 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingTop: 4 }, podiumPlace: { flex: 1, alignItems: 'center', gap: 9, minWidth: 0 }, podiumBlock: { alignItems: 'center', justifyContent: 'center', width: '100%', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },
  empty: { borderRadius: 24, padding: 24, gap: 13, alignItems: 'center' }, playerRow: { flexDirection: 'row', gap: 12, alignItems: 'center', borderBottomWidth: 1, paddingVertical: 14 },
});

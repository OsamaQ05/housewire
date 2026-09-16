import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { ScreenShell } from '@/src/components';
import { useHousewireTheme } from '@/src/theme';
import { useFamilyClubStore } from '@/src/store/use-family-club-store';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { Avatar, ClubButton, ClubHeader, ClubText, MODE_COLORS, StatStrip, ui } from '@/src/features/family-club/ClubUI';
import { HistoryList } from '@/src/features/family-club/HistoryList';
import { setLocalPlayerName } from '@/src/features/family-club/PlayerPicker';
import { CLUB_COLORS, countsForBoard, durationLabel, leaderboard, MODE_LABELS, type ClubMode } from '@/src/features/family-club/model';

export default function FamilyPlayerScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const members = useFamilyClubStore((s) => s.members);
  const games = useFamilyClubStore((s) => s.games);
  const hydrated = useFamilyClubStore((s) => s.hydrated);
  const member = members.find((m) => m.id === params.id);
  const [editing, setEditing] = useState(!params.id);
  const [name, setName] = useState(member?.name ?? '');
  const [color, setColor] = useState<string>(member?.color ?? CLUB_COLORS[members.length % CLUB_COLORS.length]);
  const [error, setError] = useState<string>();
  const [limit, setLimit] = useState(10);
  const reducedMotion = useHousewireStore((s) => s.settings.reducedMotion);
  const localName = useHousewireStore((s) => s.crew.find((p) => p.id === s.localNodeId)?.name);
  const stats = useMemo(() => leaderboard({ members, games }).find((s) => s.member.id === params.id), [members, games, params.id]);
  const recent = useMemo(() => games.filter((g) => g.participants.some((p) => p.memberId === params.id)), [games, params.id]);
  const save = () => {
    const issue = useFamilyClubStore.getState().saveMember(name, color, member?.id);
    if (issue) { setError(issue); return; }
    setEditing(false);
    if (!member) router.back();
  };
  const openEditor = () => { setName(member?.name ?? ''); setColor(member?.color ?? color); setError(undefined); setEditing(true); };
  const closeEditor = () => { setEditing(false); if (!member) router.back(); };
  const partner = useMemo(() => {
    const tally = new Map<string, number>();
    for (const game of recent.filter(countsForBoard)) for (const p of game.participants) if (p.memberId !== params.id) tally.set(p.memberId, (tally.get(p.memberId) ?? 0) + 1);
    const best = [...tally].sort((a, b) => b[1] - a[1])[0];
    return best ? { name: members.find((m) => m.id === best[0])?.name, count: best[1] } : undefined;
  }, [recent, members, params.id]);

  return <ScreenShell padded={false} texture={false}>
    <ScrollView contentContainerStyle={ui.page} showsVerticalScrollIndicator={false}>
      <ClubHeader title="Player card" action={member ? <Pressable accessibilityRole="button" accessibilityLabel="Edit player" onPress={openEditor} style={[ui.iconButton, { backgroundColor: theme.colors.surface }]}><Ionicons name="pencil-outline" size={20} color={theme.colors.text} /></Pressable> : undefined} />
      {member && stats ? <>
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 26, padding: 24, gap: 13, alignItems: 'center', borderBottomWidth: 5, borderColor: member.color }}>
          <View style={ui.between}><Avatar member={member} size={86} /><View style={{ padding: 12 }}><ClubText kind="label" muted>FAMILY CLUB</ClubText><ClubText kind="display">{stats.rank ? `#${stats.rank}` : 'NEW'}</ClubText></View></View>
          <ClubText accessibilityRole="header" kind="display" style={{ textAlign: 'center' }}>{member.name}</ClubText>
          <ClubText muted kind="label">{stats.escapes ? `${stats.escapes} missions solved together` : stats.games ? 'A familiar face on game night' : 'A seat at the next game night'}</ClubText>
        </View>
        <StatStrip values={[{ value: String(stats.games), label: 'games' }, { value: String(stats.wins), label: 'wins' }, { value: stats.games ? `${Math.round(stats.wins / stats.games * 100)}%` : '—', label: 'win rate' }]} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, borderRadius: 20, padding: 17, gap: 5, backgroundColor: theme.colors.surface }}><Ionicons name="time-outline" size={24} color={theme.colors.ready} /><ClubText kind="title">{stats.timedGames ? durationLabel(stats.seconds) : '—'}</ClubText><ClubText kind="label" muted>time in games</ClubText></View>
          <View style={{ flex: 1, borderRadius: 20, padding: 17, gap: 5, backgroundColor: theme.colors.surface }}><Ionicons name="radio-outline" size={24} color={theme.colors.warning} /><ClubText kind="title">{stats.guesses ? `${Math.round(stats.exact / stats.guesses * 100)}%` : '—'}</ClubText><ClubText kind="label" muted>{stats.guesses ? `${stats.exact} / ${stats.guesses} exact guesses` : 'exact guesses'}</ClubText></View>
        </View>
        <ClubText kind="title">Their kind of game night</ClubText>
        <View style={{ gap: 14 }}>{(Object.keys(MODE_LABELS) as ClubMode[]).map((mode) => <View key={mode} style={{ gap: 6 }}><View style={ui.between}><ClubText>{MODE_LABELS[mode]}</ClubText><ClubText kind="label" muted>{stats.modes[mode]} {stats.modes[mode] === 1 ? 'game' : 'games'}</ClubText></View><View style={{ height: 9, backgroundColor: theme.colors.surfaceRaised, borderRadius: 6, overflow: 'hidden' }}><View style={{ height: 9, width: `${stats.games ? stats.modes[mode] / stats.games * 100 : 0}%`, backgroundColor: MODE_COLORS[mode], borderRadius: 6 }} /></View></View>)}</View>
        {partner?.name ? <View style={[ui.row, { borderColor: theme.colors.draft, borderWidth: 1, borderRadius: 18, padding: 16 }]}><Ionicons name="people-outline" size={26} color={theme.colors.ready} /><View style={{ flex: 1 }}><ClubText>Often at the same table</ClubText><ClubText kind="label" muted>{partner.name} · {partner.count} {partner.count === 1 ? 'game' : 'games'} together</ClubText></View></View> : null}
        <ClubText kind="title">Recent nights</ClubText>
        {recent.length ? <HistoryList games={recent.slice(0, limit)} members={members} /> : <ClubText muted>Play with this name and the results will appear here automatically.</ClubText>}
        {recent.length > limit ? <ClubButton secondary onPress={() => setLimit(limit + 10)}>Show earlier games</ClubButton> : null}
        <ClubText muted kind="label">Practice is saved in history. It doesn’t affect these stats.</ClubText>
        <ClubButton secondary onPress={() => setLocalPlayerName(member.name)}>{localName === member.name ? 'Playing as this person on this phone ✓' : 'Play as this person on this phone'}</ClubButton>
      </> : <ClubText muted>{hydrated ? 'Give everyone a familiar name and a color of their own.' : 'Loading player…'}</ClubText>}
    </ScrollView>
    <Modal visible={editing} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={closeEditor}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(5,12,26,0.75)', padding: 20 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: theme.colors.surfaceRaised, borderRadius: 26, padding: 24, gap: 20 }}>
            <View style={ui.between}><ClubText accessibilityRole="header" kind="title">{member ? 'Make it yours' : 'Pull up a chair'}</ClubText><Pressable accessibilityRole="button" accessibilityLabel="Close player editor" onPress={closeEditor} style={ui.iconButton}><Ionicons name="close" size={24} color={theme.colors.text} /></Pressable></View>
            <View style={{ alignItems: 'center' }}><Avatar member={{ name: name || '?', color }} size={74} /></View>
            <View style={{ gap: 7 }}><ClubText kind="label">Name or nickname</ClubText><TextInput accessibilityLabel="Family member name" maxLength={24} value={name} onChangeText={(next) => { setName(next); setError(undefined); }} autoCapitalize="words" returnKeyType="done" onSubmitEditing={save} placeholder="e.g. Osama" placeholderTextColor={theme.colors.faint} style={{ color: theme.colors.text, backgroundColor: theme.colors.background, borderRadius: 13, borderWidth: 1, borderColor: error ? theme.colors.fault : theme.colors.draft, minHeight: 52, paddingHorizontal: 15, fontSize: 18 }} /></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5 }}>{CLUB_COLORS.map((option, i) => <Pressable key={option} accessibilityRole="radio" accessibilityLabel={['Gold', 'Mint', 'Coral', 'Lilac', 'Blue', 'Pink'][i]} accessibilityState={{ selected: option === color }} onPress={() => setColor(option)} style={{ width: 42, height: 42, borderRadius: 16, backgroundColor: option, borderWidth: 3, borderColor: option === color ? theme.colors.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{option === color ? <Ionicons name="checkmark" size={23} color="#182033" /> : null}</Pressable>)}</View>
            {error ? <ClubText accessibilityRole="alert" style={{ color: theme.colors.fault }}>{error}</ClubText> : null}
            <ClubText muted kind="label">{member ? 'Your past games stay with you when you rename this card.' : 'Use this name when playing. We’ll keep the score.'}</ClubText>
            <ClubButton onPress={save}>{member ? 'Save player' : 'Add to the family'}</ClubButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  </ScreenShell>;
}

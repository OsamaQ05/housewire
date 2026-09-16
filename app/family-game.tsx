import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { ScreenShell } from '@/src/components';
import { useHousewireTheme } from '@/src/theme';
import { useFamilyClubStore } from '@/src/store/use-family-club-store';
import { Avatar, ClubButton, ClubHeader, ClubText, MODE_COLORS, MODE_ICONS, StatStrip, ui } from '@/src/features/family-club/ClubUI';
import { countsForBoard, durationLabel, isCooperativeMode, isSharedVictory, MODE_LABELS } from '@/src/features/family-club/model';

export default function FamilyGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useHousewireTheme();
  const router = useRouter();
  const game = useFamilyClubStore((s) => s.games.find((g) => g.id === id));
  const members = useFamilyClubStore((s) => s.members);
  const hydrated = useFamilyClubStore((s) => s.hydrated);
  if (!game) return <ScreenShell texture={false}><ClubHeader title="Game receipt" /><ClubText>{hydrated ? 'This game receipt isn’t on this phone.' : 'Opening receipt…'}</ClubText></ScreenShell>;
  const counted = countsForBoard(game);
  return <ScreenShell padded={false} texture={false}><ScrollView contentContainerStyle={ui.page} showsVerticalScrollIndicator={false}>
    <ClubHeader title="Game receipt" />
    <View style={{ borderRadius: 25, borderTopWidth: 7, borderColor: MODE_COLORS[game.mode], backgroundColor: theme.colors.surface, padding: 23, gap: 17 }}>
      <View style={ui.between}><Ionicons name={MODE_ICONS[game.mode]} size={34} color={theme.colors.text} /><ClubText kind="label" muted>{game.practice ? 'PRACTICE' : game.legacy ? 'FROM THE ARCHIVE' : 'PLAYED TOGETHER'}</ClubText></View>
      <ClubText kind="label" style={{ color: theme.colors.ready }}>{MODE_LABELS[game.mode]}</ClubText><ClubText accessibilityRole="header" kind="display">{game.title}</ClubText>
      <ClubText muted>{new Date(game.playedAt).toLocaleString(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</ClubText>
      <StatStrip values={[{ value: game.durationSeconds !== undefined ? durationLabel(game.durationSeconds) : '—', label: 'duration' }, { value: String(game.participants.length || '—'), label: 'players' }, { value: game.rounds !== undefined ? String(game.rounds) : '✓', label: game.mode === 'frequency' ? 'scored rounds' : 'completed' }]} />
      {game.source ? <ClubText kind="label" muted>{game.source === 'ai' ? 'Created with AI' : game.source === 'offline' ? 'On-device game pack' : 'Housewire original'}</ClubText> : null}
      {game.hints !== undefined || game.retries !== undefined ? <ClubText kind="label" muted>{game.hints !== undefined ? `${game.hints} hints used` : ''}{game.hints !== undefined && game.retries !== undefined ? ' · ' : ''}{game.retries !== undefined ? `${game.retries} retries` : ''}</ClubText> : null}
      <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.draft }} />
      <ClubText kind="title">{isSharedVictory(game) ? 'The crew that cracked it' : 'How it finished'}</ClubText>
      {game.participants.map((player) => {
        const member = members.find((m) => m.id === player.memberId);
        if (!member) return null;
        return <Pressable key={member.id} accessibilityRole="button" accessibilityLabel={`View ${member.name}'s stats`} onPress={() => router.push({ pathname: '/family-player', params: { id: member.id } })} style={[ui.row, { paddingVertical: 7 }]}>
          <Avatar member={member} /><View style={{ flex: 1 }}><ClubText style={{ fontWeight: '700' }}>{member.name}</ClubText><ClubText muted kind="label">{player.team ? `${player.team} · ` : ''}{player.elapsedSeconds !== undefined ? durationLabel(player.elapsedSeconds) : player.score !== undefined ? `${player.score} pts` : game.mode === 'defusal' ? player.won ? 'Defused together' : 'Not defused this time' : isCooperativeMode(game.mode) && player.won ? 'Shared victory' : 'Played together'}{player.guesses !== undefined ? ` · ${player.exact ?? 0}/${player.guesses} exact` : ''}</ClubText></View>
          {player.won && counted ? <Ionicons name="trophy" size={20} color={theme.colors.warning} /> : <Ionicons name="chevron-forward" size={17} color={theme.colors.muted} />}
        </Pressable>;
      })}
      {game.standings?.map((row) => <View key={row.label} style={ui.between}><ClubText muted>{row.label}{row.won ? ' · won' : ''}</ClubText><ClubText>{row.value}</ClubText></View>)}
      <ClubText muted kind="label">{game.legacy ? 'This older save did not include player details. Its original result is kept here and does not change personal rankings.' : game.practice ? 'A rehearsal worth keeping. Practice doesn’t add leaderboard wins.' : !counted ? 'No scored rounds were completed, so this game does not affect the leaderboard.' : 'Added to everyone’s player card on this phone.'}</ClubText>
    </View>
    <ClubButton onPress={() => router.push(game.mode === 'frequency' ? '/trivia-setup' : game.mode === 'race' ? '/race-setup' : game.mode === 'forge' ? '/forge-library' : game.mode === 'defusal' ? '/defusal' : '/home')}>{game.mode === 'defusal' ? 'Play Last Light again' : `Play another ${game.mode === 'race' ? 'race' : game.mode === 'frequency' ? 'round' : 'case'}`}</ClubButton>
  </ScrollView></ScreenShell>;
}

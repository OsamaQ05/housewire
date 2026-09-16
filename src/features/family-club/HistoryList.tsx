import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useHousewireTheme } from '../../theme';
import { Avatar, ClubText, MODE_COLORS, MODE_ICONS, ui } from './ClubUI';
import { durationLabel, isCooperativeMode, isSharedVictory, type ClubGame, type ClubMember } from './model';

export function HistoryList({ games, members }: { games: readonly ClubGame[]; members: readonly ClubMember[] }) {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  return <View style={{ gap: 14 }}>{games.map((game) => {
    const players = game.participants.map((p) => members.find((m) => m.id === p.memberId)).filter((p): p is ClubMember => Boolean(p));
    const winners = game.participants.filter((p) => p.won).map((p) => members.find((m) => m.id === p.memberId)?.name ?? p.name);
    const line = game.legacy ? 'Saved before player stats' : game.practice ? 'Practice · off the leaderboard' : game.mode === 'defusal' ? isSharedVictory(game) ? 'Defused together' : 'Not defused this time' : isCooperativeMode(game.mode) ? isSharedVictory(game) ? 'Escaped together' : 'Case unfinished' : !game.rounds ? 'No scored rounds' : winners.length === 1 ? `${winners[0]} won` : winners.length ? `${winners.length} shared the win` : 'No winner this time';
    return <Pressable key={game.id} accessibilityRole="button" accessibilityLabel={`${game.title}, ${line}, ${new Date(game.playedAt).toLocaleDateString()}`} onPress={() => router.push({ pathname: '/family-game', params: { id: game.id } })} style={({ pressed }) => [styles.ticket, { backgroundColor: theme.colors.surface, opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.ticketEdge, { backgroundColor: MODE_COLORS[game.mode] }]} />
      <View style={ui.between}><View style={ui.row}><Ionicons name={MODE_ICONS[game.mode]} color={theme.mode === 'daylight' ? theme.colors.text : MODE_COLORS[game.mode]} size={21} /><ClubText kind="label" muted>{new Date(game.playedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</ClubText></View><ClubText kind="label" muted>{game.durationSeconds !== undefined ? durationLabel(game.durationSeconds) : game.rounds !== undefined ? `${game.rounds} rounds` : 'Saved game'}</ClubText></View>
      <ClubText kind="title" style={{ fontSize: 25, lineHeight: 29 }}>{game.title}</ClubText>
      <ClubText kind="label" muted>{line}</ClubText>
      <View style={[styles.perforation, { borderColor: theme.colors.draft }]} />
      <View style={ui.between}><View style={{ flexDirection: 'row', gap: 7 }}>{players.slice(0, 4).map((m) => <Avatar key={m.id} member={m} size={30} />)}{players.length === 0 ? <ClubText kind="label" muted>Original result preserved</ClubText> : null}</View><View style={ui.row}><ClubText kind="label">Open receipt</ClubText><Ionicons name="arrow-forward" size={16} color={theme.colors.text} /></View></View>
    </Pressable>;
  })}</View>;
}
const styles = StyleSheet.create({ ticket: { padding: 17, paddingLeft: 22, borderRadius: 18, gap: 8, overflow: 'hidden' }, ticketEdge: { width: 5, position: 'absolute', top: 0, bottom: 0, left: 0 }, perforation: { borderTopWidth: 1, borderStyle: 'dashed', marginVertical: 6 } });

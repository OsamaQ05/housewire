import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useState } from 'react';
import { useHousewireTheme } from '../../theme';
import { useFamilyClubStore } from '../../store/use-family-club-store';
import { useHousewireStore } from '../../store/use-housewire-store';
import { Avatar, ClubText, ui } from './ClubUI';
import { initials } from './model';

export function SavedPlayers({ onChoose }: { onChoose(name: string): void }) {
  const members = useFamilyClubStore((s) => s.members);
  const { theme } = useHousewireTheme();
  if (!members.length) return null;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 5 }}>
    {members.map((member) => <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${member.name}`} key={member.id} onPress={() => onChoose(member.name)} style={[ui.row, { borderWidth: 1, borderColor: theme.colors.draft, borderRadius: 18, padding: 9, gap: 7 }]}><Avatar member={member} size={27} /><ClubText kind="label">{member.name}</ClubText></Pressable>)}
  </ScrollView>;
}
export function setLocalPlayerName(name: string) {
  const house = useHousewireStore.getState();
  house.setCrew(house.crew.map((p) => p.id === house.localNodeId ? { ...p, name: name.trim() || 'You', initials: initials(name || 'You') } : p));
}
export function HostPlayerPicker() {
  const { theme } = useHousewireTheme();
  const current = useHousewireStore((s) => s.crew.find((p) => p.id === s.localNodeId)?.name ?? 'You');
  const [draft, setDraft] = useState(current === 'You' || current === 'Host phone' ? '' : current);
  const changeName = (name: string) => { setDraft(name); setLocalPlayerName(name); };
  return <View style={{ gap: 6 }}>
    <ClubText kind="label">Who’s using this phone?</ClubText>
    <TextInput accessibilityLabel="Your player name" value={draft} onChangeText={changeName} placeholder="Your name for the scoreboard" placeholderTextColor={theme.colors.faint} maxLength={24} autoCapitalize="words" style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: theme.colors.surface, color: theme.colors.text, fontSize: 16 }} />
    <SavedPlayers onChoose={changeName} />
  </View>;
}

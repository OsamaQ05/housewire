import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextProps } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useHousewireTheme } from '../../theme';
import { initials, MODE_LABELS, type ClubMember, type ClubMode } from './model';

export const INK = '#182033';
export const PAPER = '#FFF6E5';
export const MODE_COLORS: Record<ClubMode, string> = { escape: '#FF7657', frequency: '#FFD166', race: '#6ED8C7', forge: '#B9A7F8', defusal: '#F3B663' };
export const MODE_ICONS = { escape: 'key-outline', frequency: 'radio-outline', race: 'git-compare-outline', forge: 'layers-outline', defusal: 'timer-outline' } as const;

export function ClubText({ kind = 'body', muted = false, style, ...props }: TextProps & { kind?: 'body' | 'title' | 'display' | 'label'; muted?: boolean }) {
  const { theme } = useHousewireTheme();
  return <Text {...props} style={[{ color: muted ? theme.colors.muted : theme.colors.text, fontSize: kind === 'display' ? 44 : kind === 'title' ? 28 : kind === 'label' ? 12 : 15, lineHeight: kind === 'display' ? 46 : kind === 'title' ? 33 : kind === 'label' ? 17 : 22, fontFamily: kind === 'display' ? theme.typography.families.displayHeavy : kind === 'title' ? theme.typography.families.storyBold : kind === 'label' ? theme.typography.families.bodyMedium : theme.typography.families.body }, style]} />;
}
export function ClubHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  return <View style={ui.header}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/modes')} style={[ui.iconButton, { backgroundColor: theme.colors.surface }]}><Ionicons name="arrow-back" size={22} color={theme.colors.text} /></Pressable>
    <ClubText kind="label" style={{ flex: 1, letterSpacing: 1.5 }}>{title.toLocaleUpperCase()}</ClubText>{action}
  </View>;
}
export function Avatar({ member, size = 46 }: { member: Pick<ClubMember, 'name' | 'color'>; size?: number }) {
  const { theme } = useHousewireTheme();
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ backgroundColor: member.color, width: size, height: size, borderRadius: size * 0.34, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', transform: [{ rotate: '-4deg' }] }}>
    <Text style={{ color: INK, fontSize: size * 0.37, fontFamily: theme.typography.families.displayHeavy, transform: [{ rotate: '4deg' }] }}>{initials(member.name)}</Text>
    <View style={{ position: 'absolute', bottom: size * 0.15, width: size * 0.23, height: 2, borderRadius: 2, backgroundColor: INK, opacity: 0.35 }} />
  </View>;
}
export function ClubButton({ children, onPress, secondary = false, label }: PropsWithChildren<{ onPress(): void; secondary?: boolean; label?: string }>) {
  const { theme } = useHousewireTheme();
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [ui.button, { backgroundColor: secondary ? theme.colors.surface : '#FFD166', borderColor: secondary ? theme.colors.draft : '#FFD166', opacity: pressed ? 0.75 : 1 }]}>
    <ClubText style={{ color: secondary ? theme.colors.text : INK, fontWeight: '700', textAlign: 'center' }}>{children}</ClubText>
  </Pressable>;
}
export function ModeFilters({ selected, onChange }: { selected?: ClubMode; onChange(mode?: ClubMode): void }) {
  const { theme } = useHousewireTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.filters}>{([undefined, 'escape', 'frequency', 'race', 'forge', 'defusal'] as const).map((mode) => <Pressable key={mode ?? 'all'} accessibilityRole="button" accessibilityLabel={mode ? MODE_LABELS[mode] : 'All games'} accessibilityState={{ selected: selected === mode }} onPress={() => onChange(mode)} style={[ui.filter, { borderColor: selected === mode ? theme.colors.text : theme.colors.draft, backgroundColor: selected === mode ? theme.colors.surfaceRaised : 'transparent' }]}>
    {mode ? <Ionicons name={MODE_ICONS[mode]} color={theme.mode === 'daylight' ? theme.colors.text : MODE_COLORS[mode]} size={17} /> : null}<ClubText kind="label">{mode === 'frequency' ? 'Frequency' : mode === 'escape' ? 'Escapes' : mode === 'race' ? 'Race' : mode === 'forge' ? 'Forge' : mode === 'defusal' ? 'Last Light' : 'All'}</ClubText>
  </Pressable>)}</ScrollView>;
}
export function StatStrip({ values }: { values: { value: string; label: string }[] }) {
  const { theme } = useHousewireTheme();
  return <View style={[ui.statStrip, { borderColor: theme.colors.draft }]}>{values.map((item) => <View key={item.label} style={ui.stat}><ClubText kind="display" style={{ fontSize: 30, lineHeight: 34 }}>{item.value}</ClubText><ClubText muted kind="label" style={{ textAlign: 'center' }}>{item.label}</ClubText></View>)}</View>;
}
export function ClubEmblem() {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Svg width={90} height={96} viewBox="0 0 112 119">
    <Path d="M13 33L56 7L99 33V83Q99 99 56 114Q13 99 13 83Z" fill="#FFD166" stroke="#FFF6E5" strokeWidth={3} />
    <Path d="M32 40H80V58Q80 78 56 84Q32 78 32 58Z" fill="#FFF6E5" />
    <Path d="M32 47H21V57Q21 70 39 70M80 47H91V57Q91 70 73 70M56 84V94M44 97H68" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
    <Rect x={42} y={47} width={28} height={21} rx={4} fill="#FF7657" /><Path d="M39 49L56 36L73 49" stroke={INK} strokeWidth={3} fill="#6ED8C7" strokeLinejoin="round" /><Circle cx={56} cy={59} r={4} fill={INK} />
  </Svg></View>;
}
export const ui = StyleSheet.create({
  page: { padding: 20, paddingTop: 10, paddingBottom: 36, gap: 22, maxWidth: 680, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, iconButton: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  button: { borderRadius: 16, borderWidth: 1, padding: 15, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', gap: 6 }, filter: { minHeight: 40, flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 11, borderRadius: 30, borderWidth: 1 },
  statStrip: { borderTopWidth: 1, borderBottomWidth: 1, flexDirection: 'row', paddingVertical: 15 }, stat: { flex: 1, alignItems: 'center', gap: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
});

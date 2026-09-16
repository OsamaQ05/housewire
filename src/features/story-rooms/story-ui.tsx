import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useHousewireTheme } from '@/src/theme';
import { useRoomPresentation } from './room-presentation';

export const STORY_INK = '#18262D';
export const STORY_BG = '#111D24';
export const STORY_WHITE = '#F4F0E6';
export type StoryIcon = ComponentProps<typeof Ionicons>['name'];
export function StoryText({ children, size = 15, color = STORY_WHITE, strong = false, display = false, style }: {
  children: ReactNode; size?: number; color?: string; strong?: boolean; display?: boolean; style?: StyleProp<import('react-native').TextStyle>;
}) {
  const { theme } = useHousewireTheme();
  const presentation = useRoomPresentation();
  return <Text style={[{ color, fontSize: size, lineHeight: size * (display ? 1.1 : 1.45), fontFamily: display ? presentation?.serif ? theme.typography.families.storyBold : theme.typography.families.displayHeavy : strong ? theme.typography.families.bodyMedium : theme.typography.families.body }, style]}>{children}</Text>;
}
export function StoryButton({ label, onPress, disabled, accent = '#F7BD69', secondary = false, icon, style }: {
  label: string; onPress(): void; disabled?: boolean; accent?: string; secondary?: boolean; icon?: StoryIcon; style?: StyleProp<ViewStyle>;
}) {
  const presentation = useRoomPresentation();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [ui.button, { backgroundColor: secondary ? presentation?.panel ?? '#26343D' : accent, opacity: disabled ? .45 : pressed ? .78 : 1 }, style]}>
    {icon ? <Ionicons name={icon} size={21} color={secondary ? STORY_WHITE : STORY_INK} /> : null}
    <StoryText strong color={secondary ? STORY_WHITE : STORY_INK}>{label}</StoryText>
  </Pressable>;
}
export function StoryIconButton({ label, icon, onPress, accent = STORY_WHITE }: { label: string; icon: StoryIcon; onPress(): void; accent?: string }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [ui.iconButton, pressed && { opacity: .5 }]}><Ionicons name={icon} size={23} color={accent} /></Pressable>;
}
export function StoryNotice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return <View accessibilityLiveRegion="polite" style={[ui.notice, { borderColor: danger ? '#EF947F' : '#7BA8BA' }]}>
    <Ionicons name={danger ? 'alert-circle-outline' : 'information-circle-outline'} size={19} color={danger ? '#EF947F' : '#9BC5D5'} />
    <StoryText size={13} style={{ flex: 1 }}>{children}</StoryText>
  </View>;
}
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: STORY_BG },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 110, gap: 20, width: '100%', maxWidth: 660, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  button: { minHeight: 54, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  iconButton: { width: 46, height: 46, justifyContent: 'center', alignItems: 'center' },
  notice: { borderLeftWidth: 3, padding: 13, backgroundColor: '#20303A', borderRadius: 7, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  sheetBackdrop: { flex: 1, backgroundColor: '#050B10DD', justifyContent: 'flex-end' },
  sheet: { backgroundColor: STORY_BG, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 38, gap: 18, maxHeight: '92%', width: '100%', maxWidth: 660, alignSelf: 'center' },
  kicker: { letterSpacing: 2, textTransform: 'uppercase' },
});

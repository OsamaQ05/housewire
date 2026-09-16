import { Ionicons } from '@expo/vector-icons';
import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, type TextProps, View } from 'react-native';
import { useHousewireTheme } from '@/src/theme';

export const light = { ink: '#112E36', background: '#0A2029', panel: '#143B43', line: '#39606A', paper: '#FFF0CE', muted: '#B6CCD0', gold: '#E8BD75', mint: '#8DD7BB', red: '#FF947F' };
export function Copy({ kind = 'body', pale = false, style, ...props }: TextProps & { kind?: 'body' | 'title' | 'display' | 'label'; pale?: boolean }) {
  const { theme } = useHousewireTheme();
  return <Text {...props} style={[{ color: pale ? light.muted : light.paper, fontFamily: kind === 'display' || kind === 'title' ? theme.typography.families.storyBold : kind === 'label' ? theme.typography.families.bodyMedium : theme.typography.families.body, fontSize: kind === 'display' ? 54 : kind === 'title' ? 29 : kind === 'label' ? 12 : 15, lineHeight: kind === 'display' ? 56 : kind === 'title' ? 32 : kind === 'label' ? 18 : 22 }, style]} />;
}
export function Action({ children, onPress, disabled = false, secondary = false, icon }: PropsWithChildren<{ onPress(): void; disabled?: boolean; secondary?: boolean; icon?: keyof typeof Ionicons.glyphMap }>) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [kit.button, { backgroundColor: secondary ? light.panel : light.gold, borderColor: secondary ? light.line : light.gold, opacity: disabled ? 0.42 : pressed ? 0.75 : 1 }]}>
    {icon ? <Ionicons name={icon} color={secondary ? light.paper : light.ink} size={20} /> : null}<Copy style={{ color: secondary ? light.paper : light.ink, fontWeight: '700', textAlign: 'center' }}>{children}</Copy>
  </Pressable>;
}
export function Stamp({ children }: PropsWithChildren) { return <View style={kit.stamp}><Copy kind="label" style={{ color: light.gold, letterSpacing: 1 }}>{children}</Copy></View>; }
export const kit = StyleSheet.create({
  page: { gap: 19, padding: 20, paddingBottom: 42, width: '100%', maxWidth: 620, alignSelf: 'center' },
  button: { borderWidth: 1, borderRadius: 15, minHeight: 54, padding: 13, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stamp: { borderWidth: 1, borderColor: light.line, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  input: { color: light.paper, backgroundColor: light.panel, borderColor: light.line, borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 52, fontSize: 16 },
  error: { backgroundColor: '#4B2C2A', borderRadius: 12, padding: 13, borderLeftWidth: 3, borderLeftColor: light.red },
});

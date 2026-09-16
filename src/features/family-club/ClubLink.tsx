import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useHousewireTheme } from '../../theme';

export function ClubLink({ label = 'Your Family Club', detail }: { label?: string; detail?: string }) {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  return <Pressable accessibilityRole="button" onPress={() => router.push('/family')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 62, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.draft, backgroundColor: theme.colors.surface, opacity: pressed ? 0.7 : 1 })}>
    <Ionicons name="trophy-outline" color={theme.colors.warning} size={25} />
    <View style={{ flex: 1, gap: 3 }}><Text style={{ color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium, fontSize: 16 }}>{label}</Text>{detail ? <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{detail}</Text> : null}</View>
    <Ionicons name="arrow-forward" color={theme.colors.muted} size={19} />
  </Pressable>;
}

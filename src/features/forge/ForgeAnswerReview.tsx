import { StyleSheet, Text, View } from 'react-native';
import { FORGE_MAX_ATTEMPTS, type ForgeAnswerReview as AnswerReview } from '../../domain/case-forge';
import { useHousewireTheme } from '../../theme';

export function ForgeTries({ used }: { used: number }) {
  const { theme } = useHousewireTheme();
  return <View accessibilityLiveRegion="polite" style={[styles.tries, { backgroundColor: theme.colors.surface, borderColor: used >= 3 ? theme.colors.warning : theme.colors.draft }]}>
    <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{FORGE_MAX_ATTEMPTS - used} tries left for this case</Text>
    <Text style={[styles.help, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Only wrong submitted answers count. After the last try, see what you missed.</Text>
  </View>;
}

export function ForgeAnswerReview({ entries }: { entries: readonly AnswerReview[] }) {
  const { theme } = useHousewireTheme();
  return <View style={styles.review}>
    <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>Here’s what you missed</Text>
    {entries.map((entry) => <View key={entry.stageId} style={[styles.entry, { borderColor: theme.colors.draft }]}>
      <Text style={[styles.label, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{entry.title}</Text>
      <Text selectable style={[styles.answer, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{entry.answer}</Text>
      <Text style={[styles.help, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{entry.explanation}</Text>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  tries: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 4 },
  label: { fontSize: 14, lineHeight: 20 },
  help: { fontSize: 12, lineHeight: 18 },
  review: { alignSelf: 'stretch', gap: 14 },
  title: { fontSize: 26 },
  entry: { paddingBottom: 16, borderBottomWidth: 1, gap: 7 },
  answer: { fontSize: 23, lineHeight: 29 },
});

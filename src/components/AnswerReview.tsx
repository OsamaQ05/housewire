import { Text, View } from 'react-native';
import { useHousewireTheme } from '../theme';

export interface AnswerReviewItem { title: string; answer: string; explanation?: string }
/** Call only from a terminal result screen, never from an active puzzle. */
export function AnswerReview({ items }: { items: readonly AnswerReviewItem[] }) {
  const { theme } = useHousewireTheme();
  return <View style={{ gap: 18 }}>
    <Text style={{ color: theme.colors.text, fontSize: 25, fontFamily: theme.typography.families.displayHeavy }}>What you missed</Text>
    <Text style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 20 }}>The run has ended. Here’s how the remaining puzzles worked.</Text>
    {items.map((item, i) => <View key={`${i}:${item.title}`} style={{ borderLeftWidth: 3, borderColor: theme.colors.ready, paddingLeft: 14, gap: 7 }}>
      <Text style={{ color: theme.colors.muted, fontSize: 13, fontFamily: theme.typography.families.bodyMedium }}>{item.title}</Text>
      <Text selectable style={{ color: theme.colors.text, fontSize: 19, lineHeight: 26, fontFamily: theme.typography.families.bodyMedium }}>{item.answer}</Text>
      {item.explanation ? <Text style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 21 }}>{item.explanation}</Text> : null}
    </View>)}
  </View>;
}

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { StagePressureAssessment } from '@/src/domain/director';
import { useHousewireTheme } from '@/src/theme';

export function AdaptiveGuideButton({
  accent,
  assessment,
  hintLevel,
  onPress,
}: {
  accent: string;
  assessment: StagePressureAssessment;
  hintLevel: number;
  onPress: () => void;
}) {
  const { theme } = useHousewireTheme();
  const ready = assessment.offerHint || hintLevel > 0;
  const activeBars = ready ? 3 : assessment.pressure >= 0.36 ? 2 : 1;
  const status = 'No spoilers';
  const color = ready ? accent : theme.colors.muted;

  return (
    <Pressable
      accessibilityHint="Ask a question about the rules without revealing a solution"
      accessibilityLabel="Ask the guide"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, { borderColor: ready ? accent : theme.colors.draft }, pressed && styles.pressed]}
    >
      <View style={styles.meter}>
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={[
              styles.meterBar,
              { backgroundColor: index < activeBars ? color : theme.colors.draft, height: 5 + index * 3 },
            ]}
          />
        ))}
      </View>
      <View>
        <Text style={[styles.eyebrow, { color, fontFamily: theme.typography.families.bodyMedium }]}>Ask the guide</Text>
        <Text style={[styles.status, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{status}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 42, paddingHorizontal: 10, paddingVertical: 6 },
  eyebrow: { fontSize: 11, lineHeight: 14 },
  meter: { alignItems: 'flex-end', flexDirection: 'row', gap: 2 },
  meterBar: { width: 3 },
  pressed: { opacity: 0.7 },
  status: { fontSize: 11, lineHeight: 14 },
});

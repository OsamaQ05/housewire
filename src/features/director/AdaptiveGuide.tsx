import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import type { StagePressureAssessment } from '@/src/domain/director';
import { useHousewireTheme } from '@/src/theme';

const TIER_LABELS = ['small nudge', 'connect the clues', 'strong hint'] as const;

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
  const status = hintLevel > 0
    ? `Hint ${hintLevel}`
    : assessment.offerHint
      ? 'Hint ready'
      : assessment.pressure >= 0.36
        ? 'Might help'
        : 'Available';
  const color = ready ? accent : theme.colors.muted;

  return (
    <Pressable
      accessibilityHint="Opens a progressive clue chosen from play pace and retries"
      accessibilityLabel={`Hint guide, ${status.toLowerCase()}`}
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
        <Text style={[styles.eyebrow, { color, fontFamily: theme.typography.families.bodyMedium }]}>Hint guide</Text>
        <Text style={[styles.status, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{status}</Text>
      </View>
    </Pressable>
  );
}

export function AdaptiveGuidePanel({
  accent,
  assessment,
  hint,
  level,
  maximum = 3,
  onClose,
  onNext,
}: {
  accent: string;
  assessment: StagePressureAssessment;
  hint: string;
  level: number;
  maximum?: number;
  onClose: () => void;
  onNext: () => void;
}) {
  const { theme } = useHousewireTheme();
  const tier = TIER_LABELS[Math.max(0, Math.min(TIER_LABELS.length - 1, level - 1))];
  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOut.duration(150)}
      style={[styles.panel, { backgroundColor: theme.colors.surfaceRaised, borderColor: accent }]}
    >
      <View style={styles.topline}>
        <View style={styles.identity}>
          <View style={[styles.pulse, { backgroundColor: accent }]} />
          <Text style={[styles.panelLabel, { color: accent, fontFamily: theme.typography.families.bodyMedium }]}>Hint {level} of {maximum} · {tier}</Text>
        </View>
        <Pressable accessibilityLabel="Close guide" accessibilityRole="button" hitSlop={10} onPress={onClose}>
          <Ionicons color={theme.colors.muted} name="close" size={20} />
        </Pressable>
      </View>
      <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Try this next</Text>
      <Text style={[styles.hint, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{hint}</Text>
      <View style={[styles.why, { borderColor: theme.colors.draft }]}>
        <Ionicons color={theme.colors.muted} name="pulse-outline" size={16} />
        <Text style={[styles.whyText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{assessment.summary}</Text>
      </View>
      <Text style={[styles.privacy, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>Uses only time, attempts, and sensor status. It never reads camera or voice.</Text>
      {level < maximum ? (
        <Pressable accessibilityRole="button" onPress={onNext} style={({ pressed }) => [styles.next, { borderColor: accent }, pressed && styles.pressed]}>
          <Text style={[styles.nextText, { color: accent, fontFamily: theme.typography.families.bodyMedium }]}>Give us a stronger hint</Text>
          <Ionicons color={accent} name="arrow-forward" size={18} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 42, paddingHorizontal: 10, paddingVertical: 6 },
  eyebrow: { fontSize: 11, lineHeight: 14 },
  hint: { fontSize: 18, lineHeight: 24 },
  identity: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  meter: { alignItems: 'flex-end', flexDirection: 'row', gap: 2 },
  meterBar: { width: 3 },
  next: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, marginTop: 2, paddingHorizontal: 12, paddingVertical: 9 },
  nextText: { fontSize: 13 },
  panel: { borderRadius: 18, borderWidth: 1, gap: 9, padding: 15 },
  panelLabel: { fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.7 },
  privacy: { fontSize: 11, lineHeight: 15 },
  pulse: { borderRadius: 5, height: 7, width: 7 },
  status: { fontSize: 11, lineHeight: 14 },
  title: { fontSize: 25, lineHeight: 27 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  why: { alignItems: 'flex-start', borderTopWidth: 1, flexDirection: 'row', gap: 8, paddingTop: 9 },
  whyText: { flex: 1, fontSize: 12, lineHeight: 17 },
});

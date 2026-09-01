import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useHousewireTheme } from '../theme';
import { decorativeAccessibilityProps } from '../utils/accessibility';
import { OperationalLabel, type OperationalLabelTone } from './OperationalLabel';

export interface SectionHeaderProps {
  accent?: string;
  description?: string;
  eyebrow?: string;
  index?: string;
  level?: 1 | 2;
  style?: StyleProp<ViewStyle>;
  title: string;
  trailing?: ReactNode;
}

export function SectionHeader({
  accent,
  description,
  eyebrow,
  index,
  level = 1,
  style,
  title,
  trailing,
}: SectionHeaderProps) {
  const { theme } = useHousewireTheme();
  const resolvedAccent = accent ?? theme.colors.wire;
  const eyebrowTone: OperationalLabelTone = accent ? 'default' : 'wire';

  return (
    <View accessibilityRole="header" style={[styles.container, style]}>
      <View style={styles.topline}>
        {eyebrow ? (
          <OperationalLabel textStyle={accent ? { color: accent } : undefined} tone={eyebrowTone}>
            {eyebrow}
          </OperationalLabel>
        ) : (
          <View />
        )}
        {trailing}
      </View>
      <View style={styles.titleRow}>
        {index ? (
          <Text
            {...decorativeAccessibilityProps}
            style={[
              styles.index,
              {
                color: resolvedAccent,
                fontFamily: theme.typography.families.monoMedium,
              },
            ]}
          >
            {index}
          </Text>
        ) : null}
        <Text
          maxFontSizeMultiplier={1.25}
          style={[
            styles.title,
            level === 2 && styles.titleSmall,
            {
              color: theme.colors.text,
              fontFamily: theme.typography.families.displayHeavy,
            },
          ]}
        >
          {title}
        </Text>
      </View>
      <View style={styles.ruleRow}>
        <View style={[styles.ruleAccent, { backgroundColor: resolvedAccent }]} />
        <View style={[styles.rule, { backgroundColor: theme.colors.draft }]} />
      </View>
      {description ? (
        <Text
          maxFontSizeMultiplier={1.45}
          style={[
            styles.description,
            {
              color: theme.colors.muted,
              fontFamily: theme.typography.families.body,
            },
          ]}
        >
          {description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  description: {
    fontSize: 17,
    lineHeight: 24,
    maxWidth: 560,
  },
  index: {
    fontSize: 12,
    letterSpacing: 1.4,
    lineHeight: 18,
    marginTop: 7,
  },
  rule: {
    flex: 1,
    height: 1,
  },
  ruleAccent: {
    height: 3,
    width: 56,
  },
  ruleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  title: {
    flexShrink: 1,
    fontSize: 46,
    letterSpacing: 0.2,
    lineHeight: 43,
    textTransform: 'uppercase',
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  titleSmall: {
    fontSize: 34,
    lineHeight: 34,
  },
  topline: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 18,
  },
});

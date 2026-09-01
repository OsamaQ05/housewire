import React, { type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { statusColor, type HousewireStatus, useHousewireTheme } from '../theme';
import { decorativeAccessibilityProps } from '../utils/accessibility';

export type OperationalLabelTone = 'default' | 'muted' | 'wire' | 'ready' | 'warning' | 'fault';

export interface OperationalLabelProps {
  children: ReactNode;
  accessibilityLabel?: string;
  indicator?: boolean;
  orientation?: 'horizontal' | 'vertical';
  size?: 'xs' | 'sm' | 'md';
  status?: HousewireStatus;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  tone?: OperationalLabelTone;
}

export function OperationalLabel({
  children,
  accessibilityLabel,
  indicator = false,
  orientation = 'horizontal',
  size = 'sm',
  status,
  style,
  textStyle,
  tone = 'default',
}: OperationalLabelProps) {
  const { theme } = useHousewireTheme();
  const color = status ? statusColor(theme, status) : resolveTone(theme.colors, tone);
  const fontSize = size === 'xs' ? 9 : size === 'md' ? 13 : 11;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.row,
        orientation === 'vertical' && styles.vertical,
        style,
      ]}
    >
      {indicator ? (
        <View
          {...decorativeAccessibilityProps}
          style={[
            styles.indicator,
            {
              backgroundColor: status === 'offline' || status === 'lost' ? 'transparent' : color,
              borderColor: color,
            },
          ]}
        />
      ) : null}
      <Text
        maxFontSizeMultiplier={1.35}
        style={[
          styles.text,
          {
            color,
            fontFamily: theme.typography.families.monoMedium,
            fontSize,
            lineHeight: fontSize + 5,
          },
          textStyle,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

function resolveTone(
  colors: ReturnType<typeof useHousewireTheme>['theme']['colors'],
  tone: OperationalLabelTone,
): string {
  switch (tone) {
    case 'muted':
      return colors.muted;
    case 'wire':
      return colors.wire;
    case 'ready':
      return colors.ready;
    case 'warning':
      return colors.warning;
    case 'fault':
      return colors.fault;
    case 'default':
    default:
      return colors.text;
  }
}

const styles = StyleSheet.create({
  indicator: {
    borderWidth: 1,
    height: 7,
    width: 7,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  text: {
    letterSpacing: 1.35,
    textTransform: 'uppercase',
  },
  vertical: {
    transform: [{ rotate: '90deg' }],
  },
});

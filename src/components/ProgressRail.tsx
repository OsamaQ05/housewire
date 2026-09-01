import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useHousewireTheme } from '../theme';
import { decorativeAccessibilityProps } from '../utils/accessibility';

export interface ProgressRailProps {
  accessibilityLabel?: string;
  animated?: boolean;
  color?: string;
  label?: string;
  orientation?: 'horizontal' | 'vertical';
  progress: number;
  segments?: number;
  showValue?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ProgressRail({
  accessibilityLabel = 'Mission progress',
  animated = true,
  color,
  label,
  orientation = 'horizontal',
  progress,
  segments = 0,
  showValue = false,
  style,
}: ProgressRailProps) {
  const { reducedMotion, theme } = useHousewireTheme();
  const value = clamp01(progress);
  const sharedProgress = useSharedValue(value);
  const vertical = orientation === 'vertical';

  useEffect(() => {
    sharedProgress.value = !animated || reducedMotion
      ? value
      : withTiming(value, {
          duration: 480,
          easing: Easing.out(Easing.cubic),
        });
  }, [animated, reducedMotion, sharedProgress, value]);

  const horizontalFill = useAnimatedStyle(() => ({
    width: `${sharedProgress.value * 100}%` as `${number}%`,
  }));
  const verticalFill = useAnimatedStyle(() => ({
    height: `${sharedProgress.value * 100}%` as `${number}%`,
  }));
  const fillColor = color ?? theme.colors.wire;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: Math.round(value * 100) }}
      style={[vertical ? styles.verticalContainer : styles.container, style]}
    >
      {label || showValue ? (
        <View style={vertical ? styles.verticalCopy : styles.copy}>
          {label ? (
            <Text
              style={[
                styles.label,
                {
                  color: theme.colors.muted,
                  fontFamily: theme.typography.families.monoMedium,
                },
              ]}
            >
              {label.toUpperCase()}
            </Text>
          ) : null}
          {showValue ? (
            <Text
              style={[
                styles.value,
                {
                  color: fillColor,
                  fontFamily: theme.typography.families.monoMedium,
                },
              ]}
            >
              {String(Math.round(value * 100)).padStart(2, '0')}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View
        {...decorativeAccessibilityProps}
        style={[
          vertical ? styles.verticalTrack : styles.track,
          { backgroundColor: theme.colors.draft },
        ]}
      >
        <Animated.View
          style={[
            vertical ? styles.verticalFill : styles.fill,
            { backgroundColor: fillColor },
            vertical ? verticalFill : horizontalFill,
          ]}
        />
        {segments > 1
          ? Array.from({ length: segments - 1 }, (_, index) => {
              const position = `${((index + 1) / segments) * 100}%` as `${number}%`;
              return (
                <View
                  key={position}
                  style={[
                    styles.tick,
                    vertical
                      ? { left: 0, right: 0, top: position }
                      : { bottom: 0, left: position, top: 0 },
                    { backgroundColor: theme.colors.background },
                  ]}
                />
              );
            })
          : null}
      </View>
    </View>
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    width: '100%',
  },
  copy: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fill: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.2,
    lineHeight: 14,
  },
  tick: {
    height: 1,
    position: 'absolute',
    width: 1,
  },
  track: {
    height: 4,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  value: {
    fontSize: 11,
    letterSpacing: 1,
    lineHeight: 14,
  },
  verticalContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    height: '100%',
  },
  verticalCopy: {
    alignItems: 'center',
    gap: 8,
  },
  verticalFill: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  verticalTrack: {
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
    width: 4,
  },
});

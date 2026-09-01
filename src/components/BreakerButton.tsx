import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useHousewireTheme } from '../theme';
import { decorativeAccessibilityProps } from '../utils/accessibility';
import { OperationalLabel } from './OperationalLabel';

export type BreakerButtonVariant = 'wire' | 'secondary' | 'ready' | 'fault';
export type BreakerHaptic = 'none' | 'selection' | 'rigid' | 'medium' | 'success' | 'warning' | 'error';

export interface BreakerButtonProps
  extends Omit<PressableProps, 'children' | 'style' | 'onPressIn' | 'onPressOut'> {
  haptic?: BreakerHaptic;
  index?: string;
  label: string;
  loading?: boolean;
  onPressIn?: PressableProps['onPressIn'];
  onPressOut?: PressableProps['onPressOut'];
  overline?: string;
  style?: StyleProp<ViewStyle>;
  variant?: BreakerButtonVariant;
}

export function BreakerButton({
  accessibilityHint,
  accessibilityLabel,
  accessibilityState,
  disabled,
  haptic = 'selection',
  index,
  label,
  loading = false,
  onPress,
  onPressIn,
  onPressOut,
  overline,
  style,
  variant = 'wire',
  ...pressableProps
}: BreakerButtonProps) {
  const { reducedMotion, theme } = useHousewireTheme();
  const press = useSharedValue(0);
  const isDisabled = disabled || loading;
  const treatment = resolveTreatment(theme.colors, variant);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: isDisabled ? 0.48 : 1,
    transform: [{ translateY: press.value * 2 }, { scaleY: 1 - press.value * 0.018 }],
  }));

  const setPressed = (value: number) => {
    press.value = reducedMotion
      ? value
      : withTiming(value, {
          duration: value === 1 ? 70 : 110,
          easing: Easing.out(Easing.cubic),
        });
  };

  const handlePress = (event: GestureResponderEvent) => {
    if (haptic !== 'none') {
      void playBreakerHaptic(haptic);
    }
    onPress?.(event);
  };

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        busy: loading || accessibilityState?.busy,
        disabled: isDisabled || accessibilityState?.disabled,
      }}
      disabled={isDisabled}
      hitSlop={6}
      onPress={handlePress}
      onPressIn={(event) => {
        setPressed(1);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(0);
        onPressOut?.(event);
      }}
      style={style}
      {...pressableProps}
    >
      <Animated.View
        style={[
          styles.body,
          {
            backgroundColor: treatment.background,
            borderColor: treatment.border,
          },
          animatedStyle,
        ]}
      >
        <View style={[styles.bus, { backgroundColor: treatment.accent }]} />
        <View style={styles.copy}>
          {overline ? (
            <OperationalLabel
              size="xs"
              textStyle={{ color: treatment.text, opacity: 0.78 }}
            >
              {overline}
            </OperationalLabel>
          ) : null}
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={2}
            style={[
              styles.label,
              {
                color: treatment.text,
                fontFamily: theme.typography.families.display,
              },
            ]}
          >
            {label}
          </Text>
        </View>
        <View style={styles.terminal}>
          {loading ? (
            <ActivityIndicator color={treatment.text} size="small" />
          ) : (
            <>
              <Text
                {...decorativeAccessibilityProps}
                style={[
                  styles.index,
                  {
                    color: treatment.text,
                    fontFamily: theme.typography.families.monoMedium,
                  },
                ]}
              >
                {index ?? '↳'}
              </Text>
              <View style={[styles.contact, { borderColor: treatment.text }]} />
            </>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

async function playBreakerHaptic(haptic: BreakerHaptic): Promise<void> {
  switch (haptic) {
    case 'rigid':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    case 'medium':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case 'success':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    case 'warning':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    case 'error':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    case 'selection':
    default:
      return Haptics.selectionAsync();
  }
}

function resolveTreatment(
  colors: ReturnType<typeof useHousewireTheme>['theme']['colors'],
  variant: BreakerButtonVariant,
) {
  switch (variant) {
    case 'secondary':
      return {
        accent: colors.muted,
        background: 'transparent',
        border: colors.draft,
        text: colors.text,
      };
    case 'ready':
      return {
        accent: colors.ready,
        background: colors.ready,
        border: colors.ready,
        text: colors.background,
      };
    case 'fault':
      return {
        accent: colors.fault,
        background: 'transparent',
        border: colors.fault,
        text: colors.fault,
      };
    case 'wire':
    default:
      return {
        accent: colors.textInverse,
        background: colors.wire,
        border: colors.wire,
        text: colors.textInverse,
      };
  }
}

const styles = StyleSheet.create({
  body: {
    alignItems: 'stretch',
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 62,
    overflow: 'hidden',
  },
  bus: {
    width: 5,
  },
  contact: {
    borderWidth: 1,
    height: 9,
    width: 9,
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  index: {
    fontSize: 11,
    letterSpacing: 1,
  },
  label: {
    fontSize: 25,
    letterSpacing: 0.6,
    lineHeight: 26,
    textTransform: 'uppercase',
  },
  terminal: {
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 50,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
});

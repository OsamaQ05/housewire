import React, { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';

import { useHousewireTheme } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface SignalPoint {
  x: number;
  y: number;
}

export interface SignalPulseProps {
  accessibilityLabel?: string;
  active?: boolean;
  color?: string;
  delay?: number;
  duration?: number;
  end?: SignalPoint;
  height?: number;
  loop?: boolean;
  showRail?: boolean;
  size?: number;
  start?: SignalPoint;
  style?: StyleProp<ViewStyle>;
  width?: number;
}

/** A straight, scheduled signal run suitable for edge-to-edge device transitions. */
export function SignalPulse({
  accessibilityLabel = 'Signal moving through this node',
  active = true,
  color,
  delay = 0,
  duration = 900,
  end,
  height = 24,
  loop = false,
  showRail = true,
  size = 5,
  start,
  style,
  width = 320,
}: SignalPulseProps) {
  const { reducedMotion, theme } = useHousewireTheme();
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  const from = start ?? { x: 0, y: height / 2 };
  const to = end ?? { x: width, y: height / 2 };
  const resolvedColor = color ?? theme.colors.wire;

  useEffect(() => {
    cancelAnimation(progress);

    if (!active) {
      progress.value = 0;
      return;
    }
    if (reducedMotion) {
      progress.value = 1;
      return;
    }

    progress.value = 0;
    const travel = withTiming(1, {
      duration,
      easing: Easing.linear,
    });
    progress.value = withDelay(delay, loop ? withRepeat(travel, -1, false) : travel);

    return () => cancelAnimation(progress);
  }, [active, delay, duration, loop, progress, reducedMotion]);

  const animatedProps = useAnimatedProps(() => ({
    cx: from.x + (to.x - from.x) * progress.value,
    cy: from.y + (to.y - from.y) * progress.value,
    opacity: active ? 1 : 0,
  }));

  return (
    <View
      accessible={active}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={[{ height, pointerEvents: 'none', width }, style]}
    >
      <Svg height={height} viewBox={`0 0 ${width} ${height}`} width={width}>
        {showRail ? (
          <Line
            opacity={0.5}
            stroke={theme.colors.draft}
            strokeWidth={1}
            x1={from.x}
            x2={to.x}
            y1={from.y}
            y2={to.y}
          />
        ) : null}
        <AnimatedCircle
          animatedProps={animatedProps}
          fill={resolvedColor}
          opacity={0.12}
          r={size * 2.6}
        />
        <AnimatedCircle animatedProps={animatedProps} fill={resolvedColor} r={size} />
      </Svg>
    </View>
  );
}

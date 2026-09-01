import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';

import { useHousewireTheme } from '../theme';
import { decorativeAccessibilityProps } from '../utils/accessibility';

export interface TextureOverlayProps {
  color?: string;
  density?: 'quiet' | 'normal';
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}

/** A deterministic, code-native drafting texture. It never intercepts input. */
export function TextureOverlay({
  color,
  density = 'quiet',
  opacity,
  style,
}: TextureOverlayProps) {
  const { theme } = useHousewireTheme();
  const unit = density === 'quiet' ? 42 : 28;
  const resolvedOpacity = opacity ?? (theme.highContrast ? 0.045 : 0.025);

  return (
    <View
      {...decorativeAccessibilityProps}
      style={[StyleSheet.absoluteFill, styles.overlay, styles.passive, style]}
    >
      <Svg height="100%" width="100%">
        <Defs>
          <Pattern
            height={unit}
            id="housewire-draft-grain"
            patternUnits="userSpaceOnUse"
            width={unit}
          >
            <Circle cx={4} cy={5} fill={color ?? theme.colors.texture} r={0.7} />
            <Circle
              cx={unit - 8}
              cy={unit - 11}
              fill={color ?? theme.colors.texture}
              r={0.45}
            />
            <Line
              stroke={color ?? theme.colors.texture}
              strokeWidth={0.45}
              x1={unit * 0.38}
              x2={unit * 0.68}
              y1={unit * 0.72}
              y2={unit * 0.7}
            />
          </Pattern>
        </Defs>
        <Rect
          fill="url(#housewire-draft-grain)"
          height="100%"
          opacity={resolvedOpacity}
          width="100%"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    overflow: 'hidden',
  },
  passive: {
    pointerEvents: 'none',
  },
});

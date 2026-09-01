import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Rect } from 'react-native-svg';

import { type HousewireRole, useHousewireTheme } from '../theme';
import {
  decorativeAccessibilityProps,
  nativeImportantAccessibilityProps,
} from '../utils/accessibility';

export interface RoleSigilProps {
  accessibilityLabel?: string;
  color?: string;
  role: HousewireRole;
  size?: number;
  style?: ViewStyle;
}

export function RoleSigil({
  accessibilityLabel,
  color,
  role,
  size = 32,
  style,
}: RoleSigilProps) {
  const { theme } = useHousewireTheme();
  const stroke = color ?? theme.colors.roles[role];

  return (
    <View
      {...(accessibilityLabel
        ? nativeImportantAccessibilityProps
        : decorativeAccessibilityProps)}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      style={[{ height: size, width: size }, style]}
    >
      <Svg height={size} viewBox="0 0 48 48" width={size}>
        <G
          fill="none"
          stroke={stroke}
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeWidth={2.4}
        >
          {role === 'relay' ? <RelayGlyph /> : null}
          {role === 'listener' ? <ListenerGlyph /> : null}
          {role === 'navigator' ? <NavigatorGlyph /> : null}
          {role === 'breaker' ? <BreakerGlyph /> : null}
        </G>
      </Svg>
    </View>
  );
}

function RelayGlyph() {
  return (
    <>
      <Line x1="7" x2="20" y1="24" y2="24" />
      <Line x1="20" x2="31" y1="24" y2="13" />
      <Line x1="20" x2="31" y1="24" y2="35" />
      <Line x1="31" x2="41" y1="13" y2="13" />
      <Line x1="31" x2="41" y1="35" y2="35" />
      <Circle cx="7" cy="24" fill="none" r="3" />
      <Circle cx="41" cy="13" fill="none" r="3" />
      <Circle cx="41" cy="35" fill="none" r="3" />
      <Rect height="6" width="6" x="17" y="21" />
    </>
  );
}

function ListenerGlyph() {
  return (
    <>
      <Circle cx="12" cy="24" fill="none" r="3" />
      <Line x1="15" x2="23" y1="24" y2="24" />
      <Path d="M24 17 C31 19 31 29 24 31" />
      <Path d="M29 12 C41 17 41 31 29 36" />
      <Line x1="37" x2="43" y1="24" y2="24" />
    </>
  );
}

function NavigatorGlyph() {
  return (
    <>
      <Circle cx="24" cy="24" fill="none" r="16" />
      <Polyline points="24,6 29,22 24,42 19,26 24,6" />
      <Line x1="8" x2="40" y1="24" y2="24" />
      <Circle cx="24" cy="24" fill="none" r="3" />
    </>
  );
}

function BreakerGlyph() {
  return (
    <>
      <Line x1="6" x2="18" y1="31" y2="31" />
      <Line x1="30" x2="42" y1="31" y2="31" />
      <Circle cx="18" cy="31" fill="none" r="3" />
      <Circle cx="30" cy="31" fill="none" r="3" />
      <Line x1="19" x2="32" y1="27" y2="14" />
      <Line x1="24" x2="24" y1="7" y2="15" />
      <Line x1="20" x2="28" y1="7" y2="7" />
    </>
  );
}

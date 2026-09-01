import { StatusBar } from 'expo-status-bar';
import React, { type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useHousewireTheme } from '../theme';
import { decorativeAccessibilityProps } from '../utils/accessibility';
import { TextureOverlay } from './TextureOverlay';

export interface ScreenShellProps extends Omit<ViewProps, 'children' | 'style'> {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  edgeWire?: 'none' | 'left' | 'right' | 'both';
  manageStatusBar?: boolean;
  padded?: boolean;
  safeEdges?: Edge[];
  style?: StyleProp<ViewStyle>;
  texture?: boolean;
}

export function ScreenShell({
  children,
  contentStyle,
  edgeWire = 'none',
  manageStatusBar = true,
  padded = true,
  safeEdges = ['top', 'right', 'bottom', 'left'],
  style,
  texture = true,
  ...viewProps
}: ScreenShellProps) {
  const { theme } = useHousewireTheme();

  return (
    <SafeAreaView
      edges={safeEdges}
      style={[styles.safeArea, { backgroundColor: theme.colors.background }, style]}
      {...viewProps}
    >
      {manageStatusBar ? (
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      ) : null}
      {texture ? <TextureOverlay /> : null}
      {edgeWire === 'left' || edgeWire === 'both' ? (
        <View
          {...decorativeAccessibilityProps}
          style={[styles.edgeWire, styles.edgeLeft, { backgroundColor: theme.colors.wire }]}
        />
      ) : null}
      {edgeWire === 'right' || edgeWire === 'both' ? (
        <View
          {...decorativeAccessibilityProps}
          style={[styles.edgeWire, styles.edgeRight, { backgroundColor: theme.colors.wire }]}
        />
      ) : null}
      <View style={[styles.content, padded && styles.padded, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    zIndex: 1,
  },
  edgeLeft: {
    left: 0,
  },
  edgeRight: {
    right: 0,
  },
  edgeWire: {
    bottom: '14%',
    position: 'absolute',
    pointerEvents: 'none',
    top: '14%',
    width: 3,
    zIndex: 2,
  },
  padded: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  safeArea: {
    flex: 1,
    overflow: 'hidden',
  },
});

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  statusColor,
  type HousewireRole,
  type HousewireStatus,
  useHousewireTheme,
} from '../theme';
import { OperationalLabel } from './OperationalLabel';
import { RoleSigil } from './RoleSigil';
import { decorativeAccessibilityProps } from '../utils/accessibility';

export interface NodePlateProps {
  accent?: string;
  accessibilityLabel?: string;
  callsign?: string;
  compact?: boolean;
  node: number | string;
  onPress?: (event: GestureResponderEvent) => void;
  role?: HousewireRole;
  room: string;
  status?: HousewireStatus;
  style?: StyleProp<ViewStyle>;
}

export function NodePlate({
  accent,
  accessibilityLabel,
  callsign,
  compact = false,
  node,
  onPress,
  role,
  room,
  status = 'idle',
  style,
}: NodePlateProps) {
  const { theme } = useHousewireTheme();
  const resolvedAccent = accent ?? (role ? theme.colors.roles[role] : statusColor(theme, status));
  const number = String(node).padStart(2, '0');
  const content = (
    <>
      <View
        {...decorativeAccessibilityProps}
        style={[styles.liveBus, { backgroundColor: resolvedAccent }]}
      />
      <View style={[styles.terminal, { borderColor: resolvedAccent }]}>
        <View style={[styles.terminalCore, { backgroundColor: resolvedAccent }]} />
      </View>
      <View style={[styles.copy, compact && styles.copyCompact]}>
        <OperationalLabel indicator size="xs" status={status}>
          {status === 'lost' ? 'node lost' : status}
        </OperationalLabel>
        <Text
          maxFontSizeMultiplier={1.2}
          style={[
            styles.room,
            compact && styles.roomCompact,
            {
              color: theme.colors.text,
              fontFamily: theme.typography.families.display,
            },
          ]}
        >
          {room}
        </Text>
        {callsign ? (
          <Text
            maxFontSizeMultiplier={1.35}
            numberOfLines={1}
            style={[
              styles.callsign,
              {
                color: theme.colors.muted,
                fontFamily: theme.typography.families.body,
              },
            ]}
          >
            {callsign}
          </Text>
        ) : null}
      </View>
      <View style={styles.identity}>
        {role ? <RoleSigil color={resolvedAccent} role={role} size={compact ? 26 : 34} /> : null}
        <Text
          {...decorativeAccessibilityProps}
          style={[
            styles.number,
            compact && styles.numberCompact,
            {
              color: resolvedAccent,
              fontFamily: theme.typography.families.displayHeavy,
            },
          ]}
        >
          {number}
        </Text>
      </View>
    </>
  );
  const baseStyle = [
    styles.plate,
    compact && styles.plateCompact,
    { backgroundColor: theme.colors.surface, borderColor: theme.colors.draft },
    status === 'lost' && styles.lost,
    style,
  ];
  const label =
    accessibilityLabel ??
    `Node ${number}, ${room}${callsign ? `, ${callsign}` : ''}, status ${status}`;

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled: status === 'lost' }}
        disabled={status === 'lost'}
        onPress={onPress}
        style={({ pressed }) => [baseStyle, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View accessible accessibilityLabel={label} style={baseStyle}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  callsign: {
    fontSize: 13,
    lineHeight: 18,
  },
  copy: {
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  copyCompact: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  identity: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  liveBus: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 4,
  },
  lost: {
    opacity: 0.58,
  },
  number: {
    fontSize: 43,
    letterSpacing: -1,
    lineHeight: 40,
  },
  numberCompact: {
    fontSize: 33,
    lineHeight: 31,
  },
  plate: {
    alignItems: 'stretch',
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 104,
    overflow: 'hidden',
    paddingLeft: 15,
  },
  plateCompact: {
    minHeight: 82,
    paddingLeft: 12,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ translateY: 1 }],
  },
  room: {
    fontSize: 28,
    letterSpacing: 0.45,
    lineHeight: 29,
    textTransform: 'uppercase',
  },
  roomCompact: {
    fontSize: 23,
    lineHeight: 24,
  },
  terminal: {
    alignItems: 'center',
    alignSelf: 'center',
    borderWidth: 1,
    height: 16,
    justifyContent: 'center',
    left: 7,
    position: 'absolute',
    width: 16,
  },
  terminalCore: {
    height: 4,
    width: 4,
  },
});

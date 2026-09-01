import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { useHousewireTheme } from '@/src/theme';

const FORGE_INK = '#F2D36D';
const FORGE_DARK = '#0A0B08';

export function ForgeGrid({ color = FORGE_INK }: { color?: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFillObject, styles.noPointerEvents]}>
      {Array.from({ length: 14 }, (_, index) => (
        <View key={`h-${index}`} style={[styles.gridHorizontal, { backgroundColor: color, top: `${index * 8}%` }]} />
      ))}
      {Array.from({ length: 8 }, (_, index) => (
        <View key={`v-${index}`} style={[styles.gridVertical, { backgroundColor: color, left: `${index * 15}%` }]} />
      ))}
    </View>
  );
}

export function ForgeDiagram({
  accent = FORGE_INK,
  playerCount,
  reducedMotion,
  working,
}: {
  accent?: string;
  playerCount: number;
  reducedMotion: boolean;
  working: boolean;
}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (working && !reducedMotion) {
      rotation.value = withRepeat(withTiming(360, { duration: 4_800, easing: Easing.linear }), -1, false);
    } else {
      rotation.value = withTiming(0, { duration: 280 });
    }
  }, [reducedMotion, rotation, working]);

  const rotorStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const nodeAngles = Array.from({ length: playerCount }, (_, index) => (index / playerCount) * Math.PI * 2 - Math.PI / 2);

  return (
    <View accessibilityLabel={`${playerCount} player case blueprint${working ? ', generating' : ''}`} style={styles.diagram}>
      <ForgeGrid color={accent} />
      <Animated.View style={[styles.rotor, rotorStyle]}>
        <Svg height="208" viewBox="0 0 208 208" width="208">
          <Circle cx="104" cy="104" fill="none" r="91" stroke={accent} strokeDasharray="2 9" strokeOpacity="0.5" strokeWidth="1" />
          <Circle cx="104" cy="104" fill="none" r="72" stroke={accent} strokeOpacity="0.28" strokeWidth="1" />
          <Path d="M104 13 L111 26 L97 26 Z" fill={accent} opacity="0.9" />
          <Line stroke={accent} strokeOpacity="0.36" x1="18" x2="190" y1="104" y2="104" />
          <Line stroke={accent} strokeOpacity="0.36" x1="104" x2="104" y1="18" y2="190" />
          {Array.from({ length: 12 }, (_, index) => {
            const angle = (index / 12) * Math.PI * 2;
            const x1 = 104 + Math.cos(angle) * 82;
            const y1 = 104 + Math.sin(angle) * 82;
            const x2 = 104 + Math.cos(angle) * 91;
            const y2 = 104 + Math.sin(angle) * 91;
            return <Line key={index} stroke={accent} strokeWidth={index % 3 === 0 ? 2 : 1} x1={x1} x2={x2} y1={y1} y2={y2} />;
          })}
        </Svg>
      </Animated.View>
      <View style={styles.blueprintCore}>
        <Svg height="154" viewBox="0 0 154 154" width="154">
          <Rect fill={FORGE_DARK} height="72" stroke={accent} strokeWidth="1.5" width="86" x="34" y="40" />
          <Path d="M34 63 H70 V40 M84 112 V83 H120 M70 63 H101 V83 H84" fill="none" stroke={accent} strokeOpacity="0.62" strokeWidth="1" />
          <Circle cx="77" cy="76" fill={accent} r="8" />
          <Circle cx="77" cy="76" fill={FORGE_DARK} r="3" />
          {nodeAngles.map((angle, index) => {
            const x = 77 + Math.cos(angle) * 59;
            const y = 76 + Math.sin(angle) * 59;
            return (
              <Circle
                cx={x}
                cy={y}
                fill={index === 0 ? accent : FORGE_DARK}
                key={index}
                r="6"
                stroke={accent}
                strokeWidth="2"
              />
            );
          })}
        </Svg>
      </View>
      <View style={[styles.diagramCaption, { borderColor: accent }]}>
        <Text style={[styles.diagramCaptionText, { color: accent }]}>HOUSEPRINT / {String(playerCount).padStart(2, '0')} NODES</Text>
      </View>
    </View>
  );
}

export function ForgeProgress({ current, total = 3 }: { current: number; total?: number }) {
  const { theme } = useHousewireTheme();
  return (
    <View accessibilityLabel={`Step ${current} of ${total}`} style={styles.progress}>
      {Array.from({ length: total }, (_, index) => {
        const active = index + 1 <= current;
        return (
          <View
            key={index}
            style={[
              styles.progressSegment,
              { backgroundColor: active ? FORGE_INK : theme.colors.draft, flex: index + 1 === current ? 2.4 : 1 },
            ]}
          />
        );
      })}
    </View>
  );
}

export interface ForgeOptionProps {
  detail?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  selected: boolean;
  style?: StyleProp<ViewStyle>;
  value?: string;
}

export function ForgeOption({ detail, icon, label, onPress, selected, style, value }: ForgeOptionProps) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: selected ? FORGE_INK : 'rgba(10,11,8,0.74)',
          borderColor: selected ? FORGE_INK : theme.colors.draft,
        },
        pressed && styles.pressed,
        style,
      ]}
    >
      {icon ? <Ionicons color={selected ? FORGE_DARK : theme.colors.muted} name={icon} size={20} /> : null}
      <View style={styles.optionCopy}>
        <Text style={[styles.optionLabel, { color: selected ? FORGE_DARK : theme.colors.text, fontFamily: theme.typography.families.display }]}>{label}</Text>
        {detail ? <Text numberOfLines={2} style={[styles.optionDetail, { color: selected ? '#39320E' : theme.colors.muted, fontFamily: theme.typography.families.body }]}>{detail}</Text> : null}
      </View>
      {value ? <Text style={[styles.optionValue, { color: selected ? FORGE_DARK : FORGE_INK, fontFamily: theme.typography.families.monoMedium }]}>{value}</Text> : null}
      <View style={[styles.optionPin, { borderColor: selected ? FORGE_DARK : theme.colors.faint }]}>
        {selected ? <View style={styles.optionPinCore} /> : null}
      </View>
    </Pressable>
  );
}

export function ForgeToggle({
  detail,
  icon,
  label,
  onPress,
  value,
}: {
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  value: boolean;
}) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={onPress}
      style={({ pressed }) => [styles.toggle, { borderColor: value ? FORGE_INK : theme.colors.draft }, pressed && styles.pressed]}
    >
      <Ionicons color={value ? FORGE_INK : theme.colors.muted} name={icon} size={22} />
      <View style={styles.optionCopy}>
        <Text style={[styles.toggleLabel, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{label}</Text>
        <Text style={[styles.toggleDetail, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{detail}</Text>
      </View>
      <View style={[styles.toggleTrack, { backgroundColor: value ? FORGE_INK : theme.colors.draft }]}>
        <View style={[styles.toggleKnob, { backgroundColor: value ? FORGE_DARK : theme.colors.muted, transform: [{ translateX: value ? 16 : 0 }] }]} />
      </View>
    </Pressable>
  );
}

export function ForgeButton({
  icon,
  label,
  onPress,
  secondary = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? 'transparent' : FORGE_INK,
          borderColor: secondary ? theme.colors.draft : FORGE_INK,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, { color: secondary ? theme.colors.text : FORGE_DARK, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
      <Ionicons color={secondary ? FORGE_INK : FORGE_DARK} name={icon} size={19} />
    </Pressable>
  );
}

export const forgeColors = {
  dark: FORGE_DARK,
  ink: FORGE_INK,
  orange: '#FF7048',
  paper: '#F2E8CF',
} as const;

const styles = StyleSheet.create({
  blueprintCore: { alignItems: 'center', height: 154, justifyContent: 'center', position: 'absolute', width: 154 },
  button: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'space-between', minHeight: 56, paddingHorizontal: 16 },
  buttonText: { fontSize: 17, lineHeight: 21 },
  diagram: { alignItems: 'center', alignSelf: 'center', height: 248, justifyContent: 'center', overflow: 'hidden', width: '100%' },
  diagramCaption: { backgroundColor: FORGE_DARK, borderWidth: 1, bottom: 5, paddingHorizontal: 9, paddingVertical: 5, position: 'absolute' },
  diagramCaptionText: { fontFamily: 'SplineSansMono_600SemiBold', fontSize: 8, letterSpacing: 1.2 },
  gridHorizontal: { height: StyleSheet.hairlineWidth, left: 0, opacity: 0.1, position: 'absolute', right: 0 },
  gridVertical: { bottom: 0, opacity: 0.1, position: 'absolute', top: 0, width: StyleSheet.hairlineWidth },
  noPointerEvents: { pointerEvents: 'none' },
  option: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 65, paddingHorizontal: 13, paddingVertical: 9 },
  optionCopy: { flex: 1 },
  optionDetail: { fontSize: 11, lineHeight: 15 },
  optionLabel: { fontSize: 21, lineHeight: 23, textTransform: 'uppercase' },
  optionPin: { alignItems: 'center', borderRadius: 10, borderWidth: 1, height: 15, justifyContent: 'center', width: 15 },
  optionPinCore: { backgroundColor: FORGE_DARK, borderRadius: 5, height: 7, width: 7 },
  optionValue: { fontSize: 10, letterSpacing: 0.8 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  progress: { flexDirection: 'row', gap: 4, height: 4 },
  progressSegment: { height: 4 },
  rotor: { alignItems: 'center', height: 208, justifyContent: 'center', position: 'absolute', width: 208 },
  toggle: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 11, minHeight: 72, paddingHorizontal: 4 },
  toggleDetail: { fontSize: 11, lineHeight: 15 },
  toggleKnob: { height: 16, width: 16 },
  toggleLabel: { fontSize: 20, lineHeight: 22, textTransform: 'uppercase' },
  toggleTrack: { height: 20, padding: 2, width: 36 },
});

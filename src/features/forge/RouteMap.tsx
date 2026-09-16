import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { canAppendRoute, routeLandmark } from '@/src/domain/case-forge/route-landmarks';
import { useHousewireTheme } from '@/src/theme';

import { forgeColors } from './ForgePrimitives';

/** Same landmark map on every phone; each clue draws only that role's doorways. */
export function RouteMap({ width, edges = [], route = [], startCell, exitCell, onRouteChange }: {
  width: 3 | 4;
  edges?: readonly (readonly [number, number])[];
  route?: readonly number[];
  startCell?: number;
  exitCell?: number;
  onRouteChange?: (route: number[]) => void;
}) {
  const { theme } = useHousewireTheme();
  const count = width * width;
  const step = 100 / width;
  const point = (cell: number) => ({ x: ((cell - 1) % width + 0.5) * step, y: (Math.floor((cell - 1) / width) + 0.5) * step });
  const lines = onRouteChange ? route.slice(1).map((cell, index) => [route[index], cell] as const) : edges;
  return (
    <View style={styles.wrap}>
      <View style={[styles.map, { borderColor: theme.colors.draft, backgroundColor: theme.colors.surface }]}>
        <Svg accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 100 100">
          {lines.map(([from, to]) => <Line key={`${from}-${to}`} x1={point(from).x} y1={point(from).y} x2={point(to).x} y2={point(to).y} stroke={forgeColors.ink} strokeWidth={onRouteChange ? 1.8 : 1.2} strokeLinecap="round" />)}
        </Svg>
        {Array.from({ length: count }, (_, index) => {
          const cell = index + 1;
          const landmark = routeLandmark(cell);
          const visited = route.includes(cell);
          const current = route.at(-1) === cell;
          const available = !!onRouteChange && canAppendRoute(route, cell, width, count);
          const endpoint = cell === startCell ? 'START' : cell === exitCell ? 'EXIT' : '';
          const color = visited ? forgeColors.dark : theme.colors.text;
          return (
            <Pressable key={cell} accessibilityLabel={`${landmark.label}${endpoint ? `, ${endpoint.toLowerCase()}` : ''}${visited ? `, step ${route.indexOf(cell) + 1}` : ''}${available ? ', next step available' : ''}`} accessibilityRole={onRouteChange ? 'button' : undefined} disabled={!available} onPress={() => onRouteChange?.([...route, cell])} style={[styles.place, { width: `${step}%`, height: `${step}%` }]}>
              <View style={[styles.node, { backgroundColor: visited ? forgeColors.ink : theme.colors.surface, borderColor: current || available ? forgeColors.ink : theme.colors.draft }]}><Ionicons name={landmark.icon} color={color} size={width === 4 ? 19 : 24} /></View>
              <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{landmark.label}</Text>
              <Text style={[styles.endpoint, { color: forgeColors.orange, fontFamily: theme.typography.families.monoMedium }]}>{endpoint || (visited ? String(route.indexOf(cell) + 1) : ' ')}</Text>
            </Pressable>
          );
        })}
      </View>
      {!onRouteChange ? <Text style={[styles.help, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Lines are open doorways. Tell the others: “{routeLandmark(edges[0]?.[0] ?? 1).label} connects to {routeLandmark(edges[0]?.[1] ?? 2).label}.” Their map has the missing doorways.</Text> : <Text accessibilityLiveRegion="polite" style={[styles.help, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{route.map((cell) => routeLandmark(cell).label).join(' → ')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  map: { aspectRatio: 1, width: '100%', maxWidth: 420, alignSelf: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
  place: { alignItems: 'center', justifyContent: 'center', gap: 1 },
  node: { height: 36, width: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, lineHeight: 13 },
  endpoint: { fontSize: 8, lineHeight: 10 },
  help: { fontSize: 12, lineHeight: 18 },
});

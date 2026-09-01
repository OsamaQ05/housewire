import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  Pattern,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

import {
  statusColor,
  type HousewireRole,
  type HousewireStatus,
  useHousewireTheme,
} from '../theme';
import { decorativeAccessibilityProps } from '../utils/accessibility';

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 620;
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface TopologyNode {
  callsign?: string;
  id: string;
  kind?: 'room' | 'edge';
  label: string;
  role?: HousewireRole;
  roomHeight?: number;
  roomWidth?: number;
  status?: HousewireStatus;
  x: number;
  y: number;
}

export interface TopologyEdge {
  bend?: number;
  color?: string;
  from: string;
  id?: string;
  orientation?: 'horizontal-first' | 'vertical-first';
  progress?: number;
  status?: HousewireStatus;
  to: string;
}

export interface TopologyMapProps {
  accessibilityLabel?: string;
  animate?: boolean;
  focusedNodeId?: string;
  height?: number;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  pulseDelay?: number;
  pulseDuration?: number;
  pulseEdgeId?: string;
  pulseLoop?: boolean;
  showLabels?: boolean;
  showRooms?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Renders an abstract house topology. Node positions and room sizes are normalized
 * from 0–1 so the same graph scales cleanly across phone and tablet canvases.
 */
export function TopologyMap({
  accessibilityLabel,
  animate = true,
  edges,
  focusedNodeId,
  height = 280,
  nodes,
  pulseDelay = 0,
  pulseDuration = 1200,
  pulseEdgeId,
  pulseLoop = true,
  showLabels = true,
  showRooms = true,
  style,
}: TopologyMapProps) {
  const { reducedMotion, theme } = useHousewireTheme();
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const routes = useMemo(
    () =>
      edges.flatMap((edge, index) => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) {
          return [];
        }
        return [createRoute(edge, from, to, index)];
      }),
    [edges, nodeMap],
  );
  const pulseRoute = pulseEdgeId
    ? routes.find((route) => route.id === pulseEdgeId || route.sourceId === pulseEdgeId)
    : undefined;
  const resolvedAccessibilityLabel =
    accessibilityLabel ??
    `House topology with ${nodes.length} nodes. ${nodes
      .map((node) => `${node.label}, ${node.status ?? 'idle'}`)
      .join('. ')}`;

  return (
    <View
      accessible
      accessibilityLabel={resolvedAccessibilityLabel}
      accessibilityRole="image"
      style={[styles.container, { height }, style]}
    >
      <Svg
        {...decorativeAccessibilityProps}
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        width="100%"
      >
        <Defs>
          <Pattern
            height="18"
            id="housewire-lost-hatch"
            patternUnits="userSpaceOnUse"
            width="18"
          >
            <Line
              opacity={0.5}
              stroke={theme.colors.fault}
              strokeWidth="2"
              x1="-4"
              x2="22"
              y1="18"
              y2="-8"
            />
          </Pattern>
        </Defs>

        {showRooms
          ? nodes.map((node) =>
              node.kind === 'edge' ? null : (
                <RoomOutline
                  focused={node.id === focusedNodeId}
                  key={`room-${node.id}`}
                  node={node}
                />
              ),
            )
          : null}

        {routes.map((route) => (
          <G key={route.id}>
            <Path
              d={route.d}
              fill="none"
              opacity={0.88}
              stroke={theme.colors.draft}
              strokeLinecap="square"
              strokeLinejoin="miter"
              strokeWidth={2}
            />
            <AnimatedWire
              animate={animate}
              color={route.color ?? statusColor(theme, route.status)}
              d={route.d}
              length={route.length}
              progress={route.progress}
              reducedMotion={reducedMotion}
              status={route.status}
            />
          </G>
        ))}

        {pulseRoute ? (
          <MapSignalPulse
            color={pulseRoute.color ?? theme.colors.wire}
            delay={pulseDelay}
            duration={pulseDuration}
            loop={pulseLoop}
            reducedMotion={reducedMotion}
            route={pulseRoute}
          />
        ) : null}

        {nodes.map((node, index) => (
          <MapNode
            focused={node.id === focusedNodeId}
            index={index}
            key={node.id}
            node={node}
            showLabel={showLabels}
          />
        ))}
      </Svg>
    </View>
  );
}

interface RoutePoint {
  x: number;
  y: number;
}

interface Route {
  color?: string;
  d: string;
  id: string;
  length: number;
  points: [RoutePoint, RoutePoint, RoutePoint, RoutePoint];
  progress: number;
  sourceId?: string;
  status: HousewireStatus;
}

function createRoute(
  edge: TopologyEdge,
  from: TopologyNode,
  to: TopologyNode,
  index: number,
): Route {
  const start = toMapPoint(from);
  const end = toMapPoint(to);
  const bend = Math.max(0.15, Math.min(0.85, edge.bend ?? 0.5));
  const horizontalFirst = edge.orientation !== 'vertical-first';
  const pointB: RoutePoint = horizontalFirst
    ? { x: start.x + (end.x - start.x) * bend, y: start.y }
    : { x: start.x, y: start.y + (end.y - start.y) * bend };
  const pointC: RoutePoint = horizontalFirst
    ? { x: pointB.x, y: end.y }
    : { x: end.x, y: pointB.y };
  const points: Route['points'] = [start, pointB, pointC, end];
  const length =
    distance(points[0], points[1]) +
    distance(points[1], points[2]) +
    distance(points[2], points[3]);

  return {
    color: edge.color,
    d: `M ${start.x} ${start.y} L ${pointB.x} ${pointB.y} L ${pointC.x} ${pointC.y} L ${end.x} ${end.y}`,
    id: edge.id ?? `${edge.from}-${edge.to}-${index}`,
    length: Math.max(1, length),
    points,
    progress: Math.max(0, Math.min(1, edge.progress ?? 1)),
    sourceId: edge.id,
    status: edge.status ?? 'idle',
  };
}

function RoomOutline({ focused, node }: { focused: boolean; node: TopologyNode }) {
  const { theme } = useHousewireTheme();
  const point = toMapPoint(node);
  const width = (node.roomWidth ?? 0.24) * MAP_WIDTH;
  const height = (node.roomHeight ?? 0.28) * MAP_HEIGHT;
  const status = node.status ?? 'idle';
  const stroke = focused ? theme.colors.wire : statusColor(theme, status);
  const fill = status === 'lost' ? 'url(#housewire-lost-hatch)' : theme.colors.surface;

  return (
    <G>
      <Rect
        fill={fill}
        fillOpacity={status === 'lost' ? 0.7 : 0.5}
        height={height}
        stroke={stroke}
        strokeDasharray={status === 'offline' ? '10 10' : undefined}
        strokeWidth={focused ? 3 : 1.5}
        width={width}
        x={point.x - width / 2}
        y={point.y - height / 2}
      />
      <Line
        opacity={0.7}
        stroke={stroke}
        strokeWidth={focused ? 4 : 2}
        x1={point.x - width / 2}
        x2={point.x - width / 2 + Math.min(62, width * 0.32)}
        y1={point.y - height / 2}
        y2={point.y - height / 2}
      />
    </G>
  );
}

function MapNode({
  focused,
  index,
  node,
  showLabel,
}: {
  focused: boolean;
  index: number;
  node: TopologyNode;
  showLabel: boolean;
}) {
  const { theme } = useHousewireTheme();
  const point = toMapPoint(node);
  const status = node.status ?? 'idle';
  const color = node.role ? theme.colors.roles[node.role] : statusColor(theme, status);
  const nodeNumber = String(index + 1).padStart(2, '0');

  return (
    <G>
      {focused ? (
        <Circle cx={point.x} cy={point.y} fill="none" opacity={0.35} r={34} stroke={color} strokeWidth={2} />
      ) : null}
      <Circle
        cx={point.x}
        cy={point.y}
        fill={theme.colors.background}
        r={status === 'lost' ? 12 : 15}
        stroke={color}
        strokeDasharray={status === 'lost' || status === 'offline' ? '5 5' : undefined}
        strokeWidth={status === 'ready' ? 5 : 3}
      />
      <Rect
        fill={status === 'live' || status === 'ready' ? color : theme.colors.background}
        height={8}
        stroke={color}
        strokeWidth={1.5}
        width={8}
        x={point.x - 4}
        y={point.y - 4}
      />
      {status === 'fault' || status === 'lost' ? (
        <G stroke={theme.colors.fault} strokeWidth={3}>
          <Line x1={point.x - 8} x2={point.x + 8} y1={point.y - 8} y2={point.y + 8} />
          <Line x1={point.x + 8} x2={point.x - 8} y1={point.y - 8} y2={point.y + 8} />
        </G>
      ) : null}
      {showLabel ? (
        <G>
          <SvgText
            fill={color}
            fontFamily={theme.typography.families.monoMedium}
            fontSize={16}
            letterSpacing={2}
            x={point.x + 27}
            y={point.y - 7}
          >
            {`NODE ${nodeNumber}`}
          </SvgText>
          <SvgText
            fill={theme.colors.text}
            fontFamily={theme.typography.families.display}
            fontSize={23}
            letterSpacing={0.7}
            x={point.x + 27}
            y={point.y + 19}
          >
            {node.label.toUpperCase()}
          </SvgText>
        </G>
      ) : null}
    </G>
  );
}

function AnimatedWire({
  animate,
  color,
  d,
  length,
  progress,
  reducedMotion,
  status,
}: {
  animate: boolean;
  color: string;
  d: string;
  length: number;
  progress: number;
  reducedMotion: boolean;
  status: HousewireStatus;
}) {
  const draw = useSharedValue(!animate || reducedMotion ? progress : 0);

  useEffect(() => {
    draw.value = !animate || reducedMotion
      ? progress
      : withTiming(progress, {
          duration: 680,
          easing: Easing.out(Easing.cubic),
        });
  }, [animate, draw, progress, reducedMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - draw.value),
  }));
  const isOperational = status !== 'idle' && status !== 'offline';

  if (!isOperational) {
    return null;
  }

  return (
    <AnimatedPath
      animatedProps={animatedProps}
      d={d}
      fill="none"
      stroke={color}
      strokeDasharray={
        status === 'waiting'
          ? `10 8 ${length} ${length}`
          : status === 'fault' || status === 'lost'
            ? `18 7 3 7 ${length} ${length}`
            : `${length} ${length}`
      }
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeWidth={status === 'ready' ? 5 : 3.5}
    />
  );
}

function MapSignalPulse({
  color,
  delay,
  duration,
  loop,
  reducedMotion,
  route,
}: {
  color: string;
  delay: number;
  duration: number;
  loop: boolean;
  reducedMotion: boolean;
  route: Route;
}) {
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  const [a, b, c, d] = route.points;
  const firstLength = distance(a, b);
  const secondLength = distance(b, c);
  const totalLength = route.length;

  useEffect(() => {
    cancelAnimation(progress);
    if (reducedMotion) {
      progress.value = 1;
      return;
    }

    progress.value = 0;
    const travel = withTiming(1, { duration, easing: Easing.linear });
    progress.value = withDelay(delay, loop ? withRepeat(travel, -1, false) : travel);
    return () => cancelAnimation(progress);
  }, [delay, duration, loop, progress, reducedMotion]);

  const animatedProps = useAnimatedProps(() => {
    const travelled = progress.value * totalLength;
    if (travelled <= firstLength) {
      const segmentProgress = firstLength === 0 ? 1 : travelled / firstLength;
      return {
        cx: a.x + (b.x - a.x) * segmentProgress,
        cy: a.y + (b.y - a.y) * segmentProgress,
      };
    }
    if (travelled <= firstLength + secondLength) {
      const segmentProgress = secondLength === 0 ? 1 : (travelled - firstLength) / secondLength;
      return {
        cx: b.x + (c.x - b.x) * segmentProgress,
        cy: b.y + (c.y - b.y) * segmentProgress,
      };
    }
    const thirdLength = totalLength - firstLength - secondLength;
    const segmentProgress = thirdLength === 0 ? 1 : (travelled - firstLength - secondLength) / thirdLength;
    return {
      cx: c.x + (d.x - c.x) * segmentProgress,
      cy: c.y + (d.y - c.y) * segmentProgress,
    };
  });

  return (
    <G>
      <AnimatedCircle animatedProps={animatedProps} fill={color} opacity={0.13} r={24} />
      <AnimatedCircle animatedProps={animatedProps} fill={color} r={8} />
    </G>
  );
}

function toMapPoint(node: TopologyNode): RoutePoint {
  return {
    x: Math.max(0, Math.min(1, node.x)) * MAP_WIDTH,
    y: Math.max(0, Math.min(1, node.y)) * MAP_HEIGHT,
  };
}

function distance(from: RoutePoint, to: RoutePoint): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    width: '100%',
  },
});

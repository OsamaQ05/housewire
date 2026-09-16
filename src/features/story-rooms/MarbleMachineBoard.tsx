import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useEffect, useRef, useState, type ComponentProps, type ComponentRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import type { ActivityMove } from './activities/contracts';
import { isMarbleSolved, MARBLE_FEEDBACK, MARBLE_NAMES, MARBLE_RAILS, MARBLE_SOURCE, MARBLE_TENSIONS, marbleGeometry, marbleRailStop, marbleSocket, type MarblePoint, type MarbleState } from './activities/marble';
import { StoryText, ui } from './story-ui';
import type { StoryPlayerView, StoryState } from './types';

/** Animated adds a native View-only `collapsable` prop. Keep it off the SVG
 * element on web while forwarding the native Circle ref for animated updates. */
const AnimationCircle = forwardRef<ComponentRef<typeof Circle>, ComponentProps<typeof Circle> & { collapsable?: boolean }>(function AnimationCircle({ collapsable: _nativeViewOnly, ...props }, ref) {
  return <Circle ref={ref} {...props} />;
});
const AnimatedCircle = Animated.createAnimatedComponent(AnimationCircle);
const CREAM = '#FFF1D2';
const INK = '#593B28';
const COLORS = ['#B65235', '#26766C', '#7B5893', '#AD7625'];
const REPLAY_MS = 2900;
const INSTRUCTIONS = ['Your ramp starts the first jump.', 'Catch the jump. Feed the spring.', 'Catch the drop. Choose the bounce.', 'Meet the marble at the end of its arc.'];
const ICONS = ['trending-down', 'funnel-outline', 'return-up-forward', 'notifications-outline'] as const;
const HEIGHTS = [['Highest', 'Middle', 'Lowest'], ['Highest', 'Middle', 'Lowest'], ['Highest', 'Upper', 'Lower', 'Lowest'], ['Highest', 'Upper', 'Lower', 'Lowest']];

export function MarbleMachineBoard({ state, view, onAct, disabled = false }: {
  state: StoryState; view: StoryPlayerView; onAct(move: ActivityMove): void; disabled?: boolean;
}) {
  const [selected, setSelected] = useState(view.ownedSlots[0]);
  const reducedMotion = useHousewireStore(store => store.settings.reducedMotion);
  const activity = state.activity;
  if (activity?.kind !== 'marble-machine') return null;
  const active = view.ownedSlots.includes(selected) ? selected : view.ownedSlots[0];
  if (active === undefined) return null;
  const solved = isMarbleSolved(activity);
  const locked = disabled || solved;
  const stop = marbleRailStop(activity, active);
  const g = marbleGeometry(activity.pieces);
  const last = activity.trace.at(-1);
  const owner = (index: number) => state.players[view.stage.slots[index].seat % state.players.length].name;
  return <View style={styles.root}>
    <View style={[ui.spread, { flexWrap: 'wrap' }]}><StoryText size={11} strong color="#EFCC8C" style={ui.kicker}>MINA’S LITTLE MACHINE</StoryText><StoryText size={11} color="#E4CEAF">{solved ? 'DING!' : '4 PARTS'}</StoryText></View>
    <StoryText size={14} color={CREAM} style={styles.instruction}>{solved ? 'A little adjustment from everyone. A perfect finish.' : 'The machine is built. Help the marble reach the bell.'}</StoryText>
    <View style={styles.board}>
      <Svg width="100%" height="100%" viewBox="0 0 320 330" pointerEvents="none" accessibilityLabel="An assembled wooden marble machine. Four coloured parts slide on short height rails. The dotted blue line shows the last test run.">
        <Defs><LinearGradient id="machine-wood" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#F7E9C8" /><Stop offset="1" stopColor="#E5C796" /></LinearGradient></Defs>
        <Rect width={320} height={330} rx={15} fill="url(#machine-wood)" />
        {[19, 79, 139, 199, 259, 319].map(y => <Path key={y} d={`M0 ${y} Q150 ${y + 5} 320 ${y - 1}`} stroke="#B58957" strokeWidth={1} opacity={.15} />)}
        <Path d="M16 11 V24 H48 V11" fill="none" stroke="#688695" strokeWidth={3} />
        <SvgText x={59} y={17} fill="#486E8A" fontSize={9} fontWeight="700">START</SvgText>
        {MARBLE_RAILS.map((rail, index) => {
          const first = marbleSocket(rail[0]);
          const end = marbleSocket(rail[rail.length - 1]);
          const current = marbleSocket(activity.pieces[index].cell);
          return <G key={index}>
            <Rect x={first.x - 5} y={first.y - 10} width={10} height={end.y - first.y + 20} rx={5} fill="#BFA174" opacity={.48} />
            <Line x1={first.x} y1={first.y - 6} x2={end.x} y2={end.y + 6} stroke="#91714E" strokeWidth={2} opacity={.5} />
            {rail.map(cell => { const p = marbleSocket(cell); return <Circle key={cell} cx={p.x} cy={p.y} r={3} fill="#76512E" opacity={.55} />; })}
            <Circle cx={current.x} cy={current.y} r={29} fill={COLORS[index]} opacity={index === active ? .12 : .04} />
            {index === active && !solved ? <Circle cx={current.x} cy={current.y} r={29} fill="none" stroke={COLORS[index]} strokeWidth={1.5} strokeDasharray="3 4" /> : null}
          </G>;
        })}
        <G>
          <Path d={`M${g.rampStart.x} ${g.rampStart.y + 5} L${g.rampEnd.x} ${g.rampEnd.y + 5}`} stroke={COLORS[0]} strokeWidth={9} strokeLinecap="round" />
          <Line x1={g.rampStart.x} y1={g.rampStart.y + 8} x2={g.rampStart.x} y2={g.ramp.y + 22} stroke="#9E744A" strokeWidth={4} />
          <Circle cx={g.ramp.x} cy={g.ramp.y + 5} r={3} fill="#FFE9C0" />
        </G>
        <G>
          <Path d={`M${g.funnel.x - 25} ${g.funnel.y} H${g.funnel.x + 25} L${g.funnelExit.x + 5} ${g.funnelExit.y} H${g.funnelExit.x - 5} Z`} fill="#64AAA0" stroke={COLORS[1]} strokeWidth={3} strokeLinejoin="round" />
          <Path d={`M${g.funnelExit.x} ${g.funnelExit.y} l${g.funnelDirection * 10} 6`} stroke={COLORS[1]} strokeWidth={6} strokeLinecap="round" />
        </G>
        <G>
          <Path d={`M${g.spring.x - 20} ${g.spring.y + 21} H${g.spring.x + 20} M${g.spring.x - 9} ${g.spring.y + 18} l20 -4 l-20 -4 l20 -4`} stroke="#806383" strokeWidth={activity.pieces[2].rotation === 1 ? 4 : 2.5} fill="none" />
          <Path d={`M${g.spring.x - 23} ${g.spring.y + 3} Q${g.spring.x} ${g.spring.y - 4} ${g.spring.x + 23} ${g.spring.y + 3}`} stroke={COLORS[2]} strokeWidth={7} strokeLinecap="round" fill="none" />
          <Path d={`M${g.spring.x} ${g.spring.y - 3} l${Math.cos(g.springAngle) * 22} ${Math.sin(g.springAngle) * 22}`} stroke={COLORS[2]} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={g.spring.x + Math.cos(g.springAngle) * 22} cy={g.spring.y - 3 + Math.sin(g.springAngle) * 22} r={3} fill={COLORS[2]} />
        </G>
        <G>
          <Path d={`M${g.bell.x - 14} ${g.bell.y + 6} Q${g.bell.x - 10} ${g.bell.y} ${g.bell.x - 10} ${g.bell.y - 7} Q${g.bell.x - 9} ${g.bell.y - 19} ${g.bell.x} ${g.bell.y - 19} Q${g.bell.x + 9} ${g.bell.y - 19} ${g.bell.x + 10} ${g.bell.y - 7} Q${g.bell.x + 10} ${g.bell.y} ${g.bell.x + 14} ${g.bell.y + 6} Z`} fill="#D7A53E" stroke="#986A27" strokeWidth={2} />
          <Circle cx={g.bell.x} cy={g.bell.y + 8} r={4} fill="#8E642D" />
        </G>
        {activity.trace.length > 1 ? <Path d={`M${activity.trace.map(point => `${point.x},${point.y}`).join(' L')}`} stroke="#486E8A" strokeWidth={2} strokeDasharray="3 5" opacity={.48} fill="none" /> : null}
        {last && activity.result !== 'success' && activity.result !== 'ready' ? <Circle cx={last.x} cy={last.y} r={11} stroke="#B4553A" strokeWidth={2} fill="none" strokeDasharray="3 3" /> : null}
        <MarbleReplay key={`${activity.runs}-${activity.result}`} trace={activity.trace} reducedMotion={reducedMotion} />
        <SvgText x={213} y={313} fill="#93714B" fontSize={9} textAnchor="middle">ADJUST · WATCH · TRY TOGETHER</SvgText>
      </Svg>
    </View>
    <View style={styles.tray} accessibilityRole="tablist">{view.ownedSlots.map(index => <Pressable key={index} accessibilityRole="tab" accessibilityLabel={`Adjust your ${MARBLE_NAMES[index].toLowerCase()}`} accessibilityState={{ selected: index === active }} onPress={() => setSelected(index)} style={[styles.part, index === active && { borderColor: COLORS[index], backgroundColor: '#FFF8E7' }]}>
      <Ionicons name={ICONS[index]} size={24} color={COLORS[index]} />
      <View><StoryText size={14} strong color={INK}>{MARBLE_NAMES[index]}</StoryText><StoryText size={10} color="#846A4B">YOUR HANDLE</StoryText></View>
    </Pressable>)}</View>
    <View style={styles.controls}>
      <View style={ui.spread}><StoryText size={14} strong color={INK}>{MARBLE_NAMES[active]} height</StoryText><StoryText size={12} color="#846A4B">{HEIGHTS[active][stop]}</StoryText></View>
      <View style={styles.heightRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Raise ${MARBLE_NAMES[active].toLowerCase()}`} accessibilityState={{ disabled: locked || stop === 0 }} disabled={locked || stop === 0} onPress={() => onAct({ control: active, command: 'height', value: stop - 1 })} style={[styles.heightButton, (locked || stop === 0) && styles.dim]}><Ionicons name="chevron-up" size={22} color={INK} /><StoryText size={14} strong color={INK}>Raise</StoryText></Pressable>
        <View style={styles.heightMeter}>{MARBLE_RAILS[active].map((_, index) => <View key={index} style={[styles.heightDot, index === stop && { backgroundColor: COLORS[active], width: 12, height: 12, borderRadius: 6 }]} />)}</View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Lower ${MARBLE_NAMES[active].toLowerCase()}`} accessibilityState={{ disabled: locked || stop === MARBLE_RAILS[active].length - 1 }} disabled={locked || stop === MARBLE_RAILS[active].length - 1} onPress={() => onAct({ control: active, command: 'height', value: stop + 1 })} style={[styles.heightButton, (locked || stop === MARBLE_RAILS[active].length - 1) && styles.dim]}><Ionicons name="chevron-down" size={22} color={INK} /><StoryText size={14} strong color={INK}>Lower</StoryText></Pressable>
      </View>
      {active === 2 ? <View style={styles.tensionRow}>{MARBLE_TENSIONS.map((label, value) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={`${label} spring tension`} accessibilityState={{ selected: activity.pieces[2].rotation === value, disabled: locked }} disabled={locked} onPress={() => onAct({ control: active, command: 'tension', value })} style={[styles.tension, activity.pieces[2].rotation === value && styles.tensionSelected]}><Ionicons name={value === 0 ? 'ellipse-outline' : 'ellipse'} size={13} color={activity.pieces[2].rotation === value ? CREAM : COLORS[2]} /><StoryText size={13} strong color={activity.pieces[2].rotation === value ? CREAM : COLORS[2]}>{label} bounce</StoryText></Pressable>)}</View> : null}
      <StoryText size={12} color="#846A4B" style={styles.instruction}>{INSTRUCTIONS[active]}</StoryText>
    </View>
    <ReplayFeedback key={`${activity.runs}-${activity.result}`} result={activity.result} reducedMotion={reducedMotion} />
    <Pressable accessibilityRole="button" accessibilityLabel={solved ? 'Bell rung. The machine is complete.' : 'Release the marble. Free test run.'} accessibilityState={{ disabled: locked }} disabled={locked} onPress={() => onAct({ control: active, command: 'launch' })} style={({ pressed }) => [styles.launch, (locked || pressed) && { opacity: .72 }]}><Ionicons name={solved ? 'checkmark' : 'play'} size={20} color={INK} /><StoryText size={17} strong color={INK}>{solved ? 'Bell rung together' : 'Test the marble'}</StoryText><StoryText size={10} color={INK}>{solved ? 'SAVED' : 'FREE TRY'}</StoryText></Pressable>
    <View style={styles.others}>{view.stage.slots.map((slot, index) => view.ownedSlots.includes(index) ? null : <View key={slot.id} style={styles.other}><View style={[styles.dot, { backgroundColor: COLORS[index] }]} /><StoryText size={11} color="#E8CEAD">{MARBLE_NAMES[index]} · {owner(index)}</StoryText></View>)}</View>
  </View>;
}

function ReplayFeedback({ result, reducedMotion }: { result: MarbleState['result']; reducedMotion: boolean }) {
  const [finished, setFinished] = useState(reducedMotion || result === 'ready' || result === 'missing');
  useEffect(() => {
    if (finished) return;
    const timeout = setTimeout(() => setFinished(true), REPLAY_MS);
    return () => clearTimeout(timeout);
  }, [finished]);
  return <View accessibilityLiveRegion="polite" style={styles.feedback}><Ionicons name={finished && result === 'success' ? 'musical-note' : 'ellipse-outline'} color="#EFCC8C" size={18} /><StoryText size={13} color={CREAM} style={{ flex: 1 }}>{finished ? MARBLE_FEEDBACK[result] : 'Follow the marble. Which hand-off needs help?'}</StoryText></View>;
}

function MarbleReplay({ trace, reducedMotion }: { trace: MarblePoint[]; reducedMotion: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.setValue(reducedMotion ? 1 : 0);
    if (reducedMotion || trace.length < 2) return;
    const animation = Animated.timing(progress, { toValue: 1, duration: REPLAY_MS, easing: Easing.linear, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [progress, trace, reducedMotion]);
  if (trace.length < 2) return <Circle cx={MARBLE_SOURCE.x} cy={MARBLE_SOURCE.y} r={6} fill="#486E8A" stroke="#F8F2DA" strokeWidth={2} />;
  const inputRange = trace.map((_, index) => index / (trace.length - 1));
  return <AnimatedCircle cx={progress.interpolate({ inputRange, outputRange: trace.map(point => point.x) })} cy={progress.interpolate({ inputRange, outputRange: trace.map(point => point.y) })} r={6} fill="#486E8A" stroke="#F8F2DA" strokeWidth={2} />;
}

const styles = StyleSheet.create({
  root: { gap: 10 }, board: { width: '100%', aspectRatio: 320 / 330, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: '#886340', backgroundColor: '#F2E3C1' },
  tray: { flexDirection: 'row', gap: 8 }, part: { flex: 1, minHeight: 59, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#E3C99F', borderWidth: 2, borderColor: '#9C7C50', borderRadius: 13 },
  instruction: { textAlign: 'center' }, controls: { backgroundColor: '#FFF1D2', borderRadius: 16, padding: 12, gap: 10 }, heightRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  heightButton: { flex: 1, minHeight: 50, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#EDD4A8', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  heightMeter: { width: 16, minHeight: 51, gap: 5, alignItems: 'center', justifyContent: 'center' }, heightDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#CDB591' },
  tensionRow: { flexDirection: 'row', gap: 8 }, tension: { flex: 1, minHeight: 46, borderRadius: 11, borderWidth: 1, borderColor: '#BDA5C7', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, tensionSelected: { backgroundColor: '#7B5893', borderColor: '#7B5893' },
  feedback: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8 }, dim: { opacity: .4 },
  launch: { flexDirection: 'row', minHeight: 53, backgroundColor: '#EFCC8C', paddingHorizontal: 15, borderRadius: 17, justifyContent: 'space-between', alignItems: 'center', gap: 7 },
  others: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 }, other: { flexDirection: 'row', alignItems: 'center', gap: 5 }, dot: { width: 7, height: 7, borderRadius: 4 },
});

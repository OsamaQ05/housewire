import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import type { ActivityMove } from './activities/contracts';
import { TRAY_FEEDBACK, TRAY_NAMES, TRAY_OBSTACLES, type ServingTrayState } from './activities/serving-tray';
import { StoryText, ui } from './story-ui';
import type { InteractiveBoardProps } from './InteractiveStoryBoard';

const INK = '#513A30', CREAM = '#FFF0D1';
const COLORS = ['#B85758', '#428778', '#BC872B', '#82628F'];

export function ServingTrayBoard({ state, view, onAct, disabled = false }: InteractiveBoardProps & { onAct(move: ActivityMove): void }) {
  const [selected, setSelected] = useState(view.ownedSlots[0]);
  const tray = state.activity?.kind === 'serving-tray' ? state.activity : undefined;
  const active = view.ownedSlots.includes(selected) ? selected : view.ownedSlots[0];
  if (!tray || active === undefined) return null;
  const partner = active % 2 === 0 ? active + 1 : active - 1;
  const activeName = state.players[view.stage.slots[active].seat % state.players.length].name;
  const partnerName = state.players[view.stage.slots[partner].seat % state.players.length].name;
  const axis = active < 2 ? 'sideways' : 'lengthways';
  const labels = active < 2 ? ['Toward flowers', 'Toward dessert mat'] : ['Toward window', 'Toward kitchen'];
  const icons = active < 2 ? ['arrow-back', 'arrow-forward'] : ['arrow-up', 'arrow-down'];
  return <View style={{ gap: 13 }}>
    <View style={ui.spread}><StoryText strong size={11} color="#F1CE93" style={ui.kicker}>DESSERT, TOGETHER</StoryText><StoryText size={11} color="#E4C7AA">{tray.checkpoint ? 'Resting mat saved' : 'No rush'}</StoryText></View>
    <TrayScene tray={tray} />
    <View accessibilityLiveRegion="polite" style={s.feedback}><Ionicons name={tray.delivered ? 'checkmark-circle-outline' : tray.feedback === 'wobble' ? 'water-outline' : 'restaurant-outline'} size={20} color="#F1CE93" /><StoryText size={13} color={CREAM} style={{ flex: 1 }}>{TRAY_FEEDBACK[tray.feedback]}</StoryText></View>
    <View style={s.panel}>
      <View style={s.tabs}>{view.ownedSlots.map(slot => <Pressable key={slot} accessibilityRole="tab" accessibilityLabel={`Use ${TRAY_NAMES[slot]}`} accessibilityState={{ selected: active === slot }} onPress={() => setSelected(slot)} style={[s.tab, active === slot && { backgroundColor: COLORS[slot] }]}><View style={[s.handle, { backgroundColor: active === slot ? CREAM : COLORS[slot] }]} /><StoryText strong size={12} color={active === slot ? CREAM : INK}>{TRAY_NAMES[slot].replace(' handle', '')}</StoryText></Pressable>)}</View>
      <StoryText size={13} color={INK}>{activeName} + {partnerName} slide {axis}.</StoryText>
      <View style={s.actions}>{([-1, 1] as const).map((value, i) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${TRAY_NAMES[active]}: ${labels[i]}`} accessibilityState={{ selected: tray.pending[active] === value, disabled: disabled || tray.delivered }} disabled={disabled || tray.delivered} onPress={() => onAct({ control: active, command: 'nudge', value })} style={({ pressed }) => [s.action, { borderColor: COLORS[active], backgroundColor: tray.pending[active] === value ? COLORS[active] : '#FFF7E6', opacity: pressed || disabled || tray.delivered ? .55 : 1 }]}><Ionicons name={icons[i] as 'arrow-back'} size={24} color={tray.pending[active] === value ? CREAM : INK} /><StoryText size={12} strong color={tray.pending[active] === value ? CREAM : INK} style={{ textAlign: 'center' }}>{labels[i]}</StoryText></Pressable>)}</View>
      <View style={s.pending}><View style={[s.dot, { backgroundColor: COLORS[partner] }]} /><StoryText size={12} color={INK} style={{ flex: 1 }}>{tray.pending[partner] ? `Pull from ${partnerName}: ${partner < 2 ? tray.pending[partner] === -1 ? 'toward flowers' : 'toward the dessert mat' : tray.pending[partner] === -1 ? 'toward the window' : 'toward the kitchen'}.` : `Opposite handle · ${partnerName}`}</StoryText>{tray.pending[active] ? <Pressable accessibilityRole="button" accessibilityLabel="Let go of my handle" onPress={() => onAct({ control: active, command: 'nudge', value: 0 })} disabled={disabled || tray.delivered} style={s.release}><StoryText size={12} strong color={INK}>Let go</StoryText></Pressable> : null}</View>
    </View>
    <StoryText size={12} color="#E4C7AA">Choose a direction together. The tray waits for both handles—no need to tap at the same time.</StoryText>
  </View>;
}

function TrayScene({ tray }: { tray: ServingTrayState }) {
  const reduced = useHousewireStore(store => store.settings.reducedMotion);
  const x = useRef(new Animated.Value(tray.x)).current, y = useRef(new Animated.Value(tray.y)).current;
  const [position, setPosition] = useState({ x: tray.x, y: tray.y });
  useEffect(() => { const a = x.addListener(({ value }) => setPosition(p => ({ ...p, x: value }))), b = y.addListener(({ value }) => setPosition(p => ({ ...p, y: value }))); return () => { x.removeListener(a); y.removeListener(b); }; }, [x, y]);
  useEffect(() => { const animation = Animated.parallel([Animated.timing(x, { toValue: tray.x, duration: reduced ? 0 : 420, useNativeDriver: false }), Animated.timing(y, { toValue: tray.y, duration: reduced ? 0 : 420, useNativeDriver: false })]); animation.start(); return () => animation.stop(); }, [tray.x, tray.y, x, y, reduced]);
  const cx = 33 + position.x * 45, cy = 59 + position.y * 46;
  const tilt = (tray.pending[0] - tray.pending[1]) * 5 + (tray.pending[2] - tray.pending[3]) * 5;
  return <View style={s.scene} accessible accessibilityLabel={`Dessert tray at column ${tray.x + 1}, row ${tray.y + 1}. Gold mat is in the top right. Obstacles: teapot, cup, vase and fruit. ${TRAY_FEEDBACK[tray.feedback]}`}>
    <Svg width="100%" height={308} viewBox="0 0 336 308">
      <Rect width="336" height="308" rx="16" fill="#DCA979" />
      <Rect x="10" y="31" width="316" height="251" rx="17" fill="#F5E8C7" />
      <Rect x="18" y="39" width="300" height="235" rx="12" fill="none" stroke="#C98A63" strokeWidth="2" strokeDasharray="3 5" />
      <SvgText x="168" y="20" textAnchor="middle" fill={INK} fontSize="10" letterSpacing="1">WINDOW</SvgText>
      <SvgText x="168" y="299" textAnchor="middle" fill={INK} fontSize="10" letterSpacing="1">KITCHEN</SvgText>
      {Array.from({ length: 7 }, (_, column) => Array.from({ length: 5 }, (_, row) => <Circle key={`${column}-${row}`} cx={33 + column * 45} cy={59 + row * 46} r="2" fill="#CDBD99" />))}
      <Rect x="283" y="39" width="40" height="40" rx="11" fill="#DDA846" stroke="#8E662B" strokeWidth="2" />
      <Path d="M293 59l7 7 12-17" fill="none" stroke="#FFF2CA" strokeWidth="3" />
      <Ellipse cx="168" cy="151" rx="19" ry="18" fill="#B4CBB0" stroke="#779975" strokeWidth="2" strokeDasharray="3 3" />
      <Path d="M161 151l5 5 9-10" stroke="#5F8563" strokeWidth="2" fill="none" />
      <G transform="translate(29 258)"><Path d="M0 0V-18 M0-7l-8-6 M0-10l8-6" stroke="#678567" strokeWidth="2" /><Circle cx="0" cy="-23" r="6" fill="#BE7374" /></G>
      {TRAY_OBSTACLES.map(obstacle => <Dish key={obstacle.kind} x={33 + obstacle.x * 45} y={59 + obstacle.y * 46} kind={obstacle.kind} />)}
      <G transform={`translate(${cx} ${cy}) rotate(${tilt})`}>
        <Ellipse cx="1" cy="8" rx="23" ry="19" fill="#705139" opacity=".18" />
        <Rect x="-22" y="-17" width="44" height="34" rx="11" fill="#B28455" stroke="#694A32" strokeWidth="2" />
        <Rect x="-18" y="-13" width="36" height="26" rx="8" fill="#ECD4A6" />
        {[[0, -27, 0], [1, 21, 0], [2, 0, -23], [3, 0, 17]].map(([slot, hx, hy]) => <Rect key={slot} x={hx} y={hy} width={slot < 2 ? 6 : 10} height={slot < 2 ? 10 : 6} rx="3" fill={COLORS[slot]} stroke="#FFF4D6" strokeWidth="1" />)}
        <G transform={`translate(${tray.slipX * 4} ${tray.slipY * 3})`}><Ellipse cy="6" rx="10" ry="5" fill="#FFF9E8" /><Path d="M-8 4V-3Q0-12 8-3V4Z" fill="#E1B173" /><Path d="M-8-2Q0-11 8-2L7 1Q0-4-7 1Z" fill="#FFEEE4" /><Circle cy="-6" r="3" fill="#B85957" /></G>
      </G>
      {tray.delivered ? <Circle cx="303" cy="59" r="24" fill="none" stroke="#F5D772" strokeWidth="3" /> : null}
    </Svg>
  </View>;
}
function Dish({ x, y, kind }: { x: number; y: number; kind: typeof TRAY_OBSTACLES[number]['kind'] }) {
  return <G transform={`translate(${x} ${y})`}><Ellipse cy="6" rx="19" ry="13" fill="#795B3F" opacity=".13" />{kind === 'pot' ? <><Ellipse rx="15" ry="13" fill="#779E92" stroke="#436F64" strokeWidth="2" /><Path d="M-12-4Q-27-18-21 3 M13-5l11-8-5 16" stroke="#436F64" strokeWidth="3" fill="none" /><Circle r="7" fill="#AEC5AF" /><Circle cy="-2" r="3" fill="#537C6F" /></> : kind === 'cup' ? <><Circle r="15" fill="#F9F0DA" stroke="#C7A983" strokeWidth="2" /><Circle r="9" fill="#9C6244" /><Path d="M8-5Q22-7 18 4L10 6" fill="none" stroke="#DCC6A1" strokeWidth="4" /></> : kind === 'vase' ? <><Ellipse cy="7" rx="10" ry="13" fill="#B9785E" /><Line x1="0" y1="6" x2="0" y2="-19" stroke="#507D60" strokeWidth="2" />{[-8, 0, 8].map((dx, i) => <Circle key={dx} cx={dx} cy={-14 - i % 2 * 6} r="6" fill={i === 1 ? '#E4B544' : '#C56B70'} />)}</> : <><Ellipse rx="19" ry="14" fill="#8F6E96" />{[[-8, -2], [5, -4], [0, 6]].map(([fx, fy], i) => <Circle key={i} cx={fx} cy={fy} r="7" fill={i === 1 ? '#DBA535' : '#D47851'} />)}</>}</G>;
}
const s = StyleSheet.create({
  scene: { borderWidth: 3, borderColor: '#A47B55', borderRadius: 18, overflow: 'hidden' },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 42 },
  panel: { backgroundColor: CREAM, borderRadius: 15, padding: 12, gap: 12 }, tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EBD8B7', borderRadius: 9 },
  handle: { height: 15, width: 6, borderRadius: 3 }, actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 76, borderWidth: 2, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 8, gap: 6 },
  pending: { flexDirection: 'row', gap: 7, alignItems: 'center', minHeight: 44 }, dot: { width: 8, height: 8, borderRadius: 4 },
  release: { minHeight: 44, padding: 8, justifyContent: 'center' },
});

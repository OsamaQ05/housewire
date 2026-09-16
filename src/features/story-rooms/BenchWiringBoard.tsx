import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { decorativeAccessibilityProps, nativeImportantAccessibilityProps } from '@/src/utils/accessibility';
import { inspectWiring, wiringAdjacent, wiringPoint, WIRING_BUILDINGS, WIRING_COLORS, WIRING_DESTINATIONS, WIRING_FEEDBACK, WIRING_GOALS, WIRING_NAMES, WIRING_STARTS } from './activities/bench-wiring';
import type { ActivityMove } from './activities/contracts';
import type { StoryPlayerView, StoryState } from './types';
import { StoryButton, StoryText, ui } from './story-ui';

const PAPER = '#F5DFB5'; const NIGHT = '#173541';
const letters = ['B', 'C', 'G', 'R'];
const centre = (cell: number) => { const { x, y } = wiringPoint(cell); return { x: 30 + x * 60, y: 30 + y * 60 }; };

function TinyBuilding({ index, lit }: { index: number; lit: boolean }) {
  const color = WIRING_COLORS[index]; const window = lit ? '#FFF2AB' : '#47606A';
  return <G>
    {index === 3 ? <><Path d="M-13 11V-12H14M-6-12L10-4M10-12V4" stroke={color} strokeWidth="3" fill="none" /><Rect x="6" y="4" width="9" height="7" rx="2" fill={window} /></>
      : <><Rect x="-15" y="-8" width="30" height="23" rx="3" fill={color} />
        <Path d={index === 2 ? 'M-18 -8L0 -22L18 -8Z' : 'M-18 -8L-13 -18H13L18 -8Z'} fill={index === 2 ? '#507C63' : '#A77650'} />
        <Rect x="-10" y="-3" width="7" height="8" rx="1" fill={window} /><Rect x="3" y="-3" width="7" height="8" rx="1" fill={window} />
        <Rect x="-3" y="7" width="6" height="8" rx="1" fill={NIGHT} />
      </>}
    <SvgText x="0" y="27" textAnchor="middle" fill={color} fontSize="9" fontWeight="700">{letters[index]} · {WIRING_DESTINATIONS[index]}</SvgText>
  </G>;
}

export function BenchWiringBoard({ state, view, onAct, disabled = false }: { state: StoryState; view: StoryPlayerView; onAct(move: ActivityMove): void; disabled?: boolean }) {
  const wiring = state.activity?.kind === 'bench-wiring' ? state.activity : undefined;
  const [selected, setSelected] = useState(view.ownedSlots[0]);
  const active = view.ownedSlots.includes(selected) ? selected : view.ownedSlots[0];
  const reduced = useHousewireStore(store => store.settings.reducedMotion);
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => { const animation = Animated.timing(glow, { toValue: wiring?.powered ? 1 : 0, duration: reduced ? 0 : 650, useNativeDriver: Platform.OS !== 'web' }); animation.start(); return () => animation.stop(); }, [wiring?.powered, glow, reduced]);
  if (!wiring) return null;
  const inspection = inspectWiring(wiring.paths); const blocked = disabled || wiring.powered;
  const activePath = wiring.paths[active]; const tip = activePath[activePath.length - 1];
  const occupied = wiring.paths.flat(); const color = WIRING_COLORS[active];
  const available = (cell: number) => !blocked && !inspection.connected[active] && wiringAdjacent(tip, cell)
    && !occupied.includes(cell) && !WIRING_BUILDINGS.some(value => value === cell)
    && !WIRING_GOALS.some((value, index) => index !== active && value === cell);
  const otherOwners = view.stage.slots.filter((_, index) => !view.ownedSlots.includes(index)).map(slot => `${slot.label}: ${state.players[slot.seat % state.players.length].name}`);

  return <View style={{ gap: 12 }}>
    <View style={ui.spread}><StoryText size={11} strong color={PAPER}>THE LITTLE NIGHT SHIFT</StoryText><StoryText size={12} color="#C5D9D8">{inspection.connectedCount} / 4 connected</StoryText></View>
    <View style={s.tabs}>{view.ownedSlots.map(control => <Pressable key={control} accessibilityRole="tab" accessibilityLabel={`Lay ${WIRING_NAMES[control]}`} accessibilityState={{ selected: active === control }} onPress={() => setSelected(control)} style={[s.tab, { borderColor: WIRING_COLORS[control], backgroundColor: active === control ? WIRING_COLORS[control] : NIGHT }]}><StoryText size={13} strong color={active === control ? NIGHT : PAPER}>{letters[control]} · {WIRING_DESTINATIONS[control]}</StoryText></Pressable>)}</View>
    <StoryText size={14} color={PAPER}>{wiring.powered ? 'Four connections, made together. The town is ready.' : inspection.connected[active] ? 'Connected! You can still shorten your cable to make room.' : 'Start at the ring. Tap a glowing neighbour to lay your cable.'}</StoryText>

    <View style={s.board}>
      <Svg width="100%" height="100%" viewBox="0 0 360 360" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Rect width="360" height="360" fill={NIGHT} />
        {Array.from({ length: 6 }, (_, at) => <G key={at}><Line x1="30" y1={30 + at * 60} x2="330" y2={30 + at * 60} stroke="#294954" strokeWidth="17" strokeLinecap="round" /><Line x1={30 + at * 60} y1="30" x2={30 + at * 60} y2="330" stroke="#294954" strokeWidth="17" strokeLinecap="round" /></G>)}
        {WIRING_BUILDINGS.map(cell => { const p = centre(cell); return <G key={cell} transform={`translate(${p.x},${p.y})`}><Rect x="-24" y="-23" width="48" height="46" rx="5" fill="#587072" /><Path d="M-27 -13L0 -30L27 -13Z" fill="#886F60" /><Rect x="-17" y="-6" width="9" height="12" fill="#263F46" /><Rect x="8" y="-6" width="9" height="12" fill="#263F46" /><Path d="M-22 17H22" stroke="#7B9390" strokeWidth="2" /></G>; })}
        {wiring.paths.map((path, control) => {
          const d = path.map((cell, index) => { const p = centre(cell); return `${index ? 'L' : 'M'}${p.x} ${p.y}`; }).join(' ');
          return <G key={control}><Path d={d} stroke="#0F2731" strokeWidth="16" fill="none" strokeLinecap="round" strokeLinejoin="round" /><Path d={d} stroke={WIRING_COLORS[control]} strokeWidth={control === active ? 10 : 8} fill="none" strokeLinecap="round" strokeLinejoin="round" />{wiring.powered && <Path d={d} stroke="#FFF4B8" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />}</G>;
        })}
        {WIRING_STARTS.map((cell, control) => { const p = centre(cell); return <G key={cell}><Circle cx={p.x} cy={p.y} r="18" fill={NIGHT} stroke={WIRING_COLORS[control]} strokeWidth={active === control ? 4 : 2} /><SvgText x={p.x} y={p.y + 5} fontSize="15" fontWeight="700" textAnchor="middle" fill={WIRING_COLORS[control]}>{letters[control]}</SvgText></G>; })}
        {WIRING_GOALS.map((cell, control) => { const p = centre(cell); return <G key={cell} transform={`translate(${p.x},${p.y - 3})`}><TinyBuilding index={control} lit={inspection.connected[control]} /></G>; })}
        {!inspection.connected[active] && <Circle cx={centre(tip).x} cy={centre(tip).y} r="23" fill="none" stroke={color} strokeWidth="2" strokeDasharray="3 4" />}
      </Svg>
      <View style={s.cells}>{Array.from({ length: 36 }, (_, cell) => {
        const ownIndex = activePath.indexOf(cell); const free = available(cell);
        const startOwner = WIRING_STARTS.findIndex(value => value === cell); const goalOwner = WIRING_GOALS.findIndex(value => value === cell);
        const pathOwner = wiring.paths.findIndex(path => path.includes(cell));
        const model = WIRING_BUILDINGS.some(value => value === cell);
        const detail = model ? ', model building' : startOwner >= 0 ? `, ${WIRING_DESTINATIONS[startOwner]} socket` : goalOwner >= 0 ? `, ${WIRING_DESTINATIONS[goalOwner]} building` : pathOwner >= 0 ? `, ${WIRING_DESTINATIONS[pathOwner]} cable` : ', open street';
        return <Pressable key={cell} accessibilityRole="button" accessibilityLabel={`Workshop street ${Math.floor(cell / 6) + 1}, ${cell % 6 + 1}${detail}${free ? ', available next step' : ''}`} accessibilityState={{ disabled: blocked, selected: cell === tip }} disabled={blocked} onPress={() => {
          if (startOwner >= 0 && view.ownedSlots.includes(startOwner) && startOwner !== active) setSelected(startOwner);
          else onAct({ control: active, command: 'place', value: cell });
        }} style={s.cell}>
          {free && <View style={[s.available, { borderColor: color, backgroundColor: `${color}20` }]}><StoryText color={color} size={22}>+</StoryText></View>}
          {ownIndex > 0 && cell !== tip && <View pointerEvents="none" style={[s.segmentDot, { backgroundColor: WIRING_COLORS[active] }]} />}
        </Pressable>;
      })}</View>
      <Animated.View pointerEvents="none" {...(wiring.powered ? nativeImportantAccessibilityProps : decorativeAccessibilityProps)} style={[s.powered, { opacity: glow }]}>{wiring.powered ? <StoryText size={12} strong color={NIGHT}>THE TOWN IS AWAKE</StoryText> : null}</Animated.View>
    </View>
    <View style={s.tools}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Undo last ${WIRING_DESTINATIONS[active]} cable segment`} disabled={blocked || activePath.length < 2} accessibilityState={{ disabled: blocked || activePath.length < 2 }} onPress={() => onAct({ control: active, command: 'undo' })} style={[s.tool, (blocked || activePath.length < 2) && s.dim]}><StoryText strong size={13} color={PAPER}>Undo one</StoryText></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Reel in ${WIRING_DESTINATIONS[active]} cable`} disabled={blocked || activePath.length < 2} accessibilityState={{ disabled: blocked || activePath.length < 2 }} onPress={() => onAct({ control: active, command: 'reset' })} style={[s.tool, (blocked || activePath.length < 2) && s.dim]}><StoryText strong size={13} color={PAPER}>Reel mine in</StoryText></Pressable>
    </View>
    <View accessibilityLiveRegion="polite" style={s.feedback}><StoryText size={13} color="#DAE6DE">{WIRING_FEEDBACK[wiring.feedback]}</StoryText></View>
    <StoryButton label={wiring.powered ? 'Town powered' : 'Turn on the town'} accent="#F0C66D" disabled={blocked} onPress={() => onAct({ control: active, command: 'test' })} />
    <StoryText size={12} color="#BED1C6">{otherOwners.join(' · ')}{otherOwners.length ? '. ' : ''}Unused streets are fine. Testing is free.</StoryText>
  </View>;
}

const s = StyleSheet.create({
  board: { width: '100%', minWidth: 268, aspectRatio: 1, borderRadius: 17, borderWidth: 2, borderColor: '#4F6B6D', overflow: 'hidden' },
  cells: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '16.666666%', height: '16.666666%', alignItems: 'center', justifyContent: 'center' },
  available: { width: '76%', height: '76%', borderWidth: 1.5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: NIGHT },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { flex: 1, minWidth: 100, minHeight: 45, borderWidth: 1.5, borderRadius: 10, padding: 8, alignItems: 'center', justifyContent: 'center' },
  tools: { flexDirection: 'row', gap: 8 },
  tool: { flex: 1, minHeight: 45, backgroundColor: '#294B51', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },
  feedback: { padding: 11, backgroundColor: '#24464D', borderRadius: 10 },
  powered: { position: 'absolute', bottom: 6, left: '17%', right: '17%', padding: 7, alignItems: 'center', borderRadius: 7, backgroundColor: '#F5D780' },
});

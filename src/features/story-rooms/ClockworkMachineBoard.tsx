import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import type { ActivityMove } from './activities/contracts';
import { CLOCKWORK_FEEDBACK, CLOCKWORK_PARTS, clockworkEndpoints, pegName, type ClockworkState } from './activities/clockwork';
import { StoryText, ui } from './story-ui';
import type { StoryPlayerView, StoryState } from './types';

const CREAM = '#F6E9CE';
const INK = '#183F40';
const GOLD = '#E6AF51';
const xAt = (peg: number) => 50 + (peg % 3) * 110;
const yAt = (peg: number) => 86 + Math.floor(peg / 3) * 110;

export function ClockworkMachineBoard({ state, view, onAct, disabled = false }: {
  state: StoryState; view: StoryPlayerView; onAct(move: ActivityMove): void; disabled?: boolean;
}) {
  const machine = state.activity?.kind === 'clockwork-machine' ? state.activity : undefined;
  const [selected, setSelected] = useState(view.ownedSlots[0]);
  const active = view.ownedSlots.includes(selected) ? selected : view.ownedSlots[0];
  if (!machine) return null;
  const own = machine.parts[active];
  const blocked = disabled || machine.solved;
  const act = (command: string, value?: number) => onAct({ control: active, command, ...(value === undefined ? {} : { value }) });
  return <View style={{ gap: 13 }}>
    <View style={ui.spread}><StoryText strong size={11} color={CREAM} style={ui.kicker}>THE CLOCKWORK PARADE</StoryText><StoryText size={11} color={CREAM}>Build · test · adjust</StoryText></View>
    <View style={s.tabs}>{view.ownedSlots.map(control => <Pressable key={control} accessibilityRole="tab" accessibilityLabel={`Build with ${CLOCKWORK_PARTS[control].name}`} accessibilityState={{ selected: control === active }} onPress={() => setSelected(control)} style={[s.tab, active === control && { backgroundColor: CREAM }]}><View style={[s.swatch, { backgroundColor: CLOCKWORK_PARTS[control].color }]} /><StoryText strong size={13} color={active === control ? INK : CREAM}>{CLOCKWORK_PARTS[control].name}</StoryText></Pressable>)}</View>
    <StoryText size={13} color={CREAM}>{machine.solved ? 'Four drives working together. Your little town is awake.' : `Tap a peg to ${own.peg < 0 ? 'fit' : 'move'} your ${CLOCKWORK_PARTS[active].name.toLowerCase()} ${['→', '↓', '←', '↑'][own.turn]}. Rotate with the tools below.`}</StoryText>
    <ClockworkScene machine={machine} active={active} disabled={blocked} onPeg={peg => act('place', peg)} />
    <Pressable accessibilityRole="button" accessibilityLabel="Turn the hand crank and test the machine" accessibilityState={{ disabled: blocked }} disabled={blocked} onPress={() => act('run')} style={({ pressed }) => [s.run, { opacity: blocked ? .55 : pressed ? .7 : 1 }]}><StoryText strong size={16} color={INK}>{machine.solved ? 'The town is ticking!' : 'Turn the crank'}</StoryText><StoryText size={12} color={INK}>Free test · watch what moves</StoryText></Pressable>
    <View style={s.feedback} accessibilityLiveRegion="polite"><View style={[s.light, { backgroundColor: machine.solved ? '#A8D8AC' : GOLD }]} /><StoryText color={CREAM} size={14} style={{ flex: 1 }}>{CLOCKWORK_FEEDBACK[machine.feedback]}</StoryText></View>
    <View style={s.tray}>
      <StoryText strong size={11} color="#BDCCBC" style={ui.kicker}>{CLOCKWORK_PARTS[active].name.toUpperCase()} · TOOLS</StoryText>
      <StoryText size={13} color={CREAM}>Wheels meeting on one peg turn together.</StoryText>
      <View style={s.directions}>{['right', 'down', 'left', 'up'].map((direction, turn) => {
        const offBoard = own.peg >= 0 && !clockworkEndpoints({ ...own, turn });
        return <Pressable key={direction} accessibilityRole="button" accessibilityLabel={`Point ${CLOCKWORK_PARTS[active].name} ${direction}`} accessibilityState={{ selected: own.turn === turn, disabled: blocked || offBoard }} disabled={blocked || offBoard} onPress={() => act('turn', turn)} style={({ pressed }) => [s.direction, own.turn === turn && { backgroundColor: GOLD, borderColor: '#FFD18D' }, (blocked || offBoard) && { opacity: .35 }, pressed && { opacity: .65 }]}><Svg width="34" height="24" viewBox="0 0 34 24"><G rotation={turn * 90} origin="17,12"><Line x1="7" y1="12" x2="26" y2="12" stroke={own.turn === turn ? INK : CREAM} strokeWidth="3" /><Circle cx="7" cy="12" r="4" fill={own.turn === turn ? INK : CREAM} /><Path d="M21 7L27 12L21 17" fill="none" stroke={own.turn === turn ? INK : CREAM} strokeWidth="3" /></G></Svg></Pressable>;
      })}</View>
      <View style={s.actions}><Action label={own.crossed ? 'Crossed belt' : 'Straight belt'} accessibilityLabel={`Switch ${CLOCKWORK_PARTS[active].name} to ${own.crossed ? 'straight' : 'crossed'} belt`} disabled={blocked} onPress={() => act('belt', own.crossed ? 0 : 1)} /><Action label="Lift off" disabled={blocked || own.peg < 0} onPress={() => act('remove')} /></View>
      <StoryText size={11} color="#B8CCBE">{own.crossed ? 'Crossed belt: wheels turn opposite ways.' : 'Straight belt: wheels turn the same way.'}</StoryText>
    </View>
    <View style={s.crew}>{view.stage.slots.filter((_, index) => !view.ownedSlots.includes(index)).map(slot => <StoryText key={slot.id} size={11} color="#BACBBE">{slot.label} · {state.players[slot.seat % state.players.length].name}</StoryText>)}</View>
  </View>;
}

function Action({ label, accessibilityLabel, disabled, onPress }: { label: string; accessibilityLabel?: string; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.action, { opacity: disabled ? .35 : pressed ? .65 : 1 }]}><StoryText strong size={13} color={CREAM}>{label}</StoryText></Pressable>;
}

function ClockworkScene({ machine, active, disabled, onPeg }: { machine: ClockworkState; active: number; disabled: boolean; onPeg(peg: number): void }) {
  const reduced = useHousewireStore(store => store.settings.reducedMotion);
  const motion = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState(0);
  const lastRun = useRef(machine.runs);
  useEffect(() => { const listener = motion.addListener(({ value }) => setPhase(value)); return () => motion.removeListener(listener); }, [motion]);
  useEffect(() => {
    if (lastRun.current === machine.runs) return;
    lastRun.current = machine.runs;
    motion.setValue(0);
    const animation = Animated.timing(motion, { toValue: 720, duration: reduced ? 0 : 2400, useNativeDriver: false });
    animation.start(); return () => animation.stop();
  }, [machine.runs, motion, reduced]);
  const spinning = machine.powered.some(value => value !== 0);
  return <View style={s.scene}>
    <Svg width="100%" height="100%" viewBox="0 0 320 368" accessible={false}>
      <Rect width="320" height="368" rx="16" fill="#D8C098" />
      <Rect x="11" y="11" width="298" height="346" rx="9" stroke="#A98E65" strokeWidth="2" fill="#E9D6B1" />
      {Array.from({ length: 15 }, (_, row) => Array.from({ length: 13 }, (_, col) => <Circle key={`${row}-${col}`} cx={22 + col * 23} cy={28 + row * 22} r="1.5" fill="#B69C76" opacity=".45" />))}
      <SvgText x="24" y="35" fill={INK} fontSize="10" fontWeight="700" letterSpacing="1.3">TOY-MAKER’S DRIVE BOARD</SvgText>
      {['A', 'B', 'C'].map((letter, col) => <SvgText key={letter} x={50 + col * 110} y="57" textAnchor="middle" fill="#765E40" fontSize="9">{letter}</SvgText>)}
      {[0, 1, 2].map(row => <SvgText key={row} x="24" y={90 + row * 110} textAnchor="middle" fill="#765E40" fontSize="9">{row + 1}</SvgText>)}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(peg => <G key={peg}><Circle cx={xAt(peg)} cy={yAt(peg)} r="20" fill="#C4A87B" /><Circle cx={xAt(peg)} cy={yAt(peg)} r="15" stroke="#8B795A" fill="#F1E1C3" strokeWidth="1.5" /></G>)}
      {machine.parts.map((part, index) => {
        const ends = clockworkEndpoints(part);
        if (!ends) return null;
        const [a, b] = ends; const ax = xAt(a); const ay = yAt(a); const bx = xAt(b); const by = yAt(b);
        const vertical = ax === bx; const offsetX = vertical ? 11 : 0; const offsetY = vertical ? 0 : 11;
        const powered = spinning && machine.powered[a] !== 0;
        const color = CLOCKWORK_PARTS[index].color;
        const tail = part.crossed ? -1 : 1;
        return <G key={index} opacity={spinning && !powered ? .48 : 1}>
          {active === index ? <Line x1={ax} y1={ay} x2={bx} y2={by} stroke="#FFF6DB" strokeWidth="37" strokeLinecap="round" /> : null}
          <Line x1={ax} y1={ay} x2={bx} y2={by} stroke={color} strokeWidth="31" strokeLinecap="round" />
          <Path d={`M${ax + offsetX} ${ay + offsetY} L${bx + offsetX * tail} ${by + offsetY * tail} M${ax - offsetX} ${ay - offsetY} L${bx - offsetX * tail} ${by - offsetY * tail}`} stroke={powered ? '#294D41' : '#765D42'} strokeWidth="4" fill="none" />
          {[a, b].map((peg, end) => <Wheel key={peg} x={xAt(peg)} y={yAt(peg)} color={color} angle={powered ? machine.jammed ? Math.sin(phase / 15) * 4 : phase * machine.powered[peg] : 0} outline={end === 0 ? '#58482F' : '#826D4D'} />)}
        </G>;
      })}
      <G><Circle cx="50" cy="86" r="11" fill={INK} /><G rotation={spinning ? phase : -35} origin="50,86"><Path d="M50 86L65 76" stroke={INK} strokeWidth="6" strokeLinecap="round" /><Circle cx="67" cy="75" r="6" fill={GOLD} stroke={INK} strokeWidth="2" /></G><SvgText x="50" y="126" textAnchor="middle" fill={INK} fontSize="9" fontWeight="700">CRANK</SvgText></G>
      <G><Rect x="247" y="278" width="46" height="49" rx="5" fill={INK} /><Path d="M242 282L270 260L298 282" fill="#C77755" stroke={INK} strokeWidth="2" /><Circle cx="270" cy="301" r="15" fill={CREAM} stroke={GOLD} strokeWidth="2" /><G rotation={machine.powered[8] && !machine.jammed ? phase * machine.powered[8] : 0} origin="270,301"><Path d="M270 290V301L278 305" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" /></G><SvgText x="270" y="345" textAnchor="middle" fill={INK} fontSize="9" fontWeight="700">CLOCK ↻</SvgText></G>
      {machine.solved ? <G><Path d="M19 328H222" stroke="#4D8C71" strokeWidth="2" />{[40, 80, 120, 160, 200].map((x, i) => <G key={x}><Path d={`M${x - 11} 328V311L${x} 302L${x + 11} 311V328Z`} fill={CLOCKWORK_PARTS[i % 4].color} stroke={INK} /><Rect x={x - 3} y="313" width="6" height="8" fill="#FFE49A" /></G>)}</G> : <SvgText x="24" y="344" fill="#765E40" fontSize="9">ONE CLOCK. FOUR PAIRS OF HANDS.</SvgText>}
    </Svg>
    {Array.from({ length: 9 }, (_, peg) => {
      const fits = clockworkEndpoints({ ...machine.parts[active], peg }) !== null;
      return <Pressable key={peg} accessibilityRole="button" accessibilityLabel={`Fit ${CLOCKWORK_PARTS[active].name} at peg ${pegName(peg)}${peg === 0 ? ', hand crank' : peg === 8 ? ', clock' : ''}`} accessibilityState={{ disabled, selected: machine.parts[active].peg === peg }} disabled={disabled} onPress={() => onPeg(peg)} style={({ pressed }) => [s.peg, { left: `${xAt(peg) / 3.2}%`, top: `${yAt(peg) / 3.68}%`, borderColor: machine.parts[active].peg === peg ? '#FFF5D8' : 'transparent', backgroundColor: pressed ? fits ? '#FFFFFF44' : '#CA594D44' : 'transparent' }]} />;
    })}
  </View>;
}

function Wheel({ x, y, color, angle, outline }: { x: number; y: number; color: string; angle: number; outline: string }) {
  return <G><Circle cx={x} cy={y} r="13" fill={color} stroke={outline} strokeWidth="2" /><G rotation={angle} origin={`${x},${y}`}><Path d={`M${x - 10} ${y}H${x + 10} M${x} ${y - 10}V${y + 10}`} stroke="#F7EACB" strokeWidth="2" /></G><Circle cx={x} cy={y} r="3.5" fill={INK} /></G>;
}

const s = StyleSheet.create({
  scene: { width: '100%', aspectRatio: 320 / 368, borderWidth: 3, borderColor: '#8B977A', borderRadius: 18, overflow: 'hidden', backgroundColor: '#D8C098' },
  peg: { position: 'absolute', width: 44, height: 44, marginLeft: -22, marginTop: -22, borderRadius: 22, borderWidth: 2 },
  feedback: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#2D5049', padding: 13, borderRadius: 11, minHeight: 58 },
  light: { width: 8, height: 8, borderRadius: 4 },
  tray: { backgroundColor: '#183B37', borderWidth: 1, borderColor: '#426258', padding: 13, borderRadius: 13, gap: 10 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { flexGrow: 1, flexBasis: '43%', minHeight: 44, paddingHorizontal: 9, paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: '#183F4077' },
  directions: { flexDirection: 'row', gap: 7 },
  direction: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#2B5148', borderWidth: 1, borderColor: '#587569' },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#688071', borderRadius: 8 },
  run: { minHeight: 61, padding: 13, backgroundColor: GOLD, borderRadius: 11, alignItems: 'center', gap: 3 },
  crew: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});

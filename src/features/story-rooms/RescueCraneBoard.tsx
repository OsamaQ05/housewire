import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import type { ActivityMove } from './activities/contracts';
import { CRANE_FEEDBACK, type CraneState } from './activities/crane';
import { StoryText, ui } from './story-ui';
import type { StoryPlayerView, StoryState } from './types';

const CREAM = '#F5DFB5';
const INK = '#183D3B';
const CORAL = '#F08761';
const NAMES = ['Travel rail', 'Hoist', 'Bridge', 'Grabber'];
const HELP = [
  'You see the bays. Tell the hoist operator when the hook is over the parcel.',
  'You see the height. Lift the parcel above the divider before it travels.',
  'The same lever opens the crossing OR unfolds the receiving tray. Coordinate both trips.',
  'Grab or release at floor level. Ask the rail operator whether you are over the parcel or tray.',
];

export function RescueCraneBoard({ state, view, onAct, disabled = false }: {
  state: StoryState; view: StoryPlayerView; onAct(move: ActivityMove): void; disabled?: boolean;
}) {
  const crane = state.activity?.kind === 'rescue-crane' ? state.activity : undefined;
  const [selected, setSelected] = useState(view.ownedSlots[0]);
  const active = view.ownedSlots.includes(selected) ? selected : view.ownedSlots[0];
  const overhead = active === 0 || active === 2;
  if (!crane) return null;
  const act = (command: string, value?: number) => onAct({ control: active, command, ...(value === undefined ? {} : { value }) });
  return <View style={{ gap: 14 }}>
    <View style={ui.spread}><StoryText strong size={11} color={CREAM} style={ui.kicker}>THE LAST DELIVERY</StoryText><StoryText size={12} color={CREAM}>{overhead ? 'Your view · overhead' : 'Your view · side'}</StoryText></View>
    <CraneScene crane={crane} overhead={overhead} />
    <View accessibilityLiveRegion="polite" style={s.feedback}><View style={[s.lamp, crane.delivered && { backgroundColor: '#9DDFB7' }]} /><StoryText size={14} color={CREAM} style={{ flex: 1 }}>{CRANE_FEEDBACK[crane.feedback]}</StoryText></View>
    <View style={{ gap: 10 }}>
      {view.ownedSlots.length > 1 ? <View style={s.tabs}>{view.ownedSlots.map(control => <Pressable key={control} accessibilityRole="tab" accessibilityLabel={`Operate ${NAMES[control]}`} accessibilityState={{ selected: active === control }} onPress={() => setSelected(control)} style={[s.tab, active === control && { backgroundColor: CREAM }]}><StoryText strong size={13} color={active === control ? INK : CREAM}>{NAMES[control]}</StoryText></Pressable>)}</View> : <StoryText strong size={17} color={CREAM}>Your control · {NAMES[active]}</StoryText>}
      <StoryText size={13} color="#C9D5C6">{HELP[active]}</StoryText>
      {active === 0 ? <View style={s.bays}>{Array.from({ length: 7 }, (_, i) => <Control key={i} label={`${i + 1}`} a11y={`Move trolley to bay ${i + 1}`} selected={crane.x === i} disabled={disabled || crane.delivered} onPress={() => act('travel', i)} compact />)}</View> : null}
      {active === 1 ? <View style={s.controlGrid}>{['Floor', 'Low', 'Clearance', 'High'].map((label, value) => <Control key={label} label={label} a11y={`Set hoist to ${label}`} selected={crane.height === value} disabled={disabled || crane.delivered} onPress={() => act('hoist', value)} />)}</View> : null}
      {active === 2 ? <View style={s.controlGrid}><Control label="Open crossing" selected={crane.bridge === 'crossing'} disabled={disabled || crane.delivered} onPress={() => act('bridge', 1)} /><Control label="Unfold tray" selected={crane.bridge === 'receive'} disabled={disabled || crane.delivered} onPress={() => act('bridge', 0)} /></View> : null}
      {active === 3 ? <Control label={crane.carrying ? 'Release parcel' : 'Close grabber'} disabled={disabled || crane.delivered} onPress={() => act('grip')} /> : null}
    </View>
    <View style={s.crew}>{view.stage.slots.filter((_, i) => !view.ownedSlots.includes(i)).map(slot => <StoryText key={slot.id} size={11} color="#B7C9BD">{slot.label} · {state.players[slot.seat % state.players.length].name}</StoryText>)}</View>
    <StoryText size={12} color="#B7C9BD">Your partner sees another angle. Talk through the lift; no speed or timing test.</StoryText>
  </View>;
}

function Control({ label, a11y, selected, disabled, onPress, compact = false }: { label: string; a11y?: string; selected?: boolean; disabled?: boolean; onPress(): void; compact?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.control, compact ? { flex: 1, paddingHorizontal: 0 } : { flexGrow: 1, flexBasis: '44%' }, { backgroundColor: selected ? CORAL : '#294D48', borderColor: selected ? '#FFC299' : '#618074', opacity: disabled ? .5 : pressed ? .7 : 1 }]}><StoryText strong size={14} color={selected ? INK : CREAM} style={{ textAlign: 'center' }}>{label}</StoryText></Pressable>;
}

function CraneScene({ crane, overhead }: { crane: CraneState; overhead: boolean }) {
  const reduced = useHousewireStore(s => s.settings.reducedMotion);
  const movement = useRef(new Animated.Value(overhead ? crane.x : crane.height)).current;
  const [visual, setVisual] = useState(overhead ? crane.x : crane.height);
  useEffect(() => { const token = movement.addListener(({ value }) => setVisual(value)); return () => movement.removeListener(token); }, [movement]);
  useEffect(() => {
    movement.setValue(overhead ? crane.x : crane.height);
  }, [overhead]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const animation = Animated.timing(movement, { toValue: overhead ? crane.x : crane.height, duration: reduced ? 0 : 380, useNativeDriver: false });
    animation.start(); return () => animation.stop();
  }, [crane.x, crane.height, movement, overhead, reduced]);
  const hookX = 36 + (overhead ? visual : 3) * 44;
  const hookY = overhead ? 128 : 199 - visual * 42;
  const parcelX = crane.carrying ? hookX : 36 + crane.parcelX * 44;
  return <View style={s.scene} accessible accessibilityLabel={overhead ? `Overhead view: trolley bay ${crane.x + 1}, parcel ${crane.carrying ? 'on hook' : `bay ${crane.parcelX + 1}`}, ${crane.bridge === 'crossing' ? 'crossing open, tray folded' : 'crossing shut, tray ready'}` : `Side view: hook ${['at floor', 'below divider', 'above divider', 'high above divider'][crane.height]}, ${crane.carrying ? 'carrying parcel' : 'empty'}`}>
    <Svg width="100%" height="248" viewBox="0 0 336 248">
      <Rect width="336" height="248" rx="14" fill="#E8D1AA" />
      {[42, 89, 136, 183, 230].map(y => <Path key={y} d={`M 0 ${y} Q 140 ${y - 8} 336 ${y + 2}`} stroke="#CFB88E" strokeWidth="1" fill="none" />)}
      <SvgText x="18" y="25" fill={INK} fontSize="11" fontWeight="700" letterSpacing="1">{overhead ? 'MODEL TOWN · TOP VIEW' : 'LIFT SHAFT · SIDE VIEW'}</SvgText>
      {overhead ? <G>
        <Rect x="18" y="108" width="300" height="44" rx="5" fill="#BCD0B6" />
        <Path d="M18 103H318 M18 157H318" stroke="#4E6A5B" strokeWidth="6" />
        <Rect x="155" y="79" width="27" height="97" fill={crane.bridge === 'crossing' ? '#B7A276' : '#986E50'} stroke="#6B5942" strokeDasharray={crane.bridge === 'crossing' ? '4 4' : undefined} />
        <SvgText x="168" y="195" textAnchor="middle" fontSize="10" fill={INK}>{crane.bridge === 'crossing' ? 'OPEN' : 'GATE'}</SvgText>
        <Rect x="235" y={crane.bridge === 'receive' ? 106 : 156} width="40" height={crane.bridge === 'receive' ? 48 : 10} rx="4" fill="#D49C33" stroke="#85682C" strokeWidth="2" />
        <SvgText x="255" y="210" textAnchor="middle" fontSize="10" fill={INK}>{crane.bridge === 'receive' ? 'GOLD TRAY' : 'TRAY FOLDED'}</SvgText>
        {Array.from({ length: 7 }, (_, i) => <G key={i}><Circle cx={36 + i * 44} cy="65" r="13" fill={crane.x === i ? CORAL : '#F9EACF'} /><SvgText x={36 + i * 44} y="69" fontSize="11" textAnchor="middle" fill={INK}>{i + 1}</SvgText></G>)}
        {!crane.delivered ? <Rect x={parcelX - 12} y="116" width="24" height="24" rx="3" fill="#F29E6A" stroke="#88553B" strokeWidth="2" /> : <Path d="M244 127l8 8 14-17" fill="none" stroke={INK} strokeWidth="4" />}
        <Circle cx={hookX} cy="128" r="19" stroke={INK} strokeWidth="3" fill="none" />
        <Path d={`M${hookX} 99V109 M${hookX} 148V158`} stroke={INK} strokeWidth="3" />
      </G> : <G>
        <Path d="M45 47H291 M56 47V215 M280 47V215" stroke={INK} strokeWidth="9" />
        <Rect x="63" y="145" width="61" height="67" rx="3" fill="#9B7754" />
        <Path d="M65 141H276" stroke="#85642C" strokeWidth="2" strokeDasharray="4 6" />
        <SvgText x="76" y="166" fill="#FFEDCC" fontSize="9">DIVIDER</SvgText>
        <SvgText x="202" y="132" fill={INK} fontSize="9">CLEAR ABOVE</SvgText>
        <Line x1="168" x2="168" y1="51" y2={hookY - 12} stroke="#74644A" strokeWidth="4" />
        <Rect x="149" y="40" width="38" height="19" rx="4" fill={CORAL} stroke={INK} strokeWidth="2" />
        <Path d={`M156 ${hookY - 12} V${hookY} L164 ${hookY + 5} M180 ${hookY - 12} V${hookY} L172 ${hookY + 5}`} stroke={INK} strokeWidth="4" fill="none" />
        {crane.carrying ? <Rect x="156" y={hookY} width="24" height="23" rx="2" fill={CORAL} stroke="#88553B" strokeWidth="2" /> : null}
        <Path d="M42 223H294" stroke="#7A644A" strokeWidth="5" />
        <SvgText x="168" y="239" textAnchor="middle" fontSize="10" fill={INK}>{crane.carrying ? 'PARCEL SECURED' : 'GRABBER EMPTY'} · BAY HIDDEN FROM HERE</SvgText>
      </G>}
    </Svg>
  </View>;
}

const s = StyleSheet.create({
  scene: { borderRadius: 14, borderWidth: 3, borderColor: '#779083', overflow: 'hidden' },
  feedback: { minHeight: 52, padding: 13, backgroundColor: '#294A44', borderRadius: 10, gap: 10, flexDirection: 'row', alignItems: 'center' },
  lamp: { width: 8, height: 8, borderRadius: 4, backgroundColor: CORAL },
  tabs: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 10, backgroundColor: '#132F2D' },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 7, padding: 8 },
  bays: { flexDirection: 'row', gap: 4 },
  controlGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  control: { minHeight: 48, padding: 12, borderWidth: 1.5, borderRadius: 8, justifyContent: 'center' },
  crew: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 15, rowGap: 6, borderTopWidth: 1, borderColor: '#46665C', paddingTop: 12 },
});

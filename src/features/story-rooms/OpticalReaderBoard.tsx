import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { InteractiveBoardProps } from './InteractiveStoryBoard';
import { StoryText, ui } from './story-ui';

const INK = '#294349';
const PAPER = '#EEE2C6';
const GOLD = '#E4C28A';

/** The final build is a physical optical bench, not another phone switchboard. */
export function OpticalReaderBoard({ state, view, onEdit, disabled }: InteractiveBoardProps) {
  const [selected, setSelected] = useState(view.ownedSlots[0]);
  const active = view.ownedSlots.includes(selected) ? selected : view.ownedSlots[0];
  const count = state.draft.filter(Boolean).length;
  return <View style={styles.bench}>
    <View style={ui.spread}><StoryText strong size={11} color={GOLD} style={{ letterSpacing: 1, flex: 1 }}>THE DAYLIGHT READER</StoryText><StoryText size={11} color={PAPER}>{count}/4 fitted</StoryText></View>
    <View style={styles.device} accessible accessibilityLabel={`An old brass viewer. ${count} of its four fittings have a part installed.`}>
      <Svg height={133} width="100%" viewBox="0 0 300 132">
        <Path d="M 22 63 L 278 32 L 278 104 Z" fill="#F4C87D" opacity={.14} />
        <Line x1={17} y1={69} x2={280} y2={69} stroke="#F4C87D" strokeWidth={2} strokeDasharray="5 5" />
        <Circle cx={24} cy={69} r={14} fill="#EEC17C" />
        <Rect x={18} y={103} width={268} height={12} rx={5} fill="#795245" />
        {view.stage.slots.map((slot, index) => <OpticalFitting key={slot.id} index={index} fitted={Boolean(state.draft[index])} active={active === index} />)}
      </Svg>
      <StoryText size={11} strong color="#7C624E">DAYLIGHT IN → PICTURE OUT</StoryText>
    </View>
    <StoryText color="#E5D2BB" size={14}>Tap your fitting, then choose its missing part.</StoryText>
    <View style={styles.fittings}>
      {view.stage.slots.map((slot, index) => {
        const owned = view.ownedSlots.includes(index);
        const choice = view.stage.options.find(option => option.id === state.draft[index]);
        return <Pressable key={slot.id} accessibilityRole="button" accessibilityLabel={`Select fitting: ${slot.label}. ${choice?.label ?? 'Empty'}.${owned ? '' : ' Teammate control.'}`} accessibilityState={{ disabled: Boolean(disabled || !owned), selected: active === index }} disabled={disabled || !owned} onPress={() => setSelected(index)} style={[styles.fitting, { backgroundColor: active === index ? PAPER : '#3D5C57', borderColor: active === index ? GOLD : '#83987F' }]}>
          <View style={ui.spread}><StoryText size={10} strong color={active === index ? '#795943' : '#D9BFC3'}>{owned ? 'YOUR FITTING' : state.players[slot.seat % state.players.length].name}</StoryText><Ionicons name={owned ? 'ellipse-outline' : 'lock-closed-outline'} size={13} color={active === index ? INK : GOLD} /></View>
          <StoryText strong size={14} color={active === index ? INK : PAPER}>{slot.label}</StoryText>
          <StoryText size={12} color={active === index ? '#795943' : '#D9BFC3'}>{choice?.label ?? 'Choose a part'}</StoryText>
        </Pressable>;
      })}
    </View>
    {active !== undefined ? <View style={styles.partsTray}>
      <View style={ui.spread}><StoryText strong size={13} color={INK}>For: {view.stage.slots[active].label}</StoryText>{state.draft[active] ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove part from ${view.stage.slots[active].label}`} disabled={disabled} onPress={() => onEdit(active, '')} style={styles.remove}><StoryText size={12} color={INK}>Remove</StoryText></Pressable> : null}</View>
      {view.stage.options.map(option => {
        const picked = state.draft[active] === option.id;
        const icon = option.icon && option.icon in Ionicons.glyphMap ? option.icon as keyof typeof Ionicons.glyphMap : 'cube-outline';
        return <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`Fit ${option.label} to ${view.stage.slots[active].label}`} accessibilityState={{ disabled: Boolean(disabled), selected: picked }} disabled={disabled} onPress={() => onEdit(active, option.id)} style={({ pressed }) => [styles.part, { backgroundColor: picked ? '#E7C384' : '#F7E5C4', opacity: pressed ? .7 : 1 }]}>
          <Ionicons name={icon} size={23} color={INK} /><StoryText strong size={13} color={INK} style={{ flex: 1 }}>{option.label}</StoryText><Ionicons name={picked ? 'checkmark-circle' : 'add-circle-outline'} size={21} color={INK} />
        </Pressable>;
      })}
    </View> : null}
    <View style={ui.row}><Ionicons name="people-outline" color={GOLD} size={19} /><StoryText size={12} color="#E5D2BB" style={{ flex: 1 }}>Your family has the maker’s notes. Ask what your fitting needs.</StoryText></View>
  </View>;
}

function OpticalFitting({ index, fitted, active }: { index: number; fitted: boolean; active: boolean }) {
  const x = 66 + index * 58;
  return <>
    <Rect x={x - 6} y={89} width={12} height={18} fill="#9D7956" />
    <Rect x={x - 14} y={39} width={28} height={52} rx={index === 1 ? 14 : 4} fill={fitted ? index === 3 ? '#345A52' : '#E8CA8F' : '#DBC3A3'} fillOpacity={fitted ? 1 : .25} stroke={active ? '#9D6C34' : '#AB8E6F'} strokeWidth={active ? 3 : 1.5} strokeDasharray={fitted ? undefined : '4 4'} />
    {fitted ? <Path d={`M ${x - 6} 65 L ${x - 1} 70 L ${x + 7} 59`} stroke={index === 3 ? PAPER : '#79583C'} strokeWidth={2} fill="none" /> : null}
  </>;
}

const styles = StyleSheet.create({
  bench: { gap: 15, padding: 15, borderRadius: 22, backgroundColor: INK, borderWidth: 1, borderColor: '#80634E' },
  device: { borderRadius: 17, backgroundColor: PAPER, padding: 8, alignItems: 'center' },
  fittings: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fitting: { flexBasis: '46%', flexGrow: 1, minHeight: 104, padding: 10, borderWidth: 1.5, borderRadius: 12, gap: 5 },
  partsTray: { backgroundColor: PAPER, padding: 12, borderRadius: 14, gap: 7 },
  part: { minHeight: 46, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  remove: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});

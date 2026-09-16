import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { ActivityMove } from './activities/contracts';
import { SHADOW_FEEDBACK, SHADOW_NAMES } from './activities/shadow-play';
import { ShadowScene } from './ShadowScene';
import type { InteractiveBoardProps } from './InteractiveStoryBoard';
import { StoryText, ui } from './story-ui';

const CREAM = '#FFF0D1', INK = '#573E32', COLORS = ['#D7A044', '#BD6A56', '#5F8D80', '#8C749C'];
export function ShadowPlayBoard({ state, view, onAct, disabled = false }: InteractiveBoardProps & { onAct(move: ActivityMove): void }) {
  const [selected, setSelected] = useState(view.ownedSlots[0]);
  const activity = state.activity?.kind === 'shadow-play' ? state.activity : undefined;
  const active = view.ownedSlots.includes(selected) ? selected : view.ownedSlots[0];
  if (!activity || active === undefined) return null;
  const wall = active === 0 || activity.complete, locked = disabled || activity.complete;
  const piece = active > 0 ? activity.pieces[active - 1] : undefined;
  const act = (command: string, value: number) => onAct({ control: active, command, value });
  const lampOwner = state.players[view.stage.slots[0].seat % state.players.length].name;
  return <View style={{ gap: 13 }}>
    <View style={ui.spread}><StoryText size={11} strong color="#F1CE93" style={ui.kicker}>THE SHADOW SURPRISE</StoryText><StoryText size={11} color="#E4C7AA">{wall ? 'Your view · the wall' : 'Your view · the table'}</StoryText></View>
    <View style={s.scene} {...(Platform.OS === 'web' ? {} : { collapsable: false })}><ShadowScene activity={activity} active={active} wall={wall} /></View>
    <View accessibilityLiveRegion="polite" style={s.feedback}><Ionicons name={activity.complete ? 'sunny-outline' : 'bulb-outline'} size={20} color="#F1CE93" /><StoryText size={13} color={CREAM} style={{ flex: 1 }}>{activity.complete ? SHADOW_FEEDBACK.complete : wall ? 'Fit the shadows inside the gold outlines. Tell your family what you see.' : view.ownedSlots.includes(0) ? 'Switch to Lamp to check your shadow after moving this piece.' : `Wall view · ${lampOwner}. Move your cut-out and ask what changed.`}</StoryText></View>
    <View style={s.panel}>
      <View style={s.tabs}>{view.ownedSlots.map(slot => <Pressable key={slot} accessibilityRole="tab" accessibilityLabel={`Operate ${SHADOW_NAMES[slot]}`} accessibilityState={{ selected: slot === active }} onPress={() => setSelected(slot)} style={[s.tab, slot === active && { backgroundColor: COLORS[slot] }]}><StoryText size={12} strong color={slot === active ? CREAM : INK}>{SHADOW_NAMES[slot].replace(' cut-out', '')}</StoryText></Pressable>)}</View>
      {active === 0 ? <>
        <StoryText size={13} color={INK}>Moving the lamp moves every shadow.</StoryText>
        <View style={s.track}>{Array.from({ length: 5 }, (_, value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Place lamp at rail position ${value + 1}`} accessibilityState={{ selected: activity.lamp === value, disabled: locked }} disabled={locked} onPress={() => act('lamp', value)} style={[s.lampStop, activity.lamp === value && { backgroundColor: COLORS[0] }]}><Ionicons name={activity.lamp === value ? 'bulb' : 'ellipse-outline'} color={INK} size={activity.lamp === value ? 24 : 13} /></Pressable>)}</View>
      </> : piece ? <>
        <View style={s.controls}><Action label="Slide left" icon="arrow-back" disabled={locked || piece.x === 0} onPress={() => act('slide', piece.x - 1)} /><View style={s.position} accessible accessibilityLabel={`${SHADOW_NAMES[active]} at tabletop position ${piece.x + 1}`}><StoryText size={11} strong color={INK}>SLIDE</StoryText><View style={s.dots}>{Array.from({ length: 9 }, (_, i) => <View key={i} style={[s.dot, { backgroundColor: piece.x === i ? COLORS[active] : '#CAB38E' }]} />)}</View></View><Action label="Slide right" icon="arrow-forward" disabled={locked || piece.x === 8} onPress={() => act('slide', piece.x + 1)} /></View>
        <View style={s.distance}>{['Small shadow', 'Medium', 'Large shadow'].map((label, depth) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={`${SHADOW_NAMES[active]}: ${label}`} accessibilityState={{ selected: piece.depth === depth, disabled: locked }} disabled={locked} onPress={() => act('depth', depth)} style={[s.depth, piece.depth === depth && { backgroundColor: COLORS[active] }]}><CircleIcon size={9 + depth * 5} color={piece.depth === depth ? CREAM : INK} /><StoryText size={10} strong color={piece.depth === depth ? CREAM : INK} style={{ textAlign: 'center' }}>{label}</StoryText></Pressable>)}</View>
        <Action label="Turn cut-out" icon="refresh" disabled={locked} onPress={() => act('turn', (piece.turn + 1) % 4)} />
      </> : null}
    </View>
    <View style={s.crew}>{view.stage.slots.filter((_, slot) => !view.ownedSlots.includes(slot)).map(slot => <StoryText key={slot.id} size={11} color="#E4C7AA">{slot.label} · {state.players[slot.seat % state.players.length].name}</StoryText>)}</View>
    <StoryText size={12} color="#E4C7AA">Closer to the lamp makes a bigger shadow. There is no code to guess—watch the picture take shape.</StoryText>
  </View>;
}
function CircleIcon({ size, color }: { size: number; color: string }) { return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />; }
function Action({ label, icon, disabled, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.action, { opacity: disabled ? .38 : pressed ? .65 : 1 }]}><Ionicons name={icon} size={21} color={INK} /><StoryText size={11} strong color={INK}>{label}</StoryText></Pressable>;
}
const s = StyleSheet.create({
  scene: { borderWidth: 3, borderColor: '#A47B55', borderRadius: 18, overflow: 'hidden' }, feedback: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  panel: { backgroundColor: CREAM, borderRadius: 15, padding: 12, gap: 12 }, tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EBD8B7', borderRadius: 9 }, track: { flexDirection: 'row', gap: 7, borderRadius: 10, padding: 4, backgroundColor: '#E6CBA3' },
  lampStop: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  action: { minHeight: 50, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, backgroundColor: '#EEDBBB', justifyContent: 'center', alignItems: 'center', gap: 3 },
  position: { flex: 1, alignItems: 'center', gap: 8 }, dots: { flexDirection: 'row', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }, dot: { width: 5, height: 5, borderRadius: 3 },
  distance: { flexDirection: 'row', gap: 6 }, depth: { flex: 1, minHeight: 60, gap: 7, justifyContent: 'center', alignItems: 'center', padding: 6, borderRadius: 9, backgroundColor: '#EEDBBB' },
  crew: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 5 },
});

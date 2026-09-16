import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import type { InteractiveBoardProps } from './InteractiveStoryBoard';
import { optionsForSlot, rotateFilm } from './interaction-rules';
import { nextGlassChoice } from './lightbox-controls';
import { StoryText, ui } from './story-ui';

const PAPER = '#EEE2C6';
const INK = '#293E43';
const BRASS = '#E4C28A';

/** One shared image, separate controls. No clue sheet or "set first" state. */
export function LightboxBoard({ state, view, onEdit, disabled }: InteractiveBoardProps) {
  const [selected, setSelected] = useState(view.ownedSlots[0]);
  const { width } = useWindowDimensions();
  const comparisonSize = Math.min(116, Math.max(88, Math.floor((width - 100) / 2)));
  const reducedMotion = useHousewireStore(store => store.settings.reducedMotion);
  const model = view.stage.interaction;
  if (model?.kind !== 'lightbox') return null;
  const active = view.ownedSlots.includes(selected) ? selected : view.ownedSlots[0];
  const ownPiece = active === undefined ? undefined : view.stage.slots[active];
  const option = active === undefined ? undefined : optionsForSlot(view.stage, active).find(value => value.id === state.draft[active]);
  const cells = active === undefined ? [] : rotateFilm(model.films[active] ?? [], option?.turn ?? 0);
  const color = model.colors[active] ?? BRASS;
  const live = model.preview ?? [];
  const shortName = (index: number) => view.stage.slots[index].label.replace(/ slide$/i, '');
  const turn = (direction: 1 | -1) => {
    if (active === undefined || disabled) return;
    const value = nextGlassChoice(view.stage, state.draft, active, direction);
    if (value) onEdit(active, value);
  };
  return <View style={styles.table}>
    <View style={styles.titleRow}>
      <Ionicons name="sunny-outline" size={19} color={BRASS} />
      <StoryText strong size={12} color={BRASS} style={{ letterSpacing: 1.3 }}>THE COURTYARD WINDOW</StoryText>
    </View>
    <View style={styles.comparison}>
      <View style={styles.window} accessible accessibilityLabel="Target: a little house made of fourteen lit squares">
        <StoryText strong size={12} color={INK}>MAKE THIS</StoryText>
        <Glass cells={model.target} color="#C28A40" size={comparisonSize} target />
      </View>
      <View style={styles.window} accessible accessibilityLabel={`Our shared picture has ${live.length} lit squares. It changes when anyone turns a piece.`}>
        <StoryText strong size={12} color={INK}>OUR PICTURE</StoryText>
        <Animated.View key={live.join(',')} entering={reducedMotion ? undefined : FadeIn.duration(130)}>
          <Glass cells={live} color="#D39264" size={comparisonSize} />
        </Animated.View>
      </View>
    </View>
    <StoryText size={13} color="#E5D2BB" style={{ textAlign: 'center' }}>Turn your pieces. Make both pictures match.</StoryText>

    <View style={styles.workingArea}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {view.ownedSlots.map(index => <Pressable key={view.stage.slots[index].id} accessibilityRole="tab" accessibilityLabel={`Your ${shortName(index)} glass`} accessibilityState={{ selected: active === index }} onPress={() => setSelected(index)} style={[styles.tab, { borderColor: active === index ? model.colors[index] : '#82958A', backgroundColor: active === index ? '#426660' : 'transparent' }]}>
          <View style={[styles.dot, { backgroundColor: model.colors[index] }]} />
          <StoryText strong size={14} color={PAPER}>{shortName(index)}</StoryText>
        </Pressable>)}
      </View>
      {ownPiece ? <>
        <Pressable accessibilityRole="button" accessibilityLabel={`Rotate ${ownPiece.label} clockwise by 90 degrees`} accessibilityHint="The piece turns immediately. The shared picture updates for everyone." accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={() => turn(1)} style={({ pressed }) => [styles.glassControl, { opacity: pressed ? .78 : 1 }]}>
          <Glass cells={cells} color={color} size={172} />
          <StoryText size={12} color="#E9D8C0">YOUR {shortName(active).toUpperCase()} GLASS · {option?.turn ? option.turn * 90 : 0}°</StoryText>
        </Pressable>
        <View style={styles.turns}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Rotate ${ownPiece.label} anticlockwise by 90 degrees`} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={() => turn(-1)} style={({ pressed }) => [styles.turn, { backgroundColor: color, opacity: disabled ? .45 : pressed ? .78 : 1 }]}>
            <Ionicons name="refresh-outline" size={25} color={INK} style={{ transform: [{ scaleX: -1 }] }} /><StoryText strong size={15} color={INK}>90°</StoryText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Rotate ${ownPiece.label} clockwise by 90 degrees`} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={() => turn(1)} style={({ pressed }) => [styles.turn, { backgroundColor: color, opacity: disabled ? .45 : pressed ? .78 : 1 }]}>
            <StoryText strong size={15} color={INK}>90°</StoryText><Ionicons name="refresh-outline" size={25} color={INK} />
          </Pressable>
        </View>
      </> : <StoryText color={PAPER}>Your family is working on the glass.</StoryText>}
    </View>

    <View style={styles.familyPieces}>
      {view.stage.slots.map((slot, index) => view.ownedSlots.includes(index) ? null : <View key={slot.id} style={styles.familyPiece}>
        <View style={[styles.dot, { backgroundColor: model.colors[index] }]} />
        <View style={{ flex: 1 }}><StoryText strong size={12} color={PAPER}>{shortName(index)}</StoryText><StoryText size={11} color="#D6BDC0">{state.players[slot.seat % state.players.length].name} turns this</StoryText></View>
        <Ionicons name="people-outline" color={model.colors[index]} size={17} />
      </View>)}
    </View>
    <View style={ui.row}><Ionicons name="chatbubbles-outline" color={BRASS} size={18} /><StoryText size={12} color="#DECDB9" style={{ flex: 1 }}>Tell your family which gap to fill. Everyone sees the same shared picture.</StoryText></View>
  </View>;
}

function Glass({ cells, color, size, target = false }: { cells: readonly number[]; color: string; size: number; target?: boolean }) {
  return <Svg width={size} height={size} viewBox="0 0 122 122">
    <Defs><LinearGradient id="glass-paper" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FFF6DE" /><Stop offset="1" stopColor="#E4CDA9" /></LinearGradient></Defs>
    <Rect x={1} y={1} width={120} height={120} rx={13} fill="url(#glass-paper)" stroke="#82664B" strokeWidth={2} />
    {[9, 113].flatMap(x => [9, 113].map(y => <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill="#9C805B" />))}
    {Array.from({ length: 25 }, (_, cell) => <Rect key={cell} x={13 + cell % 5 * 20} y={13 + Math.floor(cell / 5) * 20} width={16} height={16} rx={2} fill={cells.includes(cell) ? color : '#D6C4AB'} fillOpacity={cells.includes(cell) ? 1 : .37} stroke={cells.includes(cell) ? target ? '#9D6C34' : '#7C584455' : '#B19A7722'} strokeWidth={.8} />)}
  </Svg>;
}

const styles = StyleSheet.create({
  table: { gap: 14, padding: 14, borderRadius: 24, backgroundColor: '#294349', borderWidth: 1, borderColor: '#829A82' },
  titleRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  comparison: { flexDirection: 'row', justifyContent: 'space-evenly', gap: 9, paddingVertical: 13, paddingHorizontal: 7, backgroundColor: PAPER, borderRadius: 15 },
  window: { alignItems: 'center', gap: 7, flexShrink: 1 },
  workingArea: { gap: 13, backgroundColor: '#35554F', padding: 12, borderRadius: 17, borderWidth: 1, borderColor: '#7C947C' },
  tabs: { flexDirection: 'row', gap: 9, justifyContent: 'center', flexWrap: 'wrap' },
  tab: { minHeight: 44, minWidth: 96, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dot: { width: 11, height: 11, borderRadius: 4 },
  glassControl: { alignItems: 'center', gap: 9, minHeight: 44, minWidth: 44, paddingVertical: 1 },
  turns: { flexDirection: 'row', gap: 12 },
  turn: { flex: 1, minHeight: 50, minWidth: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  familyPieces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  familyPiece: { flexBasis: '46%', flexGrow: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 9, padding: 8, backgroundColor: '#355650' },
});

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { decorativeAccessibilityProps } from '@/src/utils/accessibility';
import type { InteractiveBoardProps } from './InteractiveStoryBoard';
import { optionsForSlot } from './interaction-rules';
import { StoryText, ui } from './story-ui';

const INK = '#244C4E';
const AMBER = '#F5C287';
const CREAM = '#FFF1D5';
const ROUTE = '#CF7056';
const MAP_HEIGHT = 380;

function StationIcon({ name, color = INK, size = 24 }: { name: string; color?: string; size?: number }) {
  return <Ionicons name={name in Ionicons.glyphMap ? name as keyof typeof Ionicons.glyphMap : 'location-outline'} size={size} color={color} />;
}

/** The toy-maker's model town and workbench. The old room ID remains compatible. */
export function StationStoryBoard(props: InteractiveBoardProps) {
  const route = props.view.stage.interaction?.kind === 'route-map';
  return <View style={{ gap: 14 }}>
    <View style={ui.spread}>
      <StoryText strong size={12} color={AMBER} style={ui.kicker}>{route ? 'THE LITTLE DELIVERY' : 'THE TOY-MAKER’S BENCH'}</StoryText>
      <StoryText size={12}>{props.state.draft.filter(Boolean).length}/{props.view.stage.slots.length} set</StoryText>
    </View>
    <StoryText size={14} color="#D8E2D6">{props.view.stage.instruction}</StoryText>
    {route ? <RouteMap {...props} /> : <ControlConsole {...props} />}
    <StoryText size={12} color="#BFD0C7">Change your choices freely. Checking a wrong complete plan uses one attempt.</StoryText>
  </View>;
}

function RouteMap({ state, view, onEdit, disabled }: InteractiveBoardProps) {
  const model = view.stage.interaction;
  const [active, setActive] = useState(view.ownedSlots[0]);
  useEffect(() => { setActive(view.ownedSlots.find(slot => !state.draft[slot]) ?? view.ownedSlots[0]); }, [view.playerId, view.stage.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (model?.kind !== 'route-map') return null;
  const selected = view.ownedSlots.includes(active) ? active : view.ownedSlots[0];
  const nodes = new Map(model.nodes.map(node => [node.id, node]));
  const joins = (a: string, b: string) => model.edges.some(([from, to]) => (from === a && to === b) || (from === b && to === a));
  const hasJump = state.draft.some((id, index) => index > 0 && id && state.draft[index - 1] && !joins(state.draft[index - 1], id));
  const canEdit = !disabled && selected !== undefined;
  const choose = (id: string) => {
    if (!canEdit) return;
    onEdit(selected, id);
    const next = view.ownedSlots.find(slot => slot !== selected && !state.draft[slot]);
    if (next !== undefined) setActive(next);
  };
  return <View style={{ gap: 12 }}>
    <View style={styles.stops}>
      {view.ownedSlots.map(index => {
        const slot = view.stage.slots[index];
        const value = nodes.get(state.draft[index]);
        return <Pressable key={slot.id} accessibilityRole="button" accessibilityLabel={`Select route stop ${index + 1}: ${slot.label}. ${value?.label ?? 'Not set'}. Your control`} accessibilityState={{ disabled, selected: selected === index }} disabled={disabled} onPress={() => setActive(index)} style={[styles.stop, { borderColor: selected === index ? AMBER : '#588080', backgroundColor: selected === index ? '#355F5E' : '#244B4E' }]}>
          <View style={ui.row}><View style={[styles.stepNumber, { backgroundColor: selected === index ? AMBER : '#658985' }]}><StoryText size={12} strong color={selected === index ? INK : CREAM}>{index + 1}</StoryText></View><StoryText size={12} strong style={{ flex: 1 }}>{slot.label}</StoryText></View>
          <StoryText size={13} color={value ? CREAM : '#C0D4CB'}>{value?.label ?? 'Tap a building below'}</StoryText>
          <StoryText size={10} color="#C3D4C8">YOUR STOP</StoryText>
        </Pressable>;
      })}
    </View>
    <View style={styles.mapPaper}>
      <View style={ui.spread}><StoryText strong size={11} color={INK}>ONE TINY TOWN</StoryText><View style={styles.routeLegend} /><StoryText size={10} color="#617F71">CART TRACK</StoryText></View>
      <View style={{ height: MAP_HEIGHT, position: 'relative' }}>
        <Svg pointerEvents="none" width="100%" height={MAP_HEIGHT} viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          {model.edges.map(([a, b]) => {
            const from = nodes.get(a); const to = nodes.get(b);
            return from && to ? <Path key={`${a}-${b}`} d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} stroke="#AEC2AE" strokeWidth={4} fill="none" /> : null;
          })}
          {model.edges.map(([a, b]) => {
            const from = nodes.get(a); const to = nodes.get(b);
            return from && to ? <Path key={`rail-${a}-${b}`} d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} stroke="#F5E9CC" strokeWidth={1.4} strokeDasharray=".8,.8" fill="none" /> : null;
          })}
          {state.draft.map((id, index) => {
            const from = index > 0 ? nodes.get(state.draft[index - 1]) : undefined; const to = nodes.get(id);
            return from && to ? <Path key={`route-${index}`} d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} stroke={ROUTE} strokeWidth={1.8} strokeDasharray={joins(from.id, to.id) ? undefined : '2,2'} fill="none" /> : null;
          })}
        </Svg>
        {model.nodes.map(node => {
          const steps = state.draft.flatMap((id, index) => id === node.id ? [index + 1] : []);
          const isSelected = state.draft[selected] === node.id;
          return <Pressable key={node.id} accessibilityRole="button" accessibilityLabel={`Place route stop ${selected === undefined ? '' : selected + 1} at ${node.label}`} accessibilityState={{ disabled: !canEdit, selected: isSelected }} disabled={!canEdit} onPress={() => choose(node.id)} style={({ pressed }) => [styles.place, { left: `${node.x - 21}%`, top: node.y / 100 * MAP_HEIGHT - 43, borderColor: isSelected ? ROUTE : steps.length ? '#B2B88F' : '#DED2B4', backgroundColor: pressed ? '#F5D6A7' : CREAM }]}>
            <MiniatureBuilding id={node.id} />
            <StoryText size={13} strong color={INK} style={{ textAlign: 'center' }}>{node.label}</StoryText>
            {steps.length ? <View style={styles.mapMarker}><StoryText size={11} strong color="#FFF8E9">{steps.join(', ')}</StoryText></View> : null}
          </Pressable>;
        })}
      </View>
      <StoryText size={12} color={hasJump ? '#B65339' : '#537164'}>{hasJump ? 'That dashed route leaves the track. Join neighbouring buildings.' : selected === undefined ? 'Your family is setting the route.' : `Placing stop ${selected + 1} · ${view.stage.slots[selected].label}`}</StoryText>
    </View>
    <View style={styles.teammates}>{view.stage.slots.map((slot, index) => view.ownedSlots.includes(index) ? null : <View key={slot.id} style={styles.teammateStop}><StoryText size={11} strong color={AMBER}>{index + 1}</StoryText><View style={{ flex: 1 }}><StoryText size={11} color={CREAM}>{nodes.get(state.draft[index])?.label ?? slot.label}</StoryText><StoryText size={10} color="#BFD0C7">{state.players[slot.seat % state.players.length].name}</StoryText></View></View>)}</View>
    {selected !== undefined && state.draft[selected] ? <Pressable accessibilityRole="button" accessibilityLabel={`Clear route stop ${selected + 1}`} disabled={disabled} onPress={() => onEdit(selected, '')} style={styles.clear}><StoryText size={12} color="#E1C8AD">Clear selected stop</StoryText></Pressable> : null}
  </View>;
}

function ControlConsole({ state, view, onEdit, disabled }: InteractiveBoardProps) {
  const model = view.stage.interaction;
  if (model?.kind !== 'control-console') return null;
  const siteOrder = [...view.ownedSlots, ...model.sites.map((_, index) => index).filter(index => !view.ownedSlots.includes(index))];
  return <View style={styles.desk}>
    <View style={ui.spread}><StoryText size={10} strong color={AMBER}>AFTER HOURS / WORKBENCH</StoryText><View style={styles.powerLamp} /><StoryText size={10} color="#D3E1CD">TEST RIG</StoryText></View>
    {siteOrder.map(index => {
      const site = model.sites[index];
      const owned = view.ownedSlots.includes(index);
      const chosen = view.stage.options.find(option => option.id === state.draft[index]);
      return <View key={view.stage.slots[index].id} style={[styles.device, { borderColor: owned ? '#8CB1A5' : '#53706B', padding: owned ? 12 : 9 }]}>
        <View style={ui.row}>
          <View style={[styles.deviceIcon, !owned && { width: 32, height: 32 }]}><StationIcon name={site.icon} color={AMBER} size={owned ? 25 : 19} /></View>
          <View style={{ flex: 1, gap: 3 }}><StoryText strong size={owned ? 18 : 15}>{site.label}</StoryText><StoryText size={10} color={owned ? AMBER : '#B7CDC2'}>{owned ? 'YOUR CONTROL' : state.players[view.stage.slots[index].seat % state.players.length].name}</StoryText></View>
          <View style={[styles.readyLamp, { backgroundColor: chosen ? '#ABC9A7' : '#4C716B' }]} />
        </View>
        {owned ? <>
          <StoryText size={12} color="#D0DEC9">{site.description}</StoryText>
          <View accessibilityRole="radiogroup" style={{ gap: 7 }}>
            {optionsForSlot(view.stage, index).map(option => {
              const selected = state.draft[index] === option.id;
              return <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={`${site.label}: ${option.label}`} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={() => onEdit(index, option.id)} style={({ pressed }) => [styles.setting, { backgroundColor: selected ? '#F5C287' : pressed ? '#426D67' : '#214D50', borderColor: selected ? '#FFE5BA' : '#688E84', opacity: disabled ? .55 : 1 }]}>
                <View style={[styles.selector, { borderColor: selected ? INK : '#B0C6AD' }]}>{selected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: INK }} /> : null}</View>
                <StoryText size={14} strong color={selected ? INK : CREAM} style={{ flex: 1 }}>{option.label}</StoryText>
              </Pressable>;
            })}
          </View>
        </> : <StoryText size={12} color={chosen ? '#BBDCB6' : '#B7CDC2'}>{chosen?.label ?? 'Choosing their setting'}</StoryText>}
      </View>;
    })}
    <StoryText size={12} color="#C8D5BD">Share your repair note. Someone else needs it for their device.</StoryText>
  </View>;
}

function MiniatureBuilding({ id }: { id: string }) {
  const roof = id === 'ticket' ? '#CB7F86' : id === 'relay' ? '#6F9E94' : id === 'workshop' ? '#A27FAD' : '#C37C59';
  return <Svg width={57} height={44} viewBox="0 0 64 48" {...decorativeAccessibilityProps}>
    <Path d="M7 44 H58" stroke="#CBBE9B" strokeWidth={3} strokeLinecap="round" />
    {id === 'platform' ? <>
      <Rect x={10} y={22} width={41} height={17} rx={5} fill="#619489" /><Rect x={14} y={11} width={23} height={22} rx={3} fill="#619489" />
      <Rect x={18} y={15} width={15} height={10} rx={2} fill="#FBE5B8" /><Rect x={43} y={16} width={6} height={10} rx={1} fill="#406C66" />
      <Circle cx={20} cy={40} r={5} fill={INK} /><Circle cx={43} cy={40} r={5} fill={INK} /><Path d="M14 8 H38" stroke={INK} strokeWidth={3} strokeLinecap="round" />
    </> : id === 'gate' ? <>
      <Rect x={21} y={10} width={23} height={32} rx={2} fill="#DBB677" /><Path d="M17 12 L32 2 L48 12" fill="#C37C59" stroke="#9A654E" strokeWidth={2} strokeLinejoin="round" />
      <Circle cx={32.5} cy={23} r={8} fill="#FFF3D7" stroke="#A38558" /><Path d="M32 18 V23 H37" stroke={INK} strokeWidth={1.5} strokeLinecap="round" /><Rect x={29} y={35} width={7} height={7} rx={3} fill="#8B7050" />
    </> : <>
      <Rect x={11} y={17} width={42} height={25} rx={2} fill="#EBD1A0" /><Path d="M7 18 L32 3 L57 18 Z" fill={roof} />
      <Rect x={28} y={29} width={10} height={13} rx={2} fill="#A99577" />
      {id === 'relay' ? <><Rect x={19} y={21} width={27} height={16} rx={2} fill="#FAEFD2" stroke="#719789" /><Path d="M20 23 L32.5 30 L45 23" stroke="#719789" strokeWidth={1.5} fill="none" /></> : null}
      {id === 'ticket' ? <><Path d="M10 19 H54 V25 Q49 30 45 25 Q41 30 37 25 Q32 30 28 25 Q24 30 20 25 Q14 30 10 25 Z" fill="#D99197" /><Path d="M19 19 V26 M31 19 V26 M43 19 V26" stroke="#FFE1C1" strokeWidth={4} /><Circle cx={20} cy={34} r={4} fill="#B991C0" /></> : null}
      {id === 'workshop' ? <><Rect x={16} y={25} width={9} height={9} rx={1} fill="#89A997" /><Path d="M37 26 L45 35 M36 34 L45 25" stroke="#795E7F" strokeWidth={3} strokeLinecap="round" /></> : null}
      {id === 'boiler' ? <><Rect x={15} y={22} width={35} height={13} rx={2} fill="#FFF1D2" /><Path d="M20 31 Q21 19 29 26 Q33 19 36 27 Q43 22 46 32 Z" fill="#D49C4D" stroke="#B7803F" strokeWidth={1.3} /></> : null}
    </>}
  </Svg>;
}

const styles = StyleSheet.create({
  stops: { flexDirection: 'row', gap: 9 },
  stop: { flex: 1, minHeight: 91, padding: 10, borderRadius: 13, borderWidth: 1.5, gap: 6 },
  stepNumber: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  mapPaper: { padding: 13, backgroundColor: '#F1E6C7', borderWidth: 2, borderColor: '#B1B493', borderRadius: 21, gap: 2 },
  routeLegend: { height: 3, width: 18, backgroundColor: '#9BB6A4', marginLeft: 'auto' },
  place: { position: 'absolute', width: '42%', minHeight: 86, padding: 6, gap: 3, borderWidth: 2, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  mapMarker: { position: 'absolute', top: -9, right: -8, minWidth: 25, minHeight: 25, borderRadius: 13, paddingHorizontal: 5, backgroundColor: ROUTE, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#F1E6C7' },
  teammates: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  teammateStop: { width: '47%', flexDirection: 'row', gap: 9, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 5 },
  clear: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end', paddingHorizontal: 10 },
  desk: { backgroundColor: '#1D3F42', borderWidth: 2, borderColor: '#71998B', borderRadius: 20, padding: 12, gap: 13 },
  device: { backgroundColor: '#305857', borderWidth: 1.5, borderRadius: 12, padding: 12, gap: 12 },
  deviceIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#20474A' },
  readyLamp: { width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: '#1D3F42' },
  powerLamp: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#97DAB2', marginLeft: 'auto' },
  setting: { minHeight: 49, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  selector: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { optionsForSlot, pipePorts } from './interaction-rules';
import { LightboxBoard } from './LightboxBoard';
import { OpticalReaderBoard } from './OpticalReaderBoard';
import { useRoomPresentation } from './room-presentation';
import { StoryButton, StoryText, ui } from './story-ui';
import type { StoryOption, StoryPlayerView, StoryState } from './types';

export interface InteractiveBoardProps { state: StoryState; view: StoryPlayerView; onEdit(slot: number, value: string): void; disabled?: boolean }
const COLORS = ['#76CCF1', '#FF8A79', '#8FE0B1', '#F4D47C'];
const PORTS = [[50, 0], [100, 50], [50, 100], [0, 50]];
function SafeIcon({ name, color, size = 28 }: { name?: string; color: string; size?: number }) {
  const valid = name && name in Ionicons.glyphMap ? name as keyof typeof Ionicons.glyphMap : 'cube-outline';
  return <Ionicons name={valid} size={size} color={color} />;
}

export function InteractiveStoryBoard(props: InteractiveBoardProps) {
  const kind = props.view.stage.interaction?.kind;
  if (kind === 'lightbox') return <LightboxBoard {...props} />;
  if (kind === 'patch-panel' && props.view.stage.id === 'night-glass-watermark') return <OpticalReaderBoard {...props} />;
  return <View style={{ gap: 14 }}>
    <View style={ui.spread}><StoryText size={12} strong color={props.view.room.accent} style={ui.kicker}>{kind === 'patch-panel' ? 'THE SWITCHBOARD' : kind === 'pipe-grid' ? 'INSIDE THE WALL' : 'LOOK · CHOOSE · USE'}</StoryText><StoryText size={12}>{props.state.draft.filter(Boolean).length}/4 set</StoryText></View>
    <StoryText size={14} color="#C4D4DD">{props.view.stage.instruction}</StoryText>
    {kind === 'patch-panel' ? <PatchPanel {...props} /> : kind === 'workbench' ? <Workbench {...props} /> : <RotationBoard {...props} />}
    <StoryText size={12} color="#A6BDC8">Changes are free. Only “Test our complete plan” spends an attempt when the plan is wrong.</StoryText>
  </View>;
}

function PatchPanel({ state, view, onEdit, disabled }: InteractiveBoardProps) {
  const { stage, ownedSlots } = view;
  const [active, setActive] = useState(ownedSlots[0]);
  const height = 374;
  const leftY = (i: number) => 25 + i * 89;
  const rightY = (i: number) => 12 + i * 59;
  const chosen = stage.options.find(option => option.id === state.draft[active]);
  return <View style={{ gap: 12 }}>
    <View style={board.patch}>
      <View style={{ height, position: 'relative' }}>
        <Svg pointerEvents="none" width="100%" height={height} viewBox={`0 0 320 ${height}`} preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          {stage.slots.map((slot, index) => {
            const destination = stage.options.findIndex(option => option.id === state.draft[index]);
            const y = leftY(index) + 32;
            return <Path key={slot.id} d={destination < 0 ? `M 113 ${y} C 149 ${y} 139 ${y + 16} 157 ${y + 16}` : `M 113 ${y} C 184 ${y} 136 ${rightY(destination) + 23} 207 ${rightY(destination) + 23}`} stroke={COLORS[index]} strokeWidth={active === index ? 5 : 3} fill="none" opacity={destination < 0 ? .35 : 1} />;
          })}
        </Svg>
        {stage.slots.map((slot, index) => {
          const owned = ownedSlots.includes(index); const selected = active === index;
          return <Pressable key={slot.id} accessibilityRole="button" accessibilityLabel={`Select cable: ${slot.label}${owned ? '' : '. Teammate control'}`} accessibilityState={{ disabled: disabled || !owned, selected }} disabled={disabled || !owned} onPress={() => setActive(index)} style={[board.cable, { top: leftY(index), borderColor: selected ? COLORS[index] : '#536E78', backgroundColor: selected ? '#29434C' : '#182D36' }]}>
            <View style={ui.row}><View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: COLORS[index] }} /><StoryText size={12} strong style={{ flex: 1 }}>{slot.label}</StoryText></View>
            <StoryText size={10} color="#BDD0D9">{owned ? 'YOUR CABLE' : state.players[slot.seat % state.players.length].name}</StoryText>
          </Pressable>;
        })}
        {stage.options.map((option, index) => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`Connect ${stage.slots[active]?.label ?? 'cable'} to ${option.label}`} accessibilityState={{ disabled: disabled || active === undefined, selected: chosen?.id === option.id }} disabled={disabled || active === undefined} onPress={() => onEdit(active, option.id)} style={[board.socket, { top: rightY(index), borderColor: chosen?.id === option.id ? COLORS[active] : '#6E8488' }]}>
          <View style={board.socketHole} /><StoryText size={12} strong color="#1A333E" style={{ flex: 1 }}>{option.label}</StoryText>
        </Pressable>)}
      </View>
    </View>
    <View style={ui.spread}><StoryText size={13} strong color={COLORS[active] ?? view.room.accent} style={{ flex: 1 }}>{active === undefined ? 'Your family is connecting these cables.' : `${stage.slots[active].label} → ${chosen?.label ?? 'choose a socket'}`}</StoryText>{active !== undefined && chosen ? <Pressable accessibilityRole="button" accessibilityLabel={`Unplug ${stage.slots[active].label}`} disabled={disabled} onPress={() => onEdit(active, '')} style={board.unplug}><StoryText size={12}>Unplug</StoryText></Pressable> : null}</View>
    <StoryText size={12} color="#B9CBD2">Tap your cable, then a socket. Someone else has the note you need in My clues.</StoryText>
  </View>;
}

function Workbench({ state, view, onEdit, disabled }: InteractiveBoardProps) {
  const model = view.stage.interaction;
  const [active, setActive] = useState<number>();
  const look = useRoomPresentation();
  const ink = view.room.id === 'night-glass' ? '#493B4E' : '#233D47';
  const mutedInk = view.room.id === 'night-glass' ? '#71616E' : '#536269';
  if (model?.kind !== 'workbench') return null;
  const choices = active === undefined ? [] : optionsForSlot(view.stage, active);
  return <>
    <View style={[board.workshop, look && { backgroundColor: look.panel }]}>
      {model.sites.map((site, i) => {
        const owned = view.ownedSlots.includes(i);
        const option = view.stage.options.find(option => option.id === state.draft[i]);
        return <Pressable key={site.label} accessibilityRole="button" accessibilityLabel={`Inspect ${site.label}: ${option?.label ?? 'nothing selected'}`} accessibilityState={{ disabled: !owned || disabled }} disabled={!owned || disabled} onPress={() => setActive(i)} style={[board.fixture, { borderColor: option ? view.room.accent : look?.border ?? '#71808B', backgroundColor: owned ? view.room.paper : '#C8BEBD' }]}>
          <View style={ui.spread}><StoryText color={mutedInk} size={10} strong>{owned ? 'YOUR STATION' : state.players[view.stage.slots[i].seat % state.players.length].name}</StoryText>{!owned ? <Ionicons name="lock-closed-outline" size={12} color={mutedInk} /> : null}</View>
          <View style={board.fixtureScene}>
            <SafeIcon name={site.icon} size={43} color={ink} />
            {option ? <View style={[board.toolToken, { backgroundColor: view.room.accent }]}><SafeIcon name={option.icon} size={22} color={ink} /></View> : null}
            <View style={board.shelf} />
          </View>
          <StoryText strong color={ink} size={17}>{site.label}</StoryText>
          <StoryText color={mutedInk} size={12}>{option?.label ?? (owned ? 'Tap to inspect' : 'Your teammate decides')}</StoryText>
        </Pressable>;
      })}
    </View>
    <StoryText size={12} color={look?.muted ?? '#B9CBD2'}>Inspect your station, then choose what to use. Your family’s clues explain what belongs where.</StoryText>
    <Modal transparent visible={active !== undefined} animationType="fade" onRequestClose={() => setActive(undefined)}>
      <View style={ui.sheetBackdrop}><View style={[ui.sheet, { backgroundColor: look?.background ?? '#111D24', borderTopWidth: 1, borderTopColor: view.room.accent }]}>
        <View style={ui.spread}><StoryText display size={30} style={{ flex: 1 }}>{active === undefined ? '' : model.sites[active].label}</StoryText><StoryButton label="Close" secondary onPress={() => setActive(undefined)} /></View>
        <StoryText size={15} color={look?.muted}>{active === undefined ? '' : model.sites[active].description}</StoryText>
        <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
          {choices.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`Use ${option.label}`} disabled={disabled} onPress={() => { if (active !== undefined) onEdit(active, option.id); setActive(undefined); }} style={[board.tool, { borderColor: look?.border ?? view.room.accent + '88', backgroundColor: look?.panel ?? '#273E49' }]}><SafeIcon name={option.icon} color={view.room.accent} /><View style={{ flex: 1, gap: 3 }}><StoryText strong>{option.label}</StoryText><StoryText size={12} color={look?.muted ?? '#BED0D7'}>{option.detail}</StoryText></View><Ionicons name="arrow-forward" color={view.room.accent} size={20} /></Pressable>)}
        </ScrollView>
        {active !== undefined && state.draft[active] ? <StoryButton label="Clear this station" secondary onPress={() => { onEdit(active, ''); setActive(undefined); }} /> : null}
      </View></View>
    </Modal>
  </>;
}

function RotationBoard({ state, view, onEdit, disabled }: InteractiveBoardProps) {
  const model = view.stage.interaction;
  if (model?.kind !== 'pipe-grid') return null;
  const finished = state.status === 'stage-solved' || state.status === 'won';
  const rotate = (slot: number) => {
    const choices = optionsForSlot(view.stage, slot);
    const current = choices.find(choice => choice.id === state.draft[slot]);
    const nextTurn = current?.turn === undefined ? 0 : (current.turn + 1) % 4;
    const next = choices.find(choice => choice.turn === nextTurn);
    if (next) onEdit(slot, next.id);
  };
  return <View style={{ gap: 16 }}>
    <StoryText color="#99E0CB" size={12} strong>INLET → FOUR PIPE SECTIONS → OUTLET</StoryText>
    <View style={[board.rotations, { backgroundColor: '#1A343A' }]}>
      {view.stage.slots.map((slot, i) => {
        const owned = view.ownedSlots.includes(i);
        const visible = owned || finished;
        const option: StoryOption | undefined = view.stage.options.find(option => option.id === state.draft[i]);
        const ports = pipePorts(view.stage, state.draft, i);
        const basePorts = model.tiles[i];
        const shownPorts = ports.length ? ports : basePorts;
        return <View key={slot.id} style={[board.rotation, { borderColor: owned ? view.room.accent : '#47606C' }]}>
          <StoryText size={12} strong>{slot.label}</StoryText>
          <View style={{ height: 118, alignItems: 'center', justifyContent: 'center' }}>
            {visible ? <Svg width="100%" height={106} viewBox="-8 -8 116 116">
              <Rect x={0} y={0} width={100} height={100} rx={12} fill="#152D34" />
              {[0, 1, 2, 3].map(edge => <Circle key={edge} cx={PORTS[edge][0]} cy={PORTS[edge][1]} r={4} fill="#55727C" />)}
              {shownPorts.length === 2 && shownPorts[0] >= 0 ? <Path d={`M ${PORTS[shownPorts[0]][0]} ${PORTS[shownPorts[0]][1]} Q 50 50 ${PORTS[shownPorts[1]][0]} ${PORTS[shownPorts[1]][1]}`} fill="none" stroke={option ? view.room.accent : '#5C7A80'} strokeWidth={15} strokeLinecap="butt" /> : null}
              {model.source.cell === i ? <Circle cx={PORTS[model.source.edge][0]} cy={PORTS[model.source.edge][1]} r={7} fill="#FFFFFF" stroke="#65E4BC" strokeWidth={3} /> : null}
              {model.target.cell === i ? <Circle cx={PORTS[model.target.edge][0]} cy={PORTS[model.target.edge][1]} r={7} fill="#FFD777" /> : null}
              <Circle cx={50} cy={50} r={5} fill="#1B4148" />
            </Svg> : <View style={board.hidden}><Ionicons name="chatbubbles-outline" color="#9BBAC5" size={32} /><StoryText size={11} color="#B8CDD5" style={{ textAlign: 'center' }}>Ask your teammate which edges meet.</StoryText></View>}
            {(model.source.cell === i || model.target.cell === i) ? <StoryText size={10} strong color={model.source.cell === i ? '#A1F4D4' : '#FFD777'}>{model.source.cell === i ? 'WHITE RING · INLET' : 'GOLD RING · OUTLET'}</StoryText> : null}
          </View>
          <StoryText size={10} color="#BCD0D8">{owned ? 'YOUR PIECE' : state.players[slot.seat % state.players.length].name} · {option ? 'set' : 'not set'}</StoryText>
          {owned ? <Pressable accessibilityRole="button" accessibilityLabel={`${option ? 'Turn' : 'Set'} ${slot.label}`} disabled={disabled} onPress={() => rotate(i)} style={[board.turn, { backgroundColor: view.room.accent, opacity: disabled ? .45 : 1 }]}><Ionicons name={option ? 'refresh-outline' : 'hand-left-outline'} color="#19333D" size={18} /><StoryText strong size={12} color="#19333D">{option ? 'Quarter turn' : 'Set this piece'}</StoryText></Pressable> : <View style={{ minHeight: 40, justifyContent: 'center' }}><StoryText size={11} color="#A6BFCB">Their control</StoryText></View>}
        </View>;
      })}
    </View>
    <View style={ui.row}><Ionicons name="people-outline" color={view.room.accent} size={21} /><StoryText size={13} style={{ flex: 1 }}>Only you can see your pipes. Describe where their open ends point, and line them up with your family’s pieces.</StoryText></View>
  </View>;
}

const board = StyleSheet.create({
  patch: { backgroundColor: '#10252D', borderWidth: 2, borderColor: '#526B70', borderRadius: 18, padding: 9 },
  cable: { position: 'absolute', left: 0, width: '39%', minHeight: 66, borderWidth: 1.5, borderRadius: 10, padding: 9, justifyContent: 'center', gap: 6 },
  socket: { position: 'absolute', right: 0, width: '38%', minHeight: 46, borderWidth: 2, backgroundColor: '#EEE6CE', borderRadius: 8, padding: 7, flexDirection: 'row', alignItems: 'center', gap: 7 },
  socketHole: { width: 11, height: 11, backgroundColor: '#253E47', borderRadius: 6, borderWidth: 2, borderColor: '#9B9688' },
  unplug: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  workshop: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', backgroundColor: '#453B30', borderRadius: 19, padding: 12 },
  fixture: { width: '47.5%', borderWidth: 2, borderRadius: 12, padding: 10, gap: 8, minHeight: 190 },
  fixtureScene: { height: 74, alignItems: 'center', justifyContent: 'center' }, shelf: { height: 4, backgroundColor: '#A8A087', width: '90%', borderRadius: 2, position: 'absolute', bottom: 2 },
  toolToken: { position: 'absolute', bottom: 4, right: 0, borderRadius: 14, width: 35, height: 35, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-12deg' }] },
  tool: { minHeight: 76, borderRadius: 14, padding: 14, borderWidth: 1, backgroundColor: '#273E49', flexDirection: 'row', alignItems: 'center', gap: 13 },
  rotations: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, padding: 10, borderRadius: 18 },
  rotation: { width: '48%', borderWidth: 1, borderRadius: 13, padding: 9, gap: 7 },
  turn: { minHeight: 44, borderRadius: 10, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  hidden: { alignItems: 'center', gap: 10, padding: 8 },
});

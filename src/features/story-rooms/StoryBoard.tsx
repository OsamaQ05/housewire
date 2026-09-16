import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { StoryPlayer, StoryPlayerView, StoryState, StoryOption } from './types';
import { STORY_INK, StoryButton, StoryIconButton, StoryText, ui } from './story-ui';
import { InteractiveStoryBoard, type InteractiveBoardProps } from './InteractiveStoryBoard';
import { StationStoryBoard } from './StationBoards';
import { TableSceneBoard } from './TableSceneBoard';
import type { ActivityMove } from './activities/contracts';
import { MarbleMachineBoard } from './MarbleMachineBoard';
import { TimeHouseBoard } from './TimeHouseBoard';
import { ToolSearchBoard } from './ToolSearchBoard';
import { RescueCraneBoard } from './RescueCraneBoard';
import { BenchWiringBoard } from './BenchWiringBoard';
import { ServingTrayBoard } from './ServingTrayBoard';
import { ShadowPlayBoard } from './ShadowPlayBoard';
import { ClockworkMachineBoard } from './ClockworkMachineBoard';

interface DropBox { index: number; x: number; y: number; width: number; height: number }
export function StoryBoard(props: InteractiveBoardProps & { onAct(move: ActivityMove): void }) {
  const kind = props.view.stage.interaction?.kind;
  if (kind === 'marble-machine') return <MarbleMachineBoard {...props} />;
  if (kind === 'time-house') return <TimeHouseBoard {...props} />;
  if (kind === 'tool-search') return <ToolSearchBoard {...props} />;
  if (kind === 'rescue-crane') return <RescueCraneBoard {...props} />;
  if (kind === 'bench-wiring') return <BenchWiringBoard {...props} />;
  if (kind === 'serving-tray') return <ServingTrayBoard {...props} />;
  if (kind === 'shadow-play') return <ShadowPlayBoard {...props} />;
  if (kind === 'clockwork-machine') return <ClockworkMachineBoard {...props} />;
  if (kind === 'route-map' || kind === 'control-console') return <StationStoryBoard {...props} />;
  if (kind === 'table-scene') return <TableSceneBoard {...props} />;
  return props.view.stage.interaction ? <InteractiveStoryBoard {...props} /> : <ArrangementBoard {...props} />;
}
function ArrangementBoard({ state, view, onEdit, disabled = false }: { state: StoryState; view: StoryPlayerView; onEdit(slot: number, value: string): void; disabled?: boolean }) {
  const { stage, room, ownedSlots } = view;
  const [activeSlot, setActiveSlot] = useState<number | undefined>(() => ownedSlots.find(index => !state.draft[index]) ?? ownedSlots[0]);
  const [dragging, setDragging] = useState(false);
  const [picker, setPicker] = useState(false);
  const refs = useRef(new Map<number, View>());
  const boxes = useRef<DropBox[]>([]);
  const full = state.draft.filter(Boolean).length;
  const order = stage.layout !== 'grid';
  const isTable = stage.kind === 'table';
  const isMap = stage.kind === 'map';
  useEffect(() => { setActiveSlot(ownedSlots.find(index => !state.draft[index]) ?? ownedSlots[0]); }, [view.playerId, stage.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const prepareDrop = useCallback(() => {
    boxes.current = [];
    refs.current.forEach((ref, index) => ref.measureInWindow((x, y, width, height) => {
      if (width && height) boxes.current.push({ index, x, y, width, height });
    }));
    setDragging(true);
  }, []);
  const drop = useCallback((option: string, x: number, y: number) => {
    setDragging(false);
    const target = boxes.current.find(b => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height);
    if (target && ownedSlots.includes(target.index) && !disabled) { onEdit(target.index, option); setActiveSlot(target.index); }
  }, [disabled, onEdit, ownedSlots]);
  const choose = (option: string) => {
    if (activeSlot === undefined || disabled) return;
    onEdit(activeSlot, option);
    setPicker(false);
    const next = ownedSlots.find(index => index !== activeSlot && !state.draft[index]);
    if (next !== undefined) setActiveSlot(next);
  };
  return <View style={{ gap: 18 }}>
    <View style={ui.spread}><StoryText size={12} strong color={room.accent} style={ui.kicker}>EVERYONE’S BOARD</StoryText><StoryText size={13}>{full}/{stage.slots.length} placed</StoryText></View>
    <StoryText size={14} color="#BAC8CF">{stage.instruction}</StoryText>
    <View style={[board.surface, { backgroundColor: isTable ? '#453F34' : isMap ? '#1D3C48' : '#20313D', borderColor: room.accent + '66' }, dragging && { borderColor: room.accent }]}>
      {isTable ? <View style={[ui.row, { paddingBottom: 14 }]}><Ionicons name="restaurant-outline" size={20} color="#CDBE9D" /><StoryText size={11} color="#CDBE9D">ONE BENCH · READ FROM FIRST TO LAST</StoryText></View> : null}
      {!order ? <View style={{ gap: 6, paddingBottom: 14 }}><StoryText size={12} color={room.accent} strong>TOP = NORTH · LEFT = WEST</StoryText><StoryText size={11} color="#BDCCD2">Rooms share a wall only horizontally or vertically. Diagonals do not touch.</StoryText></View> : null}
      <View style={[board.slots, order && { gap: 12 }]}>
        {stage.slots.map((slot, index) => {
          const owned = ownedSlots.includes(index);
          const option = stage.options.find(option => option.id === state.draft[index]);
          const owner: StoryPlayer = state.players[slot.seat % state.players.length];
          const selected = owned && activeSlot === index;
          return <View key={slot.id} ref={ref => { if (ref) refs.current.set(index, ref); else refs.current.delete(index); }} collapsable={false} style={[board.slotContainer, order && { width: '100%' }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${slot.label}: ${option?.label ?? 'empty'}. ${owned ? 'Your control' : `${owner.name}'s control`}`} accessibilityState={{ disabled: !owned || disabled, selected }}
              disabled={!owned || disabled} onPress={() => { setActiveSlot(index); setPicker(true); }} style={({ pressed }) => [board.slot, { borderColor: selected ? room.accent : owned ? '#607B88' : '#435761', backgroundColor: selected ? '#344B55' : '#182B35', opacity: pressed ? .7 : 1 }, order && { minHeight: 82 }, isMap && { borderRadius: 2 }, isTable && { borderRadius: 14 }]}>
              <View style={ui.spread}>
                <StoryText size={11} strong color={selected ? room.accent : '#A5BAC5'}>{order ? `${index + 1} · ` : ''}{slot.label}</StoryText>
                <Ionicons name={owned ? 'ellipse' : 'lock-closed-outline'} size={owned ? 6 : 12} color={owned ? room.accent : '#A5BAC5'} />
              </View>
              <StoryText size={order ? 18 : 16} strong style={{ minHeight: 27 }}>{option?.label ?? (owned ? 'Place a piece' : 'Waiting for teammate')}</StoryText>
              <StoryText size={10} color="#99B0BC">{owned ? selected ? 'YOUR SELECTED SPACE' : 'YOU CONTROL THIS' : owner.name}</StoryText>
            </Pressable>
            {order && index < stage.slots.length - 1 ? <View pointerEvents="none" style={board.connector}><Ionicons name="arrow-down" size={13} color={room.accent} /></View> : null}
          </View>;
        })}
      </View>
      {!order ? <View style={{ marginTop: 14, borderBottomWidth: 4, borderColor: '#F5D080', paddingBottom: 7 }}><StoryText size={10} color="#F5D080" strong style={{ textAlign: 'center' }}>SUNNY WINDOW WALL · MURAL + COURTYARD</StoryText></View> : null}
    </View>
    <View style={ui.spread}>
      <StoryText size={13} strong color={room.accent}>{activeSlot !== undefined ? `Choose for: ${stage.slots[activeSlot].label}` : 'Your teammate has this control'}</StoryText>
      {activeSlot !== undefined && state.draft[activeSlot] ? <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${stage.slots[activeSlot].label}`} onPress={() => onEdit(activeSlot, '')} disabled={disabled} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}><StoryText size={12}>Clear</StoryText></Pressable> : null}
    </View>
    <View style={board.palette}>
      {stage.options.map(option => <StoryPiece key={option.id} option={option} accent={room.accent} used={state.draft.includes(option.id)} disabled={disabled || activeSlot === undefined} onChoose={() => choose(option.id)} onDragStart={prepareDrop} onDrop={(x, y) => drop(option.id, x, y)} />)}
    </View>
    <StoryText size={12} color="#A2B5BF">Tap your space to choose a piece without scrolling—or drag a piece into it. Use each piece once. Changing the board is free.</StoryText>
    <Modal visible={picker} transparent animationType="fade" onRequestClose={() => setPicker(false)}>
      <View style={ui.sheetBackdrop}><View style={ui.sheet}>
        <View style={ui.spread}><StoryText strong size={23} style={{ flex: 1 }}>{activeSlot === undefined ? 'Choose a piece' : stage.slots[activeSlot].label}</StoryText><StoryIconButton label="Close piece picker" icon="close" onPress={() => setPicker(false)} /></View>
        <StoryText size={13}>This is your space. Compare the clues, then choose what belongs here.</StoryText>
        <ScrollView contentContainerStyle={{ gap: 10 }}>
          {stage.options.map(option => <StoryButton key={option.id} label={`Choose ${option.label}`} accent={room.accent} secondary disabled={disabled} onPress={() => choose(option.id)} />)}
        </ScrollView>
        {activeSlot !== undefined && state.draft[activeSlot] ? <StoryButton label="Empty this space" secondary onPress={() => { onEdit(activeSlot, ''); setPicker(false); }} /> : null}
      </View></View>
    </Modal>
  </View>;
}

function StoryPiece({ option, accent, used, disabled, onChoose, onDragStart, onDrop }: { option: StoryOption; accent: string; used: boolean; disabled: boolean; onChoose(): void; onDragStart(): void; onDrop(x: number, y: number): void }) {
  const translate = useRef(new Animated.ValueXY()).current;
  const [lifted, setLifted] = useState(false);
  const current = useRef({ disabled, onDragStart, onDrop });
  current.current = { disabled, onDragStart, onDrop };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => !current.current.disabled && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 12,
    onPanResponderGrant: () => { setLifted(true); current.current.onDragStart(); },
    onPanResponderMove: Animated.event([null, { dx: translate.x, dy: translate.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_event, gesture) => { current.current.onDrop(gesture.moveX, gesture.moveY); translate.setValue({ x: 0, y: 0 }); setLifted(false); },
    onPanResponderTerminate: () => { current.current.onDrop(-1, -1); translate.setValue({ x: 0, y: 0 }); setLifted(false); },
  }), [translate]);
  return <Animated.View {...pan.panHandlers} style={{ width: '48%', transform: translate.getTranslateTransform(), zIndex: lifted ? 100 : 1, elevation: lifted ? 10 : 0 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Place ${option.label}`} accessibilityState={{ disabled }} onPress={onChoose} disabled={disabled} style={({ pressed }) => [board.piece, { backgroundColor: lifted || pressed ? accent : '#E7E2D4', opacity: disabled ? .5 : 1, borderColor: used ? accent : 'transparent' }]}>
      <View style={ui.spread}><StoryText strong color={STORY_INK} style={{ flex: 1 }}>{option.label}</StoryText><Ionicons name={used ? 'checkmark-circle' : 'reorder-two'} size={17} color={STORY_INK} /></View>
      {option.detail ? <StoryText size={11} color="#4C5B61">{option.detail}</StoryText> : null}
    </Pressable>
  </Animated.View>;
}
const board = StyleSheet.create({
  surface: { padding: 14, borderRadius: 18, borderWidth: 1, position: 'relative' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  slotContainer: { width: '48%', position: 'relative' },
  slot: { minHeight: 110, padding: 12, borderWidth: 1.5, borderRadius: 10, justifyContent: 'space-between', gap: 7 },
  connector: { alignItems: 'center', position: 'absolute', bottom: -13, width: '100%' },
  palette: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, overflow: 'visible' },
  piece: { minHeight: 74, borderRadius: 9, borderWidth: 2, padding: 12, gap: 5, justifyContent: 'center' },
});

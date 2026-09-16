import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import type { ActivityMove } from './activities/contracts';
import { TOOL_SEARCH_EVENTS, type ToolSearchState } from './activities/tool-search';
import { StoryButton, StoryText, ui } from './story-ui';
import type { StoryPlayerView, StoryState } from './types';

const PAPER = '#EEE2C6'; const INK = '#293B44'; const WOOD = '#775044'; const GOLD = '#EAC381';
const NAMES = ['Cupboard', 'Writing desk', 'Grate', 'Viewer'];
export interface ToolSearchBoardProps { state: StoryState; view: StoryPlayerView; onAct(move: ActivityMove): void; disabled?: boolean }

export function ToolSearchBoard({ state, view, onAct, disabled }: ToolSearchBoardProps) {
  const [chosen, setChosen] = useState(view.ownedSlots[0]);
  const [selected, setSelected] = useState<number[]>([]);
  if (state.activity?.kind !== 'tool-search') return null;
  const model = state.activity;
  const control = view.ownedSlots.includes(chosen) ? chosen : view.ownedSlots[0];
  const act = (command: string, value?: number) => { if (!disabled && control !== undefined) onAct({ control, command, ...(value === undefined ? {} : { value }) }); };
  const items = [
    { value: 1, name: 'Cord', icon: 'git-commit-outline', found: model.cord },
    { value: 2, name: 'Magnet', icon: 'magnet-outline', found: model.magnet },
    { value: 4, name: 'Cloth', icon: 'square-outline', found: model.cloth },
    { value: 3, name: 'Key', icon: 'key-outline', found: model.key },
  ].filter(item => item.found);
  const selectedValues = selected.filter(value => items.some(item => item.value === value));
  const canSelect = control === 2 || control === 3;
  function selectItem(value: number) {
    setSelected(old => control === 3 ? old[0] === value ? [] : [value] : old.includes(value) ? old.filter(item => item !== value) : [...old.slice(-1), value]);
  }
  return <View style={{ gap: 13 }}>
    <View style={styles.tabs}>{view.ownedSlots.map(slot => <Pressable key={slot} accessibilityRole="tab" accessibilityLabel={`Explore your ${NAMES[slot]}`} accessibilityState={{ selected: slot === control }} onPress={() => { setChosen(slot); setSelected([]); }} style={[styles.tab, control === slot && styles.tabActive]}><StoryText strong size={13} color={control === slot ? INK : PAPER}>{NAMES[slot]}</StoryText></Pressable>)}</View>
    <View style={styles.scene}>
      <View style={ui.spread}><StoryText strong color={INK} size={12}>{NAMES[control]?.toUpperCase()}</StoryText><StoryText color="#62766D" size={11}>YOUR CORNER</StoryText></View>
      <ToolScene model={model} control={control} />
      {control === 0 ? <View style={styles.searches}>{['Top drawer', 'Middle drawer', 'Bottom drawer'].map((name, index) => <SearchButton key={name} label={name} inspected={model.drawers.includes(index)} disabled={disabled} onPress={() => act('open-drawer', index)} />)}</View> : null}
      {control === 1 ? <View style={styles.searches}>{['Open the book', 'Lift the desk mat', 'Look in the bowl'].map((name, index) => <SearchButton key={name} label={name} inspected={model.deskPlaces.includes(index)} disabled={disabled} onPress={() => act('inspect-desk', index)} />)}</View> : null}
      <StoryText size={13} color={INK}>{control === 0 ? 'Open the drawers. Anything useful goes into the shared bag.' : control === 1 ? 'Look around the desk. Tell your family what you discover.' : control === 2 ? model.key ? 'The key is safely in your shared bag.' : 'The iron key is below the bars. Fingers cannot reach it.' : model.clean ? 'The viewer is clear and ready.' : model.unlocked ? 'The cover is open. Dust hides the picture inside.' : 'A little lock keeps the viewer closed.'}</StoryText>
    </View>
    <View style={styles.bag}>
      <View style={ui.spread}><StoryText strong size={11} color={GOLD} style={ui.kicker}>Shared bag</StoryText><StoryText size={11} color="#CBCCBE">Everyone’s finds</StoryText></View>
      {items.length ? <View style={styles.inventory}>{items.map(item => <Pressable key={item.value} accessibilityRole="button" accessibilityLabel={`Select ${item.name}`} accessibilityState={{ selected: selectedValues.includes(item.value), disabled: disabled || !canSelect }} disabled={disabled || !canSelect} onPress={() => selectItem(item.value)} style={[styles.item, selectedValues.includes(item.value) && styles.itemActive]}><Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={23} color={selectedValues.includes(item.value) ? INK : PAPER} /><StoryText size={12} color={selectedValues.includes(item.value) ? INK : PAPER}>{item.name}</StoryText></Pressable>)}</View> : <StoryText size={13} color="#D0CEC2">Empty for now. Search your corner.</StoryText>}
      {model.retrievalLine ? <View style={ui.row}><Ionicons name="link-outline" size={21} color={GOLD} /><StoryText size={12} color={GOLD}>Magnet tied to a cord</StoryText></View> : null}
      {control === 2 && !model.key ? <>
        {!model.retrievalLine ? <><StoryText size={12} color="#D0CEC2">Choose two finds to make a reaching tool.</StoryText><StoryButton label="Combine selected finds" secondary disabled={disabled || selectedValues.length !== 2 || selectedValues.includes(3)} onPress={() => { act('combine', selectedValues.reduce((bits, value) => bits | value, 0)); setSelected([]); }} /></> : null}
        <StoryButton label={model.retrievalLine ? 'Lower the magnet through the grate' : 'Try reaching the key'} accent={GOLD} onPress={() => act('lower-tool')} disabled={disabled} icon="arrow-down-outline" />
      </> : null}
      {control === 3 && !model.clean ? <><StoryText size={12} color="#D0CEC2">Choose a find, then use it on the viewer.</StoryText><StoryButton label="Use selected find on viewer" accent={GOLD} disabled={disabled || selectedValues.length !== 1} onPress={() => { act('use-item', selectedValues[0]); setSelected([]); }} /></> : null}
    </View>
    <View accessibilityLiveRegion="polite" style={styles.feedback}><StoryText size={13} color={PAPER}>{TOOL_SEARCH_EVENTS[model.event]}</StoryText></View>
    <StoryText size={11} color="#BBCCBF">{view.stage.slots.flatMap((slot, index) => view.ownedSlots.includes(index) ? [] : [`${state.players[slot.seat % state.players.length].name}: ${NAMES[index]}`]).join(' · ')}</StoryText>
  </View>;
}

function SearchButton({ label, inspected, disabled, onPress }: { label: string; inspected: boolean; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}${inspected ? ', already searched' : ''}`} disabled={disabled || inspected} onPress={onPress} style={[styles.search, inspected && { backgroundColor: '#D3D5B7' }]}><Ionicons name={inspected ? 'checkmark' : 'hand-left-outline'} size={16} color={INK} /><StoryText size={12} strong color={INK} style={{ flex: 1 }}>{label}</StoryText></Pressable>;
}

function ToolScene({ model, control }: { model: ToolSearchState; control: number }) {
  return <Svg width="100%" height={210} viewBox="0 0 320 210" accessibilityLabel={`${NAMES[control]} illustrated search area`}>
    <Path d="M0 165H320V210H0Z" fill="#DAC6A3" /><Path d="M0 180L320 190M0 201L320 210" stroke="#C4B18F" strokeWidth={2} />
    {control === 0 ? <G>
      <Rect x={66} y={10} width={188} height={164} rx={5} fill="#4E3934" />
      {[0, 1, 2].map((drawer, index) => <G key={drawer} transform={`translate(${model.drawers.includes(drawer) ? 9 : 0} ${index * 50})`}><Rect x={76} y={18} width={168} height={43} rx={3} fill={model.drawers.includes(drawer) ? '#342B28' : WOOD} stroke="#B19567" strokeWidth={2} /><Circle cx={160} cy={40} r={5} fill={GOLD} />{model.drawers.includes(drawer) ? <Path d="M79 56H241" stroke="#9C7455" strokeWidth={7} /> : null}</G>)}
      <Rect x={78} y={174} width={12} height={19} fill={WOOD} /><Rect x={230} y={174} width={12} height={19} fill={WOOD} />
    </G> : control === 1 ? <G>
      <Path d="M28 75H288L307 160H12Z" fill={WOOD} stroke="#4A3730" strokeWidth={3} />
      <Rect x={40} y={160} width={14} height={41} fill="#4A3730" /><Rect x={266} y={160} width={14} height={41} fill="#4A3730" />
      <Path d={model.deskPlaces.includes(0) ? 'M40 82Q60 72 86 82L88 123Q65 112 44 123ZM86 82Q113 72 129 82L132 123Q110 112 88 123Z' : 'M48 82L99 78L104 126L51 131Z'} fill="#EAD9B4" stroke="#404C4C" strokeWidth={2} />
      <Rect x={135} y={89} width={80} height={48} rx={3} fill="#466E60" transform={model.deskPlaces.includes(1) ? 'rotate(-22 135 89)' : ''} />
      <Ellipse cx={259} cy={106} rx={29} ry={11} fill="#C48F65" /><Path d="M230 107Q236 143 259 143Q282 143 288 107" fill="#B67E59" />
    </G> : control === 2 ? <G>
      <Rect x={38} y={35} width={244} height={145} rx={6} fill="#273E44" stroke="#B6A58B" strokeWidth={10} />
      {!model.key ? <G transform="translate(164 140) rotate(28)"><Circle r={9} fill="none" stroke={GOLD} strokeWidth={5} /><Path d="M7 0H38M30 0V8M37 0V7" stroke={GOLD} strokeWidth={5} /></G> : null}
      {[65, 105, 145, 185, 225, 265].map(x => <Line key={x} x1={x} y1={39} x2={x} y2={175} stroke="#75847E" strokeWidth={9} />)}
      {model.retrievalLine ? <G><Path d={`M181 0Q153 30 161 ${model.key ? 26 : 101}`} fill="none" stroke="#D9AA73" strokeWidth={3} /><Path d={`M151 ${model.key ? 24 : 99}V${model.key ? 43 : 118}Q161 ${model.key ? 55 : 130} 171 ${model.key ? 43 : 118}V${model.key ? 24 : 99}`} fill="none" stroke="#CF7567" strokeWidth={7} /></G> : null}
    </G> : <G>
      <Path d="M76 177V63Q76 5 160 5Q244 5 244 63V177Z" fill="#6B5240" stroke="#BFA46D" strokeWidth={4} />
      <Path d="M96 158V67Q96 28 160 28Q224 28 224 67V158Z" fill={model.unlocked ? '#BBD8CF' : '#263F4D'} />
      {model.unlocked ? <><Circle cx={160} cy={94} r={43} fill={model.clean ? '#DAEFDD' : '#ABB5A4'} /><Path d="M127 119V86L160 63L192 86V119Z" stroke={model.clean ? '#4F7971' : '#879285'} fill="none" strokeWidth={4} />{!model.clean ? [110, 136, 162, 188, 208].map((x, i) => <Circle key={x} cx={x} cy={60 + (i % 3) * 30} r={12} fill="#D1C8AD" opacity={.7} />) : null}</> : <><Line x1={160} y1={25} x2={160} y2={167} stroke="#95774C" strokeWidth={3} /><Rect x={152} y={120} width={17} height={25} rx={4} fill={GOLD} /><Circle cx={160} cy={129} r={3} fill={INK} /></>}
      <Rect x={65} y={177} width={190} height={13} rx={2} fill="#493E34" />
    </G>}
  </Svg>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8 }, tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 8, borderWidth: 1, borderColor: '#7F9B8E', borderRadius: 8 }, tabActive: { backgroundColor: PAPER },
  scene: { backgroundColor: PAPER, padding: 13, borderRadius: 16, borderWidth: 2, borderColor: '#B9AC8B', gap: 10 },
  searches: { gap: 7 }, search: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#D9CEAD', borderRadius: 7, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bag: { backgroundColor: '#243E3E', borderRadius: 13, padding: 13, gap: 12 }, inventory: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, item: { minWidth: 58, minHeight: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#6F8A7D', padding: 7, gap: 3, borderRadius: 8 }, itemActive: { backgroundColor: GOLD },
  feedback: { borderLeftWidth: 3, borderColor: '#82B39A', paddingLeft: 12, paddingVertical: 2 },
});

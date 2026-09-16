import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import type { ActivityMove } from './activities/contracts';
import { TIME_HOUSE_EVENTS, timeHouseLightVisible, type TimeHouseState } from './activities/time-house';
import { StoryButton, StoryText, ui } from './story-ui';
import type { StoryPlayerView, StoryState } from './types';

const PAPER = '#EFE1C0'; const INK = '#263C46'; const GOLD = '#EACA86';
const NAMES = ['Old shutter', 'Wall today', 'Young plant', 'Door today'];
export function TimeHouseBoard({ state, view, onAct, disabled }: { state: StoryState; view: StoryPlayerView; onAct(move: ActivityMove): void; disabled?: boolean }) {
  const [chosen, setChosen] = useState(view.ownedSlots[0]);
  if (state.activity?.kind !== 'time-house') return null;
  const model = state.activity;
  const control = view.ownedSlots.includes(chosen) ? chosen : view.ownedSlots[0];
  const past = control === 0 || control === 2;
  const act = (command: string, value?: number) => { if (!disabled && control !== undefined) onAct({ control, command, ...(value === undefined ? {} : { value }) }); };
  return <View style={{ gap: 13 }}>
    <View style={styles.tabs}>{view.ownedSlots.map(slot => <Pressable key={slot} accessibilityRole="tab" accessibilityLabel={`Control ${NAMES[slot]}`} accessibilityState={{ selected: slot === control }} onPress={() => setChosen(slot)} style={[styles.tab, slot === control && { backgroundColor: PAPER }]}><StoryText strong size={13} color={slot === control ? INK : PAPER}>{NAMES[slot]}</StoryText></Pressable>)}</View>
    <View style={[styles.courtyard, { backgroundColor: past ? '#EFE0C3' : '#C5CEBD' }]}>
      <View style={ui.spread}><View><StoryText size={11} strong color="#56695C">THE SAME COURTYARD</StoryText><StoryText display size={28} color={INK}>{past ? 'Years ago' : 'Today'}</StoryText></View><View style={styles.yearMark}><StoryText strong size={11} color={INK}>{past ? 'THEN' : 'NOW'}</StoryText></View></View>
      <CourtyardScene model={model} past={past} />
      <StoryText size={13} color={INK}>{past ? 'Change the old house. Ask your family what happens in the house today.' : 'Things here change when your family alters the old courtyard.'}</StoryText>
    </View>
    {control === 0 ? <View style={styles.control}>
      <StoryText size={15} strong color={PAPER}>Swing the wooden shutter</StoryText>
      <View style={styles.choices}>{['Closed', 'Half open', 'Wide open'].map((label, index) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={`Set shutter ${label.toLowerCase()}`} accessibilityState={{ selected: model.shutter === index, disabled }} disabled={disabled} onPress={() => act('set-shutter', index)} style={[styles.choice, model.shutter === index && styles.selected]}><StoryText size={12} strong color={model.shutter === index ? INK : PAPER} style={{ textAlign: 'center' }}>{label}</StoryText></Pressable>)}</View>
      <StoryText size={12} color="#BECDC0">Watch the shadow. Where does the light land on the other phones?</StoryText>
    </View> : null}
    {control === 2 ? <View style={styles.control}>
      <StoryText size={15} strong color={PAPER}>Move the young plant</StoryText>
      <View style={styles.choices}>{['By the door', 'Under window', 'Courtyard edge'].map((label, index) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={`Move plant ${label.toLowerCase()}`} accessibilityState={{ selected: model.planter === index, disabled }} disabled={disabled} onPress={() => act('move-planter', index)} style={[styles.choice, model.planter === index && styles.selected]}><StoryText size={12} strong color={model.planter === index ? INK : PAPER} style={{ textAlign: 'center' }}>{label}</StoryText></Pressable>)}</View>
      <StoryText size={12} color="#BECDC0">It is small now. Ask where its roots grow years later.</StoryText>
    </View> : null}
    {control === 1 ? <View style={styles.control}>
      <StoryText size={15} strong color={PAPER}>{model.pinFound ? 'A pin for the door keeper' : timeHouseLightVisible(model) ? 'Something glints in the wall' : 'A dark corner of the courtyard'}</StoryText>
      <StoryText size={13} color="#BECDC0">{model.pinFound ? 'Your find is already shared with the person at the door.' : timeHouseLightVisible(model) ? 'Daylight catches a tiny brass edge between two stones.' : model.planter === 1 ? 'A thick plant shades the wall, even with the shutter open.' : 'You need enough daylight to look into the cracks.'}</StoryText>
      <StoryButton label={model.pinFound ? 'Brass pin found' : 'Search the wall'} onPress={() => act('search-wall')} disabled={disabled || model.pinFound} accent={GOLD} icon={model.pinFound ? 'checkmark' : 'search-outline'} />
    </View> : null}
    {control === 3 ? <View style={styles.control}>
      <StoryText size={15} strong color={PAPER}>The rooftop passage</StoryText>
      <StoryText size={13} color="#BECDC0">{model.doorOpen ? 'The garden is waiting on the other side.' : model.catchReleased ? model.planter === 0 ? 'The catch is loose. Thick roots still hold the door shut.' : 'The catch is loose and the doorway is clear.' : model.pinFound ? 'A teammate found a brass pin. It fits the narrow catch.' : 'A small catch holds the door. A thin pin would reach it.'}</StoryText>
      {!model.catchReleased ? <StoryButton label="Release the door catch" onPress={() => act('release-catch')} disabled={disabled} accent={GOLD} icon="key-outline" /> : null}
      <StoryButton label={model.doorOpen ? 'Passage open' : 'Try the wooden door'} onPress={() => act('open-door')} disabled={disabled || model.doorOpen} secondary={!model.catchReleased} accent={GOLD} icon="log-out-outline" />
    </View> : null}
    <View accessibilityLiveRegion="polite" style={styles.feedback}><StoryText size={13} color={PAPER}>{TIME_HOUSE_EVENTS[model.event]}</StoryText></View>
    <StoryText size={11} color="#BECDC0">{view.stage.slots.flatMap((slot, index) => view.ownedSlots.includes(index) ? [] : [`${state.players[slot.seat % state.players.length].name}: ${NAMES[index]}`]).join(' · ')}</StoryText>
  </View>;
}

function CourtyardScene({ model, past }: { model: TimeHouseState; past: boolean }) {
  const plantX = [252, 57, 156][model.planter];
  const wall = past ? '#E5D2AE' : '#B6BEAA';
  return <Svg width="100%" height={255} viewBox="0 0 320 255" accessibilityLabel={`${past ? 'Old' : 'Present'} courtyard. ${!past && timeHouseLightVisible(model) ? 'Sunlight reaches the wall.' : ''} ${!past && model.planter === 0 ? 'Roots block the doorway.' : ''}`}>
    <Rect x={0} y={0} width={320} height={255} fill={past ? '#D5E5DE' : '#ABC7C4'} />
    <Circle cx={263} cy={35} r={22} fill="#F7DD99" />
    <Path d="M0 86H320V217H0Z" fill={wall} /><Path d="M0 217H320V255H0Z" fill={past ? '#D7BC8F' : '#A7AD91'} />
    <Path d="M106 86V16H173V86M99 19H181" stroke="#CEBC95" strokeWidth={9} fill={wall} />
    <Path d="M123 29V65M151 29V65M109 44H170" stroke="#927F65" strokeWidth={5} /><Path d="M138 29V65M109 68H170" stroke="#5F736D" strokeWidth={3} />
    <Path d="M215 217V137Q215 104 253 104Q291 104 291 137V217Z" fill={model.doorOpen && !past ? '#E9DDA9' : '#5C4437'} stroke="#917555" strokeWidth={5} />
    {!model.doorOpen || past ? <><Line x1={253} y1={112} x2={253} y2={216} stroke="#977856" strokeWidth={2} /><Rect x={242} y={161} width={22} height={7} rx={2} fill={model.catchReleased && !past ? '#ADA77A' : '#D4B365'} transform={model.catchReleased && !past ? 'rotate(-35 242 161)' : ''} /></> : <Path d="M226 210L277 127M250 217L287 157" stroke="#FFF4CB" strokeWidth={3} />}
    <Rect x={24} y={107} width={77} height={73} fill="#314E53" stroke="#A88C64" strokeWidth={4} />
    <Path d="M61 108V178M25 139H99M25 155H99" stroke="#8A7254" strokeWidth={4} />
    <Path d={model.shutter === 0 ? 'M25 110H99V177H25Z' : model.shutter === 1 ? 'M24 109L61 119V173L24 178Z' : 'M24 109L10 100V177L24 178Z'} fill="#805B42" stroke="#C1A277" strokeWidth={2} />
    {model.shutter > 0 ? <Path d={model.shutter === 1 ? 'M99 123L165 217H83L61 141Z' : 'M99 122L224 188L214 215L61 141Z'} fill="#FFE8A0" opacity={past ? .5 : model.planter === 1 ? .15 : .6} /> : null}
    {!past && timeHouseLightVisible(model) && !model.pinFound ? <><Line x1={192} y1={173} x2={202} y2={161} stroke="#E9AD3D" strokeWidth={5} /><Circle cx={196} cy={167} r={12} stroke="#FFF5BB" fill="none" strokeWidth={2} /></> : null}
    {!past ? <G stroke="#5A7658" fill="none" strokeWidth={8} strokeLinecap="round"><Path d={model.planter === 0 ? 'M252 236Q224 209 227 177Q231 132 273 124M227 188Q275 206 288 165' : model.planter === 1 ? 'M58 237Q80 195 41 127Q52 99 93 106M56 169Q97 162 87 130' : 'M156 237Q160 202 136 183Q131 159 112 149M151 211Q180 185 187 168'} /></G> : null}
    <G transform={`translate(${plantX} ${past ? 200 : 223})`}>
      <Path d="M-14 0H14L10 21H-10Z" fill="#B57651" stroke="#8C6245" strokeWidth={2} />
      {past ? <><Path d="M0 0V-32M0-16Q-20-31-22-18Q-12-11 0-12M0-25Q19-42 20-27Q15-18 0-22" fill="#5C8860" stroke="#54754F" strokeWidth={2} /></> : null}
    </G>
    <Path d="M0 242L210 231M272 235L320 231" stroke={past ? '#C2A378' : '#8D997D'} strokeWidth={2} />
  </Svg>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8 }, tab: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#78978A', borderRadius: 8, padding: 7 },
  courtyard: { borderRadius: 16, padding: 13, gap: 8, borderWidth: 2, borderColor: '#C0B393' }, yearMark: { borderWidth: 1, borderColor: '#859480', borderRadius: 30, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  control: { backgroundColor: '#223D3E', borderRadius: 13, padding: 14, gap: 12 }, choices: { flexDirection: 'row', gap: 7 }, choice: { flex: 1, minHeight: 56, padding: 7, borderWidth: 1, borderColor: '#789486', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, selected: { backgroundColor: GOLD },
  feedback: { borderLeftWidth: 3, borderColor: '#8DAE86', paddingLeft: 12, paddingVertical: 2 },
});

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { decorativeAccessibilityProps } from '@/src/utils/accessibility';
import type { InteractiveBoardProps } from './InteractiveStoryBoard';
import { StoryText, ui } from './story-ui';
import { TABLE_CHARACTERS, type TableCharacterId } from './rooms/table-characters';

const INK = '#553A29';
const PAPER = '#FFF4DA';
const HONEY = '#EFC468';
const RUST = '#A9492F';
const GUESTS = ['noor', 'sami', 'leila', 'mina'];
const SHIRTS: Record<string, string> = Object.fromEntries(Object.entries(TABLE_CHARACTERS).map(([id, character]) => [id, character.shirt]));
const LANDMARKS = ['Door', 'Flowers', 'Window', 'Kitchen'];
const LANDMARK_ICONS = ['enter-outline', 'flower-outline', 'sunny-outline', 'restaurant-outline'] as const;
const OBJECT_SPOTS = [
  { left: '9%', top: 16 }, { left: '62%', top: 18 },
  { left: '7%', top: 155 }, { left: '63%', top: 155 }, { left: '36%', top: 275 },
] as const;

/** A dinner-table scene, not the industrial panel used by the other rooms. */
export function TableSceneBoard({ state, view, onEdit, disabled = false }: InteractiveBoardProps) {
  const { stage, ownedSlots } = view;
  const [active, setActive] = useState<number | undefined>(ownedSlots[0]);
  useEffect(() => { setActive(ownedSlots[0]); }, [stage.id, view.playerId, ownedSlots.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  if (stage.interaction?.kind !== 'table-scene') return null;
  const mode = stage.interaction.mode;
  const chosen = active === undefined ? undefined : stage.options.find(option => option.id === state.draft[active]);
  const choose = (value: string) => {
    if (disabled || active === undefined || !ownedSlots.includes(active)) return;
    onEdit(active, value);
  };
  const heading = mode === 'seating' ? 'THE TORN PHOTOGRAPH' : mode === 'riddles' ? 'ON THE DINNER TABLE' : 'THE LAST ENVELOPES';
  return <View style={{ gap: 15 }}>
    <View style={ui.spread}><StoryText size={11} strong color={HONEY} style={ui.kicker}>{heading}</StoryText><StoryText size={12} color="#F1DABA">{state.draft.filter(Boolean).length}/4 placed</StoryText></View>
    <StoryText size={14} color="#F1E0C8">{stage.instruction}</StoryText>

    {mode === 'seating' ? <View style={styles.photo}>
      <View style={ui.spread}><StoryText size={11} color={INK} strong>A SEAT FOR EVERYONE</StoryText><Ionicons name="camera-outline" size={19} color={INK} /></View>
      <View style={styles.bench}>
        <View pointerEvents="none" style={styles.benchPlank} />
        {stage.slots.map((slot, index) => {
          const owned = ownedSlots.includes(index);
          const selected = active === index;
          const guest = stage.options.find(option => option.id === state.draft[index]);
          return <Pressable key={slot.id} accessibilityRole="button" accessibilityLabel={`Choose seat ${slot.label}. ${guest?.label ?? 'Empty'}. ${owned ? 'Your seat' : `Controlled by ${state.players[slot.seat % state.players.length].name}`}`} accessibilityState={{ disabled: disabled || !owned, selected }} disabled={disabled || !owned} onPress={() => setActive(index)} style={({ pressed }) => [styles.seat, selected && styles.selectedSeat, pressed && { opacity: .75 }]}>
            <Ionicons name={LANDMARK_ICONS[index]} size={20} color={INK} />
            <StoryText size={10} strong color={INK} style={{ textAlign: 'center' }}>{LANDMARKS[index]}</StoryText>
            <Portrait id={guest?.id} size={57} />
            <StoryText size={12} strong color={INK} style={{ textAlign: 'center' }}>{guest?.label ?? 'Empty'}</StoryText>
            <StoryText size={9} strong color={owned ? RUST : '#77634F'} style={{ textAlign: 'center' }}>{owned ? 'YOU' : state.players[slot.seat % state.players.length].name}</StoryText>
          </Pressable>;
        })}
      </View>
      <View style={styles.benchDirection}><StoryText size={10} color={INK}>Door end</StoryText><View style={{ flex: 1, height: 1, backgroundColor: '#BA946C' }} /><Ionicons name="arrow-forward" size={15} color={INK} /><StoryText size={10} color={INK}>Kitchen end</StoryText></View>
    </View> : <View style={styles.placeSettings}>
      {stage.slots.map((slot, index) => {
        const owned = ownedSlots.includes(index);
        const selected = active === index;
        const option = stage.options.find(item => item.id === state.draft[index]);
        return <Pressable key={slot.id} accessibilityRole="button" accessibilityLabel={`Choose ${mode === 'riddles' ? 'note' : 'guest'} ${slot.label}. ${option?.label ?? 'No choice yet'}. ${owned ? 'Your control' : `Controlled by ${state.players[slot.seat % state.players.length].name}`}`} accessibilityState={{ disabled: disabled || !owned, selected }} disabled={disabled || !owned} onPress={() => setActive(index)} style={({ pressed }) => [styles.setting, selected && styles.selectedSetting, !owned && { backgroundColor: '#E8D8BB' }, pressed && { opacity: .78 }]}>
          {mode === 'envelopes' ? <Portrait id={GUESTS[index]} size={48} /> : <View style={[styles.foldedNote, { backgroundColor: SHIRTS[GUESTS[index]] }]}><View style={styles.paperFold} /><Ionicons name={option ? 'checkmark' : 'help-outline'} size={22} color="#553A29" /></View>}
          <View style={{ flex: 1, gap: 2 }}>
            <StoryText size={12} strong color={INK}>{slot.label}</StoryText>
            <StoryText size={10} color={option ? INK : '#715C46'}>{option?.label ?? (mode === 'riddles' ? 'Choose an object' : 'Choose an envelope')}</StoryText>
            <StoryText size={9} strong color={owned ? RUST : '#77634F'}>{owned ? 'YOU' : state.players[slot.seat % state.players.length].name}</StoryText>
          </View>
        </Pressable>;
      })}
    </View>}

    <View accessibilityLiveRegion="polite" style={styles.selectionLine}>
      <View style={{ flex: 1 }}>
        <StoryText size={12} strong color={HONEY}>{active === undefined ? 'Your family has these places.' : `${mode === 'seating' ? 'Choose a guest for' : mode === 'riddles' ? 'Find the object for' : 'Deliver to'} ${stage.slots[active].label}`}</StoryText>
        {chosen ? <StoryText size={11} color="#E3C9A7">Placed: {chosen.label}</StoryText> : null}
      </View>
      {chosen ? <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${stage.slots[active!].label}`} onPress={() => choose('')} disabled={disabled} style={styles.clear}><StoryText size={12} color="#FFF0D4">Clear</StoryText></Pressable> : null}
    </View>

    {mode === 'seating' ? <View style={styles.guestTray}>
      {stage.options.map(option => {
        const selected = chosen?.id === option.id;
        return <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`Seat ${option.label} at ${active === undefined ? 'your selected seat' : stage.slots[active].label}`} accessibilityState={{ selected, disabled: disabled || active === undefined }} disabled={disabled || active === undefined} onPress={() => choose(option.id)} style={({ pressed }) => [styles.guest, selected && { backgroundColor: HONEY, borderColor: RUST }, pressed && { transform: [{ scale: .96 }] }]}>
          <Portrait id={option.id} size={57} /><StoryText size={13} strong color={INK}>{option.label}</StoryText><StoryText size={10} color="#715B46" style={{ textAlign: 'center' }}>{option.detail}</StoryText>
        </Pressable>;
      })}
    </View> : mode === 'riddles' ? <View style={styles.dinnerScene}>
      <View pointerEvents="none" style={styles.tablecloth}><View style={styles.clothStripe} /><View style={[styles.clothStripe, { left: '68%' }]} /></View>
      <View pointerEvents="none" style={styles.centrePlate}><View style={styles.innerPlate} /></View>
      {stage.options.map((option, index) => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`Place ${option.label} on ${active === undefined ? 'your note' : stage.slots[active].label}`} accessibilityState={{ selected: chosen?.id === option.id, disabled: disabled || active === undefined }} disabled={disabled || active === undefined} onPress={() => choose(option.id)} style={({ pressed }) => [styles.tableObject, OBJECT_SPOTS[index], chosen?.id === option.id && { backgroundColor: '#F7D780', borderColor: RUST }, pressed && { transform: [{ scale: .95 }] }]}>
        <TableObject id={option.id} size={73} /><StoryText size={10} strong color={INK} style={{ textAlign: 'center' }}>{option.label}</StoryText>
      </Pressable>)}
    </View> : <View style={styles.mailTray}>
      {stage.options.map((option, index) => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`Give ${option.label} envelope to ${active === undefined ? 'your guest' : stage.slots[active].label}`} accessibilityState={{ selected: chosen?.id === option.id, disabled: disabled || active === undefined }} disabled={disabled || active === undefined} onPress={() => choose(option.id)} style={({ pressed }) => [styles.envelope, { transform: [{ rotate: `${index % 2 ? 2 : -2}deg` }] }, chosen?.id === option.id && { borderColor: RUST, backgroundColor: '#F5D992' }, pressed && { opacity: .75 }]}>
        <View pointerEvents="none" style={styles.envelopeFlap} /><View style={styles.stamp}><Stamp id={option.id} /></View><StoryText size={11} strong color={INK} style={{ textAlign: 'center' }}>{option.label}</StoryText>
      </Pressable>)}
    </View>}
    <View style={[ui.row, { alignItems: 'flex-start' }]}><Ionicons name="people-outline" size={18} color={HONEY} /><StoryText size={12} color="#E7CFAD" style={{ flex: 1 }}>Someone else has the clue for your place. Read your scraps to each other. You can change your choices before checking.</StoryText></View>
  </View>;
}

function Portrait({ id, size }: { id?: string; size: number }) {
  const character = id && id in TABLE_CHARACTERS ? TABLE_CHARACTERS[id as TableCharacterId] : undefined;
  const shirt = id ? SHIRTS[id] ?? '#C4A788' : '#D4C2A0';
  return <Svg width={size} height={size} viewBox="0 0 80 80" {...decorativeAccessibilityProps}>
    <Circle cx="40" cy="40" r="38" fill="#F6E5C1" />
    {!id ? <><Path d="M14 74 Q16 49 40 49 Q64 49 66 74" fill={shirt} /><Circle cx="40" cy="31" r="17" fill={shirt} /><Path d="M36 25 Q47 23 47 30 Q47 35 40 37 M40 43 L40 44" stroke="#927B5E" strokeWidth="3" fill="none" strokeLinecap="round" /></> : <>
      <Path d="M9 79 Q10 52 40 53 Q70 52 71 79" fill={shirt} />
      {id === 'sami' ? <><Path d="M13 68 H67 M17 60 H62" stroke="#F0CE97" strokeWidth="5" /><Path d="M48 54 L51 79" stroke="#F0CE97" strokeWidth="7" /></> : null}
      {character?.hair === 'long' ? <Path d="M20 27 Q13 52 18 60 L62 60 Q68 47 60 27 Z" fill="#4B3528" /> : null}
      <Rect x="33" y="42" width="14" height="17" rx="6" fill="#BD885F" />
      <Ellipse cx="40" cy="31" rx="19" ry="24" fill={id === 'leila' ? '#B9855E' : '#D6A87D'} />
      <Path d={id === 'mina' ? 'M20 37 Q9 10 32 6 Q64 -1 61 36 L56 23 Q34 25 28 16 L24 38' : character?.hair === 'long' ? 'M20 35 Q11 13 29 6 Q65 -2 62 37 L56 24 L32 16 L23 33' : 'M20 25 Q13 4 38 4  Q65 3 59 28 L52 17 L28 21 Z'} fill={id === 'khalid' ? '#736459' : '#4B3528'} />
      <Circle cx="33" cy="32" r="1.7" fill="#38291E" /><Circle cx="48" cy="32" r="1.7" fill="#38291E" /><Path d="M35 42 Q41 47 47 41" stroke="#7D4C39" strokeWidth="2" fill="none" strokeLinecap="round" />
      {id === 'leila' ? <Rect x="56" y="68" width="10" height="7" rx="2" fill="#28607C" /> : null}
      {id === 'khalid' ? <><Rect x="28" y="60" width="25" height="16" rx="3" fill="#574A42" /><Circle cx="41" cy="68" r="6" fill="#D0C7B4" /></> : null}
    </>}
  </Svg>;
}

function TableObject({ id, size }: { id: string; size: number }) {
  return <Svg width={size} height={size} viewBox="0 0 100 100" {...decorativeAccessibilityProps}>
    <Ellipse cx="50" cy="88" rx="37" ry="6" fill="#A7845F" opacity=".18" />
    {id === 'pot' ? <><Path d="M71 36 Q98 30 91 62 Q86 75 70 69" stroke="#486F75" strokeWidth="8" fill="none" /><Path d="M28 43 L4 30 L14 64 L29 69" fill="#7AA4A1" stroke="#486F75" strokeWidth="3" /><Ellipse cx="51" cy="59" rx="30" ry="26" fill="#7AA4A1" stroke="#486F75" strokeWidth="3" /><Path d="M26 38 Q50 23 75 38 Z" fill="#E5D4AD" stroke="#486F75" strokeWidth="3" /><Circle cx="50" cy="28" r="5" fill="#486F75" /><Path d="M30 66 Q50 78 69 63" stroke="#E8D6AF" strokeWidth="3" fill="none" /></> : null}
    {id === 'basket' ? <><Path d="M21 52 Q15 11 49 11 Q80 11 80 53" stroke="#9B7048" strokeWidth="6" fill="none" /><Path d="M23 51 Q17 23 36 27 Q49 12 61 34 Q77 27 79 53" fill="#DCA354" stroke="#A56F35" strokeWidth="2" /><Path d="M19 46 L9 55 L20 65 L25 86 L76 87 L90 50 Z" fill="#EFE2C6" /><Path d="M15 57 L23 85 L77 85 L86 57 Z" fill="#C5955C" stroke="#956839" strokeWidth="3" /><Path d="M19 65 H82 M22 75 H79 M31 58 L37 85 M47 58 L50 85 M65 58 L64 85" stroke="#9C7040" strokeWidth="2" /></> : null}
    {id === 'lamp' ? <><Path d="M37 17 Q37 4 50 4 Q63 4 63 17" stroke="#73573A" strokeWidth="3" fill="none" /><Rect x="29" y="17" width="42" height="8" rx="3" fill="#9A6741" /><Path d="M29 25 Q12 48 29 79 H71 Q88 48 71 25 Z" fill="#F3BF55" stroke="#A77539" strokeWidth="3" /><Path d="M30 31 H70 M24 43 H76 M24 56 H76 M29 68 H71 M38 26 Q29 50 38 79 M62 26 Q72 50 62 79" stroke="#D4973E" strokeWidth="2" /><Rect x="31" y="79" width="38" height="6" rx="2" fill="#9A6741" /></> : null}
    {id === 'clock' ? <><Circle cx="50" cy="48" r="36" fill="#B6744C" stroke="#865436" strokeWidth="3" /><Circle cx="50" cy="48" r="29" fill="#FFF0C9" /><Path d="M50 26 V49 L65 57 M50 22 V25 M74 48 H77 M50 71 V74 M24 48 H27" stroke="#79533A" strokeWidth="3" strokeLinecap="round" /><Circle cx="50" cy="48" r="3" fill="#79533A" /></> : null}
    {id === 'bowl' ? <><Circle cx="35" cy="47" r="17" fill="#CA6951" /><Circle cx="62" cy="49" r="18" fill="#E3AB44" /><Path d="M39 47 Q42 20 68 20 Q67 35 53 48" fill="#7B9E68" /><Path d="M12 56 Q19 89 49 87 Q83 89 89 56 Z" fill="#80A59A" stroke="#567E73" strokeWidth="3" /><Path d="M17 61 H85" stroke="#B9CFC0" strokeWidth="3" /></> : null}
  </Svg>;
}

function Stamp({ id }: { id: string }) {
  const icons: Record<string, keyof typeof Ionicons.glyphMap> = { kite: 'paper-plane-outline', book: 'map-outline', camera: 'camera-outline', seeds: 'leaf-outline', train: 'train-outline' };
  const icon = icons[id];
  return <Ionicons name={icon ?? 'mail-outline'} size={35} color="#896146" />;
}

const styles = StyleSheet.create({
  photo: { backgroundColor: PAPER, padding: 12, paddingBottom: 16, borderRadius: 4, borderWidth: 1, borderColor: '#BE9D72', gap: 16, transform: [{ rotate: '-.4deg' }] },
  bench: { flexDirection: 'row', gap: 3, position: 'relative' },
  benchPlank: { position: 'absolute', left: 0, right: 0, top: 85, height: 51, backgroundColor: '#C09060', borderBottomWidth: 7, borderColor: '#AB784C', borderRadius: 5 },
  seat: { flex: 1, alignItems: 'center', gap: 5, paddingHorizontal: 1, paddingVertical: 7, borderWidth: 2, borderColor: 'transparent', borderRadius: 10, minHeight: 182 },
  selectedSeat: { borderColor: RUST, backgroundColor: '#F8D99888' },
  benchDirection: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  selectionLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46 },
  clear: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: '#8F6E4F' },
  guestTray: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, justifyContent: 'center' },
  guest: { width: '30%', minHeight: 129, padding: 8, gap: 4, alignItems: 'center', backgroundColor: PAPER, borderRadius: 12, borderWidth: 2, borderColor: '#D7C099' },
  placeSettings: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  setting: { width: '48%', minHeight: 106, backgroundColor: PAPER, borderWidth: 2, borderColor: '#BE9D72', borderRadius: 11, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 7 },
  selectedSetting: { borderColor: RUST, backgroundColor: '#F3D28E' },
  foldedNote: { width: 32, height: 46, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-5deg' }], borderRadius: 3 },
  paperFold: { position: 'absolute', right: 0, top: 0, width: 11, height: 11, borderBottomLeftRadius: 3, backgroundColor: '#FFF0D4AA' },
  dinnerScene: { height: 391, borderRadius: 30, backgroundColor: '#B58B5A', position: 'relative', overflow: 'hidden', borderWidth: 2, borderColor: '#825D3B' },
  tablecloth: { position: 'absolute', top: 10, bottom: 10, left: 8, right: 8, backgroundColor: '#F4E5C7', borderRadius: 100, overflow: 'hidden' },
  clothStripe: { position: 'absolute', left: '26%', top: 0, bottom: 0, width: 3, borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#C68C6C' },
  centrePlate: { position: 'absolute', left: '35%', top: 129, height: 90, width: '29%', borderRadius: 90, backgroundColor: '#FDF7E8', borderWidth: 3, borderColor: '#D6C8AB', alignItems: 'center', justifyContent: 'center' },
  innerPlate: { width: '73%', height: '73%', borderRadius: 90, borderWidth: 2, borderColor: '#E3D8C0' },
  tableObject: { position: 'absolute', width: '28%', minHeight: 100, alignItems: 'center', gap: 0, paddingBottom: 5, borderWidth: 2, borderColor: 'transparent', borderRadius: 15 },
  mailTray: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center', backgroundColor: '#775537', borderRadius: 19, padding: 18, paddingVertical: 24 },
  envelope: { width: '44%', minHeight: 132, backgroundColor: PAPER, borderWidth: 2, borderColor: '#CBA979', borderRadius: 4, alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: 9, overflow: 'hidden' },
  envelopeFlap: { position: 'absolute', top: -34, left: '8%', width: '84%', height: 72, borderWidth: 1, borderColor: '#CBA979', transform: [{ rotate: '25deg' }], backgroundColor: '#EAD6AC' },
  stamp: { width: 59, height: 58, borderWidth: 2, borderStyle: 'dotted', borderColor: '#BD9A70', backgroundColor: '#F9EBD0', alignItems: 'center', justifyContent: 'center', marginTop: 17 },
});

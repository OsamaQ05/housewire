import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import type { DefusalDevice, DefusalPaper } from '@/src/domain/defusal/types';
import { Action, Copy, kit, light, Stamp } from './kit';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = { key: 'key-outline', candle: 'flame-outline', clock: 'time-outline', book: 'book-outline', comb: 'reorder-four-outline', umbrella: 'umbrella-outline', bell: 'notifications-outline', mirror: 'scan-circle-outline', home: 'home-outline', orchard: 'leaf-outline', tower: 'time-outline', well: 'water-outline', library: 'library-outline', quay: 'boat-outline', bakery: 'cafe-outline', garden: 'flower-outline', lighthouse: 'flashlight-outline' };

export function ModulePanel({ device, locked, onCommit }: { device: DefusalDevice; locked: boolean; onCommit(answer: string[]): void }) {
  const [selection, setSelection] = useState<string[]>([]);
  const [phrase, setPhrase] = useState('');
  const [message, setMessage] = useState('');
  const isMap = Boolean(device.edges);
  const choose = (id: string) => {
    setMessage('');
    const previous = selection.indexOf(id);
    if (previous >= 0) { setSelection(isMap ? selection.slice(0, previous) : selection.filter((item) => item !== id)); return; }
    if (selection.length >= device.selectionCount) { setMessage('All spaces are filled. Tap an item to remove it, or use Undo.'); return; }
    if (isMap && !selection.length && id !== device.start) { setMessage('Your route begins at Home. Tap Home first.'); return; }
    if (isMap && selection.length && !device.edges?.some(([a, b]) => (a === selection.at(-1) && b === id) || (b === selection.at(-1) && a === id))) { setMessage('Follow a drawn path to a neighbouring place.'); return; }
    setSelection([...selection, id]);
  };
  const ready = device.textEntry ? Boolean(phrase.trim()) : selection.length === device.selectionCount;
  return <View style={styles.panel}>
    <View style={kit.between}><Stamp>OPERATOR’S PANEL</Stamp><Ionicons color={light.gold} size={21} name="hardware-chip-outline" /></View>
    {device.indicator ? <View style={styles.indicator}><View style={styles.lamp} /><Copy style={{ color: light.gold, fontWeight: '700' }}>{device.indicator}</Copy></View> : null}
    <Copy>{device.instruction}</Copy>
    {device.textEntry ? <TextInput accessibilityLabel="Shutdown phrase" autoCapitalize="none" autoCorrect={false} placeholder="Your three-word phrase" placeholderTextColor={light.muted} maxLength={100} value={phrase} onChangeText={setPhrase} style={kit.input} onSubmitEditing={() => { if (ready && !locked) onCommit([phrase]); }} /> : <>
      {isMap ? <View style={styles.map}>
        <Svg width="100%" height="100%" viewBox="0 0 300 300" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          {device.edges?.map(([a, b]) => { const start = device.options.find((p) => p.id === a)!; const end = device.options.find((p) => p.id === b)!; const active = selection.some((id, i) => i > 0 && ((id === a && selection[i - 1] === b) || (id === b && selection[i - 1] === a))); return <Line key={`${a}-${b}`} x1={50 + start.x! * 100} y1={50 + start.y! * 100} x2={50 + end.x! * 100} y2={50 + end.y! * 100} stroke={active ? light.gold : light.line} strokeWidth={active ? 6 : 3} strokeDasharray={active ? undefined : '5 5'} />; })}
        </Svg>
        {device.options.map((option) => <Pressable accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected: selection.includes(option.id) }} key={option.id} onPress={() => choose(option.id)} style={[styles.place, { left: `${option.x! * 33.333}%`, top: `${option.y! * 33.333}%` }]}>
          <View style={[styles.placeIcon, selection.includes(option.id) && styles.selected]}><Ionicons name={ICONS[option.id] ?? 'location-outline'} color={selection.includes(option.id) ? light.ink : light.paper} size={23} /></View><Copy kind="label" style={styles.placeLabel}>{option.label}</Copy>
        </Pressable>)}
      </View> : <View style={styles.options}>
        {device.options.map((option) => { const index = selection.indexOf(option.id); return <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`${option.label}${option.detail ? `, ${option.detail}` : ''}`} accessibilityState={{ selected: index >= 0 }} onPress={() => choose(option.id)} style={[styles.option, index >= 0 && styles.selected]}>
          <Ionicons name={ICONS[option.id.split('-')[0]] ?? 'radio-button-off-outline'} size={27} color={index >= 0 ? light.ink : light.gold} />
          <Copy style={{ color: index >= 0 ? light.ink : light.paper, fontWeight: '700' }}>{option.label}</Copy>
          {option.detail ? <Copy kind="label" style={{ color: index >= 0 ? light.ink : light.muted }}>{option.detail}</Copy> : null}
          {index >= 0 ? <View style={styles.number}><Copy kind="label" style={{ color: light.paper }}>{device.ordered ? index + 1 : '✓'}</Copy></View> : null}
        </Pressable>; })}
      </View>}
      <View style={styles.selection}><Copy kind="label" pale>{device.ordered ? 'YOUR ORDER' : 'YOUR PAIR'} · {selection.length}/{device.selectionCount}</Copy><Copy>{selection.length ? selection.map((id) => device.options.find((o) => o.id === id)?.label).join(device.ordered ? ' → ' : ' + ') : 'Nothing selected yet'}</Copy>
        {selection.length ? <Pressable accessibilityRole="button" onPress={() => setSelection(selection.slice(0, -1))} style={styles.undo}><Ionicons name="arrow-undo-outline" size={17} color={light.gold} /><Copy kind="label" style={{ color: light.gold }}>Undo last choice</Copy></Pressable> : null}
      </View>
    </>}
    {message ? <Copy accessibilityLiveRegion="polite" style={{ color: light.gold }}>{message}</Copy> : null}
    <Action disabled={locked || !ready} icon="lock-closed-outline" onPress={() => onCommit(device.textEntry ? [phrase] : selection)}>Lock {isMap ? 'the route' : device.textEntry ? 'the phrase' : 'your answer'}</Action>
    <Copy kind="label" pale style={{ textAlign: 'center' }}>Check with your readers before you lock. A wrong answer costs one strike.</Copy>
  </View>;
}

export function PaperPanel({ paper, witness = false }: { paper: DefusalPaper; witness?: boolean }) {
  return <View style={[styles.paper, witness && styles.witness]}>
    <View style={kit.between}><Copy kind="label" style={styles.ink}>{witness ? 'WITNESS’S EVIDENCE' : 'KEEPER’S FIELD MANUAL'}</Copy><Ionicons name={witness ? 'eye-outline' : 'book-outline'} color={light.ink} size={22} /></View>
    <Copy kind="title" style={styles.ink}>{paper.heading}</Copy>
    {paper.lines.map((line, index) => <View key={`${index}-${line}`} style={styles.paperLine}><Copy kind="label" style={styles.step}>{String(index + 1).padStart(2, '0')}</Copy><Copy style={[styles.ink, { flex: 1 }]}>{line}</Copy></View>)}
    <View style={styles.paperFooter}><Ionicons name="ear-outline" color={light.ink} size={18} /><Copy kind="label" style={[styles.ink, { flex: 1 }]}>Describe this to the Operator. Keep your screen private.</Copy></View>
  </View>;
}
const styles = StyleSheet.create({
  panel: { borderWidth: 2, borderColor: light.line, backgroundColor: light.panel, borderRadius: 22, padding: 16, gap: 18 },
  indicator: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: light.line, paddingBottom: 13 }, lamp: { width: 11, height: 11, borderRadius: 10, backgroundColor: light.gold },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, option: { width: '48%', flexGrow: 1, minHeight: 95, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: light.line, backgroundColor: light.background, gap: 5, alignItems: 'center', justifyContent: 'center' }, selected: { backgroundColor: light.gold, borderColor: light.paper }, number: { position: 'absolute', right: 5, top: 5, backgroundColor: light.ink, width: 23, height: 23, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  selection: { borderRadius: 12, padding: 12, gap: 6, backgroundColor: light.background }, undo: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 38 },
  map: { width: '100%', aspectRatio: 1, backgroundColor: '#0B2931', borderRadius: 16 }, place: { position: 'absolute', width: '33.333%', height: '33.333%', alignItems: 'center', justifyContent: 'center', gap: 3 }, placeIcon: { backgroundColor: light.panel, borderWidth: 2, borderColor: light.line, width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, placeLabel: { color: light.paper, fontSize: 10, lineHeight: 13, backgroundColor: '#0B2931', paddingHorizontal: 2 },
  paper: { backgroundColor: light.paper, borderRadius: 5, borderTopRightRadius: 24, padding: 20, gap: 17, borderBottomWidth: 5, borderColor: '#B39C71' }, witness: { backgroundColor: '#DDEBD8', borderColor: '#91B2A0' }, ink: { color: light.ink }, paperLine: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderColor: '#112E3626', paddingTop: 14 }, step: { color: '#617067', width: 20 }, paperFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderColor: '#112E3626', paddingTop: 12 },
});

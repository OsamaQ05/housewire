import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useMusicSilence } from '@/src/features/music/HousewireMusic';
import { evidenceMarker, matchesEvidenceMarker } from './evidence-marker';
import { EvidenceDiagram, StoryScene } from './StoryScene';
import { STORY_BG, STORY_INK, StoryButton, StoryIconButton, StoryNotice, StoryText, ui } from './story-ui';
import type { StoryClue, StoryPlayerView, StoryState } from './types';

export function StoryEvidence({ state, view, shared, revealed, onReveal }: { state: StoryState; view: StoryPlayerView; shared: boolean; revealed: string[]; onReveal(id: string): void }) {
  const accent = view.room.accent;
  return <View style={{ gap: 18 }}>
    <View style={ui.spread}><StoryText size={12} strong color={accent} style={ui.kicker}>YOUR PRIVATE EVIDENCE</StoryText><Ionicons name="finger-print-outline" size={23} color={accent} /></View>
    <StoryText size={14} color="#BBC9D0">Describe what you found. Your teammates have the missing pieces.</StoryText>
    {view.stage.clues.map((clue, index) => <EvidenceCard key={`${state.operationId}:${view.playerId}:${view.stage.id}:${clue.id}`} clue={clue} state={state} view={view} index={index} shared={shared} revealed={revealed.includes(clue.id)} onReveal={() => onReveal(clue.id)} />)}
  </View>;
}

function EvidenceCard({ clue, state, view, index, shared, revealed, onReveal }: { clue: StoryClue; state: StoryState; view: StoryPlayerView; index: number; shared: boolean; revealed: boolean; onReveal(): void }) {
  const [scanner, setScanner] = useState(false);
  const [scanError, setScanError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  // Field notes can contain semantic observations a tone alone cannot express.
  const [transcript, setTranscript] = useState(true);
  const scanLock = useRef(false);
  const accent = view.room.accent;
  const target = state.players[(clue.scanTargetSeat ?? (clue.seat + 1)) % state.players.length];
  const locked = clue.medium === 'lens' && !revealed;
  const observation = clue.observations?.find(item => item.probeId === state.activeProbe);
  const lines = observation ? [...clue.lines, ...observation.lines] : clue.lines;
  const beats = observation?.beats ?? clue.beats;
  const audio = clue.medium === 'audio' || Boolean(beats?.length);
  const openScanner = async () => {
    setScanError('');
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (!result.granted) { setScanError('Camera is unavailable. Open the accessible record below—the deduction is the same.'); return; }
      scanLock.current = false; setScanner(true);
    } catch { setScanError('Camera could not open. Use the accessible record below.'); }
  };
  return <View style={[evidence.paper, { backgroundColor: view.room.paper, borderTopColor: accent }]}>
    <View style={ui.spread}>
      <StoryText size={10} strong color="#647477" style={ui.kicker}>{clue.medium === 'lens' ? 'ARCHIVE LENS' : audio ? 'LISTENING RECORD' : `EVIDENCE ${String(index + 1).padStart(2, '0')}`}</StoryText>
      <Ionicons name={clue.medium === 'lens' ? 'scan-outline' : audio ? 'headset-outline' : 'document-text-outline'} size={20} color={STORY_INK} />
    </View>
    <StoryText display size={29} color={STORY_INK}>{clue.title}</StoryText>
    {locked ? <>
      <StoryScene roomId={view.room.id} accent={accent} illustration={clue.illustration} />
      <StoryText size={14} color={STORY_INK}>{shared && target.id !== view.playerId ? `Ask ${target.name} to open their station badge. Scan it to recover this illustrated record.` : 'Open this illustrated record to examine the evidence. In a live room, another phone holds its station badge.'}</StoryText>
      {shared && target.id !== view.playerId ? <StoryButton label={`Scan ${target.name}’s station`} icon="scan-outline" accent={accent} onPress={() => { void openScanner(); }} /> : null}
      <Pressable accessibilityRole="button" onPress={onReveal} style={evidence.accessible}><StoryText size={13} strong color={STORY_INK}>{shared ? 'No camera? Open accessible record' : 'Examine the record'}</StoryText><Ionicons name="arrow-forward" size={17} color={STORY_INK} /></Pressable>
      {scanError ? <StoryText size={12} color="#883B30">{scanError}</StoryText> : null}
    </> : <>
      {clue.medium === 'lens' ? <>{clue.diagram ? <EvidenceDiagram diagram={clue.diagram} accent={accent} /> : <StoryScene roomId={view.room.id} accent={accent} illustration={clue.illustration} active />}<StoryText size={10} color="#617175">FICTIONAL ARCHIVE VIEW · CAMERA IMAGES ARE NOT SAVED</StoryText></> : null}
      {audio && beats?.length ? <StoryAudio key={`${state.activeProbe ?? 'record'}:${beats.join(',')}`} beats={beats} accent={accent} /> : null}
      {clue.spokenText ? <NarratedRecord text={clue.spokenText} accent={accent} /> : null}
      {clue.observations && !observation ? <StoryText color={STORY_INK} size={14}>Run a test on the shared console. Your station’s observation will appear here.</StoryText> : null}
      {/* Text access carries exactly the same evidence as the audio, never a solved board. */}
      {audio && beats?.length ? <Pressable accessibilityRole="button" onPress={() => setTranscript(!transcript)} style={evidence.accessible}><StoryText size={12} strong color={STORY_INK}>{transcript ? 'Hide listening notes' : 'Read listening notes / sound off'}</StoryText><Ionicons name={transcript ? 'chevron-up' : 'chevron-down'} size={15} color={STORY_INK} /></Pressable> : null}
      {(!audio || !beats?.length || transcript) && lines.map((line, i) => <View key={i} style={[evidence.line, i > 0 && { borderTopWidth: 1 }]}><StoryText size={15} color={STORY_INK}>{line}</StoryText></View>)}
    </>}
    <Modal visible={scanner} animationType="slide" onRequestClose={() => setScanner(false)}>
      <View style={{ flex: 1, backgroundColor: STORY_BG, paddingTop: 44 }}>
        <View style={[ui.spread, { paddingHorizontal: 18 }]}><StoryText size={22} strong>Find {target.name}’s station</StoryText><StoryIconButton icon="close" label="Close camera" onPress={() => setScanner(false)} /></View>
        {scanner && permission?.granted ? <CameraView style={{ flex: 1, margin: 18, borderRadius: 20 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={result => {
          if (scanLock.current) return;
          if (!matchesEvidenceMarker(result.data, state.operationId, target.id)) { setScanError('That is not this station’s badge. Ask your teammate to open Station badge inside this case.'); return; }
          scanLock.current = true; onReveal(); setScanner(false);
        }} /> : null}
        <View style={{ padding: 20, gap: 12 }}>{scanError ? <StoryNotice>{scanError}</StoryNotice> : <StoryText>Point at the other phone’s badge. This opens an illustrated story record, not a scan of your home.</StoryText>}<StoryButton label="Use accessible record" onPress={() => { onReveal(); setScanner(false); }} accent={accent} /></View>
      </View>
    </Modal>
  </View>;
}

export function StoryAudio({ beats, accent }: { beats: number[]; accent: string }) {
  const { play } = useHousewireSound();
  const soundEnabled = useHousewireStore(s => s.settings.sound);
  const [playing, setPlaying] = useState(false);
  useMusicSilence(playing);
  const [activeBeat, setActiveBeat] = useState(-1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancel = () => { timers.current.forEach(clearTimeout); timers.current = []; setPlaying(false); setActiveBeat(-1); };
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const playPattern = () => {
    cancel(); setPlaying(true);
    let at = 0;
    beats.forEach((length, index) => {
      if (length < 0) { at += Math.abs(length); return; }
      timers.current.push(setTimeout(() => { setActiveBeat(index); play(length > 300 ? 'circuitLong' : 'circuitShort', .8); }, at));
      at += Math.max(180, length) + 230;
    });
    timers.current.push(setTimeout(() => { setPlaying(false); setActiveBeat(-1); }, at));
  };
  return <View style={{ gap: 12 }}>
    <View accessibilityLabel="Sound envelope. Use listening notes for a text equivalent." style={evidence.wave}>{beats.map((length, index) => <View key={index} style={{ width: length < 0 ? 7 : length > 300 ? 19 : 7, height: length < 0 ? 0 : activeBeat === index ? 42 : length > 300 ? 29 : 18, borderRadius: 5, backgroundColor: activeBeat === index ? accent : '#56737E' }} />)}</View>
    <StoryButton accent={accent} label={playing ? 'Stop replay' : 'Replay the signal'} icon={playing ? 'stop' : 'play'} onPress={playing ? cancel : playPattern} />
    {!soundEnabled ? <StoryText size={12} color={STORY_INK}>Sound is off in Settings. The listening notes contain the same evidence.</StoryText> : null}
  </View>;
}

function NarratedRecord({ text, accent }: { text: string; accent: string }) {
  const [playing, setPlaying] = useState(false);
  useMusicSilence(playing);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => () => { void Speech.stop(); }, []);
  return <View style={{ gap: 8 }}><StoryButton accent={accent} label={playing ? 'Stop narration' : 'Read the recording aloud'} icon={playing ? 'stop' : 'volume-medium-outline'} onPress={() => {
    if (playing) { void Speech.stop(); setPlaying(false); return; }
    setPlaying(true); setUnavailable(false);
    try { Speech.speak(text, { rate: .91, onDone: () => setPlaying(false), onStopped: () => setPlaying(false), onError: () => { setPlaying(false); setUnavailable(true); } }); }
    catch { setPlaying(false); setUnavailable(true); }
  }} />{unavailable ? <StoryText color={STORY_INK} size={12}>Narration isn’t available on this device. The full transcript is below.</StoryText> : null}<StoryText color="#617175" size={10}>DEVICE NARRATION · TRANSCRIPT BELOW</StoryText></View>;
}

export function StationBadge({ state, playerId, open, onClose }: { state: StoryState; playerId: string; open: boolean; onClose(): void }) {
  const player = state.players.find(p => p.id === playerId);
  return <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
    <View style={ui.sheetBackdrop}><View style={ui.sheet}>
      <View style={ui.spread}><StoryText display size={34}>Your station badge</StoryText><StoryIconButton icon="close" label="Close station badge" onPress={onClose} /></View>
      <StoryText>Let the teammate with the lens scan this. It opens their private record; it does not reveal your clues.</StoryText>
      <View style={{ padding: 20, backgroundColor: 'white', alignSelf: 'center', borderRadius: 15 }}><QRCode value={evidenceMarker(state.operationId, playerId)} size={220} /></View>
      <StoryText strong style={{ textAlign: 'center' }}>{player?.name ?? 'Your station'}</StoryText>
      <StoryButton label="Back to my clues" onPress={onClose} secondary />
    </View></View>
  </Modal>;
}

export function EvidenceNotebook({ state, view, open, onClose, discoveries }: { state: StoryState; view: StoryPlayerView; open: boolean; onClose(): void; discoveries: { title: string; text: string }[] }) {
  return <Modal visible={open} transparent animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose}><View style={ui.sheetBackdrop}><View style={ui.sheet}>
    <View style={ui.spread}><StoryText display size={34}>Case notebook</StoryText><StoryIconButton icon="close" label="Close notebook" onPress={onClose} /></View>
    <StoryText size={14}>Your board is saved as you go. Only complete submissions use an attempt. Tell teammates what your evidence says before deciding where to place a piece.</StoryText>
    <ScrollView contentContainerStyle={{ gap: 18 }}><StoryText>{view.stage.story}</StoryText>{discoveries.length ? <StoryText color={view.room.accent} strong>What we’ve discovered</StoryText> : null}{discoveries.map((entry, i) => <View key={i} style={{ gap: 8, borderLeftWidth: 2, borderColor: view.room.accent, paddingLeft: 14 }}><StoryText strong>{entry.title}</StoryText><StoryText size={14}>{entry.text}</StoryText></View>)}</ScrollView>
    <StoryNotice>{state.assistedStages.length ? state.chapterAttemptsUsed : state.attemptsUsed} of {view.room.attemptLimit} wrong submissions used {state.assistedStages.length ? 'in this chapter. You are exploring with revealed help.' : 'across this case.'}</StoryNotice>
  </View></View></Modal>;
}
const evidence = StyleSheet.create({
  paper: { padding: 20, borderRadius: 4, borderTopWidth: 5, gap: 14, transform: [{ rotate: '-.25deg' }] },
  line: { paddingVertical: 7, borderColor: '#A7B0A64D' },
  accessible: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  wave: { minHeight: 63, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#172831', borderRadius: 12, padding: 10 },
});

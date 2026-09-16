import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenShell } from '@/src/components/ScreenShell';
import { CaseArtwork } from '@/src/components/CaseArtwork';
import type { DefusalRole } from '@/src/domain/defusal/types';
import { makeDefusalJoinTicket, parseDefusalJoinParams } from '@/src/features/defusal/join-ticket';
import { useDefusalRuntime } from '@/src/features/defusal/use-defusal-runtime';
import { JoinPanel } from '@/src/features/defusal-ui/JoinPanel';
import { ModulePanel, PaperPanel } from '@/src/features/defusal-ui/ModulePanel';
import { Action, Copy, kit, light, Stamp } from '@/src/features/defusal-ui/kit';
import { GuideChat, defusalGuideContext } from '@/src/features/director';
import { AnswerReview } from '@/src/components/AnswerReview';
import { HouseLineDock, useHouseLine } from '@/src/features/comms';
import { useHousewireSessionContext } from '@/src/features/session';
import { useAcousticMeter } from '@/src/hooks/use-acoustic-meter';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useFamilyClubStore } from '@/src/store/use-family-club-store';

const ROLES: { id: DefusalRole; title: string; task: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'operator', title: 'Operator', task: 'You see the device. Describe it, then make the moves.', icon: 'hardware-chip-outline' },
  { id: 'archivist', title: 'Archivist', task: 'You have the manual. Ask what they see; explain the rule.', icon: 'book-outline' },
  { id: 'witness', title: 'Witness', task: 'You hold the missing riddles. Work out what they mean.', icon: 'eye-outline' },
];
const time = (ms: number) => `${String(Math.floor(Math.max(0, ms) / 60_000)).padStart(2, '0')}:${String(Math.floor(Math.max(0, ms) / 1_000) % 60).padStart(2, '0')}`;

export default function DefusalScreen() {
  const params = useLocalSearchParams<{ c?: string; r?: string; join?: string }>();
  const router = useRouter();
  const runtime = useDefusalRuntime();
  const session = useHousewireSessionContext();
  const acoustic = useAcousticMeter();
  const { play } = useHousewireSound();
  const settings = useHousewireStore((s) => s.settings);
  const record = useFamilyClubStore((s) => s.record);
  const [name, setName] = useState(() => { const house = useHousewireStore.getState(); return house.crew.find((p) => p.id === house.localNodeId)?.name ?? ''; });
  const [joining, setJoining] = useState(params.join === '1');
  const [lineOpen, setLineOpen] = useState(false);
  const [localError, setLocalError] = useState('');
  const view = runtime.view;
  const previous = useRef<{ id: string; stage: number; strikes: number; status: string } | undefined>(undefined);
  const scroll = useRef<ScrollView>(null);
  const connected = view?.mode === 'live' && view.status === 'playing';
  const line = useHouseLine({ acoustic, channelId: view?.id, enabled: Boolean(connected), hapticsEnabled: settings.haptics, localNodeId: runtime.localNodeId, peers: (view?.players ?? []).map((p) => ({ id: p.id, label: p.name, roomLabel: ROLES.find((r) => r.id === p.role)?.title })), session, trustedPeerIds: (view?.players ?? []).map((p) => p.id), clockOffsetMs: session.clockEstimate?.offsetMs });
  const cancelLine = useRef(line.cancelTalking); cancelLine.current = line.cancelTalking;
  const live = view?.mode === 'live';
  const role = ROLES.find((r) => r.id === view?.role) ?? ROLES[0];
  const cooldown = Math.max(0, (view?.cooldownUntil ?? 0) - runtime.now);
  const invite = runtime.code && runtime.relayUrl ? makeDefusalJoinTicket(runtime.code, runtime.relayUrl, Linking.createURL('/defusal')) : undefined;
  const reportError = (error: unknown) => setLocalError(error instanceof Error ? error.message : 'That action could not finish. Please try again.');

  useEffect(() => {
    if (Platform.OS !== 'web') void activateKeepAwakeAsync('last-light').catch(() => undefined);
    return () => { if (Platform.OS !== 'web') void deactivateKeepAwake('last-light'); void cancelLine.current().catch(() => undefined); };
  }, []);
  useEffect(() => {
    if (!view) return;
    const old = previous.current;
    if (old?.id === view.id) {
      if (view.strikes > old.strikes) { play('warning', 0.5); if (settings.haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined); }
      if (view.stageIndex > old.stage) { play(view.status === 'defused' ? 'complete' : 'accept', 0.55); if (settings.haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined); scroll.current?.scrollTo({ y: 0, animated: !settings.reducedMotion }); }
    }
    previous.current = { id: view.id, stage: view.stageIndex, strikes: view.strikes, status: view.status };
    if ((view.status === 'defused' || view.status === 'failed') && view.finishedAt) {
      record({ id: `defusal-${view.id}`, mode: 'defusal', title: view.tutorial ? 'Last Light · First circuit' : 'Last Light', playedAt: new Date(view.finishedAt).toISOString(), durationSeconds: Math.max(0, view.finishedAt - (view.startedAt ?? view.finishedAt)) / 1_000, practice: view.mode === 'practice', source: 'authored', rounds: view.stageIndex, retries: view.strikes, participants: view.players.map((p) => ({ name: p.name, won: view.status === 'defused', team: 'Keeper crew' })) });
    }
  }, [play, record, settings.haptics, settings.reducedMotion, view]);

  const exit = () => {
    if (view?.status === 'playing' && live) {
      const leave = () => { runtime.leave(); router.replace('/modes'); };
      if (Platform.OS === 'web') { if (globalThis.confirm('Leave this live game? Keep the host’s game open while others play.')) leave(); }
      else Alert.alert('Leave Last Light?', 'Keep the host’s game open while others play.', [{ text: 'Stay', style: 'cancel' }, { text: 'Leave game', style: 'destructive', onPress: leave }]);
    } else router.replace('/modes');
  };
  return <ScreenShell edgeWire="none" padded={false} texture={false}>
    <View style={[StyleSheet.absoluteFill, { backgroundColor: light.background }]} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topbar}><Pressable accessibilityRole="button" accessibilityLabel="Back to games" onPress={exit} style={styles.back}><Ionicons name="arrow-back" size={23} color={light.paper} /></Pressable><Copy kind="label" style={{ letterSpacing: 3, flex: 1 }}>LAST LIGHT</Copy>{view?.status === 'playing' ? <Copy style={[styles.timer, runtime.remainingMs < 60_000 && { color: light.red }]}>{time(runtime.remainingMs)}</Copy> : <Ionicons name="flashlight-outline" color={light.gold} size={23} />}</View>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[kit.page, connected && { paddingBottom: 125 }]} showsVerticalScrollIndicator={false}>
        {runtime.error || localError ? <View style={kit.error}><Copy accessibilityLiveRegion="polite">{runtime.error ?? localError}</Copy><Action secondary onPress={() => { runtime.clearError(); setLocalError(''); if (live && runtime.connectionState !== 'connected') runtime.reconnect(); }}>{live && runtime.connectionState !== 'connected' ? 'Reconnect' : 'Got it'}</Action></View> : null}
        {!runtime.hydrated ? <Copy pale>Opening your case…</Copy> : !view ? <>
          <View style={styles.artFrame}><CaseArtwork caseId="last-light" /><View style={styles.artCaption}><Stamp>A COOPERATIVE DEFUSAL MYSTERY</Stamp><Copy kind="display">Last Light</Copy></View></View>
          <Copy kind="title">Three perspectives. One way out.</Copy><Copy pale>A strange device is counting down in the lighthouse. The controls, instructions, and missing clues are on different phones. Nobody can solve it alone.</Copy>
          <Copy kind="label" pale>WHAT SHOULD WE CALL YOU?</Copy><TextInput accessibilityLabel="Your name" value={name} onChangeText={setName} maxLength={24} placeholder="Your name" placeholderTextColor={light.muted} style={kit.input} />
          {joining ? <JoinPanel key={`${params.c ?? ''}-${params.r ?? ''}`} initial={parseDefusalJoinParams(params)} name={name} joining={runtime.joining} onJoin={runtime.join} onCancel={() => setJoining(false)} /> : <>
            <Action icon="people-outline" disabled={!name.trim()} onPress={() => { try { runtime.startHost(false, name); } catch (error) { reportError(error); } }}>Host a game</Action>
            <Action secondary icon="scan-outline" onPress={() => setJoining(true)}>Join someone’s game</Action>
            <Action secondary icon="school-outline" onPress={() => runtime.startPractice(true, name || 'You')}>Learn with one circuit</Action>
            <Action secondary onPress={() => runtime.startPractice(false, name || 'You')}>Try the full case on one phone</Action>
            <Copy kind="label" pale>15 minutes · 2–4 phones · same Wi-Fi or hotspot. One-phone practice lets you switch roles. No camera or microphone needed to start.</Copy>
            <View style={{ gap: 14 }}>{ROLES.map((r) => <View style={kit.row} key={r.id}><View style={styles.roleIcon}><Ionicons name={r.icon} color={light.gold} size={23} /></View><View style={{ flex: 1 }}><Copy style={{ fontWeight: '700' }}>{r.title}</Copy><Copy kind="label" pale>{r.task}</Copy></View></View>)}</View>
          </>}
        </> : view.status === 'waiting' ? <>
          <Stamp>WAITING ROOM</Stamp><Copy kind="display">Gather your crew.</Copy><Copy pale>Everyone opens Last Light, taps Join, and scans this invite. Keep your own screen private once the game starts.</Copy>
          {invite && runtime.isHost ? <View style={styles.invite}><QRCode value={invite} size={190} backgroundColor={light.paper} color={light.ink} /><Copy style={{ color: light.ink, fontSize: 31, letterSpacing: 8, fontWeight: '700' }}>{runtime.code}</Copy><Copy kind="label" style={{ color: light.ink, textAlign: 'center' }}>{runtime.relayUrl}</Copy><Action onPress={() => { void Share.share({ message: `Join Last Light: ${invite}` }).catch(reportError); }}>Share room invite</Action></View> : <Copy kind="title">Room {runtime.code}</Copy>}
          {view.players.map((p) => <View style={styles.player} key={p.id}><Ionicons name={ROLES.find((r) => r.id === p.role)!.icon} size={25} color={light.gold} /><View style={{ flex: 1 }}><Copy>{p.name}{p.id === runtime.localNodeId ? ' · you' : ''}</Copy><Copy kind="label" pale>{ROLES.find((r) => r.id === p.role)!.title}{view.players.length === 2 && p.role === 'archivist' ? ' + Witness' : ''}</Copy></View></View>)}
          <Copy pale>Talk aloud nearby, or send voice messages using the intercom when you’re in different rooms. Two people? The Archivist also gets the riddles.</Copy>
          <Copy kind="label" style={{ color: runtime.connectionState === 'connected' ? light.mint : light.gold }}>{runtime.connectionState === 'connected' ? 'Room connection ready' : `Connection: ${runtime.connectionState}`}</Copy>
          {runtime.isHost ? <Action disabled={view.players.length < 2 || runtime.connectionState !== 'connected'} onPress={runtime.startGame}>{view.players.length < 2 ? 'Waiting for one more phone' : 'Start the countdown'}</Action> : <Copy style={{ color: light.gold }}>The host will start when everyone is ready.</Copy>}
          <Action secondary onPress={() => { runtime.leave(); setJoining(false); }}>Close room</Action>
        </> : view.status === 'playing' ? <>
          <View style={kit.between}><Stamp>{view.tutorial ? 'FIRST CIRCUIT' : `MODULE ${view.stageIndex + 1} OF ${view.moduleCount}`}</Stamp><View style={kit.row}>{Array.from({ length: view.maxStrikes }, (_, i) => <Ionicons key={i} name={i < view.strikes ? 'close-circle' : 'ellipse-outline'} color={i < view.strikes ? light.red : light.line} size={19} />)}<Copy kind="label" pale>{view.strikes}/{view.maxStrikes}</Copy></View></View>
          {!live ? <><Copy kind="label" style={{ color: light.gold }}>SOLO PRACTICE · switch seats to read each part</Copy><View style={styles.tabs}>{ROLES.map((r) => <Pressable key={r.id} accessibilityRole="button" accessibilityState={{ selected: view.role === r.id }} onPress={() => runtime.setPracticeRole(r.id)} style={[styles.tab, view.role === r.id && { backgroundColor: light.gold }]}><Ionicons name={r.icon} size={21} color={view.role === r.id ? light.ink : light.paper} /><Copy kind="label" style={{ color: view.role === r.id ? light.ink : light.paper }}>{r.title}</Copy></Pressable>)}</View></> : <View style={kit.row}><Ionicons name={role.icon} size={22} color={light.gold} /><Copy style={{ color: light.gold }}>You’re the {role.title}</Copy></View>}
          <Copy kind="display" style={{ fontSize: 41, lineHeight: 45 }}>{view.module?.title}</Copy>
          {view.tutorial ? <View style={styles.lesson}><Copy>Start with the Witness’s riddles. Match their answers to objects, then read the Archivist’s badge rule. Finally, switch to Operator and choose the objects in that order.</Copy></View> : null}
          {view.feedback ? <View style={view.strikes && cooldown ? kit.error : styles.lesson}><Copy accessibilityLiveRegion="polite">{view.feedback}</Copy></View> : null}
          {cooldown > 0 ? <Copy style={{ color: light.gold }}>Take a breath and compare notes · {Math.ceil(cooldown / 1_000)}s</Copy> : null}
          {live && runtime.connectionState !== 'connected' ? <View style={kit.error}><Copy>Connection interrupted. Keep this screen open.</Copy><Action secondary onPress={runtime.reconnect}>Reconnect</Action></View> : null}
          <Animated.View key={`${view.module?.id}-${view.role}`} entering={settings.reducedMotion ? undefined : FadeInDown.duration(200)} style={{ gap: 18 }}>
            {view.module?.device ? <ModulePanel device={view.module.device} locked={cooldown > 0 || (live && (runtime.connectionState !== 'connected' || view.readyNodeIds.length < view.players.length - 1))} onCommit={(answer) => { void runtime.commit(answer).catch(reportError); }} /> : null}
            {view.module?.manual ? <PaperPanel paper={view.module.manual} /> : null}
            {view.module?.witness ? <PaperPanel paper={view.module.witness} witness /> : null}
          </Animated.View>
          {live && view.role !== 'operator' ? <Action disabled={view.readyNodeIds.includes(runtime.localNodeId)} onPress={() => void runtime.markReady().catch(reportError)}>{view.readyNodeIds.includes(runtime.localNodeId) ? 'You’re ready—help the Operator' : 'I’ve shared my clues'}</Action> : null}
          {live && view.role === 'operator' ? <Copy kind="label" pale>{view.readyNodeIds.length}/{view.players.length - 1} readers have shared their clues. {view.readyNodeIds.length >= view.players.length - 1 ? 'Everyone is ready. Compare your answer, then lock it.' : 'Ask them to mark ready to unlock your submit button.'}</Copy> : null}
          {view.seals.length ? <View style={styles.seals}><Copy kind="label" style={{ color: light.gold }}>EARNED SEALS · keep these for the final module</Copy>{view.seals.map((seal) => <View key={seal.title}><Copy kind="label" pale>{seal.title}</Copy><Copy>{seal.text}</Copy></View>)}</View> : null}
          <GuideChat context={defusalGuideContext(view)} runId={view.id} stageId={view.module?.id ?? 'last-light'} mechanic="defusal" roleLabel={role.title} relayUrl={runtime.relayUrl} />
          {!live ? <Action secondary onPress={() => { runtime.leave(); setJoining(false); scroll.current?.scrollTo({ y: 0, animated: !settings.reducedMotion }); }}>End practice</Action> : null}
        </> : <>
          <View style={{ height: 200, borderRadius: 19, overflow: 'hidden' }}><CaseArtwork caseId="last-light" /></View>
          <Stamp>{view.status === 'defused' ? 'DEVICE SAFE' : 'CASE CLOSED'}</Stamp><Copy kind="display">{view.status === 'defused' ? view.tutorial ? 'You’ve got it.' : 'The light stays on.' : 'One more try?'}</Copy>
          <Copy pale>{view.status === 'defused' ? view.tutorial ? 'That’s the rhythm: describe, solve, compare, then act. The full case adds connections, a landmark route, and a final phrase.' : 'Different clues. One shared solution. Your crew brought the keeper’s light back.' : view.strikes >= view.maxStrikes ? 'The device locked after too many wrong submissions. Next time, read the whole answer back together before committing.' : 'The countdown ended. Start fresh with new clues and a new plan.'}</Copy>
          {view.status === 'failed' && view.review ? <AnswerReview items={view.review} /> : null}
          <View style={styles.seals}><Copy>{view.stageIndex}/{view.moduleCount} modules solved · {view.strikes} strikes</Copy><Copy pale>{time((view.finishedAt ?? runtime.now) - (view.startedAt ?? runtime.now))} elapsed · {view.mode === 'practice' ? 'practice saved separately' : 'saved to your family history'}</Copy></View>
          {view.tutorial ? <Action onPress={() => runtime.startPractice(false, name || 'You')}>Play the full case</Action> : runtime.isHost ? <Action onPress={runtime.restart}>Play a new case</Action> : <Copy style={{ color: light.gold }}>The host can start a new case for this crew.</Copy>}
          <Action secondary onPress={() => router.push('/family')}>Family stats & history</Action><Action secondary onPress={() => { runtime.leave(); router.replace('/modes'); }}>Back to games</Action>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
    {connected ? <HouseLineDock accent={light.gold} controller={line} expanded={lineOpen} onExpandedChange={setLineOpen} /> : null}
  </ScreenShell>;
}
const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderColor: light.line }, back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, timer: { color: light.gold, fontSize: 25, fontVariant: ['tabular-nums'], fontWeight: '700' },
  artFrame: { height: 270, overflow: 'hidden', borderRadius: 22, marginHorizontal: -2 }, artCaption: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 17, gap: 9, backgroundColor: '#0A2029A6' }, roleIcon: { width: 46, height: 46, backgroundColor: light.panel, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  invite: { alignItems: 'center', backgroundColor: light.paper, borderRadius: 22, padding: 20, gap: 18 }, player: { borderBottomWidth: 1, borderColor: light.line, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 10 }, tabs: { flexDirection: 'row', gap: 7 }, tab: { flex: 1, borderRadius: 13, paddingVertical: 12, alignItems: 'center', gap: 6, backgroundColor: light.panel },
  lesson: { backgroundColor: light.panel, borderRadius: 14, padding: 15, borderLeftWidth: 3, borderLeftColor: light.gold }, seals: { padding: 17, borderRadius: 15, borderWidth: 1, borderStyle: 'dashed', borderColor: light.line, gap: 14 },
});

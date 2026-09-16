import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenShell } from '@/src/components';
import { CaseArtwork } from '@/src/components/CaseArtwork';
import { HouseLineDock, useHouseLine } from '@/src/features/comms';
import { GuideChat } from '@/src/features/director';
import { MusicToggle, useStoryMusic } from '@/src/features/music/HousewireMusic';
import { useHousewireSessionContext } from '@/src/features/session';
import { useAcousticMeter } from '@/src/hooks/use-acoustic-meter';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useFamilyClubStore } from '@/src/store/use-family-club-store';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { formatClock } from '@/src/utils/format';
import { getStoryRoom } from './catalog';
import { isActivityKind } from './activities/contracts';
import { isActivitySolved } from './activities/registry';
import { storyGuideContext, storyGuideMechanic } from './guide-context';
import { allowsStoryChoice } from './interaction-rules';
import { RoomMark, StoryRoomSkin, useRoomPresentation } from './room-presentation';
import { assistedStoryHistory, isCleanStoryWin } from './story-result';
import { StoryBoard } from './StoryBoard';
import { EvidenceNotebook, StationBadge, StoryEvidence } from './StoryEvidence';
import { StoryScene } from './StoryScene';
import { STORY_BG, StoryButton, StoryIconButton, StoryNotice, StoryText, ui } from './story-ui';
import type { StoryPlayerView, StoryRoomId, StoryStage, StoryState } from './types';
import { useStoryRoom } from './use-story-room';

type Runtime = ReturnType<typeof useStoryRoom>;
export function StoryRoomMission({ roomId }: { roomId: StoryRoomId }) {
  return <StoryRoomSkin roomId={roomId}><StoryRoomContent roomId={roomId} /></StoryRoomSkin>;
}
function StoryRoomContent({ roomId }: { roomId: StoryRoomId }) {
  const runtime = useStoryRoom(roomId);
  const router = useRouter();
  if (!runtime.state || !runtime.view) return <ScreenShell style={ui.screen}><View style={{ flex: 1, justifyContent: 'center', gap: 20 }}>
    <StoryText display size={42}>{runtime.hydrated ? 'Open the case together.' : 'Recovering your case…'}</StoryText>
    {!runtime.hydrated ? <ActivityIndicator color="#F7BD69" /> : <><StoryText>Your updated rooms start from a fresh briefing. Old-version puzzles are not resumed into a different solution.</StoryText><StoryButton label="Open briefing" onPress={() => router.replace('/briefing')} /></>}
    {runtime.error ? <StoryNotice danger>{runtime.error}</StoryNotice> : null}
  </View></ScreenShell>;
  return <ActiveStoryRoom key={runtime.state.operationId} runtime={runtime} state={runtime.state} view={runtime.view} />;
}

function ActiveStoryRoom({ runtime, state, view }: { runtime: Runtime; state: StoryState; view: StoryPlayerView }) {
  useStoryMusic(state.roomId, view.stage.id, view.stage.interaction?.kind, state.status === 'playing');
  const look = useRoomPresentation()!;
  const router = useRouter();
  const session = useHousewireSessionContext();
  const acoustic = useAcousticMeter();
  const { play } = useHousewireSound();
  const settings = useHousewireStore(s => s.settings);
  const relayUrl = useHousewireStore(s => s.relayUrl);
  const [tab, setTab] = useState<'clues' | 'board'>(view.stage.interaction ? 'board' : 'clues');
  const [guide, setGuide] = useState(false);
  const [line, setLine] = useState(false);
  const [badge, setBadge] = useState(false);
  const [notebook, setNotebook] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [lensSaveError, setLensSaveError] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const actionLock = useRef(false);
  const previousStatus = useRef(state.status);
  const accent = view.room.accent;
  const wholeRoom = useMemo(() => getStoryRoom(state.roomId, state.seed), [state.roomId, state.seed]);
  const terminal = state.status === 'won' || state.status === 'failed' || state.status === 'aborted';
  const exploring = state.assistedStages.length > 0;
  const revealedChapter = state.assistedStages.includes(state.stageIndex);
  const interactive = Boolean(view.stage.interaction);
  const shapeMaking = view.stage.interaction?.kind === 'lightbox';
  const handsOn = isActivityKind(view.stage.interaction?.kind);
  const directBoard = shapeMaking || handsOn;
  const seconds = Math.max(0, Math.ceil((state.deadlineAt - (state.endedAt ?? runtime.now)) / 1000));
  const connected = !runtime.shared || runtime.connectionState === 'connected';
  const canEdit = state.status === 'playing' && connected && !busy;
  const complete = handsOn ? Boolean(state.activity && isActivitySolved(state.activity)) : state.draft.length === view.stage.slots.length && state.draft.every((value, slot) => Boolean(value) && allowsStoryChoice(view.stage, slot, value)) && new Set(state.draft).size === state.draft.length;
  const attemptsLeft = Math.max(0, view.room.attemptLimit - (exploring ? state.chapterAttemptsUsed : state.attemptsUsed));
  const clueStorageKey = `story-lens:${state.roomId}:${runtime.activePlayerId}`;
  const peers = useMemo(() => state.players.filter(p => p.id !== runtime.localId).map(p => ({ id: p.id, label: p.name })), [runtime.localId, state.players]);
  const trustedPeerIds = useMemo(() => state.players.map(p => p.id), [state.players]);
  const houseLine = useHouseLine({ acoustic, channelId: state.operationId, clockOffsetMs: session.clockEstimate?.offsetMs, enabled: runtime.shared && state.status !== 'won' && state.status !== 'aborted',
    localNodeId: runtime.localId, peers, session, trustedPeerIds, hapticsEnabled: settings.haptics });

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void activateKeepAwakeAsync('story-room').catch(() => undefined);
    return () => { void deactivateKeepAwake('story-room'); };
  }, []);
  useEffect(() => {
    setTab(interactive ? 'board' : 'clues'); setGuide(false); setBadge(false); setConfirmReveal(false); setRevealed([]); scroll.current?.scrollTo({ y: 0, animated: false });
  }, [state.stageIndex, runtime.activePlayerId, interactive]);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(clueStorageKey).then(raw => {
      if (!raw || !active) return;
      const saved: unknown = JSON.parse(raw);
      if (saved && typeof saved === 'object' && 'operationId' in saved && saved.operationId === state.operationId && 'ids' in saved && Array.isArray(saved.ids)) {
        const savedIds = saved.ids.filter((id): id is string => typeof id === 'string');
        setRevealed(previous => [...new Set([...savedIds, ...previous])].slice(-64));
      }
    }).catch(() => { if (active) setLensSaveError(true); });
    return () => { active = false; };
  }, [clueStorageKey, state.operationId, state.stageIndex]);
  useEffect(() => {
    useHousewireStore.getState().updateMissionProgress(state.stageIndex, state.attemptsUsed);
    if (state.status !== previousStatus.current) {
      if (state.status === 'stage-solved' || state.status === 'won') {
        play(state.status === 'won' ? 'complete' : 'accept', .7);
        if (settings.haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      }
      scroll.current?.scrollTo({ y: 0, animated: !settings.reducedMotion });
      previousStatus.current = state.status;
    }
  }, [play, settings.haptics, settings.reducedMotion, state.attemptsUsed, state.stageIndex, state.status]);
  useEffect(() => {
    if (state.endedAt === undefined || state.status !== 'won') return;
    const assistedRecord = assistedStoryHistory(state, wholeRoom.title);
    if (assistedRecord) {
      useFamilyClubStore.getState().record(assistedRecord);
      useHousewireStore.setState({ missionInProgressId: null, missionStartedAt: null, missionStageIndex: 0, missionRetries: 0 });
      return;
    }
    const completedAt = new Date(state.endedAt).toISOString();
    const durationSeconds = Math.max(0, Math.round((state.endedAt - state.startedAt) / 1000));
    if (isCleanStoryWin(state)) {
      const store = useHousewireStore.getState();
      if (!store.results.some(result => result.missionId === state.roomId && result.routeSeed === state.seed && result.completedAt === completedAt)) {
        const participants = state.players.filter(p => p.id !== 'practice-player').map((p, index) => ({
          id: p.id, name: p.name, initials: p.name.slice(0, 2), nodeNumber: index + 1,
          role: 'relay' as const, roomId: '', color: wholeRoom.accent, connected: true, simulated: false,
        }));
        store.completeMission({ missionId: state.roomId, completedAt, durationSeconds, retries: state.attemptsUsed, routeSeed: state.seed, events: wholeRoom.stages.map(s => s.revelation) }, participants, !runtime.shared);
      }
    }
  }, [runtime.shared, state, wholeRoom]);

  const reveal = (id: string) => {
    setRevealed(previous => {
      const next = [...new Set([...previous, id])].slice(-64);
      void AsyncStorage.setItem(clueStorageKey, JSON.stringify({ operationId: state.operationId, ids: next })).then(() => setLensSaveError(false)).catch(() => setLensSaveError(true));
      return next;
    });
  };
  const run = async (action: () => Promise<boolean>) => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true);
    try { await action(); } finally { actionLock.current = false; setBusy(false); }
  };
  const editPlacement = runtime.edit;
  const edit = useCallback((slot: number, value: string) => {
    void editPlacement(slot, value);
    if (settings.haptics) void Haptics.selectionAsync().catch(() => undefined);
  }, [editPlacement, settings.haptics]);
  const goHome = () => {
    if (terminal) useHousewireStore.setState({ missionInProgressId: null, missionStartedAt: null });
    router.replace('/home');
  };
  const replay = () => run(async () => {
    const began = await runtime.begin();
    if (began) useHousewireStore.getState().startMission();
    return began;
  });
  const guideContext = storyGuideContext(state, view, revealed, wholeRoom.stages.length);
  const mechanic = storyGuideMechanic(view.stage);

  return <ScreenShell style={[ui.screen, { backgroundColor: look.background }]} padded={false} texture={false}>
    <ScrollView ref={scroll} contentContainerStyle={[ui.content, { gap: 16 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={ui.spread}>
        <StoryIconButton icon="chevron-back" label="Leave case" onPress={() => setLeaving(true)} />
        <View style={{ flex: 1 }}><StoryText size={13} strong color={accent} style={ui.kicker}>{view.room.title}</StoryText></View>
        {runtime.shared ? <StoryIconButton label="Show station badge" icon="qr-code-outline" accent={accent} onPress={() => setBadge(true)} /> : null}
        <StoryIconButton icon="book-outline" label="Open case notebook" onPress={() => setNotebook(true)} />
      </View>
      <View style={ui.spread}>
        <StoryText size={12} color="#B0C1CA" style={{ flex: 1 }}>{runtime.shared ? `${state.players.length} phones · ${runtime.activePlayerId === runtime.localId ? 'your station' : ''}` : 'One-phone rehearsal'}</StoryText>
        <StoryText strong size={exploring ? 13 : 19} color={!exploring && seconds < 120 ? '#FFA795' : '#DBE6EB'}>{exploring ? 'Exploring' : formatClock(seconds)}</StoryText>
        <MusicToggle color="#DBE6EB" compact />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>{wholeRoom.stages.map((stage, i) => <View key={stage.id} accessibilityLabel={`Chapter ${i + 1}${state.solvedStages.includes(i) ? ', solved' : state.assistedStages.includes(i) ? ', revealed' : i === state.stageIndex ? ', current' : ''}`} style={{ height: 5, flex: 1, borderRadius: 4, backgroundColor: state.solvedStages.includes(i) ? accent : state.assistedStages.includes(i) ? '#B1ABCD' : i === state.stageIndex ? '#BBCBD3' : '#334750' }} />)}</View>
      {runtime.connectionWarning ? <StoryNotice>{runtime.connectionWarning}</StoryNotice> : null}
      {runtime.error ? <StoryNotice danger>{runtime.error}</StoryNotice> : null}
      {lensSaveError ? <StoryNotice>Your archive view could not be saved. You can reopen it without spending an attempt.</StoryNotice> : null}

      {terminal ? <StoryEnding state={state} view={view} wholeRoom={wholeRoom} isHost={runtime.isHost} onHome={goHome} onReplay={() => { void replay(); }} onReveal={() => setConfirmReveal(true)} onClub={() => router.push('/family')} busy={busy || !connected} />
        : state.status === 'stage-solved' ? <Animated.View entering={settings.reducedMotion ? undefined : FadeInDown.duration(320)} style={{ gap: 22 }}>
          <StoryScene roomId={state.roomId} accent={accent} active />
          <StoryText size={12} strong color={accent} style={ui.kicker}>CHAPTER {state.stageIndex + 1} · {revealedChapter ? 'REVEALED' : 'SOLVED TOGETHER'}</StoryText>
          <StoryText display size={43}>{view.stage.title}</StoryText>
          <StoryText size={18}>{wholeRoom.stages[state.stageIndex].revelation}</StoryText>
          {revealedChapter ? <ChapterSolution stage={wholeRoom.stages[state.stageIndex]} accent={accent} /> : null}
          <StoryNotice>{revealedChapter ? 'Saved as a revealed discovery. The clock is off—continue when everyone is ready.' : 'This discovery is saved in your case notebook. You may need it later.'}</StoryNotice>
          {runtime.isHost ? <StoryButton label="Follow the next lead" icon="arrow-forward" accent={accent} disabled={!connected || busy} onPress={() => { void run(runtime.continueStage); }} /> : <StoryText size={14} color="#C3D2DA">Read it together, then ask your host to continue.</StoryText>}
        </Animated.View> : <>
          <View style={{ gap: 8 }}>
            <View style={ui.row}><RoomMark roomId={state.roomId} accent={accent} /><View style={{ flex: 1, gap: 3 }}><StoryText size={10} color={accent} strong style={{ letterSpacing: 1.4 }}>{look.label}</StoryText><StoryText size={11} color={look.muted}>CHAPTER {state.stageIndex + 1} / {wholeRoom.stages.length}</StoryText></View></View>
            <StoryText display size={36}>{view.stage.title}</StoryText><StoryText size={16} color={look.muted}>{view.stage.objective}</StoryText>
          </View>
          {!runtime.shared ? <View style={{ gap: 8 }}><View style={ui.row}>{state.players.map(player => <Pressable key={player.id} accessibilityRole="button" accessibilityLabel={`View ${player.name}'s clues`} accessibilityState={{ selected: runtime.activePlayerId === player.id }} onPress={() => runtime.selectPracticePlayer(player.id)} style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: runtime.activePlayerId === player.id ? accent : look.panel }}><StoryText strong size={13} color={runtime.activePlayerId === player.id ? '#172831' : look.muted}>{player.id === runtime.localId ? 'Your phone' : `${player.name}’s phone`}</StoryText></Pressable>)}</View>{state.stageIndex === 0 ? <StoryText size={12} color={look.muted}>Switch viewpoints to read both stations and use their controls. Live players each keep their own screen.</StoryText> : null}</View> : null}
          {!directBoard ? <View style={{ gap: 8 }}><StoryText size={12} color={accent} strong>{view.roleNames.join(' + ')}</StoryText>
            <View style={{ flexDirection: 'row', backgroundColor: look.panel, borderRadius: 14, padding: 4 }}>
              {(['clues', 'board'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={value === 'clues' ? 'My clues' : 'Shared board'} accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={{ flex: 1, paddingVertical: 13, borderRadius: 11, alignItems: 'center', backgroundColor: tab === value ? accent : 'transparent' }}><StoryText strong size={14} color={tab === value ? '#172831' : '#C3D2DA'}>{value === 'clues' ? 'My clues' : `Board · ${state.draft.filter(Boolean).length}/${state.draft.length}`}</StoryText></Pressable>)}
            </View>
          </View> : null}
          {view.stage.experiments?.length ? <View style={{ backgroundColor: '#263F45', padding: 17, gap: 13, borderRadius: 16 }}>
            <View style={ui.row}><Ionicons name="radio-outline" color={accent} size={23} /><StoryText strong>Shared test console</StoryText></View>
            <StoryText size={13} color="#C2D3D8">Send one signal. Each station receives its own observation in My clues. Testing does not cost an attempt.</StoryText>
            <View style={{ gap: 9 }}>{view.stage.experiments.map(experiment => <StoryButton key={experiment.id} label={`${state.activeProbe === experiment.id ? 'Current test: ' : 'Test: '}${experiment.label}`} icon="pulse-outline" secondary={state.activeProbe !== experiment.id} accent={accent} disabled={!canEdit} onPress={() => { void run(() => runtime.probe(experiment.id)); }} />)}</View>
          </View> : null}
          {!directBoard && tab === 'clues' ? <StoryEvidence state={state} view={view} shared={runtime.shared} revealed={revealed} onReveal={reveal} /> : <StoryBoard key={`${state.stageIndex}:${runtime.activePlayerId}`} state={state} view={view} onEdit={edit} onAct={move => { void run(() => runtime.act(move)); }} disabled={!canEdit} />}
          {state.feedback ? <StoryNotice>{state.feedback}</StoryNotice> : null}
          {!directBoard && tab === 'clues' ? <StoryButton label="Work on the shared board" icon="grid-outline" secondary onPress={() => { setTab('board'); scroll.current?.scrollTo({ y: 0, animated: !settings.reducedMotion }); }} /> : <View style={{ gap: 10 }}>{!handsOn || complete ? <StoryButton label={busy ? 'Saving…' : handsOn ? 'We did it · continue' : shapeMaking ? 'Check our picture' : complete ? 'Test our complete plan' : interactive ? 'Choose for your stations' : 'Fill every space together'} icon="checkmark-done-outline" accent={accent} disabled={!complete || !canEdit} onPress={() => { void run(runtime.submit); }} /> : null}<StoryText size={12} color={look.muted} style={{ textAlign: 'center' }}>{handsOn ? 'Explore and experiment freely. Everyone’s changes stay in sync.' : shapeMaking ? 'Turn and compare freely. Picture checks do not cost attempts.' : `${attemptsLeft} wrong submissions left ${exploring ? 'in this chapter' : 'for this case'}. Changes are free.`}</StoryText></View>}
          <View style={ui.row}><StoryButton label="Ask the guide" icon="help-buoy-outline" secondary style={{ flex: 1 }} onPress={() => setGuide(true)} />{runtime.shared ? <StoryIconButton label="Show station badge" icon="qr-code-outline" accent={accent} onPress={() => setBadge(true)} /> : null}</View>
          {runtime.isHost ? <StoryButton label="Reveal this chapter" icon="eye-outline" secondary disabled={!connected || busy} onPress={() => setConfirmReveal(true)} /> : <StoryText size={12} color="#B6C7CF" style={{ textAlign: 'center' }}>Ready to move on? Ask your host to reveal this chapter.</StoryText>}
        </>}
    </ScrollView>
    <GuideChat hideLauncher open={guide} onOpenChange={setGuide} runId={state.operationId} stageId={view.stage.id} mechanic={mechanic} context={guideContext} roleLabel={view.roleNames.join(' / ')} relayUrl={relayUrl} title={view.stage.title} accent={accent} />
    <StationBadge state={state} playerId={runtime.activePlayerId} open={badge} onClose={() => setBadge(false)} />
    <EvidenceNotebook state={state} view={view} open={notebook} onClose={() => setNotebook(false)} discoveries={[...state.solvedStages, ...state.assistedStages].sort((a, b) => a - b).map(i => ({ title: `${state.assistedStages.includes(i) ? 'Revealed · ' : ''}${wholeRoom.stages[i].title}`, text: wholeRoom.stages[i].revelation }))} />
    {runtime.shared && state.status !== 'won' && state.status !== 'aborted' ? <HouseLineDock accent={accent} controller={houseLine} expanded={line} guideMode="chat" onExpandedChange={setLine} onGuidePress={() => setGuide(true)} /> : null}
    <Modal visible={confirmReveal} transparent animationType="fade" onRequestClose={() => setConfirmReveal(false)}><View style={ui.sheetBackdrop}><View style={ui.sheet}>
      <View style={ui.spread}><StoryText display size={34} style={{ flex: 1 }}>Reveal this chapter?</StoryText><StoryIconButton icon="close" label="Keep chapter hidden" onPress={() => setConfirmReveal(false)} /></View>
      <StoryText>Everyone will see this answer, all its clues, and how they fit. Read it together, then continue to the next chapter.</StoryText>
      <StoryNotice>{exploring ? 'This stays an assisted story, outside the leaderboard.' : 'The timer will stop. Your story is saved as assisted, not a scored escape.'}</StoryNotice>
      <StoryButton label="Reveal solution" icon="eye-outline" accent={accent} disabled={!runtime.isHost || !connected || busy} onPress={() => { setConfirmReveal(false); void run(runtime.reveal); }} />
      <StoryButton label={state.status === 'playing' ? 'Keep trying' : 'Back to the chapter'} secondary onPress={() => setConfirmReveal(false)} />
    </View></View></Modal>
    <Modal visible={leaving} transparent animationType="fade" onRequestClose={() => setLeaving(false)}><View style={ui.sheetBackdrop}><View style={ui.sheet}>
      <StoryText display size={35}>{terminal ? 'Back to the house?' : 'Leave the case screen?'}</StoryText><StoryText>{state.status === 'won' ? 'Your game is saved in history.' : state.status === 'failed' ? 'You can still reveal this chapter and continue before leaving.' : exploring ? 'Your board is saved. The clock is off, but your family may still need your station.' : state.status === 'aborted' ? 'Choose another room whenever you are ready.' : 'Your board is saved, but the case clock keeps running. Other players may still need your station.'}</StoryText>
      <StoryButton label="Stay here" accent={accent} onPress={() => setLeaving(false)} /><StoryButton label="Go to home" secondary onPress={goHome} />
      {runtime.isHost && !terminal ? <StoryButton label="End this case for everyone" secondary onPress={() => { setLeaving(false); void run(runtime.abort); }} /> : null}
    </View></View></Modal>
  </ScreenShell>;
}

function StoryEnding({ state, view, wholeRoom, isHost, onHome, onReplay, onReveal, onClub, busy }: { state: StoryState; view: StoryPlayerView; wholeRoom: ReturnType<typeof getStoryRoom>; isHost: boolean; onHome(): void; onReplay(): void; onReveal(): void; onClub(): void; busy: boolean }) {
  const won = state.status === 'won';
  const assisted = state.assistedStages.length > 0;
  const chapter = wholeRoom.stages[state.stageIndex];
  return <View style={{ gap: 20 }}>
    <View style={{ height: 220, overflow: 'hidden', borderRadius: 18 }}><CaseArtwork caseId={state.roomId} /><View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: STORY_BG + 'DC', padding: 18 }}><StoryText size={12} color={view.room.accent} strong style={ui.kicker}>{won ? assisted ? 'STORY EXPLORED · TOGETHER' : 'CASE CLOSED · TOGETHER' : state.status === 'aborted' ? 'CASE ENDED' : 'YOUR STORY CAN CONTINUE'}</StoryText><StoryText display size={43}>{won ? assisted ? 'You uncovered the story.' : 'You changed the ending.' : state.status === 'aborted' ? 'A lead for another night.' : 'Let’s untangle it.'}</StoryText></View></View>
    <StoryText size={17}>{won ? wholeRoom.ending : state.feedback}</StoryText>
    <View style={ui.spread}><StoryText>{state.solvedStages.length} solved · {state.assistedStages.length} revealed</StoryText><StoryText>{state.attemptsUsed} wrong plans</StoryText></View>
    {state.status === 'failed' ? <View style={{ gap: 14, backgroundColor: '#22343F', padding: 18, borderRadius: 16 }}>
      <StoryText size={12} strong color={view.room.accent}>CHAPTER {state.stageIndex + 1}</StoryText><StoryText strong size={21}>{chapter.title}</StoryText>
      <StoryText size={14}>Reveal this chapter to understand the answer, then play the next one. Later answers stay hidden.</StoryText>
      {isHost ? <StoryButton label="Reveal this chapter" icon="eye-outline" accent={view.room.accent} disabled={busy} onPress={onReveal} /> : <StoryNotice>Ask your host to reveal this chapter. Everyone will see the explanation before continuing.</StoryNotice>}
    </View> : null}
    {won && state.assistedStages.includes(state.stageIndex) ? <ChapterSolution stage={chapter} accent={view.room.accent} /> : null}
    {won && assisted ? <StoryNotice>This assisted story is in your game history. It does not add leaderboard wins or a timed escape.</StoryNotice> : null}
    {won ? <StoryButton label={assisted ? 'See our game history' : 'See our Family Club'} icon="people-outline" accent={view.room.accent} onPress={onClub} /> : null}
    <StoryButton label="Choose another room" accent={view.room.accent} onPress={onHome} />
    {isHost ? <StoryButton label="Replay this case" secondary disabled={busy} onPress={onReplay} /> : null}
    <StoryText size={12} color="#9FB4C0">These rooms keep their stories. Try a different machine build, or open Case Forge for a generated case.</StoryText>
  </View>;
}

function ChapterSolution({ stage, accent }: { stage: StoryStage; accent: string }) {
  const [showClues, setShowClues] = useState(false);
  return <View style={{ gap: 14, backgroundColor: '#22343F', padding: 18, borderRadius: 16 }}>
    <StoryText strong size={19}>How the clues fit</StoryText>
    {stage.answer.map((answer, slot) => <View key={stage.slots[slot].id} style={{ gap: 3, borderLeftWidth: 2, borderColor: accent, paddingLeft: 12 }}>
      <StoryText size={12} color="#AFC1CB">{stage.slots[slot].label}</StoryText><StoryText strong size={15}>{stage.options.find(option => option.id === answer)?.label ?? answer}</StoryText>
    </View>)}
    <StoryText size={15}>{stage.explanation}</StoryText>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showClues }} onPress={() => setShowClues(!showClues)} style={[ui.spread, { minHeight: 46 }]}>
      <StoryText strong size={14} color={accent}>{showClues ? 'Hide everyone’s clues' : 'Read everyone’s clues'}</StoryText><Ionicons name={showClues ? 'chevron-up' : 'chevron-down'} size={20} color={accent} />
    </Pressable>
    {showClues ? stage.clues.map(clue => <View key={clue.id} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#3E535E' }}>
      <StoryText strong>{clue.title}</StoryText>{clue.lines.map((line, index) => <StoryText key={index} size={14} color="#CDD9DF">{line}</StoryText>)}
      {clue.observations?.flatMap(observation => observation.lines.map((line, index) => <StoryText key={`${observation.probeId}:${index}`} size={14} color="#CDD9DF">{line}</StoryText>))}
    </View>) : null}
  </View>;
}

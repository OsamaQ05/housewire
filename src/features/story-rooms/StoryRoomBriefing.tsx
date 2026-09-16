import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { ScreenShell } from '@/src/components';
import { CaseArtwork } from '@/src/components/CaseArtwork';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { getStoryRoom } from './catalog';
import { StoryRoomSkin, useRoomPresentation } from './room-presentation';
import { StoryButton, StoryIconButton, StoryNotice, StoryText, STORY_BG, ui } from './story-ui';
import type { StoryRoomId } from './types';
import { useStoryRoom } from './use-story-room';

export function StoryRoomBriefing({ roomId }: { roomId: StoryRoomId }) {
  return <StoryRoomSkin roomId={roomId}><BriefingContent roomId={roomId} /></StoryRoomSkin>;
}
function BriefingContent({ roomId }: { roomId: StoryRoomId }) {
  const look = useRoomPresentation()!;
  const router = useRouter();
  const room = getStoryRoom(roomId);
  const runtime = useStoryRoom(roomId);
  const [starting, setStarting] = useState(false);
  const entered = useRef(false);
  const active = runtime.state?.status === 'playing' || runtime.state?.status === 'stage-solved';
  const resume = () => {
    useHousewireStore.getState().startMission();
    router.replace('/mission');
  };
  useEffect(() => {
    if (entered.current || !runtime.shared || runtime.isHost || !active || !runtime.receivedOperationId || runtime.receivedOperationId !== runtime.state?.operationId) return;
    entered.current = true;
    useHousewireStore.getState().startMission();
    router.replace('/mission');
  }, [active, router, runtime.isHost, runtime.receivedOperationId, runtime.shared, runtime.state?.operationId]);
  const begin = async () => {
    if (starting) return;
    setStarting(true);
    try { if (await runtime.begin()) resume(); } finally { setStarting(false); }
  };
  return <ScreenShell style={[ui.screen, { backgroundColor: look.background }]} padded={false} texture={false}>
    <ScrollView contentContainerStyle={[ui.content, { paddingBottom: 35 }]} showsVerticalScrollIndicator={false}>
      <View style={ui.spread}><StoryIconButton icon="chevron-back" label="Back to game night" onPress={() => router.replace('/home')} /><StoryText size={12} strong color={room.accent} style={ui.kicker}>THE CASE FILE</StoryText><StoryText size={12}>{runtime.shared ? 'PLAY TOGETHER' : 'ONE PHONE'}</StoryText></View>
      <View style={{ height: 290, overflow: 'hidden', borderRadius: 22 }}><CaseArtwork caseId={roomId} /><View style={{ backgroundColor: STORY_BG + 'D9', padding: 20, position: 'absolute', left: 0, right: 0, bottom: 0, gap: 5 }}><StoryText size={12} color={room.accent} style={ui.kicker}>{room.subtitle}</StoryText><StoryText display size={58}>{room.title}</StoryText></View></View>
      <StoryText size={18}>{room.opening}</StoryText>
      <View style={ui.spread}><StoryText strong color={room.accent}>{room.stages.length} chapters · 2–4 people</StoryText><StoryText>{room.minutes} min</StoryText></View>
      <View style={{ gap: 15, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#3B505A', paddingVertical: 20 }}>
        {[
          ['documents-outline', roomId === 'night-glass' ? 'Your glass. One shared picture.' : 'You see different pieces.', roomId === 'night-glass' ? 'Start by turning colored layers to make the house. No riddle or code to unlock first.' : 'Describe what you see. Someone else has the piece you need.'],
          ['grid-outline', 'Everyone gets a part.', 'Controls are shared automatically across 2, 3, or 4 phones. Only your own pieces respond to your taps.'],
          ['radio-outline', runtime.shared ? 'Keep talking.' : 'Trying it on one phone?', runtime.shared ? 'Use House Line for voice notes to everyone or just one teammate.' : 'Switch between Your phone and Partner’s phone to try both sides.'],
        ].map(([icon, title, body]) => <View key={title} style={[ui.row, { alignItems: 'flex-start' }]}><Ionicons name={icon as 'documents-outline'} size={25} color={room.accent} /><View style={{ flex: 1, gap: 4 }}><StoryText strong>{title}</StoryText><StoryText size={13} color="#B4C7D0">{body}</StoryText></View></View>)}
      </View>
      <StoryText size={13} color={look.muted}>Building, exploring and moving things are free to try. Submitted puzzle answers share five mistakes. Stuck? Ask the guide, or reveal a chapter and continue without scoring.</StoryText>
      {runtime.shared ? <View style={{ gap: 9 }}><StoryText size={12} color={room.accent} strong style={ui.kicker}>CONNECTED STATIONS</StoryText>{runtime.connectedPlayers.map(player => <View key={player.id} style={ui.row}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: room.accent }} /><StoryText>{player.name}{player.id === runtime.localId ? ' · you' : ''}</StoryText></View>)}{runtime.connectedPlayers.length < 2 ? <StoryNotice>At least one other phone needs to join from the lobby before you can start.</StoryNotice> : null}</View> : null}
      {runtime.error ? <StoryNotice danger>{runtime.error}</StoryNotice> : null}
      {!runtime.hydrated ? <ActivityIndicator color={room.accent} /> : <>
        {active ? <StoryButton label="Return to the running case" accent={room.accent} onPress={resume} /> : null}
        {runtime.isHost ? <StoryButton label={starting ? 'Opening the case…' : active ? 'Start a fresh case' : runtime.shared ? 'Start together' : 'Open one-phone rehearsal'} icon="arrow-forward" accent={room.accent} secondary={active} disabled={starting || (runtime.shared && (runtime.connectionState !== 'connected' || runtime.connectedPlayers.length < 2))} onPress={() => { void begin(); }} /> : <StoryNotice>Your host will start the case. Keep this screen open—your private evidence will arrive here.</StoryNotice>}
      </>}
      <StoryText size={12} color="#8FA9B6">Camera and microphone are optional. Permission is requested only when you choose to use them.</StoryText>
    </ScrollView>
  </ScreenShell>;
}

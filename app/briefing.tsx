import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  BreakerButton,
  GlyphMark,
  OperationalLabel,
  RoleSigil,
  ScreenShell,
} from '@/src/components';
import { missions, roleCopy } from '@/src/data/campaigns';
import {
  generateLine13Game,
  line13SeedFromCode,
  type Line13Game,
} from '@/src/domain/line-13-game';
import {
  useHousewireSessionContext,
  useSharedMissionCoordinator,
} from '@/src/features/session';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore, type CrewNode, type MissionId } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';
import { RetiredStoryRoom } from '@/src/features/story-rooms/RetiredStoryRoom';
import { StoryRoomBriefing } from '@/src/features/story-rooms/StoryRoomBriefing';
import { isStoryRoomId } from '@/src/features/story-rooms/types';

export default function BriefingScreen() {
  const selectedMission = useHousewireStore((state) => state.selectedMission);
  if (isStoryRoomId(selectedMission)) return <StoryRoomBriefing roomId={selectedMission} />;
  if (selectedMission === 'dead-air') return <RetiredStoryRoom />;
  return <Line13BriefingScreen />;
}

function Line13BriefingScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const selectedMission = useHousewireStore((state) => state.selectedMission);
  const sessionMode = useHousewireStore((state) => state.sessionMode);
  const sessionCode = useHousewireStore((state) => state.sessionCode);
  const localNodeId = useHousewireStore((state) => state.localNodeId);
  const crew = useHousewireStore((state) => state.crew);
  const rooms = useHousewireStore((state) => state.rooms);
  const startMission = useHousewireStore((state) => state.startMission);
  const shared = useSharedMissionCoordinator();
  const houseSession = useHousewireSessionContext();
  const publishSessionEvent = houseSession.publish;
  const isSharedLine = sessionMode === 'lan' && selectedMission === 'line-13';
  const mission = missions.find((item) => item.id === selectedMission) ?? missions[0];
  const localNode = crew.find((node) => node.id === localNodeId) ?? crew[0];
  const activeCrew = crew.filter((node) => node.connected).slice(0, 4);
  const gameNodeIds = useMemo(() => {
    const ids = isSharedLine ? houseSession.liveNodeIds : activeCrew.map((node) => node.id);
    const stable = [...new Set(ids)].sort((left, right) => left.localeCompare(right));
    return stable.length >= 2 ? stable : [stable[0] ?? 'local', 'sim-backup'];
  }, [activeCrew, houseSession.liveNodeIds, isSharedLine]);
  const game = useMemo(
    () => generateLine13Game(line13SeedFromCode(sessionCode ?? 'LINE13'), gameNodeIds),
    [gameNodeIds, sessionCode],
  );
  const [revealed, setRevealed] = useState(false);
  const [safe, setSafe] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const relayNow = nowTick + (houseSession.clockEstimate?.offsetMs ?? 0);
  const enteredMissionRef = useRef(false);
  const locallyReady = revealed && safe;
  const readyByNode = useMemo(() => {
    const states = new Map<string, { at: number; ready: boolean }>();
    for (const item of houseSession.feed) {
      if (item.event.kind === 'node.ready' && item.senderId === item.event.nodeId) {
        states.set(item.event.nodeId, { at: item.serverTime, ready: item.event.ready });
      }
    }
    if (isSharedLine) states.set(houseSession.localNodeId, { at: relayNow, ready: locallyReady });
    return states;
  }, [houseSession.feed, houseSession.localNodeId, isSharedLine, locallyReady, relayNow]);
  const everyLiveNodeReady =
    houseSession.liveNodeIds.length >= 2 &&
    houseSession.liveNodeIds.every((nodeId) => {
      const state = readyByNode.get(nodeId);
      return state?.ready === true && relayNow - state.at <= 12_000;
    });
  const role = roleCopy[localNode?.role ?? 'relay'];

  useEffect(() => {
    if (
      !isSharedLine ||
      !shared.startedAt ||
      !shared.liveNodeIds.includes(localNodeId) ||
      !revealed ||
      !safe ||
      enteredMissionRef.current
    ) {
      return;
    }
    enteredMissionRef.current = true;
    play('relay', 0.65);
    startMission();
    router.replace('/mission');
  }, [isSharedLine, localNodeId, play, revealed, router, safe, shared.liveNodeIds, shared.startedAt, startMission]);

  useEffect(() => {
    if (!starting || shared.startedAt) return;
    const timeout = setTimeout(() => {
      setStarting(false);
      setStartError('The call did not start. Check the connection and try again.');
    }, 5_000);
    return () => clearTimeout(timeout);
  }, [shared.startedAt, starting]);

  useEffect(() => {
    if (!isSharedLine || houseSession.connectionState !== 'connected') return;
    const publishReady = (ready: boolean) =>
      publishSessionEvent({
        kind: 'node.ready',
        nodeId: houseSession.localNodeId,
        ready,
      }).catch(() => undefined);
    void publishReady(locallyReady);
    const heartbeat = setInterval(() => void publishReady(locallyReady), 4_000);
    return () => {
      clearInterval(heartbeat);
      void publishReady(false);
    };
  }, [houseSession.connectionState, houseSession.localNodeId, isSharedLine, locallyReady, publishSessionEvent]);

  useEffect(() => {
    if (!isSharedLine) return;
    const interval = setInterval(() => setNowTick(Date.now()), 2_000);
    return () => clearInterval(interval);
  }, [isSharedLine]);

  const begin = async () => {
    setStartError(null);
    if (isSharedLine) {
      if (!shared.isHost || starting || !everyLiveNodeReady) return;
      setStarting(true);
      const opened = await shared.hostStart({
        seed: line13SeedFromCode(sessionCode ?? 'LINE13'),
      });
      if (!opened) {
        setStarting(false);
        setStartError(
          shared.connectionState !== 'connected'
            ? 'The phones lost their connection.'
            : 'LINE 13 needs at least two phones.',
        );
      }
      return;
    }
    enteredMissionRef.current = true;
    play('relay', 0.65);
    startMission();
    router.replace('/mission');
  };

  const readyCount = sessionMode === 'preview'
    ? activeCrew.length
    : [...readyByNode.values()].filter((state) => state.ready).length;

  return (
    <ScreenShell edgeWire="right" padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topline}>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.back}>
            <Text style={[styles.backText, { color: theme.colors.muted }]}>‹ Back</Text>
          </Pressable>
          <OperationalLabel tone={sessionMode === 'preview' ? 'warning' : 'ready'}>
            {sessionMode === 'preview' ? 'SOLO PREVIEW' : `${readyCount}/${houseSession.liveNodeIds.length || activeCrew.length} READY`}
          </OperationalLabel>
        </View>

        <ImageBackground
          imageStyle={styles.heroImage}
          resizeMode="cover"
          source={require('../assets/art/blackout-protocol.png')}
          style={styles.hero}
        >
          <View style={styles.heroShade} />
          <View style={styles.heroCopy}>
            <Text style={[styles.eyebrow, { color: mission.accent, fontFamily: theme.typography.families.monoMedium }]}>{mission.operation}</Text>
            <Text style={[styles.heroTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Describe. Don’t show.</Text>
            <View style={styles.threeRules}>
              <RuleStep index="1" label="Look" />
              <RuleStep index="2" label="Say what you see" />
              <RuleStep index="3" label="Act together" />
            </View>
          </View>
        </ImageBackground>

        <Pressable
          accessibilityHint="Shows or hides this player's private clue"
          accessibilityLabel={revealed ? 'Hide my clue' : 'Reveal my clue'}
          accessibilityRole="button"
          onPress={() => {
            setRevealed((current) => !current);
            play(revealed ? 'switch' : 'relay', 0.42);
          }}
          style={[
            styles.clue,
            {
              backgroundColor: revealed ? theme.colors.surface : mission.accent,
              borderColor: revealed ? theme.colors.draft : mission.accent,
            },
          ]}
        >
          {revealed ? (
            <PrivateClue
              crew={activeCrew}
              game={game}
              localNode={localNode}
              missionId={selectedMission}
              roleColor={role.color}
              roleInstruction={role.instruction}
              roleTitle={role.title}
            />
          ) : (
            <View style={styles.sealedClue}>
              <RoleSigil color={theme.colors.background} role={localNode?.role ?? 'relay'} size={74} />
              <View style={styles.sealCopy}>
                <OperationalLabel textStyle={{ color: theme.colors.background }}>FOR YOUR EYES ONLY</OperationalLabel>
                <Text style={[styles.sealTitle, { color: theme.colors.background, fontFamily: theme.typography.families.storyBold }]}>Reveal my clue</Text>
              </View>
              <Text style={[styles.sealArrow, { color: theme.colors.background }]}>↗</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.crewSection}>
          <View style={styles.sectionTop}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>The house</Text>
            <OperationalLabel tone="muted">{activeCrew.length} PHONES</OperationalLabel>
          </View>
          <View style={styles.crewRow}>
            {activeCrew.map((node) => {
              const nodeReady = sessionMode === 'preview' || readyByNode.get(node.id)?.ready === true;
              return (
                <View accessible accessibilityLabel={`${node.name}, ${nodeRoom(node, rooms)}, ${nodeReady ? 'ready' : 'waiting'}`} key={node.id} style={styles.crewMember}>
                  <View style={[styles.roomDoor, { borderColor: nodeReady ? theme.colors.ready : theme.colors.draft }]}>
                    <View style={[styles.roomLight, { backgroundColor: nodeReady ? theme.colors.ready : node.color }]} />
                    <Text style={[styles.crewInitials, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{node.initials}</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.crewName, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{node.name}</Text>
                </View>
              );
            })}
          </View>
          {sessionMode === 'preview' ? (
            <Text style={[styles.previewNote, { color: theme.colors.warning, fontFamily: theme.typography.families.bodyMedium }]}>Solo preview lets this phone visit every room.</Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: safe }}
          onPress={() => setSafe((current) => !current)}
          style={[styles.safety, { backgroundColor: safe ? theme.colors.ready : theme.colors.surface, borderColor: safe ? theme.colors.ready : theme.colors.draft }]}
        >
          <View style={[styles.safetyCheck, { borderColor: safe ? theme.colors.background : theme.colors.muted }]}>
            {safe ? <Text style={[styles.safetyTick, { color: theme.colors.background }]}>✓</Text> : null}
          </View>
          <View style={styles.safetyCopy}>
            <Text style={[styles.safetyTitle, { color: safe ? theme.colors.background : theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Clear floor. No stairs.</Text>
            <Text style={[styles.safetyText, { color: safe ? theme.colors.background : theme.colors.muted, fontFamily: theme.typography.families.body }]}>Phones can move safely between rooms.</Text>
          </View>
        </Pressable>

        <BreakerButton
          disabled={
            !revealed ||
            !safe ||
            (isSharedLine &&
              (!shared.isHost || shared.connectionState !== 'connected' || !everyLiveNodeReady || starting))
          }
          haptic="rigid"
          label={isSharedLine && !shared.isHost ? 'Ready — wait' : 'Answer the call'}
          loading={starting}
          onPress={() => void begin()}
          overline={startPrompt({ everyLiveNodeReady, isSharedLine, locallyReady, revealed, safe, sharedIsHost: shared.isHost })}
        />

        {startError ? (
          <View accessibilityLiveRegion="polite" style={[styles.errorBand, { borderColor: theme.colors.fault }]}>
            <OperationalLabel tone="fault">CALL MISSED</OperationalLabel>
            <Text style={[styles.errorText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{startError}</Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

function PrivateClue({
  crew,
  game,
  localNode,
  missionId,
  roleColor,
  roleInstruction,
  roleTitle,
}: {
  crew: CrewNode[];
  game: Line13Game;
  localNode: CrewNode | undefined;
  missionId: MissionId;
  roleColor: string;
  roleInstruction: string;
  roleTitle: string;
}) {
  const { theme } = useHousewireTheme();
  const localId = localNode?.id ?? game.nodeIds[0];
  const fragment = game.cipherFragments.find((item) => item.nodeId === localId);
  const decoder = game.decoderFragments.find((item) => item.nodeId === localId);

  return (
    <View style={styles.revealedClue}>
      <View style={styles.roleHeader}>
        <RoleSigil color={roleColor} role={localNode?.role ?? 'relay'} size={54} />
        <View style={styles.roleCopy}>
          <OperationalLabel textStyle={{ color: roleColor }}>YOUR ROLE</OperationalLabel>
          <Text style={[styles.roleTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{roleTitle.replace('THE ', '')}</Text>
        </View>
        <OperationalLabel tone="muted">TAP TO HIDE</OperationalLabel>
      </View>
      <Text style={[styles.roleInstruction, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{roleInstruction}</Text>

      {missionId === 'line-13' ? (
        <>
          {fragment?.positions.length ? (
            <View style={styles.clueGroup}>
              <OperationalLabel tone="wire">LISTEN FOR THESE</OperationalLabel>
              <View style={styles.symbolRow}>
                {fragment.positions.map((item) => (
                  <View key={`${item.index}-${item.glyph}`} style={[styles.symbolTile, { borderColor: theme.colors.draft }]}>
                    <GlyphMark color={theme.colors.text} glyph={item.glyph} size={48} />
                    <Text style={[styles.listenMark, { color: theme.colors.wire }]}>)))</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {decoder?.mappings.length ? (
            <View style={styles.clueGroup}>
              <OperationalLabel tone="warning">YOUR NUMBER KEY</OperationalLabel>
              <View style={styles.keyRow}>
                {decoder.mappings.map((item) => (
                  <View key={item.glyph} style={styles.keyPair}>
                    <GlyphMark color={theme.colors.warning} glyph={item.glyph} size={30} />
                    <Text style={[styles.equals, { color: theme.colors.faint }]}>=</Text>
                    <Text style={[styles.keyDigit, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{item.digit}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </>
      ) : (
        <Text style={[styles.fallbackClue, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{getFallbackInstruction(missionId, game, localNode, crew)}</Text>
      )}
    </View>
  );
}

function RuleStep({ index, label }: { index: string; label: string }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.ruleStep}>
      <Text style={[styles.ruleIndex, { color: theme.colors.wire, fontFamily: theme.typography.families.monoMedium }]}>{index}</Text>
      <Text style={[styles.ruleLabel, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
    </View>
  );
}

function startPrompt({
  everyLiveNodeReady,
  isSharedLine,
  locallyReady,
  revealed,
  safe,
  sharedIsHost,
}: {
  everyLiveNodeReady: boolean;
  isSharedLine: boolean;
  locallyReady: boolean;
  revealed: boolean;
  safe: boolean;
  sharedIsHost: boolean;
}): string {
  if (!revealed) return 'REVEAL YOUR CLUE';
  if (!safe) return 'CONFIRM A SAFE PATH';
  if (isSharedLine && !sharedIsHost) return locallyReady ? 'THE HOST WILL START' : 'GET READY';
  if (isSharedLine && !everyLiveNodeReady) return 'WAITING FOR THE HOUSE';
  return 'EVERY PHONE STARTS TOGETHER';
}

function getFallbackInstruction(
  missionId: MissionId,
  game: Line13Game,
  localNode: CrewNode | undefined,
  crew: CrewNode[],
): string {
  const localId = localNode?.id ?? game.nodeIds[0];
  if (missionId === 'dead-air') {
    const nextIndex = (game.nodeIds.indexOf(localId) + 1) % game.nodeIds.length;
    const nextNode = crew.find((node) => node.id === game.nodeIds[nextIndex]);
    return `Pass the current to ${nextNode?.name ?? 'the next player'}. First gate: ${game.decoder[game.cipher[0]]}.`;
  }
  return `You are phone ${String(localNode?.nodeNumber ?? 1).padStart(2, '0')}. Hold ${game.finalContacts[localId] ?? 'center contact'} when the tones align.`;
}

function nodeRoom(node: CrewNode, rooms: ReturnType<typeof useHousewireStore.getState>['rooms']): string {
  return rooms.find((room) => room.id === node.roomId)?.label ?? 'Unassigned room';
}

const styles = StyleSheet.create({
  back: { justifyContent: 'center', minHeight: 44, minWidth: 58 },
  backText: { fontSize: 16 },
  clue: { borderWidth: 1, minHeight: 178, overflow: 'hidden' },
  clueGroup: { gap: 9 },
  content: { flexGrow: 1, gap: 18, paddingBottom: 42, paddingHorizontal: 20, paddingTop: 4 },
  crewInitials: { fontSize: 18, letterSpacing: 0.8 },
  crewMember: { alignItems: 'center', flex: 1, gap: 6, minWidth: 58 },
  crewName: { fontSize: 12, maxWidth: 74 },
  crewRow: { flexDirection: 'row', gap: 8 },
  crewSection: { gap: 11 },
  equals: { fontSize: 14 },
  errorBand: { borderLeftWidth: 3, gap: 4, paddingLeft: 12, paddingVertical: 5 },
  errorText: { fontSize: 14, lineHeight: 20 },
  eyebrow: { fontSize: 10, letterSpacing: 2.1 },
  fallbackClue: { borderTopWidth: StyleSheet.hairlineWidth, fontSize: 13, lineHeight: 20, paddingTop: 15 },
  hero: { height: 240, justifyContent: 'flex-end', marginHorizontal: -20, overflow: 'hidden' },
  heroCopy: { gap: 8, padding: 20 },
  heroImage: { opacity: 0.7 },
  heroShade: { backgroundColor: 'rgba(7,8,6,0.54)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  heroTitle: { fontSize: 46, lineHeight: 44, maxWidth: 310 },
  keyDigit: { fontSize: 28, lineHeight: 30 },
  keyPair: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  keyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  listenMark: { bottom: 4, fontSize: 9, letterSpacing: -1, position: 'absolute', right: 5 },
  previewNote: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  revealedClue: { gap: 16, padding: 16 },
  roleCopy: { flex: 1, gap: 1 },
  roleHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  roleInstruction: { fontSize: 14, lineHeight: 20 },
  roleTitle: { fontSize: 30, lineHeight: 31 },
  roomDoor: { alignItems: 'center', borderRadius: 3, borderWidth: 1, height: 58, justifyContent: 'center', overflow: 'hidden', width: 50 },
  roomLight: { height: 4, left: 7, position: 'absolute', right: 7, top: 0 },
  ruleIndex: { fontSize: 10 },
  ruleLabel: { fontSize: 12 },
  ruleStep: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  safety: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 13, minHeight: 70, padding: 13 },
  safetyCheck: { alignItems: 'center', borderWidth: 1, height: 26, justifyContent: 'center', width: 26 },
  safetyCopy: { flex: 1, gap: 2 },
  safetyText: { fontSize: 12, lineHeight: 17 },
  safetyTick: { fontSize: 16, fontWeight: '700' },
  safetyTitle: { fontSize: 15 },
  sealArrow: { fontSize: 28 },
  sealCopy: { flex: 1, gap: 3 },
  sealedClue: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 16, minHeight: 176, padding: 18 },
  sealTitle: { fontSize: 32, lineHeight: 33 },
  sectionTitle: { fontSize: 27, lineHeight: 28 },
  sectionTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  symbolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  symbolTile: { alignItems: 'center', borderWidth: 1, height: 70, justifyContent: 'center', width: 70 },
  threeRules: { flexDirection: 'row', gap: 14 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});

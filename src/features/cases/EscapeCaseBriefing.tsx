import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { BreakerButton, OperationalLabel, ScreenShell } from '@/src/components';
import {
  compileEscapeCase,
  escapeCaseSeedFromCode,
  type CompiledEscapeCase,
  type EscapeCaseId,
} from '@/src/domain/escape-case-compiler';
import {
  useEscapeCaseCoordinator,
  useHousewireSessionContext,
} from '@/src/features/session';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

const CASE_ART: Readonly<Record<EscapeCaseId, number>> = {
  'dead-air': require('@/assets/art/dead-air-case.png'),
  'night-glass': require('@/assets/art/night-glass-case.png'),
};

const CASE_COPY = {
  'dead-air': {
    accent: '#C8F26A',
    duration: '18 MINUTES',
    eyebrow: 'BLACKLINE FILE 02 · THE QUIET MACHINE',
    rules: [
      ['ear-outline', 'Listen alone'],
      ['mic-outline', 'Route one word'],
      ['phone-portrait-outline', 'Become the countertone'],
    ] as const,
    title: 'The walls found a voice.',
  },
  'night-glass': {
    accent: '#9AE9F5',
    duration: '18 MINUTES',
    eyebrow: 'BLACKLINE FILE 03 · THE RED CORRIDOR',
    rules: [
      ['scan-outline', 'Look through glass'],
      ['navigate-outline', 'Rebuild the impossible map'],
      ['git-merge-outline', 'Fold it together'],
    ] as const,
    title: 'The camera sees another house.',
  },
} as const;

export function EscapeCaseBriefing({ missionId }: { missionId: EscapeCaseId }) {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const sessionMode = useHousewireStore((state) => state.sessionMode);
  const sessionCode = useHousewireStore((state) => state.sessionCode);
  const crew = useHousewireStore((state) => state.crew);
  const localNodeId = useHousewireStore((state) => state.localNodeId);
  const startMission = useHousewireStore((state) => state.startMission);
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const houseSession = useHousewireSessionContext();
  const sessionConnectionState = houseSession.connectionState;
  const sessionPublish = houseSession.publish;
  const coordinator = useEscapeCaseCoordinator(missionId);
  const [revealed, setRevealed] = useState(false);
  const [safe, setSafe] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string>();
  const [clock, setClock] = useState(Date.now());
  const enteredRef = useRef(false);
  const shared = sessionMode === 'lan';
  const copy = CASE_COPY[missionId];
  const nodeIds = useMemo(() => {
    const source = shared
      ? houseSession.liveNodeIds
      : crew.filter((node) => node.connected).map((node) => node.id);
    const stable = [...new Set(source)].sort((left, right) => left.localeCompare(right)).slice(0, 4);
    return stable.length >= 2 ? stable : [stable[0] ?? localNodeId, 'sim-backup'];
  }, [crew, houseSession.liveNodeIds, localNodeId, shared]);
  const game = useMemo(
    () => coordinator.game ?? compileEscapeCase(
      missionId,
      escapeCaseSeedFromCode(sessionCode ?? missionId),
      nodeIds,
    ),
    [coordinator.game, missionId, nodeIds, sessionCode],
  );
  const role = roleFor(game, localNodeId);
  const locallyReady = revealed && safe;
  const relayNow = clock + (houseSession.clockEstimate?.offsetMs ?? 0);
  const readyByNode = useMemo(() => {
    const readiness = new Map<string, { ready: boolean; at: number }>();
    for (const item of houseSession.feed) {
      if (item.event.kind === 'node.ready' && item.senderId === item.event.nodeId) {
        readiness.set(item.event.nodeId, { ready: item.event.ready, at: item.serverTime });
      }
    }
    if (shared) readiness.set(localNodeId, { ready: locallyReady, at: relayNow });
    return readiness;
  }, [houseSession.feed, localNodeId, locallyReady, relayNow, shared]);
  const everyoneReady =
    nodeIds.length >= 2 &&
    nodeIds.every((nodeId) => {
      const state = readyByNode.get(nodeId);
      return state?.ready === true && relayNow - state.at <= 12_000;
    });

  useEffect(() => {
    if (!shared || sessionConnectionState !== 'connected') return;
    const announce = (ready: boolean) =>
      sessionPublish({ kind: 'node.ready', nodeId: localNodeId, ready }).catch(() => undefined);
    void announce(locallyReady);
    const heartbeat = setInterval(() => void announce(locallyReady), 4_000);
    return () => {
      clearInterval(heartbeat);
      void announce(false);
    };
  }, [localNodeId, locallyReady, sessionConnectionState, sessionPublish, shared]);

  useEffect(() => {
    if (!shared) return;
    const interval = setInterval(() => setClock(Date.now()), 2_000);
    return () => clearInterval(interval);
  }, [shared]);

  useEffect(() => {
    if (
      !shared ||
      coordinator.startedAt === undefined ||
      !coordinator.liveNodeIds?.includes(localNodeId) ||
      !locallyReady ||
      enteredRef.current
    ) return;
    enteredRef.current = true;
    startMission();
    play(missionId === 'dead-air' ? 'deadAirOpen' : 'nightGlassOpen', 0.72);
    router.replace('/mission');
  }, [coordinator.liveNodeIds, coordinator.startedAt, localNodeId, locallyReady, missionId, play, router, shared, startMission]);

  const begin = async () => {
    setStartError(undefined);
    if (shared) {
      if (!coordinator.isHost || !everyoneReady || starting) return;
      setStarting(true);
      const opened = await coordinator.hostStart({
        seed: escapeCaseSeedFromCode(`${missionId}:${sessionCode ?? 'BLACKLINE'}`),
      });
      if (!opened) {
        setStartError('The case could not reach every phone. Reconnect the missing node and try again.');
        setStarting(false);
      }
      return;
    }
    enteredRef.current = true;
    startMission();
    play(missionId === 'dead-air' ? 'deadAirOpen' : 'nightGlassOpen', 0.72);
    router.replace('/mission');
  };

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.topline}>
          <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={10} onPress={() => router.back()}>
            <Ionicons color={theme.colors.text} name="arrow-back" size={22} />
          </Pressable>
          <OperationalLabel tone={shared ? 'ready' : 'warning'}>
            {shared ? `${[...readyByNode.values()].filter((item) => item.ready).length}/${nodeIds.length} READY` : 'SOLO REHEARSAL'}
          </OperationalLabel>
        </View>

        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(500)} style={[styles.hero, { borderColor: copy.accent }]}>
          <Image contentFit="cover" source={CASE_ART[missionId]} style={styles.heroImage} />
          <View style={styles.heroShade} />
          <View style={styles.heroCopy}>
            <Text style={[styles.eyebrow, { color: copy.accent, fontFamily: theme.typography.families.monoMedium }]}>{copy.eyebrow}</Text>
            <Text style={[styles.title, { color: '#F7F1E5', fontFamily: theme.typography.families.storyBold }]}>{copy.title}</Text>
            <Text style={[styles.duration, { color: '#D8CEBA', fontFamily: theme.typography.families.monoMedium }]}>{copy.duration} · {nodeIds.length} PHONES</Text>
          </View>
        </Animated.View>

        <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(100).duration(420)} style={styles.ruleRail}>
          {copy.rules.map(([icon, label], index) => (
            <View key={label} style={styles.rule}>
              <View style={[styles.ruleIcon, { borderColor: copy.accent }]}>
                <Ionicons color={copy.accent} name={icon} size={19} />
              </View>
              <Text style={[styles.ruleIndex, { color: theme.colors.faint, fontFamily: theme.typography.families.mono }]}>0{index + 1}</Text>
              <Text style={[styles.ruleText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
            </View>
          ))}
        </Animated.View>

        <Pressable
          accessibilityHint="Reveals only this phone's starting instrument"
          accessibilityRole="button"
          onPress={() => {
            setRevealed((current) => !current);
            play(revealed ? 'switch' : 'relay', 0.42);
          }}
          style={[
            styles.packet,
            {
              backgroundColor: revealed ? theme.colors.surface : copy.accent,
              borderColor: revealed ? theme.colors.draft : copy.accent,
            },
          ]}
        >
          {revealed ? (
            <View style={styles.packetOpen}>
              <View style={styles.packetTopline}>
                <OperationalLabel textStyle={{ color: copy.accent }}>YOUR INSTRUMENT</OperationalLabel>
                <Ionicons color={copy.accent} name={missionId === 'dead-air' ? 'radio-outline' : 'aperture-outline'} size={25} />
              </View>
              <Text style={[styles.roleTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{role.title}</Text>
              <Text style={[styles.roleInstruction, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{role.instruction}</Text>
              <View style={[styles.privacyLine, { borderColor: theme.colors.draft }]}>
                <Ionicons color={copy.accent} name="eye-off-outline" size={17} />
                <Text style={[styles.privacyText, { color: theme.colors.muted, fontFamily: theme.typography.families.mono }]}>{role.privateNote}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.packetClosed}>
              <Ionicons color="#07100D" name="finger-print-outline" size={34} />
              <View style={styles.packetClosedCopy}>
                <Text style={[styles.packetOverline, { color: '#07100D', fontFamily: theme.typography.families.monoMedium }]}>ONE PHONE · ONE INSTRUMENT</Text>
                <Text style={[styles.packetTitle, { color: '#07100D', fontFamily: theme.typography.families.displayHeavy }]}>Reveal mine</Text>
              </View>
              <Ionicons color="#07100D" name="arrow-forward" size={25} />
            </View>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: safe }}
          onPress={() => setSafe((current) => !current)}
          style={[styles.safety, { borderColor: safe ? theme.colors.ready : theme.colors.draft }]}
        >
          <Ionicons color={safe ? theme.colors.ready : theme.colors.muted} name={safe ? 'checkmark-circle' : 'ellipse-outline'} size={25} />
          <View style={styles.safetyCopy}>
            <Text style={[styles.safetyTitle, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Stations are clear and well lit.</Text>
            <Text style={[styles.safetyBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>No stairs, running, darkness, or looking at a screen while moving.</Text>
          </View>
        </Pressable>

        <BreakerButton
          disabled={!locallyReady || (shared && (!coordinator.isHost || !everyoneReady || starting))}
          haptic="rigid"
          label={shared && !coordinator.isHost ? 'Ready — wait for host' : `Open ${missionId === 'dead-air' ? 'the channel' : 'the corridor'}`}
          loading={starting}
          onPress={() => void begin()}
          overline={shared ? coordinator.isHost ? everyoneReady ? 'EVERY PHONE IS ARMED' : 'WAITING FOR THE HOUSE' : 'HOST CONTROLS THE CLOCK' : 'ALL ROLES RUN ON THIS PHONE'}
        />

        {startError ? (
          <View style={[styles.error, { borderColor: theme.colors.fault }]}>
            <OperationalLabel tone="fault">CONNECTION LOST</OperationalLabel>
            <Text style={[styles.errorText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{startError}</Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

function roleFor(game: CompiledEscapeCase, nodeId: string) {
  if (game.id === 'dead-air') {
    if (nodeId === game.privateChannel.callerNodeId) {
      return { title: 'THE CALLER', instruction: 'You inject one short word into the service line. The tuner can open the gate, but cannot hear what you send.', privateNote: 'VOICE BURSTS ARE DELIVERED ONCE, THEN DELETED' };
    }
    if (nodeId === game.privateChannel.receiverNodeId) {
      return { title: 'THE RECEIVER', instruction: 'Only your phone can hear the private service word. Decode it without showing your screen.', privateNote: 'THE TUNER RECEIVES STATUS, NEVER AUDIO' };
    }
    return { title: 'THE TUNER', instruction: 'You open ducts and operate the Quiet Machine. The private channel deliberately excludes this phone.', privateNote: 'YOU WILL SEE A CLOSED-CHANNEL PULSE ONLY' };
  }
  const firstRound = game.parallaxRounds[0];
  if (nodeId === firstRound.watcherNodeId) {
    return { title: 'THE WATCHER', instruction: 'Your camera sees bearings that the frame and hinge cannot. Say what moves inside the glass.', privateNote: 'CAMERA CLUES ARE PROCESSED LIVE AND NEVER SAVED' };
  }
  if (nodeId === firstRound.frameNodeId) {
    return { title: 'THE FRAME', instruction: 'Your screen becomes a physical doorway for another phone to scan. Keep it bright and still.', privateNote: 'THE MARKER CHANGES ON EVERY RUN' };
  }
  return { title: 'THE HINGE', instruction: 'Your phone tilts the door seen on somebody else’s camera. You control a view you cannot see.', privateNote: 'MOTION TRACES STAY ON THIS PHONE' };
}

const styles = StyleSheet.create({
  duration: { fontSize: 9, letterSpacing: 1.3 },
  error: { borderLeftWidth: 3, gap: 4, paddingLeft: 12 },
  errorText: { fontSize: 14, lineHeight: 20 },
  eyebrow: { fontSize: 8, letterSpacing: 1.3, lineHeight: 13 },
  hero: { borderBottomWidth: 3, height: 300, justifyContent: 'flex-end', marginHorizontal: -20, overflow: 'hidden' },
  heroCopy: { gap: 7, padding: 20 },
  heroImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  heroShade: { backgroundColor: 'rgba(2,5,5,0.38)', position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  packet: { borderWidth: 1, minHeight: 146, overflow: 'hidden' },
  packetClosed: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 14, padding: 18 },
  packetClosedCopy: { flex: 1 },
  packetOpen: { gap: 8, padding: 17 },
  packetOverline: { fontSize: 8, letterSpacing: 1.2 },
  packetTitle: { fontSize: 35, lineHeight: 36 },
  packetTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  page: { gap: 18, paddingBottom: 42, paddingHorizontal: 20, paddingTop: 10 },
  privacyLine: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 8, marginTop: 5, paddingTop: 11 },
  privacyText: { flex: 1, fontSize: 8, letterSpacing: 0.65, lineHeight: 13 },
  roleInstruction: { fontSize: 15, lineHeight: 21 },
  roleTitle: { fontSize: 37, lineHeight: 37 },
  rule: { flex: 1, gap: 5 },
  ruleIcon: { alignItems: 'center', borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  ruleIndex: { fontSize: 8 },
  ruleRail: { flexDirection: 'row', gap: 12 },
  ruleText: { fontSize: 12, lineHeight: 16 },
  safety: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: 12, minHeight: 74, paddingVertical: 12 },
  safetyBody: { fontSize: 12, lineHeight: 17 },
  safetyCopy: { flex: 1, gap: 2 },
  safetyTitle: { fontSize: 14 },
  title: { fontSize: 43, lineHeight: 42, maxWidth: 330 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});

import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ScreenShell } from '@/src/components/ScreenShell';
import { assignFairEscapeRaceTeams } from '@/src/domain/team-escape-race';
import { makeCircuitRaceJoinTicket, useCircuitRaceRuntime } from '@/src/features/race';
import { deriveLanRelayUrl } from '@/src/features/session/use-housewire-session';
import { useCircuitRaceStore } from '@/src/store/use-circuit-race-store';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

const EMBER = '#FF6846';
const MINT = '#5FE0D0';

export default function RaceLobbyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ guest?: string }>();
  const { theme } = useHousewireTheme();
  const runtime = useCircuitRaceRuntime();
  const clearRace = useCircuitRaceStore((state) => state.clearRace);
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const sessionMode = useHousewireStore((state) => state.sessionMode);
  const storedRelay = useHousewireStore((state) => state.relayUrl);
  const sessionCode = useHousewireStore((state) => state.sessionCode);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const continuingToRaceRef = useRef(false);
  const mountedRef = useRef(true);
  const guest = params.guest === '1' || !runtime.isHost;
  const relayUrl = storedRelay ?? safeRelayUrl();
  const invite = useMemo(() => {
    if (guest || sessionMode !== 'lan' || !sessionCode || runtime.connectionState !== 'connected') return undefined;
    try {
      return makeCircuitRaceJoinTicket(sessionCode, relayUrl, Linking.createURL('race-join'));
    } catch {
      return undefined;
    }
  }, [guest, relayUrl, runtime.connectionState, sessionCode, sessionMode]);

  const assignments = useMemo(() => {
    // Guests do not own the host seed until the signed start arrives. Avoid
    // previewing a locally-computed roster that may disagree with the host.
    if (guest || runtime.lobbyParticipants.length < 2) return [];
    try {
      return assignFairEscapeRaceTeams(runtime.lobbyParticipants.map((node) => ({
        nodeId: node.id,
        label: node.label,
        skill: 5,
        simulated: false,
      })), ['ember', 'mint'], runtime.lobbyAssignmentSeed);
    } catch {
      return [];
    }
  }, [guest, runtime.lobbyAssignmentSeed, runtime.lobbyParticipants]);

  useEffect(() => {
    if (guest && runtime.snapshot) {
      continuingToRaceRef.current = true;
      router.replace('/race-play');
    }
  }, [guest, router, runtime.snapshot]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (continuingToRaceRef.current) return;
      clearRace();
      prepareSession('preview');
    };
  }, [clearRace, prepareSession]);

  const leaveLobby = () => {
    continuingToRaceRef.current = true;
    clearRace();
    prepareSession('preview');
    router.back();
  };

  const start = async () => {
    setStarting(true);
    setError(undefined);
    const result = await runtime.startLive({ countdownMs: 4_000 });
    if (!mountedRef.current) return;
    if (!result.started) {
      setError(result.reason === 'PLAYERS' ? 'Circuit Race needs exactly 2 phones (1v1) or 4 phones (2v2).' : 'The race could not start. Check the host connection.');
      setStarting(false);
      return;
    }
    if (result.undeliveredNodeIds.length) {
      setError('One phone missed the first signal. It will resync automatically.');
    }
    continuingToRaceRef.current = true;
    router.replace('/race-play');
  };

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Leave race lobby" hitSlop={10} onPress={leaveLobby}><Ionicons color={theme.colors.text} name="arrow-back" size={23} /></Pressable>
          <View style={styles.liveState}>
            <View style={[styles.liveLamp, { backgroundColor: runtime.connectionState === 'connected' ? theme.colors.ready : theme.colors.fault }]} />
            <Text style={[styles.liveText, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{runtime.connectionState === 'connected' ? 'START CLOCK ONLINE' : 'CONNECTING'}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.hero}>
          <Text style={[styles.kicker, { color: guest ? MINT : EMBER, fontFamily: theme.typography.families.monoMedium }]}>{guest ? 'YOU JOINED THE GRID' : 'HOSTING THE GRID'}</Text>
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{guest ? 'WAIT FOR THE DROP.' : 'BUILD TWO CREWS.'}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{guest ? 'The host will assign teams and start every phone together.' : 'Race with one guest for 1v1, or three guests for 2v2.'}</Text>
        </View>

        {!guest && invite ? (
          <View style={[styles.ticket, { backgroundColor: '#F2E9D5' }]}>
            <View style={styles.ticketCode}>
              <Text style={[styles.ticketLabel, { fontFamily: theme.typography.families.monoMedium }]}>RACE CODE</Text>
              <Text selectable style={[styles.code, { fontFamily: theme.typography.families.displayHeavy }]}>{sessionCode}</Text>
              <Text style={[styles.ticketHint, { fontFamily: theme.typography.families.body }]}>Open Circuit Race → Join crew → scan.</Text>
            </View>
            <View style={styles.qr}><QRCode backgroundColor="#F2E9D5" color="#0A0C0B" quietZone={4} size={124} value={invite} /></View>
          </View>
        ) : null}

        <View style={styles.crews}>
          <CrewColumn accent={EMBER} assignments={assignments} participants={runtime.lobbyParticipants} teamId="ember" title="EMBER" />
          <View style={styles.versus}><Text style={[styles.versusText, { color: theme.colors.faint, fontFamily: theme.typography.families.displayHeavy }]}>VS</Text></View>
          <CrewColumn accent={MINT} assignments={assignments} participants={runtime.lobbyParticipants} teamId="mint" title="MINT" />
        </View>

        <View style={[styles.brief, { borderColor: theme.colors.draft }]}>
          <Ionicons color="#F2C14E" name="information-circle-outline" size={21} />
          <Text style={[styles.briefText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>After the split, teams move to different rooms. You&apos;ll get the same four circuits and a private teammate line.</Text>
        </View>

        {error || runtime.lastError ? <View style={[styles.error, { borderColor: theme.colors.fault }]}><Text style={[styles.errorText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{error ?? runtime.lastError}</Text><Pressable onPress={runtime.reconnect}><Text style={[styles.retry, { color: MINT, fontFamily: theme.typography.families.monoMedium }]}>RETRY</Text></Pressable></View> : null}

        {guest ? (
          <View style={[styles.waiting, { borderColor: MINT }]}>
            <View style={[styles.waitingPulse, { backgroundColor: MINT }]} />
            <Text style={[styles.waitingText, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>HOST CONTROLS THE START</Text>
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !runtime.canHostStart || starting }} disabled={!runtime.canHostStart || starting} onPress={() => void start()} style={({ pressed }) => [styles.startButton, { backgroundColor: runtime.canHostStart ? EMBER : theme.colors.draft }, (!runtime.canHostStart || starting) && styles.disabled, pressed && styles.pressed]}>
            <View>
              <Text style={[styles.startMeta, { fontFamily: theme.typography.families.monoMedium }]}>{runtime.lobbyParticipants.length}/4 PHONES · {raceLobbyStatus(runtime.lobbyParticipants.length)}</Text>
              <Text style={[styles.startText, { fontFamily: theme.typography.families.displayHeavy }]}>{starting ? 'SENDING START…' : 'START 4-SECOND COUNTDOWN'}</Text>
            </View>
            <Ionicons color="#08100F" name="stopwatch" size={27} />
          </Pressable>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

function CrewColumn({ accent, assignments, participants, teamId, title }: { accent: string; assignments: ReturnType<typeof assignFairEscapeRaceTeams>; participants: readonly { id: string; label: string }[]; teamId: string; title: string }) {
  const { theme } = useHousewireTheme();
  const memberIds = assignments.find((assignment) => assignment.teamId === teamId)?.memberNodeIds ?? [];
  return (
    <View style={[styles.crew, { borderColor: accent }]}>
      <View style={[styles.crewTop, { backgroundColor: accent }]}><Text style={[styles.crewTitle, { fontFamily: theme.typography.families.displayHeavy }]}>{title}</Text></View>
      <View style={styles.crewMembers}>
        {memberIds.length ? memberIds.map((id) => <View key={id} style={styles.member}><View style={[styles.memberLamp, { backgroundColor: accent }]} /><Text numberOfLines={1} style={[styles.memberName, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{participants.find((node) => node.id === id)?.label ?? 'Phone'}</Text></View>) : <Text style={[styles.empty, { color: theme.colors.faint, fontFamily: theme.typography.families.mono }]}>WAITING…</Text>}
      </View>
    </View>
  );
}

function safeRelayUrl(): string { try { return deriveLanRelayUrl(); } catch { return 'ws://127.0.0.1:8787'; } }

function raceLobbyStatus(count: number): string {
  if (count < 2) return 'NEED ONE MORE';
  if (count === 3) return 'ADD ONE FOR FAIR 2V2';
  if (count === 2 || count === 4) return 'GRID READY';
  return 'GRID FULL';
}

const styles = StyleSheet.create({
  brief: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: 9, paddingVertical: 12 },
  briefText: { flex: 1, fontSize: 12, lineHeight: 17 },
  code: { color: '#0A0C0B', fontSize: 48, letterSpacing: 5, lineHeight: 48 },
  crew: { borderTopWidth: 4, borderWidth: 1, flex: 1, minHeight: 132 },
  crewMembers: { gap: 9, padding: 10 },
  crewTitle: { color: '#08100F', fontSize: 18, letterSpacing: 0.5 },
  crewTop: { alignItems: 'center', minHeight: 35, justifyContent: 'center' },
  crews: { alignItems: 'stretch', flexDirection: 'row', gap: 7 },
  disabled: { opacity: 0.36 },
  empty: { fontSize: 8, letterSpacing: 1, textAlign: 'center' },
  error: { alignItems: 'center', borderLeftWidth: 3, flexDirection: 'row', justifyContent: 'space-between', padding: 10 },
  errorText: { flex: 1, fontSize: 12 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerSpacer: { width: 23 },
  hero: { alignItems: 'center' },
  kicker: { fontSize: 8, letterSpacing: 1.5 },
  liveLamp: { borderRadius: 5, height: 8, width: 8 },
  liveState: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  liveText: { fontSize: 7, letterSpacing: 1.1 },
  member: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  memberLamp: { borderRadius: 4, height: 7, width: 7 },
  memberName: { flex: 1, fontSize: 12 },
  page: { flexGrow: 1, gap: 18, paddingBottom: 36, paddingHorizontal: 20, paddingTop: 12 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.993 }] },
  qr: { alignItems: 'center', justifyContent: 'center' },
  retry: { fontSize: 8, letterSpacing: 1 },
  startButton: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 74, paddingHorizontal: 16 },
  startMeta: { color: '#3D211B', fontSize: 7, letterSpacing: 1.1 },
  startText: { color: '#08100F', fontSize: 20, letterSpacing: 0.3 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 7, maxWidth: 350, textAlign: 'center' },
  ticket: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 13 },
  ticketCode: { flex: 1, gap: 2 },
  ticketHint: { color: '#51493C', fontSize: 10, lineHeight: 14 },
  ticketLabel: { color: '#6B5E46', fontSize: 7, letterSpacing: 1.2 },
  title: { fontSize: 44, lineHeight: 43, marginTop: 5, textAlign: 'center' },
  versus: { alignItems: 'center', justifyContent: 'center', width: 23 },
  versusText: { fontSize: 19 },
  waiting: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 62 },
  waitingPulse: { borderRadius: 6, height: 10, width: 10 },
  waitingText: { fontSize: 18, letterSpacing: 0.4 },
});

import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import {
  BreakerButton,
  OperationalLabel,
  RoleSigil,
  ScreenShell,
} from '@/src/components';
import { missions } from '@/src/data/campaigns';
import {
  advanceServerClockAnchor,
  deriveLanRelayUrl,
  estimateServerNow,
  makeJoinTicket,
  MAXIMUM_SESSION_FEED,
  useHousewireSessionContext,
  type LobbyProfileEvent,
  type ServerClockAnchor,
} from '@/src/features/session';
import {
  LOBBY_HEARTBEAT_INTERVAL_MS,
  LOBBY_ROLE_COLORS as ROLE_COLORS,
  LOBBY_ROLE_ORDER as ROLE_ORDER,
  isTrustedLobbyCommand,
  mergeLobbyCrewProfile,
  normaliseLiveCrew,
  reconcileLobbyCrewPresence,
} from '@/src/features/session/lobby-presence';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import type { TransportConnectionState } from '@/src/services/transport';
import { useHousewireStore, type CrewNode } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

const PREVIEW_NAMES = ['You', 'Mara', 'Samir', 'Inez'] as const;

export default function LobbyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ guest?: string; name?: string }>();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const houseSession = useHousewireSessionContext();
  const {
    clearError: clearSessionError,
    clockEstimate: sessionClockEstimate,
    connectionState: sessionConnectionState,
    error: sessionError,
    feed: sessionFeed,
    localNodeId: sessionLocalNodeId,
    publish: publishSessionEvent,
    reconnect: reconnectSession,
  } = houseSession;
  const rooms = useHousewireStore((state) => state.rooms);
  const crew = useHousewireStore((state) => state.crew);
  const selectedMission = useHousewireStore((state) => state.selectedMission);
  const sessionMode = useHousewireStore((state) => state.sessionMode);
  const sessionCode = useHousewireStore((state) => state.sessionCode);
  const storedRelayUrl = useHousewireStore((state) => state.relayUrl);
  const localNodeId = useHousewireStore((state) => state.localNodeId);
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const setCrew = useHousewireStore((state) => state.setCrew);
  const setLocalNodeId = useHousewireStore((state) => state.setLocalNodeId);
  const safeRooms = useMemo(() => rooms.filter((room) => room.safe), [rooms]);
  const mission = missions.find((item) => item.id === selectedMission) ?? missions[0];
  const isGuest = params.guest === '1';
  const relayUrl = storedRelayUrl ?? deriveLanRelayUrl();
  const joinTicket = useMemo(() => {
    if (
      sessionMode !== 'lan' ||
      isGuest ||
      !sessionCode ||
      sessionConnectionState !== 'connected'
    ) return null;
    try {
      return makeJoinTicket(
        sessionCode,
        relayUrl,
        selectedMission,
        Linking.createURL('join'),
      );
    } catch {
      return null;
    }
  }, [isGuest, relayUrl, selectedMission, sessionCode, sessionConnectionState, sessionMode]);
  const previewCrew = useMemo(() => buildPreviewCrew(safeRooms), [safeRooms]);
  const liveCrew = useMemo(() => crew.filter((node) => !node.simulated), [crew]);
  const connectedLiveCrew = useMemo(() => liveCrew.filter((node) => node.connected), [liveCrew]);
  const displayedCrew = sessionMode === 'preview' ? previewCrew : liveCrew;
  const effectiveLocalNodeId = isGuest ? localNodeId : 'local';
  const localNode = useMemo(
    () =>
      liveCrew.find((node) => node.id === effectiveLocalNodeId) ??
      buildLocalNode(safeRooms[0]?.id ?? 'living', params.name),
    [effectiveLocalNodeId, liveCrew, params.name, safeRooms],
  );
  const lobbyProfile = useMemo<LobbyProfileEvent>(
    () => ({
      kind: 'lobby.profile',
      nodeId: localNode.id,
      name: localNode.name,
    }),
    [localNode.id, localNode.name],
  );
  const connectionState: TransportConnectionState =
    sessionMode === 'lan' ? sessionConnectionState : 'idle';
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const connectionError = lobbyError ?? sessionError ?? null;
  const [starting, setStarting] = useState(false);
  const processedLobbyEventIdsRef = useRef(new Set<string>());
  const lastSeenAtServerByNodeIdRef = useRef(new Map<string, number>());
  const serverClockAnchorRef = useRef<ServerClockAnchor | undefined>(undefined);
  const previousConnectionStateRef = useRef<TransportConnectionState>('idle');

  useEffect(() => {
    if (!sessionCode) prepareSession(sessionMode);
  }, [prepareSession, sessionCode, sessionMode]);

  useEffect(() => {
    if (!isGuest && localNodeId !== 'local') setLocalNodeId('local');
  }, [isGuest, localNodeId, setLocalNodeId]);

  useEffect(() => {
    if (sessionMode !== 'lan') return;
    const physicalCrew = crew.filter((node) => !node.simulated);
    const hasLocalNode = physicalCrew.some((node) => node.id === effectiveLocalNodeId);
    if (physicalCrew.length !== crew.length || !hasLocalNode) {
      setCrew(normaliseLiveCrew(hasLocalNode ? physicalCrew : [localNode, ...physicalCrew], safeRooms));
    }
  }, [crew, effectiveLocalNodeId, localNode, safeRooms, sessionMode, setCrew]);

  useEffect(() => {
    processedLobbyEventIdsRef.current.clear();
    lastSeenAtServerByNodeIdRef.current.clear();
    serverClockAnchorRef.current = undefined;
    setLobbyError(null);
    if (sessionMode !== 'lan' || !sessionCode) return;
    const currentSafeRooms = useHousewireStore.getState().rooms.filter((room) => room.safe);
    const currentPhysicalCrew = useHousewireStore.getState().crew.filter((node) => !node.simulated);
    const resetConnectivity = reconcileLobbyCrewPresence(
      currentPhysicalCrew,
      lastSeenAtServerByNodeIdRef.current,
      0,
    );
    if (resetConnectivity !== currentPhysicalCrew) {
      useHousewireStore.getState().setCrew(normaliseLiveCrew(resetConnectivity, currentSafeRooms));
    }
  }, [relayUrl, sessionCode, sessionMode]);

  useEffect(() => {
    const previousState = previousConnectionStateRef.current;
    previousConnectionStateRef.current = connectionState;
    if (sessionMode === 'lan' && connectionState === 'connected' && previousState !== 'connected') {
      setLobbyError(null);
      clearSessionError();
      play('relay', 0.42);
    }
  }, [clearSessionError, connectionState, play, sessionMode]);

  useEffect(() => {
    if (sessionMode !== 'lan' || !sessionCode || connectionState !== 'connected') return;
    let active = true;
    const publishProfile = async () => {
      try {
        await publishSessionEvent(lobbyProfile);
      } catch (error: unknown) {
        if (!active) return;
        setLobbyError(error instanceof Error ? error.message : 'The lobby profile could not be sent.');
      }
    };
    void publishProfile();
    const heartbeat = setInterval(() => {
      void publishProfile();
    }, LOBBY_HEARTBEAT_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(heartbeat);
    };
  }, [connectionState, lobbyProfile, publishSessionEvent, sessionCode, sessionMode]);

  useEffect(() => {
    if (sessionMode !== 'lan' || !sessionCode) return;
    const receivedAt = Date.now();
    const latestItem = sessionFeed.at(-1);
    if (latestItem) {
      serverClockAnchorRef.current = advanceServerClockAnchor(
        serverClockAnchorRef.current,
        latestItem.serverTime,
        receivedAt,
      );
    }
    const unprocessed = sessionFeed.filter(
      (item) =>
        (item.event.kind === 'lobby.profile' || item.event.kind === 'lobby.command') &&
        !processedLobbyEventIdsRef.current.has(item.eventId),
    );
    if (unprocessed.length === 0) return;

    const serverNow = estimateServerNow(
      serverClockAnchorRef.current,
      receivedAt,
      sessionClockEstimate?.offsetMs,
    );
    let nextCrew: readonly CrewNode[] = useHousewireStore
      .getState()
      .crew.filter((node) => !node.simulated);
    let crewChanged = false;
    let shouldOpenCalibration = false;

    for (const item of unprocessed) {
      rememberLobbyEvent(processedLobbyEventIdsRef.current, item.eventId);
      if (item.event.kind === 'lobby.profile' && item.senderId === item.event.nodeId) {
        const lastSeen = lastSeenAtServerByNodeIdRef.current.get(item.event.nodeId) ?? 0;
        lastSeenAtServerByNodeIdRef.current.set(
          item.event.nodeId,
          Math.max(lastSeen, item.serverTime),
        );
        const merged = mergeLobbyCrewProfile(nextCrew, item.event, item.senderId);
        if (merged !== nextCrew) {
          nextCrew = merged;
          crewChanged = true;
        }
      }
      if (
        item.event.kind === 'lobby.command' &&
        item.senderId !== sessionLocalNodeId &&
        isTrustedLobbyCommand(
          item.event,
          item.senderId,
          'local',
          item.serverTime,
          serverNow,
        )
      ) {
        shouldOpenCalibration = true;
      }
    }

    const reconciled = reconcileLobbyCrewPresence(
      nextCrew,
      lastSeenAtServerByNodeIdRef.current,
      serverNow,
    );
    if (reconciled !== nextCrew) {
      nextCrew = reconciled;
      crewChanged = true;
    }
    if (crewChanged) {
      useHousewireStore.getState().setCrew(normaliseLiveCrew(nextCrew, safeRooms));
    }
    if (shouldOpenCalibration) router.replace('/briefing');
  }, [
    router,
    safeRooms,
    sessionClockEstimate?.offsetMs,
    sessionCode,
    sessionFeed,
    sessionLocalNodeId,
    sessionMode,
  ]);

  useEffect(() => {
    if (sessionMode !== 'lan' || !sessionCode) return;
    const refreshConnectivity = () => {
      const current = useHousewireStore.getState().crew.filter((node) => !node.simulated);
      const serverNow = estimateServerNow(
        serverClockAnchorRef.current,
        Date.now(),
        sessionClockEstimate?.offsetMs,
      );
      const reconciled = reconcileLobbyCrewPresence(
        current,
        lastSeenAtServerByNodeIdRef.current,
        serverNow,
      );
      if (reconciled !== current) {
        useHousewireStore.getState().setCrew(normaliseLiveCrew(reconciled, safeRooms));
      }
    };
    const expirePresence = setInterval(refreshConnectivity, 4_000);
    return () => clearInterval(expirePresence);
  }, [safeRooms, sessionClockEstimate?.offsetMs, sessionCode, sessionMode]);

  const beginPreview = () => {
    setLocalNodeId('local');
    setCrew(previewCrew);
    play('switch', 0.65);
    router.push('/briefing');
  };

  const beginLive = async () => {
    if (connectionState !== 'connected' || connectedLiveCrew.length < 2) return;
    setStarting(true);
    try {
      if (!isGuest) {
        await publishSessionEvent({
          kind: 'lobby.command',
          action: 'calibrate',
          hostNodeId: sessionLocalNodeId,
        });
      }
      play('switch', 0.65);
      router.replace('/briefing');
    } catch (error: unknown) {
      setLobbyError(error instanceof Error ? error.message : 'The start signal could not be sent.');
      setStarting(false);
    }
  };

  const switchToPreview = () => {
    setLocalNodeId('local');
    prepareSession('preview');
    setCrew(previewCrew);
  };

  return (
    <ScreenShell edgeWire={sessionMode === 'preview' ? 'left' : 'both'} padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topline}>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.back}>
            <Text style={[styles.backText, { color: theme.colors.muted }]}>‹ Back</Text>
          </Pressable>
          <OperationalLabel indicator status={sessionMode === 'preview' ? 'waiting' : connectionTone(connectionState)}>
            {sessionMode === 'preview' ? 'SOLO PREVIEW' : connectionLabel(connectionState)}
          </OperationalLabel>
        </View>

        <ImageBackground
          imageStyle={styles.heroImage}
          resizeMode="cover"
          source={require('../assets/art/line13-floorplan-v2.png')}
          style={styles.hero}
        >
          <View style={styles.heroShade} />
          <View style={styles.heroCopy}>
            <OperationalLabel textStyle={{ color: mission.accent }}>{mission.operation}</OperationalLabel>
            <Text style={[styles.heroTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>
              {sessionMode === 'preview'
                ? 'One phone. Whole house.'
                : isGuest
                  ? 'You’re inside.'
                  : 'Let everyone scan this.'}
            </Text>
            <Text style={[styles.heroText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>
              {sessionMode === 'preview'
                ? 'Try both viewpoints. Each has different clues and places to fill.'
                : isGuest
                  ? 'Stay here until the host starts.'
                  : 'On each phone: open Housewire, tap Join game, then scan.'}
            </Text>
          </View>
        </ImageBackground>

        <View style={styles.section}>
          <SectionLead
            detail={sessionMode === 'preview' ? 'No second phone needed' : isGuest ? 'You are connected—stay on this screen' : 'Scan once on every other phone'}
            index="1"
            title={sessionMode === 'preview' ? 'Solo setup' : isGuest ? 'You’re in' : 'Connect phones'}
          />

          {sessionMode === 'lan' && !isGuest && joinTicket ? (
            <View style={[styles.invite, { backgroundColor: theme.colors.surface, borderColor: theme.colors.draft }]}>
              <View
                accessible
                accessibilityLabel={`Join QR for house code ${sessionCode}`}
                accessibilityRole="image"
                style={styles.qrPlate}
              >
                <QRCode
                  backgroundColor="#F1E9D7"
                  color="#0A0D0C"
                  ecl="M"
                  quietZone={12}
                  size={220}
                  value={joinTicket}
                />
              </View>
              <View style={styles.inviteCode}>
                <OperationalLabel tone="muted">OR TYPE</OperationalLabel>
                <OperationalLabel textStyle={{ color: mission.accent }}>CASE · {mission.title}</OperationalLabel>
                <Text
                  accessibilityLabel={`House code ${sessionCode ?? 'pending'}`}
                  selectable
                  style={[styles.code, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}
                >
                  {sessionCode ?? '-----'}
                </Text>
                <Pressable accessibilityRole="button" onPress={() => setShowConnectionDetails((current) => !current)}>
                  <Text style={[styles.detailsAction, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{showConnectionDetails ? 'Hide connection details' : 'Connection details'}</Text>
                </Pressable>
                {showConnectionDetails ? <Text numberOfLines={2} selectable style={[styles.relay, { color: theme.colors.faint, fontFamily: theme.typography.families.mono }]}>{relayUrl}</Text> : null}
              </View>
            </View>
          ) : sessionMode === 'lan' && !isGuest ? (
            <View
              accessibilityLiveRegion="polite"
              style={[styles.invitePending, { backgroundColor: theme.colors.surface, borderColor: theme.colors.warning }]}
            >
              <OperationalLabel indicator status={connectionTone(connectionState)}>
                {connectionState === 'connecting' || connectionState === 'reconnecting'
                  ? 'PREPARING INVITE'
                  : 'INVITE UNAVAILABLE'}
              </OperationalLabel>
              <Text style={[styles.invitePendingTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Preparing your join code…</Text>
              <Text selectable style={[styles.invitePendingText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>
                Keep this screen open. If this takes more than a few seconds, reconnect below.
              </Text>
            </View>
          ) : sessionMode === 'lan' ? (
            <View style={[styles.guestCode, { borderColor: theme.colors.ready }]}>
              <Text selectable style={[styles.code, { color: theme.colors.ready, fontFamily: theme.typography.families.displayHeavy }]}>{sessionCode ?? '-----'}</Text>
              <OperationalLabel tone="ready">CONNECTED TO THIS HOUSE</OperationalLabel>
            </View>
          ) : (
            <View style={[styles.soloBand, { borderColor: theme.colors.warning }]}>
              <Text style={[styles.soloNumber, { color: theme.colors.warning, fontFamily: theme.typography.families.storyBold }]}>1</Text>
              <View style={styles.soloCopy}>
                <Text style={[styles.soloTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Phone. Both viewpoints.</Text>
                <Text style={[styles.soloText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Use You and Partner to switch clues during rehearsal.</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionLead
            detail={sessionMode === 'preview' ? 'Example positions · rehearsal uses You and Partner' : `${connectedLiveCrew.length} phone${connectedLiveCrew.length === 1 ? '' : 's'} connected`}
            index="2"
            title="Who is where"
          />
          <View style={styles.roomGrid}>
            {displayedCrew.map((node) => (
              <RoomDoor
                key={node.id}
                node={node}
                room={safeRooms.find((item) => item.id === node.roomId)?.label ?? 'Unassigned room'}
              />
            ))}
          </View>
          {displayedCrew.length === 0 ? (
            <Text style={[styles.waitingText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Waiting for the first phone…</Text>
          ) : null}
        </View>

        {sessionMode === 'lan' && connectionError ? (
          <View accessibilityLiveRegion="polite" style={[styles.faultBand, { borderColor: theme.colors.fault }]}>
            <OperationalLabel tone="fault">CONNECTION LOST</OperationalLabel>
            <Text style={[styles.faultText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{connectionError}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionLead
            detail={sessionMode === 'preview' ? 'Ready now' : connectedLiveCrew.length >= 2 ? 'Ready when everyone is in place' : 'Connect at least 2 phones'}
            index="3"
            title="Find a comfortable spot"
          />
          <View style={styles.readyLine}>
            {[0, 1, 2, 3].map((index) => {
              const filled = sessionMode === 'preview' ? index < previewCrew.length : index < connectedLiveCrew.length;
              return <View key={index} style={[styles.readyDot, { backgroundColor: filled ? theme.colors.ready : 'transparent', borderColor: filled ? theme.colors.ready : theme.colors.draft }]} />;
            })}
            <Text style={[styles.readyText, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{sessionMode === 'preview' ? 'Both viewpoints ready' : `${connectedLiveCrew.length} connected · keep private clues on your own screen`}</Text>
          </View>

          <View style={styles.actions}>
          {sessionMode === 'preview' ? (
            <>
              <BreakerButton
                haptic="rigid"
                label="Start solo preview"
                onPress={beginPreview}
                overline="YOU + PARTNER · ONE PHONE"
              />
              <TextAction label="Join a live house" onPress={() => router.push('/join')} />
            </>
          ) : (
            <>
              {isGuest ? (
                <View accessibilityLiveRegion="polite" style={[styles.guestWait, { backgroundColor: theme.colors.surface, borderColor: theme.colors.ready }]}>
                  <View style={[styles.guestWaitDot, { backgroundColor: theme.colors.ready }]} />
                  <View style={styles.guestWaitCopy}>
                    <Text style={[styles.guestWaitTitle, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>You’re ready. Stay here.</Text>
                    <Text style={[styles.guestWaitBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>The host starts every phone together.</Text>
                  </View>
                </View>
              ) : (
                <BreakerButton
                  disabled={connectionState !== 'connected' || connectedLiveCrew.length < 2}
                  haptic="rigid"
                  label={`Start together · ${connectedLiveCrew.length} phone${connectedLiveCrew.length === 1 ? '' : 's'}`}
                  loading={starting}
                  onPress={() => void beginLive()}
                  overline={connectionState === 'connected' ? connectedLiveCrew.length < 2 ? 'WAITING FOR ONE MORE PHONE' : 'STARTS EVERY PHONE TOGETHER' : 'CONNECTING PHONES'}
                />
              )}
              {connectionState === 'error' || connectionState === 'closed' ? (
                <BreakerButton
                  haptic="selection"
                  label="Reconnect"
                  onPress={() => {
                    setLobbyError(null);
                    reconnectSession();
                  }}
                  variant="secondary"
                />
              ) : null}
              <View style={styles.textActions}>
                {!isGuest ? <TextAction label="Open join screen" onPress={() => router.push('/join')} /> : null}
                <TextAction label="Use solo preview" onPress={switchToPreview} />
              </View>
            </>
          )}
          </View>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function SectionLead({ detail, index, title }: { detail: string; index: string; title: string }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.sectionLead}>
      <View style={[styles.stepNumber, { borderColor: theme.colors.wire }]}>
        <Text style={[styles.stepNumberText, { color: theme.colors.wire, fontFamily: theme.typography.families.monoMedium }]}>{index}</Text>
      </View>
      <Text style={[styles.sectionTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{title}</Text>
      <Text style={[styles.sectionDetail, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{detail}</Text>
    </View>
  );
}

function RoomDoor({ node, room }: { node: CrewNode; room: string }) {
  const { theme } = useHousewireTheme();
  const active = node.simulated || node.connected;
  const status = node.simulated ? 'SOLO' : node.connected ? 'READY' : 'LOST';
  return (
    <View
      accessible
      accessibilityLabel={`${node.name}, ${room}, ${status.toLowerCase()}`}
      style={[styles.roomDoor, { backgroundColor: theme.colors.surface, borderColor: active ? node.color : theme.colors.fault }]}
    >
      <View style={[styles.doorLight, { backgroundColor: active ? node.color : theme.colors.fault }]} />
      <View style={styles.roomTop}>
        <RoleSigil color={active ? node.color : theme.colors.faint} role={node.role} size={38} />
        <OperationalLabel tone={node.simulated ? 'warning' : node.connected ? 'ready' : 'fault'}>{status}</OperationalLabel>
      </View>
      <Text numberOfLines={1} style={[styles.roomName, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{node.name}</Text>
      <Text numberOfLines={1} style={[styles.roomLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{room}</Text>
    </View>
  );
}

function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.textAction}>
      <Text style={[styles.textActionLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
    </Pressable>
  );
}

function buildPreviewCrew(rooms: { id: string }[]): CrewNode[] {
  return rooms.slice(0, 4).map((room, index) => {
    const role = ROLE_ORDER[index % ROLE_ORDER.length];
    const name = PREVIEW_NAMES[index] ?? `Node ${index + 1}`;
    return {
      id: index === 0 ? 'local' : `simulated-${index + 1}`,
      name,
      initials: initialsFor(name),
      nodeNumber: index + 1,
      role,
      roomId: room.id,
      color: ROLE_COLORS[role],
      connected: true,
      simulated: index > 0,
    };
  });
}

function buildLocalNode(roomId: string, rawName?: string): CrewNode {
  const name = cleanName(rawName) || 'You';
  return {
    id: 'local',
    name,
    initials: initialsFor(name),
    nodeNumber: 1,
    role: 'relay',
    roomId,
    color: ROLE_COLORS.relay,
    connected: true,
    simulated: false,
  };
}

function cleanName(value?: string): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'N';
}

function connectionLabel(state: TransportConnectionState): string {
  switch (state) {
    case 'connected':
      return 'phones can connect';
    case 'connecting':
      return 'connecting phones';
    case 'reconnecting':
      return 'reconnecting';
    case 'error':
      return 'connection problem';
    case 'closed':
      return 'connection closed';
    case 'idle':
    default:
      return 'getting ready';
  }
}

function connectionTone(state: TransportConnectionState): 'idle' | 'waiting' | 'ready' | 'fault' {
  if (state === 'connected') return 'ready';
  if (state === 'error' || state === 'closed') return 'fault';
  if (state === 'connecting' || state === 'reconnecting') return 'waiting';
  return 'idle';
}

function rememberLobbyEvent(eventIds: Set<string>, eventId: string): void {
  eventIds.add(eventId);
  while (eventIds.size > MAXIMUM_SESSION_FEED * 2) {
    const oldest = eventIds.values().next().value;
    if (oldest === undefined) return;
    eventIds.delete(oldest);
  }
}

const styles = StyleSheet.create({
  actions: { gap: 8 },
  back: { justifyContent: 'center', minHeight: 44, minWidth: 58 },
  backText: { fontSize: 16 },
  code: { fontSize: 52, letterSpacing: 7, lineHeight: 54 },
  content: { flexGrow: 1, gap: 22, paddingBottom: 42, paddingHorizontal: 20, paddingTop: 4 },
  doorLight: { height: 4, left: 10, position: 'absolute', right: 10, top: 0 },
  detailsAction: { fontSize: 12, lineHeight: 18, paddingHorizontal: 10, paddingVertical: 7 },
  faultBand: { borderLeftWidth: 3, gap: 5, paddingLeft: 12, paddingVertical: 5 },
  faultText: { fontSize: 14, lineHeight: 20 },
  guestCode: { alignItems: 'center', borderWidth: 1, gap: 4, padding: 18 },
  guestWait: { alignItems: 'center', borderLeftWidth: 4, flexDirection: 'row', gap: 13, padding: 15 },
  guestWaitBody: { fontSize: 13, lineHeight: 18 },
  guestWaitCopy: { flex: 1, gap: 2 },
  guestWaitDot: { borderRadius: 6, height: 11, width: 11 },
  guestWaitTitle: { fontSize: 17, lineHeight: 21 },
  hero: { height: 225, justifyContent: 'flex-end', marginHorizontal: -20, overflow: 'hidden' },
  heroCopy: { gap: 6, padding: 20 },
  heroImage: { opacity: 0.76 },
  heroShade: { backgroundColor: 'rgba(7,8,6,0.49)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  heroText: { fontSize: 14, lineHeight: 20 },
  heroTitle: { fontSize: 45, lineHeight: 43, maxWidth: 320 },
  invite: { alignItems: 'center', borderWidth: 1, gap: 14, padding: 14 },
  inviteCode: { alignItems: 'center', gap: 4, width: '100%' },
  invitePending: { borderLeftWidth: 3, gap: 8, padding: 16 },
  invitePendingText: { fontSize: 13, lineHeight: 19 },
  invitePendingTitle: { fontSize: 25, lineHeight: 27 },
  qrPlate: { backgroundColor: '#F1E9D7', padding: 6 },
  readyDot: { borderRadius: 7, borderWidth: 1, height: 14, width: 14 },
  readyLine: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  readyText: { flex: 1, fontSize: 13, marginLeft: 4 },
  relay: { fontSize: 8, lineHeight: 13, maxWidth: '100%', textAlign: 'center' },
  roomDoor: { borderWidth: 1, gap: 3, minHeight: 132, overflow: 'hidden', padding: 12, width: '48%' },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  roomLabel: { fontSize: 11, lineHeight: 15 },
  roomName: { fontSize: 24, lineHeight: 25 },
  roomTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  section: { gap: 13 },
  sectionDetail: { flex: 1, fontSize: 12, textAlign: 'right' },
  sectionLead: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  sectionTitle: { fontSize: 29, lineHeight: 30 },
  soloBand: { alignItems: 'center', borderLeftWidth: 3, flexDirection: 'row', gap: 15, paddingLeft: 16, paddingVertical: 9 },
  soloCopy: { flex: 1, gap: 2 },
  soloNumber: { fontSize: 54, lineHeight: 54 },
  soloText: { fontSize: 12, lineHeight: 17 },
  soloTitle: { fontSize: 23, lineHeight: 24 },
  stepNumber: { alignItems: 'center', borderRadius: 16, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  stepNumberText: { fontSize: 11 },
  textAction: { alignItems: 'center', justifyContent: 'center', minHeight: 46, paddingHorizontal: 8 },
  textActionLabel: { fontSize: 14 },
  textActions: { flexDirection: 'row', justifyContent: 'space-around' },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  waitingText: { fontSize: 14, paddingVertical: 12, textAlign: 'center' },
});

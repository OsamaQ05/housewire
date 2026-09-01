import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BreakerButton, GlyphMark, OperationalLabel, ScreenShell } from '@/src/components';
import { missions } from '@/src/data/campaigns';
import { parseForgeJoinTicket } from '@/src/features/forge/live-protocol';
import {
  deriveLanRelayUrl,
  describeJoinFailure,
  normaliseRelayUrl,
  parseJoinTicket,
  parseJoinTicketRouteParams,
  probeLanHouse,
} from '@/src/features/session';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import {
  useHousewireStore,
  type CrewNode,
  type MissionId,
  type RoleId,
} from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

const ROLE_ORDER: RoleId[] = ['relay', 'listener', 'navigator', 'breaker'];
const ROLE_COLORS: Record<RoleId, string> = {
  relay: '#FF603B',
  listener: '#65CFE2',
  navigator: '#F4C85A',
  breaker: '#B7A5EE',
};
const PREVIEW_NAMES = ['You', 'Mara', 'Samir', 'Inez'] as const;

export default function JoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    c?: string | string[];
    m?: string | string[];
    r?: string | string[];
    ticket?: string | string[];
    v?: string | string[];
  }>();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const rooms = useHousewireStore((state) => state.rooms);
  const selectedMission = useHousewireStore((state) => state.selectedMission);
  const currentCode = useHousewireStore((state) => state.sessionCode);
  const currentRelay = useHousewireStore((state) => state.relayUrl);
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const setCrew = useHousewireStore((state) => state.setCrew);
  const setLocalNodeId = useHousewireStore((state) => state.setLocalNodeId);
  const selectMission = useHousewireStore((state) => state.selectMission);
  const safeRooms = useMemo(() => rooms.filter((room) => room.safe), [rooms]);
  const [name, setName] = useState('');
  const [code, setCode] = useState(currentCode ?? '');
  const [relayUrl, setRelayUrl] = useState(currentRelay ?? defaultRelayUrl());
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinMissionId, setJoinMissionId] = useState<MissionId>(selectedMission);
  const [manualOpen, setManualOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const scanLatchRef = useRef(false);
  const appliedRouteTicketRef = useRef<string | undefined>(undefined);
  const cleanPlayerName = cleanName(name);
  const cleanCode = normaliseCode(code);
  const ticketReady = cleanCode.length === 5 && relayUrl.trim().length > 0;
  const canJoinLive = cleanPlayerName.length >= 1 && ticketReady && !joining;

  const ticketParam = firstParam(params.ticket);
  const versionParam = firstParam(params.v);
  const codeParam = firstParam(params.c);
  const relayParam = firstParam(params.r);
  const missionParam = firstParam(params.m);
  const routeInviteKey = JSON.stringify([ticketParam, versionParam, codeParam, relayParam, missionParam]);
  const routeTicket = useMemo(
    () => parseJoinTicketRouteParams({
      ticket: ticketParam,
      v: versionParam,
      c: codeParam,
      r: relayParam,
      m: missionParam,
    }),
    [codeParam, missionParam, relayParam, ticketParam, versionParam],
  );
  const hasRouteInvite = Boolean(ticketParam || codeParam || relayParam || missionParam || versionParam);

  useEffect(() => {
    if (!hasRouteInvite || appliedRouteTicketRef.current === routeInviteKey) return;
    appliedRouteTicketRef.current = routeInviteKey;
    if (!routeTicket) {
      setError('That Housewire invite is invalid or expired. Scan the host QR again.');
      return;
    }
    setCode(routeTicket.code);
    setRelayUrl(routeTicket.relayUrl);
    setJoinMissionId(routeTicket.missionId);
    setManualOpen(false);
    setError(null);
  }, [hasRouteInvite, routeInviteKey, routeTicket]);

  const joinLiveHouse = async () => {
    if (!canJoinLive) {
      setError(
        cleanPlayerName.length === 0
          ? 'Add your name first.'
          : cleanCode.length !== 5
            ? 'The house code has five characters.'
            : 'Add the host relay address.',
      );
      play('warning', 0.48);
      return;
    }

    const room = safeRooms[1] ?? safeRooms[0];
    if (!room) {
      setError('No safe room is ready. Return to setup.');
      return;
    }
    const normalisedRelay = normaliseRelayUrl(relayUrl);
    setJoining(true);
    setError(null);
    try {
      await probeLanHouse({ code: cleanCode, relayUrl: normalisedRelay });
    } catch (cause: unknown) {
      setError(describeJoinFailure(cause));
      setJoining(false);
      play('warning', 0.48);
      return;
    }

    const nodeId = safeId(`guest-${cleanPlayerName}-${Date.now().toString(36)}`);
    const node: CrewNode = {
      id: nodeId,
      name: cleanPlayerName,
      initials: initialsFor(cleanPlayerName),
      nodeNumber: 2,
      role: 'listener',
      roomId: room.id,
      color: ROLE_COLORS.listener,
      connected: true,
      simulated: false,
    };

    setCrew([node]);
    setLocalNodeId(nodeId);
    selectMission(joinMissionId);
    prepareSession('lan', cleanCode, normalisedRelay);
    play('relay', 0.58);
    router.replace({ pathname: '/lobby', params: { guest: '1', name: cleanPlayerName } });
  };

  const openPreview = () => {
    const previewCrew = buildPreviewCrew(safeRooms, cleanPlayerName || 'You');
    if (previewCrew.length < 2) {
      setError('Solo preview needs two safe rooms. Return to setup.');
      return;
    }
    setError(null);
    setCrew(previewCrew);
    setLocalNodeId('local');
    prepareSession('preview');
    play('switch', 0.58);
    router.replace('/lobby');
  };

  const openScanner = async () => {
    setScannerError(null);
    setScanLocked(false);
    scanLatchRef.current = false;
    try {
      let permission = cameraPermission;
      if (!permission?.granted) {
        if (permission && !permission.canAskAgain) {
          setScannerError('Camera is blocked. Enter the code instead.');
          setManualOpen(true);
          play('warning', 0.42);
          return;
        }
        permission = await requestCameraPermission();
      }
      if (!permission.granted) {
        setScannerError('Camera was not allowed. Enter the code instead.');
        setManualOpen(true);
        play('warning', 0.42);
        return;
      }
      setScannerOpen(true);
      play('switch', 0.46);
    } catch {
      setScannerError('Camera did not open. Enter the code instead.');
      setManualOpen(true);
      play('warning', 0.42);
    }
  };

  const closeScanner = () => {
    setScannerOpen(false);
    setScanLocked(false);
    scanLatchRef.current = false;
  };

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (scanLatchRef.current) return;
    scanLatchRef.current = true;
    setScanLocked(true);
    const forgeTicket = parseForgeJoinTicket(data);
    if (forgeTicket) {
      setError(null);
      setScannerError(null);
      setScannerOpen(false);
      setManualOpen(false);
      play('accept', 0.62);
      router.replace({
        pathname: '/forge-join',
        params: {
          c: forgeTicket.code,
          f: forgeTicket.caseId,
          r: forgeTicket.relayUrl,
          v: String(forgeTicket.version),
        },
      } as never);
      return;
    }
    const ticket = parseJoinTicket(data);
    if (!ticket) {
      setScannerError('That is not a HOUSEWIRE room QR.');
      play('warning', 0.48);
      return;
    }
    setCode(ticket.code);
    setRelayUrl(ticket.relayUrl);
    setJoinMissionId(ticket.missionId);
    setError(null);
    setScannerError(null);
    setScannerOpen(false);
    setManualOpen(false);
    play('accept', 0.62);
  };

  return (
    <>
      <ScreenShell edgeWire="right" padded={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={12}
          style={styles.keyboard}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.topline}>
              <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.back}>
                <Text style={[styles.backText, { color: theme.colors.muted }]}>‹ Back</Text>
              </Pressable>
              <OperationalLabel tone="wire">JOIN HOUSEWIRE</OperationalLabel>
            </View>

            <View style={styles.heroCopy}>
              <Text style={[styles.eyebrow, { color: theme.colors.wire, fontFamily: theme.typography.families.monoMedium }]}>ANOTHER PHONE IS HOSTING</Text>
              <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Scan their house.</Text>
              <Text style={[styles.subtitle, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>One QR connects both phones.</Text>
            </View>

            <Pressable
              accessibilityHint="Opens the camera to scan the QR code on the host phone"
              accessibilityLabel="Scan host QR"
              accessibilityRole="button"
              onPress={() => void openScanner()}
              style={({ pressed }) => [
                styles.scanPortal,
                { backgroundColor: pressed ? theme.colors.surfaceRaised : theme.colors.surface, borderColor: ticketReady ? theme.colors.ready : theme.colors.wire },
              ]}
            >
              <Corner position="topLeft" ready={ticketReady} />
              <Corner position="topRight" ready={ticketReady} />
              <Corner position="bottomLeft" ready={ticketReady} />
              <Corner position="bottomRight" ready={ticketReady} />
              <GlyphMark color={ticketReady ? theme.colors.ready : theme.colors.wire} glyph={ticketReady ? 'KEY' : 'EYE'} size={82} />
              <Text style={[styles.scanTitle, { color: ticketReady ? theme.colors.ready : theme.colors.text, fontFamily: theme.typography.families.display }]}>{ticketReady ? 'HOUSE FOUND' : 'SCAN QR'}</Text>
              <Text style={[styles.scanSub, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{ticketReady ? cleanCode : 'Camera stays on this screen'}</Text>
            </Pressable>

            <Field
              autoCapitalize="words"
              label="Your name"
              maxLength={24}
              onChangeText={(value) => {
                setName(value);
                setError(null);
              }}
              placeholder="Mara"
              returnKeyType="done"
              value={name}
            />

            {scannerError && !scannerOpen ? (
              <Text accessibilityLiveRegion="polite" style={[styles.notice, { color: theme.colors.warning, fontFamily: theme.typography.families.bodyMedium }]}>{scannerError}</Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={() => setManualOpen((current) => !current)}
              style={styles.manualToggle}
            >
              <Text style={[styles.manualToggleText, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{manualOpen ? 'Hide manual entry' : 'Can’t scan? Enter the code'}</Text>
              <Text style={[styles.chevron, { color: theme.colors.wire }]}>{manualOpen ? '−' : '+'}</Text>
            </Pressable>

            {manualOpen ? (
              <View style={[styles.manualForm, { borderColor: theme.colors.draft }]}>
                <Field
                  autoCapitalize="characters"
                  autoCorrect={false}
                  label="House code"
                  maxLength={5}
                  onChangeText={(value) => {
                    setCode(normaliseCode(value));
                    setError(null);
                  }}
                  placeholder="7K3MW"
                  returnKeyType="next"
                  value={code}
                />
                <Field
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  label="Host address"
                  maxLength={120}
                  onChangeText={(value) => {
                    setRelayUrl(value);
                    setError(null);
                  }}
                  onSubmitEditing={() => void joinLiveHouse()}
                  placeholder="ws://192.168.1.20:8787"
                  returnKeyType="go"
                  value={relayUrl}
                />
                <View style={styles.casePicker}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>Host case</Text>
                  <View accessibilityLabel="Choose the case shown on the host phone" accessibilityRole="radiogroup" style={styles.caseChoices}>
                    {missions.map((mission, index) => {
                      const selected = joinMissionId === mission.id;
                      return (
                        <Pressable
                          accessibilityLabel={`Host case ${mission.title}`}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected }}
                          aria-checked={selected}
                          key={mission.id}
                          onPress={() => {
                            setJoinMissionId(mission.id);
                            setError(null);
                          }}
                          style={[
                            styles.caseChoice,
                            {
                              backgroundColor: selected ? theme.colors.surfaceRaised : 'transparent',
                              borderColor: selected ? mission.accent : theme.colors.draft,
                            },
                          ]}
                        >
                          <Text style={[styles.caseIndex, { color: mission.accent, fontFamily: theme.typography.families.monoMedium }]}>{String(index + 1).padStart(2, '0')}</Text>
                          <Text numberOfLines={1} style={[styles.caseName, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{mission.title}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={[styles.caseHelp, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>Match the title above the QR on the host phone.</Text>
                </View>
              </View>
            ) : null}

            {error ? (
              <Text accessibilityLiveRegion="polite" style={[styles.notice, { color: theme.colors.fault, fontFamily: theme.typography.families.bodyMedium }]}>{error}</Text>
            ) : null}

            <View style={styles.actions}>
              <BreakerButton
                disabled={!canJoinLive}
                haptic="rigid"
                label="Join the room"
                loading={joining}
                onPress={() => void joinLiveHouse()}
                overline={!ticketReady ? 'SCAN OR ENTER A CODE' : !cleanPlayerName ? 'ADD YOUR NAME' : `${cleanCode} · READY`}
              />
              <Pressable accessibilityRole="button" onPress={openPreview} style={styles.soloAction}>
                <Text style={[styles.soloText, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>Only one phone? Try solo preview</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push('/forge-join' as never)} style={styles.soloAction}>
                <Text style={[styles.soloText, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>Joining a generated Case Forge room? Enter its file details</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenShell>

      <Modal
        animationType="slide"
        onRequestClose={closeScanner}
        statusBarTranslucent
        transparent={false}
        visible={scannerOpen}
      >
        <View style={[styles.scannerScreen, { backgroundColor: theme.colors.background }]}>
          {cameraPermission?.granted ? (
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              facing="back"
              onBarcodeScanned={scanLocked ? undefined : handleBarcodeScanned}
              onMountError={({ message }) => {
                scanLatchRef.current = false;
                setScanLocked(false);
                setScannerOpen(false);
                setScannerError(`Camera could not open: ${message}`);
                setManualOpen(true);
                play('warning', 0.42);
              }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <View style={styles.scannerShade} />
          <View style={styles.scannerTopline}>
            <OperationalLabel indicator status={scanLocked ? 'fault' : 'live'}>{scanLocked ? 'NOT A HOUSE CODE' : 'CAMERA LIVE'}</OperationalLabel>
            <Pressable accessibilityRole="button" onPress={closeScanner} style={[styles.closeButton, { backgroundColor: theme.colors.background }]}>
              <Text style={[styles.closeText, { color: theme.colors.text }]}>×</Text>
            </Pressable>
          </View>
          <View accessible accessibilityLabel="Aim at the QR on the host phone" style={styles.reticle}>
            <Corner position="topLeft" ready={!scanLocked} light />
            <Corner position="topRight" ready={!scanLocked} light />
            <Corner position="bottomLeft" ready={!scanLocked} light />
            <Corner position="bottomRight" ready={!scanLocked} light />
          </View>
          <View style={[styles.scannerPanel, { backgroundColor: theme.colors.background }]}>
            <Text style={[styles.scannerTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{scanLocked ? 'Wrong code.' : 'Point at the host QR.'}</Text>
            <Text style={[styles.scannerBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{scanLocked ? scannerError : 'Nothing is photographed or saved.'}</Text>
            {scanLocked ? (
              <BreakerButton
                label="Try again"
                onPress={() => {
                  setScannerError(null);
                  setScanLocked(false);
                  scanLatchRef.current = false;
                }}
                variant="secondary"
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

type CornerPosition = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

function Corner({ light = false, position, ready }: { light?: boolean; position: CornerPosition; ready: boolean }) {
  const { theme } = useHousewireTheme();
  return (
    <View
      style={[
        styles.corner,
        styles[position],
        {
          borderColor: light ? theme.colors.text : ready ? theme.colors.ready : theme.colors.wire,
          pointerEvents: 'none',
        },
      ]}
    />
  );
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.faint}
        selectionColor={theme.colors.wire}
        spellCheck={false}
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.draft,
            color: theme.colors.text,
            fontFamily: theme.typography.families.bodyMedium,
          },
        ]}
        {...props}
      />
    </View>
  );
}

function buildPreviewCrew(rooms: { id: string }[], localName: string): CrewNode[] {
  return rooms.slice(0, 4).map((room, index) => {
    const role = ROLE_ORDER[index % ROLE_ORDER.length];
    const name = index === 0 ? localName : (PREVIEW_NAMES[index] ?? `Node ${index + 1}`);
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

function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 24);
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'N';
}

function normaliseCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

function defaultRelayUrl(): string {
  return deriveLanRelayUrl();
}

function safeId(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+/, '').slice(0, 64);
  return safe || `guest-${Date.now().toString(36)}`;
}

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const styles = StyleSheet.create({
  actions: { gap: 4 },
  back: { justifyContent: 'center', minHeight: 44, minWidth: 58 },
  backText: { fontSize: 16 },
  bottomLeft: { borderBottomWidth: 3, borderLeftWidth: 3, bottom: 13, left: 13 },
  bottomRight: { borderBottomWidth: 3, borderRightWidth: 3, bottom: 13, right: 13 },
  chevron: { fontSize: 24, lineHeight: 24 },
  caseChoice: { borderWidth: 1, flex: 1, gap: 2, minHeight: 58, padding: 8 },
  caseChoices: { flexDirection: 'row', gap: 6 },
  caseHelp: { fontSize: 11, lineHeight: 16 },
  caseIndex: { fontSize: 7, letterSpacing: 1 },
  caseName: { fontSize: 14, lineHeight: 16 },
  casePicker: { gap: 7 },
  closeButton: { alignItems: 'center', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  closeText: { fontSize: 30, lineHeight: 32 },
  content: { flexGrow: 1, gap: 18, paddingBottom: 36, paddingHorizontal: 20, paddingTop: 4 },
  corner: { height: 34, position: 'absolute', width: 34 },
  eyebrow: { fontSize: 10, letterSpacing: 2 },
  field: { gap: 7 },
  fieldLabel: { fontSize: 13 },
  heroCopy: { gap: 5 },
  input: { borderRadius: 2, borderWidth: 1, fontSize: 17, minHeight: 54, paddingHorizontal: 14, paddingVertical: 10 },
  keyboard: { flex: 1 },
  manualForm: { borderLeftWidth: 2, gap: 15, paddingLeft: 14 },
  manualToggle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 48 },
  manualToggleText: { fontSize: 14 },
  notice: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  reticle: { alignSelf: 'center', height: 255, marginTop: 116, position: 'relative', width: 255 },
  scanPortal: { alignItems: 'center', borderRadius: 3, borderWidth: 1, gap: 5, height: 222, justifyContent: 'center', overflow: 'hidden' },
  scannerBody: { fontSize: 14, lineHeight: 20 },
  scannerPanel: { bottom: 0, gap: 5, left: 0, paddingBottom: 40, paddingHorizontal: 22, paddingTop: 22, position: 'absolute', right: 0 },
  scannerScreen: { flex: 1 },
  scannerShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,8,6,0.28)', pointerEvents: 'none' },
  scannerTitle: { fontSize: 37, lineHeight: 38 },
  scannerTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 48 },
  scanSub: { fontSize: 13 },
  scanTitle: { fontSize: 30, letterSpacing: 1.1, lineHeight: 31 },
  soloAction: { alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  soloText: { fontSize: 14 },
  subtitle: { fontSize: 15, lineHeight: 21 },
  title: { fontSize: 47, lineHeight: 47 },
  topLeft: { borderLeftWidth: 3, borderTopWidth: 3, left: 13, top: 13 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  topRight: { borderRightWidth: 3, borderTopWidth: 3, right: 13, top: 13 },
});

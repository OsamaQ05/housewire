import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
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

import { ScreenShell } from '@/src/components/ScreenShell';
import { describeJoinFailure, normaliseRelayUrl, probeLanHouse } from '@/src/features/session/join-room';
import { deriveLanRelayUrl } from '@/src/features/session/use-housewire-session';
import { parseCircuitRaceJoinTicket, parseCircuitRaceRouteParams } from '@/src/features/race/race-join-ticket';
import { useCircuitRaceStore } from '@/src/store/use-circuit-race-store';
import { useHousewireStore, type CrewNode } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

const MINT = '#5FE0D0';
const EMBER = '#FF6846';

export default function RaceJoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ c?: string | string[]; r?: string | string[]; v?: string | string[] }>();
  const { theme } = useHousewireTheme();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [relayUrl, setRelayUrl] = useState(defaultRelay());
  const [manual, setManual] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string>();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scanLatch = useRef(false);
  const mountedRef = useRef(true);
  const joinGenerationRef = useRef(0);
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const setCrew = useHousewireStore((state) => state.setCrew);
  const setLocalNodeId = useHousewireStore((state) => state.setLocalNodeId);
  const roomId = useHousewireStore((state) => state.rooms.find((room) => room.safe)?.id ?? 'living');
  const setLaunchMode = useCircuitRaceStore((state) => state.setLaunchMode);
  const clearRace = useCircuitRaceStore((state) => state.clearRace);
  const routeTicket = useMemo(() => parseCircuitRaceRouteParams(params), [params]);

  useEffect(() => {
    if (!routeTicket) return;
    setCode(routeTicket.code);
    setRelayUrl(routeTicket.relayUrl);
    setManual(false);
    setError(undefined);
  }, [routeTicket]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      joinGenerationRef.current += 1;
    };
  }, []);

  const leaveJoin = () => {
    joinGenerationRef.current += 1;
    router.back();
  };

  const openScanner = async () => {
    setError(undefined);
    try {
      const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
      if (!permission.granted) {
        setManual(true);
        setError('Camera unavailable. Enter the five-character race code.');
        return;
      }
      scanLatch.current = false;
      setScanLocked(false);
      setScanner(true);
    } catch {
      setManual(true);
      setError('Camera unavailable. Enter the race code instead.');
    }
  };

  const scanned = ({ data }: BarcodeScanningResult) => {
    if (scanLatch.current) return;
    const ticket = parseCircuitRaceJoinTicket(data);
    if (!ticket) {
      scanLatch.current = true;
      setScanLocked(true);
      setScanner(false);
      setManual(true);
      setError('That QR is not a Circuit Race invite.');
      return;
    }
    scanLatch.current = true;
    setScanLocked(true);
    setCode(ticket.code);
    setRelayUrl(ticket.relayUrl);
    setScanner(false);
    setError(undefined);
  };

  const join = async () => {
    const generation = ++joinGenerationRef.current;
    const cleanName = name.trim().slice(0, 24);
    const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (!cleanName || cleanCode.length !== 5) {
      setError(!cleanName ? 'Add your name first.' : 'The race code has five characters.');
      return;
    }
    setJoining(true);
    setError(undefined);
    let relay: string;
    try {
      relay = normaliseRelayUrl(relayUrl);
      await probeLanHouse({ code: cleanCode, relayUrl: relay });
    } catch (cause: unknown) {
      if (!mountedRef.current || generation !== joinGenerationRef.current) return;
      setError(describeJoinFailure(cause));
      setJoining(false);
      return;
    }
    if (!mountedRef.current || generation !== joinGenerationRef.current) return;
    const id = safeId(`racer-${cleanName}-${Date.now().toString(36)}`);
    const node: CrewNode = {
      id,
      name: cleanName,
      initials: initials(cleanName),
      nodeNumber: 2,
      role: 'listener',
      roomId,
      color: MINT,
      connected: true,
      simulated: false,
    };
    clearRace();
    setLaunchMode('live');
    setCrew([node]);
    setLocalNodeId(id);
    prepareSession('lan', cleanCode, relay);
    router.replace({ pathname: '/race-lobby' as never, params: { guest: '1' } });
  };

  return (
    <>
      <ScreenShell edgeWire="none" padded={false} texture={false}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Pressable accessibilityLabel="Back" hitSlop={10} onPress={leaveJoin}><Ionicons color={theme.colors.text} name="arrow-back" size={23} /></Pressable>
              <Text style={[styles.brand, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>Join Circuit Race</Text>
              <View style={styles.headerSpacer} />
            </View>

            <View style={styles.hero}>
              <View style={styles.radar}>
                <View style={[styles.radarRing, styles.radarRingOuter, { borderColor: theme.colors.draft }]} />
                <View style={[styles.radarRing, styles.radarRingInner, { borderColor: MINT }]} />
                <View style={[styles.radarSweep, { backgroundColor: EMBER }]} />
                <Ionicons color={MINT} name="scan" size={48} />
              </View>
              <Text style={[styles.kicker, { color: MINT, fontFamily: theme.typography.families.bodyMedium }]}>Your family is hosting</Text>
              <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>Scan the host phone</Text>
              <Text style={[styles.subtitle, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>The join QR carries the room code and connection details.</Text>
            </View>

            <Pressable accessibilityRole="button" onPress={() => void openScanner()} style={({ pressed }) => [styles.scanButton, { borderColor: MINT, backgroundColor: theme.colors.surface }, pressed && styles.pressed]}>
              <Ionicons color={MINT} name="qr-code-outline" size={29} />
              <View style={styles.scanCopy}>
                <Text style={[styles.scanTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{code.length === 5 ? 'Ready to join' : 'Open camera'}</Text>
                <Text style={[styles.scanMeta, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>{code.length === 5 ? `Code ${code}` : 'Scan the big QR on the host phone'}</Text>
              </View>
              <Ionicons color={MINT} name="arrow-forward" size={21} />
            </Pressable>

            <Field label="Your name" onChange={setName} placeholder="Mara" value={name} />

            <Pressable onPress={() => setManual((value) => !value)} style={styles.manualToggle}>
              <Text style={[styles.manualText, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{manual ? 'Hide manual entry' : 'Can’t scan? Enter code'}</Text>
              <Ionicons color={MINT} name={manual ? 'remove' : 'add'} size={19} />
            </Pressable>
            {manual ? (
              <View style={styles.manualFields}>
                <Field autoCapitalize="characters" label="Race code" maxLength={5} onChange={(value) => setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))} placeholder="7K3MW" value={code} />
                <Field autoCapitalize="none" label="Host address" onChange={setRelayUrl} placeholder="ws://172.20.10.2:8787" value={relayUrl} />
              </View>
            ) : null}

            {error ? <View style={[styles.error, { borderColor: theme.colors.fault }]}><Ionicons color={theme.colors.fault} name="warning-outline" size={19} /><Text style={[styles.errorText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{error}</Text></View> : null}

            <Pressable accessibilityRole="button" disabled={joining} onPress={() => void join()} style={({ pressed }) => [styles.joinButton, { backgroundColor: MINT }, joining && styles.disabled, pressed && styles.pressed]}>
              <Text style={[styles.joinText, { fontFamily: theme.typography.families.displayHeavy }]}>{joining ? 'Connecting…' : 'Join the race'}</Text>
              <Ionicons color="#08100F" name="flash" size={22} />
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenShell>

      <Modal animationType="fade" onRequestClose={() => setScanner(false)} visible={scanner}>
        <View style={styles.scannerPage}>
          <CameraView barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanLocked ? undefined : scanned} style={StyleSheet.absoluteFill} />
          <View style={styles.scannerShade} />
          <View style={styles.scanFrame} />
          <Text style={styles.scannerText}>Point at the host&apos;s race QR</Text>
          <Pressable accessibilityLabel="Close scanner" onPress={() => setScanner(false)} style={styles.closeScanner}><Ionicons color="#F4E8CF" name="close" size={27} /></Pressable>
        </View>
      </Modal>
    </>
  );
}

function Field({ autoCapitalize = 'words', label, maxLength = 120, onChange, placeholder, value }: { autoCapitalize?: 'none' | 'words' | 'characters'; label: string; maxLength?: number; onChange(value: string): void; placeholder: string; value: string }) {
  const { theme } = useHousewireTheme();
  return <View style={styles.field}><Text style={[styles.fieldLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text><TextInput autoCapitalize={autoCapitalize} autoCorrect={false} maxLength={maxLength} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.colors.faint} style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.draft, color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]} value={value} /></View>;
}

function defaultRelay(): string {
  try { return deriveLanRelayUrl(); } catch { return 'ws://127.0.0.1:8787'; }
}
function safeId(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64) || `racer-${Date.now().toString(36)}`; }
function initials(value: string): string { return value.split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase() || 'R'; }

const styles = StyleSheet.create({
  brand: { fontSize: 20, letterSpacing: 0.7 },
  closeScanner: { position: 'absolute', right: 24, top: 54 },
  disabled: { opacity: 0.42 },
  error: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 10 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  field: { gap: 7 },
  fieldLabel: { fontSize: 13, lineHeight: 17 },
  flex: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerSpacer: { width: 23 },
  hero: { alignItems: 'center', paddingTop: 4 },
  input: { borderRadius: 14, borderWidth: 1, fontSize: 16, minHeight: 56, paddingHorizontal: 13 },
  joinButton: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', minHeight: 66, paddingHorizontal: 17 },
  joinText: { color: '#08100F', fontSize: 20 },
  kicker: { fontSize: 13, lineHeight: 18, marginTop: 13, textAlign: 'center' },
  manualFields: { gap: 12 },
  manualText: { fontSize: 13 },
  manualToggle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 38 },
  page: { flexGrow: 1, gap: 17, paddingBottom: 38, paddingHorizontal: 20, paddingTop: 12 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.993 }] },
  radar: { alignItems: 'center', height: 118, justifyContent: 'center', width: 118 },
  radarRing: { borderRadius: 70, borderWidth: 1, position: 'absolute' },
  radarRingInner: { height: 76, width: 76 },
  radarRingOuter: { height: 118, width: 118 },
  radarSweep: { height: 2, position: 'absolute', right: 11, top: 58, transform: [{ rotate: '-24deg' }], transformOrigin: 'left center', width: 48 },
  scanButton: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 78, padding: 12 },
  scanCopy: { flex: 1, gap: 2 },
  scanFrame: { borderColor: MINT, borderWidth: 3, height: 250, position: 'absolute', width: 250 },
  scanMeta: { fontSize: 12, lineHeight: 16 },
  scannerPage: { alignItems: 'center', backgroundColor: '#050706', flex: 1, justifyContent: 'center' },
  scannerShade: { backgroundColor: 'rgba(0,0,0,0.25)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  scannerText: { bottom: 90, color: '#F4E8CF', fontSize: 14, position: 'absolute' },
  scanTitle: { fontSize: 22, lineHeight: 23 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 7, textAlign: 'center' },
  title: { fontSize: 42, lineHeight: 43, marginTop: 7, textAlign: 'center' },
});

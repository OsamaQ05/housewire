import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Modal, TextInput, View } from 'react-native';
import { parseDefusalJoinParams, parseDefusalJoinTicket, type DefusalJoinTicket } from '@/src/features/defusal/join-ticket';
import { deriveLanRelayUrl } from '@/src/features/session';
import { Action, Copy, kit, light } from './kit';

export function JoinPanel({ initial, name, joining, onJoin, onCancel }: { initial?: DefusalJoinTicket; name: string; joining: boolean; onJoin(ticket: DefusalJoinTicket, name: string): Promise<boolean>; onCancel(): void }) {
  const [code, setCode] = useState(initial?.code ?? '');
  const [relay, setRelay] = useState(initial?.relayUrl ?? (() => { try { return deriveLanRelayUrl(); } catch { return ''; } })());
  const [advanced, setAdvanced] = useState(false);
  const [scan, setScan] = useState(false);
  const [error, setError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const latch = useRef(false);
  const openCamera = async () => {
    try { const allowed = permission?.granted || (await requestPermission()).granted; if (!allowed) { setError('No problem—type the room code instead.'); return; } latch.current = false; setScan(true); }
    catch { setError('Camera unavailable. Type the room code instead.'); }
  };
  return <View style={{ gap: 14 }}>
    <Copy kind="title">Take a seat at the table.</Copy><Copy pale>Open Last Light on each phone. Scan the host’s invite here, or enter their five-character code.</Copy>
    <Action secondary icon="scan-outline" onPress={() => void openCamera()}>Scan room invite</Action>
    <TextInput accessibilityLabel="Room code" value={code} onChangeText={(value) => setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))} autoCapitalize="characters" autoCorrect={false} maxLength={5} placeholder="ROOM CODE" placeholderTextColor={light.muted} style={[kit.input, { letterSpacing: 8, textAlign: 'center', fontSize: 24 }]} />
    <Action disabled={joining || code.length !== 5 || !name.trim()} onPress={() => { const ticket = parseDefusalJoinParams({ c: code, r: relay }); if (!ticket) { setAdvanced(true); setError('Check the room code and relay address shown on the host’s phone.'); return; } setError(''); void onJoin(ticket, name); }}>{joining ? 'Joining the room…' : 'Join Last Light'}</Action>
    <Action secondary onPress={() => setAdvanced(!advanced)}>{advanced ? 'Hide connection details' : 'Connection details'}</Action>
    {advanced ? <><Copy kind="label" pale>Copy the relay address from the host. All phones need the same Wi-Fi or hotspot.</Copy><TextInput accessibilityLabel="Relay address" value={relay} onChangeText={setRelay} autoCapitalize="none" autoCorrect={false} placeholder="ws://computer-address:8787" placeholderTextColor={light.muted} style={kit.input} /></> : null}
    {error ? <View style={kit.error}><Copy>{error}</Copy></View> : null}
    <Action secondary onPress={onCancel}>Back</Action>
    <Modal visible={scan} animationType="slide" onRequestClose={() => setScan(false)}>
      <View style={{ flex: 1, backgroundColor: light.background, paddingTop: 55, padding: 20, gap: 18 }}><Copy kind="title">Scan the host’s room invite</Copy><Copy pale>This is the QR inside Last Light—not the Expo launch QR.</Copy>
        {scan ? <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => { if (latch.current) return; latch.current = true; const ticket = parseDefusalJoinTicket(data); setScan(false); if (!ticket) { setError('That isn’t a Last Light invite. Ask the host to open their waiting room.'); return; } setCode(ticket.code); setRelay(ticket.relayUrl); setError(''); }} /> : null}
        <Action onPress={() => setScan(false)}>Use room code instead</Action>
      </View>
    </Modal>
  </View>;
}

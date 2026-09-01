import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ScreenShell } from '@/src/components';
import { forgeColors } from '@/src/features/forge/ForgePrimitives';
import { parseForgeJoinRouteParams } from '@/src/features/forge/live-protocol';
import { describeJoinFailure, normaliseRelayUrl, probeLanHouse } from '@/src/features/session';
import { createRelayId } from '@/src/features/session/relay-id';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore, type CrewNode } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

export default function ForgeJoinScreen() {
  const params = useLocalSearchParams<{ c?: string | string[]; f?: string | string[]; r?: string | string[]; v?: string | string[] }>();
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const routeTicket = useMemo(() => parseForgeJoinRouteParams(params), [params]);
  const existingName = useHousewireStore((state) => state.crew.find((node) => node.id === state.localNodeId)?.name);
  const rooms = useHousewireStore((state) => state.rooms);
  const [name, setName] = useState(existingName && existingName !== 'You' ? existingName : '');
  const [code, setCode] = useState(routeTicket?.code ?? '');
  const [relay, setRelay] = useState(routeTicket?.relayUrl ?? '');
  const [manualCaseId, setManualCaseId] = useState(routeTicket?.caseId ?? '');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string>();
  const cleanName = name.trim().replace(/\s+/g, ' ').slice(0, 24);
  const ticket = routeTicket ?? parseForgeJoinRouteParams({
    c: code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5),
    f: manualCaseId.trim(),
    r: relay.trim(),
    v: '1',
  });

  const join = async () => {
    if (!ticket || !cleanName || joining) return;
    setJoining(true);
    setError(undefined);
    const relayUrl = normaliseRelayUrl(ticket.relayUrl);
    try {
      await probeLanHouse({ code: ticket.code, relayUrl });
      const current = useHousewireStore.getState();
      const reusable = current.localNodeId !== 'local' &&
        current.crew.some((node) => node.id === current.localNodeId);
      const nodeId = reusable ? current.localNodeId : createRelayId('forge-guest');
      const room = rooms.find((candidate) => candidate.safe) ?? rooms[0];
      const node: CrewNode = {
        id: nodeId,
        name: cleanName,
        initials: initialsFor(cleanName),
        nodeNumber: 2,
        role: 'listener',
        roomId: room?.id ?? 'living',
        color: '#FFD84A',
        connected: true,
        simulated: false,
      };
      current.setCrew([node]);
      current.setLocalNodeId(nodeId);
      current.prepareSession('lan', ticket.code, relayUrl);
      play('relay', 0.58);
      router.replace({ pathname: '/forge-live', params: { guest: '1', id: ticket.caseId } } as never);
    } catch (cause) {
      setError(describeJoinFailure(cause));
      setJoining(false);
      play('warning', 0.45);
    }
  };

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.page}>
        <View style={styles.topline}>
          <Pressable accessibilityLabel="Close invite" accessibilityRole="button" onPress={() => router.back()} style={[styles.iconButton, { borderColor: theme.colors.draft }]}>
            <Ionicons color={theme.colors.text} name="close" size={21} />
          </Pressable>
          <View style={styles.wordmark}>
            <Text style={[styles.brand, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>CASE FORGE</Text>
            <Text style={[styles.brandMeta, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>PRIVATE ROLE ADMISSION</Text>
          </View>
          <View style={[styles.liveDot, { backgroundColor: forgeColors.ink }]} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.ticket, { borderColor: forgeColors.ink }]}>
            <View style={styles.ticketNotch} />
            <Text style={[styles.ticketLabel, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>LIVE CUT · {ticket?.code ?? 'MANUAL ENTRY'}</Text>
            <Text style={[styles.ticketTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>CLAIM ONE ROLE.</Text>
            <Text style={[styles.ticketBody, { color: theme.colors.muted, fontFamily: theme.typography.families.storyBold }]}>The host will send this phone one private case file. Other players cannot open your clues.</Text>
            <View style={[styles.caseSerial, { borderColor: theme.colors.draft }]}>
              <Ionicons color={forgeColors.ink} name="document-lock-outline" size={19} />
              <Text numberOfLines={1} style={[styles.caseSerialText, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>FILE / {ticket?.caseId.slice(-12).toUpperCase() ?? 'ENTER THE HOST FILE ID'}</Text>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>NAME ON THIS ROLE PLATE</Text>
            <TextInput
              accessibilityLabel="Your player name"
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={24}
              onChangeText={(value) => {
                setName(value);
                setError(undefined);
              }}
              onSubmitEditing={() => void join()}
              placeholder="Mara"
              placeholderTextColor={theme.colors.faint}
              returnKeyType="go"
              selectionColor={forgeColors.ink}
              style={[styles.input, { borderColor: cleanName ? forgeColors.ink : theme.colors.draft, color: theme.colors.text, fontFamily: theme.typography.families.display }]}
              value={name}
            />
          </View>

          {!routeTicket ? (
            <View style={[styles.manualForm, { borderColor: theme.colors.draft }]}>
              <Text style={[styles.manualHeading, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>QR NOT AVAILABLE · TYPE THE HOST PLATE</Text>
              <ManualField label="Room code" maxLength={5} onChangeText={(value) => setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="7K3MW" value={code} />
              <ManualField label="Host relay" onChangeText={setRelay} placeholder="ws://192.168.1.8:8787" value={relay} />
              <ManualField autoCapitalize="none" label="Full case file id" onChangeText={setManualCaseId} placeholder="forge-clockwork-manor-…-7CHARS" value={manualCaseId} />
            </View>
          ) : null}

          {error ? (
            <View accessibilityLiveRegion="assertive" style={[styles.error, { borderColor: theme.colors.fault }]}>
              <Ionicons color={theme.colors.fault} name="warning-outline" size={18} />
              <Text style={[styles.errorText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={!cleanName || !ticket || joining}
            onPress={() => void join()}
            style={({ pressed }) => [styles.joinButton, { backgroundColor: cleanName && ticket ? forgeColors.ink : theme.colors.draft }, pressed && styles.pressed]}
          >
            <Text style={[styles.joinText, { color: cleanName && ticket ? forgeColors.dark : theme.colors.faint, fontFamily: theme.typography.families.bodyMedium }]}>{joining ? 'Checking the house…' : ticket ? 'Enter the live case' : 'Complete the host plate'}</Text>
            <Ionicons color={cleanName && ticket ? forgeColors.dark : theme.colors.faint} name={joining ? 'radio-outline' : 'arrow-forward'} size={20} />
          </Pressable>

          <Text style={[styles.privacy, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>Nothing is uploaded. The case travels directly through the host&apos;s local HOUSEWIRE relay.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

function ManualField({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.manualField}>
      <Text style={[styles.manualLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholderTextColor={theme.colors.faint}
        selectionColor={forgeColors.ink}
        style={[styles.manualInput, { borderColor: theme.colors.draft, color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}
        {...props}
      />
    </View>
  );
}

function initialsFor(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'P';
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, gap: 21, justifyContent: 'center', paddingBottom: 34, paddingHorizontal: 22, paddingTop: 18 },
  brand: { fontSize: 23, lineHeight: 22 },
  brandMeta: { fontSize: 7, letterSpacing: 1.15 },
  centerState: { alignItems: 'center', flex: 1, gap: 13, justifyContent: 'center', paddingHorizontal: 24 },
  caseSerial: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 8, marginTop: 8, paddingTop: 12 },
  caseSerialText: { flex: 1, fontSize: 8, letterSpacing: 0.8 },
  error: { alignItems: 'center', borderLeftWidth: 3, flexDirection: 'row', gap: 9, paddingLeft: 10, paddingVertical: 8 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 8, letterSpacing: 1.2 },
  iconButton: { alignItems: 'center', borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  input: { borderBottomWidth: 2, fontSize: 31, minHeight: 58, paddingHorizontal: 2, paddingVertical: 8, textTransform: 'uppercase' },
  joinButton: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 16 },
  joinText: { fontSize: 17 },
  liveDot: { borderRadius: 5, height: 10, width: 10 },
  page: { flex: 1 },
  manualField: { gap: 4 },
  manualForm: { borderLeftWidth: 2, gap: 11, paddingLeft: 12 },
  manualHeading: { fontSize: 8, letterSpacing: 1 },
  manualInput: { borderBottomWidth: 1, fontSize: 11, minHeight: 40, paddingHorizontal: 2 },
  manualLabel: { fontSize: 10 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  privacy: { alignSelf: 'center', fontSize: 10, lineHeight: 15, maxWidth: 310, textAlign: 'center' },
  secondaryButton: { alignItems: 'center', borderWidth: 1, justifyContent: 'center', minHeight: 50, width: '100%' },
  secondaryText: { fontSize: 14 },
  stateBody: { fontSize: 14, lineHeight: 20, maxWidth: 300, textAlign: 'center' },
  stateTitle: { fontSize: 42, lineHeight: 40, textAlign: 'center' },
  ticket: { borderLeftWidth: 4, borderTopWidth: 1, gap: 9, padding: 17, position: 'relative' },
  ticketBody: { fontSize: 20, lineHeight: 25 },
  ticketLabel: { fontSize: 8, letterSpacing: 1.4 },
  ticketNotch: { backgroundColor: '#070806', height: 20, position: 'absolute', right: -1, top: 36, transform: [{ rotate: '45deg' }], width: 20 },
  ticketTitle: { fontSize: 47, lineHeight: 44 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10 },
  wordmark: { alignItems: 'center' },
});

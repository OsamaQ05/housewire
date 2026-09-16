import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BreakerButton, OperationalLabel } from '@/src/components';
import { connectionSettingsForLaptop } from '@/src/domain/connection-settings';
import { defaultAiServiceUrl, defaultRelayServiceUrl } from '@/src/services/runtime-connections';
import { useConnectionSettingsStore } from '@/src/store/use-connection-settings-store';
import { useHousewireTheme } from '@/src/theme';
import { inspectAiConnection, inspectRelayConnection, type ServiceHealth } from './connection-health';

export function ConnectionSettingsPanel() {
  const { theme } = useHousewireTheme();
  const save = useConnectionSettingsStore(state => state.save);
  const storageError = useConnectionSettingsStore(state => state.storageError);
  const [expanded, setExpanded] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [laptop, setLaptop] = useState('');
  const [relay, setRelay] = useState(defaultRelayServiceUrl);
  const [ai, setAi] = useState(() => { try { return defaultAiServiceUrl(); } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [health, setHealth] = useState<{ relay: ServiceHealth; ai: ServiceHealth }>();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const body = { color: theme.colors.muted, fontFamily: theme.typography.families.body };
  const input = [styles.input, { color: theme.colors.text, borderColor: theme.colors.draft, fontFamily: theme.typography.families.body }];

  const saveAndCheck = async () => {
    if (busy) return;
    setBusy(true); setNotice(''); setHealth(undefined);
    try {
      const next = !advanced && laptop.trim() ? connectionSettingsForLaptop(laptop) : { relayUrl: relay, aiUrl: ai };
      if (!next.relayUrl && !next.aiUrl) throw new Error('Add your laptop’s Wi-Fi IP address, or open Separate server addresses.');
      await save(next);
      setRelay(next.relayUrl); setAi(next.aiUrl);
      const effectiveRelay = defaultRelayServiceUrl();
      let effectiveAi = '';
      try { effectiveAi = defaultAiServiceUrl(); } catch { /* Optional AI can remain unset. */ }
      const [relayHealth, aiHealth] = await Promise.all([inspectRelayConnection(effectiveRelay), inspectAiConnection(effectiveAi)]);
      if (alive.current) { setHealth({ relay: relayHealth, ai: aiHealth }); setNotice('Saved on this phone. Leave and re-create any open multiplayer room to use a changed address.'); }
    } catch (error) { if (alive.current) setNotice(error instanceof Error ? error.message : 'Could not save these addresses.'); }
    finally { if (alive.current) setBusy(false); }
  };

  return <View style={[styles.panel, { borderColor: theme.colors.draft }]}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.heading}>
      <View style={styles.headingCopy}>
        <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>PHONE CONNECTION</Text>
        <Text style={[styles.copy, body]}>AI & multiplayer server settings</Text>
      </View>
      <Text style={[styles.toggle, { color: theme.colors.ready }]}>{expanded ? '−' : '+'}</Text>
    </Pressable>
    {expanded ? <View style={styles.details}>
      <Text style={[styles.copy, body]}>One-phone games work offline. For AI and connected phones, keep the laptop server running on the same Wi-Fi, or use your hosted server.</Text>
      {!advanced ? <>
        <OperationalLabel>Laptop Wi-Fi IP address</OperationalLabel>
        <TextInput accessibilityLabel="Laptop Wi-Fi IP address" value={laptop} onChangeText={setLaptop} autoCapitalize="none" autoCorrect={false} placeholder="192.168.1.8" placeholderTextColor={theme.colors.faint} style={input} />
        <Text style={[styles.small, body]}>Only needed if the laptop’s address changed. Never enter an API key here.</Text>
      </> : <>
        <OperationalLabel>Multiplayer address</OperationalLabel>
        <TextInput accessibilityLabel="Multiplayer server address" value={relay} onChangeText={setRelay} autoCapitalize="none" autoCorrect={false} placeholder="wss://relay.example.com" placeholderTextColor={theme.colors.faint} style={input} />
        <OperationalLabel>AI server address</OperationalLabel>
        <TextInput accessibilityLabel="AI server address" value={ai} onChangeText={setAi} autoCapitalize="none" autoCorrect={false} placeholder="https://ai.example.com" placeholderTextColor={theme.colors.faint} style={input} />
        <Text style={[styles.small, body]}>The two services can have different addresses. API keys stay on the server.</Text>
      </>}
      <Pressable accessibilityRole="button" onPress={() => setAdvanced(!advanced)} style={styles.link}><Text style={[styles.copy, { color: theme.colors.ready }]}>{advanced ? 'Use one laptop address' : 'Separate server addresses'}</Text></Pressable>
      <BreakerButton label={busy ? 'Checking connections…' : 'Save & check connection'} onPress={() => { void saveAndCheck(); }} variant="secondary" disabled={busy} />
      {busy ? <ActivityIndicator color={theme.colors.ready} /> : null}
      {health ? <View style={styles.results}>
        <Text accessibilityLiveRegion="polite" style={[styles.copy, { color: health.relay.connected ? theme.colors.ready : theme.colors.muted }]}>{health.relay.connected ? '✓ ' : '— '}{health.relay.message}</Text>
        <Text accessibilityLiveRegion="polite" style={[styles.copy, { color: health.ai.connected ? theme.colors.ready : theme.colors.muted }]}>{health.ai.connected ? '✓ ' : '— '}{health.ai.message}</Text>
      </View> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={[styles.small, body]}>{notice}</Text> : null}
      {storageError ? <Text style={[styles.small, { color: theme.colors.fault }]}>Addresses are not saved permanently yet. Please try Save again.</Text> : null}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void save({ relayUrl: '', aiUrl: '' }).then(() => { setLaptop(''); setRelay(defaultRelayServiceUrl()); try { setAi(defaultAiServiceUrl()); } catch { setAi(''); } setHealth(undefined); setNotice('Using the addresses included with this app.'); }).catch(error => setNotice(String(error))); }} style={styles.link}><Text style={[styles.small, body]}>Restore app defaults</Text></Pressable>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { borderBottomWidth: 1, borderTopWidth: 1, paddingVertical: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 48 },
  headingCopy: { flex: 1, gap: 3 },
  title: { fontSize: 26, lineHeight: 29 },
  toggle: { fontSize: 28, paddingHorizontal: 10 },
  copy: { fontSize: 14, lineHeight: 21 },
  small: { fontSize: 12, lineHeight: 18 },
  details: { paddingTop: 18, gap: 12 },
  input: { borderWidth: 1, minHeight: 50, paddingHorizontal: 12, fontSize: 15, borderRadius: 8 },
  link: { minHeight: 44, justifyContent: 'center' },
  results: { gap: 10 },
});

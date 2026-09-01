import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BreakerButton, OperationalLabel, ScreenShell, SectionHeader } from '@/src/components';
import { clearAllForgeStorage } from '@/src/features/forge/forge-storage';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const settings = useHousewireStore((state) => state.settings);
  const updateSettings = useHousewireStore((state) => state.updateSettings);
  const resetProduct = useHousewireStore((state) => state.resetProduct);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const rows = [
    { key: 'daylight' as const, label: 'Daylight plan', detail: 'Bone canvas for bright rooms.' },
    { key: 'reducedMotion' as const, label: 'Reduce movement', detail: 'Replaces traveling signals with immediate state changes.' },
    { key: 'highContrast' as const, label: 'High contrast', detail: 'Strengthens all labels, routes and fault states.' },
    { key: 'haptics' as const, label: 'Haptic signals', detail: 'Tactile cues always keep visual equivalents.' },
    { key: 'sound' as const, label: 'House audio', detail: 'Original mechanical cues and distributed tones.' },
  ];

  return (
    <ScreenShell edgeWire="right" padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topline}>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <OperationalLabel tone="muted">← house</OperationalLabel>
          </Pressable>
          <OperationalLabel tone="wire">service panel</OperationalLabel>
        </View>
        <SectionHeader
          description="Housewire never requires a sensor without a manual path. These controls change the actual rendering, audio and tactile behavior."
          eyebrow="Local controls"
          index="S"
          title="SERVICE"
        />

        <View style={styles.settings}>
          {rows.map((row, index) => {
            const active = settings[row.key];
            return (
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: active }}
                key={row.key}
                onPress={() => updateSettings({ [row.key]: !active })}
                style={[styles.setting, { borderColor: theme.colors.draft }]}
              >
                <OperationalLabel tone={active ? 'ready' : 'muted'}>
                  {String(index + 1).padStart(2, '0')}
                </OperationalLabel>
                <View style={styles.settingCopy}>
                  <Text style={[styles.settingTitle, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{row.label}</Text>
                  <Text style={[styles.settingBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{row.detail}</Text>
                </View>
                <View style={[styles.toggle, { borderColor: active ? theme.colors.ready : theme.colors.faint }]}>
                  <View style={[styles.toggleCore, { backgroundColor: active ? theme.colors.ready : 'transparent' }]} />
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.privacy, { borderColor: theme.colors.draft }]}>
          <OperationalLabel indicator status="ready">privacy circuit closed</OperationalLabel>
          <Text style={[styles.privacyText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>
            Camera frames and motion traces are processed live and never stored. DEAD AIR requests the microphone only for local pressure levels or a 1.8-second recipient-only burst; recorded bytes are removed after playback. Solo play needs no account, API key or backend.
          </Text>
        </View>

        <BreakerButton
          haptic="warning"
          label="Replay first wake"
          onPress={() => setConfirmingReset(true)}
          overline="Resets local progress and tutorial"
          variant="secondary"
        />
      </ScrollView>
      <Modal
        animationType={settings.reducedMotion ? 'none' : 'fade'}
        onRequestClose={() => setConfirmingReset(false)}
        statusBarTranslucent
        transparent
        visible={confirmingReset}
      >
        <View accessibilityViewIsModal style={styles.modalBackdrop}>
          <View style={[styles.resetDialog, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.fault }]}>
            <OperationalLabel tone="fault">LOCAL RESET</OperationalLabel>
            <Text accessibilityRole="header" style={[styles.resetTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>Replay the first wake?</Text>
            <Text style={[styles.resetBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>This clears every local case result, current run, room choice, setting, and tutorial state. It cannot be undone.</Text>
            <View style={styles.resetActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmingReset(false)}
                style={({ pressed }) => [styles.dialogButton, { borderColor: theme.colors.draft }, pressed && styles.pressed]}
              >
                <Text style={[styles.dialogButtonText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Keep my casebook</Text>
              </Pressable>
              <Pressable
                accessibilityHint="Permanently clears all local HOUSEWIRE progress"
                accessibilityRole="button"
                onPress={() => {
                  setConfirmingReset(false);
                  void clearAllForgeStorage().finally(() => {
                    resetProduct();
                    router.replace('/');
                  });
                }}
                style={({ pressed }) => [styles.dialogButton, { backgroundColor: theme.colors.fault, borderColor: theme.colors.fault }, pressed && styles.pressed]}
              >
                <Text style={[styles.dialogButtonText, { color: theme.colors.textInverse, fontFamily: theme.typography.families.bodyMedium }]}>Clear everything</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 24,
    paddingBottom: 48,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  dialogButton: {
    alignItems: 'center',
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 12,
  },
  dialogButtonText: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(2, 6, 5, 0.82)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  pressed: {
    opacity: 0.72,
  },
  privacy: {
    borderBottomWidth: 1,
    borderTopWidth: 1,
    gap: 10,
    paddingVertical: 18,
  },
  privacyText: {
    fontSize: 15,
    lineHeight: 22,
  },
  resetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  resetBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  resetDialog: {
    borderLeftWidth: 4,
    gap: 12,
    maxWidth: 420,
    padding: 20,
    width: '100%',
  },
  resetTitle: {
    fontSize: 32,
    lineHeight: 34,
    textTransform: 'uppercase',
  },
  setting: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 86,
  },
  settingBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  settingCopy: {
    flex: 1,
    gap: 2,
  },
  settings: {
    gap: 0,
  },
  settingTitle: {
    fontSize: 24,
    lineHeight: 26,
    textTransform: 'uppercase',
  },
  toggle: {
    alignItems: 'center',
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 42,
  },
  toggleCore: {
    height: 12,
    width: 28,
  },
  topline: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

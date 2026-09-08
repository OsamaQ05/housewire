import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BreakerButton, OperationalLabel, ScreenShell } from '@/src/components';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

const CASE_CHECK_COPY = {
  'line-13': { eyebrow: 'BEFORE THE CALL', title: 'Check the controls.', subtitle: 'Two quick taps. No motion permissions.' },
  'dead-air': { eyebrow: 'BEFORE THE WALLS ANSWER', title: 'Tune this phone.', subtitle: 'Check sound and touch before the case begins.' },
  'night-glass': { eyebrow: 'BEFORE THE GLASS OPENS', title: 'Wake the lens.', subtitle: 'Check touch and sound. Camera opens only inside its clue.' },
  'long-table': { eyebrow: 'BEFORE MIDNIGHT SERVICE', title: 'Set this place.', subtitle: 'Check touch and sound. Camera opens only inside its puzzle.' },
} as const;

export default function CalibrateScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const calibration = useHousewireStore((state) => state.calibration);
  const selectedMission = useHousewireStore((state) => state.selectedMission);
  const sessionMode = useHousewireStore((state) => state.sessionMode);
  const setCalibration = useHousewireStore((state) => state.setCalibration);
  const resetCalibration = useHousewireStore((state) => state.resetCalibration);
  const hapticsEnabled = useHousewireStore((state) => state.settings.haptics);
  const ready = calibration.motion && calibration.orientation;
  const copy = CASE_CHECK_COPY[selectedMission];

  const completeCheck = (key: 'motion' | 'orientation') => {
    if (calibration[key]) return;
    setCalibration(key, true);
    setCalibration('fallbackMode', true);
    setCalibration('haptics', true);
    play(key === 'motion' ? 'switch' : 'accept', 0.5);
    if (hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  };

  return (
    <ScreenShell edgeWire={ready ? 'both' : 'left'} padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topline}>
          <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.back}>
            <Ionicons color={theme.colors.text} name="arrow-back" size={22} />
          </Pressable>
          <OperationalLabel tone={ready ? 'ready' : 'muted'}>{sessionMode === 'preview' ? 'SOLO' : 'CREW'} · READY CHECK</OperationalLabel>
        </View>

        <View style={styles.heroCopy}>
          <Text style={[styles.eyebrow, { color: theme.colors.wire, fontFamily: theme.typography.families.monoMedium }]}>{copy.eyebrow}</Text>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{copy.title}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{copy.subtitle}</Text>
        </View>

        <View accessibilityLabel={ready ? 'Phone controls ready' : 'Two control checks remaining'} style={[styles.console, { borderColor: ready ? theme.colors.ready : theme.colors.draft }]}>
          <View style={[styles.consoleCore, { backgroundColor: ready ? theme.colors.ready : theme.colors.surfaceRaised }]}>
            <Ionicons color={ready ? theme.colors.background : theme.colors.wire} name={ready ? 'checkmark' : 'finger-print-outline'} size={62} />
          </View>
          <Text style={[styles.consoleState, { color: ready ? theme.colors.ready : theme.colors.text, fontFamily: theme.typography.families.display }]}>{ready ? 'PHONE READY' : 'TAP BOTH CHECKS'}</Text>
        </View>

        <View style={styles.checks}>
          <ReadyCheck complete={calibration.motion} detail="Hear a short game cue" icon="volume-medium-outline" label="Sound" onPress={() => completeCheck('motion')} />
          <ReadyCheck complete={calibration.orientation} detail="Feel the response" icon="finger-print-outline" label="Touch" onPress={() => completeCheck('orientation')} />
        </View>

        {ready ? (
          <View style={styles.finishActions}>
            <BreakerButton haptic="success" label="See my role" onPress={() => router.replace('/briefing')} variant="ready" />
            <Pressable accessibilityRole="button" onPress={resetCalibration} style={styles.textAction}>
              <Text style={[styles.textActionLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>Run check again</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={[styles.privacy, { color: theme.colors.faint, fontFamily: theme.typography.families.mono }]}>NO MOTION OR ORIENTATION ACCESS REQUIRED</Text>
      </ScrollView>
    </ScreenShell>
  );
}

function ReadyCheck({ complete, detail, icon, label, onPress }: { complete: boolean; detail: string; icon: keyof typeof Ionicons.glyphMap; label: string; onPress(): void }) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable accessibilityLabel={`${label}. ${detail}`} accessibilityRole="button" accessibilityState={{ disabled: complete }} disabled={complete} onPress={onPress} style={({ pressed }) => [styles.check, { backgroundColor: complete ? theme.colors.ready : theme.colors.surface, borderColor: complete ? theme.colors.ready : theme.colors.draft }, pressed && styles.pressed]}>
      <View style={[styles.checkIcon, { borderColor: complete ? theme.colors.background : theme.colors.wire }]}>
        <Ionicons color={complete ? theme.colors.background : theme.colors.wire} name={complete ? 'checkmark' : icon} size={28} />
      </View>
      <Text style={[styles.checkTitle, { color: complete ? theme.colors.background : theme.colors.text, fontFamily: theme.typography.families.display }]}>{complete ? 'Ready' : label}</Text>
      <Text style={[styles.checkDetail, { color: complete ? theme.colors.background : theme.colors.muted, fontFamily: theme.typography.families.body }]}>{detail}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  check: { alignItems: 'center', borderRadius: 22, borderWidth: 1, flex: 1, gap: 6, minHeight: 176, padding: 18 },
  checkDetail: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  checkIcon: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 64, justifyContent: 'center', width: 64 },
  checks: { flexDirection: 'row', gap: 12 },
  checkTitle: { fontSize: 25, lineHeight: 28 },
  console: { alignItems: 'center', borderRadius: 30, borderWidth: 1, gap: 18, justifyContent: 'center', minHeight: 270, overflow: 'hidden' },
  consoleCore: { alignItems: 'center', borderRadius: 999, height: 128, justifyContent: 'center', width: 128 },
  consoleState: { fontSize: 17, letterSpacing: 1.4 },
  content: { flexGrow: 1, gap: 22, paddingBottom: 36, paddingHorizontal: 22, paddingTop: 4 },
  eyebrow: { fontSize: 10, letterSpacing: 2.2 },
  finishActions: { gap: 4 },
  heroCopy: { gap: 5 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  privacy: { fontSize: 9, letterSpacing: 0.8, textAlign: 'center' },
  subtitle: { fontSize: 16, lineHeight: 22 },
  textAction: { alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  textActionLabel: { fontSize: 14 },
  title: { fontSize: 48, lineHeight: 49 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});

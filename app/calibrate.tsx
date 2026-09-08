import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BreakerButton, GlyphMark, OperationalLabel, ScreenShell } from '@/src/components';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import {
  ExpoSensorProvider,
  type MotionSample,
  type SensorAvailability,
} from '@/src/services/sensors';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

type ProbeState = 'probing' | 'available' | 'unavailable' | 'requesting' | 'active' | 'complete' | 'error';
type CalibratedKey = 'motion' | 'orientation';

const CASE_CHECK_COPY = {
  'line-13': { eyebrow: 'BEFORE THE CALL', title: 'Wake this phone.', subtitle: 'Lift it. Turn it. That’s it.' },
  'dead-air': { eyebrow: 'BEFORE THE WALLS ANSWER', title: 'Tune this phone.', subtitle: 'Lift it. Turn it. Voice unlocks only inside its clue.' },
  'night-glass': { eyebrow: 'BEFORE THE GLASS OPENS', title: 'Make a pane.', subtitle: 'Lift it. Turn it. The lens stays closed until a door asks.' },
  'long-table': { eyebrow: 'BEFORE MIDNIGHT SERVICE', title: 'Set this place.', subtitle: 'Lift it. Lay it flat. Camera and voice open only inside their puzzles.' },
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
  const provider = useMemo(
    () => new ExpoSensorProvider({ declareHaptics: true, updateIntervalMs: 100 }),
    [],
  );
  const previousSample = useRef<MotionSample | null>(null);
  const orientationOrigin = useRef<{ beta: number; gamma: number } | null>(null);
  const [availability, setAvailability] = useState<SensorAvailability | null>(null);
  const [probeState, setProbeState] = useState<ProbeState>('probing');
  const [sensorError, setSensorError] = useState<string | null>(null);
  const [motionEnergy, setMotionEnergy] = useState(0);
  const [tiltTravel, setTiltTravel] = useState(0);
  const [holding, setHolding] = useState(false);
  const ready = calibration.motion && calibration.orientation;
  const caseCopy = CASE_CHECK_COPY[selectedMission];

  const acknowledge = useCallback(
    (key: CalibratedKey, source: 'sensor' | 'fallback') => {
      const current = useHousewireStore.getState().calibration;
      if (current[key]) return;
      if (source === 'fallback' && !current.fallbackMode) setCalibration('fallbackMode', true);
      setCalibration(key, true);
      setCalibration('haptics', true);
      play('accept', 0.48);
      if (hapticsEnabled) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      }
    },
    [hapticsEnabled, play, setCalibration],
  );

  useEffect(() => {
    let active = true;
    setProbeState('probing');
    void provider
      .probe()
      .then((result) => {
        if (!active) return;
        setAvailability(result);
        const hasMotion = result.capabilities.includes('motion');
        const hasOrientation = result.capabilities.includes('orientation');
        setProbeState(hasMotion && hasOrientation ? 'available' : 'unavailable');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setProbeState('error');
        setSensorError(error instanceof Error ? error.message : 'Motion could not be checked.');
      });

    const unsubscribe = provider.subscribe((event) => {
      if (event.stream !== 'motion') return;
      const sample = event.sample;
      const prior = previousSample.current;
      previousSample.current = sample;

      if (!orientationOrigin.current && sample.beta !== undefined && sample.gamma !== undefined) {
        orientationOrigin.current = { beta: sample.beta, gamma: sample.gamma };
      }

      if (prior) {
        const accelerationDelta = Math.sqrt(
          (sample.x - prior.x) ** 2 +
            (sample.y - prior.y) ** 2 +
            (sample.z - prior.z) ** 2,
        );
        const rotationRate =
          Math.abs(sample.rotationRateAlpha ?? 0) +
          Math.abs(sample.rotationRateBeta ?? 0) +
          Math.abs(sample.rotationRateGamma ?? 0);
        const energy = Math.min(1, Math.max(accelerationDelta / 2.2, rotationRate / 180));
        setMotionEnergy(energy);
        if (accelerationDelta > 0.72 || rotationRate > 32) acknowledge('motion', 'sensor');
      }

      const origin = orientationOrigin.current;
      if (origin && sample.beta !== undefined && sample.gamma !== undefined) {
        const travel = Math.sqrt(
          (sample.beta - origin.beta) ** 2 + (sample.gamma - origin.gamma) ** 2,
        );
        setTiltTravel(Math.min(1, travel / 0.62));
        if (travel > 0.24) acknowledge('orientation', 'sensor');
      }
    });

    return () => {
      active = false;
      unsubscribe();
      void provider.stop();
    };
  }, [acknowledge, provider]);

  useEffect(() => {
    if (!ready || probeState !== 'active') return;
    setProbeState('complete');
    void provider.stop();
  }, [probeState, provider, ready]);

  const startSensorTest = async () => {
    setSensorError(null);
    setProbeState('requesting');
    previousSample.current = null;
    orientationOrigin.current = null;
    setMotionEnergy(0);
    setTiltTravel(0);
    try {
      const result = await provider.probe();
      setAvailability(result);
      if (!result.capabilities.includes('motion') || !result.capabilities.includes('orientation')) {
        throw new Error(result.unavailableReasons.motion ?? 'This phone has no motion sensor.');
      }
      // Expo v54 requires this permission request to follow a user gesture on mobile web.
      await provider.start(['motion']);
      setCalibration('haptics', true);
      setProbeState('active');
      play('switch', 0.5);
      if (hapticsEnabled) void Haptics.selectionAsync().catch(() => undefined);
    } catch (error: unknown) {
      await provider.stop();
      setProbeState('error');
      setSensorError(error instanceof Error ? error.message : 'Motion did not answer.');
      play('warning', 0.42);
    }
  };

  const openFallback = async () => {
    await provider.stop();
    setCalibration('fallbackMode', true);
    setProbeState('complete');
    setSensorError(null);
    play('switch', 0.42);
  };

  const restart = async () => {
    await provider.stop();
    resetCalibration();
    previousSample.current = null;
    orientationOrigin.current = null;
    setMotionEnergy(0);
    setTiltTravel(0);
    setSensorError(null);
    const canUseMotion = availability?.capabilities.includes('motion') ?? false;
    setProbeState(canUseMotion ? 'available' : 'unavailable');
  };

  const continueToBriefing = async () => {
    if (!ready) return;
    await provider.stop();
    setCalibration('haptics', true);
    play('relay', 0.56);
    router.replace('/briefing');
  };

  const physicalAvailable =
    availability?.capabilities.includes('motion') === true &&
    availability.capabilities.includes('orientation');
  const sensorActive = probeState === 'active' || probeState === 'requesting';

  return (
    <ScreenShell edgeWire={ready ? 'both' : 'left'} padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topline}>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.back}>
            <Text style={[styles.backText, { color: theme.colors.muted }]}>‹ Back</Text>
          </Pressable>
          <OperationalLabel tone={ready ? 'ready' : sensorActive ? 'wire' : 'muted'}>
            {sessionMode === 'preview' ? 'SOLO' : 'CREW'} · DEVICE CHECK
          </OperationalLabel>
        </View>

        <View style={styles.heroCopy}>
          <Text style={[styles.eyebrow, { color: theme.colors.wire, fontFamily: theme.typography.families.monoMedium }]}>{caseCopy.eyebrow}</Text>
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{caseCopy.title}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{caseCopy.subtitle}</Text>
        </View>

        <View
          accessibilityLabel={ready ? 'Phone motion check complete' : sensorActive ? 'Move and turn the phone now' : 'Phone motion check'}
          style={styles.motionStage}
        >
          <View style={[styles.outerRing, { borderColor: ready ? theme.colors.ready : theme.colors.draft }]} />
          <View style={[styles.middleRing, { borderColor: ready ? theme.colors.ready : theme.colors.faint }]} />
          <View style={[styles.wireLeft, { backgroundColor: ready ? theme.colors.ready : theme.colors.wire }]} />
          <View
            style={[
              styles.phone,
              {
                backgroundColor: ready ? theme.colors.ready : theme.colors.surfaceRaised,
                borderColor: ready ? theme.colors.ready : sensorActive ? theme.colors.wire : theme.colors.draft,
                transform: [
                  { translateX: (tiltTravel - 0.5) * 34 },
                  { rotate: `${tiltTravel * 24 - 12}deg` },
                  { scale: 1 + motionEnergy * 0.08 },
                ],
              },
            ]}
          >
            <View style={[styles.phoneSpeaker, { backgroundColor: ready ? theme.colors.background : theme.colors.faint }]} />
            <GlyphMark color={ready ? theme.colors.background : theme.colors.wire} glyph="EYE" size={58} />
            <View style={[styles.phoneHome, { borderColor: ready ? theme.colors.background : theme.colors.faint }]} />
          </View>
          <Text style={[styles.stagePrompt, { color: ready ? theme.colors.ready : theme.colors.text, fontFamily: theme.typography.families.display }]}>
            {ready ? 'READY' : sensorActive ? 'MOVE + TURN' : 'PHONE AS CONTROLLER'}
          </Text>
        </View>

        <View style={styles.checks}>
          <CheckStep complete={calibration.motion} index="1" label="Lift" />
          <View style={[styles.checkWire, { backgroundColor: calibration.motion ? theme.colors.ready : theme.colors.draft }]} />
          <CheckStep complete={calibration.orientation} index="2" label="Turn" />
        </View>

        {sensorError ? (
          <View accessibilityLiveRegion="polite" style={[styles.errorBand, { borderColor: theme.colors.fault }]}>
            <OperationalLabel tone="fault">MOTION UNAVAILABLE</OperationalLabel>
            <Text style={[styles.errorText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{sensorError}</Text>
          </View>
        ) : null}

        {!calibration.fallbackMode && !ready ? (
          <View style={styles.actions}>
            <BreakerButton
              disabled={sensorActive || probeState === 'probing'}
              haptic="rigid"
              label={sensorActive ? 'Move it now' : probeState === 'probing' ? 'Checking phone' : physicalAvailable ? 'Start check' : 'Try motion'}
              loading={probeState === 'probing' || probeState === 'requesting'}
              onPress={() => void startSensorTest()}
            />
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void openFallback()} style={styles.textAction}>
              <Text style={[styles.textActionLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>No motion sensor? Use touch instead</Text>
            </Pressable>
          </View>
        ) : null}

        {calibration.fallbackMode && !ready ? (
          <View style={styles.manualPanel}>
            <Text style={[styles.manualTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Touch check</Text>
            <View style={styles.manualActions}>
              <ManualAction complete={calibration.motion} label="Tap" onPress={() => acknowledge('motion', 'fallback')} />
              <ManualAction
                complete={calibration.orientation}
                label={holding ? 'Turning' : 'Turn'}
                onPress={() => {
                  acknowledge('orientation', 'fallback');
                  setHolding(false);
                }}
                onPressIn={() => setHolding(true)}
                onPressOut={() => setHolding(false)}
              />
            </View>
          </View>
        ) : null}

        {ready ? (
          <View style={styles.finishActions}>
            <BreakerButton haptic="success" label="See my role" onPress={() => void continueToBriefing()} variant="ready" />
            <Pressable accessibilityRole="button" onPress={() => void restart()} style={styles.textAction}>
              <Text style={[styles.textActionLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>Run check again</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={[styles.privacy, { color: theme.colors.faint, fontFamily: theme.typography.families.mono }]}>Motion stays on this phone.</Text>
      </ScrollView>
    </ScreenShell>
  );
}

function CheckStep({ complete, index, label }: { complete: boolean; index: string; label: string }) {
  const { theme } = useHousewireTheme();
  return (
    <View accessible accessibilityLabel={`${label}: ${complete ? 'complete' : 'waiting'}`} style={styles.checkStep}>
      <View style={[styles.checkDot, { backgroundColor: complete ? theme.colors.ready : 'transparent', borderColor: complete ? theme.colors.ready : theme.colors.faint }]}>
        <Text style={[styles.checkNumber, { color: complete ? theme.colors.background : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{complete ? '✓' : index}</Text>
      </View>
      <Text style={[styles.checkLabel, { color: complete ? theme.colors.ready : theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
    </View>
  );
}

function ManualAction({
  complete,
  label,
  onLongPress,
  onPress,
  onPressIn,
  onPressOut,
}: {
  complete: boolean;
  label: string;
  onLongPress?: () => void;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
}) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable
      accessibilityLabel={`${label}. ${complete ? 'Complete' : ''}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: complete }}
      delayLongPress={900}
      disabled={complete}
      onLongPress={onLongPress}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.manualAction,
        {
          backgroundColor: complete ? theme.colors.ready : pressed ? theme.colors.wire : theme.colors.surface,
          borderColor: complete ? theme.colors.ready : theme.colors.wire,
        },
      ]}
    >
      <Text style={[styles.manualLabel, { color: complete ? theme.colors.background : theme.colors.text, fontFamily: theme.typography.families.display }]}>{complete ? 'DONE' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 4 },
  back: { justifyContent: 'center', minHeight: 44, minWidth: 58 },
  backText: { fontSize: 16 },
  checkDot: { alignItems: 'center', borderRadius: 22, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  checkLabel: { fontSize: 15 },
  checkNumber: { fontSize: 13 },
  checkStep: { alignItems: 'center', gap: 8 },
  checks: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 44 },
  checkWire: { height: 1, marginBottom: 26, width: 78 },
  content: { flexGrow: 1, gap: 20, paddingBottom: 36, paddingHorizontal: 22, paddingTop: 4 },
  errorBand: { borderLeftWidth: 3, gap: 4, paddingLeft: 12, paddingVertical: 5 },
  errorText: { fontSize: 14, lineHeight: 20 },
  eyebrow: { fontSize: 10, letterSpacing: 2.2 },
  finishActions: { gap: 4 },
  heroCopy: { gap: 4 },
  manualAction: { alignItems: 'center', aspectRatio: 1, borderRadius: 999, borderWidth: 1, flex: 1, justifyContent: 'center', maxWidth: 138 },
  manualActions: { flexDirection: 'row', gap: 18, justifyContent: 'center' },
  manualLabel: { fontSize: 23, lineHeight: 25, textTransform: 'uppercase' },
  manualPanel: { gap: 14 },
  manualTitle: { fontSize: 28, textAlign: 'center' },
  middleRing: { borderRadius: 86, borderWidth: 1, height: 172, position: 'absolute', width: 172 },
  motionStage: { alignItems: 'center', height: 266, justifyContent: 'center', overflow: 'hidden' },
  outerRing: { borderRadius: 112, borderWidth: 1, height: 224, opacity: 0.48, position: 'absolute', width: 224 },
  phone: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 148, justifyContent: 'center', width: 82 },
  phoneHome: { borderRadius: 5, borderWidth: 1, bottom: 9, height: 9, position: 'absolute', width: 9 },
  phoneSpeaker: { borderRadius: 2, height: 3, position: 'absolute', top: 10, width: 22 },
  privacy: { fontSize: 10, letterSpacing: 0.7, textAlign: 'center', textTransform: 'uppercase' },
  stagePrompt: { bottom: 0, fontSize: 18, letterSpacing: 1.3, position: 'absolute', textTransform: 'uppercase' },
  subtitle: { fontSize: 16, lineHeight: 22 },
  textAction: { alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingHorizontal: 10 },
  textActionLabel: { fontSize: 14 },
  title: { fontSize: 50, lineHeight: 50 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  wireLeft: { height: 3, left: 0, position: 'absolute', right: '72%', top: '50%' },
});

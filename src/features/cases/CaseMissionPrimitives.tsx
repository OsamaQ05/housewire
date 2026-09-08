import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-svg';

import type { GrossPose } from '@/src/domain/escape-case-compiler';
import type { TerminalMotionSnapshot } from '@/src/hooks/use-terminal-motion';
import type { CrewNode } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

export function CaseStageScaffold({
  accent,
  children,
  instruction,
  stageNumber,
  title,
}: {
  accent: string;
  children: ReactNode;
  instruction: string;
  stageNumber: number;
  title: string;
}) {
  const { theme } = useHousewireTheme();
  return (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.scaffold}>
      <View style={styles.heading}>
        <Text style={[styles.stageNumber, { color: accent, fontFamily: theme.typography.families.displayHeavy }]}>{String(stageNumber).padStart(2, '0')}</Text>
        <View style={styles.headingCopy}>
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{title}</Text>
        </View>
      </View>
      <View style={[styles.doNow, { borderColor: accent }]}>
        <TechnicalLabel color={accent}>Your next move</TechnicalLabel>
        <Text style={[styles.instruction, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{instruction}</Text>
      </View>
      {children}
    </Animated.View>
  );
}

export function StagePanel({ children, tone }: { children: ReactNode; tone?: string }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.colors.surface, borderColor: tone ?? theme.colors.draft }]}>
      {children}
    </View>
  );
}

export function TechnicalLabel({ children, color }: { children: ReactNode; color?: string }) {
  const { theme } = useHousewireTheme();
  return <Text style={[styles.technical, { color: color ?? theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{children}</Text>;
}

export function ActionButton({
  accent,
  disabled = false,
  icon = 'arrow-forward',
  label,
  onPress,
  secondary = false,
}: {
  accent: string;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: secondary ? 'transparent' : accent, borderColor: secondary ? theme.colors.draft : accent },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionText, { color: secondary ? theme.colors.text : '#07100D', fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
      <Ionicons color={secondary ? theme.colors.text : '#07100D'} name={icon} size={20} />
    </Pressable>
  );
}

export function ChoiceChip({
  accent,
  disabled = false,
  label,
  onPress,
  selected = false,
}: {
  accent: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? accent : 'transparent', borderColor: selected ? accent : theme.colors.draft },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? '#07100D' : theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
    </Pressable>
  );
}

export function RoleStepper({
  activeNodeId,
  crew,
  enabled,
  onChange,
}: {
  activeNodeId: string;
  crew: readonly CrewNode[];
  enabled: boolean;
  onChange: (nodeId: string) => void;
}) {
  const { theme } = useHousewireTheme();
  if (!enabled) return null;
  return (
    <View style={styles.stepper}>
      <TechnicalLabel color={theme.colors.warning}>One-phone preview · switch player</TechnicalLabel>
      <View style={styles.stepperRow}>
        {crew.map((node) => (
          <Pressable
            accessibilityLabel={`View ${node.name}'s phone`}
            accessibilityRole="button"
            accessibilityState={{ selected: node.id === activeNodeId }}
            key={node.id}
            onPress={() => onChange(node.id)}
            style={[
              styles.node,
              {
                backgroundColor: node.id === activeNodeId ? node.color : 'transparent',
                borderColor: node.id === activeNodeId ? node.color : theme.colors.draft,
              },
            ]}
          >
            <Text style={[styles.nodeText, { color: node.id === activeNodeId ? '#07100D' : theme.colors.text, fontFamily: theme.typography.families.display }]}>{node.nodeNumber}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function WaitingPanel({ accent, detail, title = 'You are ready. Waiting for the others.' }: { accent: string; detail: string; title?: string }) {
  const { theme } = useHousewireTheme();
  return (
    <StagePanel tone={accent}>
      <View style={styles.waitingIcon}><Ionicons color={accent} name="radio-outline" size={29} /></View>
      <Text style={[styles.waitingTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{title}</Text>
      <Text style={[styles.waitingDetail, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{detail}</Text>
    </StagePanel>
  );
}

export function HoldContact({
  accent,
  durationMs = 900,
  label,
  onComplete,
}: {
  accent: string;
  durationMs?: number;
  label: string;
  onComplete: () => void;
}) {
  const { theme } = useHousewireTheme();
  const [progress, setProgress] = useState(0);
  const startedAtRef = useRef<number | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = undefined;
    startedAtRef.current = undefined;
    setProgress(0);
  };
  const start = () => {
    if (timerRef.current) return;
    startedAtRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const next = Math.min(1, (Date.now() - (startedAtRef.current ?? Date.now())) / durationMs);
      setProgress(next);
      if (next >= 1) {
        stop();
        onComplete();
      }
    }, 40);
  };
  useEffect(() => () => stop(), []);
  return (
    <Pressable
      accessibilityActions={[{ label: `Complete ${label}`, name: 'activate' }]}
      accessibilityHint={`Hold for ${Math.round(durationMs / 100) / 10} seconds`}
      accessibilityLabel={label}
      accessibilityRole="button"
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName !== 'activate') return;
        stop();
        onComplete();
      }}
      onPressIn={start}
      onPressOut={stop}
      style={({ pressed }) => [styles.hold, { borderColor: accent }, pressed && styles.pressed]}
    >
      <View style={[styles.holdFill, { backgroundColor: accent, width: `${Math.max(3, progress * 100)}%` }]} />
      <Text style={[styles.holdText, { color: progress > 0.5 ? '#07100D' : theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{progress > 0 ? `${Math.round(progress * 100)}%` : label}</Text>
    </Pressable>
  );
}

export function poseMatches(motion: TerminalMotionSnapshot, pose: GrossPose): boolean {
  if (!motion.active) return false;
  if (pose === 'FLAT') return motion.flatness >= 0.78 && motion.steadiness >= 0.62;
  if (pose === 'UPRIGHT') return motion.flatness <= 0.46 && motion.steadiness >= 0.55;
  if (pose === 'LEFT') return motion.tiltX <= -0.42 && motion.steadiness >= 0.48;
  if (pose === 'RIGHT') return motion.tiltX >= 0.42 && motion.steadiness >= 0.48;
  if (pose === 'AWAY') return motion.tiltY <= -0.42 && motion.steadiness >= 0.48;
  return motion.tiltY >= 0.42 && motion.steadiness >= 0.48;
}

export function PoseLock({
  accent,
  motion,
  onArmMotion,
  onComplete,
  pose,
}: {
  accent: string;
  motion: TerminalMotionSnapshot;
  onArmMotion: () => void;
  onComplete: () => void;
  pose: GrossPose;
}) {
  const { theme } = useHousewireTheme();
  const [matchStartedAt, setMatchStartedAt] = useState<number>();
  const matched = poseMatches(motion, pose);
  useEffect(() => {
    if (!matched) {
      setMatchStartedAt(undefined);
      return;
    }
    setMatchStartedAt((current) => current ?? Date.now());
  }, [matched]);
  useEffect(() => {
    if (!matchStartedAt) return;
    const timeout = setTimeout(onComplete, Math.max(0, 900 - (Date.now() - matchStartedAt)));
    return () => clearTimeout(timeout);
  }, [matchStartedAt, onComplete]);
  return (
    <StagePanel tone={matched ? accent : undefined}>
      <View style={styles.poseTopline}>
        <View style={[styles.posePhone, { borderColor: matched ? accent : theme.colors.draft, transform: [{ rotate: poseRotation(pose) }] }]}>
          <View style={[styles.poseSpeaker, { backgroundColor: accent }]} />
        </View>
        <View style={styles.poseCopy}>
          <TechnicalLabel color={accent}>ASSIGNED POSE</TechnicalLabel>
          <Text style={[styles.poseName, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{pose}</Text>
          <Text style={[styles.poseTelemetry, { color: matched ? accent : theme.colors.muted, fontFamily: theme.typography.families.mono }]}>{motion.active ? matched ? 'LOCKED · HOLD' : `X ${motion.tiltX.toFixed(2)} · Y ${motion.tiltY.toFixed(2)}` : 'MOTION SLEEPING'}</Text>
        </View>
      </View>
      {!motion.active && motion.available !== false && !motion.denied ? <ActionButton accent={accent} icon="phone-portrait-outline" label="Arm phone motion" onPress={onArmMotion} secondary /> : null}
      {!motion.active || motion.denied || motion.available === false ? <HoldContact accent={accent} durationMs={1_100} label={`Hold ${pose}`} onComplete={onComplete} /> : null}
    </StagePanel>
  );
}

function poseRotation(pose: GrossPose) {
  if (pose === 'LEFT') return '-28deg';
  if (pose === 'RIGHT') return '28deg';
  if (pose === 'AWAY') return '180deg';
  if (pose === 'FLAT') return '90deg';
  return '0deg';
}

export function QrMarker({ accent, label, token }: { accent: string; label: string; token: string }) {
  const { theme } = useHousewireTheme();
  const suffix = token.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-5);
  return (
    <Animated.View entering={FadeIn.duration(280)} style={[styles.marker, { backgroundColor: '#F5F0E4', borderColor: accent }]}>
      <QRCode backgroundColor="#F5F0E4" color="#07100D" quietZone={8} size={190} value={token} />
      <Text style={[styles.markerLabel, { color: '#07100D', fontFamily: theme.typography.families.displayHeavy }]}>{label}</Text>
      <Text style={[styles.markerCode, { color: '#39403B', fontFamily: theme.typography.families.monoMedium }]}>{suffix}</Text>
    </Animated.View>
  );
}

export function QrScanner({
  accent,
  expectedToken,
  onScanned,
}: {
  accent: string;
  expectedToken: string;
  onScanned: () => void;
}) {
  const { theme } = useHousewireTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState('');
  const [feedback, setFeedback] = useState<'camera-denied' | 'camera-unavailable' | 'wrong-seal' | null>(null);
  const suffix = expectedToken.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-5);
  const scan = (result: BarcodeScanningResult) => {
    if (result.data !== expectedToken) {
      setFeedback('wrong-seal');
      return;
    }
    setOpen(false);
    setFeedback(null);
    onScanned();
  };
  const openCamera = async () => {
    setFeedback(null);
    try {
      const granted = permission?.granted ? permission : await requestPermission();
      if (granted.granted) {
        setOpen(true);
        return;
      }
      setFeedback('camera-denied');
    } catch {
      setFeedback('camera-unavailable');
    }
  };
  if (open && permission?.granted) {
    return (
      <View style={[styles.camera, { borderColor: accent }]}>
        <CameraView
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scan}
          onMountError={() => {
            setOpen(false);
            setFeedback('camera-unavailable');
          }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.reticle, { borderColor: accent }]} />
        <Pressable accessibilityLabel="Close camera" accessibilityRole="button" onPress={() => setOpen(false)} style={styles.closeCamera}>
          <Ionicons color="#FFFFFF" name="close" size={24} />
        </Pressable>
        <Text style={[styles.cameraCopy, { color: '#FFFFFF', fontFamily: theme.typography.families.monoMedium }]}>ALIGN THE OTHER PHONE&apos;S SEAL</Text>
      </View>
    );
  }
  const feedbackCopy = feedback === 'wrong-seal'
    ? 'That seal belongs to another door.'
    : feedback === 'camera-denied'
      ? 'Camera access was not granted. Read the other phone\'s five-character seal aloud and enter it here.'
      : feedback === 'camera-unavailable'
        ? 'The clue lens could not open on this phone. Read the other phone\'s five-character seal aloud and enter it here.'
        : 'No camera? Read the five-character seal aloud.';
  return (
    <StagePanel tone={feedback ? theme.colors.fault : undefined}>
      <ActionButton accent={accent} icon="scan" label="Open clue lens" onPress={() => void openCamera()} />
      <View style={styles.manualRow}>
        <TextInput
          accessibilityLabel="Enter the five-character seal"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={5}
          onChangeText={(value) => {
            setManual(value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
            setFeedback(null);
          }}
          placeholder="5-CHAR SEAL"
          placeholderTextColor={theme.colors.faint}
          style={[styles.manualInput, { borderColor: theme.colors.draft, color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}
          value={manual}
        />
        <Pressable
          accessibilityLabel="Confirm manual seal"
          accessibilityRole="button"
          onPress={() => {
            if (manual === suffix) {
              setFeedback(null);
              onScanned();
            } else setFeedback('wrong-seal');
          }}
          style={[styles.manualSubmit, { backgroundColor: accent }]}
        >
          <Ionicons color="#07100D" name="arrow-forward" size={20} />
        </Pressable>
      </View>
      <Text accessibilityLiveRegion="polite" style={[styles.fallbackCopy, { color: feedback ? theme.colors.fault : theme.colors.muted, fontFamily: theme.typography.families.body }]}>{feedbackCopy}</Text>
    </StagePanel>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: 'center', borderRadius: 15, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 55, paddingHorizontal: 15 },
  actionText: { fontSize: 16 },
  camera: { borderRadius: 18, borderWidth: 1, height: 380, justifyContent: 'center', overflow: 'hidden' },
  cameraCopy: { bottom: 18, fontSize: 11, left: 18, lineHeight: 15, position: 'absolute' },
  chip: { borderRadius: 999, borderWidth: 1, minHeight: 42, paddingHorizontal: 13, paddingVertical: 11 },
  chipText: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  closeCamera: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.58)', borderRadius: 13, height: 42, justifyContent: 'center', position: 'absolute', right: 12, top: 12, width: 42 },
  disabled: { opacity: 0.38 },
  doNow: { borderLeftWidth: 3, gap: 3, paddingLeft: 11, paddingVertical: 3 },
  fallbackCopy: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  heading: { alignItems: 'flex-start', flexDirection: 'row', gap: 13 },
  headingCopy: { flex: 1, gap: 3, paddingTop: 2 },
  hold: { alignItems: 'center', borderRadius: 15, borderWidth: 1, height: 58, justifyContent: 'center', overflow: 'hidden' },
  holdFill: { bottom: 0, left: 0, opacity: 0.9, position: 'absolute', top: 0 },
  holdText: { fontSize: 15, zIndex: 1 },
  instruction: { fontSize: 14, lineHeight: 20 },
  manualInput: { borderRadius: 13, borderWidth: 1, flex: 1, fontSize: 13, height: 48, letterSpacing: 2, paddingHorizontal: 12 },
  manualRow: { flexDirection: 'row', gap: 7 },
  manualSubmit: { alignItems: 'center', borderRadius: 13, height: 48, justifyContent: 'center', width: 50 },
  marker: { alignItems: 'center', borderRadius: 20, borderWidth: 3, gap: 4, padding: 16 },
  markerCode: { fontSize: 12, letterSpacing: 4 },
  markerLabel: { fontSize: 25, lineHeight: 27, marginTop: 3 },
  node: { alignItems: 'center', borderRadius: 12, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  nodeText: { fontSize: 18 },
  panel: { borderRadius: 18, borderWidth: 1, gap: 12, padding: 15 },
  poseCopy: { flex: 1, gap: 2 },
  poseName: { fontSize: 35, lineHeight: 35 },
  posePhone: { alignItems: 'center', borderWidth: 2, height: 86, paddingTop: 8, width: 49 },
  poseSpeaker: { height: 3, width: 17 },
  poseTelemetry: { fontSize: 8, letterSpacing: 0.7 },
  poseTopline: { alignItems: 'center', flexDirection: 'row', gap: 22, paddingVertical: 4 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  reticle: { alignSelf: 'center', borderWidth: 2, height: 210, width: 210 },
  scaffold: { gap: 17 },
  stageNumber: { fontSize: 42, lineHeight: 42 },
  stepper: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  stepperRow: { flexDirection: 'row', gap: 6 },
  technical: { fontSize: 12, lineHeight: 16 },
  title: { fontSize: 38, lineHeight: 38 },
  waitingDetail: { fontSize: 14, lineHeight: 20 },
  waitingIcon: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  waitingTitle: { fontSize: 24, lineHeight: 26 },
});

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { ScreenShell } from '@/src/components';
import type { Capability, ForgeCase, ForgeGenerationRequest } from '@/src/domain';
import { ForgeCaseCover } from '@/src/features/forge/ForgeCaseCover';
import { prepareLiveForgeHost } from '@/src/features/forge/live-session';
import {
  CrewPlate,
  MechanismPlate,
  ThemePlate,
  type ForgeDraft,
} from '@/src/features/forge/ForgeDraftPanel';
import {
  ForgeButton,
  ForgeDiagram,
  ForgeProgress,
  forgeColors,
} from '@/src/features/forge/ForgePrimitives';
import {
  caseForgeClient,
  caseForgeGenerationOptions,
} from '@/src/features/forge/case-forge-client';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

const INITIAL_DRAFT: ForgeDraft = {
  camera: true,
  customThemePrompt: '',
  difficulty: 3,
  duration: 30,
  intensity: 'balanced',
  playerCount: 3,
  themeId: undefined,
  tone: 'mystery',
  voice: true,
};

export default function CaseForgeScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const crew = useHousewireStore((state) => state.crew);
  const householdName = useHousewireStore((state) => state.householdName);
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const [draft, setDraft] = useState<ForgeDraft>(() => ({
    ...INITIAL_DRAFT,
    playerCount: Math.max(2, Math.min(4, crew.length)) as 2 | 3 | 4,
  }));
  const [step, setStep] = useState(1);
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const [offlineBuild, setOfflineBuild] = useState(false);
  const [caseFile, setCaseFile] = useState<ForgeCase | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workingLabel = useMemo(() => {
    if (!working) return '';
    return caseFile ? 'Rebuilding the case' : 'Building five linked scenes';
  }, [caseFile, working]);

  const back = () => {
    if (working) return;
    play('switch', 0.25);
    if (caseFile) {
      setCaseFile(null);
      setStep(3);
    } else if (step > 1) {
      setStep((value) => value - 1);
    } else {
      router.back();
    }
  };

  const generate = async (existing?: ForgeCase, offline = false) => {
    if (workingRef.current) return;
    workingRef.current = true;
    setOfflineBuild(offline);
    setWorking(true);
    setError(null);
    play('relay', 0.45);
    try {
      const result = existing
        ? await Promise.all([
            caseForgeClient.regenerate(existing.id, {}, offline ? {} : caseForgeGenerationOptions),
            wait(reducedMotion ? 80 : 720),
          ]).then(([game]) => game)
        : await Promise.all([
            caseForgeClient.generate(
              makeRequest(draft, crew, householdName),
              offline ? {} : caseForgeGenerationOptions,
            ),
            wait(reducedMotion ? 80 : 920),
          ]).then(([game]) => game);
      setCaseFile(result);
      play('accept', 0.72);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The case could not be cut.');
      play('warning', 0.65);
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  };

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <View style={styles.topline}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={back} style={({ pressed }) => [styles.iconButton, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
          <Ionicons color={theme.colors.text} name="arrow-back" size={20} />
        </Pressable>
        <View style={styles.brandBlock}>
          <Text style={[styles.brand, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>CASE FORGE</Text>
          <Text style={[styles.brandMeta, { color: forgeColors.ink, fontFamily: theme.typography.families.bodyMedium }]}>AI-BUILT ESCAPE ROOMS</Text>
        </View>
        <Pressable accessibilityLabel="Generated casebook" accessibilityRole="button" hitSlop={8} onPress={() => router.push('/forge-library' as never)} style={({ pressed }) => [styles.iconButton, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
          <Ionicons color={theme.colors.text} name="albums-outline" size={20} />
        </Pressable>
      </View>

      {working ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={styles.workingPage}>
          <ForgeDiagram accent={caseFile?.accent ?? forgeColors.ink} playerCount={draft.playerCount} reducedMotion={reducedMotion} working />
          <View style={styles.workingCopy}>
            <Text accessibilityRole="header" style={[styles.workingTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{offlineBuild ? 'Building an offline case' : 'Writing your case'}</Text>
            <Text accessibilityLiveRegion="polite" style={[styles.workingLabel, { color: forgeColors.ink, fontFamily: theme.typography.families.bodyMedium }]}>{workingLabel}</Text>
          </View>
          <View style={styles.checks}>
            {['Writing linked clues', 'Balancing the difficulty', 'Checking every solution'].map((label, index) => (
              <View key={label} style={[styles.checkRow, { borderColor: theme.colors.draft }]}>
                <Text style={[styles.checkIndex, { color: index === 0 ? forgeColors.ink : theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>{String(index + 1).padStart(2, '0')}</Text>
                <Text style={[styles.checkLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      ) : caseFile ? (
        <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(380)} style={styles.resultPage}>
          <ForgeCaseCover
            caseFile={caseFile}
            onHost={() => {
              try {
                prepareLiveForgeHost();
                play('relay', 0.58);
                router.push({ pathname: '/forge-live', params: { id: caseFile.id } } as never);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'The live room could not be opened.');
              }
            }}
            onOpen={() => router.push({ pathname: '/forged-case', params: { id: caseFile.id } } as never)}
            onReforge={() => void generate(caseFile)}
          />
          {error ? <View accessibilityLiveRegion="assertive" style={styles.retryBox}>
            <Text style={{ color: theme.colors.warning, fontFamily: theme.typography.families.body }}>{error}</Text>
            <ForgeButton icon="refresh-outline" label="Retry AI version" onPress={() => void generate(caseFile)} />
            <ForgeButton icon="phone-portrait-outline" label="Make an offline version" onPress={() => void generate(caseFile, true)} secondary />
          </View> : null}
        </Animated.View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.aiBrief, { borderColor: forgeColors.ink }]}>
              <Ionicons color={forgeColors.ink} name="git-branch-outline" size={18} />
              <Text style={[styles.aiBriefText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}><Text style={{ color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }}>Your world. Your crew.</Text> AI writes a connected story around five tested puzzles. The app checks every solution.</Text>
            </View>
            <ForgeProgress current={step} />
            <ForgeDiagram playerCount={draft.playerCount} reducedMotion={reducedMotion} working={false} />
            <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(260)} key={step}>
              {step === 1 ? <CrewPlate draft={draft} onChange={setDraft} /> : null}
              {step === 2 ? <ThemePlate draft={draft} onChange={setDraft} /> : null}
              {step === 3 ? <MechanismPlate draft={draft} onChange={setDraft} /> : null}
            </Animated.View>
            {error ? (
              <View style={styles.retryBox}>
              <View accessibilityLiveRegion="assertive" style={[styles.error, { borderColor: theme.colors.fault }]}>
                <Ionicons color={theme.colors.fault} name="warning-outline" size={19} />
                <Text style={[styles.errorText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{error}</Text>
              </View>
              <ForgeButton icon="refresh-outline" label="Try AI again" onPress={() => void generate()} />
              <ForgeButton icon="phone-portrait-outline" label="Play an offline version instead" onPress={() => void generate(undefined, true)} secondary />
              <Text style={{ color: theme.colors.muted, fontFamily: theme.typography.families.body, fontSize: 12 }}>Offline uses built-in story templates, not a custom AI story.</Text>
              </View>
            ) : null}
          </ScrollView>
          <View style={[styles.footer, { backgroundColor: theme.colors.background, borderColor: theme.colors.draft }]}>
            {step > 1 ? <ForgeButton icon="arrow-back" label="Back" onPress={back} secondary /> : <View />}
            <View style={styles.footerPrimary}>
              {step < 3 ? (
                <ForgeButton
                  icon="arrow-forward"
                  label={step === 1 ? 'Choose a theme' : 'Choose the challenges'}
                  onPress={() => {
                    play('switch', 0.3);
                    setStep((value) => value + 1);
                  }}
                />
              ) : <ForgeButton icon="hammer-outline" label="Build my case" onPress={() => void generate()} />}
            </View>
          </View>
        </>
      )}
    </ScreenShell>
  );
}

function makeRequest(
  draft: ForgeDraft,
  crew: ReturnType<typeof useHousewireStore.getState>['crew'],
  householdName: string,
): ForgeGenerationRequest {
  const selected = Array.from({ length: draft.playerCount }, (_, index) => {
    const existing = crew[index];
    return {
      id: existing?.id ?? `forge-node-${index + 1}`,
      // Demo stand-ins such as Mara/Samir are useful in authored rehearsal, but
      // generated/live cases should not pretend those are the user's relatives.
      name: existing && !existing.simulated ? existing.name : `Player ${index + 1}`,
    };
  });
  const capabilities: Capability[] = ['manual', 'touch', 'haptics'];
  if (draft.camera) capabilities.push('cameraQr');
  if (draft.voice) capabilities.push('microphoneLevel');
  const generatedAt = Date.now();
  return {
    capabilitiesByPlayer: Object.fromEntries(selected.map((player) => [player.id, capabilities])),
    customThemePrompt: draft.customThemePrompt.trim() || undefined,
    difficulty: draft.difficulty,
    generatedAt,
    intensity: draft.intensity,
    noiseAllowed: draft.voice,
    playerIds: selected.map((player) => player.id),
    playerNames: Object.fromEntries(selected.map((player) => [player.id, player.name])),
    safeMovement: false,
    seed: `${householdName}-${generatedAt}-${Math.random().toString(36).slice(2, 8)}`,
    targetMinutes: draft.duration,
    themeId: draft.themeId,
    tone: draft.tone,
  };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const styles = StyleSheet.create({
  aiBrief: { alignItems: 'flex-start', backgroundColor: 'rgba(242,211,109,0.06)', borderLeftWidth: 3, borderRadius: 12, flexDirection: 'row', gap: 9, paddingHorizontal: 12, paddingVertical: 10 },
  aiBriefText: { flex: 1, fontSize: 12, lineHeight: 17 },
  brand: { fontSize: 24, letterSpacing: 0.5, lineHeight: 23 },
  brandBlock: { alignItems: 'center' },
  brandMeta: { fontSize: 11 },
  checkIndex: { fontSize: 8, letterSpacing: 1 },
  checkLabel: { flex: 1, fontSize: 14 },
  checkRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 10, minHeight: 45 },
  checks: { width: '100%' },
  error: { alignItems: 'center', borderLeftWidth: 3, borderRadius: 14, flexDirection: 'row', gap: 9, paddingHorizontal: 11, paddingVertical: 9 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17 },
  footer: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 8, paddingBottom: 10, paddingHorizontal: 18, paddingTop: 10 },
  footerPrimary: { flex: 1 },
  formContent: { gap: 16, paddingBottom: 108, paddingHorizontal: 20, paddingTop: 10 },
  iconButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.98 }] },
  resultPage: { flex: 1, paddingHorizontal: 20, paddingTop: 9 },
  retryBox: { gap: 10, paddingVertical: 10 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10 },
  workingCopy: { alignItems: 'center', gap: 5 },
  workingLabel: { fontSize: 14, textAlign: 'center' },
  workingPage: { alignItems: 'center', flex: 1, gap: 17, justifyContent: 'center', paddingHorizontal: 28 },
  workingTitle: { fontSize: 42, lineHeight: 42, textAlign: 'center' },
});

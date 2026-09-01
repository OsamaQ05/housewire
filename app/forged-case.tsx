import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '@/src/components';
import {
  validateForgeSubmission,
  type ForgeCase,
  type ForgeStageSubmission,
  type ForgeSubmissionResult,
} from '@/src/domain/case-forge';
import { caseForgeClient } from '@/src/features/forge/case-forge-client';
import { ForgeButton, forgeColors } from '@/src/features/forge/ForgePrimitives';
import { ForgeStageRunner } from '@/src/features/forge/ForgeStageRunner';
import { useForgeRun } from '@/src/features/forge/use-forge-run';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireTheme } from '@/src/theme';

export default function ForgedCaseScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const caseId = Array.isArray(id) ? id[0] : id;
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const [caseFile, setCaseFile] = useState<ForgeCase | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let cancelled = false;
    if (!caseId) {
      setLoadError('This case link has no file id.');
      return () => {
        cancelled = true;
      };
    }
    void caseForgeClient.get(caseId)
      .then((game) => {
        if (cancelled) return;
        if (!game) setLoadError('This generated case is no longer in the local casebook.');
        else setCaseFile(game);
      })
      .catch((cause) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : 'The case file could not be opened.');
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const firstPlayerId = caseFile?.roles[0]?.playerId ?? null;
  const { advance, hydrated, restart, revealHint, run, setActivePlayerId } = useForgeRun(
    caseFile?.id ?? null,
    firstPlayerId,
    caseFile?.stages.length ?? 0,
  );
  const stage = caseFile && run && run.stageIndex < caseFile.stages.length
    ? caseFile.stages[run.stageIndex]
    : null;
  const complete = Boolean(caseFile && run && run.stageIndex >= caseFile.stages.length);

  useEffect(() => {
    setAdvancing(false);
    scrollRef.current?.scrollTo({ animated: false, y: 0 });
  }, [run?.stageIndex]);

  const submit = (submission: ForgeStageSubmission): ForgeSubmissionResult => {
    if (!caseFile || !run || !stage || advancing) return { accepted: false, code: 'INVALID_STAGE' };
    const result = validateForgeSubmission(caseFile, run.stageIndex, submission);
    if (result.accepted) {
      setAdvancing(true);
      play(run.stageIndex === caseFile.stages.length - 1 ? 'complete' : 'accept', 0.72);
      setTimeout(advance, 850);
    } else {
      play('warning', 0.5);
    }
    return result;
  };

  if (loadError) {
    return (
      <ScreenShell edgeWire="none" texture={false}>
        <View style={styles.centerState}>
          <Ionicons color={theme.colors.fault} name="document-outline" size={42} />
          <Text style={[styles.stateTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>CASE FILE LOST</Text>
          <Text style={[styles.stateBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{loadError}</Text>
          <ForgeButton icon="albums-outline" label="Open generated casebook" onPress={() => router.replace('/forge-library' as never)} />
        </View>
      </ScreenShell>
    );
  }

  if (!caseFile || !run || !hydrated) {
    return (
      <ScreenShell edgeWire="none" texture={false}>
        <View style={styles.centerState}>
          <View style={[styles.loadingSeal, { borderColor: forgeColors.ink }]} />
          <Text accessibilityLiveRegion="polite" style={[styles.loadingText, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>OPENING LOCAL CASE FILE</Text>
        </View>
      </ScreenShell>
    );
  }

  if (complete) {
    const hints = Object.values(run.hintsByStage).reduce((sum, value) => sum + value, 0);
    const durationSeconds = Math.max(1, Math.floor(((run.completedAt ?? Date.now()) - run.startedAt) / 1000));
    return (
      <ScreenShell edgeWire="none" padded={false} texture={false}>
        <ScrollView contentContainerStyle={styles.completedPage} showsVerticalScrollIndicator={false}>
          <View style={styles.completedTopline}>
            <Text style={[styles.rehearsalTag, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>SOLO HANDOFF · CASE CLOSED</Text>
            <Text style={[styles.completedSerial, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>#{caseFile.id.slice(-6).toUpperCase()}</Text>
          </View>
          <View style={[styles.endingSeal, { borderColor: caseFile.accent }]}>
            <Ionicons color={caseFile.accent} name="key-outline" size={38} />
          </View>
          <Text style={[styles.completedTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{caseFile.title}</Text>
          <Text style={[styles.ending, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{caseFile.ending}</Text>
          <View style={[styles.runMetrics, { borderColor: theme.colors.draft }]}>
            <RunMetric label="ELAPSED" value={formatElapsed(durationSeconds)} />
            <RunMetric label="SCENES" value={`${caseFile.stages.length}`} />
            <RunMetric label="HINTS" value={`${hints}`} />
          </View>
          <View style={styles.completedActions}>
            <ForgeButton icon="albums-outline" label="Back to casebook" onPress={() => router.replace('/forge-library' as never)} />
            <ForgeButton
              icon="refresh"
              label="Rehearse from the beginning"
              onPress={() => {
                restart();
                play('relay', 0.45);
              }}
              secondary
            />
          </View>
          <Text style={[styles.localNote, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Progress and hints are saved locally. Live play shares only each role’s projection over your LAN; the optional story engine never receives puzzle clues or answers.</Text>
        </ScrollView>
      </ScreenShell>
    );
  }

  if (!stage) return null;
  const activePlayerId = caseFile.roles.some((role) => role.playerId === run.activePlayerId)
    ? run.activePlayerId
    : caseFile.roles[0].playerId;

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <View style={[styles.topline, { borderColor: theme.colors.draft }]}>
        <Pressable accessibilityLabel="Leave rehearsal" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.backButton, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
          <Ionicons color={theme.colors.text} name="close" size={21} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={[styles.caseName, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{caseFile.title}</Text>
          <Text style={[styles.rehearsalTag, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>ONE-PHONE HANDOFF REHEARSAL</Text>
        </View>
        <Text style={[styles.stageCount, { color: forgeColors.ink, fontFamily: theme.typography.families.displayHeavy }]}>{run.stageIndex + 1}/{caseFile.stages.length}</Text>
      </View>
      <View accessibilityLabel={`Scene ${run.stageIndex + 1} of ${caseFile.stages.length}`} style={styles.sceneRail}>
        {caseFile.stages.map((item, index) => (
          <View key={item.id} style={[styles.sceneSegment, { backgroundColor: index <= run.stageIndex ? caseFile.accent : theme.colors.draft, flex: index === run.stageIndex ? 2 : 1 }]} />
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.runContent} keyboardShouldPersistTaps="handled" ref={scrollRef} showsVerticalScrollIndicator={false}>
        <View style={[styles.rehearsalNotice, { borderColor: theme.colors.warning }]}>
          <Ionicons color={theme.colors.warning} name="phone-portrait-outline" size={18} />
          <Text style={[styles.rehearsalNoticeText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>This generated case runs offline on one phone. Switch roles and physically pass it so each player sees only their fragment.</Text>
        </View>
        <ForgeStageRunner
          activePlayerId={activePlayerId}
          hintsRevealed={run.hintsByStage[stage.id] ?? 0}
          onChangePlayer={(playerId) => {
            play('switch', 0.22);
            setActivePlayerId(playerId);
          }}
          onRevealHint={() => {
            play('relay', 0.3);
            revealHint(stage.id, stage.hints.length);
          }}
          onSubmit={submit}
          roles={caseFile.roles}
          stage={stage}
        />
      </ScrollView>
    </ScreenShell>
  );
}

function RunMetric({ label, value }: { label: string; value: string }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.runMetric}>
      <Text style={[styles.runMetricValue, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{value}</Text>
      <Text style={[styles.runMetricLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{label}</Text>
    </View>
  );
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  backButton: { alignItems: 'center', borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  caseName: { fontSize: 20, lineHeight: 21, textTransform: 'uppercase' },
  centerState: { alignItems: 'center', flex: 1, gap: 13, justifyContent: 'center', paddingHorizontal: 18 },
  completedActions: { gap: 9, width: '100%' },
  completedPage: { alignItems: 'center', gap: 18, paddingBottom: 46, paddingHorizontal: 20, paddingTop: 16 },
  completedSerial: { fontSize: 8, letterSpacing: 1 },
  completedTitle: { fontSize: 57, lineHeight: 53, textAlign: 'center', textTransform: 'uppercase' },
  completedTopline: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  ending: { fontSize: 23, lineHeight: 29, maxWidth: 350, textAlign: 'center' },
  endingSeal: { alignItems: 'center', borderRadius: 52, borderStyle: 'dashed', borderWidth: 1, height: 94, justifyContent: 'center', marginTop: 20, width: 94 },
  headerCopy: { alignItems: 'center', flex: 1 },
  loadingSeal: { borderRadius: 33, borderStyle: 'dashed', borderWidth: 2, height: 66, width: 66 },
  loadingText: { fontSize: 8, letterSpacing: 1.3 },
  localNote: { fontSize: 11, lineHeight: 16, maxWidth: 300, textAlign: 'center' },
  pressed: { opacity: 0.68, transform: [{ scale: 0.98 }] },
  rehearsalNotice: { alignItems: 'center', borderLeftWidth: 3, flexDirection: 'row', gap: 9, paddingLeft: 10, paddingVertical: 8 },
  rehearsalNoticeText: { flex: 1, fontSize: 11, lineHeight: 16 },
  rehearsalTag: { fontSize: 7, letterSpacing: 1.1 },
  runContent: { gap: 20, paddingBottom: 64, paddingHorizontal: 20, paddingTop: 13 },
  runMetric: { alignItems: 'center', flex: 1 },
  runMetricLabel: { fontSize: 7, letterSpacing: 1.1 },
  runMetrics: { borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', paddingVertical: 15, width: '100%' },
  runMetricValue: { fontSize: 29, lineHeight: 30 },
  sceneRail: { flexDirection: 'row', gap: 3, height: 4, marginHorizontal: 20, marginTop: 8 },
  sceneSegment: { height: 4 },
  stageCount: { fontSize: 24, lineHeight: 24, textAlign: 'right', width: 38 },
  stateBody: { fontSize: 14, lineHeight: 20, maxWidth: 300, textAlign: 'center' },
  stateTitle: { fontSize: 39, lineHeight: 38, textAlign: 'center' },
  topline: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 9, marginHorizontal: 20, paddingBottom: 9, paddingTop: 10 },
});

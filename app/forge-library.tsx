import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '@/src/components';
import type { ForgeCaseSummary } from '@/src/domain/case-forge';
import { caseForgeClient } from '@/src/features/forge/case-forge-client';
import { ForgeButton, ForgeGrid, forgeColors } from '@/src/features/forge/ForgePrimitives';
import { prepareLiveForgeHost } from '@/src/features/forge/live-session';
import { clearStoredForgeRun } from '@/src/features/forge/use-forge-run';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

export default function ForgeLibraryScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const [cases, setCases] = useState<readonly ForgeCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ForgeCaseSummary | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void caseForgeClient.list()
      .then(setCases)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'The casebook could not be read.'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const remove = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await caseForgeClient.remove(target.id);
      await clearStoredForgeRun(target.id);
      play('switch', 0.3);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The case could not be removed.');
    }
  };

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <View style={styles.topline}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
          <Ionicons color={theme.colors.text} name="arrow-back" size={20} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>THE CUT FILES</Text>
          <Text style={[styles.headerMeta, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>{cases.length} LOCALLY VERIFIED CASES</Text>
        </View>
        <Pressable accessibilityLabel="Create another case" accessibilityRole="button" onPress={() => router.push('/case-forge' as never)} style={({ pressed }) => [styles.iconButton, { backgroundColor: forgeColors.ink, borderColor: forgeColors.ink }, pressed && styles.pressed]}>
          <Ionicons color={forgeColors.dark} name="add" size={22} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.libraryIntro, { borderColor: theme.colors.draft }]}>
          <ForgeGrid />
          <Text style={[styles.introIndex, { color: forgeColors.ink, fontFamily: theme.typography.families.displayHeavy }]}>{String(cases.length).padStart(2, '0')}</Text>
          <View style={styles.introCopy}>
            <Text style={[styles.introTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Every file contains five runnable scenes, private role fragments, verified answers, and sensor-safe fallbacks.</Text>
            <Text style={[styles.introMeta, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>ON THIS PHONE · NO ACCOUNT</Text>
          </View>
        </View>

        {error ? (
          <View style={[styles.error, { borderColor: theme.colors.fault }]}>
            <Ionicons color={theme.colors.fault} name="warning-outline" size={18} />
            <Text style={[styles.errorText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={load}><Text style={[styles.retry, { color: theme.colors.fault, fontFamily: theme.typography.families.monoMedium }]}>RETRY</Text></Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loading}><View style={[styles.loadingSeal, { borderColor: forgeColors.ink }]} /><Text style={[styles.loadingText, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>READING INDEX</Text></View>
        ) : cases.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons color={theme.colors.faint} name="albums-outline" size={43} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>NO CUT FILES</Text>
            <Text style={[styles.emptyBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Set the crew, world, pressure, and available phone mechanics. The local forge builds and validates the rest.</Text>
            <View style={styles.emptyAction}><ForgeButton icon="hammer-outline" label="Cut the first case" onPress={() => router.replace('/case-forge' as never)} /></View>
          </View>
        ) : (
          <View style={styles.caseList}>
            {cases.map((caseFile, index) => (
              <View key={caseFile.id} style={[styles.caseRow, { borderColor: theme.colors.draft }]}>
                <Pressable
                  accessibilityHint="Opens the saved one-phone rehearsal"
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/forged-case', params: { id: caseFile.id } } as never)}
                  style={({ pressed }) => [styles.caseMain, pressed && styles.pressed]}
                >
                  <View style={[styles.caseRail, { backgroundColor: caseFile.accent }]} />
                  <Text style={[styles.caseIndex, { color: caseFile.accent, fontFamily: theme.typography.families.displayHeavy }]}>{String(index + 1).padStart(2, '0')}</Text>
                  <View style={styles.caseCopy}>
                    <Text style={[styles.caseTheme, { color: caseFile.accent, fontFamily: theme.typography.families.monoMedium }]}>{caseFile.theme.replaceAll('-', ' ').toUpperCase()}</Text>
                    <Text numberOfLines={1} style={[styles.caseTitle, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{caseFile.title}</Text>
                    <Text numberOfLines={2} style={[styles.caseTagline, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{caseFile.tagline}</Text>
                    <Text style={[styles.caseMeta, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>{caseFile.playerCount} PLAYERS · {caseFile.durationMinutes} MIN · LEVEL {caseFile.difficulty}</Text>
                  </View>
                  <Ionicons color={theme.colors.muted} name="arrow-forward" size={20} />
                </Pressable>
                <Pressable
                  accessibilityLabel={`Host ${caseFile.title} live`}
                  accessibilityRole="button"
                  onPress={() => {
                    try {
                      prepareLiveForgeHost();
                      play('relay', 0.5);
                      router.push({ pathname: '/forge-live', params: { id: caseFile.id } } as never);
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : 'The live room could not be opened.');
                    }
                  }}
                  style={({ pressed }) => [styles.liveButton, { borderColor: caseFile.accent }, pressed && styles.pressed]}
                >
                  <Ionicons color={caseFile.accent} name="radio-outline" size={15} />
                  <Text style={[styles.liveButtonText, { color: caseFile.accent, fontFamily: theme.typography.families.monoMedium }]}>PLAY LIVE</Text>
                </Pressable>
                <Pressable accessibilityLabel={`Remove ${caseFile.title}`} accessibilityRole="button" hitSlop={8} onPress={() => setPendingDelete(caseFile)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                  <Ionicons color={theme.colors.faint} name="trash-outline" size={17} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => setPendingDelete(null)} transparent visible={Boolean(pendingDelete)}>
        <View accessibilityViewIsModal style={styles.modalBackdrop}>
          <View style={[styles.dialog, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.fault }]}>
            <Text style={[styles.dialogLabel, { color: theme.colors.fault, fontFamily: theme.typography.families.monoMedium }]}>REMOVE LOCAL FILE</Text>
            <Text style={[styles.dialogTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{pendingDelete?.title}</Text>
            <Text style={[styles.dialogBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>The generated case and its rehearsal progress will be removed from this phone.</Text>
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" onPress={() => setPendingDelete(null)} style={({ pressed }) => [styles.dialogButton, { borderColor: theme.colors.draft }, pressed && styles.pressed]}><Text style={[styles.dialogButtonText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Keep it</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => void remove()} style={({ pressed }) => [styles.dialogButton, { backgroundColor: theme.colors.fault, borderColor: theme.colors.fault }, pressed && styles.pressed]}><Text style={[styles.dialogButtonText, { color: theme.colors.textInverse, fontFamily: theme.typography.families.bodyMedium }]}>Remove</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  caseCopy: { flex: 1, gap: 2 },
  caseIndex: { fontSize: 31, lineHeight: 32, width: 36 },
  caseList: { gap: 0 },
  caseMain: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 136, paddingBottom: 34, paddingLeft: 12, paddingRight: 4, paddingTop: 16 },
  caseMeta: { fontSize: 7, letterSpacing: 0.7, marginTop: 3 },
  caseRail: { bottom: 0, left: 0, position: 'absolute', top: 0, width: 3 },
  caseRow: { borderBottomWidth: 1, position: 'relative' },
  caseTagline: { fontSize: 11, lineHeight: 15 },
  caseTheme: { fontSize: 7, letterSpacing: 1 },
  caseTitle: { fontSize: 25, lineHeight: 27, textTransform: 'uppercase' },
  content: { gap: 18, paddingBottom: 50, paddingHorizontal: 20, paddingTop: 14 },
  deleteButton: { alignItems: 'center', bottom: 4, height: 30, justifyContent: 'center', position: 'absolute', right: 0, width: 36 },
  dialog: { borderLeftWidth: 4, gap: 10, maxWidth: 400, padding: 19, width: '100%' },
  dialogActions: { flexDirection: 'row', gap: 8, marginTop: 5 },
  dialogBody: { fontSize: 13, lineHeight: 19 },
  dialogButton: { alignItems: 'center', borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  dialogButtonText: { fontSize: 14 },
  dialogLabel: { fontSize: 8, letterSpacing: 1.3 },
  dialogTitle: { fontSize: 35, lineHeight: 34, textTransform: 'uppercase' },
  empty: { alignItems: 'center', gap: 9, paddingHorizontal: 20, paddingVertical: 40 },
  emptyAction: { marginTop: 8, width: '100%' },
  emptyBody: { fontSize: 13, lineHeight: 19, maxWidth: 290, textAlign: 'center' },
  emptyTitle: { fontSize: 39, lineHeight: 38 },
  error: { alignItems: 'center', borderLeftWidth: 3, flexDirection: 'row', gap: 8, paddingLeft: 10, paddingVertical: 8 },
  errorText: { flex: 1, fontSize: 11, lineHeight: 16 },
  headerCopy: { alignItems: 'center' },
  headerMeta: { fontSize: 7, letterSpacing: 1.2 },
  headerTitle: { fontSize: 24, lineHeight: 23 },
  iconButton: { alignItems: 'center', borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  introCopy: { flex: 1, gap: 6 },
  introIndex: { fontSize: 56, lineHeight: 52 },
  introMeta: { fontSize: 7, letterSpacing: 1 },
  introTitle: { fontSize: 18, lineHeight: 23 },
  libraryIntro: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: 14, minHeight: 136, overflow: 'hidden', paddingHorizontal: 12 },
  loading: { alignItems: 'center', gap: 10, paddingVertical: 50 },
  loadingSeal: { borderRadius: 25, borderStyle: 'dashed', borderWidth: 1, height: 50, width: 50 },
  loadingText: { fontSize: 8, letterSpacing: 1 },
  liveButton: { alignItems: 'center', bottom: 4, borderWidth: 1, flexDirection: 'row', gap: 5, height: 29, justifyContent: 'center', position: 'absolute', right: 42, width: 92 },
  liveButtonText: { fontSize: 7, letterSpacing: 0.7 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.82)', flex: 1, justifyContent: 'center', padding: 22 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.99 }] },
  retry: { fontSize: 8, letterSpacing: 0.8 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10 },
});

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OperationalLabel, ScreenShell } from '@/src/components';
import { missions } from '@/src/data/campaigns';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';
import { formatClock } from '@/src/utils/format';

export default function ArchiveScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const selectedMission = useHousewireStore((state) => state.selectedMission);
  const results = useHousewireStore((state) => state.results).filter(
    (result) => result.missionId === selectedMission,
  );
  const missionStartedAt = useHousewireStore((state) => state.missionStartedAt);
  const missionInProgressId = useHousewireStore((state) => state.missionInProgressId);
  const selectMission = useHousewireStore((state) => state.selectMission);
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const mission = missions.find((item) => item.id === selectedMission) ?? missions[0];
  const caseStatus = missionStartedAt && missionInProgressId === selectedMission
    ? 'IN PROGRESS'
    : results.length > 0
      ? 'CLOSED'
      : 'OPEN';

  const replay = () => {
    play('relay', 0.5);
    prepareSession('preview');
    router.push('/setup');
  };

  return (
    <ScreenShell edgeWire="left" padded={false} texture={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topline}>
          <Pressable accessibilityLabel="Back to house" accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
            <Ionicons color={theme.colors.text} name="arrow-back" size={23} />
          </Pressable>
          <OperationalLabel tone="wire">CASE FILE</OperationalLabel>
        </View>

        <View accessibilityRole="tablist" style={styles.caseTabs}>
          {missions.map((item, index) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: item.id === selectedMission }}
              key={item.id}
              onPress={() => {
                play('switch', 0.25);
                selectMission(item.id);
              }}
              style={[
                styles.caseTab,
                {
                  borderColor: item.id === selectedMission ? item.accent : theme.colors.draft,
                  backgroundColor: item.id === selectedMission ? theme.colors.surfaceRaised : 'transparent',
                },
              ]}
            >
              <Text style={[styles.caseTabIndex, { color: item.accent, fontFamily: theme.typography.families.monoMedium }]}>{String(index + 1).padStart(2, '0')}</Text>
              <Text numberOfLines={2} style={[styles.caseTabName, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{item.title}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.caseHero, { borderColor: theme.colors.draft }]}>
          <View style={[styles.caseWire, { backgroundColor: mission.accent }]} />
          <OperationalLabel tone={caseStatus === 'IN PROGRESS' ? 'warning' : caseStatus === 'CLOSED' ? 'ready' : 'muted'}>{mission.operation} · {caseStatus}</OperationalLabel>
          <Text style={[styles.caseTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{mission.title}</Text>
          <Text style={[styles.caseSubtitle, { color: theme.colors.muted, fontFamily: theme.typography.families.storyBold }]}>{mission.description}</Text>
          <Pressable accessibilityRole="button" onPress={replay} style={({ pressed }) => [styles.replay, { backgroundColor: mission.accent }, pressed && styles.pressed]}>
            <Ionicons color={theme.colors.textInverse} name="refresh" size={20} />
            <Text style={[styles.replayText, { color: theme.colors.textInverse, fontFamily: theme.typography.families.bodyMedium }]}>Run a new case</Text>
            <Ionicons color={theme.colors.textInverse} name="arrow-forward" size={20} />
          </Pressable>
        </View>

        <View style={styles.logHeading}>
          <OperationalLabel tone="muted">CLOSED LINES</OperationalLabel>
          <OperationalLabel tone={results.length ? 'ready' : 'muted'}>{results.length}</OperationalLabel>
        </View>

        {results.length === 0 ? (
          <View style={[styles.empty, { borderColor: theme.colors.draft }]}>
            <View style={[styles.emptyDial, { borderColor: theme.colors.draft }]}><Ionicons color={theme.colors.muted} name="time-outline" size={30} /></View>
            <Text style={[styles.emptyTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>No line closed yet.</Text>
            <Text style={[styles.emptyBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Finished runs land here as a local family casebook. No voice, camera, or motion data is stored.</Text>
          </View>
        ) : results.map((result, index) => (
          <View key={`${result.completedAt}-${result.routeSeed}`} style={[styles.logRow, { borderColor: theme.colors.draft }]}>
            <Text style={[styles.logNumber, { color: theme.colors.wire, fontFamily: theme.typography.families.displayHeavy }]}>{String(results.length - index).padStart(2, '0')}</Text>
            <View style={styles.logCopy}>
              <Text style={[styles.logDate, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{new Date(result.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
              <Text style={[styles.logMeta, { color: theme.colors.muted, fontFamily: theme.typography.families.mono }]}>{formatClock(result.durationSeconds)} · {result.retries} recoveries · #{result.routeSeed.toString(36).toUpperCase()}</Text>
            </View>
            <Ionicons color={theme.colors.ready} name="checkmark-circle" size={22} />
          </View>
        ))}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  caseHero: { borderBottomWidth: 1, gap: 12, overflow: 'hidden', paddingBottom: 22, paddingLeft: 20, paddingTop: 8 },
  caseSubtitle: { fontSize: 20, lineHeight: 27, maxWidth: 330 },
  caseTab: { borderWidth: 1, flex: 1, gap: 2, minHeight: 70, padding: 9 },
  caseTabIndex: { fontSize: 8, letterSpacing: 1 },
  caseTabName: { fontSize: 14, lineHeight: 16, minHeight: 32 },
  caseTabs: { flexDirection: 'row', gap: 7 },
  caseTitle: { fontSize: 62, letterSpacing: 0.5, lineHeight: 61 },
  caseWire: { bottom: 0, left: 0, position: 'absolute', top: 0, width: 4 },
  content: { gap: 24, paddingBottom: 52, paddingHorizontal: 20, paddingTop: 14 },
  empty: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, gap: 8, paddingVertical: 34 },
  emptyBody: { fontSize: 14, lineHeight: 20, maxWidth: 260, textAlign: 'center' },
  emptyDial: { alignItems: 'center', borderRadius: 40, borderWidth: 1, height: 64, justifyContent: 'center', marginBottom: 6, width: 64 },
  emptyTitle: { fontSize: 25, lineHeight: 29 },
  logCopy: { flex: 1, gap: 2 },
  logDate: { fontSize: 17, lineHeight: 22 },
  logHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  logMeta: { fontSize: 10, letterSpacing: 0.3, lineHeight: 15 },
  logNumber: { fontSize: 32, lineHeight: 34, width: 46 },
  logRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 12, minHeight: 76 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  replay: { alignItems: 'center', alignSelf: 'stretch', borderRadius: 4, flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginTop: 8, minHeight: 58, paddingHorizontal: 16 },
  replayText: { flex: 1, fontSize: 17, lineHeight: 22 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});

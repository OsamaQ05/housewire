import { useRouter } from 'expo-router';
import { ImageBackground, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BreakerButton, GlyphMark, OperationalLabel, ScreenShell } from '@/src/components';
import { missions } from '@/src/data/campaigns';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';
import { formatClock } from '@/src/utils/format';
import { ClubLink } from '@/src/features/family-club/ClubLink';

const CASE_ART = {
  'line-13': require('../assets/art/line13-house-v2.png'),
  'dead-air': require('../assets/art/dead-air-case.png'),
  'night-glass': require('../assets/art/night-glass-case.png'),
  'long-table': require('../assets/art/long-table-case.png'),
} as const;

export default function DebriefScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const rooms = useHousewireStore((state) => state.rooms);
  const crew = useHousewireStore((state) => state.crew);
  const results = useHousewireStore((state) => state.results);
  const selectedMission = useHousewireStore((state) => state.selectedMission);
  const sessionMode = useHousewireStore((state) => state.sessionMode);
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const result = results[0];
  const mission = missions.find((item) => item.id === result?.missionId) ??
    missions.find((item) => item.id === selectedMission) ??
    missions[0];
  const playerCount = Math.max(1, crew.filter((node) => node.connected).length);
  const roomCount = Math.max(1, rooms.filter((room) => room.safe).length);

  const replay = () => {
    prepareSession(sessionMode);
    router.replace('/setup');
  };

  if (!result) {
    return (
      <ScreenShell edgeWire="left">
        <View style={styles.empty}>
          <GlyphMark color={theme.colors.wire} glyph="GATE" size={88} />
          <View style={styles.emptyCopy}>
            <OperationalLabel tone="warning">NO ESCAPE YET</OperationalLabel>
            <Text style={[styles.emptyTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>The house is still waiting.</Text>
          </View>
          <BreakerButton label="Go home" onPress={() => router.replace('/home')} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell edgeWire="both" padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topline}>
          <OperationalLabel indicator status="ready">HOUSE RESTORED</OperationalLabel>
          <OperationalLabel tone="muted">{new Date(result.completedAt).toLocaleDateString()}</OperationalLabel>
        </View>

        <ImageBackground
          imageStyle={styles.heroImage}
          resizeMode="cover"
          source={CASE_ART[mission.id]}
          style={styles.hero}
        >
          <View style={styles.heroShade} />
          <View style={[styles.window, styles.windowOne, { backgroundColor: theme.colors.ready }]} />
          <View style={[styles.window, styles.windowTwo, { backgroundColor: theme.colors.ready }]} />
          <View style={[styles.window, styles.windowThree, { backgroundColor: theme.colors.ready }]} />
          <View style={styles.heroCopy}>
            <OperationalLabel textStyle={{ color: theme.colors.ready }}>{escapeVerdict(result.retries)}</OperationalLabel>
            <Text style={[styles.heroTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{closingTitle(mission.id)}</Text>
            <Text style={[styles.heroSubtitle, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{closingSubtitle(mission.id)}</Text>
          </View>
          <View style={[styles.liveWire, { backgroundColor: theme.colors.ready }]} />
        </ImageBackground>

        <View style={styles.timeBlock}>
          <Text style={[styles.time, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{formatClock(result.durationSeconds)}</Text>
          <OperationalLabel tone="muted">ESCAPE TIME</OperationalLabel>
        </View>

        <View style={[styles.stats, { borderColor: theme.colors.draft }]}>
          <Stat label="Phones" value={String(playerCount)} />
          <View style={[styles.divider, { backgroundColor: theme.colors.draft }]} />
          <Stat label="Rooms" value={String(roomCount)} />
          <View style={[styles.divider, { backgroundColor: theme.colors.draft }]} />
          <Stat label="Recoveries" value={String(result.retries)} warning={result.retries > 0} />
        </View>

        <View style={[styles.familyMoment, { borderColor: mission.accent }]}>
          <GlyphMark color={mission.accent} glyph="COIL" size={54} />
          <View style={styles.familyCopy}>
            <Text style={[styles.familyTitle, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{playerCount} phones. One solved house.</Text>
            <Text style={[styles.familyText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{closingCopy(result.missionId, result.retries)}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <ClubLink label="See your family standings" />
          <BreakerButton haptic="rigid" label="Play again" onPress={replay} overline="NEW PUZZLE SEED" />
          <BreakerButton label="Back home" onPress={() => router.replace('/home')} variant="secondary" />
        </View>

        <OperationalLabel style={styles.caseMark} tone="muted">{mission.title} · CASE {result.routeSeed.toString(16).toUpperCase().slice(-4)}</OperationalLabel>
      </ScrollView>
    </ScreenShell>
  );
}

function Stat({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: warning ? theme.colors.warning : theme.colors.text, fontFamily: theme.typography.families.display }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
    </View>
  );
}

function escapeVerdict(retries: number): string {
  if (retries === 0) return 'CLEAN ESCAPE';
  if (retries <= 2) return 'LINE RECOVERED';
  return 'HOUSE SURVIVED';
}

function closingCopy(missionId: string, retries: number): string {
  const recovery = retries === 0 ? 'No clue was lost.' : `${retries} ${retries === 1 ? 'mistake was' : 'mistakes were'} recovered together.`;
  if (missionId === 'line-13') return `The future call never reached the present. ${recovery}`;
  if (missionId === 'dead-air') return `The Quiet Machine can no longer route through the house. ${recovery}`;
  if (missionId === 'night-glass') return `The duplicate floorplan folded back behind the glass. ${recovery}`;
  return `The stolen meal returned to the people who made it matter. ${recovery}`;
}

function closingTitle(missionId: string): string {
  if (missionId === 'dead-air') return 'You killed the broadcast.';
  if (missionId === 'night-glass') return 'You folded the corridor.';
  if (missionId === 'long-table') return 'You served the long table.';
  return 'You closed the line.';
}

function closingSubtitle(missionId: string): string {
  if (missionId === 'dead-air') return 'Three ducts. One countertone. Dead quiet.';
  if (missionId === 'night-glass') return 'Every impossible door is gone. Together.';
  if (missionId === 'long-table') return 'Four decades. One table. No empty place.';
  return 'Every receiver went quiet. Together.';
}

const styles = StyleSheet.create({
  actions: { gap: 9 },
  caseMark: { justifyContent: 'center', paddingVertical: 8 },
  content: { flexGrow: 1, gap: 21, paddingBottom: 38, paddingHorizontal: 20, paddingTop: 8 },
  divider: { height: 42, width: 1 },
  empty: { flex: 1, gap: 30, justifyContent: 'center' },
  emptyCopy: { gap: 7 },
  emptyTitle: { fontSize: 45, lineHeight: 44 },
  familyCopy: { flex: 1, gap: 4 },
  familyMoment: { alignItems: 'center', borderLeftWidth: 3, flexDirection: 'row', gap: 14, paddingLeft: 14, paddingVertical: 6 },
  familyText: { fontSize: 13, lineHeight: 19 },
  familyTitle: { fontSize: 23, lineHeight: 24 },
  hero: { height: 330, justifyContent: 'flex-end', marginHorizontal: -20, overflow: 'hidden' },
  heroCopy: { gap: 7, padding: 22 },
  heroImage: { opacity: 0.8 },
  heroShade: { backgroundColor: 'rgba(7,8,6,0.38)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  heroSubtitle: { fontSize: 15, lineHeight: 21 },
  heroTitle: { fontSize: 49, lineHeight: 46, maxWidth: 330 },
  liveWire: { bottom: 0, height: 4, left: 0, position: 'absolute', right: 0 },
  stat: { alignItems: 'center', flex: 1, gap: 2 },
  statLabel: { fontSize: 12 },
  stats: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', paddingVertical: 15 },
  statValue: { fontSize: 32, lineHeight: 33 },
  time: { fontSize: 72, letterSpacing: 2, lineHeight: 70 },
  timeBlock: { alignItems: 'center', gap: 2 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  window: { height: 7, opacity: 0.85, position: 'absolute', width: 7 },
  windowOne: { right: '22%', top: '25%' },
  windowThree: { left: '49%', top: '36%' },
  windowTwo: { left: '25%', top: '29%' },
});

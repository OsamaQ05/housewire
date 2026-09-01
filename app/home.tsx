import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';

import { ScreenShell } from '@/src/components/ScreenShell';
import { missions } from '@/src/data/campaigns';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore, type MissionId } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

const CASE_ART: Readonly<Record<MissionId, number>> = {
  'line-13': require('@/assets/art/line13-house-v2.png'),
  'dead-air': require('@/assets/art/dead-air-case.png'),
  'night-glass': require('@/assets/art/night-glass-case.png'),
};

const CASE_NUMBER: Readonly<Record<MissionId, string>> = {
  'line-13': '01',
  'dead-air': '02',
  'night-glass': '03',
};

const CASE_PROMISE: Readonly<Record<MissionId, string>> = {
  'line-13': 'A CALL FROM 13 MINUTES AHEAD',
  'dead-air': 'A PRIVATE CHANNEL INSIDE THE WALLS',
  'night-glass': 'A SECOND HOUSE INSIDE THE CAMERA',
};

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const selectedMission = useHousewireStore((state) => state.selectedMission);
  const results = useHousewireStore((state) => state.results);
  const selectMission = useHousewireStore((state) => state.selectMission);
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const missionStartedAt = useHousewireStore((state) => state.missionStartedAt);
  const missionInProgressId = useHousewireStore((state) => state.missionInProgressId);
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const [activeId, setActiveId] = useState<MissionId>(selectedMission);
  const scroller = useRef<ScrollView>(null);
  const cardWidth = Math.min(420, width - 42);
  const stride = cardWidth + 12;
  const activeMission = missions.find((mission) => mission.id === activeId) ?? missions[0];
  const completed = useMemo(() => new Set(results.map((result) => result.missionId)), [results]);

  useEffect(() => {
    const index = missions.findIndex((mission) => mission.id === activeId);
    const timeout = setTimeout(() => scroller.current?.scrollTo({ animated: false, x: Math.max(0, index) * stride }), 0);
    return () => clearTimeout(timeout);
  }, [activeId, stride]);

  const launch = (mode: 'lan' | 'preview') => {
    selectMission(activeId);
    prepareSession(mode);
    play(mode === 'lan' ? 'relay' : 'switch', 0.58);
    router.push('/setup');
  };

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.max(
      0,
      Math.min(missions.length - 1, Math.round(event.nativeEvent.contentOffset.x / stride)),
    );
    const next = missions[nextIndex];
    if (next && next.id !== activeId) {
      setActiveId(next.id);
      play('switch', 0.2);
    }
  };

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <ScrollView contentContainerStyle={styles.page} overScrollMode="never" showsVerticalScrollIndicator={false}>
        <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(420)} style={styles.topline}>
          <View>
            <Text style={[styles.brand, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>HOUSEWIRE</Text>
            <Text style={[styles.collection, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>THE BLACKLINE FILES · THREE CASES</Text>
          </View>
          <View style={styles.utilities}>
            <IconButton label="Case archive" name="archive-outline" onPress={() => router.push('/archive')} />
            <IconButton label="Settings" name="options-outline" onPress={() => router.push('/settings')} />
          </View>
        </Animated.View>

        {missionStartedAt ? (
          <Pressable
            accessibilityHint="Returns to the case in progress"
            accessibilityRole="button"
            onPress={() => {
              if (missionInProgressId) selectMission(missionInProgressId);
              router.push('/mission');
            }}
            style={({ pressed }) => [styles.resume, { borderColor: theme.colors.ready }, pressed && styles.pressed]}
          >
            <View style={[styles.resumePulse, { backgroundColor: theme.colors.ready }]} />
            <Text style={[styles.resumeText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{missions.find((mission) => mission.id === missionInProgressId)?.title ?? 'Case'} in progress</Text>
            <Text style={[styles.resumeAction, { color: theme.colors.ready, fontFamily: theme.typography.families.monoMedium }]}>RE-ENTER →</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityHint="Creates a new locally generated five-scene escape case"
          accessibilityRole="button"
          onPress={() => {
            play('relay', 0.42);
            router.push('/case-forge' as never);
          }}
          style={({ pressed }) => [styles.forgeBanner, pressed && styles.pressed]}
        >
          <View style={styles.forgeIndex}>
            <Text style={[styles.forgeIndexText, { fontFamily: theme.typography.families.displayHeavy }]}>∞</Text>
          </View>
          <View style={styles.forgeCopy}>
            <Text style={[styles.forgeOverline, { fontFamily: theme.typography.families.monoMedium }]}>NEW · LOCAL CASE PRESS</Text>
            <Text style={[styles.forgeTitle, { fontFamily: theme.typography.families.displayHeavy }]}>CASE FORGE</Text>
            <Text style={[styles.forgeBody, { fontFamily: theme.typography.families.body }]}>Cut a verified five-scene escape room around this crew.</Text>
          </View>
          <Ionicons color="#F2D36D" name="hammer-outline" size={25} />
        </Pressable>

        <View style={styles.caseRailBlock}>
          <ScrollView
            contentContainerStyle={styles.caseRail}
            decelerationRate="fast"
            horizontal
            onMomentumScrollEnd={settle}
            ref={scroller}
            showsHorizontalScrollIndicator={false}
            snapToInterval={stride}
            snapToAlignment="start"
          >
            {missions.map((mission, index) => (
              <Animated.View entering={reducedMotion ? undefined : FadeInRight.delay(90 * index).duration(460)} key={mission.id}>
                <Pressable
                  accessibilityHint="Selects this escape case"
                  accessibilityRole="button"
                  accessibilityState={{ selected: mission.id === activeId }}
                  onPress={() => {
                    setActiveId(mission.id);
                    scroller.current?.scrollTo({ animated: true, x: index * stride });
                  }}
                  style={({ pressed }) => [
                    styles.caseCard,
                    { borderColor: mission.id === activeId ? mission.accent : theme.colors.draft, width: cardWidth },
                    pressed && styles.pressed,
                  ]}
                >
                  <Image accessibilityLabel={`${mission.title} case artwork`} contentFit="cover" source={CASE_ART[mission.id]} style={styles.caseImage} transition={250} />
                  <View style={styles.caseShade} />
                  <View style={[styles.caseEdge, { backgroundColor: mission.accent }]} />
                  <View style={styles.caseTopline}>
                    <Text style={[styles.caseNumber, { color: mission.accent, fontFamily: theme.typography.families.displayHeavy }]}>{CASE_NUMBER[mission.id]}</Text>
                    <View style={[styles.caseStatus, { borderColor: completed.has(mission.id) ? theme.colors.ready : 'rgba(255,255,255,0.36)' }]}>
                      <Text style={[styles.caseStatusText, { color: completed.has(mission.id) ? theme.colors.ready : '#F4E8CF', fontFamily: theme.typography.families.monoMedium }]}>{completed.has(mission.id) ? 'CLOSED' : 'OPEN'}</Text>
                    </View>
                  </View>
                  <View style={styles.caseCopy}>
                    <Text style={[styles.casePromise, { color: mission.accent, fontFamily: theme.typography.families.monoMedium }]}>{CASE_PROMISE[mission.id]}</Text>
                    <Text style={[styles.caseTitle, { color: '#F7F1E5', fontFamily: theme.typography.families.displayHeavy }]}>{mission.title}</Text>
                    <Text numberOfLines={3} style={[styles.caseDescription, { color: '#E2D8C4', fontFamily: theme.typography.families.body }]}>{mission.description}</Text>
                    <View style={styles.mechanics}>
                      {mission.mechanics.slice(0, 4).map((mechanic) => (
                        <View key={mechanic} style={[styles.mechanic, { borderColor: 'rgba(255,255,255,0.34)' }]}>
                          <Text style={[styles.mechanicText, { color: '#F7F1E5', fontFamily: theme.typography.families.monoMedium }]}>{mechanic}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>

          <View style={styles.caseDots} accessibilityLabel={`Case ${CASE_NUMBER[activeId]} of 03`}>
            {missions.map((mission, index) => (
              <Pressable
                accessibilityLabel={`Select ${mission.title}`}
                accessibilityRole="button"
                key={mission.id}
                onPress={() => {
                  setActiveId(mission.id);
                  scroller.current?.scrollTo({ animated: true, x: index * stride });
                }}
                style={[styles.caseDot, { backgroundColor: mission.id === activeId ? activeMission.accent : theme.colors.draft, width: mission.id === activeId ? 34 : 10 }]}
              />
            ))}
            <View style={styles.caseMeta}>
              <Text style={[styles.caseMetaText, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{activeMission.duration} · {activeMission.playerRange}</Text>
            </View>
          </View>
        </View>

        <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(220).duration(420)} style={styles.actions}>
          <Pressable
            accessibilityHint="Creates a live game for nearby family phones"
            accessibilityRole="button"
            onPress={() => launch('lan')}
            style={({ pressed }) => [styles.primary, { backgroundColor: activeMission.accent }, pressed && styles.pressed]}
          >
            <View>
              <Text style={[styles.actionOverline, { color: '#07100D', fontFamily: theme.typography.families.monoMedium }]}>FULL ESCAPE ROOM</Text>
              <Text style={[styles.primaryText, { color: '#07100D', fontFamily: theme.typography.families.bodyMedium }]}>Play together</Text>
            </View>
            <Ionicons color="#07100D" name="people" size={25} />
          </Pressable>
          <View style={styles.secondaryRow}>
            <Pressable accessibilityHint="Runs every role on this phone for rehearsal" accessibilityRole="button" onPress={() => launch('preview')} style={({ pressed }) => [styles.secondary, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
              <Ionicons color={theme.colors.text} name="phone-portrait-outline" size={20} />
              <Text style={[styles.secondaryText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Solo rehearsal</Text>
            </Pressable>
            <Pressable accessibilityHint="Scans or enters a code from a host phone" accessibilityRole="button" onPress={() => router.push('/join')} style={({ pressed }) => [styles.secondary, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
              <Ionicons color={theme.colors.text} name="scan-outline" size={20} />
              <Text style={[styles.secondaryText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Join a house</Text>
            </Pressable>
          </View>
        </Animated.View>

        <View style={[styles.promiseBand, { borderColor: theme.colors.draft }]}>
          <Text style={[styles.promiseIndex, { color: activeMission.accent, fontFamily: theme.typography.families.displayHeavy }]}>NO SCREEN HAS THE WHOLE ANSWER.</Text>
          <Text style={[styles.promiseText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Phones become props. Family members become each other&apos;s missing information.</Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function IconButton({ label, name, onPress }: { label: string; name: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.iconButton, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
      <Ionicons color={theme.colors.text} name={name} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionOverline: { fontSize: 9, letterSpacing: 1.5, lineHeight: 13 },
  actions: { gap: 10, paddingHorizontal: 20 },
  brand: { fontSize: 31, letterSpacing: 0.5, lineHeight: 32 },
  caseCard: { borderWidth: 1, height: 474, justifyContent: 'space-between', overflow: 'hidden' },
  caseCopy: { gap: 8, paddingBottom: 22, paddingHorizontal: 19 },
  caseDescription: { fontSize: 15, lineHeight: 21, maxWidth: 350 },
  caseDot: { borderRadius: 6, height: 6 },
  caseDots: { alignItems: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 20 },
  caseEdge: { bottom: 0, height: 4, left: 0, position: 'absolute', right: 0 },
  caseImage: { ...StyleSheet.absoluteFillObject },
  caseMeta: { flex: 1 },
  caseMetaText: { fontSize: 9, letterSpacing: 0.7, textAlign: 'right' },
  caseNumber: { fontSize: 48, lineHeight: 48 },
  casePromise: { fontSize: 9, letterSpacing: 1.35, lineHeight: 14 },
  caseRail: { gap: 12, paddingHorizontal: 20 },
  caseRailBlock: { gap: 13 },
  caseShade: { backgroundColor: 'rgba(3,7,7,0.36)', ...StyleSheet.absoluteFillObject },
  caseStatus: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  caseStatusText: { fontSize: 9, letterSpacing: 1.3 },
  caseTitle: { fontSize: 57, letterSpacing: 0.3, lineHeight: 55 },
  caseTopline: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', padding: 17 },
  collection: { fontSize: 8, letterSpacing: 1.5, lineHeight: 13 },
  iconButton: { alignItems: 'center', borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  forgeBanner: { alignItems: 'center', backgroundColor: '#0C0D09', borderBottomColor: '#F2D36D', borderBottomWidth: 3, borderTopColor: '#544A22', borderTopWidth: 1, flexDirection: 'row', gap: 12, marginHorizontal: 20, minHeight: 112, paddingHorizontal: 14, paddingVertical: 12 },
  forgeBody: { color: '#B9AF97', fontSize: 11, lineHeight: 16 },
  forgeCopy: { flex: 1, gap: 1 },
  forgeIndex: { alignItems: 'center', borderColor: '#F2D36D', borderRadius: 25, borderStyle: 'dashed', borderWidth: 1, height: 50, justifyContent: 'center', width: 50 },
  forgeIndexText: { color: '#F2D36D', fontSize: 31, lineHeight: 31 },
  forgeOverline: { color: '#F2D36D', fontSize: 7, letterSpacing: 1.2 },
  forgeTitle: { color: '#F4E8CF', fontSize: 31, lineHeight: 30 },
  mechanic: { borderWidth: 1, paddingHorizontal: 7, paddingVertical: 4 },
  mechanicText: { fontSize: 8, letterSpacing: 0.9 },
  mechanics: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingTop: 2 },
  page: { gap: 19, paddingBottom: 50, paddingTop: 12 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.992 }] },
  primary: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 68, paddingHorizontal: 18 },
  primaryText: { fontSize: 20, lineHeight: 24 },
  promiseBand: { borderBottomWidth: 1, borderTopWidth: 1, gap: 5, marginHorizontal: 20, paddingVertical: 18 },
  promiseIndex: { fontSize: 22, lineHeight: 23 },
  promiseText: { fontSize: 14, lineHeight: 20, maxWidth: 360 },
  resume: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: 10, marginHorizontal: 20, minHeight: 48 },
  resumeAction: { fontSize: 9, letterSpacing: 1.1 },
  resumePulse: { borderRadius: 6, height: 9, width: 9 },
  resumeText: { flex: 1, fontSize: 15 },
  secondary: { alignItems: 'center', borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 55, paddingHorizontal: 10 },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryText: { fontSize: 14 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  utilities: { flexDirection: 'row', gap: 8 },
});

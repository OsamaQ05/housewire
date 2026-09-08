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
  'long-table': require('@/assets/art/long-table-case.png'),
};

const CASE_NUMBER: Readonly<Record<MissionId, string>> = {
  'line-13': '01',
  'dead-air': '02',
  'night-glass': '03',
  'long-table': '04',
};

const CASE_PROMISE: Readonly<Record<MissionId, string>> = {
  'line-13': 'A CALL FROM 13 MINUTES AHEAD',
  'dead-air': 'A PRIVATE CHANNEL INSIDE THE WALLS',
  'night-glass': 'A SECOND HOUSE INSIDE THE CAMERA',
  'long-table': 'ONE TABLE STRETCHED ACROSS GENERATIONS',
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
  const tutorialComplete = useHousewireStore((state) => state.tutorialComplete);
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
            <Text style={[styles.collection, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>Story escapes · choose one together</Text>
          </View>
          <View style={styles.utilities}>
            <IconButton label="All games" name="home-outline" onPress={() => router.push('/modes')} />
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
            <Text style={[styles.resumeAction, { color: theme.colors.ready, fontFamily: theme.typography.families.bodyMedium }]}>Continue →</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityHint="Opens the easy four-step First Light practice case"
          accessibilityRole="button"
          onPress={() => {
            play('switch', 0.46);
            router.push('/tutorial');
          }}
          style={({ pressed }) => [styles.tutorialBanner, { borderColor: tutorialComplete ? theme.colors.ready : '#FFD166' }, pressed && styles.pressed]}
        >
          <View style={[styles.tutorialSun, { borderColor: tutorialComplete ? theme.colors.ready : '#FFD166' }]}>
            <Ionicons color={tutorialComplete ? theme.colors.ready : '#FFD166'} name="sunny-outline" size={31} />
          </View>
          <View style={styles.tutorialCopy}>
            <Text style={[styles.tutorialOverline, { color: tutorialComplete ? theme.colors.ready : '#FFD166', fontFamily: theme.typography.families.bodyMedium }]}>{tutorialComplete ? 'Practice ready to replay' : 'New to Escape Cases?'}</Text>
            <Text style={[styles.tutorialTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>First Light · 2 min</Text>
            <Text style={[styles.tutorialBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Learn the basics through four quick actions.</Text>
          </View>
          <Ionicons color={tutorialComplete ? theme.colors.ready : '#FFD166'} name="arrow-forward" size={23} />
        </Pressable>

        <Pressable
          accessibilityHint="Uses AI to create a new five-scene escape case"
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
            <Text style={[styles.forgeOverline, { fontFamily: theme.typography.families.bodyMedium }]}>AI-BUILT · NEW EVERY TIME</Text>
            <Text style={[styles.forgeTitle, { fontFamily: theme.typography.families.displayHeavy }]}>CASE FORGE</Text>
            <Text style={[styles.forgeBody, { fontFamily: theme.typography.families.body }]}>Choose the players, world and difficulty. AI builds and checks a complete escape case.</Text>
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

          <View style={styles.caseDots} accessibilityLabel={`Case ${CASE_NUMBER[activeId]} of 04`}>
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

        <View style={[styles.promiseBand, { borderColor: theme.colors.draft }]}>
          <Text style={[styles.promiseIndex, { color: activeMission.accent, fontFamily: theme.typography.families.displayHeavy }]}>Everyone holds a different piece.</Text>
          <Text style={[styles.promiseText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>You have to talk, combine private clues, and put the story together as a family.</Text>
        </View>
      </ScrollView>

      <Animated.View
        entering={reducedMotion ? undefined : FadeInDown.delay(220).duration(420)}
        style={[styles.stickyActions, { backgroundColor: theme.colors.background, borderColor: theme.colors.draft }]}
      >
        <Pressable
          accessibilityHint="Creates a live game for nearby family phones"
          accessibilityRole="button"
          onPress={() => launch('lan')}
          style={({ pressed }) => [styles.primary, { backgroundColor: activeMission.accent }, pressed && styles.pressed]}
        >
          <Text numberOfLines={1} style={[styles.primaryText, { color: '#182033', fontFamily: theme.typography.families.bodyMedium }]}>Host story</Text>
          <Ionicons color="#07100D" name="people" size={23} />
        </Pressable>
        <Pressable accessibilityHint="Runs every role on this phone for rehearsal" accessibilityRole="button" onPress={() => launch('preview')} style={({ pressed }) => [styles.quickAction, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
          <Ionicons color={theme.colors.text} name="phone-portrait-outline" size={20} />
          <Text style={[styles.quickActionText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>One phone</Text>
        </Pressable>
        <Pressable accessibilityHint="Scans or enters a code from a host phone" accessibilityRole="button" onPress={() => router.push('/join')} style={({ pressed }) => [styles.quickAction, { borderColor: theme.colors.draft }, pressed && styles.pressed]}>
          <Ionicons color={theme.colors.text} name="scan-outline" size={20} />
          <Text style={[styles.quickActionText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Join</Text>
        </Pressable>
      </Animated.View>
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
  brand: { fontSize: 31, letterSpacing: 0.5, lineHeight: 32 },
  caseCard: { borderRadius: 24, borderWidth: 1, height: 474, justifyContent: 'space-between', overflow: 'hidden' },
  caseCopy: { gap: 8, paddingBottom: 22, paddingHorizontal: 19 },
  caseDescription: { fontSize: 15, lineHeight: 21, maxWidth: 350 },
  caseDot: { borderRadius: 6, height: 6 },
  caseDots: { alignItems: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 20 },
  caseEdge: { bottom: 0, height: 4, left: 0, position: 'absolute', right: 0 },
  caseImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  caseMeta: { flex: 1 },
  caseMetaText: { fontSize: 9, letterSpacing: 0.7, textAlign: 'right' },
  caseNumber: { fontSize: 48, lineHeight: 48 },
  casePromise: { fontSize: 9, letterSpacing: 1.35, lineHeight: 14 },
  caseRail: { gap: 12, paddingHorizontal: 20 },
  caseRailBlock: { gap: 13 },
  caseShade: { backgroundColor: 'rgba(3,7,7,0.36)', position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  caseStatus: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  caseStatusText: { fontSize: 9, letterSpacing: 1.3 },
  caseTitle: { fontSize: 57, letterSpacing: 0.3, lineHeight: 55 },
  caseTopline: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', padding: 17 },
  collection: { fontSize: 12, lineHeight: 17 },
  iconButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  forgeBanner: { alignItems: 'center', backgroundColor: '#1A2338', borderColor: '#5A4D24', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, marginHorizontal: 20, minHeight: 112, paddingHorizontal: 14, paddingVertical: 12 },
  forgeBody: { color: '#CEC4AF', fontSize: 12, lineHeight: 17 },
  forgeCopy: { flex: 1, gap: 2 },
  forgeIndex: { alignItems: 'center', borderColor: '#F2D36D', borderRadius: 14, borderStyle: 'dashed', borderWidth: 1, height: 50, justifyContent: 'center', width: 50 },
  forgeIndexText: { color: '#F2D36D', fontSize: 31, lineHeight: 31 },
  forgeOverline: { color: '#F2D36D', fontSize: 11, lineHeight: 15 },
  forgeTitle: { color: '#F4E8CF', fontSize: 29, lineHeight: 30 },
  mechanic: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  mechanicText: { fontSize: 8, letterSpacing: 0.9 },
  mechanics: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingTop: 2 },
  page: { gap: 19, paddingBottom: 36, paddingTop: 12 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.992 }] },
  primary: { alignItems: 'center', borderRadius: 16, flex: 1.35, flexDirection: 'row', gap: 8, justifyContent: 'space-between', minHeight: 60, paddingHorizontal: 15 },
  primaryText: { fontSize: 18, lineHeight: 22 },
  promiseBand: { borderBottomWidth: 1, borderTopWidth: 1, gap: 5, marginHorizontal: 20, paddingVertical: 18 },
  promiseIndex: { fontSize: 22, lineHeight: 23 },
  promiseText: { fontSize: 14, lineHeight: 20, maxWidth: 360 },
  resume: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 10, marginHorizontal: 20, minHeight: 48, paddingHorizontal: 12 },
  resumeAction: { fontSize: 9, letterSpacing: 1.1 },
  resumePulse: { borderRadius: 6, height: 9, width: 9 },
  resumeText: { flex: 1, fontSize: 15 },
  quickAction: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flex: 1, gap: 2, justifyContent: 'center', minHeight: 60, paddingHorizontal: 8 },
  quickActionText: { fontSize: 12 },
  stickyActions: { borderTopWidth: 1, flexDirection: 'row', gap: 8, paddingBottom: 10, paddingHorizontal: 14, paddingTop: 10 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  tutorialBanner: { alignItems: 'center', backgroundColor: '#1B2A42', borderWidth: 1, borderRadius: 18, flexDirection: 'row', gap: 12, marginHorizontal: 20, minHeight: 122, paddingHorizontal: 14, paddingVertical: 14 },
  tutorialBody: { fontSize: 12, lineHeight: 17 },
  tutorialCopy: { flex: 1, gap: 2 },
  tutorialOverline: { fontSize: 11, lineHeight: 15 },
  tutorialSun: { alignItems: 'center', borderRadius: 30, borderWidth: 1, height: 58, justifyContent: 'center', width: 58 },
  tutorialTitle: { fontSize: 29, lineHeight: 31 },
  utilities: { flexDirection: 'row', gap: 8 },
});

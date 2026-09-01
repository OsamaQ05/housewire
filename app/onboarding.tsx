import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '@/src/components/ScreenShell';
import { GlyphMark } from '@/src/components/GlyphMark';
import { prepareJudgeCut } from '@/src/features/demo/judge-cut';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

type BeatKind = 'place' | 'share' | 'escape';

const beats: readonly {
  caption: string;
  kind: BeatKind;
  title: string;
  visualLabel: string;
}[] = [
  {
    caption: 'One safe room each.',
    kind: 'place',
    title: 'Place phones',
    visualLabel: 'Three phones placed in separate rooms and connected by one wire',
  },
  {
    caption: 'Every screen knows something different.',
    kind: 'share',
    title: 'Share clues',
    visualLabel: 'Two different clue cards connected by conversation',
  },
  {
    caption: 'Talk. Move. Solve before time runs out.',
    kind: 'escape',
    title: 'Escape together',
    visualLabel: 'A house with its broken wire reconnected',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ intent?: string }>();
  const { theme } = useHousewireTheme();
  const [page, setPage] = useState(0);
  const finishOnboarding = useHousewireStore((state) => state.finishOnboarding);
  const selectMission = useHousewireStore((state) => state.selectMission);
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const { play } = useHousewireSound();
  const intent = Array.isArray(params.intent) ? params.intent[0] : params.intent;
  const current = beats[page];

  const finish = () => {
    finishOnboarding();
    play('relay', 0.58);

    if (intent === 'solo') {
      prepareJudgeCut();
      router.replace('/mission');
      return;
    }

    if (intent === 'create') {
      selectMission('line-13');
      prepareSession('lan');
      router.replace('/setup');
      return;
    }

    router.replace('/home');
  };

  const advance = () => {
    if (page === beats.length - 1) {
      finish();
      return;
    }
    play('switch', 0.38);
    setPage((value) => value + 1);
  };

  const finalLabel = intent === 'solo' ? 'Start solo' : intent === 'create' ? 'Choose rooms' : 'See mission';

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <ScrollView
        contentContainerStyle={styles.screen}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.topline}>
        <Text
          style={[
            styles.brand,
            { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy },
          ]}
        >
          HOUSEWIRE
        </Text>
        <Pressable
          accessibilityHint="Finishes the introduction"
          accessibilityRole="button"
          hitSlop={10}
          onPress={finish}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text
            style={[
              styles.skip,
              { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium },
            ]}
          >
            Skip
          </Text>
        </Pressable>
      </View>

      <BeatVisual kind={current.kind} label={current.visualLabel} />

      <View style={styles.copy}>
        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy },
          ]}
        >
          {current.title}
        </Text>
        <Text
          style={[
            styles.caption,
            { color: theme.colors.muted, fontFamily: theme.typography.families.body },
          ]}
        >
          {current.caption}
        </Text>
      </View>

      <View style={styles.controls}>
        <View
          accessibilityLabel={`Step ${page + 1} of ${beats.length}`}
          accessible
          style={styles.dots}
        >
          {beats.map((beat, index) => (
            <View
              key={beat.kind}
              style={[
                styles.dot,
                {
                  backgroundColor: index <= page ? theme.colors.wire : theme.colors.draft,
                },
              ]}
            />
          ))}
        </View>
        <PrimaryAction label={page === beats.length - 1 ? finalLabel : 'Next'} onPress={advance} />
      </View>
      </ScrollView>
    </ScreenShell>
  );
}

function BeatVisual({ kind, label }: { kind: BeatKind; label: string }) {
  const { theme } = useHousewireTheme();

  return (
    <View accessibilityLabel={label} accessibilityRole="image" style={styles.visual}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.visualInner}
      >
        {kind === 'place' ? (
          <>
            <View style={[styles.horizontalWire, { backgroundColor: theme.colors.wire }]} />
            <View style={styles.phoneRow}>
              {[0, 1, 2].map((item) => (
                <View
                  key={item}
                  style={[
                    styles.phone,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: item === 1 ? theme.colors.wire : theme.colors.draft,
                    },
                  ]}
                >
                  <Ionicons color={theme.colors.text} name="phone-portrait-outline" size={42} />
                  <View style={[styles.phoneContact, { backgroundColor: theme.colors.wire }]} />
                </View>
              ))}
            </View>
          </>
        ) : null}

        {kind === 'share' ? (
          <View style={styles.shareRow}>
            <View style={[styles.clueCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.draft }]}>
              <GlyphMark color={theme.colors.text} glyph="EYE" size={58} />
              <Ionicons color={theme.colors.wire} name="ear-outline" size={20} />
            </View>
            <View style={styles.signalBridge}>
              {[18, 34, 24, 42].map((height, index) => <View key={index} style={[styles.signalBar, { backgroundColor: theme.colors.wire, height }]} />)}
            </View>
            <View style={[styles.clueCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.draft }]}>
              <GlyphMark color={theme.colors.warning} glyph="EYE" size={46} />
              <Text style={[styles.clueDigit, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>= 7</Text>
            </View>
          </View>
        ) : null}

        {kind === 'escape' ? (
          <View style={styles.houseVisual}>
            <Image contentFit="cover" source={require('../assets/art/blackout-protocol.png')} style={styles.houseImage} />
            <View style={[styles.lens, { borderColor: theme.colors.wire }]}>
              <GlyphMark color="#F4E8CF" glyph="KEY" size={48} />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function PrimaryAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: theme.colors.wire, borderColor: theme.colors.wire },
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.actionText,
          { color: theme.colors.textInverse, fontFamily: theme.typography.families.bodyMedium },
        ]}
      >
        {label}
      </Text>
      <Ionicons color={theme.colors.textInverse} name="arrow-forward" size={21} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: 18,
  },
  actionText: {
    fontSize: 18,
    lineHeight: 23,
  },
  brand: {
    fontSize: 27,
    letterSpacing: 0.4,
    lineHeight: 30,
  },
  caption: {
    fontSize: 18,
    lineHeight: 25,
  },
  clueDigit: { fontSize: 20, lineHeight: 24 },
  clueCard: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    height: 116,
    justifyContent: 'center',
    width: 96,
  },
  controls: {
    gap: 20,
  },
  copy: {
    gap: 7,
  },
  dot: {
    borderRadius: 5,
    height: 8,
    width: 38,
  },
  dots: {
    flexDirection: 'row',
    gap: 7,
  },
  horizontalWire: {
    height: 3,
    left: 18,
    position: 'absolute',
    right: 18,
    top: '50%',
  },
  houseVisual: {
    alignItems: 'center',
    borderRadius: 5,
    height: 245,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 280,
  },
  houseImage: { ...StyleSheet.absoluteFillObject },
  lens: { alignItems: 'center', backgroundColor: 'rgba(7,8,6,0.72)', borderRadius: 52, borderWidth: 2, height: 104, justifyContent: 'center', width: 104 },
  phone: {
    alignItems: 'center',
    borderRadius: 5,
    borderWidth: 1,
    gap: 12,
    height: 120,
    justifyContent: 'center',
    width: 78,
  },
  phoneContact: {
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  phoneRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  screen: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  shareRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'center',
  },
  signalBar: { width: 4 },
  signalBridge: { alignItems: 'center', flexDirection: 'row', gap: 4, height: 56 },
  skip: {
    fontSize: 16,
    lineHeight: 22,
  },
  title: {
    fontSize: 50,
    letterSpacing: 0.2,
    lineHeight: 49,
  },
  topline: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  visual: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 310,
  },
  visualInner: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
});

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ScreenShell } from '@/src/components/ScreenShell';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

type ActionIcon = 'people-outline' | 'scan-outline' | 'sunny-outline';

export default function OpeningScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { theme } = useHousewireTheme();
  const missionStartedAt = useHousewireStore((state) => state.missionStartedAt);
  const onboardingComplete = useHousewireStore((state) => state.onboardingComplete);
  const tutorialComplete = useHousewireStore((state) => state.tutorialComplete);
  const { play } = useHousewireSound();
  const compact = height < 680;

  const createGame = () => {
    play('relay', 0.55);
    router.push(onboardingComplete ? '/modes' : '/onboarding');
  };

  const openTutorial = () => {
    play('switch', 0.62);
    router.push('/tutorial');
  };

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <ScrollView
        contentContainerStyle={styles.screen}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, compact && styles.heroCompact]}>
          <Image
            accessibilityLabel="A cutaway house crossed by a glowing orange wire"
            contentFit="cover"
            source={require('@/assets/art/blackout-protocol.png')}
            style={styles.heroImage}
          />
          <View style={styles.heroShade} />
          <View style={[styles.brandRow, compact && styles.brandRowCompact]}>
            <Text
              accessibilityRole="header"
              style={[
                styles.wordmark,
                compact && styles.wordmarkCompact,
                { color: '#F1E9D7', fontFamily: theme.typography.families.displayHeavy },
              ]}
            >
              HOUSEWIRE
            </Text>
            <View style={[styles.liveContact, { backgroundColor: theme.colors.wire }]} />
          </View>
        </View>

        <View
          style={[
            styles.panel,
            compact && styles.panelCompact,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.draft },
          ]}
        >
          <Text
            style={[
              styles.premise,
              compact && styles.premiseCompact,
              { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium },
            ]}
          >
            Escape rooms, family trivia and live team races built for the people in the same house.
          </Text>

          {missionStartedAt ? (
            <Pressable
              accessibilityHint="Returns to the mission already in progress"
              accessibilityRole="button"
              onPress={() => router.push('/mission')}
              style={({ pressed }) => [
                styles.resume,
                { borderColor: theme.colors.ready },
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.resumeDot, { backgroundColor: theme.colors.ready }]} />
              <Text
                style={[
                  styles.resumeText,
                  { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium },
                ]}
              >
                Resume game
              </Text>
              <Ionicons color={theme.colors.ready} name="arrow-forward" size={20} />
            </Pressable>
          ) : null}

          <HouseAction
            accessibilityHint={onboardingComplete ? 'Opens the three Housewire game modes' : 'Starts a short first-time tour'}
            icon="people-outline"
            label={onboardingComplete ? 'Choose a game' : 'Start here · 2 minute tour'}
            onPress={createGame}
          />

          <View style={styles.splitActions}>
            <View style={styles.halfAction}>
              <HouseAction
                accessibilityHint="Opens the camera and code entry for another game"
                icon="scan-outline"
                label="Join game"
                onPress={() => {
                  play('switch', 0.48);
                  router.push('/join');
                }}
                variant="secondary"
              />
            </View>
            <View style={styles.halfAction}>
              <HouseAction
                accessibilityHint="Opens the easy four-step First Light practice case"
                icon="sunny-outline"
                label={tutorialComplete ? 'Replay practice' : 'Easy practice'}
                onPress={openTutorial}
                variant="secondary"
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function HouseAction({
  accessibilityHint,
  icon,
  label,
  onPress,
  variant = 'primary',
}: {
  accessibilityHint: string;
  icon: ActionIcon;
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}) {
  const { theme } = useHousewireTheme();
  const primary = variant === 'primary';
  const textColor = primary ? theme.colors.textInverse : theme.colors.text;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: primary ? theme.colors.wire : theme.colors.surface,
          borderColor: primary ? theme.colors.wire : theme.colors.draft,
        },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons color={textColor} name={icon} size={21} />
      <Text
        numberOfLines={1}
        style={[
          styles.actionText,
          { color: textColor, fontFamily: theme.typography.families.bodyMedium },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: 16,
  },
  actionText: {
    fontSize: 17,
    lineHeight: 22,
  },
  brandRow: {
    alignItems: 'center',
    bottom: 42,
    flexDirection: 'row',
    gap: 12,
    left: 20,
    position: 'absolute',
  },
  brandRowCompact: {
    bottom: 22,
  },
  halfAction: {
    flex: 1,
  },
  hero: {
    height: 430,
    overflow: 'hidden',
  },
  heroCompact: {
    height: 300,
  },
  heroImage: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  heroShade: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  liveContact: {
    borderRadius: 7,
    height: 13,
    width: 13,
  },
  panel: {
    borderTopWidth: 1,
    gap: 12,
    paddingBottom: 34,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  panelCompact: {
    paddingBottom: 24,
    paddingTop: 18,
  },
  premise: {
    fontSize: 20,
    lineHeight: 28,
    marginBottom: 8,
    maxWidth: 520,
  },
  premiseCompact: {
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 2,
  },
  pressed: {
    opacity: 0.76,
  },
  resume: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  resumeDot: {
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  resumeText: {
    flex: 1,
    fontSize: 16,
  },
  screen: {
    flexGrow: 1,
  },
  splitActions: {
    flexDirection: 'row',
    gap: 10,
  },
  wordmark: {
    fontSize: 50,
    letterSpacing: 0.6,
    lineHeight: 52,
  },
  wordmarkCompact: {
    fontSize: 42,
    lineHeight: 44,
  },
});

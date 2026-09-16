import 'react-native-reanimated';

import {
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
} from '@expo-google-fonts/barlow-condensed';
import {
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
} from '@expo-google-fonts/cormorant-garamond';
import {
  SplineSansMono_400Regular,
  SplineSansMono_600SemiBold,
} from '@expo-google-fonts/spline-sans-mono';
import { DarkTheme, ThemeProvider } from 'expo-router/react-navigation';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useCircuitRaceStore } from '@/src/store/use-circuit-race-store';
import { useConnectionSettingsStore } from '@/src/store/use-connection-settings-store';
import { HousewireThemeProvider } from '@/src/theme';
import { HousewireSessionProvider } from '@/src/features/session';
import { CircuitRaceRuntimeProvider } from '@/src/features/race';
import { HousewireSoundProvider } from '@/src/hooks/use-housewire-sound';
import { ClubHistorySync } from '@/src/features/family-club/ClubHistorySync';
import { StoryRoomRuntime } from '@/src/features/story-rooms/StoryRoomRuntime';
import { HousewireMusic } from '@/src/features/music/HousewireMusic';

void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  const settings = useHousewireStore((state) => state.settings);
  const hydrated = useHousewireStore((state) => state.hydrated);
  const raceHydrated = useCircuitRaceStore((state) => state.hydrated);
  const connectionsHydrated = useConnectionSettingsStore((state) => state.hydrated);
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
    SplineSansMono_400Regular,
    SplineSansMono_600SemiBold,
  });

  useEffect(() => {
    if ((fontsLoaded || fontError) && hydrated && raceHydrated && connectionsHydrated) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded, hydrated, raceHydrated, connectionsHydrated]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(settings.daylight ? '#F7EEDB' : '#15223A');
  }, [settings.daylight]);

  if ((!fontsLoaded && !fontError) || !hydrated || !raceHydrated || !connectionsHydrated) return null;

  const navigationTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: settings.daylight ? '#F7EEDB' : '#15223A',
      card: settings.daylight ? '#F7EEDB' : '#15223A',
      primary: '#FF7657',
      text: settings.daylight ? '#1B263B' : '#FFF6E5',
      border: settings.daylight ? '#D6CBB8' : '#3A4A65',
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HousewireThemeProvider
        highContrast={settings.highContrast}
        mode={settings.daylight ? 'daylight' : 'dark'}
        reduceMotion={settings.reducedMotion}
      >
        <HousewireSoundProvider>
          <HousewireMusic />
          <HousewireSessionProvider>
            <StoryRoomRuntime />
            <CircuitRaceRuntimeProvider>
              <ThemeProvider value={navigationTheme}>
                <ClubHistorySync />
                <Stack
                  screenOptions={{
                    animation: settings.reducedMotion ? 'none' : 'fade',
                    animationDuration: 220,
                    contentStyle: { backgroundColor: navigationTheme.colors.background },
                    headerShown: false,
                  }}
                />
              </ThemeProvider>
            </CircuitRaceRuntimeProvider>
          </HousewireSessionProvider>
        </HousewireSoundProvider>
      </HousewireThemeProvider>
    </GestureHandlerRootView>
  );
}

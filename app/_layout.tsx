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
import { HousewireThemeProvider } from '@/src/theme';
import { HousewireSessionProvider } from '@/src/features/session';
import { HousewireSoundProvider } from '@/src/hooks/use-housewire-sound';

void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  const settings = useHousewireStore((state) => state.settings);
  const hydrated = useHousewireStore((state) => state.hydrated);
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
    SplineSansMono_400Regular,
    SplineSansMono_600SemiBold,
  });

  useEffect(() => {
    if ((fontsLoaded || fontError) && hydrated) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded, hydrated]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(settings.daylight ? '#EFE6D2' : '#070806');
  }, [settings.daylight]);

  if ((!fontsLoaded && !fontError) || !hydrated) return null;

  const navigationTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: settings.daylight ? '#EFE6D2' : '#070806',
      card: settings.daylight ? '#EFE6D2' : '#070806',
      primary: '#F04A2E',
      text: settings.daylight ? '#101310' : '#F4E8CF',
      border: settings.daylight ? '#BDB5A2' : '#393329',
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
          <HousewireSessionProvider>
            <ThemeProvider value={navigationTheme}>
              <Stack
                screenOptions={{
                  animation: settings.reducedMotion ? 'none' : 'fade',
                  animationDuration: 220,
                  contentStyle: { backgroundColor: navigationTheme.colors.background },
                  headerShown: false,
                }}
              />
            </ThemeProvider>
          </HousewireSessionProvider>
        </HousewireSoundProvider>
      </HousewireThemeProvider>
    </GestureHandlerRootView>
  );
}

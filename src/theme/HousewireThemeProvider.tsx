import React, {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import {
  createHousewireTheme,
  darkHousewireTheme,
  type HousewireTheme,
  type HousewireThemeMode,
} from './tokens';

export type HousewireThemePreference = HousewireThemeMode | 'system';

export interface HousewireThemeContextValue {
  theme: HousewireTheme;
  mode: HousewireThemeMode;
  highContrast: boolean;
  reducedMotion: boolean;
}

export interface HousewireThemeProviderProps extends PropsWithChildren {
  mode?: HousewireThemePreference;
  highContrast?: boolean;
  reduceMotion?: boolean;
}

const defaultContext: HousewireThemeContextValue = {
  theme: darkHousewireTheme,
  mode: 'dark',
  highContrast: false,
  reducedMotion: false,
};

const HousewireThemeContext = createContext<HousewireThemeContextValue>(defaultContext);

export function HousewireThemeProvider({
  children,
  mode: preference = 'dark',
  highContrast = false,
  reduceMotion,
}: HousewireThemeProviderProps) {
  const colorScheme = useColorScheme();
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setSystemReducedMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setSystemReducedMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const mode: HousewireThemeMode =
    preference === 'system' ? (colorScheme === 'light' ? 'daylight' : 'dark') : preference;
  const reducedMotion = reduceMotion ?? systemReducedMotion;
  const theme = useMemo(() => createHousewireTheme(mode, highContrast), [highContrast, mode]);
  const value = useMemo(
    () => ({ theme, mode, highContrast, reducedMotion }),
    [highContrast, mode, reducedMotion, theme],
  );

  return <HousewireThemeContext.Provider value={value}>{children}</HousewireThemeContext.Provider>;
}

export function useHousewireTheme(): HousewireThemeContextValue {
  return useContext(HousewireThemeContext);
}

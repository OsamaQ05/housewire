import { Platform, StyleSheet } from 'react-native';

export type HousewireThemeMode = 'dark' | 'daylight';
export type HousewireRole = 'relay' | 'listener' | 'navigator' | 'breaker';
export type HousewireStatus =
  | 'offline'
  | 'idle'
  | 'waiting'
  | 'live'
  | 'ready'
  | 'fault'
  | 'lost';

export interface HousewirePalette {
  background: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textInverse: string;
  muted: string;
  faint: string;
  draft: string;
  wire: string;
  ready: string;
  warning: string;
  fault: string;
  shadow: string;
  texture: string;
  roles: Record<HousewireRole, string>;
}

export interface HousewireTheme {
  mode: HousewireThemeMode;
  highContrast: boolean;
  colors: HousewirePalette;
  spacing: typeof spacing;
  radii: typeof radii;
  strokes: typeof strokes;
  typography: typeof typography;
}

export const spacing = {
  hairline: 2,
  xxs: 4,
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  display: 72,
} as const;

export const radii = {
  none: 0,
  technical: 2,
  terminal: 999,
} as const;

export const strokes = {
  hairline: StyleSheet.hairlineWidth,
  draft: 1,
  active: 3,
  heavy: 5,
} as const;

export const typography = {
  families: {
    display: 'BarlowCondensed_700Bold',
    displayHeavy: 'BarlowCondensed_800ExtraBold',
    story: 'CormorantGaramond_600SemiBold',
    storyBold: 'CormorantGaramond_700Bold',
    mono: 'SplineSansMono_400Regular',
    monoMedium: 'SplineSansMono_600SemiBold',
    body: Platform.select({
      ios: 'System',
      android: 'sans-serif',
      default: 'system-ui',
    }),
    bodyMedium: Platform.select({
      ios: 'System',
      android: 'sans-serif-medium',
      default: 'system-ui',
    }),
  },
  sizes: {
    telemetry: 10,
    label: 12,
    body: 17,
    instruction: 19,
    phase: 30,
    title: 44,
    hero: 72,
  },
  lineHeights: {
    telemetry: 14,
    label: 16,
    body: 24,
    instruction: 27,
    phase: 31,
    title: 42,
    hero: 66,
  },
} as const;

const darkPalette: HousewirePalette = {
  background: '#070806',
  surface: '#10110D',
  surfaceRaised: '#191812',
  text: '#F4E8CF',
  textInverse: '#070806',
  muted: '#B5A88F',
  faint: '#625A4B',
  draft: '#393329',
  wire: '#F04A2E',
  ready: '#78D9B3',
  warning: '#D9A94C',
  fault: '#FF5A5F',
  shadow: '#000000',
  texture: '#F1E9D7',
  roles: {
    relay: '#F04A2E',
    listener: '#78D9B3',
    navigator: '#D9A94C',
    breaker: '#D7C4A3',
  },
};

const daylightPalette: HousewirePalette = {
  background: '#EFE6D2',
  surface: '#E4D9C1',
  surfaceRaised: '#F7F0E1',
  text: '#101310',
  textInverse: '#F7F0E1',
  muted: '#5F655F',
  faint: '#999C91',
  draft: '#BDB5A2',
  wire: '#D83D1F',
  ready: '#4A7100',
  warning: '#8B5A00',
  fault: '#B80D3B',
  shadow: '#544D40',
  texture: '#101310',
  roles: {
    relay: '#D83D1F',
    listener: '#08758A',
    navigator: '#8B5A00',
    breaker: '#6751A8',
  },
};

const highContrastDark: Partial<HousewirePalette> = {
  background: '#000000',
  surface: '#080A09',
  surfaceRaised: '#101310',
  text: '#FFFFFF',
  muted: '#D7DAD6',
  faint: '#8C928D',
  draft: '#69706B',
  wire: '#FF704D',
  ready: '#D8FF70',
  fault: '#FF5A7C',
};

const highContrastDaylight: Partial<HousewirePalette> = {
  background: '#FFFFFF',
  surface: '#EEE8DA',
  surfaceRaised: '#FFFFFF',
  text: '#000000',
  muted: '#323632',
  faint: '#686D68',
  draft: '#777166',
  wire: '#B92C12',
  ready: '#315400',
  fault: '#9D0029',
};

export function createHousewireTheme(
  mode: HousewireThemeMode = 'dark',
  highContrast = false,
): HousewireTheme {
  const base = mode === 'daylight' ? daylightPalette : darkPalette;
  const contrast = mode === 'daylight' ? highContrastDaylight : highContrastDark;

  return {
    mode,
    highContrast,
    colors: highContrast ? { ...base, ...contrast } : base,
    spacing,
    radii,
    strokes,
    typography,
  };
}

export function statusColor(theme: HousewireTheme, status: HousewireStatus): string {
  switch (status) {
    case 'live':
      return theme.colors.wire;
    case 'ready':
      return theme.colors.ready;
    case 'fault':
    case 'lost':
      return theme.colors.fault;
    case 'waiting':
      return theme.colors.warning;
    case 'offline':
      return theme.colors.faint;
    case 'idle':
    default:
      return theme.colors.muted;
  }
}

export const darkHousewireTheme = createHousewireTheme('dark');
export const daylightHousewireTheme = createHousewireTheme('daylight');

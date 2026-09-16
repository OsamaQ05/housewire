import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getConfig } from 'expo/config';
import ignore from 'ignore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface AndroidBuildProfile {
  android: { buildType: string; gradleCommand?: string };
  developmentClient?: boolean;
  distribution: string;
  env: Record<string, string>;
  environment: string;
}

const eas = JSON.parse(readFileSync(resolve('eas.json'), 'utf8')) as {
  build: { preview: AndroidBuildProfile; production: AndroidBuildProfile };
};
const archive = ignore().add(readFileSync(resolve('.easignore'), 'utf8'));

function evaluatedConfig() {
  // Exercise Expo's actual dynamic-config evaluator without running prebuild
  // or loading .env files. Plugin configuration is evaluated only in memory.
  return getConfig(process.cwd()).exp;
}

function pluginOptions(config: ReturnType<typeof evaluatedConfig>, name: string) {
  const plugin = config.plugins?.find((entry) => Array.isArray(entry) && entry[0] === name);
  if (!Array.isArray(plugin)) throw new Error(`Missing configured plugin: ${name}`);
  return plugin[1] as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubEnv('EAS_BUILD_PROFILE', undefined);
  vi.stubEnv('HOUSEWIRE_ALLOW_LAN', undefined);
  vi.stubEnv('EXPO_PUBLIC_HOUSEWIRE_RELAY_URL', undefined);
  vi.stubEnv('EXPO_PUBLIC_HOUSEWIRE_FORGE_URL', undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('standalone Android build profiles', () => {
  it('builds a directly installable release APK, not an Expo development client', () => {
    const preview = eas.build.preview;
    expect(preview.distribution).toBe('internal');
    expect(preview.environment).toBe('preview');
    expect(preview.developmentClient).toBe(false);
    expect(preview.android.buildType).toBe('apk');
    expect(preview.android.gradleCommand ?? '').not.toMatch(/debug/i);
    expect(preview.env.HOUSEWIRE_ALLOW_LAN).toBe('1');
  });

  it('keeps store distribution on an app bundle with LAN cleartext disabled', () => {
    const production = eas.build.production;
    expect(production.distribution).toBe('store');
    expect(production.environment).toBe('production');
    expect(production.developmentClient).toBe(false);
    expect(production.android.buildType).toBe('app-bundle');
    expect(production.env.HOUSEWIRE_ALLOW_LAN).toBe('0');
  });

  it.each([
    ['preview', '1', true],
    ['production', '0', false],
    ['unspecified', undefined, false],
  ] as const)('%s config has the correct Android networking policy', (_profile, allowLan, allowed) => {
    vi.stubEnv('HOUSEWIRE_ALLOW_LAN', allowLan);
    const config = evaluatedConfig();
    const properties = pluginOptions(config, 'expo-build-properties');
    expect(properties.android).toMatchObject({ usesCleartextTraffic: allowed });
    expect(config.android?.package).toBe('app.housewire.mobile');
  });

  it('requests recording capability without background recording or playback services', () => {
    const audio = pluginOptions(evaluatedConfig(), 'expo-audio');
    expect(audio.recordAudioAndroid).toBe(true);
    expect(audio.enableBackgroundRecording).toBe(false);
    expect(audio.enableBackgroundPlayback).toBe(false);
  });

  it('does not copy server secrets into mobile config or build profile environment', () => {
    const canary = 'housewire-test-only-secret-do-not-bundle';
    vi.stubEnv('OPENAI_API_KEY', canary);
    vi.stubEnv('HOUSEWIRE_AI_MODEL', 'test-only-server-model');
    const serialized = JSON.stringify(evaluatedConfig());
    expect(serialized).not.toContain(canary);
    expect(serialized).not.toContain('test-only-server-model');
    for (const profile of Object.values(eas.build)) {
      expect(Object.keys(profile.env)).not.toContain('OPENAI_API_KEY');
      expect(Object.keys(profile.env)).not.toContain('EXPO_PUBLIC_OPENAI_API_KEY');
    }
  });

  it('accepts an explicitly secured production backend', () => {
    vi.stubEnv('EAS_BUILD_PROFILE', 'production');
    vi.stubEnv('HOUSEWIRE_ALLOW_LAN', '0');
    vi.stubEnv('EXPO_PUBLIC_HOUSEWIRE_RELAY_URL', 'wss://relay.example.com');
    vi.stubEnv('EXPO_PUBLIC_HOUSEWIRE_FORGE_URL', 'https://ai.example.com');
    const properties = pluginOptions(evaluatedConfig(), 'expo-build-properties');
    expect(properties.android).toMatchObject({ usesCleartextTraffic: false });
  });

  it.each([
    [undefined, 'https://ai.example.com'],
    ['wss://relay.example.com', undefined],
    ['not-a-url', 'https://ai.example.com'],
    ['ws://relay.example.com', 'https://ai.example.com'],
    ['wss://relay.example.com', 'http://ai.example.com'],
    ['wss://user:password@relay.example.com', 'https://ai.example.com'],
    ['wss://relay.example.com', 'https://user:password@ai.example.com'],
  ] as const)('refuses missing, insecure, or credential-bearing production endpoints (%s, %s)', (relay, ai) => {
    vi.stubEnv('EAS_BUILD_PROFILE', 'production');
    vi.stubEnv('HOUSEWIRE_ALLOW_LAN', '0');
    vi.stubEnv('EXPO_PUBLIC_HOUSEWIRE_RELAY_URL', relay);
    vi.stubEnv('EXPO_PUBLIC_HOUSEWIRE_FORGE_URL', ai);
    expect(evaluatedConfig).toThrow(/Set EXPO_PUBLIC_|must use/);
  });

  it('refuses a store build that accidentally retains the preview LAN flag', () => {
    vi.stubEnv('EAS_BUILD_PROFILE', 'production');
    vi.stubEnv('HOUSEWIRE_ALLOW_LAN', '1');
    vi.stubEnv('EXPO_PUBLIC_HOUSEWIRE_RELAY_URL', 'wss://relay.example.com');
    vi.stubEnv('EXPO_PUBLIC_HOUSEWIRE_FORGE_URL', 'https://ai.example.com');
    expect(evaluatedConfig).toThrow('Store builds must not enable HOUSEWIRE_ALLOW_LAN');
  });
});

describe('EAS upload boundary', () => {
  it.each([
    '.env',
    '.env.local',
    '.env.production',
    'server/.env',
    'credentials.json',
    'signing/credentials.json',
    'signing/android.keystore',
    'signing/release.jks',
    'signing/apple.p8',
    'signing/apple.p12',
    'signing/private.key',
    'signing/private.pem',
    'signing/profile.mobileprovision',
  ])('excludes private configuration or signing material: %s', (path) => {
    expect(archive.ignores(path)).toBe(true);
  });

  it.each([
    'submission/HOUSEWIRE_FINAL_3MIN_DEMO.mp4',
    'submission/2026_Zero_Osama_Feras_Mohammed.mp4',
    'submission/2026_Zero_Osama_Feras_Mohammed_Poster.pptx',
    'docs/FAMILY-FREQUENCY-GAME-NIGHT.md',
    'server/index.ts',
    'housewire-runtime.log',
    '.expo/settings.json',
    '.expo-anonymous/settings.json',
    '.git/config',
    '.vscode/settings.json',
    'dist-android-final/assets/bundle.js',
    'tmp/recording.mp4',
    'downloads/housewire.apk',
    'src/features/race/attempt-limits.test.ts',
  ])('excludes local or non-mobile build output: %s', (path) => {
    expect(archive.ignores(path)).toBe(true);
  });

  it.each([
    'package.json',
    'package-lock.json',
    'app.json',
    'app.config.ts',
    'app.config.js',
    'eas.json',
    'tsconfig.json',
    '.env.example',
    'app/_layout.tsx',
    'src/features/trivia/FrequencyRoundBoard.tsx',
    'src/hooks/use-housewire-sound.ts',
    'assets/art/line13-house-v2.png',
    'assets/images/icon.png',
    'assets/audio/ring.wav',
  ])('keeps required mobile source and bundled assets: %s', (path) => {
    expect(archive.ignores(path)).toBe(false);
  });
});

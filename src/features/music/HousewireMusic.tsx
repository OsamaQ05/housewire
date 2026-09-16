import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, usePathname } from 'expo-router';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Pressable, StyleSheet, Text } from 'react-native';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { musicMayPlay, routeMusic, storyMusic, type MusicTrack } from './music-catalog';
import { musicFocus } from './music-focus';
import { MusicPlayer } from './MusicPlayer';

let storySelection: { token: symbol; track: MusicTrack | null } | null = null;
const selectionListeners = new Set<() => void>();
const selectionSubscribe = (listener: () => void) => { selectionListeners.add(listener); return () => { selectionListeners.delete(listener); }; };
const selectionSnapshot = () => storySelection;
const notifySelection = () => selectionListeners.forEach(listener => listener());

/** Focus-scoped: a still-mounted previous screen can never keep its music playing. */
export function useStoryMusic(room: string, stage: string, mechanic?: string, playing = true) {
  const track = playing ? storyMusic(room, stage, mechanic) : null;
  useFocusEffect(useCallback(() => {
    const token = Symbol('story-score');
    storySelection = { token, track }; notifySelection();
    return () => { if (storySelection?.token === token) { storySelection = null; notifySelection(); } };
  }, [track]));
}

export function useMusicSilence(active: boolean) {
  useEffect(() => active ? musicFocus.acquire() : undefined, [active]);
}

/** One native player for the whole navigator. Never changes the recorder's audio mode. */
export function HousewireMusic() {
  const path = usePathname();
  const selected = useSyncExternalStore(selectionSubscribe, selectionSnapshot, () => null);
  const silenced = useSyncExternalStore(musicFocus.subscribe, musicFocus.getSnapshot, () => false);
  const enabled = useHousewireStore(state => state.settings.music);
  const { audioReady } = useHousewireSound();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const track = path === '/mission' ? selected?.track ?? null : routeMusic(path);
  const allowed = audioReady && musicMayPlay(enabled, foreground, silenced, track);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  return <MusicPlayer allowed={allowed} track={track} />;
}

export function MusicToggle({ color = '#FFF4DC', compact = false }: { color?: string; compact?: boolean }) {
  const enabled = useHousewireStore(state => state.settings.music);
  const updateSettings = useHousewireStore(state => state.updateSettings);
  return <Pressable accessibilityRole="switch" accessibilityLabel="Background music" accessibilityHint="Independent of sound effects and voice notes" aria-checked={enabled} accessibilityState={{ checked: enabled }} onPress={() => updateSettings({ music: !enabled })} style={({ pressed }) => [styles.toggle, pressed && { opacity: .6 }]}>
    <Ionicons name={enabled ? 'musical-notes' : 'musical-notes-outline'} color={color} size={18} />
    {!compact ? <Text style={[styles.label, { color }]}>Music {enabled ? 'on' : 'off'}</Text> : null}
    {!enabled && compact ? <Text style={[styles.off, { color }]}>off</Text> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  toggle: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  label: { fontSize: 12, fontWeight: '600' },
  off: { fontSize: 9 },
});

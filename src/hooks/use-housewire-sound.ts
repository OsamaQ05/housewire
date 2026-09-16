import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import {
  createContext,
  createElement,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useHousewireStore } from '@/src/store/use-housewire-store';
import { silenceMusicFor } from '@/src/features/music/music-focus';

type SoundName =
  | 'switch'
  | 'relay'
  | 'pulse'
  | 'accept'
  | 'warning'
  | 'ring'
  | 'complete'
  | 'knock1'
  | 'knock2'
  | 'knock3'
  | 'knock4'
  | 'node1'
  | 'node2'
  | 'node3'
  | 'node4'
  | 'wordEmber'
  | 'wordHollow'
  | 'wordSeven'
  | 'wordRiver'
  | 'wordLantern'
  | 'wordCopper'
  | 'wordWindow'
  | 'wordOrbit'
  | 'deadAirOpen'
  | 'nightGlassOpen'
  | 'circuitShort'
  | 'circuitLong';

const sources = {
  switch: require('@/assets/audio/switch.wav'),
  relay: require('@/assets/audio/relay.wav'),
  pulse: require('@/assets/audio/pulse.wav'),
  accept: require('@/assets/audio/accept.wav'),
  warning: require('@/assets/audio/warning.wav'),
  ring: require('@/assets/audio/ring.wav'),
  complete: require('@/assets/audio/complete.wav'),
  knock1: require('@/assets/audio/knock-1.wav'),
  knock2: require('@/assets/audio/knock-2.wav'),
  knock3: require('@/assets/audio/knock-3.wav'),
  knock4: require('@/assets/audio/knock-4.wav'),
  node1: require('@/assets/audio/node-1.wav'),
  node2: require('@/assets/audio/node-2.wav'),
  node3: require('@/assets/audio/node-3.wav'),
  node4: require('@/assets/audio/node-4.wav'),
  wordEmber: require('@/assets/audio/word-ember.wav'),
  wordHollow: require('@/assets/audio/word-hollow.wav'),
  wordSeven: require('@/assets/audio/word-seven.wav'),
  wordRiver: require('@/assets/audio/word-river.wav'),
  wordLantern: require('@/assets/audio/word-lantern.wav'),
  wordCopper: require('@/assets/audio/word-copper.wav'),
  wordWindow: require('@/assets/audio/word-window.wav'),
  wordOrbit: require('@/assets/audio/word-orbit.wav'),
  deadAirOpen: require('@/assets/audio/dead-air-open.wav'),
  nightGlassOpen: require('@/assets/audio/night-glass-open.wav'),
  circuitShort: require('@/assets/audio/circuit-short.wav'),
  circuitLong: require('@/assets/audio/circuit-long.wav'),
} as const;

interface HousewireSoundValue {
  audioReady: boolean;
  play: (name: SoundName, volume?: number) => void;
  playKnocks: (count: 1 | 2 | 3 | 4, volume?: number) => void;
}

const HousewireSoundContext = createContext<HousewireSoundValue | null>(null);

/**
 * Owns every short-effect player for the lifetime of the app navigator.
 * Route-level players could be released while iOS was still activating their
 * audio session, producing "server was dead" native failures after a tap.
 */
export function HousewireSoundProvider({ children }: PropsWithChildren) {
  const enabled = useHousewireStore((state) => state.settings.sound);
  const switchPlayer = useAudioPlayer(sources.switch);
  const relayPlayer = useAudioPlayer(sources.relay);
  const pulsePlayer = useAudioPlayer(sources.pulse);
  const acceptPlayer = useAudioPlayer(sources.accept);
  const warningPlayer = useAudioPlayer(sources.warning);
  const ringPlayer = useAudioPlayer(sources.ring);
  const completePlayer = useAudioPlayer(sources.complete);
  const knock1Player = useAudioPlayer(sources.knock1);
  const knock2Player = useAudioPlayer(sources.knock2);
  const knock3Player = useAudioPlayer(sources.knock3);
  const knock4Player = useAudioPlayer(sources.knock4);
  const node1Player = useAudioPlayer(sources.node1);
  const node2Player = useAudioPlayer(sources.node2);
  const node3Player = useAudioPlayer(sources.node3);
  const node4Player = useAudioPlayer(sources.node4);
  const wordEmberPlayer = useAudioPlayer(sources.wordEmber);
  const wordHollowPlayer = useAudioPlayer(sources.wordHollow);
  const wordSevenPlayer = useAudioPlayer(sources.wordSeven);
  const wordRiverPlayer = useAudioPlayer(sources.wordRiver);
  const wordLanternPlayer = useAudioPlayer(sources.wordLantern);
  const wordCopperPlayer = useAudioPlayer(sources.wordCopper);
  const wordWindowPlayer = useAudioPlayer(sources.wordWindow);
  const wordOrbitPlayer = useAudioPlayer(sources.wordOrbit);
  const deadAirOpenPlayer = useAudioPlayer(sources.deadAirOpen);
  const nightGlassOpenPlayer = useAudioPlayer(sources.nightGlassOpen);
  const circuitShortPlayer = useAudioPlayer(sources.circuitShort);
  const circuitLongPlayer = useAudioPlayer(sources.circuitLong);
  const mountedRef = useRef(true);
  const audioReadyRef = useRef(false);
  const [audioReady, setAudioReady] = useState(false);
  const requestGenerationRef = useRef<Partial<Record<SoundName, number>>>({});

  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    audioReadyRef.current = false;
    void setAudioModeAsync({
      interruptionMode: 'mixWithOthers',
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    })
      .then(() => {
        if (active) { audioReadyRef.current = true; setAudioReady(true); }
      })
      .catch(() => undefined);

    return () => {
      active = false;
      mountedRef.current = false;
      audioReadyRef.current = false;
    };
  }, []);

  const players = {
    switch: switchPlayer,
    relay: relayPlayer,
    pulse: pulsePlayer,
    accept: acceptPlayer,
    warning: warningPlayer,
    ring: ringPlayer,
    complete: completePlayer,
    knock1: knock1Player,
    knock2: knock2Player,
    knock3: knock3Player,
    knock4: knock4Player,
    node1: node1Player,
    node2: node2Player,
    node3: node3Player,
    node4: node4Player,
    wordEmber: wordEmberPlayer,
    wordHollow: wordHollowPlayer,
    wordSeven: wordSevenPlayer,
    wordRiver: wordRiverPlayer,
    wordLantern: wordLanternPlayer,
    wordCopper: wordCopperPlayer,
    wordWindow: wordWindowPlayer,
    wordOrbit: wordOrbitPlayer,
    deadAirOpen: deadAirOpenPlayer,
    nightGlassOpen: nightGlassOpenPlayer,
    circuitShort: circuitShortPlayer,
    circuitLong: circuitLongPlayer,
  };

  const play = useCallback(
    (name: SoundName, volume = 1) => {
      if (!enabled || !audioReadyRef.current) return;
      if (/^(word|knock|node|circuit)/.test(name)) silenceMusicFor(name.startsWith('word') ? 4_000 : 2_000);
      const player = players[name];
      const generation = (requestGenerationRef.current[name] ?? 0) + 1;
      requestGenerationRef.current[name] = generation;

      try {
        player.volume = Math.max(0, Math.min(1, volume));
        void player
          .seekTo(0)
          .then(() => {
            if (mountedRef.current && requestGenerationRef.current[name] === generation) {
              try {
                player.play();
              } catch {
                // Sound is optional feedback; a native-session interruption must
                // never break navigation or an escape proof.
              }
            }
          })
          .catch(() => undefined);
      } catch {
        // A system audio interruption must degrade to silence, not a red screen.
      }
    },
    // Individual player objects are stable for the lifetime of this hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled],
  );

  const playKnocks = useCallback(
    (count: 1 | 2 | 3 | 4, volume = 0.9) => play(`knock${count}` as SoundName, volume),
    [play],
  );

  const value = useMemo(() => ({ audioReady, play, playKnocks }), [audioReady, play, playKnocks]);
  return createElement(HousewireSoundContext.Provider, { value }, children);
}

export function useHousewireSound(): HousewireSoundValue {
  const value = useContext(HousewireSoundContext);
  if (!value) throw new Error('useHousewireSound must be used inside HousewireSoundProvider.');
  return value;
}

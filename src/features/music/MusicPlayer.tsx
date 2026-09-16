import { useAudioPlayer } from 'expo-audio';
import { useEffect, useRef } from 'react';
import { musicAssets } from './music-assets';
import { MUSIC_TRACKS, type MusicTrack } from './music-catalog';

export function MusicPlayer({ allowed, track }: { allowed: boolean; track: MusicTrack | null }) {
  const player = useAudioPlayer(null, { updateInterval: 750 });
  const loadedTrack = useRef<MusicTrack | null>(null);
  useEffect(() => {
    let live = true;
    let awaitingLoad = false;
    let fade: ReturnType<typeof setInterval> | undefined;
    const play = () => {
      if (!live || !allowed || !track) return;
      try {
        if (!player.isLoaded) { awaitingLoad = true; return; }
        awaitingLoad = false;
        if (!player.playing) player.play();
      } catch { /* Unavailable sound never blocks a game. */ }
    };
    try {
      if (!allowed || !track) { player.pause(); player.volume = 0; }
      else {
        if (loadedTrack.current !== track) {
          player.pause(); player.volume = 0; player.replace(musicAssets[track]); loadedTrack.current = track;
        }
        player.loop = true;
        play();
        const target = MUSIC_TRACKS[track].volume;
        fade = setInterval(() => {
          if (!live) return;
          try {
            player.volume = Math.min(target, player.volume + .018);
            if (player.volume >= target) clearInterval(fade);
          } catch { clearInterval(fade); }
        }, 70);
      }
    } catch { /* Native session interruptions degrade to silence. */ }
    const subscription = player.addListener('playbackStatusUpdate', status => {
      if (awaitingLoad && status.isLoaded && !status.playing) play();
    });
    return () => { live = false; clearInterval(fade); subscription.remove(); };
  }, [allowed, player, track]);
  return null;
}

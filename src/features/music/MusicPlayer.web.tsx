import { Asset } from 'expo-asset';
import { useEffect, useRef } from 'react';
import { musicAssets } from './music-assets';
import { MUSIC_TRACKS, type MusicTrack } from './music-catalog';

/** A browser adapter can catch play()'s promise; Expo's void-returning web
 * player cannot catch autoplay rejections. The phone uses MusicPlayer.tsx. */
export function MusicPlayer({ allowed, track }: { allowed: boolean; track: MusicTrack | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const source = track ? Asset.fromModule(musicAssets[track]).uri : undefined;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let live = true;
    let pending = false;
    let fade: ReturnType<typeof setInterval> | undefined;
    const play = () => {
      if (!live || !allowed || !track || !audio.paused || pending) return;
      pending = true;
      void audio.play().catch(() => undefined).finally(() => { pending = false; });
    };
    if (!allowed || !track) { audio.pause(); audio.volume = 0; }
    else {
      const target = MUSIC_TRACKS[track].volume;
      play();
      fade = setInterval(() => {
        audio.volume = Math.min(target, audio.volume + .018);
        if (audio.volume >= target) clearInterval(fade);
      }, 70);
    }
    audio.addEventListener('canplay', play);
    document.addEventListener('pointerup', play);
    document.addEventListener('keydown', play);
    return () => {
      live = false; clearInterval(fade);
      audio.removeEventListener('canplay', play);
      document.removeEventListener('pointerup', play);
      document.removeEventListener('keydown', play);
    };
  }, [allowed, source, track]);
  return <audio aria-hidden data-housewire-music={track ?? 'off'} loop preload="auto" ref={audioRef} src={source} style={{ display: 'none' }} />;
}

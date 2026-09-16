import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { FrequencyAvatar } from './FrequencyAvatar';
import { FREQUENCY_COLORS as C } from './FrequencyIdentity';

/** One short, friendly cheer. No loops, and no scoring side effects. */
export function FrequencyCheer({ name, size = 86, reducedMotion, active = true, delay = 0 }: {
  name: string; size?: number; reducedMotion: boolean; active?: boolean; delay?: number;
}) {
  const hop = useSharedValue(0);
  const wave = useSharedValue(0);
  const ring = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(hop); cancelAnimation(wave); cancelAnimation(ring);
    hop.value = 0; wave.value = 0; ring.value = 1;
    if (!reducedMotion && active) {
      hop.value = withDelay(delay, withSequence(withTiming(-14, { duration: 210, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 220 }), withTiming(-6, { duration: 130 }), withTiming(0, { duration: 160 })));
      wave.value = withDelay(delay, withSequence(withTiming(-7, { duration: 180 }), withTiming(7, { duration: 240 }), withTiming(0, { duration: 230 })));
      ring.value = 0;
      ring.value = withDelay(delay + 180, withTiming(1, { duration: 650 }));
    }
    return () => { cancelAnimation(hop); cancelAnimation(wave); cancelAnimation(ring); };
  }, [active, delay, hop, name, reducedMotion, ring, wave]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: hop.value }, { rotate: `${wave.value}deg` }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: reducedMotion ? 0 : (1 - ring.value) * 0.55, transform: [{ scale: 0.8 + ring.value * 0.55 }] }));
  return <View accessible={false} style={{ width: size, height: size }}><Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ring, { borderRadius: size / 2 }, ringStyle]} /><Animated.View style={style}><FrequencyAvatar name={name} size={size} mood={active ? 'happy' : 'idle'} /></Animated.View></View>;
}

const styles = StyleSheet.create({ ring: { borderWidth: 4, borderColor: C.sun } });

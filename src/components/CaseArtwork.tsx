import { Image, StyleSheet, type ImageSourcePropType } from 'react-native';

import type { MissionId } from '@/src/store/use-housewire-store';

export type CaseArtworkId = MissionId | 'last-light';

// Literal requires keep every original cover inside the app bundle, including offline builds.
const COVERS: Readonly<Record<CaseArtworkId, ImageSourcePropType>> = {
  'line-13': require('@/assets/art/after-hours-cover.png'),
  'dead-air': require('@/assets/art/dead-air-case.png'),
  'night-glass': require('@/assets/art/barjeel-cover.png'),
  'long-table': require('@/assets/art/long-table-case.png'),
  'last-light': require('@/assets/art/last-light-case.png'),
};

/** An explicitly sized, bundled cover; the parent owns the frame and its rounded corners. */
export function CaseArtwork({ caseId, label }: { caseId: CaseArtworkId; label?: string }) {
  return (
    <Image
      accessibilityLabel={label}
      accessible={Boolean(label)}
      fadeDuration={0}
      resizeMode="cover"
      source={COVERS[caseId]}
      style={styles.image}
    />
  );
}

const styles = StyleSheet.create({
  image: { height: '100%', left: 0, position: 'absolute', top: 0, width: '100%' },
});

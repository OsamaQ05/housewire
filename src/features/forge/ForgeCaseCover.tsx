import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import type { ForgeCase, ForgeMechanic } from '@/src/domain/case-forge/types';
import { useHousewireTheme } from '@/src/theme';

import { ForgeButton, ForgeGrid } from './ForgePrimitives';

const MECHANIC_LABEL: Readonly<Record<ForgeMechanic['kind'], string>> = {
  'distributed-order': 'ORDER',
  'motion-sync': 'SYNC',
  'private-relay': 'RELAY',
  'route-grid': 'ROUTE',
  'symbol-lock': 'LENS',
};

export function ForgeCaseCover({
  caseFile,
  onHost,
  onOpen,
  onReforge,
}: {
  caseFile: ForgeCase;
  onHost?: () => void;
  onOpen: () => void;
  onReforge: () => void;
}) {
  const { theme } = useHousewireTheme();
  const cutLabel = caseFile.providerId === 'housewire-remote-narrative-v1'
    ? 'MODEL-RANKED'
    : 'LOCAL-VALIDATED';
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.cover, { borderColor: caseFile.accent }]}>
        <Image
          accessibilityIgnoresInvertColors
          contentFit="cover"
          source={require('../../../assets/art/case-forge-blueprint.png')}
          style={styles.coverArt}
        />
        <View style={styles.coverArtVeil} />
        <ForgeGrid color={caseFile.accent} />
        <View style={styles.coverHeader}>
          <Text style={[styles.serial, { color: caseFile.accent, fontFamily: theme.typography.families.monoMedium }]}>FRESH CUT / {caseFile.id.slice(-6).toUpperCase()}</Text>
          <View style={[styles.playableStamp, { borderColor: caseFile.accent }]}>
            <View style={[styles.playableDot, { backgroundColor: caseFile.accent }]} />
            <Text style={[styles.playableText, { color: caseFile.accent, fontFamily: theme.typography.families.monoMedium }]}>PLAYABLE · {cutLabel}</Text>
          </View>
        </View>

        <View style={styles.titleBlock}>
          <Text style={[styles.theme, { color: caseFile.accent, fontFamily: theme.typography.families.monoMedium }]}>{caseFile.theme.replaceAll('-', ' ').toUpperCase()}</Text>
          <Text adjustsFontSizeToFit numberOfLines={2} style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{caseFile.title}</Text>
          <Text style={[styles.tagline, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{caseFile.tagline}</Text>
        </View>

        <CaseSeal accent={caseFile.accent} playerCount={caseFile.playerCount} stageCount={caseFile.stages.length} />

        <View style={styles.metadata}>
          <Metric label="PLAYERS" value={`${caseFile.playerCount}`} />
          <Metric label="MINUTES" value={`${caseFile.durationMinutes}`} />
          <Metric label="PRESSURE" value={`${caseFile.difficulty}/5`} />
        </View>
      </View>

      <View style={[styles.premise, { borderColor: theme.colors.draft }]}>
        <Text style={[styles.premiseLabel, { color: caseFile.accent, fontFamily: theme.typography.families.monoMedium }]}>THE INCIDENT</Text>
        <Text style={[styles.premiseText, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{caseFile.premise}</Text>
        <Text style={[styles.objective, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{caseFile.objective}</Text>
      </View>

      <View style={styles.stageStrip}>
        {caseFile.stages.map((stage, index) => (
          <View key={stage.id} style={[styles.stageTick, { borderColor: theme.colors.draft }]}>
            <Text style={[styles.stageIndex, { color: index === 0 ? caseFile.accent : theme.colors.faint, fontFamily: theme.typography.families.displayHeavy }]}>{String(index + 1).padStart(2, '0')}</Text>
            <Text numberOfLines={1} style={[styles.stageName, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{stage.title}</Text>
            <Text style={[styles.stageMechanic, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{MECHANIC_LABEL[stage.mechanic.kind]}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        {onHost ? <ForgeButton icon="radio-outline" label="Play live on family phones" onPress={onHost} /> : null}
        <ForgeButton icon="phone-portrait-outline" label="One-phone handoff rehearsal" onPress={onOpen} secondary={Boolean(onHost)} />
        <ForgeButton icon="shuffle-outline" label="Cut a different version" onPress={onReforge} secondary />
      </View>

      <View style={styles.footnote}>
        <Ionicons color={theme.colors.ready} name="shield-checkmark-outline" size={17} />
        <Text style={[styles.footnoteText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Saved on this phone · answers verified before the file was cut</Text>
      </View>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{label}</Text>
    </View>
  );
}

function CaseSeal({ accent, playerCount, stageCount }: { accent: string; playerCount: number; stageCount: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.sealGraphic}>
      <Svg height="118" viewBox="0 0 260 118" width="260">
        <Circle cx="130" cy="59" fill="none" r="43" stroke={accent} strokeDasharray="3 5" strokeOpacity="0.6" />
        <Circle cx="130" cy="59" fill="none" r="28" stroke={accent} strokeWidth="2" />
        <Path d="M130 14 L138 27 L122 27 Z" fill={accent} />
        <Line stroke={accent} strokeOpacity="0.36" x1="0" x2="102" y1="59" y2="59" />
        <Line stroke={accent} strokeOpacity="0.36" x1="158" x2="260" y1="59" y2="59" />
        {Array.from({ length: playerCount }, (_, index) => {
          const angle = (index / playerCount) * Math.PI * 2 - Math.PI / 2;
          return <Circle cx={130 + Math.cos(angle) * 28} cy={59 + Math.sin(angle) * 28} fill={accent} key={index} r="3.5" />;
        })}
      </Svg>
      <Text style={[styles.sealCount, { color: accent }]}>{stageCount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 9 },
  content: { gap: 18, paddingBottom: 48 },
  cover: { borderBottomWidth: 3, borderTopWidth: 1, minHeight: 460, overflow: 'hidden', padding: 18 },
  coverArt: { ...StyleSheet.absoluteFillObject, opacity: 0.52 },
  coverArtVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,7,5,0.58)' },
  coverHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  footnote: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', paddingHorizontal: 12 },
  footnoteText: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  metadata: { bottom: 17, flexDirection: 'row', left: 17, position: 'absolute', right: 17 },
  metric: { borderLeftColor: 'rgba(255,255,255,0.25)', borderLeftWidth: 1, flex: 1, paddingLeft: 10 },
  metricLabel: { fontSize: 7, letterSpacing: 1.1 },
  metricValue: { fontSize: 25, lineHeight: 26 },
  objective: { fontSize: 14, lineHeight: 20 },
  playableDot: { borderRadius: 4, height: 6, width: 6 },
  playableStamp: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 7, paddingVertical: 5 },
  playableText: { fontSize: 7, letterSpacing: 1.2 },
  premise: { borderBottomWidth: 1, borderTopWidth: 1, gap: 7, paddingVertical: 15 },
  premiseLabel: { fontSize: 8, letterSpacing: 1.4 },
  premiseText: { fontSize: 24, lineHeight: 28 },
  sealCount: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 23, position: 'absolute' },
  sealGraphic: { alignItems: 'center', bottom: 70, height: 118, justifyContent: 'center', left: 0, opacity: 0.88, position: 'absolute', right: 0 },
  serial: { fontSize: 8, letterSpacing: 1.3 },
  stageIndex: { fontSize: 22, lineHeight: 23, width: 30 },
  stageMechanic: { fontSize: 7, letterSpacing: 0.9 },
  stageName: { flex: 1, fontSize: 18, lineHeight: 20, textTransform: 'uppercase' },
  stageStrip: { gap: 0 },
  stageTick: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 8, minHeight: 49 },
  tagline: { fontSize: 18, lineHeight: 23, maxWidth: 310 },
  theme: { fontSize: 8, letterSpacing: 1.5 },
  title: { fontSize: 63, letterSpacing: 0.2, lineHeight: 57, textTransform: 'uppercase' },
  titleBlock: { gap: 5, marginTop: 53 },
});

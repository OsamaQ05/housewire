import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type {
  ForgeDifficulty,
  ForgeDuration,
  ForgeIntensity,
  ForgeThemeId,
  ForgeTone,
} from '@/src/domain/case-forge/types';
import { useHousewireTheme } from '@/src/theme';

import { ForgeOption, ForgeToggle, forgeColors } from './ForgePrimitives';

export interface ForgeDraft {
  camera: boolean;
  customThemePrompt: string;
  difficulty: ForgeDifficulty;
  duration: ForgeDuration;
  intensity: ForgeIntensity;
  playerCount: 2 | 3 | 4;
  themeId?: ForgeThemeId;
  tone: ForgeTone;
  voice: boolean;
}

export function CrewPlate({ draft, onChange }: { draft: ForgeDraft; onChange: (draft: ForgeDraft) => void }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.panel}>
      <Header eyebrow="Step 1 of 3" title="Who is playing?" />
      <Text style={[styles.lede, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Every person gets a different piece, so the case only works when you talk.</Text>
      <View accessibilityRole="radiogroup" style={styles.countRail}>
        {([2, 3, 4] as const).map((count) => (
          <Pressable
            accessibilityLabel={`${count} players`}
            accessibilityRole="radio"
            accessibilityState={{ checked: draft.playerCount === count }}
            key={count}
            onPress={() => onChange({ ...draft, playerCount: count })}
            style={({ pressed }) => [styles.count, { backgroundColor: draft.playerCount === count ? forgeColors.ink : 'transparent', borderColor: draft.playerCount === count ? forgeColors.ink : theme.colors.draft }, pressed && styles.pressed]}
          >
            <Text style={[styles.countValue, { color: draft.playerCount === count ? forgeColors.dark : theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{count}</Text>
            <Text style={[styles.countLabel, { color: draft.playerCount === count ? '#4B4214' : theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>people</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.microLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>How long?</Text>
      <View accessibilityRole="radiogroup" style={styles.optionStack}>
        {([20, 30, 45] as const).map((duration) => (
          <ForgeOption
            detail={duration === 20 ? 'Quick five-scene case' : duration === 30 ? 'A full game night' : 'Longer and more demanding'}
            key={duration}
            label={`${duration} minutes`}
            onPress={() => onChange({ ...draft, duration })}
            selected={draft.duration === duration}
            value={duration === 30 ? 'Recommended' : undefined}
          />
        ))}
      </View>
    </View>
  );
}

export function ThemePlate({ draft, onChange }: { draft: ForgeDraft; onChange: (draft: ForgeDraft) => void }) {
  const { theme } = useHousewireTheme();
  const themes: readonly { id?: ForgeThemeId; label: string; detail: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { label: 'Surprise us', detail: 'Let the case choose its own world', icon: 'dice-outline' },
    { id: 'abyssal-relay', label: 'Below the surface', detail: 'Pressure · sonar · lost station', icon: 'water-outline' },
    { id: 'clockwork-manor', label: 'Between seconds', detail: 'Brass · inheritance · stopped clocks', icon: 'time-outline' },
    { id: 'museum-afterlight', label: 'After the flash', detail: 'Camera · vanished art · negative space', icon: 'aperture-outline' },
    { id: 'stormbound-express', label: 'Beyond mile zero', detail: 'Whiteout · signals · night train', icon: 'train-outline' },
  ];
  return (
    <View style={styles.panel}>
      <Header eyebrow="Step 2 of 3" title="Choose the world" />
      <View accessibilityRole="radiogroup" style={styles.optionStack}>
        {themes.map((item) => (
          <ForgeOption
            detail={item.detail}
            icon={item.icon}
            key={item.id ?? 'surprise'}
            label={item.label}
            onPress={() => onChange({ ...draft, themeId: item.id })}
            selected={draft.themeId === item.id}
          />
        ))}
      </View>

      <View style={[styles.seedBrief, { borderColor: theme.colors.draft }]}>
        <Text style={[styles.microLabel, { color: forgeColors.ink, fontFamily: theme.typography.families.bodyMedium }]}>Add a detail (optional)</Text>
        <TextInput
          accessibilityHint="Adds a place, era, or situation to the generated case"
          autoCapitalize="sentences"
          maxLength={180}
          multiline
          onChangeText={(customThemePrompt) => onChange({ ...draft, customThemePrompt })}
          placeholder="A storm cuts power to an old desert hotel…"
          placeholderTextColor={theme.colors.faint}
          style={[styles.seedInput, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}
          value={draft.customThemePrompt}
        />
        <Text style={[styles.seedCount, { color: theme.colors.faint, fontFamily: theme.typography.families.mono }]}>{draft.customThemePrompt.length}/180</Text>
        <Text style={[styles.seedPrivacy, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Used only to shape the story. Player names and puzzle answers are never sent.</Text>
      </View>

      <Text style={[styles.microLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>Mood</Text>
      <View accessibilityRole="radiogroup" style={styles.threeRail}>
        {(['mystery', 'eerie', 'adventure'] as const).map((tone) => (
          <CompactRadio key={tone} label={tone} onPress={() => onChange({ ...draft, tone })} selected={draft.tone === tone} />
        ))}
      </View>
    </View>
  );
}

export function MechanismPlate({ draft, onChange }: { draft: ForgeDraft; onChange: (draft: ForgeDraft) => void }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.panel}>
      <Header eyebrow="Step 3 of 3" title="Tune the puzzles" />
      <Text style={[styles.microLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>Puzzle difficulty</Text>
      <View accessibilityRole="radiogroup" style={styles.difficultyRail}>
        {([1, 2, 3, 4, 5] as const).map((difficulty) => (
          <Pressable
            accessibilityLabel={`Difficulty ${difficulty} of 5`}
            accessibilityRole="radio"
            accessibilityState={{ checked: draft.difficulty === difficulty }}
            key={difficulty}
            onPress={() => onChange({ ...draft, difficulty })}
            style={({ pressed }) => [styles.difficultyNotch, { backgroundColor: difficulty <= draft.difficulty ? forgeColors.ink : 'transparent', borderColor: difficulty <= draft.difficulty ? forgeColors.ink : theme.colors.draft, height: 32 + difficulty * 6 }, pressed && styles.pressed]}
          >
            <Text style={[styles.difficultyText, { color: difficulty <= draft.difficulty ? forgeColors.dark : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{difficulty}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.difficultyCaption, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{draft.difficulty <= 2 ? 'Gentle clues with more signposts.' : draft.difficulty <= 4 ? 'Needs careful teamwork.' : 'Fewer hints and tighter timing.'}</Text>

      <Text style={[styles.microLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }]}>Pace</Text>
      <View accessibilityRole="radiogroup" style={styles.threeRail}>
        {(['gentle', 'balanced', 'intense'] as const).map((intensity) => (
          <CompactRadio key={intensity} label={intensity} onPress={() => onChange({ ...draft, intensity })} selected={draft.intensity === intensity} />
        ))}
      </View>

      <View style={styles.toggleList}>
        <ForgeToggle detail="Scan hidden markers and visual clues" icon="camera-outline" label="Camera clues" onPress={() => onChange({ ...draft, camera: !draft.camera })} value={draft.camera} />
        <ForgeToggle detail="Sound, spoken clues and private audio" icon="mic-outline" label="Voice puzzles" onPress={() => onChange({ ...draft, voice: !draft.voice })} value={draft.voice} />
      </View>
      <View style={[styles.safety, { borderColor: theme.colors.ready }]}>
        <Ionicons color={theme.colors.ready} name="shield-checkmark-outline" size={18} />
        <Text style={[styles.safetyText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Camera and voice challenges always include a touch fallback.</Text>
      </View>
    </View>
  );
}

function Header({ eyebrow, title }: { eyebrow: string; title: string }) {
  const { theme } = useHousewireTheme();
  return (
    <View style={styles.header}>
      <Text style={[styles.eyebrow, { color: forgeColors.ink, fontFamily: theme.typography.families.bodyMedium }]}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{title}</Text>
    </View>
  );
}

function CompactRadio({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.compactRadio, { backgroundColor: selected ? forgeColors.ink : 'transparent', borderColor: selected ? forgeColors.ink : theme.colors.draft }, pressed && styles.pressed]}
    >
      <Text numberOfLines={1} style={[styles.compactRadioText, { color: selected ? forgeColors.dark : theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compactRadio: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 6 },
  compactRadioText: { fontSize: 12 },
  count: { alignItems: 'center', borderRadius: 15, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 78 },
  countLabel: { fontSize: 11, lineHeight: 14 },
  countRail: { flexDirection: 'row', gap: 8 },
  countValue: { fontSize: 38, lineHeight: 38 },
  difficultyCaption: { fontSize: 12, lineHeight: 17 },
  difficultyNotch: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: 'center' },
  difficultyRail: { alignItems: 'flex-end', flexDirection: 'row', gap: 6, height: 65 },
  difficultyText: { fontSize: 9 },
  eyebrow: { fontSize: 13, lineHeight: 18 },
  header: { gap: 2 },
  lede: { fontSize: 14, lineHeight: 20 },
  microLabel: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  optionStack: { gap: 7 },
  panel: { gap: 15 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  safety: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 9, padding: 12 },
  safetyText: { flex: 1, fontSize: 11, lineHeight: 16 },
  seedBrief: { borderRadius: 16, borderWidth: 1, gap: 5, padding: 12 },
  seedCount: { fontSize: 7, textAlign: 'right' },
  seedInput: { fontSize: 20, lineHeight: 25, maxHeight: 88, minHeight: 56, padding: 0, textAlignVertical: 'top' },
  seedPrivacy: { fontSize: 10, lineHeight: 14 },
  threeRail: { flexDirection: 'row', gap: 7 },
  title: { fontSize: 43, lineHeight: 45 },
  toggleList: { gap: 8 },
});

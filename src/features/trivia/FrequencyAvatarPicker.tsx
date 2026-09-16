import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFrequencyAvatarStore } from '@/src/store/use-frequency-avatar-store';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { typography } from '@/src/theme';

import { FrequencyAvatar } from './FrequencyAvatar';
import { FREQUENCY_COLORS as C } from './FrequencyIdentity';
import { FREQUENCY_AVATARS, getFrequencyAvatar } from './frequency-avatar-model';

export function FrequencyAvatarPicker({ name, onClose }: { name?: string; onClose(): void }) {
  const choices = useFrequencyAvatarStore((state) => state.choices);
  const setAvatar = useFrequencyAvatarStore((state) => state.setAvatar);
  const storageError = useFrequencyAvatarStore((state) => state.storageError);
  const retrySave = useFrequencyAvatarStore((state) => state.retrySave);
  const haptics = useHousewireStore((state) => state.settings.haptics);
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const [lastName, setLastName] = useState(name ?? '');
  useEffect(() => { if (name !== undefined) setLastName(name); }, [name]);
  const displayName = name ?? lastName;
  const selected = getFrequencyAvatar(displayName, choices);
  return (
    <Modal animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose} transparent visible={name !== undefined}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close character picker" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.heading}>
            <View style={styles.copy}><Text style={styles.title}>Pick your little sidekick</Text><Text style={styles.subtitle}>A face for {displayName}. Change it whenever.</Text></View>
            <Pressable accessibilityLabel="Close character picker" accessibilityRole="button" onPress={onClose} style={styles.close}><Ionicons name="close" size={24} color={C.ink} /></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
            {FREQUENCY_AVATARS.map((avatar) => (
              <Pressable
                accessibilityLabel={`Choose ${avatar.label} avatar`}
                accessibilityRole="button"
                accessibilityState={{ selected: avatar.id === selected }}
                key={avatar.id}
                onPress={() => {
                  if (!name) return;
                  setAvatar(name, avatar.id);
                  if (haptics) void Haptics.selectionAsync().catch(() => undefined);
                  onClose();
                }}
                style={({ pressed }) => [styles.choice, avatar.id === selected && styles.selected, pressed && styles.pressed]}
              >
                <FrequencyAvatar name={displayName} avatarId={avatar.id} size={76} mood={avatar.id === selected ? 'happy' : 'idle'} />
                <Text style={styles.label}>{avatar.label}</Text>
                {avatar.id === selected ? <View style={styles.check}><Ionicons color={C.ink} name="checkmark" size={16} /></View> : null}
              </Pressable>
            ))}
          </ScrollView>
          {storageError ? <Pressable accessibilityRole="button" onPress={retrySave} style={styles.retry}><Text style={styles.footer}>Couldn’t save your character. Tap to retry.</Text></Pressable> : <Text style={styles.footer}>Saved on this phone. No photo or account needed.</Text>}
        </View>
      </View>
    </Modal>
  );
}

const fonts = typography.families;
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: '#111C31AA', paddingTop: 50 },
  sheet: { width: '100%', maxWidth: 500, maxHeight: '90%', backgroundColor: C.paper, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 22, paddingBottom: 32, gap: 18 },
  heading: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  copy: { flex: 1, gap: 6 },
  title: { fontFamily: fonts.displayHeavy, fontSize: 30, lineHeight: 33, color: C.ink },
  subtitle: { fontFamily: fonts.body, color: C.muted, fontSize: 13, lineHeight: 19 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingBottom: 2 },
  choice: { width: '30%', minWidth: 80, alignItems: 'center', borderRadius: 20, borderWidth: 2, borderColor: C.line, paddingVertical: 10, backgroundColor: C.white, gap: 6 },
  selected: { borderColor: C.ink, backgroundColor: '#F9DD81' },
  label: { fontFamily: fonts.bodyMedium, color: C.ink, fontSize: 13 },
  check: { position: 'absolute', top: 4, right: 4, backgroundColor: C.teal, borderRadius: 10, padding: 3 },
  footer: { fontFamily: fonts.body, color: C.muted, fontSize: 11, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center' },
  pressed: { transform: [{ scale: 0.96 }] },
});

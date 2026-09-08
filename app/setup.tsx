import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '@/src/components/ScreenShell';
import { missions } from '@/src/data/campaigns';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import {
  useHousewireStore,
  type HouseRoom,
  type SessionMode,
} from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

const CASE_ROOM_COPY = {
  'line-13': 'No stairs or obstacles. Keep at least two clear stations.',
  'dead-air': 'No stairs or obstacles. Keep at least two quiet stations.',
  'night-glass': 'No stairs or obstacles. Keep at least two well-lit stations.',
  'long-table': 'Clear one shared table or floor area, plus a safe path to household objects.',
} as const;

export default function SetupScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const selectedMission = useHousewireStore((state) => state.selectedMission);
  const rooms = useHousewireStore((state) => state.rooms);
  const sessionMode = useHousewireStore((state) => state.sessionMode);
  const toggleRoomSafety = useHousewireStore((state) => state.toggleRoomSafety);
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const { play } = useHousewireSound();
  const mission = missions.find((item) => item.id === selectedMission) ?? missions[0];
  const safeRooms = rooms.filter((room) => room.safe);

  const chooseMode = (mode: SessionMode) => {
    if (mode === sessionMode) return;
    play('switch', 0.38);
    prepareSession(mode);
  };

  const toggleRoom = (room: HouseRoom) => {
    if (room.safe && safeRooms.length <= 2) return;
    play('switch', 0.28);
    toggleRoomSafety(room.id);
  };

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topline}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              { borderColor: theme.colors.draft },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color={theme.colors.text} name="arrow-back" size={22} />
          </Pressable>
          <View style={styles.missionMeta}>
            <Text
              style={[
                styles.missionName,
                { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy },
              ]}
            >
              {mission.title}
            </Text>
            <Text
              style={[
                styles.missionTime,
                { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium },
              ]}
            >
              {mission.duration.toLowerCase()}
            </Text>
          </View>
        </View>

        <View style={styles.heading}>
          <Text
            accessibilityRole="header"
            style={[
              styles.title,
              { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy },
            ]}
          >
            Where can everyone play safely?
          </Text>
          <Text
            style={[
              styles.caption,
              { color: theme.colors.muted, fontFamily: theme.typography.families.body },
            ]}
          >
            Choose one clear, well-lit space per phone. {CASE_ROOM_COPY[selectedMission]}
          </Text>
        </View>

        <View style={styles.roomGrid}>
          {rooms.map((room) => {
            const locked = room.safe && safeRooms.length <= 2;
            return (
              <Pressable
                accessibilityHint={
                  locked
                    ? 'At least two rooms must stay selected'
                    : room.safe
                      ? `Removes ${room.label}`
                      : `Adds ${room.label}`
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: room.safe, disabled: locked }}
                disabled={locked}
                key={room.id}
                onPress={() => toggleRoom(room)}
                style={({ pressed }) => [
                  styles.room,
                  {
                    backgroundColor: room.safe ? theme.colors.surfaceRaised : 'transparent',
                    borderColor: room.safe ? theme.colors.wire : theme.colors.draft,
                  },
                  locked && styles.locked,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.roomTopline}>
                  <Ionicons
                    color={room.safe ? theme.colors.wire : theme.colors.muted}
                    name="location-outline"
                    size={22}
                  />
                  <Ionicons
                    color={room.safe ? theme.colors.ready : theme.colors.faint}
                    name={room.safe ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                  />
                </View>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.roomName,
                    { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium },
                  ]}
                >
                  {room.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.count,
            {
              color: safeRooms.length >= 2 ? theme.colors.ready : theme.colors.fault,
              fontFamily: theme.typography.families.bodyMedium,
            },
          ]}
        >
          {safeRooms.length} safe spaces ready · one phone goes in each
        </Text>

        <View style={styles.modeSection}>
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium },
            ]}
          >
            How are you playing?
          </Text>
          <View style={styles.modeRow}>
            <ModeChoice
              active={sessionMode === 'lan'}
              icon="people-outline"
              label="Family game"
              meta={selectedMission === 'dead-air' || selectedMission === 'long-table' ? '3 phones best' : '2–4 phones'}
              onPress={() => chooseMode('lan')}
            />
            <ModeChoice
              active={sessionMode === 'preview'}
              icon="phone-portrait-outline"
              label="Practice first"
              meta="1 phone"
              onPress={() => chooseMode('preview')}
            />
          </View>
        </View>

        <PrimaryAction
          disabled={safeRooms.length < 2}
          label={sessionMode === 'lan' ? 'Next: connect the phones' : 'Start one-phone practice'}
          onPress={() => {
            play('relay', 0.55);
            router.push('/lobby');
          }}
        />
      </ScrollView>
    </ScreenShell>
  );
}

function ModeChoice({
  active,
  disabled = false,
  icon,
  label,
  meta,
  onPress,
}: {
  active: boolean;
  disabled?: boolean;
  icon: 'people-outline' | 'phone-portrait-outline';
  label: string;
  meta: string;
  onPress: () => void;
}) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.mode,
        {
          backgroundColor: active ? theme.colors.surfaceRaised : 'transparent',
          borderColor: active ? theme.colors.wire : theme.colors.draft,
        },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.modeTopline}>
        <Ionicons color={active ? theme.colors.wire : theme.colors.muted} name={icon} size={24} />
        <Ionicons
          color={active ? theme.colors.ready : theme.colors.faint}
          name={active ? 'radio-button-on' : 'radio-button-off'}
          size={20}
        />
      </View>
      <Text
        style={[
          styles.modeLabel,
          { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.modeMeta,
          { color: theme.colors.muted, fontFamily: theme.typography.families.body },
        ]}
      >
        {meta}
      </Text>
    </Pressable>
  );
}

function PrimaryAction({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: theme.colors.wire, borderColor: theme.colors.wire },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.actionText,
          { color: theme.colors.textInverse, fontFamily: theme.typography.families.bodyMedium },
        ]}
      >
        {label}
      </Text>
      <Ionicons color={theme.colors.textInverse} name="arrow-forward" size={21} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 62,
    paddingHorizontal: 18,
  },
  actionText: {
    fontSize: 18,
    lineHeight: 23,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  caption: {
    fontSize: 17,
    lineHeight: 24,
  },
  content: {
    flexGrow: 1,
    gap: 22,
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  count: {
    fontSize: 14,
    lineHeight: 20,
  },
  disabled: {
    opacity: 0.42,
  },
  heading: {
    gap: 5,
  },
  locked: {
    opacity: 0.82,
  },
  missionMeta: {
    alignItems: 'flex-end',
  },
  missionName: {
    fontSize: 27,
    lineHeight: 29,
  },
  missionTime: {
    fontSize: 10,
    lineHeight: 15,
  },
  mode: {
    borderRadius: 4,
    borderWidth: 1,
    flex: 1,
    minHeight: 126,
    padding: 14,
  },
  modeLabel: {
    fontSize: 17,
    lineHeight: 22,
    marginTop: 18,
  },
  modeMeta: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeSection: {
    gap: 11,
  },
  modeTopline: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.7,
  },
  room: {
    borderRadius: 4,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    gap: 18,
    minHeight: 126,
    padding: 14,
  },
  roomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  roomName: {
    fontSize: 17,
    lineHeight: 22,
  },
  roomTopline: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  title: {
    fontSize: 48,
    letterSpacing: 0.2,
    lineHeight: 47,
  },
  topline: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

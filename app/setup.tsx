import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '@/src/components/ScreenShell';
import { missions } from '@/src/data/campaigns';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import {
  useHousewireStore,
  type HouseRoom,
} from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';
import { HostPlayerPicker } from '@/src/features/family-club/PlayerPicker';

const CASE_ROOM_COPY = {
  'line-13': 'No stairs or obstacles. Keep at least two clear stations.',
  'dead-air': 'No stairs or obstacles. Keep at least two quiet stations.',
  'night-glass': 'No stairs or obstacles. Keep at least two well-lit stations.',
  'long-table': 'Choose comfortable places to sit. You can play around one table or talk between rooms.',
} as const;

export default function SetupScreen() {
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const selectedMission = useHousewireStore((state) => state.selectedMission);
  const rooms = useHousewireStore((state) => state.rooms);
  const sessionMode = useHousewireStore((state) => state.sessionMode);
  const toggleRoomSafety = useHousewireStore((state) => state.toggleRoomSafety);
  const { play } = useHousewireSound();
  const mission = missions.find((item) => item.id === selectedMission) ?? missions[0];
  const safeRooms = rooms.filter((room) => room.safe);

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
            Pick the rooms you can use.
          </Text>
          <Text
            style={[
              styles.caption,
              { color: theme.colors.muted, fontFamily: theme.typography.families.body },
            ]}
          >
            We already selected the safest options. Tap only if you need to change them. {CASE_ROOM_COPY[selectedMission]}
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
          {safeRooms.length} rooms ready
        </Text>

        <View style={[styles.playMode, { backgroundColor: theme.colors.surfaceRaised }]}>
          <View style={[styles.playModeIcon, { backgroundColor: sessionMode === 'lan' ? theme.colors.wire : theme.colors.warning }]}>
            <Ionicons color={theme.colors.textInverse} name={sessionMode === 'lan' ? 'people' : 'phone-portrait'} size={22} />
          </View>
          <View style={styles.playModeCopy}>
            <Text style={[styles.playModeTitle, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{sessionMode === 'lan' ? 'Playing together on nearby phones' : 'Trying every role on this phone'}</Text>
            <Text style={[styles.playModeMeta, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{sessionMode === 'lan' ? 'The next screen shows one QR for everyone.' : 'Switch between You and Partner to explore both sets of clues.'}</Text>
          </View>
        </View>

        {sessionMode === 'lan' ? <HostPlayerPicker /> : null}
        <PrimaryAction
          disabled={safeRooms.length < 2}
          label={sessionMode === 'lan' ? 'Show the join QR' : 'Start the case'}
          onPress={() => {
            play('relay', 0.55);
            router.push('/lobby');
          }}
        />
      </ScrollView>
    </ScreenShell>
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
    borderRadius: 16,
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
    borderRadius: 14,
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
  playMode: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 12, padding: 13 },
  playModeCopy: { flex: 1, gap: 2 },
  playModeIcon: { alignItems: 'center', borderRadius: 12, height: 46, justifyContent: 'center', width: 46 },
  playModeMeta: { fontSize: 12, lineHeight: 17 },
  playModeTitle: { fontSize: 15, lineHeight: 20 },
  pressed: {
    opacity: 0.7,
  },
  room: {
    borderRadius: 16,
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

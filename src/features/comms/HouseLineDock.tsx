import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHousewireTheme } from '@/src/theme';

import { HOUSE_LINE_MAX_CLIP_DURATION_MS, houseLineSignalLabel } from './house-line-protocol';
import type { HouseLineController, HouseLineDeliveryState } from './use-house-line';

export type HouseLineGuideState = 'clear' | 'watching' | 'ready';

export interface HouseLineDockProps {
  accent: string;
  controller: HouseLineController;
  expanded: boolean;
  guideState?: HouseLineGuideState;
  guideMode?: 'adaptive' | 'chat';
  onExpandedChange(expanded: boolean): void;
  onGuidePress?(): void;
}

export function HouseLineDock({
  accent,
  controller,
  expanded,
  guideState = 'clear',
  guideMode = 'adaptive',
  onExpandedChange,
  onGuidePress,
}: HouseLineDockProps) {
  const { theme } = useHousewireTheme();
  const insets = useSafeAreaInsets();
  const unreadCount = controller.incoming.filter((item) => !item.played).length;
  const close = () => {
    void controller.cancelTalking();
    onExpandedChange(false);
  };

  return (
    <>
      <View style={[styles.dockFrame, { bottom: Math.max(10, insets.bottom + 6), pointerEvents: 'box-none' }]}>
        <View style={[styles.dock, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.draft }]}>
          {onGuidePress ? (
            <Pressable
              accessibilityHint={guideMode === 'chat' ? 'Ask a question about this puzzle without receiving its solution' : 'Opens adaptive help for the current puzzle'}
              accessibilityLabel={guideMode === 'chat' ? 'Ask the puzzle guide' : `On-device AI Guide: ${guideState}`}
              accessibilityRole="button"
              onPress={onGuidePress}
              style={({ pressed }) => [styles.guideButton, pressed && styles.pressed]}
            >
              {guideMode === 'chat' ? <Ionicons name="help-buoy-outline" size={25} color={accent} /> : <View style={styles.guideMeter}>
                {[0, 1, 2].map((notch) => {
                  const active = guideState === 'ready' || (guideState === 'watching' && notch < 2) || notch === 0;
                  return <View key={notch} style={[styles.guideNotch, { backgroundColor: active ? accent : theme.colors.draft, height: 8 + notch * 6 }]} />;
                })}
              </View>}
              <View>
                <Text style={[styles.dockLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>AI GUIDE</Text>
                <Text style={[styles.dockValue, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{guideMode === 'chat' ? 'Ask a question' : guideState === 'ready' ? 'Nudge ready' : guideState === 'watching' ? 'Watching pace' : 'Clear'}</Text>
              </View>
            </Pressable>
          ) : <View />}

          <Pressable
            accessibilityHint="Opens voice notes and quick signals for the other rooms"
            accessibilityLabel={`Open House Line${unreadCount ? `, ${unreadCount} waiting` : ''}`}
            accessibilityRole="button"
            onPress={() => onExpandedChange(true)}
            style={({ pressed }) => [styles.lineButton, { backgroundColor: accent }, pressed && styles.pressed]}
          >
            <Ionicons color="#090B09" name="radio" size={21} />
            <Text style={[styles.lineButtonText, { fontFamily: theme.typography.families.displayHeavy }]}>LINE</Text>
            {unreadCount ? (
              <View style={[styles.badge, { backgroundColor: theme.colors.fault }]}>
                <Text style={[styles.badgeText, { color: theme.colors.text, fontFamily: theme.typography.families.monoMedium }]}>{unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={close}
        statusBarTranslucent
        transparent
        visible={expanded}
      >
        <View accessibilityViewIsModal style={styles.backdrop}>
          <Pressable accessibilityLabel="Close House Line" onPress={close} style={StyleSheet.absoluteFill} />
          <View style={[styles.sheet, { backgroundColor: theme.colors.background, borderColor: accent, paddingBottom: Math.max(18, insets.bottom + 10) }]}>
            <View style={[styles.liveWire, { backgroundColor: accent }]} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIdentity}>
                <View style={[styles.statusLamp, { backgroundColor: controller.connected ? theme.colors.ready : theme.colors.fault }]} />
                <View>
                  <Text style={[styles.sheetLabel, { color: accent, fontFamily: theme.typography.families.monoMedium }]}>ROOM-TO-ROOM INTERCOM</Text>
                  <Text style={[styles.sheetTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>HOUSE LINE</Text>
                </View>
              </View>
              <Pressable accessibilityLabel="Close House Line" accessibilityRole="button" hitSlop={10} onPress={close}>
                <Ionicons color={theme.colors.muted} name="close" size={24} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>SEND TO</Text>
                <ScrollView contentContainerStyle={styles.targetRail} horizontal showsHorizontalScrollIndicator={false}>
                  <TargetChip
                    accent={accent}
                    active={controller.targetId === 'ALL'}
                    disabled={controller.recording || controller.preparing || controller.sending}
                    label="Everyone"
                    meta={`${controller.peers.length} lines`}
                    onPress={() => controller.setTargetId('ALL')}
                  />
                  {controller.peers.map((peer) => (
                    <TargetChip
                      accent={accent}
                      active={controller.targetId === peer.id}
                      disabled={controller.recording || controller.preparing || controller.sending}
                      key={peer.id}
                      label={peer.label}
                      meta={peer.roomLabel ?? 'Other room'}
                      onPress={() => controller.setTargetId(peer.id)}
                    />
                  ))}
                </ScrollView>
              </View>

              <View style={[styles.transmitter, { backgroundColor: theme.colors.surface, borderColor: controller.recording ? accent : theme.colors.draft }]}>
                <View style={styles.transmitterReadout}>
                  <View style={styles.waveform}>
                    {[12, 25, 17, 35, 21, 29, 14].map((height, index) => (
                      <View key={index} style={[styles.waveBar, { backgroundColor: controller.recording ? accent : theme.colors.draft, height }]} />
                    ))}
                  </View>
                  <Text style={[styles.timer, { color: controller.recording ? accent : theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{controller.recording ? `${Math.min(30, controller.recordingDurationMs / 1_000).toFixed(1)} / 30s` : controller.preparing ? 'ONE MOMENT…' : deliveryLabel(controller.delivery)}</Text>
                </View>
                {controller.recording ? (
                  <View accessibilityLabel="Recording progress" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 30, now: Math.min(30, Math.round(controller.recordingDurationMs / 1000)) }} style={[styles.progressTrack, { backgroundColor: theme.colors.draft }]}>
                    <View style={{ backgroundColor: accent, height: 4, width: `${Math.min(100, controller.recordingDurationMs / HOUSE_LINE_MAX_CLIP_DURATION_MS * 100)}%` }} />
                  </View>
                ) : null}
                <Pressable
                  accessibilityHint={controller.recording ? 'Ends recording and sends only to the selected phones' : 'Tap once to record. Tap again to stop and send. Automatically sends at 30 seconds.'}
                  accessibilityLabel={controller.recording ? 'Stop and send voice note' : 'Record voice note'}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !controller.canTalk && !controller.recording }}
                  disabled={!controller.canTalk && !controller.recording}
                  onPress={() => void (controller.recording ? controller.endTalking() : controller.beginTalking())}
                  style={({ pressed }) => [
                    styles.talkButton,
                    { backgroundColor: controller.recording ? accent : theme.colors.surfaceRaised, borderColor: accent },
                    (!controller.canTalk && !controller.recording) && styles.disabled,
                    pressed && styles.talkPressed,
                  ]}
                >
                  <Ionicons color={controller.recording ? '#090B09' : accent} name={controller.recording ? 'stop-circle' : 'mic'} size={30} />
                  <Text style={[styles.talkText, { color: controller.recording ? '#090B09' : theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{controller.recording ? 'STOP & SEND' : controller.sending ? 'SENDING…' : controller.preparing ? 'ONE MOMENT…' : 'RECORD A NOTE'}</Text>
                </Pressable>
                {controller.recording ? (
                  <Pressable accessibilityRole="button" onPress={() => void controller.cancelTalking()} style={styles.cancelButton}>
                    <Text style={{ color: theme.colors.muted, fontFamily: theme.typography.families.bodyMedium }}>Cancel recording</Text>
                  </Pressable>
                ) : null}
                <Text style={[styles.privacy, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>{controller.recording ? 'Speak freely. Sends automatically at 30 seconds.' : 'Tap to record · up to 30 seconds · selected phones only. Notes disappear after playback or 90 seconds.'}</Text>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>NO-MIC SIGNAL KEYS</Text>
                <View style={styles.signalGrid}>
                  {controller.signals.map((signal) => (
                    <Pressable
                      accessibilityRole="button"
                      disabled={!controller.canTalk || controller.recording}
                      key={signal}
                      onPress={() => void controller.sendSignal(signal)}
                      style={({ pressed }) => [styles.signalKey, { borderColor: theme.colors.draft }, (!controller.canTalk || controller.recording) && styles.disabled, pressed && styles.pressed]}
                    >
                      <View style={[styles.signalLamp, { backgroundColor: accent }]} />
                      <Text style={[styles.signalText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{houseLineSignalLabel(signal)}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {controller.incoming.length ? (
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: theme.colors.faint, fontFamily: theme.typography.families.monoMedium }]}>INCOMING</Text>
                  {[...controller.incoming].reverse().map((item) => (
                    <View key={item.frameMessageId} style={[styles.incoming, { backgroundColor: theme.colors.surface, borderColor: item.played ? theme.colors.draft : accent }]}>
                      <View style={[styles.incomingGlyph, { borderColor: accent }]}>
                        <Ionicons color={accent} name={item.message.kind === 'housewire.line.clip.v1' ? 'volume-high' : 'flash'} size={19} />
                      </View>
                      <View style={styles.incomingCopy}>
                        <Text style={[styles.incomingSender, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{item.senderLabel}</Text>
                        <Text style={[styles.incomingDetail, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{item.message.kind === 'housewire.line.clip.v1' ? `${(item.message.clip.durationMs / 1_000).toFixed(1)} second note` : houseLineSignalLabel(item.message.signal)}</Text>
                      </View>
                      {item.message.kind === 'housewire.line.clip.v1' ? (
                        <Pressable accessibilityLabel={`Play message from ${item.senderLabel}`} accessibilityRole="button" onPress={() => void controller.playIncoming(item.frameMessageId)} style={[styles.playButton, { backgroundColor: accent }]}>
                          <Ionicons color="#090B09" name={item.played ? 'refresh' : 'play'} size={18} />
                        </Pressable>
                      ) : null}
                      <Pressable accessibilityLabel={`Dismiss message from ${item.senderLabel}`} accessibilityRole="button" hitSlop={8} onPress={() => controller.dismissIncoming(item.frameMessageId)}>
                        <Ionicons color={theme.colors.faint} name="close" size={19} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              {controller.error ? (
                <View style={[styles.errorBand, { borderColor: theme.colors.fault }]}>
                  <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{controller.error}</Text>
                  <Pressable accessibilityLabel="Dismiss communication error" accessibilityRole="button" onPress={controller.clearError}>
                    <Ionicons color={theme.colors.faint} name="close" size={18} />
                  </Pressable>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function TargetChip({ accent, active, disabled, label, meta, onPress }: { accent: string; active: boolean; disabled?: boolean; label: string; meta: string; onPress(): void }) {
  const { theme } = useHousewireTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.targetChip, { backgroundColor: active ? accent : theme.colors.surface, borderColor: active ? accent : theme.colors.draft }, pressed && styles.pressed]}
    >
      <Text numberOfLines={1} style={[styles.targetName, { color: active ? '#090B09' : theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.targetMeta, { color: active ? '#45341F' : theme.colors.faint, fontFamily: theme.typography.families.mono }]}>{meta}</Text>
    </Pressable>
  );
}

function deliveryLabel(delivery: HouseLineDeliveryState): string {
  if (delivery.status === 'sending') return 'SENDING';
  if (delivery.status === 'delivered') return `DELIVERED ${delivery.deliveredCount}/${delivery.targetCount}`;
  if (delivery.status === 'partial') return `DELIVERED ${delivery.deliveredCount}/${delivery.targetCount}`;
  if (delivery.status === 'failed') return 'NOT DELIVERED';
  if (delivery.status === 'played') return `PLAYED BY ${delivery.playedBy.length}`;
  return '30 SEC MAX';
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.76)', flex: 1, justifyContent: 'flex-end' },
  badge: { alignItems: 'center', borderRadius: 10, height: 19, justifyContent: 'center', position: 'absolute', right: -7, top: -7, width: 19 },
  badgeText: { fontSize: 8 },
  cancelButton: { alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  disabled: { opacity: 0.38 },
  dock: { alignItems: 'center', borderRadius: 4, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, padding: 7 },
  dockFrame: { left: 14, position: 'absolute', right: 14, zIndex: 30 },
  dockLabel: { fontSize: 7, letterSpacing: 1.1 },
  dockValue: { fontSize: 12, lineHeight: 15 },
  errorBand: { alignItems: 'center', borderLeftWidth: 3, flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingLeft: 11, paddingVertical: 7 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17 },
  guideButton: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 44, paddingHorizontal: 8 },
  guideMeter: { alignItems: 'flex-end', flexDirection: 'row', gap: 2, height: 22 },
  guideNotch: { width: 3 },
  incoming: { alignItems: 'center', borderLeftWidth: 3, flexDirection: 'row', gap: 10, minHeight: 66, padding: 10 },
  incomingCopy: { flex: 1, gap: 2 },
  incomingDetail: { fontSize: 11, lineHeight: 15 },
  incomingGlyph: { alignItems: 'center', borderRadius: 22, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  incomingSender: { fontSize: 14, lineHeight: 18 },
  lineButton: { alignItems: 'center', borderRadius: 3, flexDirection: 'row', gap: 7, minHeight: 44, paddingHorizontal: 15 },
  lineButtonText: { color: '#090B09', fontSize: 17, letterSpacing: 0.5 },
  liveWire: { height: 4, left: 0, position: 'absolute', right: 0, top: 0 },
  playButton: { alignItems: 'center', borderRadius: 3, height: 38, justifyContent: 'center', width: 38 },
  pressed: { opacity: 0.7 },
  privacy: { fontSize: 10, lineHeight: 14, textAlign: 'center' },
  progressTrack: { height: 4, overflow: 'hidden', width: '100%' },
  section: { gap: 9 },
  sectionLabel: { fontSize: 8, letterSpacing: 1.45 },
  sheet: { borderTopLeftRadius: 8, borderTopRightRadius: 8, borderTopWidth: 1, maxHeight: '88%', minHeight: '68%', overflow: 'hidden', paddingTop: 4 },
  sheetContent: { gap: 20, paddingBottom: 8, paddingHorizontal: 18, paddingTop: 6 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  sheetIdentity: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  sheetLabel: { fontSize: 7, letterSpacing: 1.5 },
  sheetTitle: { fontSize: 30, letterSpacing: 0.6, lineHeight: 30 },
  signalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  signalKey: { alignItems: 'center', borderRadius: 3, borderWidth: 1, flexBasis: '47%', flexDirection: 'row', flexGrow: 1, gap: 8, minHeight: 45, paddingHorizontal: 11 },
  signalLamp: { borderRadius: 4, height: 7, width: 7 },
  signalText: { fontSize: 13 },
  statusLamp: { borderRadius: 6, height: 10, width: 10 },
  talkButton: { alignItems: 'center', borderRadius: 4, borderWidth: 1, flexDirection: 'row', gap: 11, justifyContent: 'center', minHeight: 68, width: '100%' },
  talkPressed: { transform: [{ scale: 0.985 }] },
  talkText: { fontSize: 20, letterSpacing: 0.7 },
  targetChip: { borderRadius: 3, borderWidth: 1, gap: 2, minWidth: 116, paddingHorizontal: 12, paddingVertical: 10 },
  targetMeta: { fontSize: 7, letterSpacing: 0.7 },
  targetName: { fontSize: 13 },
  targetRail: { gap: 8, paddingRight: 18 },
  timer: { fontSize: 8, letterSpacing: 1.1 },
  transmitter: { alignItems: 'center', borderWidth: 1, gap: 12, padding: 13 },
  transmitterReadout: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  waveBar: { width: 3 },
  waveform: { alignItems: 'center', flexDirection: 'row', gap: 3, height: 38 },
});

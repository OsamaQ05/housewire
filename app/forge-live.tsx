import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ScreenShell } from '@/src/components';
import type { ForgeCase, ForgePlayerCase, ForgeRole } from '@/src/domain/case-forge';
import { caseForgeClient } from '@/src/features/forge/case-forge-client';
import { ForgeButton, ForgeGrid, forgeColors } from '@/src/features/forge/ForgePrimitives';
import { ForgeStageRunner } from '@/src/features/forge/ForgeStageRunner';
import { makeForgeJoinTicket } from '@/src/features/forge/live-protocol';
import { useLiveForgeCoordinator } from '@/src/features/forge/use-live-forge-coordinator';
import { deriveLanRelayUrl } from '@/src/features/session';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';

export default function ForgeLiveScreen() {
  const params = useLocalSearchParams<{ guest?: string | string[]; id?: string | string[] }>();
  const caseId = first(params.id) ?? '';
  const expectsHost = first(params.guest) !== '1';
  const router = useRouter();
  const { theme } = useHousewireTheme();
  const { play } = useHousewireSound();
  const localName = useHousewireStore((state) => state.crew.find((node) => node.id === state.localNodeId)?.name ?? 'Player');
  const storedRelayUrl = useHousewireStore((state) => state.relayUrl);
  const prepareSession = useHousewireStore((state) => state.prepareSession);
  const reducedMotion = useHousewireStore((state) => state.settings.reducedMotion);
  const [game, setGame] = useState<ForgeCase>();
  const [loadError, setLoadError] = useState<string>();
  const [starting, setStarting] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!expectsHost || !caseId) return;
    let cancelled = false;
    void caseForgeClient.get(caseId)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) setLoadError('The host no longer has this generated case.');
        else setGame(loaded);
      })
      .catch((cause) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : 'The generated case could not be opened.');
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, expectsHost]);

  const live = useLiveForgeCoordinator({ caseId, game, localName });
  const state = live.state;
  const projection = live.projection;
  const relayUrl = storedRelayUrl ?? deriveLanRelayUrl();
  const joinUrl = useMemo(() => {
    if (!live.isHost || !state || state.status !== 'waiting' || live.connectionState !== 'connected') return undefined;
    try {
      return makeForgeJoinTicket(live.sessionCode, relayUrl, caseId, Linking.createURL('forge-join'));
    } catch {
      return undefined;
    }
  }, [caseId, live.connectionState, live.isHost, live.sessionCode, relayUrl, state]);

  useEffect(() => {
    if (state?.status !== 'playing') return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [state?.status]);

  const leave = () => {
    prepareSession('preview');
    router.replace(live.isHost ? '/forge-library' : '/home');
  };

  const endForEveryone = async () => {
    await live.abort();
    play('warning', 0.42);
    setLeaveOpen(false);
    setTimeout(leave, 220);
  };

  if (!caseId || loadError) {
    return (
      <ScreenShell edgeWire="none" texture={false}>
        <View style={styles.centerState}>
          <Ionicons color={theme.colors.fault} name="document-outline" size={44} />
          <Text style={[styles.stateTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>LIVE FILE LOST</Text>
          <Text style={[styles.stateBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{loadError ?? 'This live link does not name a generated case.'}</Text>
          <ForgeButton icon="albums-outline" label="Back to the casebook" onPress={() => router.replace('/forge-library')} />
        </View>
      </ScreenShell>
    );
  }

  const loadingHostFile = expectsHost && !game;
  if (loadingHostFile || !state) {
    return (
      <ScreenShell edgeWire="none" padded={false} texture={false}>
        <LiveTopline connection={live.connectionState} onClose={leave} title="OPENING LIVE PRESS" />
        <View style={styles.centerState}>
          <View style={[styles.loadingRotor, { borderColor: forgeColors.ink }]} />
          <Text style={[styles.loadingLabel, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>{loadingHostFile ? 'READING HOST MASTER' : live.connectionState === 'connected' ? 'REQUESTING PRIVATE ROLE' : 'CONNECTING TO LOCAL RELAY'}</Text>
          {live.lastError ? <ConnectionFault message={live.lastError} onRetry={live.reconnect} /> : null}
        </View>
      </ScreenShell>
    );
  }

  if (state.status === 'waiting') {
    const localAssignment = state.assignments.find((assignment) => assignment.nodeId === live.localNodeId);
    const guestRoomFull = !live.isHost && !localAssignment && state.assignments.length >= state.playerCount;
    const ready = state.assignments.length === state.playerCount &&
      state.assignments.every((assignment) => live.liveNodeIds.includes(assignment.nodeId));
    return (
      <ScreenShell edgeWire="none" padded={false} texture={false}>
        <LiveTopline
          connection={live.connectionState}
          onClose={() => {
            if (!live.isHost) {
              leave();
              return;
            }
            void live.abort().finally(() => setTimeout(leave, 220));
          }}
          title={state.title}
        />
        <ScrollView contentContainerStyle={styles.lobbyContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.lobbyHero, { borderColor: state.accent }]}>
            <ForgeGrid color={state.accent} />
            <Text style={[styles.liveLabel, { color: state.accent, fontFamily: theme.typography.families.monoMedium }]}>LIVE CUT · {live.sessionCode}</Text>
            <Text style={[styles.lobbyTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{live.isHost ? 'DISTRIBUTE THE FILE.' : guestRoomFull ? 'ROOM ALREADY FULL.' : localAssignment ? 'ROLE PLATE ASSIGNED.' : 'REQUESTING A ROLE.'}</Text>
            <Text style={[styles.lobbyBody, { color: theme.colors.muted, fontFamily: theme.typography.families.storyBold }]}>{live.isHost ? 'Each phone receives exactly one private fragment stream. Start when every plate is occupied.' : guestRoomFull ? 'Every role belongs to another phone. Ask the host to open a new live cut, then use its new invite.' : localAssignment ? 'Keep this screen open. The host controls the start and every accepted answer.' : 'The host is checking this phone and will seal one private role file to it.'}</Text>
          </View>

          {live.isHost ? (
            joinUrl ? (
              <View style={[styles.invite, { borderColor: theme.colors.draft }]}>
                <View accessible accessibilityLabel={`Live generated case join QR, room ${live.sessionCode}`} accessibilityRole="image" style={styles.qrPlate}>
                  <QRCode backgroundColor="#F4ECD9" color="#080A08" ecl="M" quietZone={10} size={208} value={joinUrl} />
                </View>
                <View style={styles.inviteCopy}>
                  <Text style={[styles.inviteLabel, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>OTHER PHONES SCAN</Text>
                  <Text selectable style={[styles.roomCode, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{live.sessionCode}</Text>
                  <Text numberOfLines={3} selectable style={[styles.relay, { color: theme.colors.faint, fontFamily: theme.typography.families.mono }]}>{relayUrl}</Text>
                  <Text numberOfLines={2} selectable style={[styles.caseId, { color: theme.colors.muted, fontFamily: theme.typography.families.mono }]}>FILE {state.caseId}</Text>
                </View>
              </View>
            ) : <ConnectionFault message={live.lastError ?? 'The invite appears when the local relay connects.'} onRetry={live.reconnect} />
          ) : (
            <View style={[styles.guestWaiting, { borderColor: state.accent }]}>
              <Ionicons color={state.accent} name="lock-closed-outline" size={25} />
              <View style={styles.guestWaitingCopy}>
                <Text style={[styles.guestWaitingTitle, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{guestRoomFull ? 'NO ROLE AVAILABLE' : localAssignment ? 'YOUR FILE IS SEALED' : 'ADMISSION PENDING'}</Text>
                <Text style={[styles.guestWaitingBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{guestRoomFull ? 'This phone was not assigned a role and receives no private clues.' : localAssignment ? 'It opens when the host starts. No answer key or another player\'s clues were sent here.' : 'Stay connected while the host returns your assigned role plate.'}</Text>
              </View>
            </View>
          )}

          <View style={styles.rolesSection}>
            <View style={styles.sectionTopline}>
              <Text style={[styles.sectionLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>ROLE PLATES</Text>
              <Text style={[styles.sectionCount, { color: ready ? theme.colors.ready : state.accent, fontFamily: theme.typography.families.monoMedium }]}>{state.assignments.length}/{state.playerCount} ONLINE</Text>
            </View>
            {Array.from({ length: state.playerCount }, (_, index) => {
              const assignment = state.assignments[index];
              const online = assignment && live.liveNodeIds.includes(assignment.nodeId);
              return (
                <View key={assignment?.playerId ?? `vacant-${index}`} style={[styles.rolePlate, { borderColor: assignment?.accent ?? theme.colors.draft }]}>
                  <Text style={[styles.roleNumber, { color: assignment?.accent ?? theme.colors.faint, fontFamily: theme.typography.families.displayHeavy }]}>{String(index + 1).padStart(2, '0')}</Text>
                  <View style={styles.roleCopy}>
                    <Text style={[styles.roleName, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{assignment?.name ?? 'VACANT PLATE'}</Text>
                    <Text style={[styles.roleTitle, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{assignment?.title ?? 'WAITING FOR A PHONE'}</Text>
                  </View>
                  <View style={[styles.presenceDot, { backgroundColor: online ? theme.colors.ready : 'transparent', borderColor: online ? theme.colors.ready : theme.colors.draft }]} />
                </View>
              );
            })}
          </View>

          {live.isHost ? (
            <View style={styles.startArea}>
              <Pressable
                accessibilityRole="button"
                disabled={!ready || starting}
                onPress={() => {
                  setStarting(true);
                  void live.hostStart().then((started) => {
                    setStarting(false);
                    if (started) play('accept', 0.7);
                    else play('warning', 0.42);
                  });
                }}
                style={({ pressed }) => [styles.startButton, { backgroundColor: ready ? forgeColors.ink : theme.colors.draft }, pressed && styles.pressed]}
              >
                <Text style={[styles.startText, { color: ready ? forgeColors.dark : theme.colors.faint, fontFamily: theme.typography.families.bodyMedium }]}>{starting ? 'Locking role channels…' : ready ? 'Start the live case' : `Waiting for ${state.playerCount - state.assignments.length} phone${state.playerCount - state.assignments.length === 1 ? '' : 's'}`}</Text>
                <Ionicons color={ready ? forgeColors.dark : theme.colors.faint} name="radio-outline" size={21} />
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </ScreenShell>
    );
  }

  if (state.status === 'finished') {
    const elapsed = Math.max(1, Math.floor(((state.finishedAt ?? now) - (state.startedAt ?? now)) / 1_000));
    return (
      <ScreenShell edgeWire="none" padded={false} texture={false}>
        <ScrollView contentContainerStyle={styles.completedContent} showsVerticalScrollIndicator={false}>
          <Text style={[styles.liveLabel, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>LIVE CUT · CASE CLOSED</Text>
          <View style={[styles.completeSeal, { borderColor: state.accent }]}><Ionicons color={state.accent} name="key-outline" size={43} /></View>
          <Text style={[styles.completedTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{projection?.title ?? state.title}</Text>
          <Text style={[styles.completedEnding, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{projection?.ending ?? 'The mechanism releases. Every private fragment finally makes sense.'}</Text>
          <View style={[styles.metrics, { borderColor: theme.colors.draft }]}>
            <Metric label="ELAPSED" value={formatElapsed(elapsed)} />
            <Metric label="PHONES" value={`${state.assignments.length}`} />
            <Metric label="SCENES" value="5" />
          </View>
          <ForgeButton icon="albums-outline" label={live.isHost ? 'Return to casebook' : 'Leave the room'} onPress={leave} />
        </ScrollView>
      </ScreenShell>
    );
  }

  if (state.status === 'aborted') {
    return (
      <ScreenShell edgeWire="none" texture={false}>
        <View style={styles.centerState}>
          <Ionicons color={theme.colors.warning} name="remove-circle-outline" size={44} />
          <Text style={[styles.stateTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>THE HOST CLOSED THE FILE</Text>
          <Text style={[styles.stateBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>No progress was changed in the saved one-phone rehearsal.</Text>
          <ForgeButton icon="arrow-back" label="Leave live case" onPress={leave} />
        </View>
      </ScreenShell>
    );
  }

  if (!projection) {
    return (
      <ScreenShell edgeWire="none" padded={false} texture={false}>
        <LiveTopline connection={live.connectionState} onClose={leave} title={state.title} />
        <View style={styles.centerState}>
          <View style={[styles.loadingRotor, { borderColor: forgeColors.ink }]} />
          <Text style={[styles.loadingLabel, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>RE-REQUESTING PRIVATE FILE</Text>
          <ConnectionFault message={live.lastError ?? 'The public stage is synchronized. Waiting for the host to resend this role’s private clues.'} onRetry={live.reconnect} />
        </View>
      </ScreenShell>
    );
  }

  const stage = projection.stages[state.stageIndex];
  if (!stage) return null;
  const uiRoles = rolesForProjection(projection);
  const elapsed = Math.max(0, Math.floor((now - (state.startedAt ?? now)) / 1_000));

  return (
    <ScreenShell edgeWire="none" padded={false} texture={false}>
      <View style={[styles.playTopline, { borderColor: theme.colors.draft }]}>
        <Pressable accessibilityLabel="Leave live case" accessibilityRole="button" onPress={() => setLeaveOpen(true)} style={[styles.iconButton, { borderColor: theme.colors.draft }]}>
          <Ionicons color={theme.colors.text} name="close" size={21} />
        </Pressable>
        <View style={styles.playHeaderCopy}>
          <Text numberOfLines={1} style={[styles.playTitle, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{projection.title}</Text>
          <Text style={[styles.liveLabel, { color: forgeColors.ink, fontFamily: theme.typography.families.monoMedium }]}>LIVE · {projection.role.title.toUpperCase()} · {formatElapsed(elapsed)}</Text>
        </View>
        <Text style={[styles.stageCount, { color: state.accent, fontFamily: theme.typography.families.displayHeavy }]}>{state.stageIndex + 1}/5</Text>
      </View>
      <View style={styles.sceneRail}>{projection.stages.map((item, index) => <View key={item.id} style={[styles.sceneSegment, { backgroundColor: index <= state.stageIndex ? state.accent : theme.colors.draft, flex: index === state.stageIndex ? 2 : 1 }]} />)}</View>
      <ScrollView contentContainerStyle={styles.runContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {live.connectionState !== 'connected' || live.missingNodeIds.length ? (
          <ConnectionFault
            message={live.connectionState !== 'connected' ? 'Your phone lost the relay. Reconnect to recover the host-authoritative stage.' : `${live.missingNodeIds.length} assigned phone${live.missingNodeIds.length === 1 ? ' is' : 's are'} offline. This scene pauses until the role returns.`}
            onRetry={live.reconnect}
          />
        ) : null}
        {stage.mechanic.kind === 'motion-sync' ? (
          <View style={[styles.syncBand, { borderColor: state.accent }]}>
            <Ionicons color={state.accent} name="pulse-outline" size={20} />
            <Text style={[styles.syncBandText, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{state.syncProofs.length}/{stage.mechanic.participantCount} phones armed inside the live timing window</Text>
          </View>
        ) : null}
        <ForgeStageRunner
          activePlayerId={projection.role.playerId}
          hintsRevealed={state.hintsByStage[stage.id] ?? 0}
          liveMode
          onChangePlayer={() => undefined}
          onRevealHint={() => {
            void live.revealHint().then((revealed) => {
              if (revealed) play('relay', 0.3);
              else play('warning', 0.3);
            });
          }}
          onSubmit={live.submit}
          roles={uiRoles}
          stage={stage}
        />
      </ScrollView>

      <Modal animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => setLeaveOpen(false)} transparent visible={leaveOpen}>
        <View accessibilityViewIsModal style={styles.modalBackdrop}>
          <View style={[styles.dialog, { backgroundColor: theme.colors.surfaceRaised, borderColor: live.isHost ? theme.colors.fault : theme.colors.warning }]}>
            <Text style={[styles.dialogLabel, { color: live.isHost ? theme.colors.fault : theme.colors.warning, fontFamily: theme.typography.families.monoMedium }]}>{live.isHost ? 'HOST CONTROL' : 'LEAVE THIS PHONE'}</Text>
            <Text style={[styles.dialogTitle, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{live.isHost ? 'CLOSE FOR EVERYONE?' : 'LEAVE THE LIVE FILE?'}</Text>
            <Text style={[styles.dialogBody, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>{live.isHost ? 'The other role channels will close. The saved generated case remains in your casebook.' : 'The case pauses for the family until this role reconnects.'}</Text>
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" onPress={() => setLeaveOpen(false)} style={[styles.dialogButton, { borderColor: theme.colors.draft }]}><Text style={[styles.dialogButtonText, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Stay</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => live.isHost ? void endForEveryone() : leave()} style={[styles.dialogButton, { backgroundColor: live.isHost ? theme.colors.fault : theme.colors.warning }]}><Text style={[styles.dialogButtonText, { color: theme.colors.textInverse, fontFamily: theme.typography.families.bodyMedium }]}>{live.isHost ? 'Close room' : 'Leave'}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

function LiveTopline({ connection, onClose, title }: { connection: string; onClose: () => void; title: string }) {
  const { theme } = useHousewireTheme();
  const connected = connection === 'connected';
  return (
    <View style={styles.topline}>
      <Pressable accessibilityLabel="Leave live room" accessibilityRole="button" onPress={onClose} style={[styles.iconButton, { borderColor: theme.colors.draft }]}><Ionicons color={theme.colors.text} name="close" size={21} /></Pressable>
      <View style={styles.toplineCopy}><Text numberOfLines={1} style={[styles.toplineTitle, { color: theme.colors.text, fontFamily: theme.typography.families.display }]}>{title}</Text><Text style={[styles.connectionLabel, { color: connected ? theme.colors.ready : theme.colors.warning, fontFamily: theme.typography.families.monoMedium }]}>{connected ? 'LOCAL RELAY LIVE' : connection.toUpperCase()}</Text></View>
      <View style={[styles.connectionDot, { backgroundColor: connected ? theme.colors.ready : theme.colors.warning }]} />
    </View>
  );
}

function ConnectionFault({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { theme } = useHousewireTheme();
  return (
    <View accessibilityLiveRegion="polite" style={[styles.fault, { borderColor: theme.colors.warning }]}>
      <Ionicons color={theme.colors.warning} name="warning-outline" size={18} />
      <Text style={[styles.faultText, { color: theme.colors.text, fontFamily: theme.typography.families.body }]}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry}><Text style={[styles.retry, { color: theme.colors.warning, fontFamily: theme.typography.families.monoMedium }]}>RETRY</Text></Pressable>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { theme } = useHousewireTheme();
  return <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{value}</Text><Text style={[styles.metricLabel, { color: theme.colors.muted, fontFamily: theme.typography.families.monoMedium }]}>{label}</Text></View>;
}

function rolesForProjection(projection: ForgePlayerCase): ForgeRole[] {
  return projection.crew.map((member, index) => member.playerId === projection.role.playerId
    ? { ...projection.role, playerName: member.playerName }
    : {
        id: `live-role-${index + 1}`,
        playerId: member.playerId,
        playerName: member.playerName,
        title: member.title,
        accent: member.accent,
        brief: 'This brief remains on its assigned phone.',
        responsibility: 'Hold a private fragment for the crew.',
      });
}

function first(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  caseId: { fontSize: 7, lineHeight: 10 },
  centerState: { alignItems: 'center', flex: 1, gap: 14, justifyContent: 'center', paddingHorizontal: 22 },
  completedContent: { alignItems: 'center', flexGrow: 1, gap: 18, justifyContent: 'center', padding: 22 },
  completedEnding: { fontSize: 22, lineHeight: 28, maxWidth: 350, textAlign: 'center' },
  completedTitle: { fontSize: 54, lineHeight: 51, textAlign: 'center', textTransform: 'uppercase' },
  completeSeal: { alignItems: 'center', borderRadius: 56, borderStyle: 'dashed', borderWidth: 2, height: 104, justifyContent: 'center', width: 104 },
  connectionDot: { borderRadius: 5, height: 10, width: 10 },
  connectionLabel: { fontSize: 7, letterSpacing: 1.1 },
  dialog: { borderLeftWidth: 4, gap: 10, maxWidth: 410, padding: 19, width: '100%' },
  dialogActions: { flexDirection: 'row', gap: 8, marginTop: 5 },
  dialogBody: { fontSize: 13, lineHeight: 19 },
  dialogButton: { alignItems: 'center', borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 49 },
  dialogButtonText: { fontSize: 14 },
  dialogLabel: { fontSize: 8, letterSpacing: 1.2 },
  dialogTitle: { fontSize: 36, lineHeight: 35 },
  fault: { alignItems: 'center', borderLeftWidth: 3, flexDirection: 'row', gap: 9, paddingLeft: 10, paddingVertical: 9, width: '100%' },
  faultText: { flex: 1, fontSize: 11, lineHeight: 16 },
  guestWaiting: { alignItems: 'center', borderLeftWidth: 3, flexDirection: 'row', gap: 12, padding: 13 },
  guestWaitingBody: { fontSize: 11, lineHeight: 16 },
  guestWaitingCopy: { flex: 1, gap: 2 },
  guestWaitingTitle: { fontSize: 20, lineHeight: 21 },
  iconButton: { alignItems: 'center', borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  invite: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: 16, paddingVertical: 14 },
  inviteCopy: { flex: 1, gap: 5 },
  inviteLabel: { fontSize: 8, letterSpacing: 1.2 },
  liveLabel: { fontSize: 8, letterSpacing: 1.25 },
  loadingLabel: { fontSize: 8, letterSpacing: 1.3, textAlign: 'center' },
  loadingRotor: { borderRadius: 34, borderStyle: 'dashed', borderWidth: 2, height: 68, width: 68 },
  lobbyBody: { fontSize: 19, lineHeight: 25, maxWidth: 350 },
  lobbyContent: { gap: 20, paddingBottom: 48, paddingHorizontal: 20, paddingTop: 13 },
  lobbyHero: { borderLeftWidth: 4, gap: 8, overflow: 'hidden', padding: 16 },
  lobbyTitle: { fontSize: 45, lineHeight: 42 },
  metric: { alignItems: 'center', flex: 1 },
  metricLabel: { fontSize: 7, letterSpacing: 1.1 },
  metrics: { borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', paddingVertical: 15, width: '100%' },
  metricValue: { fontSize: 28, lineHeight: 29 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.84)', flex: 1, justifyContent: 'center', padding: 22 },
  playHeaderCopy: { alignItems: 'center', flex: 1 },
  playTitle: { fontSize: 20, lineHeight: 21, textTransform: 'uppercase' },
  playTopline: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 9, marginHorizontal: 20, paddingBottom: 9, paddingTop: 10 },
  presenceDot: { borderRadius: 5, borderWidth: 1, height: 10, width: 10 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  qrPlate: { backgroundColor: '#F4ECD9', padding: 7 },
  relay: { fontSize: 7, lineHeight: 11 },
  retry: { fontSize: 8, letterSpacing: 0.8 },
  roleCopy: { flex: 1, gap: 1 },
  roleName: { fontSize: 21, lineHeight: 22, textTransform: 'uppercase' },
  roleNumber: { fontSize: 29, lineHeight: 30, width: 38 },
  rolePlate: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 9, minHeight: 61 },
  rolesSection: { gap: 0 },
  roleTitle: { fontSize: 7, letterSpacing: 0.8 },
  roomCode: { fontSize: 43, letterSpacing: 2, lineHeight: 41 },
  runContent: { gap: 18, paddingBottom: 64, paddingHorizontal: 20, paddingTop: 13 },
  sceneRail: { flexDirection: 'row', gap: 3, height: 4, marginHorizontal: 20, marginTop: 8 },
  sceneSegment: { height: 4 },
  sectionCount: { fontSize: 8, letterSpacing: 1 },
  sectionLabel: { fontSize: 8, letterSpacing: 1.2 },
  sectionTopline: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8 },
  stageCount: { fontSize: 24, lineHeight: 24, textAlign: 'right', width: 38 },
  startArea: { gap: 8 },
  startButton: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 59, paddingHorizontal: 16 },
  startText: { fontSize: 17 },
  stateBody: { fontSize: 14, lineHeight: 20, maxWidth: 310, textAlign: 'center' },
  stateTitle: { fontSize: 42, lineHeight: 40, textAlign: 'center' },
  syncBand: { alignItems: 'center', borderLeftWidth: 3, flexDirection: 'row', gap: 9, paddingLeft: 10, paddingVertical: 8 },
  syncBandText: { flex: 1, fontSize: 11, lineHeight: 16 },
  topline: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 10 },
  toplineCopy: { alignItems: 'center', flex: 1 },
  toplineTitle: { fontSize: 20, lineHeight: 21, maxWidth: 250, textTransform: 'uppercase' },
});

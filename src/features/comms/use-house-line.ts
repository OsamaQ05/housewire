import { useAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { useAcousticMeter } from '@/src/hooks/use-acoustic-meter';
import type { DirectDeliveryAck, TransportConnectionState } from '@/src/services/transport';
import type { SessionDirectFeedItem } from '@/src/features/session/use-housewire-session';
import { createRelayId } from '@/src/features/session/relay-id';

import {
  HOUSE_LINE_MAX_CLIP_DURATION_MS,
  HOUSE_LINE_SIGNALS,
  HOUSE_LINE_TTL_MS,
  appendHouseLineInbox,
  fanOutHouseLineMessage,
  houseLineMessageSchema,
  parseHouseLineMessage,
  selectHouseLineRecipients,
  validateIncomingHouseLineMessage,
  type HouseLineInboxItem,
  type HouseLineMessage,
  type HouseLineSignal,
  type HouseLineTargetId,
} from './house-line-protocol';

export type HouseLineAcousticAdapter = Pick<
  ReturnType<typeof useAcousticMeter>,
  'active' | 'durationMs' | 'error' | 'finishWhisper' | 'permissionDenied' | 'start' | 'stop'
>;

export interface HouseLinePeer {
  id: string;
  label: string;
  roomLabel?: string;
}

export interface HouseLineSessionAdapter {
  connectionState: TransportConnectionState;
  consumeDirect(messageId: string): void;
  directFeed: readonly SessionDirectFeedItem[];
  publishDirect(recipientId: string, payload: unknown): Promise<DirectDeliveryAck>;
}

export type HouseLineDeliveryStatus = 'idle' | 'sending' | 'delivered' | 'partial' | 'failed' | 'played';

export interface HouseLineDeliveryState {
  deliveredCount: number;
  failedCount: number;
  playedBy: readonly string[];
  status: HouseLineDeliveryStatus;
  targetCount: number;
  transmissionId?: string;
}

export interface UseHouseLineOptions {
  acoustic: HouseLineAcousticAdapter;
  channelId?: string;
  clockOffsetMs?: number;
  enabled: boolean;
  hapticsEnabled?: boolean;
  localNodeId: string;
  now?: () => number;
  peers: readonly HouseLinePeer[];
  session: HouseLineSessionAdapter;
  trustedPeerIds: readonly string[];
}

export interface HouseLineController {
  beginTalking(): Promise<boolean>;
  canTalk: boolean;
  cancelTalking(): Promise<void>;
  clearError(): void;
  connected: boolean;
  delivery: HouseLineDeliveryState;
  dismissIncoming(frameMessageId: string): void;
  endTalking(): Promise<boolean>;
  error?: string;
  incoming: readonly HouseLineInboxItem[];
  peers: readonly HouseLinePeer[];
  playIncoming(frameMessageId: string): Promise<boolean>;
  recording: boolean;
  recordingDurationMs: number;
  sendSignal(signal: HouseLineSignal): Promise<boolean>;
  sending: boolean;
  setTargetId(targetId: HouseLineTargetId): void;
  signals: typeof HOUSE_LINE_SIGNALS;
  targetId: HouseLineTargetId;
}

const EMPTY_DELIVERY: HouseLineDeliveryState = {
  deliveredCount: 0,
  failedCount: 0,
  playedBy: [],
  status: 'idle',
  targetCount: 0,
};

export function useHouseLine(options: UseHouseLineOptions): HouseLineController {
  const {
    acoustic,
    channelId,
    clockOffsetMs = 0,
    enabled,
    hapticsEnabled = true,
    localNodeId,
    peers,
    session,
    trustedPeerIds,
  } = options;
  const playback = useAudioPlayer(null);
  const nowRef = useRef(options.now ?? Date.now);
  nowRef.current = options.now ?? Date.now;
  const [targetId, setTargetIdState] = useState<HouseLineTargetId>('ALL');
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [incoming, setIncoming] = useState<HouseLineInboxItem[]>([]);
  const [delivery, setDelivery] = useState<HouseLineDeliveryState>(EMPTY_DELIVERY);
  const [error, setError] = useState<string>();
  const processedFrameIdsRef = useRef(new Set<string>());
  const recordingPromiseRef = useRef<Promise<boolean> | undefined>(undefined);
  const ownsRecordingRef = useRef(false);
  const temporaryFilesRef = useRef(new Set<string>());

  const connected = enabled && session.connectionState === 'connected';
  const recipientIds = useMemo(
    () => selectHouseLineRecipients(localNodeId, trustedPeerIds, targetId),
    [localNodeId, targetId, trustedPeerIds],
  );
  const availablePeers = useMemo(
    () => peers.filter((peer) => peer.id !== localNodeId && trustedPeerIds.includes(peer.id)),
    [localNodeId, peers, trustedPeerIds],
  );
  const peerMap = useMemo(() => new Map(peers.map((peer) => [peer.id, peer])), [peers]);
  const canTalk = connected && Boolean(channelId) && recipientIds.length > 0 && !sending;

  useEffect(() => {
    if (targetId !== 'ALL' && !trustedPeerIds.includes(targetId)) setTargetIdState('ALL');
  }, [targetId, trustedPeerIds]);

  useEffect(() => {
    processedFrameIdsRef.current.clear();
    setIncoming([]);
    setDelivery(EMPTY_DELIVERY);
    setError(undefined);
  }, [channelId]);

  const sendReceipt = useCallback(
    async (item: HouseLineInboxItem, status: 'played' | 'dismissed') => {
      if (!channelId || session.connectionState !== 'connected') return;
      const message = houseLineMessageSchema.parse({
        kind: 'housewire.line.receipt.v1',
        protocolVersion: 1,
        channelId,
        transmissionId: createRelayId('line-receipt'),
        sourceTransmissionId: item.message.transmissionId,
        status,
        sentAt: nowRef.current() + clockOffsetMs,
        ttlMs: HOUSE_LINE_TTL_MS,
      });
      await session.publishDirect(item.senderId, message).catch(() => undefined);
    },
    [channelId, clockOffsetMs, session],
  );

  useEffect(() => {
    if (!channelId) return;
    for (const item of session.directFeed) {
      if (processedFrameIdsRef.current.has(item.messageId)) continue;
      const parsed = parseHouseLineMessage(item.payload);
      if (!parsed) continue;
      processedFrameIdsRef.current.add(item.messageId);
      session.consumeDirect(item.messageId);
      const validated = validateIncomingHouseLineMessage(parsed, {
        channelId,
        now: item.serverTime,
        senderId: item.senderId,
        trustedPeerIds,
      });
      if (!validated.accepted || item.senderId === localNodeId) continue;
      const message = validated.message;
      if (message.kind === 'housewire.line.receipt.v1') {
        setDelivery((current) => {
          if (current.transmissionId !== message.sourceTransmissionId) return current;
          const playedBy = message.status === 'played'
            ? [...new Set([...current.playedBy, item.senderId])]
            : current.playedBy;
          return {
            ...current,
            playedBy,
            status: playedBy.length > 0 ? 'played' : current.status,
          };
        });
        continue;
      }
      const sender = peerMap.get(item.senderId);
      const inboxItem: HouseLineInboxItem = {
        frameMessageId: item.messageId,
        message,
        played: false,
        receivedAt: item.serverTime,
        senderId: item.senderId,
        senderLabel: sender?.label ?? `Phone ${item.senderId.slice(-2).toUpperCase()}`,
      };
      setIncoming((current) => appendHouseLineInbox(current, inboxItem));
      if (hapticsEnabled && Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      }
    }
    if (processedFrameIdsRef.current.size > 128) {
      processedFrameIdsRef.current = new Set(session.directFeed.map((item) => item.messageId));
    }
  }, [channelId, hapticsEnabled, localNodeId, peerMap, session, trustedPeerIds]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = nowRef.current() + clockOffsetMs;
      setIncoming((current) => current.filter((item) => now - item.message.sentAt <= item.message.ttlMs));
    }, 1_000);
    return () => clearInterval(timer);
  }, [clockOffsetMs]);

  useEffect(() => () => {
    for (const uri of temporaryFilesRef.current) {
      void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    }
    temporaryFilesRef.current.clear();
  }, []);

  const publishMessage = useCallback(
    async (message: HouseLineMessage): Promise<boolean> => {
      if (!canTalk) {
        setError(session.connectionState === 'connected'
          ? 'Choose a connected player before using the house line.'
          : 'The house line is reconnecting. Use the same Wi-Fi and try again.');
        return false;
      }
      setSending(true);
      setError(undefined);
      setDelivery({
        deliveredCount: 0,
        failedCount: 0,
        playedBy: [],
        status: 'sending',
        targetCount: recipientIds.length,
        transmissionId: message.transmissionId,
      });
      try {
        const result = await fanOutHouseLineMessage(session.publishDirect, recipientIds, message);
        const deliveredCount = result.deliveredRecipientIds.length;
        const failedCount = result.failedRecipientIds.length;
        const status: HouseLineDeliveryStatus = deliveredCount === 0
          ? 'failed'
          : failedCount > 0
            ? 'partial'
            : 'delivered';
        setDelivery({
          deliveredCount,
          failedCount,
          playedBy: [],
          status,
          targetCount: recipientIds.length,
          transmissionId: message.transmissionId,
        });
        if (status === 'failed') setError('No selected phone received the transmission.');
        else if (status === 'partial') setError(`${failedCount} selected phone${failedCount === 1 ? '' : 's'} missed the transmission.`);
        return deliveredCount > 0;
      } finally {
        setSending(false);
      }
    },
    [canTalk, recipientIds, session.connectionState, session.publishDirect],
  );

  const beginTalking = useCallback(async (): Promise<boolean> => {
    if (!canTalk || acoustic.active || recordingPromiseRef.current) {
      if (acoustic.active) setError('Finish the current sound puzzle before opening the house line.');
      else if (!canTalk) setError('The house line needs at least one connected phone.');
      return false;
    }
    setError(undefined);
    const attempt = acoustic.start(HOUSE_LINE_MAX_CLIP_DURATION_MS / 1_000);
    recordingPromiseRef.current = attempt;
    try {
      const armed = await attempt;
      ownsRecordingRef.current = armed;
      setRecording(armed);
      if (!armed) setError('Microphone access is off. Use one of the signal keys instead.');
      return armed;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The microphone could not open.');
      return false;
    } finally {
      recordingPromiseRef.current = undefined;
    }
  }, [acoustic, canTalk]);

  const endTalking = useCallback(async (): Promise<boolean> => {
    if (recordingPromiseRef.current) await recordingPromiseRef.current;
    if (!ownsRecordingRef.current) return false;
    ownsRecordingRef.current = false;
    setRecording(false);
    const clip = await acoustic.finishWhisper();
    if (!clip || !channelId) {
      setError(acoustic.error ?? 'The voice burst was empty. Hold LINE, speak, then release.');
      return false;
    }
    const parsed = houseLineMessageSchema.safeParse({
      kind: 'housewire.line.clip.v1',
      protocolVersion: 1,
      channelId,
      transmissionId: createRelayId('line-clip'),
      sentAt: nowRef.current() + clockOffsetMs,
      ttlMs: HOUSE_LINE_TTL_MS,
      clip,
    });
    if (!parsed.success) {
      setError('That burst was too large for the house line. Keep it under two seconds.');
      return false;
    }
    return publishMessage(parsed.data);
  }, [acoustic, channelId, clockOffsetMs, publishMessage]);

  const cancelTalking = useCallback(async () => {
    if (recordingPromiseRef.current) await recordingPromiseRef.current;
    if (!ownsRecordingRef.current) return;
    ownsRecordingRef.current = false;
    setRecording(false);
    await acoustic.finishWhisper().catch(() => undefined);
  }, [acoustic]);

  const sendSignal = useCallback(async (signal: HouseLineSignal): Promise<boolean> => {
    if (!channelId) return false;
    const message = houseLineMessageSchema.parse({
      kind: 'housewire.line.signal.v1',
      protocolVersion: 1,
      channelId,
      transmissionId: createRelayId('line-signal'),
      sentAt: nowRef.current() + clockOffsetMs,
      ttlMs: HOUSE_LINE_TTL_MS,
      signal,
    });
    return publishMessage(message);
  }, [channelId, clockOffsetMs, publishMessage]);

  const playIncoming = useCallback(async (frameMessageId: string): Promise<boolean> => {
    const item = incoming.find((candidate) => candidate.frameMessageId === frameMessageId);
    if (!item || item.message.kind !== 'housewire.line.clip.v1') return false;
    const { clip } = item.message;
    try {
      if (Platform.OS === 'web') {
        playback.replace({ uri: `data:${clip.mimeType};base64,${clip.base64}` });
        playback.play();
        setTimeout(() => playback.replace(null), clip.durationMs + 1_500);
      } else {
        if (!FileSystem.cacheDirectory) throw new Error('No temporary audio directory is available.');
        const uri = `${FileSystem.cacheDirectory}housewire-line-${item.message.transmissionId}.m4a`;
        temporaryFilesRef.current.add(uri);
        await FileSystem.writeAsStringAsync(uri, clip.base64, { encoding: FileSystem.EncodingType.Base64 });
        playback.replace({ uri });
        playback.play();
        setTimeout(() => {
          playback.replace(null);
          temporaryFilesRef.current.delete(uri);
          void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        }, clip.durationMs + 1_500);
      }
      setIncoming((current) => current.map((candidate) => candidate.frameMessageId === frameMessageId
        ? { ...candidate, played: true }
        : candidate));
      void sendReceipt(item, 'played');
      return true;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'This phone could not play that burst.');
      return false;
    }
  }, [incoming, playback, sendReceipt]);

  const dismissIncoming = useCallback((frameMessageId: string) => {
    const item = incoming.find((candidate) => candidate.frameMessageId === frameMessageId);
    setIncoming((current) => current.filter((candidate) => candidate.frameMessageId !== frameMessageId));
    if (item) void sendReceipt(item, 'dismissed');
  }, [incoming, sendReceipt]);

  const setTargetId = useCallback((nextTargetId: HouseLineTargetId) => {
    if (nextTargetId !== 'ALL' && !trustedPeerIds.includes(nextTargetId)) return;
    setTargetIdState(nextTargetId);
  }, [trustedPeerIds]);

  return {
    beginTalking,
    canTalk,
    cancelTalking,
    clearError: () => setError(undefined),
    connected,
    delivery,
    dismissIncoming,
    endTalking,
    error,
    incoming,
    peers: availablePeers,
    playIncoming,
    recording,
    recordingDurationMs: acoustic.durationMs,
    sendSignal,
    sending,
    setTargetId,
    signals: HOUSE_LINE_SIGNALS,
    targetId,
  };
}

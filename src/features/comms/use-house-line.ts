import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { useAcousticMeter } from '@/src/hooks/use-acoustic-meter';
import type { DirectDeliveryAck, TransportConnectionState } from '@/src/services/transport';
import type { SessionDirectFeedItem } from '@/src/features/session/use-housewire-session';
import { createRelayId } from '@/src/features/session/relay-id';
import { VoiceCaptureLease } from './voice-capture-lease';
import { useMusicSilence } from '@/src/features/music/HousewireMusic';
import { musicFocus } from '@/src/features/music/music-focus';

import {
  HOUSE_LINE_MAX_CLIP_DURATION_MS,
  HOUSE_LINE_SIGNALS,
  HOUSE_LINE_TTL_MS,
  appendHouseLineInbox,
  fanOutHouseLineMessage,
  houseLineMessageSchema,
  houseLineTimestamp,
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
  preparing: boolean;
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
  const playbackStatus = useAudioPlayerStatus(playback);
  useMusicSilence(playbackStatus.playing);
  const nowRef = useRef(options.now ?? Date.now);
  nowRef.current = options.now ?? Date.now;
  const [targetId, setTargetIdState] = useState<HouseLineTargetId>('ALL');
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [incoming, setIncoming] = useState<HouseLineInboxItem[]>([]);
  const [delivery, setDelivery] = useState<HouseLineDeliveryState>(EMPTY_DELIVERY);
  const [error, setError] = useState<string>();
  const processedFrameIdsRef = useRef(new Set<string>());
  const recordingPromiseRef = useRef<Promise<boolean> | undefined>(undefined);
  const ownsRecordingRef = useRef(false);
  const temporaryFilesRef = useRef(new Set<string>());
  const captureRecipientsRef = useRef<readonly string[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const playbackMusicRef = useRef<(() => void) | undefined>(undefined);
  const finishTalkingRef = useRef<() => Promise<boolean>>(async () => false);
  const cancelTalkingRef = useRef<() => Promise<void>>(async () => undefined);
  const mountedRef = useRef(true);
  const finishingRef = useRef(false);
  const captureLeaseRef = useRef(new VoiceCaptureLease());
  const captureTokenRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

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
  const canTalk = connected && Boolean(channelId) && recipientIds.length > 0 && !sending && !preparing;

  useEffect(() => {
    if (targetId !== 'ALL' && !trustedPeerIds.includes(targetId)) setTargetIdState('ALL');
  }, [targetId, trustedPeerIds]);

  useEffect(() => {
    void cancelTalkingRef.current();
    processedFrameIdsRef.current.clear();
    setIncoming([]);
    setDelivery(EMPTY_DELIVERY);
    setError(undefined);
  }, [channelId]);

  useEffect(() => {
    if (!enabled) void cancelTalkingRef.current();
  }, [enabled]);

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
        sentAt: houseLineTimestamp(nowRef.current(), clockOffsetMs),
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
      const now = houseLineTimestamp(nowRef.current(), clockOffsetMs);
      setIncoming((current) => current.filter((item) => now - item.message.sentAt <= item.message.ttlMs));
    }, 1_000);
    return () => clearInterval(timer);
  }, [clockOffsetMs]);

  useEffect(() => {
    mountedRef.current = true;
    const temporaryFiles = temporaryFilesRef.current;
    return () => {
      mountedRef.current = false;
      clearTimeout(recordingTimerRef.current);
      clearTimeout(playbackTimerRef.current);
      playbackMusicRef.current?.();
      void cancelTalkingRef.current();
      for (const uri of temporaryFiles) {
        void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      }
      temporaryFiles.clear();
    };
  }, []);

  const publishMessage = useCallback(
    async (message: HouseLineMessage, selectedRecipients: readonly string[] = recipientIds): Promise<boolean> => {
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
        targetCount: selectedRecipients.length,
        transmissionId: message.transmissionId,
      });
      try {
        const result = await fanOutHouseLineMessage(session.publishDirect, selectedRecipients, message);
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
          targetCount: selectedRecipients.length,
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
    if (!canTalk || acoustic.active || recordingPromiseRef.current || ownsRecordingRef.current || finishingRef.current) {
      if (acoustic.active) setError('Finish the current sound puzzle before opening the house line.');
      else if (!canTalk) setError('The house line needs at least one connected phone.');
      return false;
    }
    setError(undefined);
    playback.pause();
    setPreparing(true);
    captureRecipientsRef.current = [...recipientIds];
    const token = captureLeaseRef.current.begin();
    captureTokenRef.current = token;
    const attempt = acoustic.start(HOUSE_LINE_MAX_CLIP_DURATION_MS / 1_000);
    recordingPromiseRef.current = attempt;
    try {
      const armed = await attempt;
      if (!mountedRef.current || !captureLeaseRef.current.canSend(token, enabledRef.current)) {
        ownsRecordingRef.current = false;
        if (armed) await acoustic.finishWhisper();
        return false;
      }
      ownsRecordingRef.current = armed;
      setRecording(armed);
      if (armed) {
        clearTimeout(recordingTimerRef.current);
        // The native recording limit remains a second guard if JS is busy.
        recordingTimerRef.current = setTimeout(() => void finishTalkingRef.current(), HOUSE_LINE_MAX_CLIP_DURATION_MS + 100);
      }
      if (!armed) setError('Microphone access is off. Use one of the signal keys instead.');
      return armed;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The microphone could not open.');
      return false;
    } finally {
      recordingPromiseRef.current = undefined;
      if (mountedRef.current) setPreparing(false);
    }
  }, [acoustic, canTalk, playback, recipientIds]);

  const endTalking = useCallback(async (): Promise<boolean> => {
    if (recordingPromiseRef.current) await recordingPromiseRef.current;
    if (!ownsRecordingRef.current || finishingRef.current) return false;
    clearTimeout(recordingTimerRef.current);
    finishingRef.current = true;
    const token = captureTokenRef.current;
    ownsRecordingRef.current = false;
    setRecording(false);
    setPreparing(true);
    try {
      const clip = await acoustic.finishWhisper();
      if (!mountedRef.current || !captureLeaseRef.current.canSend(token, enabledRef.current)) return false;
      if (!clip || !channelId) {
        setError(acoustic.error ?? 'The voice note was empty. Tap Record, speak, then tap Stop & send.');
        return false;
      }
      const parsed = houseLineMessageSchema.safeParse({
        kind: 'housewire.line.clip.v1',
        protocolVersion: 1,
        channelId,
        transmissionId: createRelayId('line-clip'),
        sentAt: houseLineTimestamp(nowRef.current(), clockOffsetMs),
        ttlMs: HOUSE_LINE_TTL_MS,
        clip,
      });
      if (!parsed.success) {
        setError('That voice note could not be sent. Try a shorter recording (up to 30 seconds).');
        return false;
      }
      return await publishMessage(parsed.data, captureRecipientsRef.current);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The voice note could not be sent.');
      return false;
    } finally {
      finishingRef.current = false;
      if (mountedRef.current) setPreparing(false);
    }
  }, [acoustic, channelId, clockOffsetMs, publishMessage]);
  finishTalkingRef.current = endTalking;

  const cancelTalking = useCallback(async () => {
    captureLeaseRef.current.cancel();
    clearTimeout(recordingTimerRef.current);
    if (mountedRef.current) setRecording(false);
    if (recordingPromiseRef.current) await recordingPromiseRef.current;
    if (!ownsRecordingRef.current) return;
    ownsRecordingRef.current = false;
    await acoustic.finishWhisper().catch(() => undefined);
  }, [acoustic]);
  cancelTalkingRef.current = cancelTalking;

  const sendSignal = useCallback(async (signal: HouseLineSignal): Promise<boolean> => {
    if (!channelId) return false;
    const message = houseLineMessageSchema.parse({
      kind: 'housewire.line.signal.v1',
      protocolVersion: 1,
      channelId,
      transmissionId: createRelayId('line-signal'),
      sentAt: houseLineTimestamp(nowRef.current(), clockOffsetMs),
      ttlMs: HOUSE_LINE_TTL_MS,
      signal,
    });
    return publishMessage(message);
  }, [channelId, clockOffsetMs, publishMessage]);

  const playIncoming = useCallback(async (frameMessageId: string): Promise<boolean> => {
    if (recording || preparing) {
      setError('Finish your recording before playing a received note.');
      return false;
    }
    const item = incoming.find((candidate) => candidate.frameMessageId === frameMessageId);
    if (!item || item.message.kind !== 'housewire.line.clip.v1') return false;
    const { clip } = item.message;
    try {
      playbackMusicRef.current?.();
      playbackMusicRef.current = musicFocus.acquire();
      clearTimeout(playbackTimerRef.current);
      // A previous note's timeout must never stop the next note mid-sentence.
      playback.pause();
      const finishPlayback = () => {
        playback.replace(null);
        playbackMusicRef.current?.(); playbackMusicRef.current = undefined;
        setIncoming((current) => current.filter((candidate) => candidate.frameMessageId !== frameMessageId));
        for (const uri of temporaryFilesRef.current) {
          void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        }
        temporaryFilesRef.current.clear();
      };
      if (Platform.OS === 'web') {
        playback.replace({ uri: `data:${clip.mimeType};base64,${clip.base64}` });
        playback.play();
        playbackTimerRef.current = setTimeout(finishPlayback, clip.durationMs + 1_500);
      } else {
        if (!FileSystem.cacheDirectory) throw new Error('No temporary audio directory is available.');
        const extension = clip.mimeType === 'audio/mp4' ? 'm4a' : clip.mimeType === 'audio/webm' ? 'webm' : 'ogg';
        const uri = `${FileSystem.cacheDirectory}housewire-line-${item.message.transmissionId}.${extension}`;
        temporaryFilesRef.current.add(uri);
        await FileSystem.writeAsStringAsync(uri, clip.base64, { encoding: FileSystem.EncodingType.Base64 });
        playback.replace({ uri });
        playback.play();
        playbackTimerRef.current = setTimeout(finishPlayback, clip.durationMs + 1_500);
      }
      setIncoming((current) => current.map((candidate) => candidate.frameMessageId === frameMessageId
        ? { ...candidate, played: true }
        : candidate));
      void sendReceipt(item, 'played');
      return true;
    } catch (cause: unknown) {
      playbackMusicRef.current?.(); playbackMusicRef.current = undefined;
      setError(cause instanceof Error ? cause.message : 'This phone could not play that voice note.');
      return false;
    }
  }, [incoming, playback, preparing, recording, sendReceipt]);

  const dismissIncoming = useCallback((frameMessageId: string) => {
    const item = incoming.find((candidate) => candidate.frameMessageId === frameMessageId);
    setIncoming((current) => current.filter((candidate) => candidate.frameMessageId !== frameMessageId));
    if (item) void sendReceipt(item, 'dismissed');
  }, [incoming, sendReceipt]);

  const setTargetId = useCallback((nextTargetId: HouseLineTargetId) => {
    if (ownsRecordingRef.current || recordingPromiseRef.current || finishingRef.current || sending) return;
    if (nextTargetId !== 'ALL' && !trustedPeerIds.includes(nextTargetId)) return;
    setTargetIdState(nextTargetId);
  }, [sending, trustedPeerIds]);

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
    preparing,
    sendSignal,
    sending,
    setTargetId,
    signals: HOUSE_LINE_SIGNALS,
    targetId,
  };
}

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { defaultAiServiceUrl } from '@/src/services/runtime-connections';
import { useConnectionSettingsStore } from '@/src/store/use-connection-settings-store';
import { useHousewireStore } from '@/src/store/use-housewire-store';
import { useHousewireTheme } from '@/src/theme';
import { askGuide } from './guide-client';
import { cleanGuideQuestion, guideReply, type GuideContext, type GuideMechanic, type GuideMessage } from './guide-domain';
import { createGuideHistoryRepository } from './guide-storage';

const history = createGuideHistoryRepository(AsyncStorage);
export interface GuideChatProps {
  runId: string; stageId: string; mechanic: GuideMechanic;
  context?: GuideContext;
  relayUrl?: string | null; roleLabel?: string; title?: string; accent?: string; onQuestion?: () => void;
  open?: boolean; onOpenChange?: (open: boolean) => void; hideLauncher?: boolean;
}

export function GuideChat(props: GuideChatProps) {
  const { theme } = useHousewireTheme();
  const [localOpen, setLocalOpen] = useState(false);
  const open = props.open ?? localOpen;
  const setOpen = (next: boolean) => { setLocalOpen(next); props.onOpenChange?.(next); };
  const close = () => { Keyboard.dismiss(); setOpen(false); };
  const reducedMotion = useHousewireStore(state => state.settings.reducedMotion);
  const accent = props.accent ?? theme.colors.ready;
  return <>
    {!props.hideLauncher ? <Pressable accessibilityRole="button" accessibilityLabel="Ask the guide" accessibilityHint="Ask a question about the puzzle without revealing its solution" onPress={() => setOpen(true)} style={({ pressed }) => [styles.launcher, { borderColor: theme.colors.draft, backgroundColor: theme.colors.surfaceRaised }, pressed && styles.pressed]}>
      <Ionicons name="help-buoy-outline" color={accent} size={22} />
      <View style={styles.launchCopy}>
        <Text style={[styles.launchTitle, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Ask the guide</Text>
        <Text style={[styles.caption, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Questions welcome. No spoilers.</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={accent} />
    </Pressable> : null}
    <Modal animationType={reducedMotion ? 'none' : 'slide'} transparent visible={open} onRequestClose={close}>
      {open ? <GuideConversation key={`${props.runId}:${props.stageId}:${props.roleLabel ?? ''}`} {...props} onClose={close} /> : null}
    </Modal>
  </>;
}

function GuideConversation({ runId, stageId, mechanic, context, relayUrl, roleLabel, title, accent: customAccent, onQuestion, onClose }: GuideChatProps & { onClose: () => void }) {
  const { theme } = useHousewireTheme();
  const insets = useSafeAreaInsets();
  const storedRelay = useHousewireStore(state => state.relayUrl);
  const aiOverride = useConnectionSettingsStore(state => state.aiUrl);
  const relayOverride = useConnectionSettingsStore(state => state.relayUrl);
  const accent = customAccent ?? theme.colors.ready;
  const threadKey = JSON.stringify([runId, stageId, roleLabel ?? 'shared']).slice(0, 599);
  const [messages, setMessages] = useState<GuideMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [retryQuestion, setRetryQuestion] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [saveFailed, setSaveFailed] = useState(false);
  const mounted = useRef(true);
  const requestController = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const baseUrl = useMemo(() => {
    try { return aiOverride || defaultAiServiceUrl(relayUrl ?? storedRelay ?? relayOverride); }
    catch { return undefined; }
  }, [relayUrl, storedRelay, aiOverride, relayOverride]);

  useEffect(() => {
    mounted.current = true;
    void history.get(threadKey).then(saved => { if (mounted.current) setMessages(saved); })
      .catch(() => { if (mounted.current) setNotice('Previous chat could not be loaded. You can still ask a question.'); })
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; requestController.current?.abort(); };
  }, [threadKey]);

  const save = (next: GuideMessage[]) => {
    void history.set(threadKey, next).then(() => { if (mounted.current) setSaveFailed(false); })
      .catch(() => { if (mounted.current) setSaveFailed(true); });
  };
  const send = async (raw: string, retry = false) => {
    const cleaned = cleanGuideQuestion(raw);
    if (!cleaned || loading || lock.current) return;
    lock.current = true; setBusy(true); setNotice(undefined); setRetryQuestion(undefined);
    const previous = retry ? messages.slice(0, -1) : messages;
    const controller = new AbortController(); requestController.current = controller;
    try {
      const response = await askGuide({ question: cleaned, mechanic, context, history: previous.slice(-6).map(item => ({ question: item.question, reply: item.reply ?? guideReply(item.intent, mechanic) })), previousIntents: previous.map(item => item.intent), baseUrl, signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return;
      const next = [...previous, { id: `${Date.now()}-${previous.length}`, question: cleaned, intent: response.intent, source: response.source, reply: response.reply }].slice(-24);
      setMessages(next); setQuestion(''); save(next);
      if (!retry) onQuestion?.();
      if (response.offlineReason) {
        setNotice(response.offlineReason === 'busy' ? 'AI is busy. Your built-in guide answered.' : 'AI is offline. Your built-in guide answered.');
        setRetryQuestion(cleaned);
      }
      if (response.fallbackReason === 'safety') setNotice('That reply risked giving too much away. Try asking about one confusing rule.');
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const textStyle = { color: theme.colors.text, fontFamily: theme.typography.families.body };
  const suggestions = ['Where do we start?', mechanic === 'riddle' ? 'How do we untangle a riddle?' : mechanic === 'route' ? 'How do we describe the map?' : mechanic === 'audio' ? 'What should we listen for?' : 'What should we tell each other?'];
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}>
    <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={[styles.sheet, { backgroundColor: theme.colors.background, paddingBottom: Math.max(12, insets.bottom), marginTop: Math.max(insets.top, 20) }]}>
      <View style={[styles.topline, { borderColor: theme.colors.draft }]}>
        <View style={styles.launchCopy}>
          <Text style={[styles.eyebrow, { color: accent, fontFamily: theme.typography.families.bodyMedium }]}>THE GUIDE · NO SPOILERS</Text>
          <Text numberOfLines={1} style={[styles.heading, { color: theme.colors.text, fontFamily: theme.typography.families.displayHeavy }]}>{title ?? 'A little help?'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close guide" accessibilityHint="Return to your puzzle. Saved messages stay here." onPress={onClose} hitSlop={6} style={({ pressed }) => [styles.close, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.draft }, pressed && styles.pressed]}>
          <Ionicons name="close" size={20} color={theme.colors.text} />
          <Text style={[styles.closeLabel, { color: theme.colors.text, fontFamily: theme.typography.families.bodyMedium }]}>Close</Text>
        </Pressable>
      </View>
      <ScrollView ref={scroll} style={styles.conversationViewport} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.conversation} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        <Text style={[styles.intro, textStyle]}>Ask about a rule, a clue you’re struggling with, or working together. I help you reason—not guess.</Text>
        <Text style={[styles.caption, { color: theme.colors.faint, fontFamily: theme.typography.families.body }]}>GPT uses your current clues and recent chat to offer small hints. These are sent to OpenAI when you ask. Don’t include personal details.</Text>
        {loading ? <ActivityIndicator accessibilityLabel="Loading saved conversation" color={accent} /> : null}
        {messages.map((message, index) => <View key={message.id} style={styles.exchange}>
          <View style={[styles.question, { backgroundColor: theme.colors.surfaceRaised }]}><Text style={[styles.message, textStyle]}>{message.question}</Text></View>
          <View style={[styles.reply, { borderColor: accent }]}>
            <Text style={[styles.source, { color: accent, fontFamily: theme.typography.families.bodyMedium }]}>{message.source === 'ai' ? message.reply ? 'GPT guide' : 'Earlier guided reply' : 'Built-in guide'}</Text>
            <Text accessibilityLiveRegion={index === messages.length - 1 ? 'polite' : 'none'} style={[styles.message, textStyle]}>{message.reply ?? guideReply(message.intent, mechanic, messages.slice(0, index).map(item => item.intent))}</Text>
          </View>
        </View>)}
        {busy ? <View style={styles.pending}><ActivityIndicator color={accent} size="small" /><Text style={[styles.caption, textStyle]}>Checking your question…</Text></View> : null}
        {notice ? <View style={styles.notice}><Text accessibilityLiveRegion="polite" style={[styles.caption, { ...textStyle, color: theme.colors.muted }]}>{notice}</Text>{retryQuestion ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void send(retryQuestion, true)} style={styles.retry}><Text style={[styles.retryText, { ...textStyle, color: accent }]}>Retry AI connection</Text></Pressable> : null}</View> : null}
        {saveFailed ? <Pressable accessibilityRole="button" onPress={() => save(messages)} style={styles.retry}><Text style={[styles.caption, { ...textStyle, color: theme.colors.warning }]}>Chat not saved. Tap to retry.</Text></Pressable> : null}
        {!messages.length && !loading ? <View style={styles.suggestions}>{suggestions.map(item => <Pressable accessibilityRole="button" disabled={busy} key={item} onPress={() => void send(item)} style={[styles.suggestion, { borderColor: theme.colors.draft }]}><Text style={[styles.suggestionText, textStyle]}>{item}</Text><Ionicons name="arrow-up-outline" color={accent} size={17} /></Pressable>)}</View> : null}
      </ScrollView>
      <View style={[styles.compose, { borderColor: theme.colors.draft }]}>
        <TextInput accessibilityLabel="Your question for the guide" editable={!loading && !busy} maxLength={280} placeholder="What’s confusing you?" placeholderTextColor={theme.colors.faint} value={question} onChangeText={setQuestion} returnKeyType="send" onSubmitEditing={() => void send(question)} style={[styles.input, textStyle, { backgroundColor: theme.colors.surfaceRaised }]} />
        <Pressable accessibilityRole="button" accessibilityLabel="Send question" disabled={busy || loading || !question.trim()} onPress={() => void send(question)} style={[styles.send, { backgroundColor: accent }, (busy || loading || !question.trim()) && styles.disabled]}><Ionicons name="arrow-up" color={theme.colors.textInverse} size={23} /></Pressable>
      </View>
      {messages.length ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setMessages([]); setNotice(undefined); setRetryQuestion(undefined); save([]); }} style={styles.clear}><Text style={[styles.caption, { ...textStyle, color: theme.colors.muted }]}>Clear this conversation</Text></Pressable> : null}
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  launcher: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 12 }, launchCopy: { flex: 1 },
  launchTitle: { fontSize: 15, lineHeight: 20 }, caption: { fontSize: 12, lineHeight: 17 }, pressed: { opacity: 0.7 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' }, sheet: { flex: 1, maxHeight: '93%', minHeight: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  topline: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  close: { minWidth: 88, minHeight: 46, flexShrink: 0, paddingHorizontal: 12, borderRadius: 23, borderWidth: 1, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' }, closeLabel: { fontSize: 14, lineHeight: 19 },
  eyebrow: { fontSize: 11, letterSpacing: 1 }, heading: { fontSize: 30, lineHeight: 34 }, conversationViewport: { flex: 1, minHeight: 0 }, conversation: { padding: 22, gap: 13, paddingBottom: 20 }, intro: { fontSize: 16, lineHeight: 23 },
  exchange: { gap: 13, marginTop: 8 }, question: { alignSelf: 'flex-end', borderRadius: 18, borderBottomRightRadius: 4, maxWidth: '92%', padding: 13 },
  reply: { borderLeftWidth: 3, paddingLeft: 13, paddingVertical: 4, gap: 5 }, source: { fontSize: 11, letterSpacing: 0.5 }, message: { fontSize: 16, lineHeight: 23 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 9 }, notice: { gap: 4 }, retry: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' }, retryText: { fontSize: 13, fontWeight: '600' },
  suggestions: { gap: 9, marginTop: 10 }, suggestion: { minHeight: 48, borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, suggestionText: { flex: 1, fontSize: 14, lineHeight: 19 },
  compose: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, borderTopWidth: 1 }, input: { flex: 1, fontSize: 16, height: 50, borderRadius: 16, paddingHorizontal: 14 }, send: { height: 48, width: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }, disabled: { opacity: 0.38 }, clear: { alignItems: 'center', paddingTop: 8, minHeight: 40 },
});

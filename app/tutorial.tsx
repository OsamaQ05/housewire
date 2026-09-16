import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ScreenShell } from '@/src/components/ScreenShell';
import { checkTutorialTrail, placeTutorialStop, TUTORIAL_CLUES, TUTORIAL_STOPS, tutorialOwnsSlot, type TutorialRole } from '@/src/domain/story-tutorial';
import { StoryButton, StoryIconButton, StoryNotice, StoryText, ui } from '@/src/features/story-rooms/story-ui';
import { useHousewireSound } from '@/src/hooks/use-housewire-sound';
import { useHousewireStore } from '@/src/store/use-housewire-store';

const GOLD = '#FFD166';
const MINT = '#6ED8C7';
const BG = '#15223A';

export default function TutorialScreen() {
  const router = useRouter();
  const { play } = useHousewireSound();
  const reducedMotion = useHousewireStore((store) => store.settings.reducedMotion);
  const [page, setPage] = useState<'line' | 'trail' | 'done'>('line');
  const [sent, setSent] = useState(false);
  const [role, setRole] = useState<TutorialRole>('you');
  const [draft, setDraft] = useState<string[]>(['', '', '', '']);
  const [slot, setSlot] = useState<number>();
  const [feedback, setFeedback] = useState('');
  const [tip, setTip] = useState(false);
  const [solved, setSolved] = useState(false);
  const accent = role === 'you' ? MINT : GOLD;
  const close = () => router.replace('/modes');
  const test = () => {
    const result = checkTutorialTrail(draft);
    if (result === 'solved') { setSolved(true); setSlot(undefined); setFeedback('That fits both notes. You found the basket in the shed.'); play('accept', 0.55); }
    else setFeedback(result === 'incomplete' ? 'Fill all four stops first. Switch roles to reach the other spaces.' : result === 'duplicate' ? 'Each place appears once. Compare the repeated stops.' : 'One note does not fit yet. Compare “after” with “immediately before.”');
  };
  const finish = () => { useHousewireStore.getState().finishOnboarding(); useHousewireStore.getState().completeTutorial(); setPage('done'); play('complete', 0.6); };
  const restart = () => { setPage('line'); setSent(false); setRole('you'); setDraft(['', '', '', '']); setSlot(undefined); setFeedback(''); setTip(false); setSolved(false); };

  return <ScreenShell edgeWire="none" texture={false} padded={false} style={{ backgroundColor: BG }}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={ui.spread}><StoryIconButton icon="close" label="Leave tutorial" onPress={close} /><StoryText strong size={12} color={GOLD} style={{ flex: 1, textAlign: 'center' }}>FIRST LIGHT · QUICK PRACTICE</StoryText><StoryText size={12}>{page === 'line' ? '1 / 2' : page === 'trail' ? '2 / 2' : 'DONE'}</StoryText></View>
      <Animated.View key={page} entering={reducedMotion ? undefined : FadeIn.duration(200)} style={{ gap: 22 }}>
        {page === 'line' ? <>
          <View style={styles.hero}><Ionicons name="radio-outline" size={62} color={GOLD} /><StoryText display size={44}>Keep the line open.</StoryText><StoryText size={17}>Different rooms? House Line carries your clues as voice notes—to everyone or one teammate.</StoryText></View>
          <View style={styles.line}><StoryText strong color={MINT}>A tiny example</StoryText>{sent ? <><View style={[styles.message, { alignSelf: 'flex-end', borderColor: GOLD }]}><StoryText strong size={12} color={GOLD}>YOU · KITCHEN</StoryText><StoryText>My note says the garden came after the kitchen. What do you have?</StoryText></View><View style={[styles.message, { borderColor: MINT }]}><StoryText strong size={12} color={MINT}>PARTNER · PORCH</StoryText><StoryText>The garden was immediately before the porch. Let’s compare the whole trail.</StoryText></View></> : <StoryNotice>Try sending a sample clue. This tutorial does not record your microphone.</StoryNotice>}</View>
          {!sent ? <StoryButton label="Send the example clue" icon="radio-outline" accent={GOLD} onPress={() => { setSent(true); play('relay', 0.4); }} /> : <StoryButton label="Try a shared puzzle" icon="arrow-forward" accent={GOLD} onPress={() => { setPage('trail'); play('switch', 0.3); }} />}
          <StoryText size={12} color="#B4C7D0">Example messages only. In a real room, open House Line: tap to record, then tap again to stop and send.</StoryText>
        </> : page === 'trail' ? <>
          <View style={{ gap: 7 }}><StoryText display size={42}>Follow the basket.</StoryText><StoryText>The picnic basket visited four places. Rebuild its trail from your two private notes.</StoryText></View>
          <View style={styles.roles}>{(['you', 'partner'] as const).map((item) => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Read ${item === 'you' ? 'your' : 'Partner’s'} clue`} accessibilityState={{ selected: role === item }} onPress={() => { setRole(item); setSlot(undefined); setTip(false); play('switch', 0.2); }} style={[styles.role, { borderColor: role === item ? (item === 'you' ? MINT : GOLD) : '#42516B', backgroundColor: role === item ? '#243950' : '#1C2C43' }]}><Ionicons name="person-circle-outline" size={25} color={item === 'you' ? MINT : GOLD} /><StoryText strong>{item === 'you' ? 'You' : 'Partner'}</StoryText></Pressable>)}</View>
          <View style={[styles.note, { borderColor: accent }]}><View style={ui.row}><Ionicons name="document-text-outline" size={21} color={accent} /><StoryText strong color={accent}>{role === 'you' ? 'Your' : 'Partner’s'} private note</StoryText></View>{TUTORIAL_CLUES[role].map((line) => <StoryText key={line} size={17}>{line}</StoryText>)}</View>
          <View style={ui.spread}><StoryText strong>The shared trail</StoryText><StoryText size={12} color={accent} style={{ flex: 1, textAlign: 'right' }}>You control the {role === 'you' ? 'mint' : 'gold'} spaces</StoryText></View>
          <View style={styles.board}>{draft.map((value, index) => {
            const owned = tutorialOwnsSlot(role, index);
            const stop = TUTORIAL_STOPS.find((item) => item.id === value);
            const color = index % 2 === 0 ? MINT : GOLD;
            return <Pressable key={index} accessibilityRole="button" accessibilityLabel={`${['First', 'Second', 'Third', 'Last'][index]} stop, ${stop?.label ?? 'empty'}, ${index % 2 === 0 ? 'You' : 'Partner'} controls this`} accessibilityState={{ disabled: !owned || solved, selected: slot === index }} disabled={!owned || solved} onPress={() => setSlot(index)} style={[styles.space, { borderColor: color, borderWidth: slot === index ? 3 : 1, opacity: owned || solved ? 1 : 0.67 }]}><View style={ui.spread}><StoryText size={11} color={color}>{['FIRST', 'SECOND', 'THIRD', 'LAST'][index]}</StoryText>{!owned && !solved ? <Ionicons name="lock-closed-outline" size={13} color={color} /> : null}</View><Ionicons name={stop?.icon ?? 'add-circle-outline'} size={29} color={color} /><StoryText strong>{stop?.label ?? 'Choose a place'}</StoryText><StoryText size={11} color="#B4C7D0">{index % 2 === 0 ? 'You' : 'Partner'}</StoryText></Pressable>;
          })}</View>
          {slot !== undefined && !solved ? <Modal transparent visible animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => setSlot(undefined)}><View style={ui.sheetBackdrop}><Pressable accessibilityRole="button" accessibilityLabel="Close place picker" onPress={() => setSlot(undefined)} style={StyleSheet.absoluteFill} /><View accessibilityViewIsModal style={ui.sheet}><View style={ui.spread}><StoryText strong size={20}>{['First', 'Second', 'Third', 'Last'][slot]} stop</StoryText><StoryIconButton label="Close choices" icon="close" onPress={() => setSlot(undefined)} /></View><StoryText color={accent}>Which place fits the notes?</StoryText><View style={styles.options}>{TUTORIAL_STOPS.map((stop) => <Pressable key={stop.id} accessibilityRole="button" accessibilityLabel={`Place ${stop.label}`} onPress={() => { setDraft((old) => placeTutorialStop(old, role, slot, stop.id)); setSlot(undefined); setFeedback(''); play('switch', 0.3); }} style={styles.option}><Ionicons name={stop.icon} color={accent} size={21} /><StoryText>{stop.label}</StoryText></Pressable>)}</View></View></View></Modal> : null}
          <StoryText size={13} color="#B4C7D0">Switch between You and Partner to try both roles. With two phones, each person moves only their own pieces.</StoryText>
          {feedback ? <StoryNotice>{feedback}</StoryNotice> : null}
          {solved ? <StoryButton label="Finish practice" icon="checkmark" accent={GOLD} onPress={finish} /> : <><StoryButton label="Test the full trail" icon="checkmark-circle-outline" accent={accent} onPress={test} /><StoryButton label={tip ? 'Hide practice tip' : 'Need a practice tip?'} secondary onPress={() => setTip((value) => !value)} />{tip ? <StoryNotice>Read both notes. “Immediately before” means two stops must sit next to one another. Start with the only place explicitly named as first.</StoryNotice> : null}</>}
          <StoryText size={12} color="#9BADBF">No clock or penalties in practice. Full cases have one shared limit of 3–5 wrong plans. Guide chat helps when you ask.</StoryText>
        </> : <>
          <View style={styles.hero}><View style={styles.basket}><Ionicons name="basket-outline" size={70} color={GOLD} /></View><StoryText display size={46}>Different clues.{`\n`}One team.</StoryText><StoryText size={18}>You compared private notes and used both roles to finish the trail. That’s how a HOUSEWIRE case works.</StoryText></View>
          <StoryButton label="Choose a game" icon="arrow-forward" accent={GOLD} onPress={close} /><StoryButton label="Try the tutorial again" icon="refresh" secondary onPress={restart} />
          <StoryNotice>Keep your clues private, describe what you notice, and test the plan together.</StoryNotice>
        </>}
      </Animated.View>
    </ScrollView>
  </ScreenShell>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 26 }, hero: { gap: 18, paddingVertical: 16 },
  line: { gap: 14 }, message: { padding: 16, gap: 8, borderLeftWidth: 3, backgroundColor: '#203149', maxWidth: '92%' },
  roles: { flexDirection: 'row', gap: 12 }, role: { flex: 1, borderWidth: 2, borderRadius: 17, padding: 14, flexDirection: 'row', gap: 9, alignItems: 'center' },
  note: { borderLeftWidth: 3, padding: 17, gap: 13, backgroundColor: '#1C3048', borderRadius: 10 },
  board: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, space: { width: '47%', minHeight: 145, padding: 14, backgroundColor: '#203149', borderRadius: 16, gap: 10 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { width: '47%', minHeight: 48, padding: 9, backgroundColor: '#2B405B', borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  basket: { width: 118, height: 118, borderRadius: 30, backgroundColor: '#243B50', alignItems: 'center', justifyContent: 'center' },
});

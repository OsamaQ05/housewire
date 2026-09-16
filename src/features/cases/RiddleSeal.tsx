import { Ionicons } from '@expo/vector-icons';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { matchesSealRiddle, sealRiddle } from '@/src/domain/seal-riddles';
import { useHousewireTheme } from '@/src/theme';

const PuzzleAttemptContext = createContext<(() => void) | undefined>(undefined);
export function PuzzleAttemptProvider({ onMistake, children }: { onMistake(): void; children: ReactNode }) {
  return <PuzzleAttemptContext.Provider value={onMistake}>{children}</PuzzleAttemptContext.Provider>;
}

/** Accessible word-based replacement for the former unconditional pressure contact. */
export function RiddleSeal({ accent, puzzleKey, onComplete, waitForCrew = false }: { accent: string; puzzleKey: string; onComplete: () => void; waitForCrew?: boolean }) {
  const { theme } = useHousewireTheme();
  const reportMistake = useContext(PuzzleAttemptContext);
  const [mistakes, setMistakes] = useState(0);
  const [answer, setAnswer] = useState('');
  const [wrong, setWrong] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [solved, setSolved] = useState(false);
  const finished = useRef(false);
  useEffect(() => { setMistakes(0); setAnswer(''); setWrong(false); setRetryAt(0); setRemaining(0); setSolved(false); finished.current = false; }, [puzzleKey]);
  useEffect(() => {
    if (!retryAt) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000)));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [retryAt]);
  const submit = () => {
    if (finished.current || (!reportMistake && mistakes >= 5) || Date.now() < retryAt || !answer.trim()) return;
    if (matchesSealRiddle(puzzleKey, answer)) { if (waitForCrew) { setSolved(true); setWrong(false); } else { finished.current = true; onComplete(); } }
    else { setWrong(true); setMistakes(n => n + 1); setRetryAt(Date.now() + 5_000); reportMistake?.(); }
  };
  if (!reportMistake && mistakes >= 5) return <View style={[styles.seal, { borderColor: accent }]}><Text style={[styles.clue, { color: theme.colors.text }]}>No tries left</Text><Text style={[styles.help, { color: theme.colors.text }]}>The word was {sealRiddle(puzzleKey).answers[0]}. Read the clue again and see how it fits.</Text></View>;
  if (solved) return <View style={[styles.seal, { borderColor: accent, backgroundColor: theme.colors.surface }]}><Ionicons name="checkmark-circle-outline" size={34} color={accent} /><Text style={[styles.clue, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>Your word is found.</Text><Text style={[styles.help, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Wait until everyone has solved their seal. Count down, then unlock together.</Text><Pressable accessibilityRole="button" onPress={() => onComplete()} style={[styles.button, { backgroundColor: accent }]}><Text style={[styles.buttonText, { fontFamily: theme.typography.families.bodyMedium }]}>Unlock my seal</Text><Ionicons name="lock-open-outline" color="#09100E" size={22} /></Pressable></View>;
  return <View style={[styles.seal, { borderColor: accent, backgroundColor: theme.colors.surface }]}>
    <View style={styles.heading}><Ionicons color={accent} name="key-outline" size={25} /><Text style={[styles.eyebrow, { color: accent, fontFamily: theme.typography.families.monoMedium }]}>THE WORD SEAL</Text></View>
    <Text style={[styles.clue, { color: theme.colors.text, fontFamily: theme.typography.families.storyBold }]}>{sealRiddle(puzzleKey).clue}</Text>
    <Text style={[styles.help, { color: theme.colors.muted, fontFamily: theme.typography.families.body }]}>Read it to your family. Agree on a word, then try the seal.</Text>
    <TextInput accessibilityLabel="Answer to the word seal" autoCorrect={false} autoCapitalize="none" maxLength={48} returnKeyType="done" onSubmitEditing={submit} onChangeText={setAnswer} value={answer} placeholder="Our answer…" placeholderTextColor={theme.colors.faint} style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.draft, fontFamily: theme.typography.families.bodyMedium }]} />
    <Pressable accessibilityRole="button" disabled={remaining > 0 || !answer.trim()} onPress={submit} style={[styles.button, { backgroundColor: accent, opacity: remaining > 0 || !answer.trim() ? 0.45 : 1 }]}><Text style={[styles.buttonText, { fontFamily: theme.typography.families.bodyMedium }]}>{remaining ? `Re-read together · ${remaining}s` : 'Open the word seal'}</Text><Ionicons name="lock-open-outline" size={20} color="#09100E" /></Pressable>
    {wrong ? <Text accessibilityLiveRegion="polite" style={[styles.help, { color: theme.colors.warning, fontFamily: theme.typography.families.body }]}>That word does not fit. Check every part of the riddle.</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  seal: { borderWidth: 1.5, borderRadius: 20, padding: 18, gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eyebrow: { fontSize: 11, letterSpacing: 1.4 },
  clue: { fontSize: 22, lineHeight: 29 },
  help: { fontSize: 13, lineHeight: 19 },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 52, paddingHorizontal: 13, fontSize: 17 },
  button: { minHeight: 52, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13 },
  buttonText: { color: '#09100E', fontSize: 15 },
});

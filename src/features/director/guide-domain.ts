import { z } from 'zod';

export const GUIDE_MECHANICS = ['riddle', 'route', 'audio', 'camera', 'sequence', 'deduction', 'coordination', 'defusal'] as const;
export const GUIDE_INTENTS = ['start', 'explain', 'teamwork', 'contradiction', 'verify', 'wordplay', 'scan', 'listen', 'order', 'map', 'retry', 'spoiler', 'simpler', 'stuck'] as const;
export type GuideMechanic = typeof GUIDE_MECHANICS[number];
export type GuideIntent = typeof GUIDE_INTENTS[number];

export const guideContextSchema = z.object({
  title: z.string().max(200),
  objective: z.string().max(1200),
  role: z.string().max(100),
  clues: z.array(z.string().max(1800)).max(20),
  progress: z.string().max(1000),
}).strict();
export type GuideContext = z.infer<typeof guideContextSchema>;
const exchangeSchema = z.object({ question: z.string().max(280), reply: z.string().max(1600) }).strict();

export const guideRequestSchema = z.object({
  protocolVersion: z.literal(1),
  question: z.string().trim().min(1).max(280),
  mechanic: z.enum(GUIDE_MECHANICS),
  previousIntents: z.array(z.enum(GUIDE_INTENTS)).max(6),
  context: guideContextSchema.optional(),
  history: z.array(exchangeSchema).max(6).optional(),
}).strict();
export type GuideRequest = z.infer<typeof guideRequestSchema>;
export const guideResponseSchema = z.object({
  protocolVersion: z.literal(1), intent: z.enum(GUIDE_INTENTS), source: z.enum(['ai', 'local']),
  reply: z.string().trim().min(1).max(1600).optional(),
  fallbackReason: z.enum(['unavailable', 'busy', 'safety', 'not-configured']).optional(),
}).strict();
export type GuideResponse = z.infer<typeof guideResponseSchema>;

export function cleanGuideQuestion(question: string): string {
  return question.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
}

/** Only explicitly selected current-role material; never serialize a whole game. */
export function makeGuideRequest(question: string, mechanic: GuideMechanic, previousIntents: readonly GuideIntent[] = [], context?: GuideContext, history?: { question: string; reply: string }[]): GuideRequest {
  return guideRequestSchema.parse({ protocolVersion: 1, question: cleanGuideQuestion(question), mechanic, previousIntents: previousIntents.slice(-6), ...(context ? { context } : {}), ...(history ? { history: history.slice(-6).map(item => ({ question: cleanGuideQuestion(item.question), reply: item.reply.slice(0, 1600) })) } : {}) });
}

export function classifyGuideQuestion(request: GuideRequest): GuideIntent {
  const q = cleanGuideQuestion(request.question).toLowerCase();
  if (/ignore.{0,40}(instruction|rule)|system prompt|developer message|jailbreak|pretend|roleplay|answer key|solve it|solution|spoiler|tell me (the|which)|give (me|us).{0,25}(answer|code|order)|what('s| is) the (answer|code)|which (wire|symbol|button).{0,20}(cut|press|choose)|reveal/.test(q)) return 'spoiler';
  if (/is .{1,70}(right|correct)|am i right|check (my|our)|confirm|yes or no|did (i|we) get/.test(q)) return 'verify';
  if (/simpler|simple|rephrase|plain english|again|don't understand|do not understand|confus|what do you mean|mean by|too hard/.test(q)) return 'simpler';
  if (/doesn.t work|not work|wrong|fail|rejected|retry|try again/.test(q)) return 'retry';
  if (/contradict|disagree|impossible|doesn.t match|two (possible|answers)|both fit|several/.test(q)) return 'contradiction';
  if (/camera|qr|scan|permission/.test(q)) return 'scan';
  if (/hear|sound|audio|tone|volume|listen|rhythm/.test(q)) return 'listen';
  if (/map|path|route|cell|room|grid|door|neighbor/.test(q)) return 'map';
  if (/team|partner|role|other (phone|player)|talk|communicat|describe|tell them|say to/.test(q)) return 'teamwork';
  if (/order|sequence|before|after|arrang|first.*last/.test(q)) return 'order';
  if (/riddle|metaphor|wordplay|literal|figurative|poem/.test(q)) return 'wordplay';
  if (/start|begin|first step|where do/.test(q)) return 'start';
  if (/rule|how (do|does|to)|what (do|does)|expected|work/.test(q)) return 'explain';
  return 'stuck';
}

const START: Record<GuideMechanic, string> = {
  riddle: 'Read the riddle aloud once. Pick out what it does and what it cannot do. Look for an interpretation that fits both—not just one clever word.',
  route: 'Find the named start and finish. Ask each person to describe one doorway or restriction. Build one connected route together before entering it.',
  audio: 'Let the listener replay the signal. Describe its rhythm or relative pitch in words, then ask the rule-reader how those observations should be used.',
  camera: 'Work out who holds the marker and who scans it. Read the clue that identifies the right marker before opening the camera.',
  sequence: 'Collect the ordering rules first. Place anything with a definite position, then fit the remaining pieces around it. Check every rule before submitting.',
  deduction: 'Separate observations from guesses. Have each player share one fact their screen actually shows, then look for the option that satisfies all the facts.',
  coordination: 'Agree who reads the rule, who observes, and who acts. Say the planned sequence out loud and have somebody repeat it back before anyone acts.',
  defusal: 'Keep the roles separate: describe the module, read the matching manual rule, then interpret the riddle. Agree on the reason for your choice before committing it.',
};

const COACHING: Record<GuideIntent, string> = {
  start: '', explain: '', stuck: '',
  teamwork: 'Describe what you can see without guessing what it means. Ask your partner for the rule that connects to it. Repeat their instruction back before acting.',
  contradiction: 'Take one candidate at a time. Ask which exact sentence rules it out. If two still fit, you are probably missing a condition from another role—not a lucky guess.',
  verify: 'I won’t confirm guesses. Check your candidate against every clue, then ask a teammate to try to disprove it. A match should explain the whole clue, not just part.',
  wordplay: 'Try the literal meaning first, then a figurative one. Words about speaking, travelling or holding can describe objects too. Which interpretation fits every line?',
  scan: 'Keep both phones still, brighten the marker screen, and fit the whole marker in the camera frame. If permission is unavailable, use the visible manual option; the clue still needs solving.',
  listen: 'Replay once for the overall pattern, then once for the differences. Say short/long or low/high consistently. Let a teammate check your transcription against their rule.',
  order: 'Translate each instruction into a relationship: before, after, beside, first or last. Fix the most constrained piece first, then check every relationship again.',
  map: 'Use room names when speaking, not cell numbers. Start at the marked entrance, connect only neighboring rooms, and check each doorway against the other player’s map.',
  retry: 'Pause before another attempt. Read the feedback, check the input format and compare your plan against the clues. Change one reasoned detail—not several random choices.',
  spoiler: 'I can help with the method, but I won’t give or confirm the solution. Ask about a confusing rule, how to compare clues, or what to discuss with your teammate.',
  simpler: 'One small step: say what you know for certain. Ask your teammate for one fact you do not have. Use those two facts to rule something out.',
};

/** Offline-only coaching, also used to render legacy saved messages. */
export function guideReply(intent: GuideIntent, mechanic: GuideMechanic, previousIntents: readonly GuideIntent[] = []): string {
  if (intent === 'start' || intent === 'explain') return START[mechanic];
  if (intent === 'stuck') return previousIntents.includes('stuck') ? COACHING.contradiction : START[mechanic];
  if (intent === 'simpler' && previousIntents.includes('simpler')) return 'Ask a teammate to describe just one thing on their screen. Repeat it back in your own words. Which of your clues refers to that same thing?';
  return COACHING[intent];
}

export function guideMechanicFor(kind: string): GuideMechanic {
  if (/riddle/.test(kind)) return 'riddle';
  if (/route|map|maze/.test(kind)) return 'route';
  if (/audio|tone|whisper|rhythm|sound/.test(kind)) return 'audio';
  if (/camera|lens|marker|courier|scan/.test(kind)) return 'camera';
  if (/sequence|order|cipher|memory/.test(kind)) return 'sequence';
  if (/motion|sync|contact|finale|answer/.test(kind)) return 'coordination';
  return 'deduction';
}

export const guideMessageSchema = z.object({
  id: z.string().max(120), question: z.string().max(280), intent: z.enum(GUIDE_INTENTS), source: z.enum(['ai', 'local']),
  reply: z.string().max(1600).optional(),
});
export type GuideMessage = z.infer<typeof guideMessageSchema>;
export function parseGuideHistory(value: string | null): GuideMessage[] {
  try { return z.array(guideMessageSchema).max(24).parse(JSON.parse(value ?? '[]')); } catch { return []; }
}

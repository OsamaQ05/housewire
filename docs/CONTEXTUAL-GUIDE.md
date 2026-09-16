# Contextual GPT guide · 14 September 2026

The connected guide now returns GPT-5.4's actual written reply, not a selected template. Requests contain the current question, explicitly selected current-role puzzle clues/rules/progress, and the last six question/reply pairs. The model receives no full game object, answer-key field, seed, future stages or automatic teammate-private material. It cannot submit game actions.

## Flow and spoiler protection

1. A bounded, strict request is validated server-side.
2. GPT writes a short, conversational answer under no-spoiler instructions. It may explain controls, clarify a clue, ask a focused question, or offer one small hint. It must not confirm guesses, name a riddle answer, reveal an exact sequence, or reconstruct teammates' private information.
3. A separate model call reviews the proposed reply alongside current clues and recent conversation. Unsafe or malformed output is withheld. A small additional check rejects obvious reassurance of a guessed answer.
4. The phone displays and saves the actual reviewed reply. No model-supplied markup, links, or actions are executed.

The spoiler review produces a boolean decision, NOT a choice of response templates. The reply-writing model is free to phrase its response. Automated review is a mitigation, not a mathematical guarantee against every indirect spoiler or prompt injection. Normal hints necessarily reduce difficulty.

## Availability and privacy

No key/network, provider failures, timeouts and rate limits fall back to explicitly labelled Built-in guide coaching. Safety fallbacks have a separate explanation. The API timeout is 30 seconds total for generation plus review; the client allows 35 seconds. The endpoint keeps a 12-request/minute/client limit and four concurrent requests.

Failures log only a reason and optional HTTP status, never API keys, questions, clues or provider response bodies. The key remains in server `.env`. Requests use `store: false`; this is not a claim of zero provider logging. The UI tells players that current clues and recent text are sent to OpenAI. Local history is bounded and clearable; clearing it does not delete provider logs.

## Context coverage

- Last Light: the current role's actual module material, device options/indicator, manual or witness clues, strikes, feedback and reader readiness. Other-role content remains private. Selected taps and camera/audio streams are not sent.
- Case Forge: current stage story/instructions and audience-filtered clues, excluding solution fields and raw audio/marker tokens.
- Circuit Race: current station rules and visible riddle text, excluding hidden answer-glyph fields; unavailable sensory observations require a question to the player.
- Authored legacy rooms: current stage rules and selected role-specific clue fragments/word seals. Not every transient camera/audio sub-state is represented; the guide is instructed to ask for missing details, not invent them.

## Verification

`scripts/check-live-guide.ts` is an explicit opt-in paid smoke test; it loads the existing server-only key and runs an ephemeral local server. It checked real GPT responses for the Last Light disabled Lock question, a contextual follow-up, a riddle hint, an encoded-solution request, and a guess-confirmation request. The final run passed. An earlier run exposed overly reassuring guess language; the instructions and output check were tightened before rerunning.

Unit coverage includes actual free-text transport, recent chat, role projection, hidden answer exclusion, saved reply migration, reviewer rejection/fail-closed behavior, request bounds, provider failures, rate limits and timeouts. See the handoff for final regression/build results.

Final executed checks: 49 test files / 428 tests passed; TypeScript and Expo lint passed; Expo web export passed (Metro discarded an unreadable cache and rebuilt successfully). Browser verification on that export displayed a real contextual GPT reply about the current MOON badge, followed a question about solo seats, and preserved both replies after closing/reopening chat. No browser error logs were recorded. Physical-phone keyboard/network behavior was not tested on a real device in this pass.

API implementation reference: [OpenAI Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create).

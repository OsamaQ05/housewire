# Gameplay upgrade verification · 14 September 2026

> This records the earlier gameplay pass. For the subsequent free-text GPT guide update, see [CONTEXTUAL-GUIDE.md](./CONTEXTUAL-GUIDE.md).

## Executed checks

| Check | Result |
| --- | --- |
| `npm run test` | 48 test files, 418 tests passed in the final regression |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no warnings |
| `npm run export:web` | Passed, including `/defusal` among 33 static routes |
| `npm run export:android` | Passed, Hermes bundle produced |
| `npx expo export --platform ios --output-dir dist-ios` | Passed, iOS bundle produced |
| `npx expo export --output-dir dist-web` | Final combined Android, iOS and web export passed after the intercom timestamp fix |
| `git diff --check` | Passed; Git emits existing LF/CRLF conversion notices |
| `npx expo-doctor` | 20/21 passed. Eighteen installed Expo 57 packages have newer recommended patch releases; no major-version mismatch. Versions were not changed as part of the puzzle update. |

The first full regression run found an incorrect stage-ID argument in a new test. That test was corrected, then the entire suite was rerun successfully. Android export reported an unreadable Metro cache and automatically rebuilt it successfully. The development server was subsequently restarted with `--clear`.

## Interaction checks actually performed

- At a 390 × 844 browser viewport, opened Last Light, completed the learning circuit, then played the full four-module case through sockets, leads, the landmark map, and the final earned-seal phrase. All four advanced normally with zero strikes.
- Inspected the drawn selected route and named landmarks visually. Role switching showed distinct device/manual/witness material. Submitted a mixed-case final phrase successfully.
- Opened Family Club: both practice records appeared in History and did not add leaderboard wins.
- Guide: opened from an existing case, asked a question, requested the exact answer and received a refusal, then reopened the locally saved conversation. No console errors during these completed flows.
- Live configured `/guide/chat` returned `{ "protocolVersion": 1, "source": "ai", "intent": "teamwork" }` for a synthetic question. This proves the configured model path executed, not that a free-form model answer was displayed.
- `tests/defusal-relay.integration.test.ts` starts an actual WebSocket relay and three independent clients. It covers joining, role-private packets, rejecting reader commits, all four module transitions, a disconnected Witness reconnecting with resume credentials, and terminal results on both guest clients. It asserts no answer/seed leakage or public broadcast frames.
- Domain tests cover 1,000 seeds, readiness, complete-answer validation, cooldown, strikes, expiry, duplicate/stale actions and persistence identity checks.
- Two isolated browser origins running the production web export successfully joined a live room. The host saw only the device; the second player saw the combined manual/Witness pages. A correct answer submitted before reader readiness was safely rejected without a strike; after readiness, both players advanced to module two together. The final UI now disables the lock button until readers are ready.
- Live intercom testing exposed a fractional-clock timestamp rejection in the existing shared communication hook. Added `houseLineTimestamp` and regressions for fractional offsets, safe bounds and all message kinds. Rebuilt all platforms and retested on two fresh browser sessions: the sender showed **DELIVERED 1/1**, the host displayed **INCOMING · Witness QA · Repeat that**, and the sender console had no errors. Microphone recording itself was not exercised.

## Boundaries of verification

An initial two-browser UI check became unresponsive during development-server rebuilding. This was recovered by serving the actual production export on local-only QA ports; the two-player UI and signal checks above then passed. Physical Expo Go phones, camera scanning, voice recording/playback and real multi-room Wi-Fi remain unverified in this session. There is no iOS simulator on this Windows host.

Live rooms require the relay and the host game screen to remain available. Transport credentials support connection interruptions in the current app process; a cold app restart may require creating a fresh room. Offline practice is durably saved. Local Family Club history is not cloud-synchronized. The older rooms' compatibility contact envelopes remain client-gated word seals; Last Light uses host-authoritative answers.

## Artwork

`assets/art/last-light-case.png` is original generated artwork produced for this update, not an online stock/game screenshot. Prompt direction: a warm, cinematic coastal lighthouse workshop, a fictional mint-enamel/brass puzzle apparatus, a paper manual and riddle cards, navy/teal/amber/parchment palette, no text or logos. It is setting art only: every control, map and clue page is rendered as actual application UI.

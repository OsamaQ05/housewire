# Limited attempts and longer recordings

Wrong submitted answers now consume a finite run-wide budget. Permission refusals, dropped connections, requests for help and incomplete input are not intended to count as wrong answers. A new run resets its own budget; reopening a saved run does not grant extra lives.

| Game | Wrong answers allowed |
| --- | --- |
| Last Light | 3; first-circuit tutorial 5 |
| Case Forge | 5 |
| Circuit Race | 4 per team |
| Line 13 | 3 |
| Dead Air / Night Glass | 4 |
| The Long Table | 5 |

Family Frequency already commits one prediction per player/round and then reveals the answer; it is not a retry puzzle.

Exhaustion ends the run. Authored timed rooms also end on timeout rather than granting unlimited overtime. Missed/unfinished puzzle answers are shown on the terminal review screen. Last Light and live Forge only project reviews after the cooperative game has failed. Circuit Race withholds review until the entire race ends, so a failed team cannot obtain the remaining shared answers while another team is still playing. Failed runs are not scored as wins.

## Voice

House Line supports 30-second voice notes: tap record, tap stop/send, or cancel. It automatically finishes at the cap. Duration metadata represents actual recorded length, not an artificial 1.9-second clamp. Audio bytes and relay frame bounds have been adjusted together. Notes remain recipient-scoped; longer duration does not widen their audience.

The Dead Air one-word challenge gives six seconds after microphone permission is granted. This is separate from the 30-second communication notes.

The relay must be restarted after this update for its new payload limits. All phones should reload the updated app because multiplayer snapshot fields and audio limits changed together. Automated payload/routing tests do not replace a real-device microphone test.

## Validation — 14 September 2026

- Full suite: `npm test` — 55 files, 463 tests passed.
- `npm run typecheck` and `npm run lint` passed.
- Final web export passed, including all 33 routes.
- iOS JavaScript/Hermes export passed (2,387 modules). This is a bundle sanity check, not a physical-device or native App Store build test.
- Browser runtime: made three incorrect Last Light submissions; the third ended the case and displayed all four remaining solutions. Reloading after two strikes preserved the count; reloading after failure kept the run closed. An expired saved tutorial also showed its missed solution. No browser console errors or warnings were observed in this flow.
- Relay integration tests delivered the maximum-size 30-second voice payload only to its intended recipient. Recording cancellation tests cover disabled/leaving-game and pending asynchronous work.
- The LAN relay was restarted with the updated limits; Expo and the relay health checks responded successfully.
- Not physically verified: recording and listening to a 30-second note on real iOS/Android phones. Browser/runtime checks and transport tests do not claim this coverage.

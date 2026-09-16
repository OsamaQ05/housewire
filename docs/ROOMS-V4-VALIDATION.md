# Authored rooms v4 — validation

Automated validation completed on **16 September 2026**, after the marble-success latch regression fix, room-picker race fix, narrow-screen touch-target improvements, latest copy changes, and `expo-build-properties` update to `~57.0.19`.

## Executed checks

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0 |
| `npm test -- --maxWorkers=2` | **912/912 tests passed across 87 files**, exit 0; 36.57 seconds |
| `npx vitest run tests/case-rail-selection.test.ts tests/story-catalog.test.ts tests/case-artwork.test.ts --maxWorkers=2` | **67/67 tests passed across 3 files**, exit 0 |

The room-picker regressions verify that an explicit case tap wins over stale scroll/animation events, immediate launch reads the latest synchronous selection, and a fresh user swipe can still select another case. The picker uses 44×44 touch targets around its decorative dots; the narrow-screen host action uses the short “Host” label. Typecheck, lint and the full suite above were rerun after these changes. Rendered-browser verification remains separately recorded below.

## Rooms and multiplayer

The three authored rooms each contain **four levels**:

- **After Hours:** miniature-town switchboard, delivery route, workbench controls, cooperative crane delivery.
- **Barjeel:** shared glass picture, search-and-combine tool activity, past/present courtyard, daylight reader.
- **The Long Table:** guest photograph, table-object riddles, working marble machine, illustrated envelopes.

Nine integration scenarios complete every level of every room through an actual local WebSocket relay: **three rooms × two, three, and four clients**. They use real activity moves, not pre-filled success flags. The tests verify distributed controls, rejection of another player's edits (including the host), synchronized progress and final state, private glass layers, immediate first rotations, and shared-image updates.

Additional tests cover strict activity schemas, sender authentication, duplicate actions, bounded inputs, saved-state compatibility, content version 4, reveal/continue, and current-role guide context. Physical activities require their actual completion condition; an empty arrangement answer cannot finish them. Experimenting does not consume deduction attempts. Revealing preserves the assisted-history distinction.

## Independent physical-state audit

- Exhaustive reachable-world exploration for the crane, past/present courtyard and search/inventory activity verifies that every reachable physical configuration retains a route to completion. Feedback text and diagnostic counters are excluded from the physical-world identity; this is not an exhaustive exploration of counter values.
- All **1,225 marble configurations** produce finite, schema-valid simulation results. Multiple working builds exist, and every working build requires all four controls to differ from their initial settings.
- A successful marble run is latched: later adjustments or releases from any teammate cannot erase that success while its replay is displayed.

## Scope

These are automated Node/TypeScript and local-network checks. They do **not** claim physical iPhone/Android testing, native permission testing, camera/microphone behavior, or installation of a new APK. Browser walkthroughs, exports and Expo Doctor are separate checks to be recorded below by the runtime reviewer.

## Runtime and export checks

- `npx expo export --platform all --output-dir dist-story-rooms --max-workers 2`: passed for iOS, Android and web, including all 33 static web routes. Rerun after the final picker fix also exited 0; Metro recovered from an unreadable cache by performing a full crawl.
- `npx expo-doctor`: initially found an `expo-build-properties` patch mismatch. Installed the compatible `~57.0.19` patch; rerun passed **21/21** checks.
- Played every chapter of each room in the rendered web app: **12/12 chapters**, using both rehearsal viewpoints, with **four solved / zero revealed** for each final result. No answer injection or hidden state manipulation was used.
- Verified free failed marble and dark-wall experiments, actual tool combinations, crane hand-offs, courtyard changes, and completion controls. Reloaded the completed After Hours run and the in-progress Long Table run to verify persistence.
- Reviewed scenes at 390-pixel width and the marble machine/finale and Barjeel glass at 320 pixels. A browser-tool timeout occurred during resizing; reconnecting recovered the same intact game state. The application console reported no warnings/errors in the inspected run. The guide’s close button and reveal-confirmation/assisted-continuation flow were also exercised.
- Browser review found and fixed a narrow-screen room-picker selection issue. At 320 pixels, selecting a room and immediately starting now opened the correct Barjeel, After Hours and Long Table briefings. Switching Barjeel to Long Table immediately before starting also opened Long Table. The final inspected browser console had no warnings/errors. The temporary viewport override was reset after review.
- Restarted Expo and the relay on the current Wi-Fi (`10.215.148.186`). The relay health endpoint reported `status: ok`, `aiConfigured: true`, `model: gpt-5.4`. This configuration check is not a live-model response test.
- Both iOS and Android Expo manifests report `exposdk:57.0.0`. Requested each live Hermes development bundle over the Wi-Fi address: both returned HTTP 200 (approximately 14.7 MB iOS and 15.0 MB Android). This warms the packager but is not a substitute for scanning on physical phones.

`npm audit --omit=dev --json` reports **14 moderate**, zero high and zero critical advisories in the dependency tree, including transitive Expo tooling and query-string dependencies. No forced downgrade/major-version audit fix was applied during a game-content update. This remains separate from Expo Doctor passing.

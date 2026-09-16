# Escape rooms v5 — executed validation

Scope: After Hours (five chapters), Barjeel (four), The Long Table (four); authored content version **5**. All chapters support **two, three or four players**. This log distinguishes automated clients, browser play and untested physical devices.

## Final checks

| Check | Executed result |
| --- | --- |
| `npm test` | Exit 0: **1,002 tests / 93 files**, final run 19.61 seconds |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0 |
| `npx expo-doctor` | **21/21 checks passed** during this revision |
| Final all-platform Expo export | Exit 0: **iOS, Android, web**, 33 web routes |
| Real-WebSocket player-count integration | **10 tests passed**; all three rooms/all 13 chapters complete with 2, 3 and 4 clients |
| v5 ownership/checkpoint tests | **24 tests passed** across the eight hands-on activity kinds and three player counts |

The final export was executed in PowerShell with dotenv loading disabled:

```powershell
$env:EXPO_NO_DOTENV='1'
npx expo export --platform all --output-dir dist-variety-review --max-workers 2
```

The full suite includes `tests/story-player-counts.integration.test.ts` and `tests/story-v5-ownership.test.ts`. The former uses the real relay and WebSocket transports, owner-authenticated actions and synchronized snapshots—not direct success flags. The latter rejects other players’ control actions, checks action deduplication and restores serialized state part-way through each activity.

An obsolete test helper still followed the previous marble-adjustment loop. It was updated to perform the new legal placement/rotation actions and to fail immediately if an action is rejected. The resulting test stall was a stale test-helper loop, not a reproduced application hang. Final checks above were rerun after the fix.

## Browser playthroughs

### The Long Table — 4/4 chapters completed

- Solved the photograph, constructed the marble machine from loose pieces, carried dessert and assembled the shadow picture through the real interface.
- Finished with **zero reveals and zero wrong submitted plans**.
- Verified tray wobble, safe recovery and checkpoint behavior.
- Verified placement/rotation controls and current player ownership rather than completing activities through injected state.

### After Hours — 5/5 chapters completed

- Solved the switchboard and parcel route, untangled the workbench, operated the crane and constructed the clockwork transmission.
- Finished with **zero reveals and zero wrong submitted plans**.
- Tested an empty/disconnected clockwork machine. A connected build with a crossed belt visibly ran backwards; changing it to a straight belt produced the successful forward-driving machine.
- Confirmed saved completion survived a browser reload.

### Layout and console

- Checked the latest narrow-screen interface at **320 px**. The part selector is above the construction board so choosing a piece does not require repeatedly scrolling past it.
- No new browser warnings were seen after reloading the latest bundle. An earlier bundle produced an Animated web-driver warning; web animation-driver handling was corrected before the final reload and export.
- Browser rendering validates these screen flows, not native camera, microphone, haptics or real-phone networking.

Barjeel’s four unchanged activities have current full-suite and real-WebSocket coverage. A new full Barjeel browser playthrough was **not** performed in this revision; earlier browser results remain historical.

## Domain and interaction coverage

- Marble: separate unplaced components, legal placement/rotation/removal, physical collision traces, multiple successful arrangements, every component required and success latching. Spatial-build coverage plus 1,500 seeded configurations checks finite serializable traces.
- Clockwork: connected shafts, straight/crossed belt direction, disconnected and backwards outcomes, invalid placements and multiple constructions.
- Workbench: cable intersection and hot-plate clearance rather than a text-answer lookup.
- Serving tray: paired controls, obstacles, wobble, checkpoint and recovery.
- Shadows: lamp projection, piece placement/size/orientation and complementary visible roles.
- Existing crane, tool-search and past/present logic retain their domain, persistence and protocol tests.

Experiments remain free; complete deduction submissions retain bounded mistakes. New activities report visible facts to the existing guide and require no new API key to play.

## Running build and compatibility

At validation time, Expo was running at `exp://10.215.148.186:8081`, with the LAN relay on port **8787** and the optional AI service on **8788**. Relay health returned HTTP 200. The live iOS manifest and launch bundle returned HTTP 200 (bundle: 14,783,591 bytes); the Android manifest returned HTTP 200 and identified SDK 57.

This is an observed LAN address, not a permanent endpoint. After changing Wi-Fi, restart `npm run dev:share` and use the freshly printed QR. All phones need a reachable common network and the current app/relay version. Start a **fresh version-5 room**; old-content checkpoints are deliberately not resumed against different puzzles.

The previously distributed APK was **not rebuilt or installed** in this revision. Source changes are available through the running development build, while standalone Android requires a new build/install.

## Boundaries

- No physical iPhone/Android gameplay, native simulator run or new APK installation is claimed.
- Multi-client WebSocket tests do not replace field testing across routers, firewalls or backgrounded phones.
- The existing AI endpoint was available in the running setup, but no new model-quality evaluation is claimed for these mechanics.
- Dependency-advisory status was not re-audited for this revision. Older numeric `npm audit` reports are not represented as current results.

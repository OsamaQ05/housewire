# Escape rooms v6 — feedback revision and executed validation

Scope: After Hours (five chapters), Barjeel (four), The Long Table (four), still supporting **2–4 players**. Written-clue answer chapters remain capped at two per room: **2 / 1 / 1**. Authored content is **version 6**; update all phones and the relay, then start a fresh room. Stable room IDs preserve historical receipts, while incompatible old checkpoints are not resumed against different controls.

## Changes delivered

### The Long Table: restore the clearer marble interaction

The machine now starts assembled. Each player raises or lowers their own ramp, funnel, spring or bell along a visible rail; the spring also has **Gentle / Firmer** tension. A launch runs the trajectory simulation and shows the failed hand-off or the successful bell strike. This is the simpler earlier structure with a small extra challenge, not another free-placement construction task. All four parts are required, multiple configurations work and success remains latched.

Exhaustive domain coverage finds **seven successful configurations among 288 combinations**. This is a regression check of real trajectory logic, not seven hard-coded accepted answers. Trials remain free and controls retain authoritative ownership.

### After Hours: wire a tiny town, not avoid a hot plate

**Wire the workshop** replaces the hot-plate scene. Four player-owned cables start at round sockets on a **6×6** miniature town. Extend a cable through adjacent streets to its matching bakery, cinema, garden or crane building. Cables cannot overlap or cross buildings/other terminals. A seemingly easy route may use space a teammate needs, making cooperation about shared space rather than reading more clues.

Tap an earlier own segment, use **Undo**, or **Reel in** to recover. Multiple valid sets of routes are accepted. A test powers the town only when all four genuine connections are complete; it is not a hold-to-win action. Existing crane and fifth-level clockwork construction remain.

### The Long Table: house-shadow rendering

The shadow scene now uses one persistent native SVG tree and numeric transforms, avoiding replacement of gradient/shape trees when switching between the house and lamp views. Browser regression exercises repeated switching and the actual projection solution.

**Claim boundary:** the user's native crash log was not captured. This change addresses the fragile rendering path, but neither the exact native root cause nor resolution on the user's physical device has been verified. The passing browser regression is not presented as native-crash reproduction.

### Chapter-specific music

Seventeen original synthesized instrumental loops are bundled offline: **13 separate authored-chapter scores** plus Family Frequency, Circuit Race, Last Light and Case Forge. Assets total approximately **16.6 MB**. After Hours uses mechanical keys/woodblocks, Barjeel uses warm plucked-string textures, and The Long Table moves through piano, playful marimba, a dessert dance and quieter shadow music. They contain no downloaded recordings and need no external account, API key or streaming service. See [asset provenance and regeneration](../assets/audio/music/README.md).

Music has an independent persisted switch, low default volume and fade-in. A single native player is retained for the navigator lifetime. Foreground-audio leases silence it for recording, received voice notes, narrated clues and informational sound effects; overlapping leases cannot unmute one another prematurely. It pauses when the app backgrounds. The browser adapter catches autoplay rejection and can retry on a genuine user interaction.

## Executed checks

| Check | Current recorded result |
| --- | --- |
| `npm test` | **Passed: 1,016 tests / 96 files**, exit 0; repeated full run 20.05 seconds |
| `npx vitest run tests/game-music.test.ts` | **6/6 passed**: per-chapter mapping, mode mapping, playback policy, overlapping silence leases, timer cleanup, all 17 PCM files |
| Music/audio scoped ESLint and `git diff --check` | Passed, exit 0 |
| `npm run typecheck` and `npm run lint` | Passed, exit 0 |
| All-platform Expo export | Passed, exit 0: iOS, Android and web (33 routes) |
| Expo Doctor | **21/21 checks passed** in this revision, exit 0 |

The full suite includes current protocol, sender/ownership, serialization/checkpoint, player-count integration and domain coverage. The six music tests validate actual bundled WAV headers, non-silence, peak levels and distinct file hashes as well as policy logic. They do not measure subjective listening quality or a physical phone's audio output.

## Browser review actually performed

### Revised marble machine

- Operated the player-owned controls through the real interface.
- Deliberately left the bell too low and observed a miss.
- Adjusted the machine and obtained **DING** through the actual trajectory/validator.

### Shadow scene

- Switched house/lamp views **31 times** without a browser crash.
- Manipulated lamp and cut-outs through the interface and completed the real projection alignment: **3/3**.
- The targeted run reached the room ending. The unchanged photo and serving-tray chapters were skipped using **Reveal**, so this was an **assisted review**, not a new full clean Long Table run.

### Music

- Observed actual browser playback selecting **marble → tray → shadow** as chapters changed.
- Music mute paused playback; unmute resumed it.
- Room completion selected no track and left playback paused.
- Microphone capture, real voice playback and app-background behavior still require physical-device verification; the silence policy and lease behavior have automated coverage.

### Workshop

- Completed all four cable routes through the exported app’s real interface and powered the town (4/4 connected).
- Tested a wrong turn followed by Undo, an occupied teammate street, and an incomplete power test before completing the routes.
- Unchanged opening chapters were skipped with Reveal. The wiring chapter itself was solved, not revealed or injected.
- The exported workshop page produced no console warnings or errors. Inspected its board at 390 px and 320 px; refined the header layout and two status messages after the review.

## Reproducible commands

```powershell
npm test
npm run typecheck
npm run lint
npx expo-doctor
npx vitest run tests/game-music.test.ts
$env:EXPO_NO_DOTENV='1'
npx expo export --platform all --output-dir dist-variety-review --max-workers 2
```

Use `npm run dev:share` for Expo Go and the LAN relay; changing Wi-Fi requires a fresh running address/QR. All phones must use the same current app and relay. A follow-up standalone Android **build 2** was compiled and verified on 16 September 2026 with this revision; see [Android installation](ANDROID-INSTALL.md). The previous build 1 remains unchanged. Physical installation of build 2 is not claimed here.

## Unverified boundaries

- No physical iPhone/Android gameplay, native simulator execution or new APK installation is claimed for v6.
- The reported house-shadow native crash requires a follow-up on the affected phone; browser success alone is insufficient to declare it fixed there.
- A multi-client relay test does not replace router/firewall and background-recovery field testing.
- These changes introduce no new AI dependency; current games and all music run without a model endpoint. No new model-quality evaluation or dependency-advisory audit is claimed.
- [The v5 design](ESCAPE-ROOMS-V5.md) and [v5 validation](ROOMS-V5-VALIDATION.md) remain historical records; they are not current v6 evidence.

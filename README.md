# HOUSEWIRE

**A house-scale cooperative escape room in which every family phone becomes a different physical prop.**

HOUSEWIRE is a complete Expo SDK 57 / React Native game for two to four people in the same home. Players do not answer bonding prompts or take turns on one screen. They hear different signals, hold private decoder fragments, scan one another's phones, carry devices between pre-cleared stations, route one-time voice bursts, and synchronize physical finales. The family bond is strengthened mechanically: the game is only solvable when people listen accurately, make their private information useful, recover from mistakes, and act together.

The app also includes a full one-phone rehearsal. It runs every role and every validator locally, clearly labels simulated family phones, and never requires a backend or API key.

## Three complete cases

### 01 · LINE 13 — A call from 13 minutes ahead

A telephone call arrives from the family's own house in the near future. The crew answers the ringing phone, reconstructs a split sound-and-symbol warning, carries the open line through ordered QR seals, rebuilds a six-node circuit, and hangs up every receiver inside one synchronized window.

Core mechanics: knock audio, split cipher, motion lift, QR route, steady carry, circuit reconstruction, synchronized flat-phone finale.

### 02 · DEAD AIR — A private channel inside the walls

An acoustic service machine wakes behind the walls. Players match three-tone signatures to hidden ducts, scan corroded service plates, open a recipient-only voice route, assemble a pressure envelope from distributed glyph mappings, and cancel the machine with relative loudness plus a held phone pose.

Core mechanics: spatial tone matching, camera seals, one-time private audio, distributed logic, local microphone-level classification, motion/touch countertone.

Recorded bursts are sent directly to the intended receiver, are not placed in room history, are never transcribed, and are removed after one delivery. An authored local voice fallback preserves the complete game without microphone permission.

### 03 · NIGHT GLASS — A second house inside the camera

Three phone panes reveal a mirrored copy of the home. Players align a broken threshold, create camera-only parallax doors with separate Frame/Hinge/Watcher roles, reconstruct an impossible 3×3 floorplan, perform three carry-then-stop door handoffs, and fold every pane shut together.

Core mechanics: synchronized poses, live camera overlay, QR parallax, generated maze, local carry-then-stop inference, physical station handoffs, two-step synchronized fold.

## CASE FORGE — unlimited validated cases

CASE FORGE is a complete in-app case press, not a prompt box. Choose the crew size, world, pressure, duration, and available phone capabilities; the press cuts a new five-scene escape case with private roles, solvable clues, three bounded hints per scene, sensor fallbacks, and a verified ending. Cases are saved in a persistent casebook and runs resume after the app closes.

The core forge works entirely offline. It combines five finite mechanic families—distributed order, camera symbol lock, recipient-only audio relay, generated route maze, and synchronized motion/vocal proof—then validates the resulting answer contract before saving it. A custom theme is sanitized into the local case recipe rather than executed as instructions.

Generated camera scenes use the real local QR lens. Generated finales can arm Expo device motion plus a coarse local `REST / SOFT / STRONG` microphone meter to prove posture and sound duration; raw readings are discarded, and every sensor action keeps an explicit hold fallback. A screen-down pose is human-confirmed because normalized motion cannot reliably prove which face of a flat phone is down.

An optional server-side OpenAI pass receives four answer-free, locally compiled mechanical candidates. It ranks which puzzle cut best fits the requested world, crew, tone, and pacing, then writes a coherent narrative for that selected cut. The model never receives player names, clues, solutions, or raw sensor data and cannot invent executable mechanics. Both server and phone regenerate the permitted candidate set and reject any response outside it; a missing key, unreachable server, timeout, or invalid response silently falls back to the playable local forge.

### Optional narrative model setup

The OpenAI key belongs only in the root `.env` file and is read by the local Node server. Never place it in an `EXPO_PUBLIC_*` variable or in the mobile source.

```powershell
Copy-Item .env.example .env
# Open .env and set: OPENAI_API_KEY=your_key_here
npm run dev
```

The app normally derives `http://<your-computer>:8788` from Expo. Set `EXPO_PUBLIC_HOUSEWIRE_FORGE_URL` only if that address must be overridden. `HOUSEWIRE_AI_MODEL` controls the server model and defaults to `gpt-5.4`. No key is needed for complete offline generation or play.

## The 30-second judge moments

- **LINE 13:** four private knock/glyph fragments suddenly become one future warning, then the solved symbols become a physical route through other phones.
- **DEAD AIR:** a caller records a short word; only the receiver's phone plays it, while the excluded phone receives status but no content.
- **NIGHT GLASS:** scanning another phone keeps the rear camera alive and lays an impossible moving door over the real room; a separate person's physical hinge reveals its bearing.

## Run it

Prerequisites: Node.js, npm, Expo Go, and a phone on the same Wi-Fi network as the computer.

```bash
npm ci

# One-phone rehearsal and UI review
npm start

# Live two-to-four-phone play: starts both Metro and the LAN relay
npm run dev
```

Scan Metro's QR in Expo Go. No development client is required.

### One-phone rehearsal

1. Run `npm start` and scan the Expo QR.
2. Open the case files, choose any case, then tap **Solo rehearsal**.
3. Complete the short device check or use its explicit touch fallback.
4. Use the numbered phone switcher whenever the game asks for another person's private clue.
5. Finish the case, inspect the debrief, then open the persisted case archive.

The rehearsal is not a slideshow: answers are generated, wrong attempts alter state, proofs are validated, hints react to pressure, the timer runs, stages persist, and the debrief is produced from the actual run.

### Live house

1. Put the laptop and all phones on the same reachable Wi-Fi network.
2. Run `npm run dev`. Allow local-network/firewall access to Metro and relay port `8787` if prompted.
3. Open HOUSEWIRE on every phone.
4. On the host, choose a case, tap **Play together**, select safe stations, and open the lobby.
5. On each other phone, tap **Join game**, add a name, and scan the host's in-app QR. The QR carries the house code, relay address, and exact case.
6. If a camera cannot scan, expand manual entry, choose the same case, and enter the five-character house code plus the relay address shown by the host.
7. Every phone completes its device check and private role reveal. The host starts once the whole live crew is ready.

The Metro Expo QR opens the application. The in-app house QR joins one live game; they are deliberately different.

### Live generated case

1. Run `npm run dev`, open **Case Forge**, and make or open a generated case.
2. Tap **Play together** on its steel case cover. The host receives an in-app QR and five-character house code.
3. On the other phones, open **Join game** from Case Forge and scan that in-app QR. Manual code and relay-address entry remain available if camera permission is declined.
4. The host starts after everyone has a role. Each phone sees only its own clue file, while the host validates shared order, camera, private relay, route, and synchronized-finale proofs.

This is the real generated case, not a video or scripted showcase. The local seed deterministically recreates the same validated answer contract on reconnect, and public room snapshots omit private clue payloads.

## Demo mode

Solo rehearsal is the integrated demo mode. It needs one phone, no second person, no network relay, no account, and no credentials. It uses the same case compiler and proof validators as live play while replacing unavailable remote-phone evidence with explicit role switching and faithful manual inputs.

For the strongest live demo, use three phones. Two-phone play is supported and recompiles role ownership without inventing a third participant. Four-phone play adds a monitor/extra station where a case supports it.

## Structural AI

HOUSEWIRE contains no chatbot, prompt box, generated therapy, or visible AI persona. Intelligence changes the mechanics:

- **Local motion-intent model:** a rolling DeviceMotion trace becomes acceleration-energy, jerk, rotation, stillness, and flatness features. A compact open-set prototype/RBF model ranks intents such as `LIFTED`, `CARRY_STEADY`, and `PLACED_FLAT`; raw samples remain on the phone.
- **Local acoustic classifier:** DEAD AIR calibrates the room and classifies only relative `REST / SOFT / STRONG` pressure bands. It does not recognize words, identity, pitch, sentiment, or emotion.
- **Adaptive director:** a bounded local pressure model combines retry count, stage, time without progress, sensor availability, and prior run performance. It can expose the next authored hint; it cannot solve a puzzle, submit proof, or weaken live validation.
- **Constraint-valid generation and ranking:** seeded compilers distribute clues and roles across the actual two-to-four-phone crew, generate valid mazes/routes/envelopes, and keep answers solvable while changing on replay.
- **Optional model-ranked Case Forge:** the story model semantically ranks four independently validated mechanical cuts against the family’s requested world and pacing, then writes only the selected cut’s narrative. Local validators remain authoritative.

Removing those systems removes important play: physical traces stop becoming semantic evidence, the vocal countertone stops working, hints stop adapting, and the cases stop recompiling around the current family crew.

## Product architecture

```text
app/                               Expo Router product journey
src/features/cases/                case briefing, mission UI, physical primitives
src/features/forge/                case press, casebook, persistent stage runner
src/domain/escape-case-compiler.ts seeded two-to-four-player case compilers
src/domain/case-forge/             bounded generation, solutions, projections, validators
src/domain/director.ts             local adaptive pressure model
src/services/sensors/              motion features and intent inference
src/services/case-forge/           offline/remote providers, repository, safe import/export
src/services/transport/            loopback/LAN transports and direct delivery
src/features/session/              join tickets, presence, host authority, recovery
src/store/                         Zustand + AsyncStorage product persistence
server/                            LAN relay plus optional server-only narrative endpoint
tests/                             domain, protocol, transport, relay, store tests
assets/art/                        original case art and visual identity assets
assets/audio/                      original cues and authored voice fallbacks
```

The relay only authenticates room membership, orders bounded messages, and routes recipient-only frames. The host phone remains authoritative for stage, sender, answer token, proof ownership, timing, duplicate, and synchronization checks.

## Privacy and safety

- No account, analytics SDK, hosted backend, API key, cloud AI, or internet model is required. The optional narrative model is opt-in and server-side.
- Camera access is requested only for joining or an explicit clue lens. Frames are processed locally and no photo is saved.
- Microphone access is requested only when a player chooses a one-time whisper or arms the local pressure classifier.
- One-time recorded voice is size-bounded, recipient-addressed, omitted from room replay/history, and deleted after playback.
- Raw motion and microphone-level traces stay local. Only bounded semantic proof and timing cross the LAN relay.
- Players select clear, well-lit stations and confirm there are no stairs, obstacles, darkness, running, or screen-watching while moving.
- Camera, microphone, and motion denial never bricks a case; each has a deliberate fallback that preserves the validator.
- Live role files and one-time tokens are excluded from public room replay, but the bundled LAN relay is transport infrastructure rather than end-to-end encrypted messaging. Do not use real secrets as game clues.

## Visual identity

HOUSEWIRE uses a blackline-archive/occult-telephone-exchange identity: warm ivory paper, black architectural voids, live coral wiring, acid acoustic green, cyan/red night glass, oversized editorial serif headlines, condensed instrumentation, custom line glyphs, generated case illustrations, authored WAV signals, layered transitions, stateful haptics, and diegetic camera overlays. It is intentionally not a card dashboard or generic purple AI interface.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npx expo-doctor
npm run export:android
npm run export:web
```

See [GAME_DESIGN.md](./GAME_DESIGN.md) for the full case rules and [PRODUCT_EVIDENCE.md](./PRODUCT_EVIDENCE.md) for claim boundaries and adjacent products.

## Known limitations

- Live play currently needs the included laptop relay; there is no hosted rendezvous service.
- Phones must remain foregrounded and unlocked. Background recovery is intentionally limited by Expo Go.
- Relay state is in memory, so restarting it ends the active house.
- Mixed-router, firewall, and broad physical-device coverage still require field testing; a browser cannot validate real camera framing, microphone acoustics, haptics, or device-motion thresholds.
- HOUSEWIRE has not been evaluated in a family study. It is designed to create useful interdependence and shared play, not represented as clinically proven to improve relationships.
- A host-process reload during a generated case's private-relay scene forgets already accepted one-time fragments; receivers can safely resubmit them.
- Clearing app data creates a new device identity. A full live lobby cannot automatically transfer the former device's occupied role.
- A real phone field pass is still required for room acoustics, silent-mode speech, camera framing, motion thresholds, haptics, firewall behavior, and mixed-router Wi-Fi.
- `npm audit` reports 19 advisories inside the Expo/Metro toolchain. npm's offered remediation is a breaking Expo SDK upgrade; the current Expo Go-compatible build was left on its verified SDK instead of applying that unsafe automatic jump.

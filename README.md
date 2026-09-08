# HOUSEWIRE

**A family game console that turns the people, phones, and rooms already at home into the play surface.**

HOUSEWIRE is a complete Expo SDK 57 / React Native product with three deliberately different ways to play: story escape rooms across two to four phones, the pass-and-play **Family Frequency** prediction game, and the synchronized two-team **Circuit Race**. The family theme is mechanical rather than decorative: people listen accurately, make private information useful, discover ordinary things about one another, recover from mistakes, and act together.

Every mode has a complete one-phone path and remains playable without a backend or API key. The included same-Wi-Fi relay connects two-to-four-phone story escapes and fair two- or four-phone races.

## Three ways to play

### Story Escape

Four authored rooms plus the replayable Case Forge turn family phones into separate physical props. Clues, controls, camera views, one-time voice, motion proof, and final authority are split so no player can silently solve the room alone.

### Family Frequency

A two-to-four-person, one-phone prediction game about the small, useful details people already reveal in daily life. The answer owner privately seals the real signal before any guess; the phone then passes for private reads before a shared reveal. Rounds alternate among object choices, ordinary behavior, drag-to-order family timelines, shared-memory detail, a tactile 0–100 spectrum, and Same Wavelength short answers—so it is not an MCQ loop. In Everyone mode an exact read rewards both the reader and the person understood. Four-player Teams mode lets each partner predict only their own teammate, so bluffing cannot help against an opponent and only costs the bluffer's side.

Team rankings use exact matches per eligible opportunity, compared as fractions so different question types and respondent counts cannot favor one side.

Setup is only names, Everyone/Teams, and 4/8/12 rounds. Names and answers remain on the phone. A bounded local variety ledger rotates styles and filters recently seen question fingerprints. When the optional model endpoint is available, it receives only style, count, and a random seed and returns a safe question structure; the client validates it and silently uses the deterministic offline pack on any error.

### Circuit Race

Two crews receive the same seeded four-stage escape track at the same host-authoritative start time. A replay selects one of six complete story routes and changes the order of its opening emergencies while keeping the final crew regroup readable. In 2v2, each stage becomes a complementary pair of stations: riddle reader vs object switchboard, rhythm listener vs live echo pad, and flight director vs blind motion pilot, followed by two private gesture strips. The first host-verified finish wins; close finishes use an explicit tie window.

Live mode balances two or four phones across Ember and Mint, provides an in-app join QR/manual code, reconnect snapshots, and a private House Line audible only to teammates. Two phones play 1v1; four play 2v2. **Try vs ghost** runs the same generated course and validators on one phone against a deterministic opponent—no hard-coded video or fake win state.

## First five minutes

New players enter through **FIRST LIGHT**, a four-step, no-fail teaching case. It demonstrates the real interaction language before a timed room: hold-and-release House Line communication, combining private clues without showing screens, carrying a phone safely, and a synchronized three-phone close. The home screen keeps it available as **CASE 00** for replay.

During every authored live case, **HOUSE LINE** stays docked at the bottom of each phone. A player can send a sub-two-second voice burst to everyone or to one selected room; that private selection excludes the other phones. Four no-microphone signals—Ready, Repeat that, Come here, and Found it—keep communication usable when microphone permission is refused.

The companion **on-device AI Guide** watches only bounded game telemetry: elapsed time, retries, stage progress, and sensor availability. It first offers a nudge, then a connection, then a concrete next action. It never listens to speech, examines camera frames, changes an answer, or completes proof for the players.

## Four complete cases

### 01 · LINE 13 — A call from 13 minutes ahead

A telephone call arrives from the family's own house in the near future. The crew answers the ringing phone, reconstructs a split sound-and-symbol warning, carries the open line through ordered QR seals, rebuilds a six-node circuit, and hangs up every receiver inside one synchronized window.

Core mechanics: knock audio, split cipher, motion lift, QR route, steady carry, circuit reconstruction, synchronized flat-phone finale.

### 02 · DEAD AIR — A private channel inside the walls

An acoustic service machine wakes behind the walls. Players match three-tone signatures to hidden ducts, scan corroded service plates, open a recipient-only voice route, assemble a pressure envelope from distributed glyph mappings, and cancel the machine with relative loudness plus a held phone pose.

Core mechanics: spatial tone matching, camera seals, one-time private audio, distributed logic, local microphone-level classification, motion/touch countertone.

Recorded bursts are sent directly to the intended receiver, are not placed in room history, are never transcribed, and are removed after one delivery. An authored local voice fallback preserves the complete game without microphone permission.

### 03 · NIGHT GLASS — A second house inside the camera

Three phone panes reveal a mirrored copy of the home. Players align a broken threshold, create camera-only parallax doors with separate Frame/Hinge/Watcher roles, reconstruct an impossible 3×3 floorplan, perform three carry-then-stop door handoffs, and fold every pane shut together.

Core mechanics: synchronized poses, live camera overlay, QR parallax, split named-room floorplan, visual path tracing, local carry-then-stop inference, physical station handoffs, two-step synchronized fold.

### 04 · THE LONG TABLE — One table stretched across generations

An impossible midnight dining room steals one ordinary family meal. Private artifact clues make the crew order four generations of household technology, split photograph fragments become a pantry code, a live camera hunt asks each person to find a real object that only another family member can witness, and rotating service passes end in a synchronized motion-and-voice table setting.

Core mechanics: generational timeline, split object riddles, collaborative photograph reconstruction, privacy-safe live object lens, in-person witness proof, rotating QR handoffs, motion poses, relative sound levels, synchronized plate-rim finale.

The room uses family knowledge as an advantage without asking emotional questions. Its object lens never takes, saves, recognizes, or uploads a photograph; the witness is another person in the room.

## CASE FORGE — unlimited validated cases

CASE FORGE is a complete in-app case press, not a prompt box. Choose the crew size, world, pressure, duration, and available phone capabilities; the press cuts a new five-scene escape case with private roles, solvable clues, three bounded hints per scene, sensor fallbacks, and a verified ending. Cases are saved in a persistent casebook and runs resume after the app closes.

The core forge works entirely offline. Its six finite mechanic families are distributed order, a multi-phone witness riddle, camera symbol lock, recipient-only audio relay, generated route maze, and synchronized motion/vocal proof. Every v2 case contains the riddle, draws three of the four other opening mechanics, shuffles their order, and preserves a synchronized finale. Canonical truth tables prove that the private riddle fragments leave exactly one possible object; the same validator rejects tampered or ambiguous cases before saving. A custom theme is sanitized into the local recipe rather than executed as instructions.

Generated camera scenes use the real local QR lens. Generated finales can arm Expo device motion plus a coarse local `REST / SOFT / STRONG` microphone meter to prove posture and sound duration; raw readings are discarded, and every sensor action keeps an explicit hold fallback. A screen-down pose is human-confirmed because normalized motion cannot reliably prove which face of a flat phone is down.

An optional server-side OpenAI pass receives four answer-free, locally compiled mechanical candidates, including only counts for the riddle plate and its private fragments. It ranks which puzzle cut best fits the requested world, crew, tone, and pacing, then writes a coherent narrative for that selected cut. The model never receives player names, clue text, solutions, or raw sensor data and cannot invent executable mechanics. Both server and phone regenerate the permitted candidate set and reject any response outside it; a missing key, unreachable server, timeout, or invalid response silently falls back to the playable local forge.

### Optional model setup

The OpenAI key belongs only in the root `.env` file and is read by the local Node server. Never place it in an `EXPO_PUBLIC_*` variable or in the mobile source.

```powershell
Copy-Item .env.example .env
# Open .env and set: OPENAI_API_KEY=your_key_here
npm run dev
```

The app normally derives `http://<your-computer>:8788` from Expo. Set `EXPO_PUBLIC_HOUSEWIRE_FORGE_URL` only if that address must be overridden. `HOUSEWIRE_AI_MODEL` controls the server model and defaults to `gpt-5.4`. The endpoint serves both the bounded Case Forge narrative pass and safe Family Frequency packs. No key is needed for complete offline generation or play.

## The 30-second judge moments

- **LINE 13:** four private knock/glyph fragments suddenly become one future warning, then the solved symbols become a physical route through other phones.
- **DEAD AIR:** a caller records a short word; only the receiver's phone plays it, while the excluded phone receives status but no content.
- **NIGHT GLASS:** scanning another phone keeps the rear camera alive and lays an impossible moving door over the real room; later, four incompatible map layers become one glowing route through named rooms.
- **THE LONG TABLE:** four private object riddles rebuild a stolen photograph, then each person frames a real household object that a different family member must walk over and witness.
- **FAMILY FREQUENCY:** a hidden family timeline, spectrum, or no-options signal resolves into a shared tuner reveal; near reads visibly land near the real frequency instead of every answer being right/wrong MCQ.
- **CIRCUIT RACE:** one teammate blindly flies the real phone through another's spoken tilt route, then both discover that their private gesture strips must become one four-swipe breaker weave.

## Run it

Prerequisites: Node.js, npm, Expo Go, and a phone on the same Wi-Fi network as the computer.

```bash
npm ci

# One-phone rehearsal and UI review
npm start

# Live two-to-four-phone Expo Go play: signed Metro plus LAN relay
npm run dev:share

# Alias for the same supported live launcher
npm run dev

# Use only after a HOUSEWIRE development build is installed on the phones
npm run dev:client
```

`npm run dev:share` reuses a healthy Housewire relay, selects a free Metro port, detects the current Wi-Fi address, and prints both the fresh `exp://` URL and a relay health-check URL. Use the QR printed by the current terminal; a saved QR stops working when the laptop changes Wi-Fi address or Metro port.

For an App Store build, deploy the included Node relay/AI service behind TLS, set `EXPO_PUBLIC_HOUSEWIRE_RELAY_URL=wss://…` and `EXPO_PUBLIC_HOUSEWIRE_FORGE_URL=https://…` at build time, and keep `OPENAI_API_KEY` only on that server. The LAN launcher is the complete hackathon/Expo Go path; it is not a substitute for a production rendezvous deployment.

Current iOS Expo Go requires the Expo CLI and Expo Go to be signed into the **same Expo account**. Run `npx expo login` on the computer, then sign into that same account from Expo Go's avatar menu on every iPhone. This is an Expo Go platform requirement, not a HOUSEWIRE room-login requirement, and an anonymous manifest cannot bypass it. Android may not enforce this yet, but using the same account on all Expo Go devices is the predictable setup.

If sharing one Expo account is not acceptable, install a HOUSEWIRE development build on each phone and use `npm run dev:client`. Development builds do not require an Expo Go login. The command is already available but this repository intentionally does not install `expo-dev-client` or create signing credentials automatically; physical iPhone builds require Apple Developer provisioning.

Before scanning Metro's QR, open the printed `http://<laptop-address>:8788/health` URL in every phone's browser. A small JSON response proves that the phone can reach HOUSEWIRE's relay. If it does not load, the Wi-Fi or firewall is isolating devices: connect the laptop and phones to one private hotspot, restart `npm run dev:share`, and use the new QR. Expo's `--tunnel` option tunnels Metro only, not the separate HOUSEWIRE relay, so it is not a complete multiplayer fix by itself.

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

### Family Frequency

1. Choose **Family Frequency** from **House Modes**.
2. Enter two to four first names, choose Everyone or four-player Partner Teams, then choose 4, 8, or 12 rounds.
3. Pass the phone only when the privacy cover names the next person. The answer owner seals an honest pick first; Everyone readers score together with the owner, while team players read only their own partner.
4. Gather around for the reveal. Scores and completed sessions persist locally.

Only one phone is required. The model is optional and never receives the player names, real selections, guesses, score, or history.

### Circuit Race

For one-phone rehearsal, choose **Circuit Race → Try vs ghost**. For a live race, the host chooses **Host live race**; the other phones choose **Join crew** and scan the in-app race QR or enter its code. Keep every phone and the laptop relay on the same reachable Wi-Fi/hotspot. Use two phones for 1v1 or four for 2v2; the lobby will not start an unfair 2v1. It previews Ember and Mint before the host starts both courses on one shared clock.

Teams may move to different safe rooms after the split. When two phones land on one team, House Line exposes a teammate-only short voice route; opponents do not receive that audio. Each sensor stage retains an explicit permission-safe fallback with a real time cost.

## Demo mode

Solo rehearsal and **Try vs ghost** are the integrated escape/race demo modes. They need one phone, no second person, no network relay, no account, and no credentials. Family Frequency is naturally complete on one shared phone. All three use their real compilers, validators, scoring, and persistence rather than a recorded walkthrough.

For the strongest live demo, use three phones. Two-phone play is supported and recompiles role ownership without inventing a third participant. Four-phone play adds a monitor/extra station where a case supports it.

## Structural AI

HOUSEWIRE contains no chatbot, prompt box, generated therapy, or visible AI persona. Intelligence changes the mechanics:

- **Local motion-intent model:** a rolling DeviceMotion trace becomes acceleration-energy, jerk, rotation, stillness, and flatness features. A compact open-set prototype/RBF model ranks intents such as `LIFTED`, `CARRY_STEADY`, and `PLACED_FLAT`; raw samples remain on the phone.
- **Local acoustic classifier:** DEAD AIR and THE LONG TABLE calibrate the room and classify only relative `REST / SOFT / STRONG` pressure bands. It does not recognize words, identity, pitch, sentiment, or emotion.
- **Adaptive director:** a bounded local pressure model combines retry count, stage, time without progress, sensor availability, and prior run performance. It can expose the next authored hint; it cannot solve a puzzle, submit proof, or weaken live validation.
- **Private communication router:** House Line combines local voice capture with recipient-only, expiring relay frames. Its routing, trust, payload-size, replay, and expiry checks are part of the game protocol rather than a general chat feed.
- **Constraint-valid generation and ranking:** seeded compilers distribute clues and roles across the actual two-to-four-phone crew, generate valid mazes/routes/envelopes, and keep answers solvable while changing on replay.
- **Optional model-ranked Case Forge:** the story model semantically ranks four independently validated mechanical cuts against the family’s requested world and pacing, then writes only the selected cut’s narrative. Local validators remain authoritative.
- **Adaptive Family Frequency packs:** a bounded local ledger avoids recent question fingerprints and rotates the next style; the server sends only `{ style, count, seed }` to the model. A strict schema and local validators reject unsafe, malformed, duplicate, or incomplete output before it reaches play. Player names, answers, scores, and the ledger never leave the phone.
- **Circuit Race fairness and hints:** one deterministic constraint compiler gives both teams equivalent underlying challenges, then projects complementary teammate stations without exposing the answer seed. The host validates bounded puzzle evidence, identity, ordering, duplicates, and relay time. A bounded on-device pressure model ranks authored hints from time, retries, stage context, and progress; accepting one applies the displayed time penalty and never changes an answer.

Removing those systems removes important play: physical traces stop becoming semantic evidence, the vocal countertone stops working, hints stop adapting, and the cases stop recompiling around the current family crew.

## Product architecture

```text
app/                               Expo Router product journey
src/features/cases/                case briefing, mission UI, physical primitives
src/features/comms/                expiring room-to-room House Line protocol and UI
src/features/director/             progressive on-device AI Guide UI
src/features/forge/                case press, casebook, persistent stage runner
src/domain/first-light.ts          no-fail tutorial state and clue validation
src/domain/escape-case-compiler.ts seeded two-to-four-player case compilers
src/domain/case-forge/             bounded generation, solutions, projections, validators
src/domain/director.ts             local adaptive pressure model
src/services/sensors/              motion features and intent inference
src/services/case-forge/           offline/remote providers, repository, safe import/export
src/services/transport/            loopback/LAN transports and direct delivery
src/features/session/              join tickets, presence, host authority, recovery
src/features/trivia/              Family Frequency AI adapter and play services
src/features/race/                live race protocol, coordinator, runtime and UI
src/store/                         Zustand + AsyncStorage product persistence
server/                            LAN relay plus optional server-only narrative endpoint
tests/                             domain, protocol, transport, relay, store tests
assets/art/                        original case art and visual identity assets
assets/audio/                      original cues and authored voice fallbacks
```

The relay authenticates room membership with server-issued, cryptographically random resume credentials, orders bounded messages, and routes recipient-only frames. Credentials are bound to one room, client ID, and immutable role, stored only as a server digest, and never enter replay or QR tickets. The host phone remains authoritative for stage, sender, answer token, proof ownership, timing, duplicate, and synchronization checks.

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
- Circuit Race deliberately reuses four learnable mechanic families rather than asking players to relearn random minigames. Six seeded story routes permute the three opening emergencies and vary their riddles, decoys, rhythm, flight path, landing face, gesture weave, roles, and opponent pace; the synchronized breaker remains the final regroup.
- Family Frequency's generated pack intentionally avoids sensitive, humiliating, financial, health, relationship-ranking, and conflict prompts; it is a light prediction game, not a factual record of a family member.
- HOUSEWIRE has not been evaluated in a family study. It is designed to create useful interdependence and shared play, not represented as clinically proven to improve relationships.
- A host-process reload during a generated case's private-relay scene forgets already accepted one-time fragments; receivers can safely resubmit them.
- Clearing app data creates a new device identity. A full live lobby cannot automatically transfer the former device's occupied role.
- A real phone field pass is still required for room acoustics, silent-mode speech, camera framing, motion thresholds, haptics, firewall behavior, and mixed-router Wi-Fi.
- `npm audit` reports 19 advisories inside the Expo/Metro toolchain. npm's offered remediation is a breaking Expo SDK upgrade; the current Expo Go-compatible build was left on its verified SDK instead of applying that unsafe automatic jump.

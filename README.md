# HOUSEWIRE

**A family game console that turns the people, phones, and rooms already at home into the play surface.**

HOUSEWIRE is an Expo SDK 57 / React Native family game console with four ways to play: story escape rooms across two to four phones, the pass-and-play **Family Frequency** prediction game, the synchronized two-team **Circuit Race**, and **Last Light**, a cooperative riddle-defusal device. People listen accurately, make private information useful, discover ordinary things about one another, recover from mistakes, and act together.

Every mode has a complete one-phone path and remains playable without a backend or API key. The included same-Wi-Fi relay connects two-to-four-phone story escapes and fair two- or four-phone races.

## Four ways to play

### Story Escape

Three authored rooms plus the replayable Case Forge turn family phones into separate props. **After Hours** has five chapters, ending with a player-built belt-drive machine. **Barjeel** has four chapters in an Emirati courtyard: picture-making, found tools, past/present changes and a daylight reader. **The Long Table** has four chapters: one photograph deduction, a cooperative marble machine, dessert carrying and shadow-making. Text-clue answer puzzles are capped at two per room: After Hours has two; Barjeel and The Long Table have one each. No coded-audio opener, hold-to-win task or phone-motion calibration is required. Dead Air remains retired; its source and old history are preserved. See [the current v6 changes and validation](docs/ROOMS-V6-VALIDATION.md).

Every authored chapter supports two, three or four players. Two phones share four controls two/two; three share them two/one/one; four receive one each. Deduction notes belong to another phone, not the operator. Hands-on chapters put the scene and controls directly on screen: players tune a ready-built marble machine, route cables through a miniature town, construct a belt drive, coordinate opposite tray handles, and describe shadows seen from another viewpoint. Barjeel’s glass opener remains pure visual teamwork with freely rotating pieces. One-phone rehearsal switches between two stations without a live room.

The guide has a pinned **× Close** control. **Reveal this chapter** shows the current solution and lets the host continue. Revealing turns off the timer and marks the run assisted. Submitted deduction answers have bounded mistakes; building, searching, moving and glass checks are free. Assisted finishes appear in history, not ranked wins. Authored content is now **version 6**: update all phones and the relay, then start a fresh room. Previous-content checkpoints are not resumed against different puzzles.

### Family Frequency

A two-to-four-person, one-phone prediction game about the small, useful details people already reveal in daily life. The answer owner privately seals the real signal before any guess; the phone then passes for private reads before a shared reveal. Rounds alternate among object choices, ordinary behavior, drag-to-order family timelines, shared-memory detail, a tactile 0–100 spectrum, and Same Wavelength short answers—so it is not an MCQ loop. In Everyone mode an exact read rewards both the reader and the person understood. Four-player Teams mode lets each partner predict only their own teammate, so bluffing cannot help against an opponent and only costs the bluffer's side.

Team rankings use exact matches per eligible opportunity, compared as fractions so different question types and respondent counts cannot favor one side.

Setup is only names, Everyone/Teams, and 4/8/12 rounds. Names and answers remain on the phone. A bounded local variety ledger rotates styles and filters recently seen question fingerprints. When the optional model endpoint is available, it receives only style, count, and a random seed and returns a safe question structure; the client validates it and silently uses the deterministic offline pack on any error.

### Circuit Race

Two crews receive the same seeded four-stage escape track at the same host-authoritative start time. A replay selects one of six story routes and changes the order of its opening emergencies. In 2v2, complementary stations divide riddle reading from the object switchboard, rhythm listening from the echo pad, and a private symbol seal from its controls. Two private fuse strips supply the final combined symbol code. The first host-verified finish wins; close finishes use an explicit tie window. Directional swipes and blind tilt instructions are no longer required.

Live mode balances two or four phones across Ember and Mint, provides an in-app join QR/manual code, reconnect snapshots, and a private House Line audible only to teammates. Two phones play 1v1; four play 2v2. **Try vs ghost** runs the same generated course and validators on one phone against a deterministic opponent—no hard-coded video or fake win state.

### Last Light

A fictional lantern device is losing power. The **Operator** sees its controls, the **Archivist** reads its manual, and the **Witness** holds its riddles. None of those views alone gives the whole answer. With two phones, the Archivist also receives the riddles; with three or four, readers are separate. One-phone practice switches between roles.

The full case has four linked modules: three riddle objects arranged by an indicator-dependent rule, two matching leads selected by name and sleeve pattern, a route through named landmarks, and a final riddle phrase assembled from seals earned earlier. **First circuit** teaches the opening module before the full timed case. Wrong completed combinations spend limited strikes; incomplete inputs get friendly guidance without a strike. The timer and a short retry pause make comparing evidence more useful than tapping random choices. No real explosive-device instructions are involved.

## Family Club — the record of your game nights

Open **Your Family Club** from the home screen, or **See your family standings** after a game.

- **Board:** a colorful podium, shared-night totals, all-time/this-week standings, and per-mode filters. Each successful cooperative escape or Last Light defusal gives every real player one shared win. An unsuccessful defusal counts as a game, not a victory. Frequency and Race give winning players/team members one win; ties share a rank. Scores from different modes are never added together.
- **People:** individual player cards with games, wins, win rate, time played, exact-guess accuracy, mode mix, most frequent co-player, and recent games. Add or rename people and choose their badge color. Saved names are quick-pick options in game setup; old name aliases keep previous results attached after a rename.
- **History:** ticket-style game receipts with participants, scores/team results, timing, recorded assistance, retries, and AI/offline question-pack labels for Frequency. Last Light distinguishes successful defusals from unsuccessful attempts. Only available, relevant details appear for each mode.

Completed games save automatically in separate, versioned on-device storage, including after a resumed session. Practice is visible in history but does not influence rankings. Finishes are deduplicated; simulated players are not added to the family. Older history is imported as unranked receipts because it did not retain reliable player membership. Personal statistics begin with games recorded by this version. Family Club stores results, not private trivia answers.

No account or cloud backend is needed. This is a **phone-local family record**, not a cross-device account/leaderboard service. Reuse each person's name/nickname for consistent identity; two people should not use the same nickname. Setup reset preserves Family Club. Uninstalling the app or clearing its data removes the local record. If phone storage fails, the app exposes a retry and does not overwrite unread history.

## First five minutes

New players can try **FIRST LIGHT**, a short, no-fail lesson in private evidence, player-owned spaces, and testing a complete shared plan. It stays available from the home screen. Camera and microphone access are optional and requested only when a player chooses those tools.

During every authored live case, **HOUSE LINE** stays docked at the bottom of each phone. Tap to record a voice note of up to **30 seconds**, then stop and send it to everyone or one selected room; that private selection excludes the other phones. Cancel discards a recording. Four no-microphone signals—Ready, Repeat that, Come here, and Found it—keep communication usable when microphone permission is refused.

Authored escape cases allow **five wrong complete deduction plans across the case**. Incomplete or unchanged repeated plans do not cost another attempt; hands-on activities and shape-making checks are free. If time or attempts run out, the host can reveal the current chapter and continue unranked, without exposing later answers. Circuit Race allows four wrong plans per team; race solutions stay hidden until every team has finished or failed. See [the current authored-room revision](docs/ROOMS-V6-VALIDATION.md) and [attempt and voice rules](docs/ATTEMPTS-AND-VOICE.md).

**Ask the guide** opens a small conversation sheet. Ask about a rule or a confusing clue and follow up naturally. It is instructed not to confirm guesses or give solutions; output is screened before display. It never changes answers or submits proof. Suggestions, local history, clear conversation, and retry are built in.

When connected, GPT-5.4 writes natural, context-aware replies using this player's current puzzle material and the last six conversation exchanges. A separate model review screens each draft for direct or indirect spoilers before release. It cannot submit answers or modify the game. Answer keys, seeds, future stages, other players' hidden screens, player names and sensor recordings are not automatically sent. Authored-room context includes the current role’s visible material and unlocked evidence. Missing details should trigger a clarifying question. No model-based safeguard is an absolute spoiler guarantee.

## Three authored cases

### 01 · AFTER HOURS — The toy-maker’s last delivery

Connect miniature-town residents, plot a parcel route, wire four buildings through shared streets, and deliver the parcel with a shared crane. **Wire the workshop** replaces the hot-plate task: each player extends their cable from a round socket to its matching building on a 6×6 town. Cables cannot overlap, so players must leave room for each other; tapping an earlier segment, Undo or Reel in frees streets again. Any valid set of four connections works. The fifth chapter is **The clockwork parade**: place and turn four loose belt drives to link a hand crank to the town clock. Straight and crossed belts change rotation direction; a live test shows where the chain stops or reverses. Several constructions work. Five chapters, 22 minutes, with only the first two using text-clue answers. Petrol teal, cream wood and coral mechanisms define the workshop.

### 02 · BARJEEL — One courtyard, two times

Turn coloured glass into a house, search separate corners and combine found tools, alter the courtyard across two times, then assemble a daylight reader. Shutters affect sunlight; a young plant becomes roots at the present-day door. Four chapters, 20 minutes. Chalk, aged brass, dark wood and a wind-tower courtyard create its Emirati-inspired identity. The time-crossing story is fictional.

### 03 · THE LONG TABLE — A treasure hunt before dessert

A torn photograph starts Mina’s treasure hunt—the room’s only text-clue answer puzzle. The marble machine is already assembled: each player raises or lowers their own ramp, funnel, spring or bell, while the spring owner can choose **Gentle** or **Firmer** tension. Release a marble, watch the actual trail and adjust the missed hand-off together. This restores the simpler earlier interaction with one extra meaningful control, rather than requiring free-form placement. Then coordinate opposite handles to carry dessert around dishes, and combine a lamp with three paper cut-outs to reveal a rooftop invitation. The tray has a safe checkpoint and catches tipped dessert; the shadow scene gives the lamp keeper the wall view. Four chapters, 20 minutes. Warm linen, wood, drawn portraits and place settings preserve its dinner-table identity. Authored character names, pronouns and portrait metadata are consistent; no real family history is required.

All three rooms save their shared board and show earned discoveries in a notebook. The host can reveal the current chapter, read its explanation, then continue. Each player owns specific controls; deductions use bounded attempts, while hands-on experiments and glass checks are free. Where a camera clue is present, scanning a teammate’s in-case marker unlocks a fictional illustrated record, with a readable alternative. No image recognition or recording of the home is performed. Authored deduction answers are fixed; physical activities validate the resulting world and can accept multiple builds or routes. Case Forge provides generated variety. Retired Dead Air receipts remain in history rather than disappearing.

## CASE FORGE — unlimited validated cases

CASE FORGE is an in-app case press. Choose the crew size, world, pressure, duration, and available phone capabilities; the press cuts a five-scene escape case with private roles, solvable clues, a question-based guide, sensor fallbacks, and a verified ending. Cases are saved in a persistent casebook and runs resume after the app closes.

**Your story idea:** describe a setting and goal in step 2 (up to 180 characters). Pasted line breaks are accepted. Your custom setting takes priority over the preset, and remains visible on the cover and saved recipe. A custom AI request no longer silently switches to a generic template: connection, generation-limit or model failures offer a retry or an explicit offline version. Offline cases are labeled clearly. AI writes the story around validated puzzle mechanics; it does not invent arbitrary executable game types. Regenerating preserves your idea. Existing saved stories are not rewritten automatically.

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

The app normally derives `http://<your-computer>:8788` from Expo. Set `EXPO_PUBLIC_HOUSEWIRE_FORGE_URL` only if that address must be overridden. `HOUSEWIRE_AI_MODEL` controls the server model and defaults to `gpt-5.4`. The same service hosts the bounded Case Forge narrative pass, Family Frequency packs and `/guide/chat` contextual replies with spoiler review. Guide traffic has its own per-client rate limit and does not consume the case-generation quota. No key is needed for offline generation or play.

## The 30-second judge moments

- **AFTER HOURS:** assemble four loose belt drives, turn the hand crank, follow the spinning wheels, and correct a backwards clock by changing a crossed belt.
- **BARJEEL:** move a young plant in the past; another phone sees roots move away from a door in the present. The old house changes what can be reached today.
- **THE LONG TABLE:** release a marble through the ready-built machine, follow the missed hand-off, and adjust a part’s height or spring tension together until the bell rings.
- **FAMILY FREQUENCY:** a hidden family timeline, spectrum, or no-options signal resolves into a shared tuner reveal; near reads visibly land near the real frequency instead of every answer being right/wrong MCQ.
- **CIRCUIT RACE:** a reader’s riddles become another player’s object sequence; a heard pattern becomes a performed rhythm; the teammates combine their private fuse strips for the finish.
- **LAST LIGHT:** the Operator describes a badge, the Witness solves three riddles, and the Archivist turns those answers into a safe socket order. The later shutdown phrase needs evidence earned earlier.

## Run it

### Install on an Android phone (no Expo Go)

The `downloadable-android` branch has a refreshed standalone release APK:
[Download HOUSEWIRE 1.0.0, build 2 — Android APK](https://expo.dev/artifacts/eas/9azrZhcHGyNam7qkU5Ed3GLCtZ18esbk_7zKwKDRsDE.apk).
Built 16 September 2026; approximately 189 MB. The online artifact expires
30 September 2026; a local backup is saved in `downloads/HOUSEWIRE-1.0.0-2ab34fcd.apk`.
This build includes the current v6 rooms, revised marble machine, workshop wiring,
shadow-rendering changes, and 17 offline music tracks. Install it over the earlier
APK instead of uninstalling, to retain local history. See [Android installation and server setup](docs/ANDROID-INSTALL.md) for download,
installation, offline play, and the optional AI/multiplayer connection.

The APK bundles the app, fonts, artwork, and audio. It does not need Metro.
AI and live multi-phone play still use the included laptop server; configure its
address under **Settings → Phone connection** if the laptop changes networks.

### Development with Expo Go

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
2. Open Story Escape, choose one of the three authored cases and start its one-phone rehearsal.
3. The board opens directly. Select **You** or **Partner** to operate the other station; this is simulated role switching, not a second connected phone.
4. Read private clues when the chapter uses them. In Night Glass’s first chapter, just turn the glass and compare the shared picture.
5. Finish the case, or reveal a chapter and continue unranked. Review the ending and saved history.

The rehearsal is not a slideshow: edits alter shared state, answers are validated, the guide answers questions, progress persists, and the ending reflects the actual run. Authored answers are fixed; generated-case rehearsal remains available separately in Case Forge.

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

Solo rehearsal, **Try vs ghost**, and Last Light's **practice** are the integrated demo paths. They need one phone, no second person, no network relay, no account, and no credentials. Family Frequency is naturally complete on one shared phone. They use real compilers, validators, scoring, and persistence rather than a recorded walkthrough.

For the strongest live demo, use three phones. Two-phone play is supported and recompiles role ownership without inventing a third participant. Four-phone play adds a monitor/extra station where a case supports it.

## Structural AI

HOUSEWIRE keeps intelligence behind game-specific controls. The optional guide accepts questions, but has no relationship-coaching persona and cannot solve the room:

- **Local motion-intent model:** a rolling DeviceMotion trace becomes acceleration-energy, jerk, rotation, stillness, and flatness features. A compact open-set prototype/RBF model ranks intents such as `LIFTED`, `CARRY_STEADY`, and `PLACED_FLAT`; raw samples remain on the phone.
- **Local acoustic classifier:** optional sensor mechanics outside the three authored rooms classify relative `REST / SOFT / STRONG` pressure bands. They do not recognize words, identity, pitch, sentiment or emotion. The current authored rooms do not require acoustic calibration or sound decoding.
- **Adaptive director:** a bounded local pressure model combines retry count, stage, time without progress, sensor availability, and prior run performance. It supports accessible sensor recovery and indicates when assistance may help; it does not automatically open revealing hints.
- **Question-based guide:** real GPT conversation with bounded current-role puzzle context, recent chat, and a separate spoiler review. The API key stays server-side; Responses requests use `store: false`. The current clues and recent text are sent to OpenAI only when the player asks. Local history can be cleared; no claim is made that clearing it deletes provider logs. Offline/safety fallbacks are explicitly labelled Built-in guide, never GPT.
- **Private communication router:** House Line combines local voice capture with recipient-only, expiring relay frames. Its routing, trust, payload-size, replay, and expiry checks are part of the game protocol rather than a general chat feed.
- **Constraint-valid generation and ranking:** seeded compilers distribute clues and roles across the actual two-to-four-phone crew, generate valid mazes/routes/envelopes, and keep answers solvable while changing on replay.
- **Optional model-ranked Case Forge:** the story model semantically ranks four independently validated mechanical cuts against the family’s requested world and pacing, then writes only the selected cut’s narrative. Local validators remain authoritative.
- **Adaptive Family Frequency packs:** a bounded local ledger avoids recent question fingerprints and rotates the next style; the server sends only `{ style, count, seed }` to the model. A strict schema and local validators reject unsafe, malformed, duplicate, or incomplete output before it reaches play. Player names, answers, scores, and the ledger never leave the phone.
- **Circuit Race fairness:** one deterministic constraint compiler gives both teams equivalent underlying challenges, then projects complementary teammate stations without exposing the answer seed. The host validates puzzle evidence, identity, ordering, duplicates, and relay time. The question-based guide replaces the old progressive hint buttons and never changes an answer.

These are separate systems: compilers own puzzle truth, sensors supply bounded evidence, optional models choose narrative or teaching structure, and player communication connects private clues. The guide never becomes an additional player holding the answer key.

## Product architecture

```text
app/                               Expo Router product journey
src/features/cases/                case briefing, mission UI, physical primitives
src/features/comms/                expiring room-to-room House Line protocol and UI
src/features/music/                per-chapter scores, native/web playback and audio priority
src/features/director/             safe guide chat, intent library, local history/client
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
src/domain/defusal/                Last Light compiler, validation and private role views
src/features/defusal/              Last Light live/practice runtime and persistence
src/features/defusal-ui/           device controls, manual and witness presentation
src/store/                         Zustand + AsyncStorage product persistence
server/                            LAN relay plus optional narrative, pack and guide endpoints
tests/                             domain, protocol, transport, relay, store tests
assets/art/                        original case art and visual identity assets
assets/audio/                      original cues and authored voice fallbacks
assets/audio/music/                17 original offline instrumental loops and provenance
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

## Game music

Every authored chapter has its own original instrumental score: mechanical keys and woodblocks in After Hours, warm plucked strings in Barjeel, and piano, playful marimba, dessert-dance and shadow textures in The Long Table. Family Frequency, Circuit Race, Last Light and Case Forge each have a separate score too: **17 bundled tracks**, about **16.6 MB**, with no streaming, account or API key required.

The in-game music control and Settings → **Background music** change the same saved preference, independently of sound effects. Music stays quiet, fades in and yields to microphone capture, incoming voice notes, spoken clues and informational tones. It pauses when the app backgrounds. Original synthesis, track details and provenance are in [the audio README](assets/audio/music/README.md); `node scripts/generate-game-music.mjs` regenerates the assets.

## Verification

The current v6 full suite passes **1,016 tests across 96 files**, plus TypeScript, lint, Expo Doctor **21/21**, and iOS/Android/web exports. Browser review solved the revised marble machine after a deliberate miss, completed the shadow scene after 31 house/lamp switches, and routed all four workshop cables, including undo and collision recovery. It also verified chapter-specific music, mute/resume and silence after completion. Unchanged chapters were skipped with Reveal during this targeted review, so this is **not** a new unassisted full-room playthrough. See [the current v6 validation report](docs/ROOMS-V6-VALIDATION.md) for scope. No physical-phone QA or updated APK installation is claimed; the original native shadow crash still needs confirmation on the affected device. [Version-5 results](docs/ROOMS-V5-VALIDATION.md) are historical and do not substitute for current checks.

```bash
npm test
npm run typecheck
npm run lint
npx expo-doctor
npx expo export --platform all --output-dir dist-variety-review --max-workers 2
```

See [GAME_DESIGN.md](./GAME_DESIGN.md) for the case rules, [PRODUCT_EVIDENCE.md](./PRODUCT_EVIDENCE.md) for claim boundaries, and [GAMEPLAY-UPGRADE.md](./docs/GAMEPLAY-UPGRADE.md) for the current puzzle/guide redesign and research references.

## Known limitations

- Live play currently needs the included laptop relay; there is no hosted rendezvous service.
- Phones must remain foregrounded and unlocked. Background recovery is intentionally limited by Expo Go.
- Relay state is in memory, so restarting it ends the active house.
- Mixed-router, firewall, and broad physical-device coverage still require field testing; a browser cannot validate real camera framing, microphone acoustics, haptics, or device-motion thresholds.
- Circuit Race deliberately reuses four learnable mechanic families. Six seeded story routes permute the three opening emergencies and vary their riddles, decoys, rhythms, symbol seals, fuse strips, roles, and opponent pace; the breaker remains the final regroup.
- Family Frequency's generated pack intentionally avoids sensitive, humiliating, financial, health, relationship-ranking, and conflict prompts; it is a light prediction game, not a factual record of a family member.
- HOUSEWIRE has not been evaluated in a family study. It is designed to create useful interdependence and shared play, not represented as clinically proven to improve relationships.
- A host-process reload during a generated case's private-relay scene forgets already accepted one-time fragments; receivers can safely resubmit them.
- Clearing app data creates a new device identity. A full live lobby cannot automatically transfer the former device's occupied role.
- A real phone field pass is still required for room acoustics, silent-mode speech, camera framing, motion thresholds, haptics, firewall behavior, and mixed-router Wi-Fi.
- Dependency-advisory status was not re-audited for this revision. Run `npm audit` against the current lockfile before a production release; do not treat older advisory counts as current or apply breaking fixes without checking Expo compatibility.

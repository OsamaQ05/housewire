# HOUSEWIRE — complete game specification

## Product rule

HOUSEWIRE is not a collection of screen puzzles with family flavor. In live play, two to four phones are separate room instruments. Important information, controls, sensor evidence, and authority are distributed so that no player can silently complete the room alone. Solo rehearsal uses the same compilers and validators but lets one person switch among clearly simulated phones.

Every case follows the same complete product journey:

```text
case file → safe stations → live QR join or solo crew → device check
→ private role reveal → five-stage timed room → debrief → archive/replay
```

## Case 00 · FIRST LIGHT

FIRST LIGHT is a friendly, untimed teaching room, not a rules slideshow. Four short interactions teach the shared grammar used later: send a House Line burst to another room, combine a private color with a remote number and shape, lift and carry a phone (or use the accessible hold), then lock three simulated stations on a visible 3–2–1 count. Every step is retry-safe, has one plain-language action, and can summon a single on-device guide nudge.

## Cross-room communication

Every authored live mission exposes HOUSE LINE as a persistent bottom switchboard. A player selects everyone or one named room, then holds to record a voice burst of at most 1.9 seconds. Direct frames expire after 15 seconds, are accepted only from trusted operation members, are never written to room history, and are deleted after playback. Ready, Repeat that, Come here, and Found it signals preserve the communication loop without microphone access. Communication helps players coordinate; it never substitutes for a puzzle proof.

## On-device AI Guide

The guide converts elapsed time, retry count, stage progress, and missing-sensor state into a bounded pressure assessment. It reveals only authored hints, progressively: Notice, Connect, then Do this. Camera pixels, raw audio, names, and message content are outside the input. The guide cannot submit an answer, change difficulty mid-proof, or remove another player from the solution.

All generated state is deterministic for the house seed, case, replay index, and live node set. Two-, three-, and four-phone games recompile clue ownership rather than pretending missing players exist.

## Case 01 · LINE 13

**Premise:** a telephone call reaches this house from thirteen minutes in the future.

1. **Answer** — only the generated ringing phone can recognize and submit the physical lift.
2. **Decode** — each warning glyph has a private knock count and a digit mapping held on a different phone. The switchboard reconstructs the ordered PIN.
3. **Lens Run** — the decoded glyphs become an ordered route through QR seals on other phones. A courier must arm broad steady-carry evidence and reach the generated destination.
4. **Close the Loop** — six circuit tiles are distributed across the crew. Players follow the active solid/broken exits and dictate the complete loop to the switchboard.
5. **Hang Up** — every live phone follows the same repeating countdown and locks screen-up inside a host-authoritative synchronization window.

**Cooperation:** clue and decoder ownership are deliberately separated; the courier needs other phones as physical destinations; the final required set is every live participant.

## Case 02 · DEAD AIR

**Premise:** an old acoustic service machine wakes inside the walls and starts routing a private channel.

1. **Three Ducts** — every phone has a three-band tone signature, while another phone holds the matching duct lookup. Players order the physical phones from Duct I upward.
2. **Service Plates** — each round separates scanner, QR plate, and corrosion glyph ownership. The scanner must obtain the other phone's seal and ask which candidate valve is live.
3. **The Service Pair** — the tuner opens a gate but receives no word content. The caller sends one short recorded or authored voice burst directly to the receiver. The receiver identifies it and submits the proof. In two-phone play, the caller also operates the gate; privacy between caller and receiver is preserved.
4. **Echo Matrix** — one phone owns glyph order, other phones own glyph-to-pressure mappings, and a separate rule explains how the service machine reads the sequence. The complete four-beat envelope exists only in conversation.
5. **Countertone** — vocalists reproduce `REST / SOFT / STRONG` using local relative microphone level; the tuner holds an assigned phone pose. Permission refusal exposes equivalent pressure controls. All required instruments must lock.

**Privacy:** direct audio is bounded, recipient-addressed, omitted from broadcast history and replay, never transcribed, automatically consumed, and deleted after playback. Authored local WAV words keep the mechanic functional without recording.

**Cooperation:** tone tables, QR plate, corrosion rule, gate, word content, pressure mapping, voice, and pose are intentionally owned by different people.

## Case 03 · NIGHT GLASS

**Premise:** the cameras reveal a mirrored house with impossible doors. The family must cross it and fold it shut.

1. **Draw the Threshold** — every phone becomes one segment of a broken red line and receives a different gross pose. The room advances only when every required pane locks.
2. **Parallax Doors** — three rounds rotate Frame, Hinge, and Watcher. The Frame displays a QR seal and private target. The Hinge performs an assigned physical pose without seeing the door. The Watcher scans the frame; on a granted camera the rear view stays live beneath an impossible-door overlay. Only the combined view reveals the bearing.
3. **Impossible Floorplan** — one phone owns nine named room objects, one owns an unlabelled door layer, one knows how the glass was rotated, and another owns start/exit. The pathfinder touches a visual trail of Lantern, Mirror, Bell, and other rooms while the others describe their incompatible layers; no numbered code is shown.
4. **Walk the Corridor** — the courier arms local motion, produces a fresh `CARRY_STEADY` classification, stops until the phone is broadly steady, then opens the lens and scans the next station's private seal. Three ordered handoffs must complete. A timed physical fallback preserves the carry-then-stop sequence when sensors are absent.
5. **Fold the Corridor** — each phone first locks its assigned pose, then holds the red glass edge. Every required pane must submit inside the shared closing window.

**Cooperation:** no one owns the complete camera view or map; the courier's physical destinations are other family phones; the final fold requires simultaneous participation.

## Case 04 · THE LONG TABLE

**Premise:** an impossible dining room has stretched one household table across several generations and stolen the meal that belonged there.

1. **Take Your Places** — four household artifacts are distributed across the phones with oblique era clues. The service-ledger holder enters them oldest-to-newest; then every phone must lie flat inside the same eight-second window.
2. **The Stolen Photograph** — the case image is split into four directional fragments. Each owner receives an object riddle, a separate phone owns the compass reading order, and only the Photo Keeper can rebuild the photograph by placing the inferred Key, Cassette, Camera, and Game Pad into its visual slots.
3. **What the House Kept** — each player receives a concrete household-object hunt such as “something repaired instead of replaced.” The seeker frames the real object in a live camera view that saves nothing. A different player must walk over, inspect it in person, and submit the witness proof.
4. **Run the Service Pass** — courier authority rotates through every player. Each courier locks a private phone pose, moves to the named person, stops, and scans that person’s generated place seal.
5. **Serve As One** — every phone receives a different gross pose and relative `REST / SOFT / STRONG` sound setting. Positions and sounds lock first; every person then holds the plate rim inside one host-authoritative closing window.

**Family mechanism:** the room automatically uses the actual crew names, makes household history useful through its generational ordering, turns a real shared object into game evidence without uploading it, rotates who leads and who witnesses, and ends with every family member performing a distinct necessary action. It creates interaction through shared competence rather than affection prompts or relationship scoring.

**Privacy:** the object lens is a live preview only. It does not take a picture, classify the object, upload pixels, or persist camera content. Another family member supplies the semantic confirmation.

## Difficulty and local director

Every stage has three authored hints. A local pressure model combines retries, time without progress, stage, sensor availability, and prior run performance. It may reveal hint one automatically; it never changes the answer, creates proof, or removes a required player.

Wrong attempts increment both stage pressure and the persisted recovery count. Prefix validators retain only genuinely correct prefixes where that gives useful feedback. Replays change the seed and reassign roles, routes, signatures, codewords, mazes, and poses.

## Mode · FAMILY FREQUENCY

**Premise:** tune into the small choices and shared moments that make this family recognizable without turning play into a relationship test.

1. **Private signal** — one named answer owner receives the covered phone and locks the real answer using whichever instrument the round calls for: an object choice, a four-item timeline, a 0–100 spectrum dial, or a short no-options signal.
2. **Private predictions** — in Everyone mode the phone rotates through the eligible readers; in four-player Teams mode only the owner's teammate reads them. No reader sees the owner's answer or another guess.
3. **Shared reveal** — the group gets the phone back; the tuner resolves the real answer and all predictions together.
4. **Score and rotate** — the owner changes automatically. Everyone mode awards the reader normal points plus one mutual-lock point to the owner for every exact read. Teams compares each partner side's exact matches per opportunity using fraction-safe ranking.

The six round families are preference, ordinary-behavior, family timeline ordering, shared-memory detail, spectrum reading, and Same Wavelength short answers. Ordering rewards pairwise agreement; spectrum answers can score near-matches; short answers use a transparent, on-device token/edit similarity function with a tiny synonym map. Setup is names, format, and length only. Team mode requires two real pairs: ownership rotates evenly and every answer is read only by the owner's teammate, making a dishonest answer self-defeating rather than adversarial. If a card genuinely does not apply, only its answer owner can void it before sealing an answer; neither team gains a point or an opportunity. Completed sessions and a short recent-results strip persist. A bounded local ledger rotates styles and filters recent question fingerprints. Optional model output is limited to safe question structure and is locally validated; names, answers, ledger entries, and results remain local. A deterministic offline pack makes the whole mode credential-free.

**Family mechanism:** players gain lightweight, concrete knowledge about one another and immediately compare different memories. The game rewards accurate attention without grading affection, forcing disclosure, or asking the model to judge a relationship.

## Mode · CIRCUIT RACE

**Premise:** Ember and Mint are repair crews inside mirrored wings of the same failing substation. Both get equal evidence and one shared host start; the first crew to close the breaker wins.

Each replay chooses one of six seeded incident routes. The first three stations change order and story logic for that route; both crews still receive the identical cut, and the private gesture weave remains the final regroup.

1. **Who Am I?** — the Riddle Reader receives four object riddles in a secret order while the Switchboard Runner owns six physical object switches. The runner solves and hits each answer; no digits or glyph decoding are visible.
2. **Echo Chamber** — one phone plays an authored five-beat rhythm while the other must physically perform it back as real taps and holds. The accessible alternate uses explicit TAP/HOLD controls without changing the answer.
3. **Blind Flight** — the Flight Director privately sees a generated three-move route plus the final screen face. The Blind Pilot tilts left/right or tips forward/back, returns through center after every call, then lands face-up or face-down and holds; the validator checks the entire DeviceMotion trace, not merely a flat phone.
4. **Live-Wire Weave** — each teammate owns alternating gesture beats. They privately exchange UP/RIGHT/DOWN/LEFT calls and swipe the assembled four-move route across a live copper pad; the internal validator token is never shown as a keypad code.

Live play supports exactly two phones for 1v1 or four for 2v2, fair automatic team assignment, a QR/manual join ticket, shared start clock, host-validated relay timestamps and puzzle evidence, recipient-scoped reconnect snapshots, and teammate-only House Line audio. Display packets omit the content seed, source-derived IDs, answer contracts, opaque proof IDs, and the other teammate's breaker strip. The lobby does not permit an asymmetric three-phone race. One-phone play uses the same generated course and validators against a deterministic ghost.

**Family mechanism:** light competition gives both sides urgency, while each team depends on explaining riddles, reproducing another person's rhythm, trusting spoken motion directions, and assembling a final physical gesture. The result celebrates shared competence rather than scoring the family relationship.

## Live authority and recovery

- The host creates an operation with the exact live node set and publishes an authoritative snapshot.
- Every proof is checked for mission, operation, stage, sender identity, assigned actor, answer token, duplicates, and timing.
- Synchronized stages retain only proofs inside their case-specific window.
- Guests can request the current snapshot after reconnecting.
- A host abort is broadcast so every connected phone exits the same operation; guests can leave their own phone without falsely ending the house.
- A missing required node is surfaced as a broken link with reconnect/leave guidance rather than silently weakening the case.
- The LAN relay routes and orders events but does not decide puzzle correctness.
- First join receives an unguessable resume credential bound to room, client ID, and immutable host/guest role. The server stores its digest, refuses ID takeover even after disconnect, and never places the credential in replay, snapshots, QR tickets, or logs.

## Safety and fallbacks

- Setup requires pre-cleared, well-lit stations and explicitly forbids stairs, obstacles, darkness, running, throwing, or watching a screen while walking.
- Camera actions have manual five-character seals.
- Gross pose actions have deliberate hold controls.
- Carry evidence has a timed walk-then-stop fallback.
- Relative vocal pressure has explicit pressure buttons.
- Private recorded voice has authored one-time local word audio.
- Solo rehearsal never claims a simulated participant is real.

## Why this can strengthen family bonds

The mechanism is shared competence, not sentiment. During a case, family members repeatedly need another person's private perception or control; explain information in a form someone else can use; physically meet at another person's station; notice when someone is ready; recover from a wrong attempt without blame; and complete a memorable event together. HOUSEWIRE creates a reason to coordinate that already feels worthwhile: solving an escape room.

This is a design thesis, not a clinical claim. The prototype has not undergone a family field study.

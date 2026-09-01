# HOUSEWIRE — complete game specification

## Product rule

HOUSEWIRE is not a collection of screen puzzles with family flavor. In live play, two to four phones are separate room instruments. Important information, controls, sensor evidence, and authority are distributed so that no player can silently complete the room alone. Solo rehearsal uses the same compilers and validators but lets one person switch among clearly simulated phones.

Every case follows the same complete product journey:

```text
case file → safe stations → live QR join or solo crew → device check
→ private role reveal → five-stage timed room → debrief → archive/replay
```

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
3. **Impossible Floorplan** — one phone owns room labels/start/exit, one owns an unlabelled wall layer, and one owns the optical rotation. The crew reconstructs the only generated path across a perfect 3×3 maze.
4. **Walk the Corridor** — the courier arms local motion, produces a fresh `CARRY_STEADY` classification, stops until the phone is broadly steady, then opens the lens and scans the next station's private seal. Three ordered handoffs must complete. A timed physical fallback preserves the carry-then-stop sequence when sensors are absent.
5. **Fold the Corridor** — each phone first locks its assigned pose, then holds the red glass edge. Every required pane must submit inside the shared closing window.

**Cooperation:** no one owns the complete camera view or map; the courier's physical destinations are other family phones; the final fold requires simultaneous participation.

## Difficulty and local director

Every stage has three authored hints. A local pressure model combines retries, time without progress, stage, sensor availability, and prior run performance. It may reveal hint one automatically; it never changes the answer, creates proof, or removes a required player.

Wrong attempts increment both stage pressure and the persisted recovery count. Prefix validators retain only genuinely correct prefixes where that gives useful feedback. Replays change the seed and reassign roles, routes, signatures, codewords, mazes, and poses.

## Live authority and recovery

- The host creates an operation with the exact live node set and publishes an authoritative snapshot.
- Every proof is checked for mission, operation, stage, sender identity, assigned actor, answer token, duplicates, and timing.
- Synchronized stages retain only proofs inside their case-specific window.
- Guests can request the current snapshot after reconnecting.
- A host abort is broadcast so every connected phone exits the same operation; guests can leave their own phone without falsely ending the house.
- A missing required node is surfaced as a broken link with reconnect/leave guidance rather than silently weakening the case.
- The LAN relay routes and orders events but does not decide puzzle correctness.

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

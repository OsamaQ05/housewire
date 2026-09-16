# Authored escape rooms — September 2026

> Historical version 3 design. Superseded by [the four-chapter version 4 rooms](ESCAPE-ROOMS-V4.md).

Three selectable authored cases now have three chapters each. The goal is clear interaction, different activities and a coherent setting—not the same arrangement puzzle with another answer. No authored chapter is completed by holding a button, tilting a phone or decoding mandatory audio.

**Dead Air is retired from case selection.** Its legacy source and previously recorded history are preserved; it is not a fourth current room. Night Glass’s confusing opening floorplan is removed. The house-making lightbox is now its first chapter.

| Case | Distinctive interactions and linked story |
| --- | --- |
| LINE 13 · 12 minutes | A station rescue: connect callers on a cable switchboard → trace an evacuation route on an actual corridor map → operate four independent rescue devices. The map uses numbered stops and drawn paths; disconnected jumps are visible and rejected. The final desk uses inline radio settings rather than a tool-picker modal. Its identity is warm emergency equipment, amber indicators and a paper floor plan. |
| NIGHT GLASS · 15 minutes | A hidden garden invitation: turn colored glass into a house → restore the old viewer with appropriate tools → assemble its daylight reader. The opener is pure collaborative shape-making, with no hidden riddle or text-clue gate. Colored glass and an illuminated target define the visual identity. |
| THE LONG TABLE · 12 minutes | A treasure hunt before dessert: restore the guests’ place cards → answer everyday-object riddles → deliver illustrated envelopes. A hand-drawn table scene, folded notes, plates and envelopes keep the activity tied to the dinner setting. The previous miniature-garden repair chapter is removed. These are fictional guests; no real-family questionnaire is required. |

The three rooms no longer share one four-step interaction template. LINE 13 uses a switchboard, route map and control console; Night Glass uses glass, restoration tools and an optical reader; The Long Table uses three activities in its illustrated table scene. Some basic matching remains where it suits the task; this is not a claim that every chapter invents a new genre.

Interactive chapters open on their boards. Text states what to do—connect, trace, choose, rotate or deliver—while clues establish which choices work. Each player can change only their own controls.

## The house-making lightbox

All four glass layers start on the table already. There is no initial **Set** gate: every owned layer can rotate immediately, including the first piece. Players can turn their own layers in either direction; other players’ layers are read-only and private, while everyone sees the same combined live image beside the target.

The chapter has no **My clues** tab and no hidden textual puzzle. The actual union of the rotated shapes determines completion, not an unrelated answer code. Checking a picture that does not match is free; it does not consume the room’s wrong-answer budget. Players look, describe gaps and coordinate rotations. The later restoration and reader chapters retain their private notes and normal attempts.

## Playing together

Two, three and four phones are supported. Four stations distribute by player index: two players get two controls each; three players get two/one/one; four players get one each. Private clue ownership is paired across stations so a controller’s useful note is on another phone at all three crew sizes. Glass instead distributes physical layers, with a public combined picture and no text notes. Nobody needs a nonexistent extra player.

The host-authoritative engine checks the shared result; guests cannot claim success or change another role’s slots. The three current cases each have one shared budget of five incorrect complete plans. Incomplete, invalid, duplicate-piece and unchanged repeated submissions do not spend another attempt. Normal chapter completion does not refill that original case budget. The lightbox’s visual checks are explicitly free.

One-phone rehearsal provides explicit You/Partner switching; this is not presented as live multiplayer. The new short tutorial teaches communication and a two-role shared board, without timing, holding tasks or penalties.

House Line carries optional recorded voice notes between players. Guide chat responds to questions about the current chapter; it is not a background conversation listener. Live model responses need the AI server. Offline fallback is not GPT. Chat now has an explicit **× Close** pill above the scrolling conversation. It stays enabled during a pending response, dismisses the keyboard, and shares its closing behavior with Android Back and the accessibility escape gesture. Completed saved messages remain available when reopened.

## Giving up without losing the rest of the story

The host can choose **Reveal this chapter** while playing or after running out of attempts/time. A confirmation explains the consequence before anything is exposed:

1. All phones receive the current chapter’s filled solution, explanation, and clues. Everyone’s clues are available in an expandable section; later chapter answers stay hidden.
2. Players have time to read the explanation. The host then chooses **Follow the next lead**; reveal does not abruptly skip past the answer.
3. The case switches to untimed **Exploring** mode. Each remaining deduction chapter starts with its own fresh, bounded attempt budget; the lightbox keeps its free visual checks. Running out again offers another reveal, not unlimited scored guesses.
4. Revealed chapters are labeled in progress and the case notebook. The ending distinguishes chapters solved from chapters revealed.

Guests see a clear request-to-host message instead of an unusable reveal button. Only the host can authorize revealing a shared chapter. The last chapter’s reveal shows its explanation on the ending screen.

An assisted finish is stored as an authored, assisted/practice history entry, with no participant win credit. It does not increase leaderboard wins, scored games, or timed escapes. Failed cases are not immediately written as a second history entry while the family can still reveal and continue. Clean, unaided completions retain their normal result path.

## Design references, not copied puzzles

- [The Past Within — Rusty Lake](https://www.rustylake.com/adventure-games/the-past-within.html): complementary perspectives make describing what you see part of play. HOUSEWIRE applies that principle to private observations and shared mechanisms, not that game’s story or assets.
- [Keep Talking and Nobody Explodes — Steel Crate Games](https://keeptalkinggame.com/): the person operating a mechanism need not have the information required to solve it. HOUSEWIRE separates clue ownership from controls without copying bomb modules or manual rules.
- [We Were Here — Total Mayhem Games](https://totalmayhemgames.com/games/we-were-here): communication between separated viewpoints is the cooperative activity. HOUSEWIRE uses that broad principle with short, readable family puzzles and optional voice notes.

## Camera clues

An evidence QR unlocks a **fictional authored record** belonging to this case and chapter. It does not recognise your physical room, reconstruct a real building, or perform augmented-reality mapping. A player displays the relevant marker for a teammate to scan. Readable alternatives remain available when camera access is unavailable or declined.

## Runtime and installation

The shared board is host-authoritative, with scoped operation IDs, ordered revisions, replay protection and bounded local checkpoints. Current authored room state uses **content version 3**. All phones and the local relay must run matching updated code. Old-content checkpoints are not resumed against changed puzzles; start a fresh room. Retired Dead Air history is not erased. The coordinator stays mounted while the host visits Home, and reconnection requests the latest board without reassigning roles. Native reconnect proofs use device-bound encrypted storage; web proofs last for the browser tab session. The app must remain running; this is not a native background service.

These are React Native / Expo SDK 57 changes shared by Android and iOS. Expo Go remains supported with a compatible version. The previously downloaded APK contains earlier code: rebuild and install an updated APK to include this redesign. This revision does not move the backend onto a phone or introduce a new backend service.

The phone does **not** become the network server. Multi-phone play still needs the reachable multiplayer relay; GPT features need the AI backend. With the current local setup, keep the laptop server running and phones on the same reachable Wi-Fi/hotspot. Offline rehearsal needs neither server nor API key. A relay restart can invalidate the old room; create a fresh room rather than bypassing its private reconnect proof.

## Verification — current implementation checkpoint

At this documentation checkpoint, these checks have passed on the revised three-room implementation:

- **805/805 tests across 81 files**, including the station, glass, table, state, persistence, protocol, assistance and current-mechanic guide-context tests. The final complete run used `--maxWorkers=2` and finished in 35.40 seconds.
- **TypeScript**, **lint** and **Expo Doctor: 21/21**.
- **Nine real-WebSocket multiplayer scenarios:** each of the three authored rooms completes with two, three and four connected clients. Every player has controls in every chapter; wrong-owner edits are rejected, including attempts by the host. All phones finish with identical authoritative state. Night Glass additionally verifies placed-at-zero glass, private layers, working first rotations and shared-image updates.
- **Browser gameplay at 390 px width:** all three rooms completed three-chapter playthroughs with three solved, zero revealed and zero wrong plans, including their interactive boards and ending screens. These were implementation checks using known solutions, not independent difficulty testing. Guide chat opening and closing were also checked. These were browser rehearsals, not physical-phone playthroughs.
- **Final Android and web exports** succeeded, including the last UI-polish changes: Android Hermes bundle and 33 web routes in `dist-story-rooms`.
- **Final iOS export** also passed, producing its Hermes bundle in `dist-story-ios`. This is a bundle sanity check, not an installed iOS build or simulator test.
- **320 px table review:** controls fit; a new game's selected guest survived reload. Revealing a chapter exposed its explanation, stopped the timer, and allowed continuation. The rebuilt guide offered a riddle suggestion in the riddle chapter, not a map prompt. No browser errors were logged during these checks.
- **Development runtime:** restarted Metro and the multiplayer/AI backend for the current Wi-Fi address. Metro returned `packager-status:running`; the backend health endpoint returned `status:ok` and `aiConfigured:true`. This checks availability, not a new live-model response or a physical phone connection.

The Long Table time limit is now 12 minutes, matching its home-screen estimate. These automated and browser results do not establish physical-phone compatibility by themselves.

### Earlier revision — historical results only

The preceding four-room revision passed 784 tests across 77 files, TypeScript, lint, Expo Doctor (21/21), and Android/web exports. Browser review covered its switchboard, pipe grid, lightbox, guide closure and reveal/continue flow. Earlier two-browser testing also covered live joining, private views, remote edits, reload/reconnection, host-only continuation and termination; live GPT and offline guide responses were exercised then.

Those results describe the previous build. They are not substituted for tests of the newly shortened rooms, removed floorplan or changed glass controls.

## Verification boundaries

Physical iOS/Android camera scanning, microphone playback and native Keychain/Keystore behavior were not tested on hardware in this pass. No new installable APK was built. An Android JavaScript export is not an APK installation test. The package installer also reports 14 moderate dependency advisories; no broad or force-upgrade audit fix was applied during this gameplay change.

During the earlier browser review, autoplay policy blocked an automatic connection sound after a page reload until the first user interaction. Navigation and multiplayer continued working; manually triggered sounds were exercised separately.

# Four-chapter escape rooms

Historical version-4 design. Superseded by [version 5: construction and cooperative play](ESCAPE-ROOMS-V5.md). The room counts, Long Table activities and adjustment-based marble machine below describe the previous implementation, not the current product.

16 September 2026. Three rooms; four levels each; live parties of two, three or four. Stable room IDs preserve existing history while content version 4 prevents resuming older checkpoints against new puzzles.

| Room | Level 1 | Level 2 | Level 3 | Level 4 |
| --- | --- | --- | --- | --- |
| After Hours, 18 min | Connect toy-town residents to buildings | Plot the parcel’s route on connected tracks | Restore the workbench using shared repair notes | Operate a crane from overhead and side views |
| Barjeel, 20 min | Keep the collaborative glass-house picture | Search corners, combine tools, retrieve a key, restore the viewer | Change the past courtyard to open today’s passage | Keep the daylight-reader finale |
| The Long Table, 16 min | Keep the torn-photo seating hunt | Keep the table-object riddles | Build and test a marble machine | Keep the secret-envelope invitation |

## Interaction rules

- Two players own two controls each; three own two/one/one; four own one each. The authoritative host rejects another player’s control actions.
- Picture-making has no extra riddle or set-before-rotate gate.
- New hands-on chapters open directly on the scene, without an empty clues tab. Controls alter real serializable state; completion checks the resulting world, not a hidden answer array.
- Crane: rail, hoist, bridge and grabber. The overhead view hides height; the side view hides bay position. No timed tapping or phone-motion calibration. More than one safe height works.
- Tools: useful objects are shared automatically. Unfound items cannot be used. Nothing is permanently lost by a wrong combination.
- Courtyard: old shutters affect present daylight; moving a plant changes its grown roots. Players in the present discover the pin and open the door. Several action orders work.
- Marble: deterministic gravity/collision model with a visible trajectory and multiple working configurations. Every part must be adjusted from its starting state. Successful runs latch so a late teammate action cannot erase a win.
- Experiments are free; five wrong complete deduction submissions remain the case limit. Revealing any level permits untimed, unranked continuation and shows an explanation. A concrete marble build is included in its revealed solution.

## Presentation and continuity

After Hours uses a painted-wood toy workshop, cream town map and petrol-teal controls. Barjeel uses chalk, brass, dark timber, a wind-tower mark and illustrated courtyard scenes. The Long Table retains warm dining-room art. New covers are bundled offline; generation prompts and provenance are in [art direction](ROOM-ART-DIRECTION.md).

Long Table characters use one authored metadata source for names, pronouns, clothing and portraits. Noor, Leila and Mina use she/her; Sami and Khalid use he/him. This is fictional character data, not gender inference about players.

The existing guide receives current visible controls/observations and instructions not to solve the puzzle. It cannot move objects or submit answers. Offline game logic does not need a model call. The existing House Line still provides voice notes and optional private communication in live rooms.

## Running and compatibility

Use `npm run dev:share` from the project root, with all phones on the same reachable Wi-Fi. Refresh every phone to this version and begin a fresh room. A one-phone rehearsal remains available without a relay or account.

The older downloadable APK does not contain these changes. A new APK build/install is needed for standalone Android; this task updates source and verifies exports, not the previously distributed binary. iOS simulator/device execution is not claimed from this Windows environment.

See [executed validation](ROOMS-V4-VALIDATION.md).

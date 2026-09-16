# Escape rooms v5: build, cooperate, discover

> Historical design for content version 5. The current v6 revision simplifies the marble controls, replaces the hot-plate activity with town wiring, revises shadow rendering and adds chapter-specific music. See [current changes and validation](ROOMS-V6-VALIDATION.md). Results below describe the v5 build only.

Three authored rooms, **13 chapters total**, each supporting **2–4 players**. This revision replaces repeated answer-matching with construction, spatial problem-solving and cooperative control. It retains Barjeel and the liked scenes rather than changing every room for novelty.

| Room | Chapters, target time | Text-clue answer chapters | Play sequence |
| --- | --- | --- | --- |
| After Hours | 5, 22 minutes | 2 | Switchboard → parcel route → untangle workbench → shared crane → construct clockwork |
| Barjeel | 4, 20 minutes | 1 | Glass house → search and combine tools → past/present courtyard → daylight reader |
| The Long Table | 4, 20 minutes | 1 | Photograph → construct marble machine → carry dessert → shadow surprise |

The count describes text-clue answer submission, not every visual matching action: the glass house and shadow picture remain hands-on visual teamwork.

## After Hours: the toy-maker’s last delivery

1. **Wake the little town:** use private notes to connect residents to toy buildings.
2. **A parcel through town:** combine delivery information into a connected route.
3. **Untangle the workbench:** each player moves a cable guide. Every move changes two leads. Make a loop with no crossings and no lead touching the hot plate. Multiple clear layouts work; it is no longer a list of repair-note answers.
4. **The last delivery:** rail, hoist, bridge and grabber belong to different controls. Overhead and side views show complementary information. Carry the parcel above the divider and unfold the receiving tray before delivery.
5. **The clockwork parade:** start with four loose two-pulley drive units. Place them on a pegboard, turn them and choose straight or crossed belts. Test the crank to see where rotation stops, reverses or jams. Build a continuous, forward-driving connection to the clock. Several routes and drive orders work.

Clockwork differs from the marble machine: it transmits rotation through joined shafts and belts rather than guiding a falling object. There is no hidden list of required peg positions; the transmission simulation decides success. The workshop keeps its cream painted wood, petrol teal and coral mechanisms.

## Barjeel: one courtyard, two times

The four liked activities are retained: turn layered glass into a house; search separate corners, combine finds and restore a viewer; change shutters and a young plant in the past to affect today’s passage; assemble the daylight reader. Tools enter a shared bag automatically. Wrong combinations do not permanently consume them. The glass activity remains pure picture-making, without an extra riddle or placement-before-rotation gate.

The Emirati-inspired courtyard uses chalk, aged brass, dark wood and wind-tower imagery. Its time-crossing story is fictional. The final reader is its one text-clue answer chapter.

## The Long Table: four different kinds of play

1. **Who sat where? — deduction.** Keep the torn photograph and guest placement. This is the room’s only text-clue answer puzzle.
2. **Build the bell machine — construction.** Ramp, funnel, spring and bell begin as separate pieces in player-owned trays. Tap a part, then a tabletop socket; move or turn it and test the marble. Gravity and collisions determine the visible trajectory. Each part is necessary; several spatial constructions work. An earned success cannot be undone by a delayed teammate action.
3. **Steady with the dessert — cooperative control.** Players own opposite tray handles. Matching directions move the tray; conflicting pulls make the dessert slide. Steer around dishes to the gold mat. A green mat steadies the dessert and saves progress. A tip is caught safely and can be retried. No simultaneous-tap requirement or phone tilting.
4. **A room made of shadows — visual discovery.** The lamp keeper sees the wall and gold outlines. Other players move, resize and turn their paper cut-outs. Moving the lamp changes all three projections. Talk about the visible result until the roof, house and plant form the rooftop invitation.

The object-riddle and envelope-matching chapters are removed from this room. Warm linen, wood, fictional guest portraits and table objects preserve its identity. Character names, pronouns and portraits remain authored consistently; the game does not infer gender or require real family history.

## Shared interaction rules

- Four controls per chapter: two players own two each; three own two/one/one; four own one each. Ownership is enforced by the authoritative host, not just disabled UI buttons.
- Hands-on activities open directly on their scene, with short action instructions and no empty clue panel. Controls change persisted, serializable world state.
- Building, moving, rotating, searching and visual checks are free experiments. Complete deduction submissions retain the five-mistake case budget; incomplete plans do not spend attempts.
- **Reveal this chapter** explains the current solution and allows continuation. It changes the run to untimed, assisted and unranked; it does not expose later chapters.
- One-phone rehearsal switches between two stations. Live House Line voice notes and quick signals remain available for players in separate rooms.
- The guide receives the current player’s visible activity observations and controls, with instructions not to reveal answers. It cannot operate the board or submit solutions. All new boards and simulations run locally: no new API key or model call is required to play.

## Compatibility and verification

Authored content is **version 5**. Update every phone and the relay, then begin a fresh room; an older checkpoint must not resume against different chapter definitions. Stable room IDs preserve historical results.

Use `npm run dev:share` on the laptop for Expo Go and the LAN relay. Phones must be on the same reachable network. The previously distributed APK is unchanged and does not contain these source changes; standalone Android requires a new build and installation.

Final checks pass: 1,002 tests across 93 files, TypeScript, lint, Expo Doctor 21/21 and iOS/Android/web exports. Real-WebSocket tests complete all 13 chapters with two, three and four clients; 24 ownership/checkpoint tests cover the hands-on controls. Browser review completed The Long Table’s four chapters and After Hours’ five chapters with zero reveals or wrong answers, including construction failure/recovery, tray wobble/checkpoint behavior and saved completion after reload. The latest 320 px control layout and console were checked. Barjeel has current automated/network coverage but no new full browser playthrough in this revision. See [the version-5 validation report](ROOMS-V5-VALIDATION.md) for scope and commands. No physical-device execution or new APK installation is claimed here.

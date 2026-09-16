# Family Frequency: game-night refresh

## Design direction

An original tabletop-radio identity: warm paper, navy ink, copper/orange,
teal, yellow and sky-blue. The radio, physical score tokens and answer tickets
are code-native SVG / React Native components, not downloaded game assets.

Research informed the interaction, not a copied layout:

- [Kahoot — how points work](https://support.kahoot.com/hc/en-us/articles/115002303908-How-points-work): make the payoff after a round legible. We deliberately do **not** use speed bonuses; children and adults can take their time.
- [Wavelength](https://www.wavelength.zone/): a tactile, shared reveal that draws the group around one object. Here it is the phone and a sealed-answer ticket.
- [Jackbox — audience participation](https://www.jackboxgames.com/blog/how-audience-play-along-differs-in-each-jackbox-game): make the result a group moment, not just a private correct/incorrect message.
- [Ticket to Ride](https://www.daysofwonder.com/game/ticket-to-ride/): tangible tokens and visible progression inspired the round track and earned-point pips.

## What changed

1. Setup explains Pick → Pass → Reveal, with Quick spin / Game night / Encore
   (4/8/12 rounds). Point rules are expandable; history sits below the play button.
2. Handoffs are keyed to the current player and turn so a previous answer cannot
   flash in the next person's form. No timer or extra setup is required.
3. Once guesses are saved, answers **and new scores** stay hidden behind
   “Reveal together.” The group controls when to look.
4. The answer opens as a paper ticket with a short sound/haptic cue. Written
   answers retain the owner's Exact / Close / Miss review controls.
5. Each round has its own scoreboard: animated totals, real points earned,
   owner bonuses, tied ranks, position changes, and exact-guess streak badges.
6. Final results have a shared-winner podium, actual match statistics, and a
   small factual highlight for each player. Play again and Family Club remain linked.

## Scoring and safety

- Existing awards are unchanged: choices earn 2 or 3; ordering, dial and text
  rounds can earn up to 4, with existing partial credit.
- In Everyone mode, the answer owner receives 1 point per exact guess.
- Teams retain exact matches ÷ guess opportunities. The UI shows a percentage,
  the denominator, and new exact matches earned this round; rankings compare exact
  fractions, not rounded displays. Close answers do not count as team exact matches.
- Streaks are visual acknowledgements only. No extra awards, speed advantage,
  relationship score, penalty, catch-up mechanic, or invented bonus was added.
- Equal individual totals are tied consistently on the board, final results,
  saved history and Family Club. All-zero games do not create false wins.
- The scoreboard is a pure projection of committed results. Opening it, replaying
  its animation, reloading or revisiting answers cannot award points twice.
- Owner corrections recompute totals. Previously stored games are not rewritten.
- Sound, haptic and reduced-motion preferences are respected. Animations clean
  up their timers. Accessible score labels include the real total and round delta.
- Existing AI prompt generation and offline fallback are retained. Private
  reference answers and guesses are still scored locally, not sent to AI.

## Validation — September 15, 2026

- Full Vitest suite: 492 tests across 57 files passed.
- Added 13 scoreboard projection tests plus history/Club regressions: owner
  corrections, tied and zero scores, exact team fractions, unequal opportunities,
  reloading, duplicate projections, skip-aware streaks and pre-reveal privacy.
- TypeScript and Expo ESLint passed.
- Production web export passed (33 routes).
- Android production bundle export passed (Hermes bundle and bundled assets).
- Browser playthrough at 390×844: completed a four-round game covering ordering,
  dial, written and choice answers. Checked gather/reveal/score transitions,
  owner regrading in both directions, owner bonus reversal, streaks, final totals,
  replay, history and saved-round restoration after reload.
- Team browser check: enforced four-player setup, correct teammate-only handoff,
  real exact-match percentage/denominator and an unplayed team's waiting state.
- Compact-phone layout inspected at 320×640. Removed a conflicting reveal
  opacity animation found in runtime logs.

Native phone haptics and audio need a physical-device check; browser testing is
not a substitute for an iOS/Android device run. This refresh does not add remote
multiplayer to the existing pass-the-phone Family Frequency mode.

## Character and score-motion follow-up

- Six original vector characters: Fox, Frog, Owl, Bear, Rabbit and Cat, each
  with an idle and happy expression. No downloads, photos, accounts or API calls.
- Tap a face beside a player's name to change it. Choices persist by normalized
  name and appear in handoffs, reveals, scoreboards, highlights and the podium.
- Scoreboards first show the previous order. Earned chips travel into popping
  totals, characters bounce, and rows move to their real new positions at 1.4
  seconds. Rank labels settle with the rows. Team rate bars animate too.
- Team portraits contain the actual two teammates. Only real winners get the
  podium cheer. The Next button remains usable throughout.
- Reduced motion immediately shows final values. Corrections cancel the current
  sequence instead of appearing to award points again. All timers/shared-value
  animations clean up when the screen unmounts.
- Failed avatar persistence keeps the game usable and exposes a retry action;
  hydration merges choices made before storage finishes loading.

Follow-up validation: 518 tests across 60 files passed, including 19 avatar
model/storage tests and 7 score-motion tests. TypeScript and ESLint passed;
production web and Android exports passed. Browser checks covered avatar selection and
reload persistence, actual pre/post leaderboard order, final team portraits,
and 390px / 320px layouts. A web easing fallback warning found during review
was corrected by using a cross-platform supported easing; the final individual
score-arrival/reorder run produced no warnings or errors from the updated bundle.

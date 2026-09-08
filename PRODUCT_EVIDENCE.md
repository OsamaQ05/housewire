# HOUSEWIRE — Product Evidence and Claim Boundaries

## Purpose

HOUSEWIRE is designed to get families talking, moving, and relying on one another during a short game. This document records why that is a plausible design direction, what adjacent products already demonstrate, and where the evidence stops.

It does **not** claim that HOUSEWIRE causes family bonding, improves mental health, changes long-term behavior, or introduces an unprecedented game category. The prototype has not undergone a family field study.

## Research signals

| Source | What it can reasonably inform | Caveat for HOUSEWIRE |
| --- | --- | --- |
| [Wang, Taylor, and Sun — *Families that play together stay together*](https://doi.org/10.1177/1461444818767667) | A survey of 361 parents reported associations between more frequent family video-game co-play, family satisfaction, and closeness. It supports studying family co-play as a design context. | Cross-sectional self-report data cannot establish that co-play caused closeness. The sample came from Amazon Mechanical Turk, and the paper did not evaluate HOUSEWIRE's spatial mechanics. |
| [Pecchioni and Osmanovic — *Play It Again, Grandma*](https://doi.org/10.1007/978-3-319-92034-4_39) | Intergenerational pairs played games over six weeks; the work supports shared games as a plausible setting for interaction between younger and older family members. | One bounded intervention cannot be generalized to every family, age, culture, accessibility need, or game design. It does not validate this prototype. |
| [Coyne et al. — parental co-play and adolescent outcomes](https://pubmed.ncbi.nlm.nih.gov/21783048/) | In 287 adolescent-parent reports, parental co-play had positive associations for girls on some behavioral and family measures. This warns designers to consider who is playing, not only the game. | The reported positive pattern was not uniform across genders, the design was observational, and association is not causation. It is not a basis for a universal bonding claim. |
| [Ewoldsen et al. — cooperative versus competitive play experiment](https://pubmed.ncbi.nlm.nih.gov/22489544/) | Participants played *Halo II* cooperatively or competitively before a prisoner's-dilemma task. It supports the narrower idea that play structure can affect immediate cooperative behavior in a lab context. | A short laboratory experiment using a violent commercial game and a subsequent task is far removed from family relationships or in-home spatial play. It cannot establish lasting effects. |
| [Zahn et al. — randomized intergenerational game-mode field study](https://pmc.ncbi.nlm.nih.gov/articles/PMC8892273/) | The study coded verbal and nonverbal interaction across creative, cooperative, and competitive modes. Creative play produced more game-related verbal communication than cooperative play on several measures. This supports designing mechanics that actually require exchange rather than relying on a “co-op” label. | The field sample was small, results across interaction categories were mixed, and creative, cooperative, and competitive modes each produced different patterns. More talking is not automatically more closeness. |
| [Gallup — *Video Games and Wellbeing: Playing Together Matters*](https://news.gallup.com/poll/696956/video-games-wellbeing-playing-together-matters.aspx) | In a 2025 U.S. adult survey of more than 5,000 panel members, in-person play with friends or family was associated with higher self-reported thriving than several other play contexts. It reinforces the decision to prioritize people together in one place. | Gallup also found frequent players were less likely to be thriving overall. The results are observational, concern U.S. adults, and do not show that in-person gaming caused higher wellbeing. |
| [Voulgari et al. — 2025 systematic review of games in CSCW](https://link.springer.com/article/10.1007/s10606-025-09519-z) | The review separates family relationships, collocated play, multiplayer usability, and network consistency as meaningful design concerns. It reinforces that the social and technical structure of play matters—not merely adding a multiplayer label. | This is a broad review of existing literature, not an evaluation of HOUSEWIRE. Its family examples cover very different games, populations, and study methods. |

### What the research changes in the design

- The game requires information exchange; it does not merely put multiple people beside one screen.
- Private fragments, assigned signal ownership, and host-required completions make participation mechanically relevant.
- THE LONG TABLE uses generational objects, actual crew names, and an in-person household-object witness so family context changes the mechanics without requiring emotional disclosure.
- Family Frequency asks players to predict low-stakes choices and shared details, then reveals the real answer immediately; it does not infer closeness or turn private answers into a relationship score.
- Circuit Race uses equal mirrored challenges and small-team interdependence. Competition supplies urgency, but each crew still has to exchange private evidence and coordinate a physical-phone action.
- Physical movement is bounded by safe-room selection and a clear-route confirmation.
- Preview labels simulations honestly because simulated cooperation is not evidence of human co-play.
- The product claim remains experiential: designed to get families talking, moving, and relying on one another.

### What the research does not support

- “HOUSEWIRE strengthens families.”
- “Playing HOUSEWIRE improves wellbeing.”
- “Cooperative games are always better than competitive or creative games.”
- “More speech during play means a relationship improved.”
- “A successful hackathon demo predicts sustained household use.”
- “Knowing more trivia answers proves that one relative cares more.”
- “Winning Circuit Race makes one side of a family better or closer.”

Testing any of those propositions would require an ethics-aware study design, representative recruitment, comparison conditions, validated outcome measures, preregistration where appropriate, and follow-up beyond one session.

## Competitive and design lineage

HOUSEWIRE sits inside several established traditions. The comparisons below describe emphasis, not ownership or novelty.

| Product | Demonstrated pattern | HOUSEWIRE's current emphasis |
| --- | --- | --- |
| [Jackbox Games](https://www.jackboxgames.com/how-to-play/) | One purchased host game opens a room; players join at `jackbox.tv` with a code and use phones as controllers while a shared host screen presents the game. | HOUSEWIRE also uses a low-friction room code, but the phones are the room stations and there is no required television gameplay surface. The flagship mechanic is physical movement and incomplete information across rooms. |
| [AirConsole](https://www.airconsole.com/info) and its [smartphone-controller design guidance](https://developers.airconsole.com/smartphones-as-controllers) | A browser or TV is the shared console and phones are networked gamepads. AirConsole explicitly supports personalized information and phone sensors such as gyroscope, camera, speakers, and microphone. | HOUSEWIRE shares the smartphone-controller substrate and personalized information pattern. Its prototype treats each phone as an independent diegetic terminal and uses the house layout, rather than a central display, as the main shared context. |
| [Keep Talking and Nobody Explodes — mobile](https://keeptalkinggame.com/mobile/) and [official press kit](https://www.keeptalkinggame.com/presskit/sheet.php?p=keep_talking_and_nobody_explodes) | Asymmetric information forces players to communicate: one player sees the bomb while Experts have the manual. Procedurally generated puzzles support replay. | HOUSEWIRE clearly belongs to this communication-puzzle lineage. It distributes private fragments and physical evidence across multiple live phones, then asks players to carry, scan, listen, speak, and synchronize those devices through a home. This is a distinction in implementation, not a novelty claim. |
| [Spaceteam](https://spaceteam.ca/) | A cooperative shouting game for phones and tablets built around mismatched instructions and controls. | HOUSEWIRE similarly makes verbal relay part of the rules. It adds persistent room stations, a host-validated operation state, and phone motion/carry contacts; Spaceteam remains prior art for phone-mediated cooperative shouting. |
| [The Escape Prime](https://www.escapeprime.com/en) | One to four players receive complementary clues across synchronized phones or browsers, remotely or together, with no game master or board. | This is the closest current substitute for the split-information puzzle itself. HOUSEWIRE must therefore win on the part it makes structurally different: phones are physical room instruments, the house is traversed, sensor evidence matters, and the final success is a synchronized device action—not only shared on-screen investigation. |
| [AnimaOS](https://animaos.com/) | A broad browser party-game platform with QR joining, phones as controllers, a shared stage, and some motion/AI minigames. | HOUSEWIRE does not compete on game count. It removes the required central screen and makes each phone a private diegetic terminal in one authored house-scale operation. AnimaOS is strong evidence that “phones as controllers” or motion alone is not novel. |
| [Bounden](https://apps.apple.com/us/app/bounden/id850456491) | Two people hold one phone and use its orientation to perform choreographed movement together. | Bounden is prior art for turning a phone sensor into embodied social play. HOUSEWIRE instead coordinates multiple independently networked phones, private information, rooms, and host-validated evidence. |

### Competitive caveats

- This comparison is not an exhaustive market review.
- It uses public product descriptions, not instrumented side-by-side user testing.
- Feature differences can change as products update.
- HOUSEWIRE does not claim to have invented phone controllers, room codes, asymmetric information, procedural puzzles, cooperative shouting, motion input, or local multiplayer.
- The meaningful question for later testing is whether combining distributed room stations, private fragments, physical carry, and synchronized evidence produces a compelling household experience—not whether every ingredient is new.

## Technical feasibility sources

- [Expo SDK 57 Camera documentation](https://docs.expo.dev/versions/v57.0.0/sdk/camera/) documents `CameraView`, explicit camera permissions, and QR/barcode callbacks across Android, iOS, and web. HOUSEWIRE mounts one scanner only after a user press and retains manual entry after denial or mount failure.
- [Expo SDK 57 DeviceMotion documentation](https://docs.expo.dev/versions/v57.0.0/sdk/devicemotion/) documents the motion stream used by the local calibration and rolling classifier. Actual classification thresholds, confidence rules, and fallbacks are HOUSEWIRE implementation choices and still require device-diverse field calibration.
- [Expo SDK 57 Audio documentation](https://docs.expo.dev/versions/v57.0.0/sdk/audio/) documents explicit recording permissions, recording, and playback. HOUSEWIRE uses it only for a short player-triggered voice burst and local relative sound-pressure classification; neither path transcribes speech.

These sources establish API feasibility, not gameplay quality or sensor accuracy on every phone.

## AI evidence boundary

The default active “AI” is local and inspectable:

- statistical feature extraction plus a physics-authored nearest-prototype/RBF motion-intent model with an open-set unknown class;
- constraint-valid deterministic operation generation; and
- host-side semantic, identity, confidence, timing, and synchronization validation; and
- bounded local pressure inference that can expose a clue or recommend a manual path without completing an action or weakening host rules.

The optional Case Forge narrative provider can use a server-side OpenAI key to rank answer-free validated case cuts and write bounded atmosphere. For the distributed riddle it receives candidate/fragment counts only—not object names, clue text, or truth tables. It is not required for play and cannot change clues, solutions, executable mechanics, or proofs. The compact motion model uses authored reference profiles calibrated against deterministic traces; it must not be described as learned from a household dataset. The host validator is rules-based, and it should not be described as a learned fraud or anomaly-detection model.

Family Frequency's optional model call receives only style, card count, and a random seed. It creates low-stakes question/option structure under a strict schema; local checks reject unsafe copy, duplicates, missing round kinds, and choice-shaped text for ordering rounds. A bounded local ledger rotates styles and filters recent fingerprints without transmitting that ledger. Player names, reference answers, guesses, scores, and history are excluded. Circuit Race's equal-course compiler and host proof validator are deterministic software, not a learned model; its “AI Guide” is a bounded local pressure inference over elapsed time, retries, stage context, and progress that ranks authored hints. These distinctions should remain explicit in judging materials.

The current product wires the case compilers, local director, motion classifier, relative acoustic classifier, host-authoritative state machines, and direct recipient transport into the playable UI. Only behavior observable in a run should be presented as active; deterministic generation and rules-based host validation should not be mislabeled as learned AI.

## Research plan that would justify stronger claims

1. Conduct mixed-device usability sessions with two-, three-, and four-person households.
2. Record completion rate, false sensor rejection, fallback use, disconnections, speaking turns, and physical safety incidents.
3. Compare each HOUSEWIRE case with a matched one-screen puzzle and with an unstructured cooperative activity.
4. Use validated relationship or co-presence measures only with appropriate research oversight.
5. Separate immediate enjoyment and communication from any longer-term relationship outcome.
6. Report null and negative findings, including families for whom the physical or time-pressure format does not work.

Until then, the defensible statement is: **HOUSEWIRE is designed to get families talking, moving, and relying on one another.**

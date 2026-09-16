# HOUSEWIRE · Gameplay upgrade

> Historical initial implementation. The enum-only guide described below has been replaced by [contextual GPT conversation](./CONTEXTUAL-GUIDE.md).

## What changed

The goal is understandable interdependence: each player should contribute information, not simply wait for a hold timer. A puzzle should be difficult because its clues must be combined, not because its controls or wording are obscure.

### Last Light: the manual, the device, and the witness

This is a fictional lantern-defusal case, not a reproduction of a real bomb or another game's module rules.

- **Operator:** sees the device, its current indicator and input controls.
- **Archivist:** sees the manual that interprets that indicator.
- **Witness:** sees the riddles that identify the objects or places.
- With two phones the Archivist also carries the Witness page. Three phones separate all roles; a fourth adds another Witness. One-phone practice switches role views explicitly.

The four modules form a small escape-room chain:

1. **Three sockets:** solve three object riddles, then use the device badge and manual to determine their order.
2. **Crossed connections:** solve two riddles, then combine the names with the correct sleeve pattern. Colour alone is insufficient.
3. **Lantern route:** identify named landmarks and trace a continuous Home-to-Lighthouse journey through them. Visible paths explain geometric legality; the Witness supplies which stops matter.
4. **Last word:** solve a final riddle and combine its answer with selected words from seals earned in earlier modules. Remembering progress is part of the ending.

The shorter First circuit teaches the socket interaction. The full case uses a shared timer and limited strikes. Malformed/incomplete submissions do not spend a strike. A wrong complete combination does, followed by a brief retry pause. Readiness confirms that the readers have shared their information before a live Operator commits. Those ready buttons coordinate a puzzle; pressing one is not itself a solution.

The host checks answers and time. Guest projections contain only the appropriate current role view, not the seed, answer key, other roles' private data or future modules. Reconnect requests recover a role-specific snapshot. LAN communication still uses the existing relay and its room credentials; it is not an end-to-end-encrypted secret store.

### More legible puzzles

- Generated route scenes use named/icon landmarks and a drawn route instead of opaque cell-number instructions. The UI rejects impossible jumps and revisiting a place without disclosing privately owned doors.
- Riddle entry lets people offer an answer in words. Validated object vocabularies and clue intersections keep authored answers determinate; the model does not decide whether an arbitrary guess deserves a win.
- Circuit Race uses riddle/object matching, listened-and-performed rhythms, private symbol seals and a combined fuse code. Directional swipe/tilt tasks have been removed from that mode.
- Full combinations are checked as combinations. Feedback explains format or geometry without confirming individual secret answer positions. Retry pauses discourage rapidly cycling the entire option set.

No finite puzzle can make a lucky guess mathematically impossible. The design instead avoids rewarding brute-force search: private information, multi-part answers, limited attempts, no per-position answer oracle, and linked earned evidence make reasoning the useful strategy. Existing sensor/manual fallbacks remain available where hardware or accessibility requires them; they are not advertised as high-difficulty puzzles.

## A guide players can question

The visible progressive hint ladder is replaced by **Ask the guide** in authored cases, generated cases, Circuit Race and Last Light. It is a small sheet with suggested starters, natural-language questions, a loading state, an honest offline label, connection retry and saved conversation. It opens on request, not automatically when a timer decides players are stuck.

The guide is intentionally not free-form ChatGPT with an answer key:

1. The client sends only the current question, a generic mechanic label and at most six previous teaching-intent labels.
2. The optional OpenAI Responses call uses strict Structured Outputs to return one teaching intent, such as `map`, `wordplay`, `teamwork`, `verify` or `simpler`.
3. Both server and client validate that output. Arbitrary prose, extra fields or unknown intents are rejected.
4. The app selects a short, vetted, answer-free coaching response. It never displays free-form model output.
5. A local classifier supplies the same coaching library without a server, internet or API key. Direct requests for solutions can be handled locally without a model call.

Example: “Is my code right?” is not confirmed or denied. The guide asks the player to check every clue and have a teammate try to disprove the candidate. A map question suggests communicating with room names and checking shared doorways, not a particular route. Follow-up intent context can ask for a smaller step without uploading earlier free text.

No automatic puzzle answer, private clue, run ID, player identity, microphone recording or camera frame enters the guide request. A user can type their own clue/question, so the UI explicitly warns against including personal details. Conversation pairs are saved locally, bounded to 24 per thread and 32 threads, separated by run/stage/role. Clearing a conversation removes that local thread. The API key stays in the server `.env` file.

The `/guide/chat` endpoint shares port 8788 with existing model services, but has a separate 12-requests-per-minute-per-client limit and a four-in-flight cap. It accepts bounded strict requests, rejects private fields, honours disconnect/timeout cancellation and falls back to local classification on model failure. This is useful constrained teaching—not a claim that every unexpected question gets a bespoke explanation.

## Family Club

Last Light now has its own filter, icon and player-stat mode. Successful live defusals count as one shared victory for each player. A failed defusal counts as a played game, even when no module was solved, but awards no victory. Practice stays in History and off the leaderboard. Receipts distinguish “Defused together” from “Not defused this time” and can reopen Last Light.

The existing family record remains phone-local. This update does not introduce cloud accounts or claim cross-device leaderboard synchronization.

## Research and design lineage

These sources informed interaction principles, not copied screens, puzzle text, assets or module tables:

- [Keep Talking and Nobody Explodes: official manual and how to play](https://www.bombmanual.com/how-to-play-pc.html): the useful principle is asymmetric information between the player operating a device and players reading its instructions. Last Light adds a separate riddle witness and a linked earned-evidence ending.
- [We Were Here: developer's game page](https://totalmayhemgames.com/games/we-were-here/): separated players coordinate through speech. HOUSEWIRE applies that communication principle to family phones and named-map descriptions. The developer's indexed description was readable; a direct fetch encountered its verification page during this pass.
- The user's [Defusal Wiki reference](https://defusal.fandom.com/wiki/Defusal_Wiki) identified the requested Roblox inspiration. Automated retrieval was blocked, so no unverified wiki rules were treated as implementation requirements.
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) informed the guide's enum-only response boundary. [GPT-5.4's official model page](https://developers.openai.com/api/docs/models/gpt-5.4) confirms the existing configured model supports Structured Outputs; this update does not change the user's model.

## Verification scope

Tests cover guide request/response validation, direct solution requests, prompt injection, guess confirmation, local fallback, response allowlisting, question-only payloads, strict endpoint validation, rate limits, origin checks and separated persistent histories. Family Club tests cover Last Light success, failure, practice and restoration. See the final run output for the complete repository regression result; this document does not assert unexecuted checks.

Live browser review exercised opening the guide from a case, asking a question, refusing a direct answer request, closing/reopening the saved conversation, and the 390×844 layout. A synthetic request to the configured running `/guide/chat` endpoint returned `source: ai` and `intent: teamwork`, without exposing credentials. Real-phone camera, audio, keyboard and multi-room testing remain necessary; browser checks do not validate those physical conditions.

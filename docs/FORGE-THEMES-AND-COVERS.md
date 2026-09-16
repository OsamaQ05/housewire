# Custom story reliability and restored covers

15 September 2026

## Fixed

- The multiline story input previously allowed text that domain validation rejected. Shared normalization now accepts normal line breaks/tabs, keeps printable Unicode, and validates the same 180-character limit before provider generation or seeding.
- Remote failures previously silently produced an offline template. Custom requests now require a real AI result, unless the player explicitly accepts offline generation. The form retains the idea and offers retry/offline actions; regeneration errors are visible too.
- AI health checks allow three seconds rather than 900 ms. The narrative server has a 60-second deadline and the phone waits 68 seconds. Existing hourly paid-request limits are unchanged and rate-limit failures are explained.
- The custom setting takes precedence over preset styling in the narrative instructions. The model receives answer-free gameplay instructions to keep story actions consistent with the actual game. IDs are matched safely rather than rejecting a valid reordered response. Puzzle answers and mechanics remain protected.
- Custom covers show “Your custom world” and the supplied idea rather than a misleading preset world name. Offline stories are plainly labeled.
- Original bundled artwork restored to the hub, four-case picker, authored briefings and Last Light. A shared, explicitly sized native image component renders covers offline without lazy-loading/transition dependencies.

The AI request format remains aligned with [official OpenAI Structured Outputs guidance](https://developers.openai.com/api/docs/guides/structured-outputs). No model migration or API-key change was made.

## Checks executed

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — 56 files / 476 tests passed, including multiline/Unicode, custom fallback, rate-limit messaging, saved regeneration, reordered narrative IDs, unchanged answer contracts, and five artwork checks.
- Final Expo web export — passed, 33 routes.
- Real GPT-5.4 provider/server checks: moon bakery → “Lunar Bakehouse Run” (12 seconds); desert hotel/guest-book recovery → “The Sandstorm Register” (12 seconds). Both returned validated remote cases, not offline fallbacks. The second check led to an additional instruction preventing narrative from guessing the unknown riddle answer.
- Phone-sized browser review: original Dead Air cover is visible; multiline custom text reaches generation; unavailable AI shows retry/offline controls; explicitly choosing offline saves a playable case with the normalized idea and an honest offline label.

The in-app test browser blocks the local AI service port, so live AI verification used the application's HTTP provider/server directly. Physical-phone visual and network checks were not performed this turn. Regenerate a saved case to get a newly written story; existing saved cases are preserved.

# Voice transcript regression: v1 comparison and repair

## What changed and what failed

The v1 source is `541aeeeb2ccd23a9452de09c292a2d724f589343`. It used xAI's default input transcription settings and displayed each completed transcript directly. The microphone worklet, 24 kHz PCM16 encoding, WebSocket endpoint, and ephemeral credential flow were unchanged between v1 and v6.

v2 added `audio.input.transcription.model = grok-transcribe` and a `seenInputItems` filter. That filter accepted the first completed event per item ID and discarded all subsequent completed events. It also restricted assistant text to one response per completed user turn. v3 moved classification into IFM, using the transcript accepted by that filter. It immediately failed if a tool call arrived before the user transcript.

On September 12, a controlled replay sent the same Windows-synthesized sentence to two real xAI sessions, varying only input transcription configuration. The sentence concerned hiking with a sister and asking to review the experience. Both sessions detected audio and invoked the review tool:

| Configuration | VAD starts | Live transcript updates | Completed transcripts | Outcome |
| --- | ---: | ---: | ---: | --- |
| v1 default | 1 | 0 | 1 | Matching user transcript and review tool call |
| v6 explicit grok-transcribe | 3 | 7 | 13 | Repeated completions shared one item ID; first-event-only filtering loses later text |

This reproduces a mechanism that explains missing or truncated text without a broken microphone connection. It does not prove the exact events in a past user session: those sessions had no event diagnostics. The replay isolates transcription settings, rather than claiming to replay every historical app behavior. Original instructions and tool schemas differed across releases.

The official [xAI voice reference](https://docs.x.ai/developers/rest-api-reference/inference/voice) describes cumulative `updated` transcripts and final `completed` events. Actual repeated completed deliveries must also be tolerated.

## Implemented solution

- Restore v1's default provider transcription configuration.
- Update one bubble per provider utterance; accept corrected completed text rather than discarding it. Support cumulative updates if received, replacing rather than appending them. Ignore stale partials after final text.
- Reserve the user's bubble on VAD start so a delayed final transcript fills its original place in the conversation. Scope message IDs to each connection to prevent reconnects from overwriting old messages.
- Track provider item IDs and turn order. A later transcript cannot satisfy an earlier turn's completion wait.
- Keep IFM as the category authority. Wait up to 1.8 seconds for final transcripts needed by the tool's originating turn. On timeout, preserve text, show a retry message, and do not classify an incomplete transcript.
- Acquire the classification lock before waiting. Deduplicate tool call IDs, consume only the successful input snapshot, retain text on errors or clarification-only results, and preserve corrections that arrive during classification.
- Keep duplicate audio family filtering and interruption handling. Remove the one-user-one-assistant counter that hid tool follow-up text. Continue after tools only once the response, all tool outputs, and playback finish.
- Ignore asynchronous results from ended sessions. `?dev=1` enables event names, item/response IDs, packet counts, and classifier status in browser console; no transcript text, audio, tokens, or keys are logged.

The map, categories, styling, save approval, auth, storage, and schema are unchanged. Voice still prepares proposals for explicit review and Save.

## Verification

`npm run test:voice` tests both the tracker and actual component WebSocket handler with synthetic events: thirteen revised completions, early tool calls, delayed earlier transcripts, successful and failed classification, duplicate calls, post-tool assistant text, timeout/retry, disconnect during waiting/request, turn isolation, and new-session identity. The provider replay is reproducible with `node scripts/smoke-voice-audio.mjs <24kHz-mono-PCM16.wav>`; use synthetic fixtures only. It makes two brief paid provider sessions and writes sanitized metadata to ignored `.sites-runtime/voice-audio-report.json`.

The real provider replay verifies credential issuance, audio transport, VAD, transcription, and tool invocation. Automated component tests verify our handler. A human microphone session remains useful to verify the user's device, browser permissions, and acoustic environment; the synthetic replay does not cover those.

Release checks: TypeScript and the production build passed; voice, extraction, and experience-flow tests passed. Repository-wide lint reports 23 errors and 38 warnings in existing code. Comparing the two edited UI files against v6 shows the same lint findings before and after (ref assignment/effect rules); these are not treated as a passing lint check.

## Rollback

Pre-change v6 remains an archive-backed Sites version and GitHub tag `mind-travel-board-v6`, commit `454f7fddc3104179ec420cd95f055fc2a5ca8e51`.

Site project: `appgprj_6aa4e20d247481919c8e4504291cbfd8`.

Redeploy this existing saved version through Sites to restore v6 immediately:
`appgprj_6aa4e20d247481919c8e4504291cbfd8~appgver_9912334421d48191839c1833761f4739`.

v1 is also retained as an archive-backed version:
`appgprj_6aa4e20d247481919c8e4504291cbfd8~appgver_d79c411ae00481919f024b4b48fea124`.

Prefer v6 for a full release rollback because v1 predates classification and map-control fixes. A Git checkout alone does not change the hosted site. Redeploy the selected saved Sites version, preserve existing audience settings, verify deployment succeeded, and refresh the browser. Redeploy the newer saved version to switch forward again. No database migration is involved; code rollback does not revert user memories.

For a separate Windows source inspection checkout:

```powershell
git fetch github --tags
git worktree add ..\mind-travel-v6-review mind-travel-board-v6
```

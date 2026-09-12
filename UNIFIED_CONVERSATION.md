# Unified conversation release

The saved-experience lookup increment is documented in [EXPERIENCE_LOOKUP.md](./EXPERIENCE_LOOKUP.md), including its shared tool contract, provider handoff, cancellation checks, and integration notes.

Implemented September 12, 2026. The application owns one conversation controller per signed-in user, shared by IFM text chat and Grok live voice. Closing the capture panel does not replace that controller. The original map design and category definitions remain unchanged; voice has the accepted integrated live pane.

## Behavior and ownership

| Concern | Implementation |
| --- | --- |
| History | One ordered array of completed user/assistant messages and application events. Voice transcripts update their provider item ID instead of adding duplicate bubbles. |
| Provider context | Both adapters use the same snapshot builder: latest 40 completed entries within 24,000 characters and last 60 cards. Grok receives that snapshot in session instructions and retains its active audio session. IFM receives the snapshot on each request. The semantic record is shared; provider-internal audio and token windows are not identical. |
| Modes | Text and live voice are alternatives. Starting voice cancels pending IFM output. Ending live closes microphone/socket/playback and removes partial transcripts. Late callbacks cannot change the new mode. |
| Voice drafting | Grok calls `categorize_experiences`; the app sends shared context to the same IFM conversation endpoint used by typing. Ordinary concrete experiences are sufficient; no trigger phrase is required. “Just chat” is a prompt instruction. |
| Cards | Stable IDs plus revisions let corrections update the intended card. Manual edits or Save that happen during a request win over that request. Saved/discarded cards remain context to discourage duplicates. |
| Save | Separate application operation with stable memory IDs and existing idempotent world persistence. Mode switches and closing/reopening the panel do not cancel it. Success/failure becomes a shared event. |
| Storage | Saved memories/images remain in Sites D1/R2. Conversation and unsaved drafts remain local to this browser and user, as before; cross-device chat sync is not introduced. |

Grok's V7 default input transcription configuration is retained. Obsolete event-family compatibility code and the separate legacy turn tracker were removed. Current event deduplication, interruption, final-transcript waiting, and playback-ordered continuation remain. A new regression check covers speech arriving after `response.done` while tool continuation is waiting for audio playback.

IFM occasionally returned prose despite `response_format`. The output contract is now explicit in the system prompt; a known IFM reasoning prefix is removed before strict validation, and one bounded retry handles malformed output. Unreadable output is an error and never changes cards. Categories still use the existing definitions.

## Image upload checks and fixes

Images are attached through **Add experience → Images (optional) → Upload photo**, or by editing a saved memory. This is an attachment feature; it does not infer experiences from image contents.

- Save and Retry wait until upload/generation finishes. A synchronous guard also covers clicking Save before React redraws the disabled button.
- Upload completion uses the latest attachment list and cannot overwrite a newer draft. Double selection is locked. Closing the editor ignores late completion and removes the abandoned upload.
- JPEG/PNG/WebP and 10 MB limits are checked before upload; the server also checks file signatures and declared MIME. File names lose path components.
- Upload retries of the same File use one idempotency key. Storage remains private and owner-scoped. Images referenced by saved memories cannot be deleted until the memory edit removes that reference.
- Failed storage inserts compensate by deleting the uploaded object. Errors remain visible and the experience draft stays editable.

Tests use synthetic image fixtures, an in-memory SQLite database, a mock object bucket, and the actual route/component code. This tests request handling and application behavior without changing a user's map. Server checks are file signatures, not a full image decoder or malware scan.

## Verification

- `npm run test:conversation` — shared-state operations and provider-boundary validation/retry.
- `npm run test:voice` — actual live adapter with controlled event ordering, cancellation, duplicates, transcript timeout, Save context refresh, and playback interruption.
- `npm run test:images` — JPEG/PNG/WebP multipart roundtrips, private metadata/bytes, save/reload, removal, ownership, invalid/oversized input, failures, retry, and UI upload races.
- `npm run test:extraction`, `npm run test:experience-flow`, `node scripts/test-validation.mjs`, `node scripts/test-storage.mjs` — existing categorization, map, reset and persistence regressions.
- `npx tsc --noEmit` and `npm run build` — type checking and deployable build.
- `node scripts/evaluate-conversation.mjs` — opt-in paid real IFM evaluation; final 10/10 cases pass. Results: `eval/conversation-report.json`. Earlier runs exposed the output-format issue and informed its fix.
- `node scripts/smoke-voice-audio.mjs <24kHz-mono-PCM16.wav>` — opt-in paid real Grok test. Existing synthetic fixture produced one final input transcript and invoked categorization with current instructions. It does not test this laptop's physical microphone or acoustic environment.

## Preserved rollback

The pre-refactor checkpoint is V7, GitHub tag `mind-travel-board-v7`, commit `eb422f0f408cdcb2b84ba6caeaba8c7243bc4461` in `jzjc3/HackCMU`.

Its archived Sites version is `appgprj_6aa4e20d247481919c8e4504291cbfd8~appgver_8e99ff91d7e4819182e925b4b35f843a`. It was verified before refactoring. No database migration or destructive map operation is part of this release.

To roll back the live site, ask the site-owning agent to redeploy that **existing V7 archive**, preserving the current audience. Do not rebuild V7 from today's files or reset the GitHub release branch. To return to this release, redeploy its saved archive. Code rollback does not rewind saved map data. V7 does not understand the new browser conversation format, so new unsaved chat/cards are not guaranteed to display in V7; save important reviewed experiences before rolling back.

For source inspection on Windows, `git show mind-travel-board-v7:components/mind-travel/RealtimeVoice.tsx` is read-only. Use a separate Git worktree for historical development rather than overwriting the current checkout.

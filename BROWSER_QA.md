# Browser QA and conversation threads — 2026-09-12

## Shipped behavior

Describe your day has a pinned **New conversation** action, a conversation history picker after a conversation is archived, and a full-width **Talk live with Grok** button. New conversations contain no history or draft cards from other conversations. Saved map data is unchanged. Prior conversations retain typed drafts, unsaved cards, and confirmed Save status and can be reopened. These conversations are local to this browser and user; they are not cross-device synchronized.

Starting or reopening a conversation stops live audio, cancels pending model work and discards partial messages. Save is an independent app operation; conversation switching is disabled until it finishes. Voice and dictation components remount with the conversation ID, preventing late results and errors from entering another conversation.

Responsive repairs keep the original desktop visual design: prevent button-label wrapping, move the map capture prompt above controls at narrower widths, wrap the empty-map prompt, pin the voice toolbar outside the transcript scroller, and let capture panels use the available width on small screens. Setup and settings rows also adapt to narrow widths.

## Checks performed

- Actual Codex in-app browser at localhost, using isolated local QA data with the original local world backed up. No production map mutation.
- Reproduced the original clipped bottom prompt and hard-to-find voice control in a narrow pane. Inspected rendered screenshots after the fix. Header, capture prompt and voice control were readable and reachable.
- Checked visible controls for horizontal overflow at approximately 320, 440 and 1066 CSS pixels. The voice control remains outside the scrolling transcript.
- Completed setup, manual experience creation, photo upload, Save, reopening the memory and refreshing. A synthetic PNG decoded and rendered successfully. Saved counts persisted.
- Real IFM text flow: “I cooked dinner with my sister yesterday”, followed by “Actually, it was two days ago.” One Relationships draft was corrected to the new date and saved without duplicating it.
- Created a new conversation, typed a draft, refreshed, reopened it, then selected the earlier conversation. Draft persistence, old saved status and unchanged map counts were verified visually.
- Two fresh-context reviewers independently assessed source and regression checks. Additional tests cover new-thread isolation, archives and hydration, pending Save guard, late old-socket voice events, and late dictation success/failure after unmount.
- TypeScript, conversation/server, voice, image/server and media/component tests pass. Production build passes. Full-project lint has pre-existing unrelated failures; no claim that full lint is clean.

The physical microphone was not exercised during this QA pass. V8's synthetic real Grok audio smoke and the current adapter event-order tests cover provider behavior; they do not establish laptop acoustic quality.

## Follow-up findings, not fixed in this release

1. Settings can assign two active categories to one geographic region; the UI warns but only one category renders there. Enforce unique active assignments.
2. A first-run map-geometry load failure has no retry in onboarding, unlike the main map error state. Add the same recovery control there.
3. Removing an image reference from an existing memory, deleting a memory, clearing the map, or cancelling a completed-upload draft can leave an unreferenced private object. Cleanup is currently deferred until a future upload and age threshold. Add post-commit orphan cleanup with shared-reference checks.
4. Delete all data clears server data but does not yet clear browser conversation/manual drafts. Clear user-scoped local drafts and controller state as part of that operation, with Save serialized first.
5. Conversation persistence currently uses browser localStorage and inherits its capacity limits. Cross-device sync and large-history storage management are outside this change.

## Rollback

The exact pre-change checkpoint is V8, GitHub tag `mind-travel-board-v8`, commit `228a1c211a985a0ffa8b3cc2ba59712f27b7d301`. Saved Sites archive: `appgprj_6aa4e20d247481919c8e4504291cbfd8~appgver_e2976bc5ee98819197cda7f44dd02e07`.

Redeploy that existing archive to roll back without rebuilding historical source. No database migration is involved. Code rollback does not rewind map data. V8 reads the active conversation but does not expose the archive picker and may overwrite archived local history on its next persistence write; save important reviewed experiences before rollback. V7 remains available as documented in UNIFIED_CONVERSATION.md.

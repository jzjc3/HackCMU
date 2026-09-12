# Saved experience lookup lane

Implemented September 12, 2026. Text IFM and live Grok now share one read-only `find_experiences` tool. Ask for a saved experience using a word or phrase from its stored text, then discuss the returned records. No new controls or layout changes are included.

## Base and integration ownership

- Actual lane repository: `C:\Users\jolen\.codex\worktrees\cf55\02_HackCMU2026\lookup-site`, branch `codex/find-experiences`.
- Starting commit / rollback checkpoint: **`228a1c211a985a0ffa8b3cc2ba59712f27b7d301`**, published V8, tag `mind-travel-board-v8`.
- The app initially opened the separate outer Python repository at `b048f13225f6d7e9846a86401a972c5af4f2af53`. No feature edits were made to that repository. The PM confirmed V8 in the nested Site repository and authorized this isolated Site worktree.
- Core orchestration and Site ownership transferred to task `01a096ce-c4d8-7bb1-8c4d-da1cdedb3840`. It owns final integration and publication. Existing V7/V8/V9 rollback checkpoints remain unchanged.

## Contract and data boundary

| Concern | Behavior |
| --- | --- |
| Input | Strict `{query, limit?}`; raw query at most 200 JavaScript UTF-16 code units, trimmed and nonempty. Limit defaults to 5, integer 1–10. Extra fields are rejected. |
| Search | Literal substring of saved memory **text**, with SQLite's case-insensitive ASCII matching. `%`, `_`, and backslash are escaped before binding the LIKE pattern. Chinese text is matched literally. |
| Ownership | Both routes authenticate with `getChatGPTUser`. The server binds that user's ID; model/client arguments never choose the owner. |
| Database | Parameterized SELECT against the existing `worlds.document_json` memories using `json_each`. No migration, write, index, embeddings, or external search service. |
| Results | `query`, `results`, `hasMore`; each record has stable `id`, stored `text`, `textTruncated`, `{id,name}` categories, stored experience `date`, and `created` timestamp. |
| Bounds | At most 10 records, at most 8,000 text characters per record. Fetch limit+1 to detect more results. Order is creation time descending, then ID ascending. |
| Privacy | Results omit owner IDs, images, attachment metadata, and internal database fields. Lookup route responses use `Cache-Control: no-store`. |

`lib/experience-lookup.ts` owns the shared schema, native function definition and discussion instructions. `lib/server/experience-lookup.ts` owns the query. `/api/experiences/find` is Grok's authenticated dispatch route; `/api/conversation` injects the same server finder into IFM using the authenticated owner.

## Conversation behavior

Both providers are instructed to retrieve before claiming to recall saved facts, distinguish multiple records, report no matches honestly, honor truncation, and treat stored content as data rather than instructions. Recent saved records are no longer silently inserted into IFM category examples. Successful lookup excerpts remain in unified history, so a follow-up can discuss facts already retrieved across text/live mode switches.

Lookup and ordinary discussion also work when all categories are disabled. New drafts still require an active category.

Lookup turns cannot create draft changes in the IFM executor, even if the model returns them. Grok lookup never calls the draft application path. Exact recreations of stored text are also filtered on later IFM turns; prompts distinguish follow-up discussion from a genuinely new experience. The existing proactive drafting and explicit Save flow remain intact. No tool writes or automatically saves anything.

The controller records at most the first three returned records with 500-character excerpts in one bounded history event; it explicitly marks excerpt/result omission. The event is capped at 7,000 serialized characters and uses the existing latest-40-entry / 24,000-character provider context. The full bounded result is delivered to the requesting provider. History is browser-local under the existing signed-in user storage model.

### IFM provider handling

The initial request permits a native function call. After lookup, the adapter requests a final JSON answer with tools disabled and validates it before returning. Defensive limits allow at most two tool rounds, four tool calls, and four provider requests including one final-format retry. Repeated identical tool arguments use a per-request result cache. Invalid arguments and lookup failures become bounded tool errors; provider HTTP failures are not format-retried.

Live evaluation exposed two provider-specific requirements: constrained JSON output suppressed native tool selection, and a tool continuation requires the provider's thinking fields on the assistant message. The adapter therefore leaves the initial tool-capable request unconstrained and replays the assistant tool message unchanged **only inside the server request**. Thinking content is never returned to the client, persisted, or put in shared history.

### Cancellation and live continuation

IFM uses the existing request signal and epoch, checks cancellation before and after awaited work, and cannot apply stale results. Grok uses the same controller lifecycle, deduplicates call IDs, reuses equivalent successful lookups within the same input turn, validates shared arguments, and settles tool counts in `finally`. New speech cancels pending model work; an interrupted tool settles as cancelled without exposing its old result or triggering continuation. A replaced session receives no old output. Tool continuations wait for response completion and audio playback. Grok executes at most four tools per input turn, including categorization, across provider continuation IDs.

Save remains an independent application operation. Cancelling lookup or changing text/live mode does not cancel an in-flight Save. The integrated V9 conversation switch invalidates the model epoch before replacing active history and blocks conversation switching during Save.

## Verification

| Check | Coverage / result |
| --- | --- |
| `npm run test:lookup` | Actual in-memory SQLite query and authenticated route; own-user isolation, case/substring, `%`, `_`, backslash, Chinese, SQL-shaped strings, empty/oversized queries, ordering, bounds/truncation. Mocked IFM covers native tool dispatch, thinking replay/privacy, no/multiple matches, bounded calls, errors, duplicate results, aborts, shared history and independent Save. Actual conversation route confirms authenticated finder closure. |
| `npm run test:voice` | Actual React adapter under controlled events: shared tool schema, arguments, client POST/signal, duplicate/malformed/unknown calls, loop cap, stale same-session and replacement-session results, Save independence and playback ordering. |
| Existing regressions | `test:conversation`, `test:extraction`, `test:experience-flow`, `test:images`, `scripts/test-validation.mjs`, `scripts/test-storage.mjs`. |
| Type/build | `npx tsc --noEmit`, targeted ESLint and `npm run build`. |
| Real IFM | `scripts/evaluate-lookup.mjs`: seven synthetic cases, including native retrieval, multiple/no matches, Chinese, literal percent, follow-up without duplicate drafting, and a new lunch draft. Report: `eval/lookup-report.json`. |
| Real Grok | `scripts/evaluate-voice-lookup.mjs`: two live realtime cases using text input and synthetic tool results; faithful recall and no-match, with no categorization calls. Report: `eval/voice-lookup-report.json`. |

For opt-in paid model checks in PowerShell, set `$env:LOOKUP_EVAL_ENV_FILE` to an existing `.dev.vars` containing the relevant provider credential, then run either evaluator. They read secrets into process memory without copying or logging them. All experiences are synthetic, and neither evaluator writes saved user data.

## Limits and release notes

- This is literal search, not semantic matching, title/category search, stemming, translation, or full Unicode case folding. Accented/non-ASCII upper/lower variants may need the stored spelling. Chinese substring checks pass.
- No pagination is introduced. `hasMore` asks the user to narrow the keyword. Text past 8,000 characters is not supplied; inspect the saved map record for its complete text.
- Lookup facts are snapshots. Explicit new recall requests retrieve again; a discussion of earlier results may refer to a record edited or deleted since retrieval.
- Prompt behavior is sampled, not a guarantee of all model wording. The server enforces read-only execution and suppresses lookup-turn draft changes; the application still requires explicit Save for new drafts.
- Real provider checks use synthetic storage callbacks. SQLite/authentication and browser lifecycle checks are separate automated tests. Grok smoke uses text injection, not a physical microphone; production account end-to-end testing remains a release check for the PM.
- This lane's voice diff changes tool logic only; its controller diff adds `recordLookup`, result metadata, and a guarded call in `apply`. Preserve the PM's V9 presentation and archive helpers during release integration.

## V9 integration validation

The PM requested independent integration of committed V9 **`4f457860608edd46fbc97605920710433f951cba`** with lookup commit **`354c858daf3de179c234b6479328a7bf2aaa58bb`**. V9 was merged into this isolated lookup branch; the main checkout was not edited and no publication was performed.

The sole merge conflict was adjacent type declarations in `lib/conversation.ts`. Resolution preserves V9's `ConversationSession`, `conversationId`, `archives`, validators, persistence and `openConversation` implementation, alongside the optional lookup metadata. Voice presentation and both sets of existing voice tests merged automatically. `Converse` still keys voice and dictation by conversation ID and retains the PM's toolbar/history selector.

Added integration regressions confirm that completed lookup evidence survives archive/reopen and browser-state hydration, while a pending IFM lookup cannot enter the new conversation or mutate the archive. The Grok regression confirms `openConversation` closes the old socket, drops its delayed lookup output, and a fresh session performs a fresh network lookup for the same keyword rather than reusing the old session cache.

Combined lookup, conversation, voice, image/dictation, extraction, experience-flow, validation and storage tests pass, together with TypeScript, targeted ESLint and the production build. Prior live IFM/Grok reports remain the provider evidence; the merge does not change provider prompts, SQL or server dispatch, so paid provider evaluations were not repeated. Physical microphone and production browser/account testing remain with the release owner.

Final integration review also keeps live-tool errors visible after settlement. Cleanup only finishes a still-pending request, so it cannot immediately erase the failure message set by the error handler. The controlled live adapter regression covers this case.

The immediate rollback target for this release is the preserved V9 Sites archive `appgprj_6aa4e20d247481919c8e4504291cbfd8~appgver_fca2aa4c2ca081918694ba85dcf16ba9`, corresponding to Git tag `mind-travel-board-v9` and commit `4f457860608edd46fbc97605920710433f951cba`. Redeploy that existing archive without rebuilding or rewinding saved map data.

## Release-owner browser verification

The combined source passed lookup, conversation, voice, image and dictation regressions, TypeScript and the deployable build in the authoritative checkout. In the actual local browser, a fresh conversation used real IFM and the local authenticated database to retrieve an isolated synthetic “cobalt canoe” record. The answer correctly reported the sister and September 10, 2026 date. A follow-up answered from those retrieved facts. A second literal phrase with no matching record produced an honest no-match answer. All three turns left zero draft cards and no Save action, and the map count stayed unchanged. Completed lookup history survived a development preview refresh.

The local world was backed up before adding the single fixture. Cleanup detected a concurrent image-test change, so it removed only the lookup fixture and verified that the remaining document exactly matched the concurrent state (excluding the normal revision increment). No production map was changed. The real Grok evidence remains the lane's synthetic realtime text-input tests; a physical microphone acceptance test is still outstanding.

The user approved photo previews as the default map hover mode for this release. The existing keyword mode remains available in developer controls. The image test verified upload, Save, refresh and photo hover using a sample image; it also correctly rejected a JPEG whose filename claimed PNG. No other V9 presentation change is included.

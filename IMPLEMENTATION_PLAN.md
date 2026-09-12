# Mind Travel — full ChatGPT Sites implementation plan

Status: approved scope; implementation started September 12, 2026.

## Objective and authority

Ship the complete Mind Travel product in ChatGPT Sites for the board presentation. Use Sites-managed hosting, authentication, structured storage, file storage, runtime secrets, server execution and versioned publication. The user does not need a separate infrastructure account or deployment pipeline.

`Mind Travel Design System/` and its ZIP are the locked design source and supersede the older prototype and briefs. Preserve the original reference files. Translate components into React/TypeScript without redesigning layouts, typography, map algorithms, motion, navigation or the review-before-save workflow. Repo restructuring is authorized. The user explicitly requested gpt-5.6-sol agents with medium reasoning for implementation.

## Product scope

- Three-step world setup, dimension names/colors/order/activation and region assignment.
- Both supplied cartographic/atlas styles and recognizable/abstract geography.
- CPU-rendered terrain, importance summits, recency-weighted connection arcs, hover keywords/photos, zoom and selection.
- Manual capture with optional date/title/emotion/importance/clarity and AI suggestions.
- Describe-your-day conversation, distinct experience proposals, correction, review/remove/restore and explicit batch save.
- Region browsing, recent memories, detail, edit and confirmed deletion.
- World settings, appearance preview/apply/restore, dimension reassignment/deactivation, export and delete-all.
- ChatGPT sign-in and isolated durable data per user.
- IFM extraction using the OpenAI client and real evaluation cases.
- xAI dictation, real image attachments, xAI realtime voice using grok-voice-think-fast-2.0, and explicit-request image generation using grok-imagine-image-2.0.
- Preserve the supplied marketing kit; prioritize the app entrypoint and make marketing screens available without substituting them for the product.

Reach goals determine implementation order, not automatic exclusion. Do not label a partial core release the completed product. Report any provider/platform blocker accurately.

## Implementation decisions

Use the Sites-provided React/TypeScript Vinext starter (Next.js-compatible routes with Sites-managed execution). Site source lives in `site/`, separate from the locked references and existing uncommitted prototype work. D1 is the managed SQLite database; R2 stores uploaded/generated image bytes. Platform SIWC owns authentication. API credentials remain server-side and are provisioned as Sites secrets.

Preserve existing visible review controls by default. Minimal integration changes are authorized by the full-feature request: truthful cloud-storage status, activating the supplied microphone, and matching attachment/voice/image controls. Keep additions in existing panels and reuse tokens. No unrelated redesign. Keep sample photos/data confined to explicitly designated demonstration controls; real memories only show real attachments.

## Architecture and shared contracts

- `app/page.tsx`: authenticated entry; renders the client app. Browser-only map and audio code remains client-side.
- `components/mind-travel/`: typed translations of the supplied app, primitives and map implementation.
- `lib/types.ts`: shared World, Dimension, Memory, Proposal, Attachment types.
- `lib/client-api.ts`: typed browser fetch adapter and recoverable errors.
- `lib/server/`: ownership, D1 persistence, provider clients, validation and uploads.
- `app/api/world`: GET returns `{world}`; PUT accepts `{world, expectedRevision}` and returns `{world}`. World snapshots are small; use revision checks and atomic relational writes. Preserve server-owned ownership and attachment checks.
- `app/api/experiences/extract`: POST `{text, dimensions, context?}` returns `{items, question, source:'model'|'local'}`. Server checks the authenticated user's actual dimensions; no writes.
- `app/api/audio/transcribe`: POST multipart audio returns `{text}`.
- `app/api/attachments`: POST multipart file returns `{attachment}`. GET `/api/attachments/[id]` streams an owned image. DELETE removes an owned attachment.
- `app/api/images/generate`: POST `{prompt, memoryId?}` returns `{attachment}`; only explicit user request triggers generation.
- `app/api/voice/token`: POST issues short-lived xAI realtime credentials; long-lived key never reaches browser.
- `app/api/world/export`: GET downloadable JSON; DELETE `/api/world` deletes the user's world and associated attachments after existing confirmation.
- Responses use meaningful HTTP status codes and `{error:{code,message}}` on failure.

World compatibility: `{setupDone, dims, memories, overrides, lastOpened, revision?}`. Dimension: `{id,name,region,color,active}`. Memory: `{id,text,title,date,dims,emotion,importance,clarity,created,photo?,attachmentIds?}`. Proposal: `{text,dims,reason,emotion,confidence,key?,removed?}`. Emotion is Proud/Calm/Grateful/Nervous/Sad/Curious/Tired or null. Ratings remain null or integer 1–5. Regions retain the seven supplied names. Server IDs use UUIDs, while existing IDs are preserved so terrain remains stable.

## Work packages

1. Preserve and inventory locked design; capture deterministic baselines. Fix conditional hooks and runtime globals in the production translation. Keep reference files unchanged.
2. Establish Sites runtime, managed authentication, DB/file bindings and early build compatibility. Owner handles registration and publication.
3. Implement all frontend journeys with durable API adapters, drafts, pending/error/success states and no false save confirmation.
4. Implement ownership-scoped storage, revisions, safe retries, export/deletion, attachment validation and cleanup. Never trust browser-provided ownership.
5. Integrate IFM via OpenAI SDK at https://api.ifm.ai/v1, candidate model IFM/K2-Horizon-375B-A23B. Use strict structured output plus server validation, bounded context, low temperature, output limits, timeout and transient retry. Validate finish_reason; never show reasoning_content. AI proposes only; user confirms every save.
6. Dictation: browser recording → server multipart → https://api.x.ai/v1/stt → editable draft. Handle silence/cancel/denial/network errors and release microphone tracks.
7. Attachments: validate media bytes/type/size, authenticated R2 access, real photos in existing layouts. IFM is text-only; initial image context is user-authored descriptions. Do not silently add an unapproved vision provider.
8. Realtime: ephemeral token, pinned grok-voice-think-fast-2.0, microphone lifecycle, interruption and reconnection. Reuse proposal validation and confirmation. Generated illustrations: pinned grok-imagine-image-2.0, preserve bytes in R2, distinguish illustration from original photograph and never infer facts from generated media.
9. Evaluation, visual parity, production build, hosted smoke checks, versioned release and board rehearsal.

## Agent orchestration

Owner delegates bounded implementation to gpt-5.6-sol / medium agents in `.build-work/` staging directories outside the Site checkout. Agents may read reference assets and write only their assigned staging tree. They do not call Sites tools, initialize/deploy a Site, edit secrets, or spawn agents. Owner integrates, reconciles contracts, runs the final build, provisions resources and publishes.

- Frontend agent: typed faithful components and full UI API wiring.
- Data agent: D1 persistence/auth/attachment route implementation and validation.
- AI agent: IFM, xAI STT/realtime token/image providers and real evaluation harness.

## Verification and acceptance

Visual: compare fixed IDs, time, fonts and data at 1440×900 and 1280×720 plus supplied compact breakpoints. Cover both map styles, setup, empty/dense worlds, selected/hover states, panels, dialogs and long content. Preserve terrain/bridge formulas. Document any difference required by integration.

Functional: setup → describe → proposals → explicit save → map update → refresh → revisit → edit/delete. Manual capture, settings, export/delete-all, photos, dictation, realtime and image generation are verified independently. Test keyboard/reduced-motion and Windows browser microphone behavior. No mandatory live microphone capture during automated testing; use audio fixtures and request real microphone permission only through the product.

Data: persistent round trips; concurrent edits yield recoverable conflicts; safe retries cannot duplicate; user A cannot read/mutate user B records/files; no fake save; failed input retained; delete cleans owned files.

AI: approximately 30 labeled cases with a held-out subset, real IFM requests, schema validity, event split correctness, dimension accuracy, factual fidelity, latency and failures. Cover multi-event days, connected sentences, negation, other people's experiences, correction context, renamed/inactive categories, ambiguity, prompt injection, noisy transcripts and provider errors. Target ≥90% event/dimension accuracy and zero fabricated events or unconfirmed writes in critical cases. Report actual scores and limitations, not only mocks. Do not count local fallback as IFM success.

Delivery: production build and meaningful checks pass; API secrets absent from browser bundles/logs/Git; deploy privately through Sites; verify terminal deployment success and live app. Record exact shipped capability status and a repeatable board demonstration. Retain a known-good version. Freeze optional changes two hours before presentation when a concrete presentation time is available.

## Sources and current known gaps

- IFM: https://docs.ifm.ai/#/chat-completions and https://docs.ifm.ai/#/structured-output (read in browser). Text-only message input; tools and structured JSON supported. Account access still needs live verification.
- xAI STT: https://docs.x.ai/developers/model-capabilities/audio/speech-to-text (multipart `/v1/stt`, file field last).
- xAI realtime: https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech (browser ephemeral token).
- xAI images: https://docs.x.ai/developers/model-capabilities/images/generation (temporary provider image URLs must be persisted).
- Sites: https://learn.chatgpt.com/docs/sites plus installed Sites workflow references.
- Original prototype defects: hooks after conditional setup return; synchronous batch success; unreliable draft-close retention; keyword fallback masking model absence; random Picsum photos.

No deployment or real model evaluation had occurred when this plan was first saved. Progress and evidence are maintained in `docs/BUILD_STATUS.md`.

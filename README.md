# Mind Travel

Mind Travel turns a person's real experiences into a personal world map. The frontend is a faithful TypeScript production port of the locked design in `../Mind Travel Design System/`.

The app runs as a private ChatGPT Site. ChatGPT supplies the signed-in identity, D1 stores one revision-controlled world per user, and R2 stores private image attachments. IFM extracts reviewable experience proposals. xAI provides speech-to-text, optional realtime voice, and user-requested illustrations. AI output never writes directly: the user reviews and explicitly saves every proposal.

## Presentation

[View the project presentation](https://docs.google.com/presentation/d/18O0pGOO-O4wE1Hv3Aw-u2wgQpX03gnzk/edit?usp=drive_link&ouid=117718906907991650769&rtpof=true&sd=true).

## Local development on Windows

Use Node.js 22.13 or newer. Put `IFM_API_KEY` and `XAI_API_KEY` in an ignored `.dev.vars` file, then run:

```powershell
node .\node_modules\drizzle-kit\bin.cjs generate
node --import .\scripts\sites-env.mjs .\node_modules\wrangler\bin\wrangler.js d1 execute DB --local --config .\dist\server\wrangler.json --persist-to .\.wrangler\state --file .\drizzle\0000_premium_karma.sql
node .\scripts\run-framework.mjs dev
```

The portable preview signs in as the documented local Sites test user. Production authentication is handled by ChatGPT Sites.

Append `?dev=1` to any app URL to show the developer chrome. It preserves the
design review controls, failure simulations, and deterministic 100-memory seed
generator while keeping them out of the default product experience.

## Verification

```powershell
node .\node_modules\typescript\bin\tsc --noEmit
node .\scripts\test-validation.mjs
node .\scripts\test-storage.mjs
npm run test:conversation
npm run test:voice
npm run test:images
node .\scripts\evaluate-ifm.mjs --release
node .\scripts\run-framework.mjs build
```

The IFM evaluation writes sanitized results to `eval/release-report.md` and `eval/release-report.json`; credentials and request headers are never recorded. `scripts/smoke-provider-access.mjs` checks IFM and xAI access and validates that xAI can issue an ephemeral realtime credential without printing it.

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for architecture, product contracts and release criteria.

See [UNIFIED_CONVERSATION.md](./UNIFIED_CONVERSATION.md) for the shared text/live conversation, independent Save behavior, image-upload verification, and preserved V7 rollback checkpoint. The real-provider conversation evaluation is `node .\scripts\evaluate-conversation.mjs` (10 synthetic cases; requires IFM_API_KEY).

See [VOICE_REGRESSION.md](./VOICE_REGRESSION.md) for the v1/v6 voice comparison, repair, diagnostics, tests (`npm run test:voice`), and saved Sites rollback versions.

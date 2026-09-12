# Explorer cursor acceptance plan

## Release gate

Local appearance review is required before publishing this feature. The explorer is a visual replacement for the mouse over the main map, not a voice assistant or a change to map interactions.

Baseline source: `main` at `522254b839207d06177eb455d2d1512730c794c4` (already on GitHub). Implementation branch: `codex/map-explorer-avatar`. The deployed V10 is unchanged during development.

## Acceptance checks

- Explorer has the accepted small backpack traveler appearance, with a clear, exact pointer hotspot.
- Pointer follows fast movements without a speed cap; any smoothing is slight and removed for reduced motion.
- Visible only for mouse interaction on the main map, including ocean and regions; hidden on map exit, controls, forms, sidebar, window blur, and touch input.
- Native cursor is retained if the artwork fails to load. Setup/settings map previews retain their current behavior.
- Explorer cannot intercept pointer input or obscure useful hover photos/text.
- Region clicks and keyboard activation open the correct region.
- Drag pan, wheel zoom in/out, zoom buttons, and Reset view work with the explorer active.
- Pointer decoration stays the same visual size and follows screen coordinates while the map pans/zooms.
- No leaked animation frames/listeners, per-frame React renders, model/backend changes, or new network service requirements.
- Existing image/media regression tests and TypeScript pass. Browser checks distinguish verified interactions from untested physical devices.

## Rollback

During local review, `main` remains the exact prior source checkpoint; development is isolated on the feature branch. Do not discard uncommitted work to switch versions. Preserve a committed checkpoint before switching branches.

Production remains V10 until explicit appearance approval. If a later release needs rollback, redeploy the saved V10 archive `appgprj_6aa4e20d247481919c8e4504291cbfd8~appgver_c4f303828a2c8191bc0fd48312400e5c`. Source tag: `mind-travel-board-v10`. A code rollback does not rewind saved map data.

## Local review results — 2026-09-12

Implementation is ready for appearance review, not yet published. The explorer is a pre-rendered 3D sprite, not a live mesh.

- Agent verification: 27 controller/rendering checks and TypeScript passed, including touch/pen filtering, image failure/recovery, reduced motion, uncapped smoothing, exact hotspot, edge positioning, idle frames, observer/listener cleanup, and Setup preview opt-in isolation.
- Parent browser checks: artwork loads with real alpha; mouse entry shows it; SVG cursor becomes `none`; overlay pointer events remain `none`; zoom controls restore the native pointer. Exact hotspot matched observed click coordinates.
- Parent browser checks: zoom-in/out controls, drag pan, wheel zoom in/out, Reset view, region selection, keyboard Enter selection, sidebar exit, form isolation, and opposite-edge clamping passed with the avatar integrated. Final wheel zoom-out returned scale 1.765 to 1; the zoom-out button returned scale 1.5 to 1.
- Photo tooltip loaded the existing local attachment (natural width 1248) alongside the visible explorer. Tooltip z-index 5 remains above cursor z-index 3; screenshot inspected.
- Found and fixed a capture-phase descendant `pointerleave` issue: leaving a region/path must not hide the cursor while still on the SVG. Added regression coverage.
- Found and fixed map resizing when a panel opens without a window resize. Browser recheck confirmed the stale cursor hides and the next map pointer event places it correctly.
- Existing `npm run test:images` passed. No production or local memories were added, changed, or deleted; existing drafts were not edited. No hosted auth testing.
- Browser checks used the actual desktop in-app browser, including its narrow side-panel layout. Physical touchscreen/stylus and OS reduced-motion toggling were not exercised; deterministic controller tests cover those paths. Browser viewport override was reset after inspection.
- Preview screenshot: `eval/avatar-local-preview.jpg`. Local review URL: http://localhost:5174/ (development server must remain running).

The Sites build helper fails on this Windows host resolving npm's executable. The project's direct `npm run build` succeeds; this is a tooling fallback, not an application change. The final build rerun after the resize-observer fix passed all five compilation stages.

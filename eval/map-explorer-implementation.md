# Map explorer cursor implementation

The main map opts into `MapExplorerCursor` through `WorldMap`'s optional `explorerCursor` prop. The default is false, so Setup's map preview keeps its native cursor. This is a decorative, pre-rendered 3D character sprite, not a live 3D mesh, voice assistant, or model integration.

## Interaction contract

- Only primary mouse pointers over the actual SVG map activate it. `elementFromPoint` verifies the visible target even during a captured drag; overlaid controls, panels, inputs, and other UI keep their native cursors. SVG regions with button semantics remain map targets. Future embedded controls can opt out using `data-map-cursor="native"`.
- A 6 px dark dot with a white ring shows the exact native click point. The explorer stands just above and left of it, with approximately 24 ms exponential smoothing. Travel distance is never limited. Entry and mouse-down snap to the current point; the underlying event coordinates always remain native.
- The figure uses CSS pixels and does not scale with map zoom. It flips/clamps inside map edges. The map clips decorative pixels and has its own stacking context, keeping other UI above it. Photo/keyword tooltips have z-index 5; the cursor layer has z-index 3, so it cannot obscure tooltip text or images.
- Overlay and children use `pointer-events: none`, are hidden from assistive technology, and cannot drag. There is no input interception, synthetic click, pointer capture, or global cursor suppression. Only the active SVG and its descendants receive `cursor: none`.
- Touch, pen, and nonprimary pointers retain native behavior. Either the existing app reduced-motion setting or system `prefers-reduced-motion` disables smoothing. The system setting is observed live.
- Leaving the map, window blur, document exit, pointer cancellation, visibility change, scroll, resize, page hide, keyboard interaction, image error, and unmount restore the native cursor. A ResizeObserver also hides it when opening a panel changes the map size without a window resize; the next mouse movement uses fresh map bounds. Every listener, observer, and pending animation frame is removed at unmount. Animation stops once the figure reaches the target.
- A failed or incomplete sprite never suppresses the native cursor. A later successful load can recover on the next mouse movement.

## Asset

Project asset: `public/images/map-explorer.webp` (81 × 192, transparent WebP, approximately 9.4 KB). Rendered within a 30 × 58 CSS pixel box. Generated with the built-in image generation tool; the original transparent PNG remains at `C:/Users/jolen/.codex/generated_images/01a097f7-22ae-7000-9f07-a149bb050ba9/exec-0ab26f5f-091e-4822-a2c4-40828c710f63.png`. Sharp only trimmed transparent padding, resized, and encoded for delivery; no programmatic illustration was used. No runtime dependencies were added.

Final generation prompt:

> Use case: stylized-concept. Asset type: transparent small cursor sprite for a minimalist map web app. Create one charming miniature 3D-rendered backpack explorer, full body, standing in a slight walking-ready pose, viewed from behind at a three-quarter angle so the backpack is prominent and a small side profile is visible. Rounded simple toy-like proportions, short dark hair, warm neutral skin, teal jacket, warm ochre backpack with a small rolled blanket, charcoal trousers, dark hiking boots. Clean sculpted surfaces, soft studio light from upper left, strong readable silhouette at 48 pixels tall, subtle dimensional shading. Center the whole figure, occupy most of a square canvas with a small transparent margin, feet near bottom. Genuinely transparent alpha background, no scenery, no floor plane, no cast shadow outside figure, no labels, no text, no watermark, no frame, no checkerboard artwork. A single polished pre-rendered 3D character cutout, not a sprite sheet.

## Verification and review

Run `npm run test:map-explorer` for 27 passing behavior checks against the actual pointer controller with deterministic DOM/event/frame fixtures and the real WorldMap/cursor JSX rendered through React. Coverage includes image readiness and failure recovery, exact targeting, uncapped movement, motion preferences, edge placement, captured-target filtering, descendant pointer exits, nonmouse input, native event preservation, idle scheduling, panel-driven map resizing, lifecycle hiding, full listener/observer/frame cleanup, and default-off preview rendering. Run `node node_modules/typescript/bin/tsc --noEmit --incremental false` for type validation.

Browser review selectors: `[data-testid="map-explorer-cursor"]` exposes `style.visibility`; `[data-testid="map-explorer-hotspot"]` exposes the exact `translate3d` coordinates; `svg[data-explorer-active]` means native suppression is active. Real browser checks must verify pan/zoom/selection, hover photo visibility, control crossings, fallback, and the appearance at ordinary display scaling. Parent owns production build and browser acceptance in `eval/avatar-acceptance.md`.

Publication is held for local appearance review. Source edits do not change hosting, auth, backend, world persistence, or model behavior.

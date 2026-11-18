# Optical archive and projection review

Date: 2026-11-19 (Asia/Shanghai).

## Design decision

The archive reading surface now follows the existing optical cassette: one thin, lightly frosted plane, a precise edge, restrained depth and the same warm-gray / charcoal / amber theme. The earlier paper spine, offset paper edges, nested text boxes and placeholder landscape are removed. Real archive images remain static. Interactive research and geometry belong in the projection view.

Narrative content uses chapters and complete paragraphs. Desktop body text is 18 logical px; compact and portrait body text is 16 CSS px. Questions, attempts, observations and later interpretation have separate roles. Research nodes and Cube presets drive their corresponding notes from the same selected state.

The initial research view favors readable labels. The explicit overview button fits the complete graph. Mobile reading starts around 38% of screen height, preserving the archive carrier above it; the long text remains independently scrollable.

## Corrections found during self-review

| Observed problem | Correction |
| --- | --- |
| Paper construction made the reading interface feel unrelated to the optical archive | Removed the spine, multiple paper edges and nested panels; used shared optical theme tokens. |
| A second hard edge on research nodes recreated the stacked-paper problem | Replaced it with one shallow edge and a soft contact shadow. |
| First research node was centered, leaving dead space on the left and cropping the later history | Anchored the initial desktop view near the left, at a readable scale. |
| Initial fit reduced labels too far | Default scale is at least 0.84; deliberate overview remains available. |
| The overview control still enforced a readable minimum, so it did not actually fit the graph | Decoupled overview fitting from the default reading scale; preserved the fitted scale on zoom and reopen. |
| Mobile description and selected research node could overlap | Measured the header and tool area before positioning the node. |
| Reopening a graph reset the user's pan | Stored the view and stopped the first ResizeObserver callback from recentering it. |
| Pointer capture swallowed clicks on research nodes | Capture starts only after a pan or pinch is established. |
| Narrow Cube view cropped the mathematical eye marker and frustum | Fit the actual projected experiment bounds using the current aspect and inspection quaternion. |
| Dark Cube faces looked like a wireframe | Raised the opaque face luminance while preserving depth occlusion. |
| Mobile reading covered the archive carrier | Restored upper carrier space; checked the projected label position against the header and reading surface. |
| 320 px header search icon overlapped the brand | Reduced only the narrow portrait brand scale, retaining operation target sizes. |
| Later theme rules turned the optical divider and active tab line white | Scoped the optical styles strongly enough to retain gray separators and amber active state. |
| Small real collections inherited an invalid third-column selection | Derived the initial selection from a real catalog column and bounded collection row capacity to physical slots 12–31. |

## Interaction verification

The isolated browser harness uses the actual product modules and CSS. All research text is explicitly synthetic; Cube uses a generic 3×3×3 lattice. No private narrative, construction or retrospective is used in public evidence.

- Research projection: 14 initial runtime checks passed, with no page errors. Actual node clicks, time scrubbing, five-second playback, pause, pan/zoom, reopening state, keyboard focus, Escape return and reduced motion were exercised.
- Cube projection: 14 runtime checks passed, with no page errors. Real Three.js rendering and pixel readback were enabled. Drag, wheel and native two-finger pinch/twist changed inspection without changing the mathematical observation point or count revision. The observation viewport did change the experimental point and trigger a new estimate.
- Cube editing: layer removal, undo/redo, focus retention, preset/notes synchronization and preservation of experimental state and inspection pose all passed.
- Projection layouts: 1440×960, 390×844 and 320×740, in both light and dark themes, had no horizontal page overflow.
- Seven focused follow-up checks passed with no page errors, covering actual full-graph fit, zoom continuity, reopen after fit and immediate disposal during closing. Their separate report records the later source hashes.

Reproduction harness, per-check reports and selected generic screenshots are in `verification/optical-review/`. Run instructions and browser prerequisites are documented there.

## Main reading integration

Four checks used the actual main-page DOM with a private two-record collection: desktop light/dark, 390 px light and 320 px dark. The actual four-chapter story, font sizes, export control, lack of horizontal overflow, same-record projection entry and Escape focus return passed with no page errors.

These main-page screenshots used a test-only response patch to skip the heavyweight archive GPU draw, while retaining the actual scene simulation and matrices. They verify the reading surface and integration, **not the complete archive material or final GPU composition**. Projected reference geometry retained about 180 px of carrier height above the reading panel at 390 px width, and 146 px at 320 px; the carrier label was below the header and above the panel. These are projection measurements, not a rendered silhouette.

Two bounded real full-scene captures, without drawing suppression, timed out waiting for the detail endpoint in the software-rendered environment: 1200×800 after 65 seconds, then 800×600 after the final initialization fixes and correct reduced-motion preference after 43 seconds. No page error was recorded in either attempt. The full archive scene therefore still needs a hardware-browser visual pass; this is not replaced by successful component screenshots. Original shell geometry, lighting, extraction and return motion were not changed.

## Build and regression checks

- `npm run build`: passed, including TypeScript, Vite, export generation and offline manifest.
- `npm run archive:private -- /absolute/path/to/archives.json`: passed in an isolated directory; exactly two TXT exports, no public template overwrite.
- `npm run check:content`: 20/20 passed; original forty-file export bytes remained identical.
- `npm run check:optical`: six schema/story/collection checks plus arcball/parser checks passed. The small-collection test drives 4,000 selections, including uneven columns and coordinate rebasing.
- `node --experimental-strip-types scripts/check-loop.mjs`: 20,000 original-template moves passed; all 160 reference instances retained their order.
- `node --experimental-strip-types scripts/check-flowing-selection.mjs`: passed, including zero selection-event height jump and continuous wave expiry.
- `git diff --check`: passed.

Cube rotation regression crossed both poles, accumulated 10.4706 radians, and showed zero orientation difference between 30 Hz and 120 Hz damping integrations at the same elapsed time. Pixel visibility remains a finite-resolution view estimate and is labeled accordingly.

## Content boundary

The public repository contains generic rendering, interaction, schema and build code. Private research content is assembled in a separate ignored build directory. Missing original research or retrospective is represented as unavailable, without invented history. A graph used for interaction verification is never presented as a real research record.

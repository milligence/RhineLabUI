# Projection work: interrupted-environment recovery checkpoint

Date: 2026-11-20 (Asia/Shanghai)

## Delivery status

**The final implementation was modified and tested locally, but was NOT committed or pushed.** The execution environment disconnected during final bookkeeping and was then explicitly marked unavailable. File access and the browser tools became unavailable.

Public main remains `d20ca8957fa4f5f197873a2500f1f821c4ab80d6`. This checkpoint is on a separate review branch and does not advance production main. Do not mistake this document or the inherited R1 preview bundle for the final implementation.

An earlier full-scene review bundle was already preserved at commit `90e76d89d6b8e69afa563b2c7dce29081f24f486`, path `reference/projector-world-review.bundle.html`. It is **R1**, before the final typography and beam material iterations, and contains public synthetic fixtures only.

## Intended sequence, implemented locally

Time below begins only after the original vertical extraction/details camera has made the real source aperture visible, front-facing and settled.

| Time | Visible action | Camera |
| --- | --- | --- |
| 0–550 ms | Glass aperture charges from its internal chamber | Hold source and receiver composition |
| 550–1350 ms | Four-sided world-space beam reaches the receiver | Hold |
| 1350–1850 ms | Finite transparent rectangular frame closes from the receiving corner | Hold |
| 1900–3600 ms | Actual research paths/nodes/labels or Cube geometry form progressively | Hold |
| 3600–4200 ms | Physical archive, source, beam and legible content coexist | Hold |
| 4200–6800 ms | Existing image enlarges and straightens into reading | One C2 approach |
| Return | Same state field reverses continuously, including interrupted re-entry | 2400 ms nominal return |

Reduced motion enters a stable endpoint. The source is prepared smoothly from a rotated reading state, with the previous reading rotation restored on cancellation/return.

### Spatial and rendering corrections

- Receiver corners derive from the real archive aperture corners and normal, not a default camera plane. Minimum forward clearance is 0.9 world units; rays no longer pass through the source cover.
- The beam has four transparent side faces, 16 vertices and 8 triangles. No receiving end cap obscures the text, no screen-space white aperture duplicates the real port, and no entire-card silhouette cuts a hole in the light.
- With Bokeh active, ProjectorBeamPass draws after Bokeh and before SMAA/Output, sampling the exact existing packed scene depth. With Bokeh off, the beam uses normal hardware depth in the beauty pass. Original archive DOF remains unchanged.
- The projector pass restores layer masks, background, override material, render target, autoClear and depth state through finally blocks.
- Content formation uses an independent linear clock with local easing once. There is no per-frame full-page PNG mask encoding.
- Research edges grow by real SVG path arc length; node cores precede names. Cube outlines precede local-height ceramic deposition; shadow depth uses matching formation.
- Camera and DOM/frame projection share the same presented camera. A previous inertia tail that advanced and then returned to zero was removed.

### Actual visual iterations completed

1. R1 held content looked like a microscopic complete interface. Added display-space compensation for structure and a small set of semantic landmarks while retaining map coordinates.
2. R2 approach produced overlapping translucent minor labels. Final rules keep minor names at native size and reveal them crisply with clipping at presentation scale 0.80–0.96. At 5550 ms they remain hidden.
3. R5 narrow-screen held state selects 2–3 fully visible landmarks from actual map placement and text bounds. Selected text remains in the bottom caption. At 390×780, observed anchors were “保留疑问” and “边界试验”, with the selected long caption below; no clipped half-name remained.
4. Last small CSS polish balances long caption wrapping and reserves the read-action's natural width. This last change compiled and passed diff checking but **was not browser-reviewed after the environment interruption**.
5. Native EGL raster diagnostics exposed a nearly invisible light-theme beam and an over-bright dark-theme beam. Pass 3 separates a narrow reflection lip from a subtle offset absorption shoulder. Mid-ray light-theme luminance differences became roughly 7–18/255, with local positive highlights 3–10/255; dark-theme maximum increment was about 60/255. Display-space widths were checked at DPR 1 and 2. These are component diagnostics, not a complete scene screenshot.

## Local working locations

The environment may or may not preserve these paths on recovery; verify availability first.

- Public repository: `/workspace/scratch/865ea2cc5275/RhineLabUI`
- Private content working snapshot: `/workspace/scratch/865ea2cc5275/inscriber-cube-archive`
- Browser screenshots and observed DOM reports: `/workspace/shared/rhine-world-evidence/`
- Last complete optical bundle before caption CSS: `/workspace/shared/rhine-world-optics-r5/projection-cinematic-review.bundle.html`
- Final optical bundle including caption CSS: `/workspace/shared/rhine-world-optics-final/projection-cinematic-review.bundle.html`

### Modified/added implementation and review files

```text
DESIGN.md
docs/PROJECTION-WORLD-STAGING-2026-11-20.md
src/carrier-flight.ts
src/carrier-optics.ts
src/cube-optics.css
src/cube-projection.ts
src/main.ts
src/projection-atmosphere.css
src/projection-viewer.ts
src/projector-beam.ts
src/research-optics.css
src/research-projection.ts
src/scene.ts
src/shared-depth.ts
reference/archive-flow-review.js
reference/projection-cinematic-review.html
reference/projection-cinematic-review.ts
scripts/check-carrier-flight.mjs
scripts/check-carrier-optics.mjs
scripts/check-entry-routing.mjs
scripts/check-projection-ui-state.mjs
scripts/check-projector-beam.mjs
scripts/check-projector-pipeline.mjs
scripts/review-archive-flow.mjs
verification/projector-world-2026-11/
```

The offline review builder can embed the exact public GLBs and selected vendored MiSans subsets. Its file was created but native-browser organization policy blocked file URLs. No browser security or policy restriction was bypassed.

## Validation already completed

All eight focused checks returned exit 0:

```text
npx tsc --noEmit
npm run check:projection
npm run check:carrier-optics
npm run check:projection-ui-state
npm run check:optical
node --experimental-transform-types scripts/check-projector-beam.mjs
node --experimental-strip-types scripts/check-projector-pipeline.mjs
git diff --check
```

Logs were saved under `verification/projector-world-2026-11/checks/final-*.log`, together with `final-verification.json`. Twenty tracked implementation/check files were byte-stable during those checks.

After the last caption-only CSS edit, TypeScript and diff checking ran again successfully. The manifest update itself was interrupted before a process could be created:

- File: `src/research-optics.css`
- Final SHA-256: `692574fc73b0b3167e9bfaf9250aed51c0813ed6426a1de6a95915cc28de5329`
- Old hash still potentially in the manifest: `889e3e32551ee643932b66214e7de100de01e41cc61149bd80ce01c535621861`
- Final CSS sampling time: `2026-11-20T09:53:52.785Z`

Public `npm run build` returned exit 0. Its log was written to `checks/public-build.log`; the new release ID was not read before disconnection. **The final private build was not run.**

### Numeric scope

- 22 production Scene stage cases using the actual GLB aperture.
- 324 reversal combinations.
- 25 scaled display-stage cases.
- Minimum forward receiver clearance: 0.9 world units.
- Maximum DOM/Three alignment residual approximately 0.000001075 px.
- Eight old actual-GLB ray-through-cover counterexamples were retained.
- Entry-readiness numerical report retained at `checks/ENTRY-READINESS.md`, with executable model and JSON. This is simulation, not browser latency.
- Default 60 Hz array-to-ready simulation: approximately 3366.667 ms desktop and 3083.333 ms phone. Already settled reading: 16.667 ms. Legal ±0.8 rad rotation preparation: approximately 2150 ms. No artificial timer was added to replace geometric readiness.

### Real GPU shader/component diagnostics

Existing native EGL/Mesa llvmpipe compiled and linked six complete Three-expanded programs: beam composer, beam direct, Cube ceramic, Cube outline, Cube formation shadow depth, and OutputShader. All compile/link logs were empty.

Production beam geometry and shader were rasterized into RGBA16F with normal alpha blending and actual Three ACES/sRGB output. Packed-depth occlusion was exercised: foreground depth removed all beam pixels, while far depth was pixel-identical to the unoccluded image, in both themes and DPR 1/2.

Evidence and reproduction scripts were saved under `verification/projector-world-2026-11/shaders/`. These diagnostics omit the complete archive assets, AO/DOF/SMAA composition, DOM and continuous full-scene camera motion.

## Browser observations and limitations

The production ResearchProjection DOM/Canvas implementation was inspected through a clearly labelled synthetic optical calibration source:

- Desktop 2600 ms formation, 3850 ms held, 5550/6200 ms approach, 6800 ms reading.
- 390×780 held and reading.
- Dark held composition.
- Continuous samples through beam arrival and initial frame formation.
- Screenshots and corresponding DOM report JSON were saved before disconnection.

R5 optical bundle:

- Bytes: 333310
- SHA-256: `f946303349450f3d770e7d8ccf23f35d411cdf08eb289a301c54f0b7bbb7ceed`
- Source digest: `87a337ae8a5250d11bb0031eaf71979c97836b32c20529809b488fa14b087f5f`

Final optical bundle, including unreviewed caption balancing:

- Bytes: 333314
- SHA-256: `8eed4cf4d1013125ade5c7dabda0ff0fc89d2792d26cad2192876e101b956841`
- Source digest: `e8d9c2c05894136cb6755dc86718a6313e612dde8ac2c6183652310c3db0c1a6`

**Neither final bundle was published.** The browser tab still had an older immutable URL with a locally loaded R5 payload; that URL must not be presented as the final source identity.

Cloud Chromium reports `GL_VENDOR=Disabled`, `GL_RENDERER=Disabled`, and `Error creating WebGL context`. A full-scene review URL was opened, but the current actual ArchiveScene, physical glass port, final composited beam and Cube pixels are **not visually accepted**. Native Chromium attempts encountered a certificate interstitial and an organization-blocked file URL; neither was bypassed.

No frame-rate acceptance, actual touch-device acceptance, or private-content visual acceptance is claimed. A rapid extreme orientation change during the held stage can still crop the original source card while preserving the original entry world basis.

The last browser return/re-entry action failed at transport level. Do not claim it was observed. Final caption wrapping, reduced-motion close cleanup and the frozen final URL still need the planned actual browser check.

## Content preservation

This turn did not rewrite the private narrative. The earlier character-centred reconstruction remains historical work, and its editorial/math checks were not rerun here.

Unchanged private archives SHA-256:
`72bf1ed12ab6555e63be9523ed1b746e4f42bf24a7ef6bcf899ecd99a434589b`.

An exact previous verification receipt snapshot was saved locally at `site/verification/2026-11-20-physical-projector/verification-snapshot.json`, bytes 11677, SHA-256 `ad995669cf2a5fcb502662076094ac425cd6e2cc43f2970520de42d2725be76d`. It was not published. No private prose or construction states are included in this public checkpoint.

## Resume from here

1. Restore access to the existing workspace; do not reconstruct exact code bytes from this prose if the working tree survives.
2. Inspect `git status`, confirm the final CSS hash, and finish the interrupted verification manifest bookkeeping.
3. Load the final optical bundle and confirm the 390 px balanced caption; finish return/re-entry, reduced-motion cleanup and frozen-preview identity checks. Do not claim full ArchiveScene acceptance without actual WebGL observations.
4. Read the successful public build identity and run the isolated private build against unchanged archives. Preserve the content hash.
5. Copy actual screenshots/DOM reports into the repository evidence directory and write the final scoped report, preserving the failed baselines.
6. Rebuild and publish immutable final optical/full-scene review bundles. Commit the implementation and evidence with exact tree comparison and an expected-head lease before advancing main.
7. Update the private verification receipt/README and exact historical snapshot without changing archives content.
8. Report the real published commits, build identities and remaining visual limits. The user has already authorized the implementation; do not ask for redundant approval merely to resume.

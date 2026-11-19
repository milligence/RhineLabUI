# Strict archive flow — public evidence index

This directory records the 2026-11-19 review of the archive array, physical unseal, research projection and Cube interaction. All **15 public screenshots** show the fictional review collection: five groups of ten records. They contain no private research narrative. The review collection is an isolated fixture and does not replace the normal public collection.

The [main review report](../STRICT-ARCHIVE-FLOW-2026-11.md) explains the defects and corrections. [ARCHIVE-STRICT-FLOW.md](../../docs/ARCHIVE-STRICT-FLOW.md) gives the design and reproduction procedure, including `npm run review:collection`, the generated `reference/archive-flow-review.html`, and its local review server.

## Audit and release identity

| Item | Recorded value |
| --- | --- |
| Collection audit completed | `2026-11-19T11:53:08.400Z` |
| Audited build | `9630ae718c672bda` |
| Final public build | `d0ce53429496298e` |
| Collection | 50 fictional records; five groups of ten |
| State assertions | 236; zero recorded failures |
| Subsequent change | Responsive white-veil CSS coverage and review-page opening-size variables |

These are build identifiers, not Git commit hashes. [array-5x10.json](array-5x10.json) retains the original audit time and `auditedBuildVersion`, and separately identifies `finalPublicBuildVersion`. The 236 assertions were **not rerun after the final CSS correction**. The five source hashes in that receipt were checked again and still match the final state: `src/scene.ts`, `src/archive-arrival.ts`, `src/carrier-flight.ts`, `src/projection-viewer.ts`, and `content/fixtures/array-5x10.json`. Their hashes are also recorded in [media-manifest.json](media-manifest.json).

The final veil correction received a separate observation on the normal main page, starting at `?arrival=web&time=21.8` without freezing. At default quality in a 900 × 614 content viewport, the observed frames showed full veil coverage and the array emerging beneath it, without the previous left grey band. That observation did not reach the automatic arrival endpoint. It does not constitute another complete collection audit or a continuous real-time acceptance run.

## Public screenshot index

Screenshots were captured in a 900 × 700 Chromium window with a 900 × 614 content viewport. The flow review used the actual archive GLBs and production components at fixed-step checkpoints. Projection times below are **presentation time after ignition**, following physical carrier readiness; they are not wall-clock playback measurements. The manifest provides each original file's byte count, detected image format, dimensions, SHA-256 and Git blob SHA.

| # | Public file | Visible checkpoint |
| --- | --- | --- |
| 1 | [arrival-brand-before-handoff.png](media/arrival-brand-before-handoff.png) | Settled brand immediately before the opening layout releases. |
| 2 | [arrival-brand-after-handoff.png](media/arrival-brand-after-handoff.png) | Brand and array after the interactive layout takes over. |
| 3 | [unseal-1s.png](media/unseal-1s.png) | Physical extraction at 1.0 s; reading-paper visibility remains zero. |
| 4 | [unseal-4p5s.png](media/unseal-4p5s.png) | After physical clearance and camera convergence, paper is partly visible at 4.5 s. |
| 5 | [projection-0p5s.png](media/projection-0p5s.png) | The archive source is lit; the full research image is still absent. |
| 6 | [projection-1p6s.png](media/projection-1p6s.png) | The cone and projected-plane boundary establish the optical connection. |
| 7 | [projection-2p6s.png](media/projection-2p6s.png) | The formed research image holds above its archive before camera approach. |
| 8 | [projection-3p6s.png](media/projection-3p6s.png) | Camera approach enlarges the image as the archive leaves the view. |
| 9 | [projection-5p6s.png](media/projection-5p6s.png) | The research projection has settled into its interactive surface. |
| 10 | [projection-return-1p5s.png](media/projection-return-1p5s.png) | Return +1.5 s: archive, cone and contracting image are visible together. |
| 11 | [cube-held-image.png](media/cube-held-image.png) | Cube imagery holds in the projected plane before the approach. |
| 12 | [cube-camera-approach.png](media/cube-camera-approach.png) | The camera approaches the Cube projection. |
| 13 | [cube-open.png](media/cube-open.png) | The Cube interaction surface is open. |
| 14 | [cube-rotated.png](media/cube-rotated.png) | A drag changes the Cube's face presentation and tilt. |
| 15 | [cube-excavated.png](media/cube-excavated.png) | An excavated cell exposes a cavity with an amber outline. |

The first two frames permit a direct comparison of the brand's position and size across layout handoff. The unseal frames record the delay before paper appearance; the 4.5 s state has paper visibility `0.307`. The research and Cube frames record the relationship between the archive source, beam, image and approaching camera. They are selected rendered checkpoints, not a video.

## Additional observer notes

These observations were made through the review UI. Where noted, the supporting screenshot is retained locally and is **not one of the 15 public images**.

### Cube interaction and return to the array

Record `X-005` was projected directly from the array. Reading-paper visibility remained zero on this route. In the final Cube view, dragging visibly changed the presented faces and tilt. Selecting the excavation experiment and clicking a face cell produced the cavity and amber outline shown in the public images.

The product's return-to-archive action was then used, followed by six seconds of review-clock advancement. The observed endpoint was the array with `X-005` still selected and paper visibility zero; it did not enter the reading view. That endpoint screenshot is retained locally as `cube-returned-array.png` and is not part of the public media set.

### Long title and long reading record

At a 900 × 614 content viewport, fictional record `X-006` showed its long title in the array's right-side preview without overlapping the action area. Its five-chapter reading record opened on the paper with normal line wrapping. The two supporting screenshots, `long-title-array.png` and `long-record-reading.png`, remain local and are not part of this public index. These observations describe the inspected viewport and fixture; they do not assert coverage of every title length or screen size.

## The 236 collection assertions

The [collection receipt](array-5x10.json) contains the actual assertions and retained endpoint state frames.

| Assertion name in JSON | Count | Checks |
| --- | ---: | --- |
| `five groups of ten` | 1 | Fixture collection shape. |
| `selection identity` | 50 | Selected record identity across all records. |
| `paper follows carrier clearance` | 50 | Paper timing follows physical clearance. |
| `open reaches readable state` | 50 | Each opening reaches its readable endpoint. |
| `return clears paper and outgoing copies` | 50 | Each return clears paper and outgoing carriers. |
| `forward seam continues physical row` | 5 | Forward group-boundary continuity. |
| `reverse seam restores row` | 5 | Reverse group-boundary restoration. |
| `interrupted opening resumes` | 25 | Interrupted openings can resume. |
| **Total** | **236** | **Zero recorded failures.** |

## Other checks and evidence limits

| File | Scope |
| --- | --- |
| [arrival-checks.json](arrival-checks.json) | Six deterministic groups covering monotone arrival, brand settlement, stalled-frame timing, paper gates, text timing and completed-film inheritance. |
| [entry-checks.json](entry-checks.json) | Thirteen groups executing actual main entry/return functions with inert DOM and scene fixtures, including array/reading routes, cancellation, focus and first entry. |
| [carrier-checks.json](carrier-checks.json) | 252 reversal cases and 25 scaled-parent painter cases; calculated maximum projection error below 0.000001 CSS pixels and calculated exposed overlap zero. |

The collection driver integrates the actual `ArchiveScene` at fixed 60 Hz and draws the original GLBs at selected checkpoints. It used the existing Super Performance configuration for the software renderer. **A 60 Hz state integration is not a 60 FPS rendering measurement.** The checks establish state order, identity, clearance and interruption behavior; the screenshots establish composition at the inspected points. Neither provides continuous real-time or full-hardware visual certification.

The static reading review is useful for prose and page composition, but does not establish carrier-animation behavior. Production `ProjectionViewer` mounts to the unscaled `#viewport`; an earlier QA fixture's scaled `#stage` mounting was corrected. The generic scaled-parent painter checks cover additional component robustness and do not imply that the production viewer had that mounting error.

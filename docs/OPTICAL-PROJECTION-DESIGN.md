# Archive optical projection — visual specification

Accepted direction, 2026-11-19. The projection is an intrinsic capability of the selected archive carrier. The priority is a coherent, expressive stationary composition, followed by uninterrupted transitions and useful interaction. This document defines the intended result before implementation; verification is recorded separately.

## Material and composition

- Inherit the archive's ivory, graphite and restrained amber; directional light, internal occlusion, shallow optical depth and generous negative space establish the visual identity.
- Weight belongs to precise material edges and a strong type hierarchy. Avoid thick cabinet borders, decorative hardware, dense HUD circles and bloom around text.
- Graph and cube occupy a local observation volume. Their reading surfaces remain front-facing and sharp. A few calibrated particles may drift inside light volumes; reduced motion freezes them.
- Default cube is large and opaque, with legible cavities. Eye markers and camera frusta appear only when the observation task calls for them. Render-only edge shading must not change the exact voxel visibility geometry.

## Five key frames

1. **Archive ready.** Selected carrier, identity and two stable actions form one composition. Text does not follow the moving wave. Actions appear only when usable.
2. **Projection ignition.** Light starts at the actual selected carrier, widens into a shallow optical cone, and opens a shared observation volume. Identity survives the handoff. Background and content do not jump to unrelated coordinates.
3. **Complete evolution.** The complete research genealogy is present. Research mechanisms form the spine; negative tests and alternative directions form branches. Administrative events remain in the source catalogue rather than receiving equal visual weight. Split and merged research nodes retain explicit provenance. Each node bears only its essential name; phase markers and branch paths give the map structure. Panning, zoom, keyboard navigation and an explicit full-tree action remain available.
4. **Focused node.** The camera continuously approaches a selected node. It grows and settles in the lower left. A cone of restrained light opens upward. Contemporary record, later retrospective and evidence form an asymmetric connected constellation, not three sequential cards. Upstream/downstream links remain reachable and the full tree recedes behind the focus.
5. **Return.** The focus contracts to the same graph position; leaving the projection returns to the selected carrier and preserves reading state. Interruptions always start from current displayed values.

## Focused reading geometry

The lower-left node anchors an upper-left contemporary record and an upper-right retrospective. Evidence spans the lower-right junction between both; source references and relationship labels explicitly show what supports the observation and what informs the retrospective. Related nodes are direct navigation targets. Each text region scrolls internally when necessary, without moving the anchoring node or hiding its siblings. Small screens recompose this relationship into a readable upper projection and lower connected reading surface; they retain all three layers.

## Narrative contract

Chronological, restricted third person. A paragraph advances a question, evidence, decision or consequence. Keep actors, conditions and the epistemic state explicit. Preserve negative tests and withdrawn conclusions. Source-attributed retrospective has its own date and evidence; later understanding is never silently assigned to an earlier node. Original source text stays unchanged in the private content repository.

## Acceptance gates

- Real application screenshots at desktop and narrow viewport, both themes, overview, focused record, cube inspection and cube observation.
- Actual rendered continuous transitions for the opening handoff, archive-to-projection and node focus, including interruption and return. Numeric state tests supplement this review.
- Full source-event coverage through research nodes and retained archive context; short, unclipped names in the overview; complete readable contemporary record, retrospective and evidence after focusing.
- Mathematical cube state is invariant under inspection rotation; edits/undo and observer changes behave distinctly.
- No private research content or source-bearing screenshots committed to the public UI repository.
- Explicitly record any environment-specific visual verification limit; a synthetic isolated component check alone cannot count as full-flow acceptance.

## Refinement after actual screenshots

The first focus composition gave all three layers the same rectangular weight. The implemented refinement keeps the contemporary record as the stable foreground, gives hindsight a lighter offset optical plane, and opens evidence into a source rail. The R/H connectors end at actual source-group ports. Narrow screens retain readable graph scale and a complete topology navigator instead of compressing all node labels into one screen. Acceptance and the unresolved full-scene readback limitation are recorded in [the verification report](../verification/ARCHIVE-PROJECTION-2026-11.md).

## Narrative and carrier revision (previous iteration)

The next revision makes the extraction, image formation and camera transfer separate visible events on one continuous timeline. Extraction finishes according to the actual carrier height and camera state. The main scene keeps rendering; the aperture and edge are sampled from the real carrier every frame. The optical image forms and holds before the camera moves toward it. A shared reversible quintic curve governs both research and experiment projections. Rotation clearance and vertical-only carrier motion remain unchanged.

The research graph now supports authored positions, primary and secondary relationships, short phase navigation, and an explicit chronological narrative route. Labels are placed in screen space with upper/lower alternatives; viewport clipping prevents a zoomed graph from entering the navigation rail. Switching phases continues from the displayed camera state. Source-association lines use local layout coordinates so the temporary perspective of the whole projection does not displace their endpoints.

The prose contract also requires causal weight: an observation must force a decision, a new operation must answer a specific problem, and a result must change what happens next. Independent cold reading checks for misplaced emphasis, premature hindsight and redundant summaries. See [the current revision report](../verification/RESEARCH-NARRATIVE-CARRIER-2026-11.md) for what was actually verified.

## Intentional entry and continuous optical transfer

The ordinary website now completes its opening at the archive array, before extraction. The first record remains sealed. Research and experiment records share one explicit **Unseal archive** action; opening the first research record must show the same physical clearance, glass reveal and text reveal as opening any other record. The reference-film timeline and an explicitly enabled Wallpaper Engine detail presentation retain their separate playback behavior.

The next optical transfer removes the held image followed by a late pan. The image occupies a stable optical plane, and the physical camera and the DOM image use the same projected geometry. The camera turns toward the plane along a short arc and approaches it; the source leaves the image's reading region through parallax before the environment takes over. The normal camera's remaining motion continues underneath this optical offset. Source light lasts only through formation, and the image never waits at full opacity for a separate camera animation. Entry, interrupted entry and return share one bounded continuous path. The carrier still moves only vertically.

A research record begins with a compact brief that identifies the method, its purpose, the observed result and its boundary, above catalogue metadata. Chronological chapters follow. Hindsight states its conclusions directly; dates and sources identify its later perspective without introductory phrases such as “the retrospective points out.”

Reading arrows scroll the article, while archive navigation belongs to the array. A cancelled projection returns to the route that requested it, even while the carrier is still rising. On small or short screens, choosing a different research node restores the top of its optical composition instead of inheriting the old record's reading position. Actual checks and remaining limitations are recorded in [the entry refinement report](../verification/ARCHIVE-ENTRY-REFINEMENT-2026-11.md).

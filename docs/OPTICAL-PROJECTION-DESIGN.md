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
3. **Complete evolution.** Every source node is present. Each node bears only its essential name; temporal phase markers and branch paths give the whole map structure. Panning, zoom, keyboard navigation and an explicit full-tree action remain available.
4. **Focused node.** The camera continuously approaches a selected node. It grows and settles in the lower left. A cone of restrained light opens upward. Contemporary record, later retrospective and evidence form an asymmetric connected constellation, not three sequential cards. Upstream/downstream links remain reachable and the full tree recedes behind the focus.
5. **Return.** The focus contracts to the same graph position; leaving the projection returns to the selected carrier and preserves reading state. Interruptions always start from current displayed values.

## Focused reading geometry

The lower-left node anchors an upper-left contemporary record and an upper-right retrospective. Evidence spans the lower-right junction between both; source references and relationship labels explicitly show what supports the observation and what informs the retrospective. Related nodes are direct navigation targets. Each text region scrolls internally when necessary, without moving the anchoring node or hiding its siblings. Small screens recompose this relationship into a readable upper projection and lower connected reading surface; they retain all three layers.

## Narrative contract

Chronological, restricted third person. A paragraph advances a question, evidence, decision or consequence. Keep actors, conditions and the epistemic state explicit. Preserve negative tests and withdrawn conclusions. Source-attributed retrospective has its own date and evidence; later understanding is never silently assigned to an earlier node. Original source text stays unchanged in the private content repository.

## Acceptance gates

- Real application screenshots at desktop and narrow viewport, both themes, overview, focused record, cube inspection and cube observation.
- Actual rendered continuous transitions for the opening handoff, archive-to-projection and node focus, including interruption and return. Numeric state tests supplement this review.
- Full source-node coverage; short, unclipped names in the overview; complete readable contemporary record, retrospective and evidence after focusing.
- Mathematical cube state is invariant under inspection rotation; edits/undo and observer changes behave distinctly.
- No private research content or source-bearing screenshots committed to the public UI repository.
- Explicitly record any environment-specific visual verification limit; a synthetic isolated component check alone cannot count as full-flow acceptance.

## Refinement after actual screenshots

The first focus composition gave all three layers the same rectangular weight. The implemented refinement keeps the contemporary record as the stable foreground, gives hindsight a lighter offset optical plane, and opens evidence into a source rail. The R/H connectors end at actual source-group ports. Narrow screens retain readable graph scale and a complete topology navigator instead of compressing all node labels into one screen. Acceptance and the unresolved full-scene readback limitation are recorded in [the verification report](../verification/ARCHIVE-PROJECTION-2026-11.md).

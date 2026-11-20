# Archive direction study — 2026-11-20

This is a design proposal for review, based on `ae0458c668d6a9ed0cc5803720b9428c564c4ae5`. It does not replace the production entry, archive array, projection viewer, or content. The accompanying study uses synthetic prose and schematic geometry. It contains no private archive extracts or experimental measurements.

## Proposed experience

The physical archive establishes provenance and spatial order. The text records a person's situation, decisions, actions, and observable consequences. The projected object makes one selected relationship, construction, or piece of evidence visible. These three functions share the selected event but have different visual responsibilities.

The existing array is the motion and material reference: a local selection starts a continuous field; neighboring objects respond by distance; residual motion survives interruptions; the field settles. Projection should inherit that continuity rather than assign a separate appearance animation to every interface block.

## What the current code actually does

- `src/projection-viewer.ts` appends the entire header and content host to `.projection-plane`. Reading, controls, and projected content therefore share the same transformed plane.
- `src/research-projection.ts` already creates actual SVG paths and nodes. The current implementation must not be described as a screenshot tiled into blocks. However, node arrival follows horizontal placement, several labels share timing windows, and context/reading groups still receive aggregate exposure.
- `src/research-optics.css` and the focused research layout put multiple reading surfaces and an additional optical metaphor inside the projection.
- `src/motion.ts` provides a useful contrasting model: one continuous field with distance, signed crest/trough, residual pulses, and smooth limits.
- The physical aperture, world beam, scene sampling, and reversible `CarrierFlight` remain useful foundations.

## Proposed division of the interface

1. **Archive object:** storage, selection, vertical extraction, opening and return.
2. **Projected content:** a small set of event-specific objects, spatial relationships, actual images or geometric models. Only short identifiers needed to interpret these objects belong here.
3. **Reading position:** stable, readable text outside the projected plane. A single narrative column, with sources and retrospective material available on demand.

A full research graph remains useful as an explicit overview. It should not define the default presentation of every personal event. Some events need a photograph, a document comparison, a single construction, or no projection.

## Shot proposal

The timings below are an initial direction, not verified production parameters.

| Beat | Main visual task |
| --- | --- |
| Extract | Preserve the established vertical movement and neighboring residual wave. |
| Charge | Establish the small glass aperture as the source. |
| Reach | A restrained light field connects the source and the content position. |
| Form | One deterministic spatial front reveals meaningful geometry; only the active front carries fine transient particles. |
| Recognize | Briefly hold source, path and subject in the same composition. |
| Observe | Approach the same subject continuously, let transient optics settle, enable interaction. |
| Return | Resume from the current state, recover source/subject composition, then close and return the archive. |

The entire reading interface should not be imaged or materialized. Long text remains flat and stable. Finished content is the same object that formed during entry, with no end-of-animation replacement.

## Study controls and boundaries

`reference/archive-direction-study.html` is self-contained and has no external requests. It provides a deterministic Canvas2D study with:

- a fixed physical carrier and source aperture;
- sparse research relationships or an illustrative cube;
- a continuous reversible formation front;
- replay, reverse and scrubbing;
- an independent readable text column;
- reduced-motion handling and responsive layout.

It is a composition and formation sketch, not an implementation of `ArchiveScene`, the original GLB materials, production camera choreography, or measured scientific data. The illustrative cube makes no visibility-count claim.

## Next implementation gate

First approve the quiet composition at rest. Then build one complete production event using the existing archive, physical aperture, scene camera and material system. Observe it continuously at normal speed, including interruption and reversal. Only then generalize the event/presentation interface and populate other records.

The original full-scene review returned `Error creating WebGL context` in the current cloud browser. The DOM/Canvas projection review was viewable. This limits claims about production WebGL quality; schematic study validation does not substitute for it.

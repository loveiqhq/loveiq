# Report Archetype SVG Design

## Scope

Report only. The landing-page archetype carousel is intentionally left unchanged.

## Problem

The report archetype icons were inconsistent for two reasons:

1. Some report archetypes still used simplified placeholder SVGs instead of the source artwork in `read.txt`.
2. The report icon wrappers assumed every archetype could be rendered as a uniform `40x40` square, which made tall and wide marks feel cramped or visually off-balance across mobile and desktop breakpoints.

## Approved Approach

Use the report-only SVG replacement and per-archetype fit strategy.

- Keep the existing report structure.
- Move archetype SVG rendering concerns into a dedicated report icon module.
- Ensure every report icon accepts external sizing and class props so wrapper CSS can actually control it.
- Replace the obvious placeholder glyphs with the source artwork variants.
- Add per-archetype fit metadata for hero and row contexts.
- Feed those fit tokens into the report wrappers through CSS variables.

## Implementation Notes

- `components/report/reportArchetypeIcons.tsx` is the report-only SVG source and fit registry.
- `components/report/reportTheme.tsx` remains the archetype theme registry, but now references the shared report icon module.
- `components/report/sections/ArchetypeProbabilitySection.tsx` passes icon-fit variables into the hero and row wrappers.
- `app/globals.css` consumes those variables instead of hardcoding a single icon footprint.

## Expected Outcome

- Source-faithful report archetype SVGs.
- Better hero and row balance for tall, wide, and stacked icons.
- Clean rendering on both desktop and mobile without stretching or shrinking every archetype into the same box.

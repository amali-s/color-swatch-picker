# Phase 3 — Capture & Reveal: Design Decisions

Resolves the "what story does the 3–5s hold tell" designer input flagged for Phase 3 in the roadmap, and feeds directly into Phase 4 (capture UX) and Phase 5 (reveal UX).

## Interaction narrative

- **Idle:** translucent container, message reads "Hold to swatch." Three swatch tooltips stacked bottom-right, empty state.
- **Holding:** message eases into "Swatching." Tooltips show a loading state.
- **Hold completes:** a single frame is captured at that instant — no multi-frame averaging (explicitly decided against; the roadmap already treats averaging as a stretch goal, not core). K-means runs on that one frame.
- **Reveal (after extraction resolves):** tooltips animate to their final position, the loading state morphs into the hex code, the swatch square fills with the color plus a pigment icon, and a save icon appears on the tooltip.

## Resolved technical decisions

1. **Capture timing.** Single-frame capture, fired at the same instant `useHoldTimer.ts`'s state machine already transitions `holding` → `captured` (progress reaches 1). No change needed to the existing hook.
2. **Tooltip position.** Derived from the **largest continuous blob** of each color's pixels (connected-component / flood-fill analysis), not a raw centroid across all matching pixels. A raw centroid risked landing in empty space when a color's pixels were scattered across disconnected regions of the frame.
3. **Sampling.** Blob detection needs its own, denser pixel sample than the sparse stride (every 10th–20th pixel) used for the Phase 2 k-means color-clustering pass — sampling that sparse risks fragmenting a genuinely contiguous region into false-disconnected blobs. Color clustering and spatial/blob detection are two separate sampling passes with different density requirements; the performance cost of the denser pass needs on-device profiling (ties into Phase 6).
4. **Color-value framing.** The reported color per swatch stays an aggregate — averaged from every pixel assigned to that cluster across the whole frame, not just the blob the tooltip anchors to. UI copy should communicate this as "this color, aggregated across everywhere it appears," rather than implying the anchor point is the sole source of the color. This is the concrete answer to the roadmap's Phase 5 note on honestly handling the gap between algorithm output and user expectation.
5. **No backend.** Confirmed extraction runs entirely client-side — consistent with the project's existing "no backend, fully client-side" stack decision. ("Back end" in the original narrative meant "once the k-means computation resolves," not a server round-trip.)

## Open follow-ups (not blocking)

- Whether the loading state needs a deliberate minimum duration for perceptual weight, since k-means + blob detection likely resolves in well under a second.
- Exact motion spec (timing/easing) for the reveal transition — still needed per Phase 4's "concrete motion spec" designer input.

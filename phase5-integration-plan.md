# Phase 5 — Engine → lens-swatch Integration Plan

**Status:** Implemented (pending build/lint/test verification and browser check)
**Goal:** Replace lens-swatch's mock `DETECTED_SWATCHES` with the real camera +
k-means/blob extraction pipeline that already lives in the `color-picker/`
engine app, so the polished Phase 4 capture-moment UI runs on actual colors.

---

## Background: two apps, one convergence

The repo carries two Vite + React apps, scaffolded from the same template:

- **`color-picker/`** — the *engine* app (Phases 1–3). Real `getUserMedia`,
  k-means (k=3), dense connected-component blob detection for tooltip anchors,
  all behind a Web Worker. DOM-free algorithm core.
- **`lens-swatch/`** — the *UI* app (Phase 4). The full capture-moment
  interaction (pulse, determinate ring, capture flash + freeze punch, staggered
  reveal, copy-to-clipboard, `prefers-reduced-motion`) — but running on three
  hardcoded hex values, with a placeholder gradient instead of a camera.

Phase 5 wires the engine into the UI.

## What ported verbatim (DOM-free / self-contained)

Copied from `color-picker/src/` into `lens-swatch/src/` unchanged:

| Area | Files |
| --- | --- |
| Algorithm core | `color/extract.ts`, `color/kmeans.ts`, `color/blob.ts`, `color/types.ts` |
| Worker wrapper | `color/extract.worker.ts` |
| Hooks | `hooks/useCamera.ts`, `hooks/useColorExtraction.ts` |
| Tests | `color/extract.test.ts`, `color/kmeans.test.ts`, `color/blob.test.ts` |

`hooks/useHoldTimer.ts` was **already** ported in Phase 4 (with the added
`onTick` per-frame callback), so it was left as-is. The two tsconfigs share the
relevant options (`allowImportingTsExtensions`, `verbatimModuleSyntax`,
`moduleResolution: bundler`, `lib: ES2023 + DOM`, `erasableSyntaxOnly`), so the
engine files — which import with explicit `.ts` extensions — type-check
unchanged. The Vite-native worker construction
(`new Worker(new URL('../color/extract.worker.ts', import.meta.url), { type: 'module' })`)
builds identically in lens-swatch.

## Config parity

- **`tsconfig.app.json`** — added `"exclude": ["src/**/*.test.ts"]` to mirror
  color-picker, so the Node-based `*.test.ts` files aren't dragged into the app
  type-check.
- **`package.json`** — added the `test` script
  (`node --experimental-strip-types --test 'src/**/*.test.ts'`), matching the
  engine app. lens-swatch had no test runner before.

## Wiring in `CameraScreen.tsx`

The Phase 4 choreography (pulse / ring / flash / freeze punch / staggered
reveal) is untouched. What changed:

1. **Live feed.** `useCamera()` drives a `<video class="camera-feed">` filling
   the viewport (`object-fit: cover`). The existing gradient shows through only
   while the camera is `pending`/`error` (feed hidden via `.is-hidden`).
2. **Frame capture.** On hold-complete, `grabFrame()` draws the current video
   frame to a hidden `<canvas>` sized to `video.videoWidth/Height`, reads
   `getImageData`, and calls `extract(frame)`. The frozen canvas
   (`.camera-frame`) then paints over the live feed so the revealed chips sit on
   the actual captured image.
3. **Reveal gating.** The reveal is now gated on `extractStatus === 'done'`
   (with a short beat so the flash breathes) instead of the old fixed
   `after(200, …)`. The capture card doubles as the "Reading colors" state
   during the brief analysis window.
4. **Adapter.** `result.clusters → Swatch[]`: the engine emits `"#RRGGBB"`
   (uppercase, with hash); `Swatch` stores the bare hex and the UI re-adds it.
   The `id` is derived from the hex (`detected-RRGGBB`) so saving the same color
   across captures dedupes by color in the saved list.
5. **Real states.** Camera pending / permission-denied / no-camera /
   insecure-context (from `useCamera`), extraction error, degenerate frame
   (`clusters: []`), and frame-grab failure all resolve to a message card + the
   existing "Tap to retake". Holds are blocked until the camera is `ready`.

`App.tsx` no longer owns detection: `DETECTED_SWATCHES` is gone, `CameraScreen`
owns the camera/canvas/extraction, and `App` keeps only the saved-swatch list.

## Decisions taken (defaults)

- **Chip positioning:** anchored to each color's real blob (done — see below).
- **State ownership:** detection lives in `CameraScreen`, not `App`.
- **Tests:** the engine's algorithm tests were ported and a `test` script added,
  so the "reported colors are independent of the blob/positioning pass"
  invariant travels with the code.

## Anchor-based chip positioning (done)

Chips now render where each color actually sits in the frame, closing the v1 gap.
`chipPlacements` in `CameraScreen.tsx` pushes `result.clusters[i].anchor` through
the same `object-fit: cover` transform the frozen frame is drawn with (the geometry
the engine's `AnchorMarkers` established), using `result.meta.width/height` for the
image dimensions. Two adaptations for the polished UI:

- **Size-aware clamping.** The lens-swatch chips are ~150px-wide pills, not the
  engine's 14px dots, so the point-only clamp isn't enough. Each chip's root is
  measured in a `useLayoutEffect` (before paint, so the corrected position is what
  the user first sees — no visible jump) and its center is clamped by half its
  measured size + a ~12px margin, keeping the whole pill on screen.
- **Null-anchor fallback.** When `cluster.anchor === null` (no contiguous region),
  the chip falls back to its original fixed `CHIP_LAYOUT` slot, so the reveal always
  shows three copyable colors.

`anchor` still never influences the reported color — it only moves the chip
(guaranteed by `color/types.ts`).

## Follow-ups (not in this phase)

- **Chip overlap.** Two close blobs can place chips on top of each other; a
  de-overlap pass is a deliberate follow-up, out of scope for the anchoring change.
- A deliberate minimum-duration "analyzing" state so a fast worker doesn't
  flash-then-instantly-reveal (roadmap Phase 4 open item).
- Real-device pass — iOS Safari first (Phase 6). `getUserMedia` + clipboard need
  a secure context: `localhost` dev is fine; on-device testing over LAN needs
  HTTPS or a tunnel, which lands with deployment (Phase 7).

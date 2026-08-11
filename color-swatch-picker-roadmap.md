# Color Swatch Picker — Build Roadmap

**Project:** Camera-based dominant-color extraction microsite
**Goal of the build:** Prove you can build it yourself — the color-extraction algorithm is the centerpiece, UX/UI craft is co-equal
**Stack:** Vite + React, no backend, fully client-side

Core requirements locked from scoping: camera access, extract the 3 dominant colors, 3–5s hold to capture, copy color codes. Everything below sequences those four requirements into buildable phases, ordered so the hardest and riskiest parts (the algorithm, real-device camera behavior) surface early rather than at the end.

A note on accuracy: exact browser API names below (`getUserMedia`, `getImageData`, `navigator.clipboard.writeText`) reflect standard, well-documented Web APIs, but verify current syntax against MDN as you implement — don't trust generated code that invents method names, and re-check anything a library (e.g. color-thief) claims about its own API against its current docs rather than memory.

---

## Phase 0 — Definition & Scoping

**Goal:** Lock scope, audience, and design intent before any code, since the answers here shape every downstream UX decision.

**Skills/knowledge needed:** Requirements framing; enough technical literacy to know what's actually hard (algorithm + real-device behavior) vs. easy (camera/canvas/clipboard plumbing).

**Designer input needed from you:**
- Who's judging this, and where — desktop portfolio click-through, or handing someone your phone in a room? This decides whether desktop fallback matters and how much the physical handoff needs to shine.
- A rough mood word: clinical/precise vs. warm/playful (or something else entirely).
- A point of view on the two signature moments — capture and reveal — even just in words, before Figma.
- Confirm or redirect the starting visual hypothesis: near-black UI, camera feed and swatches as the only bright things, one confident accent color, generous negative space.

---

## Phase 1 — Functional Skeleton

**Goal:** A bare, testable shell: Vite+React app, live camera feed, 3–5s hold timer, canvas frame capture, a copy button wired to a hardcoded string. No real color logic yet. This is your safe baseline to return to when something breaks later.

**Skills/knowledge needed:**
- Vite + React project setup, git basics
- `getUserMedia({ video: true })` into a `<video>` element (requires HTTPS or localhost)
- Basic hold-timer logic (state machine: idle → holding → captured)
- Drawing a video frame to `<canvas>`
- `navigator.clipboard.writeText()` behind a user gesture (also requires HTTPS)

**Designer input needed from you:**
- Target devices/browsers to prioritize — iOS Safari is known to have quirks inside in-app browsers (Instagram/LinkedIn); worth deciding early if that matters for your audience.
- Low-fidelity wireframe of the screen states: camera view → holding → captured → swatches. Doesn't need to be final Figma, just enough to build against.
- Portrait vs. landscape requirement, if any.

---

## Phase 2 — Color Extraction Algorithm (Isolated)

**Goal:** Build k-means (k=3) clustering yourself against a static test image, decoupled from the camera, so you can debug the algorithm without live-camera noise in the mix.

**Skills/knowledge needed:**
- `getImageData()` and the `Uint8ClampedArray` pixel format (4 values per pixel: R, G, B, A)
- Pixel downsampling for performance (sample every 10th–20th pixel rather than all of them)
- K-means mechanics: random initial centers, nearest-center assignment by RGB distance, centroid re-averaging, fixed iteration count (10–15 is typically enough for a demo — you don't need convergence detection)
- RGB → hex conversion
- Sorting final clusters by size to rank the 3 output colors

**Designer input needed from you:**
- Not required for the algorithm itself — this phase is engineering-only.
- Optional and useful: supply 3–5 real-world test images with your own gut sense of their "true" dominant colors, so you have a human baseline to sanity-check the algorithm's output against. This is also where the RGB-vs-perceptual-color gap becomes visible — flag it as a known limitation rather than solving it here (Lab/CIEDE2000 is real but out of scope for v1; verify any conversion math from a primary source if you revisit it later).

---

## Phase 3 — Wire Algorithm to Live Camera

**Goal:** Replace the static test image with a real video frame — captured at the end of the hold, or averaged across the hold if you pursue frame-averaging.

**Skills/knowledge needed:**
- Capturing the right frame at the right moment in the hold state machine
- Performance profiling so clustering doesn't visibly stall the UI on a phone
- Deciding single-frame capture vs. multi-frame averaging (averaging gives steadier results but is a stretch goal, not core)

**Designer input needed from you:**
- ~~A decision on what story the 3–5s hold is telling the user...~~ **Resolved:** single-frame capture, fired at hold completion — not multi-frame averaging. Full interaction narrative and the resulting technical decisions (capture timing, blob-based tooltip positioning, sampling, honest color-value framing) are in [phase3-capture-reveal-decisions.md](phase3-capture-reveal-decisions.md).

---

## Phase 4 — Capture Moment UX/UI

**Goal:** Design and build the core interaction: signaling "hold steady," showing progress through the hold, and confirming the capture. This is an unusual interaction pattern — users won't intuit it on sight — so it's worth disproportionate care.

**Skills/knowledge needed:**
- CSS animation/transitions, React state for idle → holding → captured
- Respecting `prefers-reduced-motion` for accessibility

**Designer input needed from you (heaviest design phase):**
- ~~Idle / hold-in-progress states~~ **Resolved:** idle = translucent container, "Hold to swatch," empty tooltip stack bottom-right; holding = message eases to "Swatching," tooltips show loading state. See [phase3-capture-reveal-decisions.md](phase3-capture-reveal-decisions.md).
- Figma mockups/prototype still needed for: capture confirmation visual (snap, flash, other feedback beyond the described tooltip-fill).
- Still open: concrete motion spec — timing and easing that reads as "quick and physical" rather than "slow and decorative" for this specific app (including the reveal transition itself).
- Accent color and near-black treatment applied to real mockups, not just described.

---

## Phase 5 — Reveal Moment UX/UI

**Goal:** Design and build the swatch reveal — how the 3 colors appear, how hex codes are shown, how a copy action confirms itself, and how you honestly handle the gap between the algorithm's output and what the user thought they pointed at.

**Skills/knowledge needed:**
- React state for copy-confirmation feedback
- Clipboard API edge cases (permission prompts, graceful fallback if unsupported)
- Layout for the swatch + hex code + copy button cluster

**Designer input needed from you:**
- ~~Decision on showing swatches over the frozen frame vs. separately~~ **Resolved:** swatches are positioned via tooltip anchored to each color's largest continuous blob location — implements the "over the frozen frame" treatment. Color value itself is still communicated as an aggregate ("this color, aggregated across everywhere it appears"), not a single-spot reading. See [phase3-capture-reveal-decisions.md](phase3-capture-reveal-decisions.md).
- Figma mockups still needed for: hex code typography, copy-confirmation micro-interaction (checkmark, label swap, etc.), and the save-icon treatment.
- Error/empty states: camera permission denied, clipboard unsupported, no camera detected.

---

## Phase 6 — Real-Device Testing & Iteration

**Goal:** Test on actual target phones — iOS Safari first, Android Chrome second, in-app browser contexts if relevant to your audience — and tune hold duration, extraction accuracy, and interaction feel against real handling, not desktop assumptions.

**Skills/knowledge needed:**
- Remote debugging (Safari Web Inspector / Chrome DevTools over USB)
- Cross-browser `getUserMedia` quirks
- Mobile performance tuning for the clustering step

**Designer input needed from you:**
- Direct hands-on feedback: does the hold duration feel right, does the capture moment feel good physically, do the returned colors feel "true enough" to what was pointed at.
- Sign-off on any gap between the Figma mockups and how the build actually feels in hand — this is normal and expected, not a failure.

---

## Phase 7 — Polish, Known Limitations, and Ship

**Goal:** Final visual polish, an honest written note on the RGB-vs-perceptual-color limitation, deployment to a static host (Vercel, Netlify, or GitHub Pages all serve HTTPS by default, which camera/clipboard require), and ship.

**Skills/knowledge needed:**
- Basic static-site deployment
- Final QA pass across target devices

**Designer input needed from you:**
- Final visual QA against the Figma source of truth.
- Tone and wording for the "known limitation" note, if it's user-facing rather than just a portfolio talking point — this is a craft decision, not a technical one.

---

## Sequencing note

This order deliberately front-loads risk: Phase 2 (the algorithm) and Phase 6 (real-device camera behavior) are where things are most likely to go sideways, and both surface early enough to leave room to recover. Phases 4 and 5 are where "designer who can build" gets proven — budget real time there rather than treating them as a coat of paint at the end.

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
- A decision on what story the 3–5s hold is telling the user: "hold still so I can get a clean shot" vs. "I'm sampling across time for stability." This is a product/UX call, not just an engineering one, and it changes what the hold-progress UI should communicate in Phase 4.

---

## Phase 4 — Capture Moment UX/UI

**Goal:** Design and build the core interaction: signaling "hold steady," showing progress through the hold, and confirming the capture. This is an unusual interaction pattern — users won't intuit it on sight — so it's worth disproportionate care.

**Skills/knowledge needed:**
- CSS animation/transitions, React state for idle → holding → captured
- Respecting `prefers-reduced-motion` for accessibility

**Designer input needed from you (heaviest design phase):**
- Figma mockups/prototype for each capture state: idle camera view, hold-in-progress indicator (pick one: countdown ring, progress bar, pulse), and capture confirmation (snap, flash, other feedback).
- A concrete motion spec: timing and easing that reads as "quick and physical" rather than "slow and decorative" for this specific app.
- Accent color and near-black treatment applied to real mockups, not just described.

---

## Phase 5 — Reveal Moment UX/UI

**Goal:** Design and build the swatch reveal — how the 3 colors appear, how hex codes are shown, how a copy action confirms itself, and how you honestly handle the gap between the algorithm's output and what the user thought they pointed at.

**Skills/knowledge needed:**
- React state for copy-confirmation feedback
- Clipboard API edge cases (permission prompts, graceful fallback if unsupported)
- Layout for the swatch + hex code + copy button cluster

**Designer input needed from you:**
- Figma mockups for the reveal screen: swatch layout, hex code typography, copy-confirmation micro-interaction (checkmark, label swap, etc.).
- A decision and visual treatment for showing the 3 swatches over the frozen captured frame (recommended, since it makes the "what I saw → what I got" connection visible and turns the algorithm's imperfection into an honest, designed moment) vs. showing them separately.
- Error/empty states: camera permission denied, clipboard unsupported, no camera detected.

---

## Phase 6 — Deploy for Testing + Real-Device Testing & Iteration

**Goal:** Get the build onto an HTTPS URL, then test on actual target phones — iOS Safari first, Android Chrome second, in-app browser contexts if relevant to your audience — and tune hold duration, extraction accuracy, and interaction feel against real handling, not desktop assumptions.

**Why deployment moved here (was Phase 7):** `getUserMedia` and the Clipboard API require a secure context (HTTPS), so real-device testing can't run over plain LAN. Deploying to Vercel now — rather than waiting for ship — is the cleanest way to get a stable HTTPS URL onto your phone: Vercel serves HTTPS by default and generates a fresh preview URL on every push, so each testing iteration is one `git push` away. (A tunnel such as cloudflared/ngrok is the alternative, but a real preview URL is steadier for handheld testing.) This is a *testing* deploy, not the final ship — Phase 7 keeps the production sign-off. Note the repo carries two Vite apps; the deploy target is `lens-swatch/` (the Phase-4 UI with the Phase-5-integrated extraction engine), not `color-picker/` (the isolated engine app).

**Skills/knowledge needed:**
- Deploying a Vite app that lives in a repo subdirectory to Vercel (set the project's Root Directory to `lens-swatch/`; Vite framework preset)
- Remote debugging (Safari Web Inspector / Chrome DevTools over USB)
- Cross-browser `getUserMedia` quirks
- Mobile performance tuning for the clustering step

**Designer input needed from you:**
- Direct hands-on feedback: does the hold duration feel right, does the capture moment feel good physically, do the returned colors feel "true enough" to what was pointed at.
- Sign-off on any gap between the Figma mockups and how the build actually feels in hand — this is normal and expected, not a failure.

---

## Phase 7 — Polish, Known Limitations, and Ship

**Goal:** Final visual polish, an honest written note on the RGB-vs-perceptual-color limitation, and ship. Deployment itself moved to Phase 6, so by this point the app is already live on Vercel — this phase is the final production sign-off: promoting the tested build to production and confirming the shipped version is the one that passed real-device testing.

**Skills/knowledge needed:**
- Promoting a Vercel preview to production / final deploy config
- Final QA pass across target devices

**Designer input needed from you:**
- Final visual QA against the Figma source of truth.
- Tone and wording for the "known limitation" note, if it's user-facing rather than just a portfolio talking point — this is a craft decision, not a technical one.

---

## Design Polish Backlog — post-audit to-dos (2026-08-16)

Captured from a senior UI/motion design pass over the current build. These are craft + accessibility refinements sitting on top of a core flow and motion system that already work — most feed Phase 6 (real-device tuning) and Phase 7 (final polish). File paths are relative to the repo root. Check items off as they land.

### P1 — legibility & layout bugs (do first)

- [ ] **Fix the reveal-hex contrast.** `FloatingChip` renders the detected hex in `--text-tertiary` (#827a64) on the cream chip — roughly 4.05:1 (computed, approximate), just under the WCAG AA 4.5:1 bar for normal text — while the saved-list row (`SwatchRow`) shows the same hex in `--text-primary` (#1b2323). Move the reveal hex to `--text-secondary` (#59554b, ~7:1 computed) and/or a heavier weight so the actual payload is legible where it matters most. → `src/components/FloatingChip.tsx`
- [ ] **Fix the "Hold to swatch" ↔ swatch-container overlap.** The empty swatch pills are bottom-anchored (`.skeleton-chips { bottom: 72px }`, ~172px tall stack) while the capture card is pinned mid-screen (`.capture-card { top: 244px; height: 114px }` → its bottom edge sits at 358px). On shorter viewports the rising pills collide with the card. Push the "Hold to swatch" card higher and add clearance so the two never touch — lift `.capture-card` (smaller `top`) and/or drop the skeleton stack, leaving a deliberate gap between them. → `src/App.css`

### P2 — data typography

- [ ] **Give hex a legible, precise type treatment.** Spectral 300 (thin serif) makes 0/O and 8/B ambiguous for alphanumeric data. Use a monospace/tabular face or a heavier weight for hex values specifically — it also pairs naturally with the new loading counter "settling" into a monospace value. Apply to `FloatingChip` and, for consistency, `SwatchRow`. → `src/components/FloatingChip.tsx`, `src/components/SwatchRow.tsx`

### P3 — motion & system consistency

- [ ] **Make loading morph into reveal.** Loaders stack bottom-left; chips reveal at anchor / `CHIP_LAYOUT` slots — so it reads as a jump, not the morph Phase 3 described. Seat the skeleton/scramble pills at the fallback `CHIP_LAYOUT` positions so loading → reveal is one continuous transform (now that the counter visually promises "this becomes the hex, here"). → `src/components/SkeletonChips.tsx`, `src/screens/CameraScreen.tsx`, `src/App.css`
- [ ] **Consolidate the two blues.** `--dark-blue` (#096694, wordmark + focus outline) and `--accent` (#0095cc, ring/glow/flash) are distinct-but-near-identical in different roles — the Phase 4 spec already flagged tokenizing the accent. Collapse to one scale (`--accent` / `--accent-strong`). Separately, confirm the cool blue is intentional in the warm-neutral world; a warmer accent may sit more naturally. → `src/index.css`, `src/App.css`, `src/capture/motion.ts`
- [ ] **Surface the copy affordance.** Tapping a chip copies `#hex` (the locked core requirement), but only the bookmark (a stretch feature) is visible — the core action is invisible. Add a subtle copy glyph or a one-time hint on reveal. → `src/components/FloatingChip.tsx`

### P4 — responsive (folds into Phase 6 real-device tuning)

- [ ] **De-pin the 393×852 composition.** `.capture-card` (top:244 / height:114), `.skeleton-chips` (bottom:72), and the switch button (right/bottom:32) are absolute px from the Figma canvas and won't stay proportional across phone sizes. Move to %, safe-area insets, and flex. Worth doing together with the P1 overlap fix, since both touch the same coordinates. → `src/App.css`

### Nits (verify, low effort)

- [ ] **Confirm the `Label 2` tracking in Figma.** `letterSpacing:-6` is a variable artifact, already neutralized to `0` in CSS — just confirm the Figma token so it doesn't resurface on the next export. → Figma file
- [ ] **Verify the empty-state copy.** "Swipe to open the camera" is shown, but navigation is tab buttons — confirm a swipe gesture actually exists, or reword so the copy doesn't promise a gesture that isn't wired up. → `src/screens/ListScreen.tsx`

### Done (shipped this pass)

- [x] **Number-scramble (matrix counter) loading state.** Swatch containers roll a six-digit hex counter (0–9 A–F) while Swatching (holding) and Reading colors, settling into the real code on reveal; idle shows still em-dash slots; reduced motion keeps em-dashes throughout. → `src/components/SkeletonChips.tsx`, `src/App.css`, `src/index.css`, `src/screens/CameraScreen.tsx`

---

## Sequencing note

This order deliberately front-loads risk: Phase 2 (the algorithm) and Phase 6 (real-device camera behavior) are where things are most likely to go sideways, and both surface early enough to leave room to recover. Phases 4 and 5 are where "designer who can build" gets proven — budget real time there rather than treating them as a coat of paint at the end. Deployment sits in Phase 6 (not Phase 7) on purpose: real-device testing needs HTTPS, so the app goes live early as a testing surface and Phase 7 becomes the final ship sign-off rather than a first deploy.

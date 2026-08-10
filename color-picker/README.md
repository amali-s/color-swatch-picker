# color-picker

Phase 1 functional skeleton for a camera-based color-picker tool. This is a
testable baseline — a live camera feed, a press-and-hold capture gesture, a
canvas frame grab, and a copy button — with **no real color logic yet**. The
copy button writes a hardcoded placeholder hex (`#FFFFFF`).

## Run

```bash
npm install
npm run dev
```

Then open the printed `http://localhost:5173` URL.

## Requirements & gotchas

Both the camera and clipboard features require a **secure context**:

- **`getUserMedia` (camera)** and **`navigator.clipboard.writeText` (copy)**
  only work over **HTTPS** or **`http://localhost`**.
- Opening the app over a plain-HTTP LAN address (e.g. `http://192.168.x.x`)
  will fail: the camera reports an error and Copy shows "Copy failed".
- To test on a physical phone, serve over HTTPS (e.g. a tunnel, or Vite's
  `--host` with an HTTPS proxy) — `localhost` on the phone won't reach your
  dev machine.

## How to use

1. Grant camera access when prompted.
2. **Press and hold** anywhere on the feed for 3 seconds. A ring fills to show
   progress; releasing or dragging off before 3s cancels.
3. At 3s the current frame is drawn to a canvas and shown.
4. Click **Copy** to put the placeholder hex on your clipboard ("Copied!"
   confirms success).
5. **Tap the image** or click **Retake** to return to the live feed and repeat.

## Structure

- `src/App.tsx` — screen + `idle → holding → captured` orchestration, canvas
  capture, copy button.
- `src/hooks/useCamera.ts` — requests the stream and pipes it into `<video>`.
- `src/hooks/useHoldTimer.ts` — the hold-to-capture state machine + progress.

`HOLD_DURATION_MS` in `src/App.tsx` tunes the hold length (3000–5000ms).

## Phase 2

Real color sampling replaces the placeholder. Search the source for
`// PHASE 2:` — there are markers in `src/App.tsx` at the canvas draw (where
pixel data will be read) and at the copy handler (where the sampled hex will
be used).

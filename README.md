# Color Swatch Picker

A camera-based dominant-color extraction microsite. Point your camera at something, hold for a few seconds to capture, and get the three dominant colors back as copyable color codes.

**Stack:** Vite + React — no backend, fully client-side.

## Core requirements

- Camera access via `getUserMedia`
- Extract the 3 dominant colors from the frame
- 3–5s hold-to-capture interaction
- Copy color codes to clipboard

## Status

Early build. See [color-swatch-picker-roadmap.md](color-swatch-picker-roadmap.md) for the full phased build plan — the color-extraction algorithm is the centerpiece, with UX/UI craft treated as co-equal.

## Development

```bash
npm install
npm run dev
```

Other scripts: `npm test` (Node test runner), `npm run lint` (Oxlint), `npm run build` (type-check + production build).

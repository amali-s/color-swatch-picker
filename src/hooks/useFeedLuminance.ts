import { useEffect, useRef, useState } from 'react';

/**
 * Watches the live camera feed and reports whether the area behind the capture
 * card is dark, so the card's text can flip to a light ink for legibility.
 *
 * It periodically draws the upper-middle region of the `<video>` (roughly where
 * the card sits) into a tiny offscreen canvas and averages its relative
 * luminance, then blends that through the card's translucent cream fill to get
 * the *effective* background the text actually sits on. A hysteresis band keeps
 * it from flickering when the scene hovers near the threshold.
 *
 * Returns `true` when the background is dark (use light ink). Defaults to `true`
 * so the no-feed states (camera pending / denied, which render over a dark
 * fallback) start with light ink. DOM-only; harmless in tests (no `document`).
 */
const CARD_ALPHA = 0.34; // .capture-card fill is rgba(255,248,240,0.34)
const CARD_LUM = 249; // relative luminance of #fff8f0
const TO_LIGHT_INK = 145; // effective luminance below this → dark bg → light ink
const TO_DARK_INK = 168; // above this → bright bg → dark ink

export function useFeedLuminance(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
): boolean {
  const [dark, setDark] = useState(true);
  const darkRef = useRef(true);

  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let cancelled = false;

    const sample = () => {
      const video = videoRef.current;
      if (!video || !ctx) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      // Upper-middle centre band ≈ where the capture card overlaps the feed.
      const sx = vw * 0.2;
      const sy = vh * 0.15;
      const sw = vw * 0.6;
      const sh = vh * 0.4;
      try {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 24, 24);
        const { data } = ctx.getImageData(0, 0, 24, 24);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        }
        const feedLum = sum / (data.length / 4);
        const effective = feedLum * (1 - CARD_ALPHA) + CARD_LUM * CARD_ALPHA;

        let next = darkRef.current;
        if (darkRef.current && effective > TO_DARK_INK) next = false;
        else if (!darkRef.current && effective < TO_LIGHT_INK) next = true;

        if (next !== darkRef.current && !cancelled) {
          darkRef.current = next;
          setDark(next);
        }
      } catch {
        // Feed not readable yet (or tainted) — leave the current ink in place.
      }
    };

    sample();
    const id = setInterval(sample, 350);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active, videoRef]);

  return dark;
}

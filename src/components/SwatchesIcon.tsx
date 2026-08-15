interface Props {
  size?: number;
}

/**
 * Fanned deck-of-swatches glyph for the "Swatches" tab — the exact Figma vector
 * (repo root `Swatches icon.svg`, node from file 50P1w6P6GpEllzD4NVpMnF), inlined
 * so it needs no asset pipeline. Fills are the design's brown (#575040) chips
 * with cream (#fff8f0) hairline separators; the active state is conveyed by the
 * nav pill behind it, not by recolouring the glyph (see the exported mocks).
 */
export default function SwatchesIcon({ size = 34 }: Props) {
  return (
    <svg
      width={(size * 37) / 34}
      height={size}
      viewBox="0 0 37 34"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0.350541" y="25.3896" width="31.5676" height="13.2404" rx="1.75" transform="rotate(-52.4845 0.350541 25.3896)" fill="#575040" />
      <rect x="0.350541" y="25.3896" width="31.5676" height="13.2404" rx="1.75" transform="rotate(-52.4845 0.350541 25.3896)" stroke="#FFF8F0" strokeWidth="0.5" />
      <rect x="0.433506" y="22.9289" width="32.3795" height="12.461" rx="1.75" transform="rotate(-31.384 0.433506 22.9289)" fill="#575040" />
      <rect x="0.433506" y="22.9289" width="32.3795" height="12.461" rx="1.75" transform="rotate(-31.384 0.433506 22.9289)" stroke="#FFF8F0" strokeWidth="0.5" />
      <rect x="0.457691" y="22.5864" width="33.9937" height="10.1036" rx="1.75" transform="rotate(-15 0.457691 22.5864)" fill="#575040" />
      <rect x="0.457691" y="22.5864" width="33.9937" height="10.1036" rx="1.75" transform="rotate(-15 0.457691 22.5864)" stroke="#FFF8F0" strokeWidth="0.5" />
      <rect x="0.533875" y="22.129" width="35.5" height="11.5" rx="1.75" fill="#575040" />
      <rect x="0.533875" y="22.129" width="35.5" height="11.5" rx="1.75" stroke="#FFF8F0" strokeWidth="0.5" />
      <circle cx="6.28387" cy="27.879" r="2.5" stroke="#FFF8F0" />
    </svg>
  );
}

interface Props {
  size?: number;
}

/**
 * Camera glyph for the "Camera" tab — the exact Figma vector (repo root
 * `Camera icon.svg`), inlined. Body fill is the design's #59554b with a cream
 * (#fff8f0) lens ring; like the swatches glyph, active state comes from the nav
 * pill behind it rather than a colour change.
 */
export default function CameraIcon({ size = 30 }: Props) {
  return (
    <svg
      width={(size * 36) / 30}
      height={size}
      viewBox="0 0 36 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect y="6" width="36" height="24" rx="4" fill="#59554B" />
      <path
        d="M11.6213 1.51493C11.8439 0.624594 12.6438 0 13.5616 0H22.4384C23.3562 0 24.1561 0.624595 24.3787 1.51493L25.3787 5.51493C25.6943 6.77722 24.7396 8 23.4384 8H12.5616C11.2604 8 10.3057 6.77722 10.6213 5.51493L11.6213 1.51493Z"
        fill="#59554B"
      />
      <circle cx="18" cy="17" r="7" stroke="#FFF8F0" strokeWidth="2" />
    </svg>
  );
}

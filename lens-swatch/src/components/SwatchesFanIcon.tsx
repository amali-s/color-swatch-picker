interface Props {
  size?: number;
  color?: string;
}

/**
 * Fanned paint-chip glyph used for the "saved swatches" tab.
 *
 * Note: the original Figma file exports this as two rotated vector
 * pieces (a two-part "swatches" asset). The MCP asset CDN wasn't
 * reachable from this build environment, so this is a hand-authored
 * recreation matched to the on-canvas screenshot rather than a pixel
 * copy of the source vector — flagging that rather than presenting it
 * as an exact asset match.
 */
export default function SwatchesFanIcon({ size = 28, color = 'currentColor' }: Props) {
  const chips = [-28, -9, 10, 29];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(20 34)">
        {chips.map((angle) => (
          <rect
            key={angle}
            x={-6}
            y={-30}
            width={12}
            height={26}
            rx={3}
            transform={`rotate(${angle})`}
            fill={color}
            fillOpacity={0.92}
          />
        ))}
      </g>
    </svg>
  );
}

import { Bookmark } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Swatch } from '../types';

interface Props {
  swatch: Swatch;
  /** Absolute left/top placement over the viewport. */
  position: CSSProperties;
  /** How the chip is pinned to `position` (affects transform + reveal keyframe). */
  anchor: 'center' | 'left';
  saved: boolean;
  copied: boolean;
  /** Reveal animation delay in ms (staggers the three chips). */
  revealDelay: number;
  /** Skipped under prefers-reduced-motion. */
  animate: boolean;
  /** Ref to the chip's root element, so the parent can measure it for clamping. */
  rootRef?: (el: HTMLDivElement | null) => void;
  /** Toggle this color in the saved list (bookmark). */
  onToggle: () => void;
  /** Copy `#HEX` (tap the chip body / hex). */
  onCopy: () => void;
}

/**
 * A detected-color chip anchored over the frozen frame. Matching the Figma
 * reveal, the chip is just a color square + hex; tapping the body copies `#HEX`
 * and swaps the label to "Copied" (26-505), while the outline bookmark toggles
 * the color in the saved list — filled when saved (26-544) — and hides while the
 * "Copied" label is showing.
 */
export default function FloatingChip({
  swatch,
  position,
  anchor,
  saved,
  copied,
  revealDelay,
  animate,
  rootRef,
  onToggle,
  onCopy,
}: Props) {
  const className = [
    'floating-chip',
    `floating-chip--${anchor}`,
    animate ? 'floating-chip--reveal' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ ...position, animationDelay: animate ? `${revealDelay}ms` : undefined }}
    >
      <button
        type="button"
        className="floating-chip__copy"
        onClick={onCopy}
        aria-label={copied ? `Copied #${swatch.hex}` : `Copy #${swatch.hex}`}
      >
        <span className="floating-chip__color" style={{ background: `#${swatch.hex}` }} />
        <span className="text-label-2" style={{ color: 'var(--text-tertiary)' }}>
          {copied ? 'Copied' : swatch.hex}
        </span>
      </button>
      {!copied && (
        <button
          type="button"
          aria-label={saved ? `Remove #${swatch.hex} from saved swatches` : `Save #${swatch.hex}`}
          aria-pressed={saved}
          onClick={onToggle}
          className="floating-chip__save"
        >
          <Bookmark
            size={15}
            color="var(--text-tertiary)"
            fill={saved ? 'var(--text-tertiary)' : 'none'}
            strokeWidth={1.75}
          />
        </button>
      )}
    </div>
  );
}

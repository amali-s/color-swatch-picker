import { Bookmark, Check, Copy } from 'lucide-react';
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
  onSave: () => void;
  onCopy: () => void;
}

/**
 * A detected-color chip over the viewfinder. Phase 4 adds the copy affordance
 * that the locked scope requires (tap the swatch → copy `#HEX`, label swaps to
 * "Copied"); the bookmark stays as the secondary save action.
 */
export default function FloatingChip({
  swatch,
  position,
  anchor,
  saved,
  copied,
  revealDelay,
  animate,
  onSave,
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
        {copied ? (
          <Check size={14} color="var(--accent)" strokeWidth={2} />
        ) : (
          <Copy size={13} color="var(--text-tertiary)" strokeWidth={1.75} />
        )}
      </button>
      <button
        type="button"
        aria-label={saved ? `${swatch.hex} saved` : `Save ${swatch.hex}`}
        aria-pressed={saved}
        onClick={onSave}
        className="floating-chip__save"
      >
        <Bookmark
          size={15}
          color="var(--text-tertiary)"
          fill={saved ? 'var(--text-tertiary)' : 'none'}
          strokeWidth={1.75}
        />
      </button>
    </div>
  );
}

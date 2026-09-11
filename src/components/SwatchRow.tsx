import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { copyText } from '../lib/clipboard';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { DUR_FLASH, DUR_QUICK } from '../capture/motion';
import type { Swatch } from '../types';

interface Props {
  swatch: Swatch;
  /** Un-save this row (the revealed bookmark). */
  onRemove: (id: string) => void;
  /** Announce copy success to the screen's aria-live region. */
  onAnnounce: (message: string) => void;
  /** Fade-up enter (new row or empty→filled ceremony). */
  entering?: boolean;
  /** Stagger delay in ms (ceremony rows 0/1/2). */
  enterDelay?: number;
  selected?: boolean;
  /** When set, the row body selects instead of copying (desktop inspector). */
  onSelect?: (swatch: Swatch) => void;
}

/**
 * A saved-swatch row with two distinct, keyboard-operable hit areas:
 *   - the row body (color square + hex) copies `#HEX` and crossfades the
 *     hex to "Copied" for ~1.2s (width stays the hex's), and
 *   - a filled bookmark at the right edge, revealed on hover/focus (2-172),
 *     un-saves the color.
 * The bookmark stays in the tab order (revealed via `:focus-within`) so it's
 * reachable without a pointer.
 *
 * Un-save is a two-beat: P1 bookmark scale (160ms) then the row itself
 * collapses (180ms). `onRemove` fires only after both, so the list does not
 * unmount the row on the click frame. The row is the object — the 32px
 * square does not animate on its own.
 */
export default function SwatchRow({
  swatch,
  onRemove,
  onAnnounce,
  entering = false,
  enterDelay = 0,
  selected = false,
  onSelect,
}: Props) {
  const { id, hex } = swatch;
  const reduced = usePrefersReducedMotion();
  const [copied, setCopied] = useState(false);
  const [unsavePhase, setUnsavePhase] = useState<'idle' | 'unsaving' | 'exiting'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (unsaveRef.current) clearTimeout(unsaveRef.current);
    },
    [],
  );

  const handleActivate = useCallback(async () => {
    if (onSelect) {
      onSelect(swatch);
      return;
    }
    const ok = await copyText(`#${hex}`);
    if (!ok) return; // clipboard blocked — no false "Copied" feedback
    setCopied(true);
    onAnnounce(`Copied #${hex}`);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1200);
  }, [hex, onAnnounce, onSelect, swatch]);

  const handleRemove = useCallback(() => {
    if (unsavePhase !== 'idle') return;
    if (reduced) {
      onRemove(id);
      return;
    }
    setUnsavePhase('unsaving');
    unsaveRef.current = setTimeout(() => {
      setUnsavePhase('exiting');
      unsaveRef.current = setTimeout(() => onRemove(id), DUR_FLASH);
    }, DUR_QUICK);
  }, [id, onRemove, reduced, unsavePhase]);

  return (
    <div
      className={[
        'swatch-row-slot',
        entering ? 'is-entering' : '',
        unsavePhase === 'exiting' ? 'is-exiting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={entering && enterDelay ? { animationDelay: `${enterDelay}ms` } : undefined}
    >
      <div className={`swatch-row${selected ? ' is-selected' : ''}`}>
        <button
          type="button"
          className="swatch-row__body"
          onClick={handleActivate}
          aria-current={selected ? 'true' : undefined}
          aria-label={
            onSelect
              ? `View #${hex}`
              : copied
                ? `Copied #${hex}`
                : `Copy #${hex}`
          }
        >
          <span className="swatch-row__chip" style={{ background: `#${hex}` }} />
          <span
            className={`copy-confirm text-body-2${copied ? ' is-copied' : ''}`}
            aria-hidden="true"
          >
            <span className="copy-confirm__hex">{hex}</span>
            <span className="copy-confirm__copied">Copied</span>
          </span>
        </button>
        <button
          type="button"
          className="swatch-row__bookmark"
          onClick={handleRemove}
          disabled={unsavePhase !== 'idle'}
          aria-label={`Remove #${hex} from saved swatches`}
        >
          <span className={`bookmark-pop${unsavePhase !== 'idle' ? ' is-unsaving' : ''}`}>
            <Bookmark
              size={18}
              color="var(--secondary-action)"
              fill="var(--secondary-action)"
              strokeWidth={1.75}
            />
          </span>
        </button>
      </div>
    </div>
  );
}

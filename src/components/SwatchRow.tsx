import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { copyText } from '../lib/clipboard';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { DUR_QUICK } from '../capture/motion';
import type { Swatch } from '../types';

interface Props {
  swatch: Swatch;
  /** Un-save this row (the revealed bookmark). */
  onRemove: (id: string) => void;
  /** Announce copy success to the screen's aria-live region. */
  onAnnounce: (message: string) => void;
}

/**
 * A saved-swatch row with two distinct, keyboard-operable hit areas:
 *   - the row body (color square + hex) copies `#HEX` and fades in "Copied"
 *     beside the hex for ~1.2s (hex never leaves), and
 *   - a filled bookmark at the right edge, revealed on hover/focus (2-172),
 *     un-saves the color.
 * The bookmark stays in the tab order (revealed via `:focus-within`) so it's
 * reachable without a pointer.
 */
export default function SwatchRow({ swatch, onRemove, onAnnounce }: Props) {
  const { id, hex } = swatch;
  const reduced = usePrefersReducedMotion();
  const [copied, setCopied] = useState(false);
  const [unsaving, setUnsaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (unsaveRef.current) clearTimeout(unsaveRef.current);
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    const ok = await copyText(`#${hex}`);
    if (!ok) return; // clipboard blocked — no false "Copied" feedback
    setCopied(true);
    onAnnounce(`Copied #${hex}`);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1200);
  }, [hex, onAnnounce]);

  const handleRemove = useCallback(() => {
    if (unsaving) return;
    if (reduced) {
      onRemove(id);
      return;
    }
    setUnsaving(true);
    unsaveRef.current = setTimeout(() => onRemove(id), DUR_QUICK);
  }, [id, onRemove, reduced, unsaving]);

  return (
    <div className="swatch-row">
      <button
        type="button"
        className="swatch-row__body"
        onClick={handleCopy}
        aria-label={copied ? `Copied #${hex}` : `Copy #${hex}`}
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
        disabled={unsaving}
        aria-label={`Remove #${hex} from saved swatches`}
      >
        <span className={`bookmark-pop${unsaving ? ' is-unsaving' : ''}`}>
          <Bookmark
            size={18}
            color="var(--secondary-action)"
            fill="var(--secondary-action)"
            strokeWidth={1.75}
          />
        </span>
      </button>
    </div>
  );
}

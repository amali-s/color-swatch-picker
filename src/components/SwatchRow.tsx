import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { copyText } from '../lib/clipboard';
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
 *   - the row body (color square + hex) copies `#HEX` and swaps the label to
 *     "Copied" for ~1.2s (Figma 26-389), and
 *   - a filled bookmark at the right edge, revealed on hover/focus (2-172),
 *     un-saves the color.
 * The bookmark stays in the tab order (revealed via `:focus-within`) so it's
 * reachable without a pointer.
 */
export default function SwatchRow({ swatch, onRemove, onAnnounce }: Props) {
  const { id, hex } = swatch;
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
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

  return (
    <div className="swatch-row">
      <button
        type="button"
        className="swatch-row__body"
        onClick={handleCopy}
        aria-label={copied ? `Copied #${hex}` : `Copy #${hex}`}
      >
        <span className="swatch-row__chip" style={{ background: `#${hex}` }} />
        <span className="text-body-2" style={{ color: 'var(--text-primary)' }}>
          {copied ? 'Copied' : hex}
        </span>
      </button>
      <button
        type="button"
        className="swatch-row__bookmark"
        onClick={() => onRemove(id)}
        aria-label={`Remove #${hex} from saved swatches`}
      >
        <Bookmark
          size={18}
          color="var(--secondary-action)"
          fill="var(--secondary-action)"
          strokeWidth={1.75}
        />
      </button>
    </div>
  );
}

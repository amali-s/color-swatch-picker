import type { Swatch } from '../types';

export interface CardBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Props {
  swatch: Swatch;
  box: CardBox;
  expanded: boolean;
  copied: boolean;
  reduced: boolean;
  onCopy: () => void;
  onUnsave: () => void;
  onClose: () => void;
}

/**
 * Figma "Selected color" (88:107) / copy-selected (91:169). The parent
 * animates `box` from the tapped chip rect to 265×325 so this component
 * only has to render the card chrome.
 */
export default function SwatchDetailCard({
  swatch,
  box,
  expanded,
  copied,
  reduced,
  onCopy,
  onUnsave,
  onClose,
}: Props) {
  return (
    <div
      className={[
        'swatch-focus-card',
        expanded ? 'is-expanded' : '',
        reduced ? 'is-reduced' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
      role="dialog"
      aria-modal="true"
      aria-label={`#${swatch.hex}`}
    >
      <div className="swatch-focus-card__color" style={{ background: `#${swatch.hex}` }} />
      <p className="swatch-focus-card__kicker text-label-1">HEX code</p>
      <p className="swatch-focus-card__hex text-heading-1">{swatch.hex}</p>
      <button
        type="button"
        className="swatch-focus-card__icon swatch-focus-card__icon--copy"
        onClick={onCopy}
        aria-label={copied ? `Copied #${swatch.hex}` : `Copy #${swatch.hex}`}
      >
        {copied ? <CopyFilledIcon /> : <CopyIcon />}
      </button>
      <button
        type="button"
        className="swatch-focus-card__icon swatch-focus-card__icon--save"
        onClick={onUnsave}
        aria-label={`Remove #${swatch.hex} from saved swatches`}
      >
        <BookmarkIcon />
      </button>
      <button type="button" className="swatch-focus-card__close text-heading-1" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

/** Figma Copy (90:159) — overlapping squares, cream front. */
function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M15.1025 0.00488281C15.6067 0.0562146 16 0.482323 16 1V13L15.9951 13.1025C15.9472 13.573 15.573 13.9472 15.1025 13.9951L15 14H13.2002V13.5996H15C15.3314 13.5996 15.5996 13.3314 15.5996 13V1C15.5996 0.668629 15.3314 0.400391 15 0.400391H3C2.66863 0.400391 2.40039 0.668629 2.40039 1V2.7998H2V1C2 0.447715 2.44772 2.41596e-08 3 0H15L15.1025 0.00488281Z"
        fill="#827A64"
      />
      <rect x="0.2" y="2.2" width="13.6" height="13.6" rx="0.8" fill="#FFF8F0" stroke="#827A64" strokeWidth="0.4" />
    </svg>
  );
}

/** Figma Copy selected (91:177) — front square filled text-secondary. */
function CopyFilledIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M15.1025 0.00488281C15.6067 0.0562146 16 0.482323 16 1V13L15.9951 13.1025C15.9472 13.573 15.573 13.9472 15.1025 13.9951L15 14H13.2002V13.5996H15C15.3314 13.5996 15.5996 13.3314 15.5996 13V1C15.5996 0.668629 15.3314 0.400391 15 0.400391H3C2.66863 0.400391 2.40039 0.668629 2.40039 1V2.7998H2V1C2 0.447715 2.44772 2.41596e-08 3 0H15L15.1025 0.00488281Z"
        fill="#827A64"
      />
      <rect x="0.2" y="2.2" width="13.6" height="13.6" rx="0.8" fill="#59554B" stroke="#827A64" strokeWidth="0.4" />
    </svg>
  );
}

/** Figma Subtract bookmark (89:120), 15×19.66. */
function BookmarkIcon() {
  return (
    <svg width="15" height="20" viewBox="0 0 15 19.6592" fill="none" aria-hidden="true">
      <path
        d="M13 0C14.1046 0 15 0.895431 15 2V19.6592L7.5 11L0 19.6592V2C2.57706e-07 0.895431 0.895431 5.63724e-08 2 0H13Z"
        fill="#59554B"
      />
    </svg>
  );
}

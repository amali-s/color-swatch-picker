import { Bookmark } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DUR_BASE, DUR_QUICK, EASE_SNAP } from '../capture/motion';
import ScrambleCode from './SkeletonChips';
import type { CSSProperties } from 'react';
import type { Swatch } from '../types';

export type ChipAnchor = 'center' | 'left';
export type ChipPhase = 'idle' | 'scanning' | 'settling' | 'revealed' | 'returning';

interface Props {
  index: number;
  phase: ChipPhase;
  slot: { left: string; top: string };
  slotAnchor: ChipAnchor;
  destination: { left: string; top: string };
  destAnchor: ChipAnchor;
  swatch: Swatch | null;
  saved: boolean;
  copied: boolean;
  /** Motion allowed (false under prefers-reduced-motion). */
  animate: boolean;
  /** Stagger before travel starts, in ms. */
  travelDelay: number;
  /** Hidden revealed-size probe for the parent's size-aware clamp. */
  sizerRef?: (el: HTMLDivElement | null) => void;
  onToggle: () => void;
  onCopy: () => void;
}

/**
 * One capture chip through the whole story: idle em-dashes at the CHIP_LAYOUT
 * slot, scramble while holding/reading, then a FLIP travel to the blob
 * anchor while the reels settle and the square fills. Never two pills for
 * the same color.
 */
export default function CaptureChip({
  index,
  phase,
  slot,
  slotAnchor,
  destination,
  destAnchor,
  swatch,
  saved,
  copied,
  animate,
  travelDelay,
  sizerRef,
  onToggle,
  onCopy,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRectRef = useRef<DOMRect | null>(null);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bookmarkMotion, setBookmarkMotion] = useState<'save' | 'unsave' | null>(null);

  const atDest = phase === 'settling' || phase === 'revealed';
  const layout = atDest
    ? { position: destination, anchor: destAnchor }
    : { position: slot, anchor: slotAnchor };
  const asSwatch = atDest;
  const interactive = phase === 'revealed' && Boolean(swatch);
  const showHex = (phase === 'settling' || phase === 'revealed') && Boolean(swatch);
  const showBookmark = asSwatch && Boolean(swatch);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    if (phase === 'idle' || phase === 'scanning') {
      el.style.transition = '';
      el.style.transform = '';
      firstRectRef.current = el.getBoundingClientRect();
      return;
    }

    if (phase === 'revealed') {
      firstRectRef.current = el.getBoundingClientRect();
      return;
    }

    if (!animate) return;
    if (phase !== 'settling' && phase !== 'returning') return;

    const first = firstRectRef.current;
    if (!first) return;
    const last = el.getBoundingClientRect();
    const sx = last.width ? first.width / last.width : 1;
    const sy = last.height ? first.height / last.height : 1;
    const dx = first.left + first.width / 2 - (last.left + last.width / 2);
    const dy = first.top + first.height / 2 - (last.top + last.height / 2);

    el.style.transition = 'none';
    el.style.transformOrigin = 'center center';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    void el.offsetWidth;

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        el.style.transition = `transform ${DUR_BASE}ms ${EASE_SNAP} ${travelDelay}ms`;
        el.style.transform = 'translate(0, 0) scale(1)';
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [phase, animate, travelDelay]);

  useEffect(
    () => () => {
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    },
    [],
  );

  const handleToggle = () => {
    if (bookmarkMotion) return;
    if (burstTimerRef.current) {
      clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
    onToggle();
    if (!animate) return;
    setBookmarkMotion(saved ? 'unsave' : 'save');
    burstTimerRef.current = setTimeout(() => {
      burstTimerRef.current = null;
      setBookmarkMotion(null);
    }, DUR_QUICK);
  };

  const className = [
    'capture-chip',
    asSwatch ? 'capture-chip--swatch' : 'capture-chip--loader',
    `capture-chip--${layout.anchor}`,
    interactive ? 'is-interactive' : '',
    phase === 'revealed' ? 'is-landed' : '',
    copied ? 'is-copied' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const bookmarkFilled = saved;
  const bookmarkBusy = copied || Boolean(bookmarkMotion);

  return (
    <>
      <div ref={rootRef} className={className} style={layout.position as CSSProperties} aria-hidden={!interactive}>
        <button
          type="button"
          className="capture-chip__copy"
          onClick={onCopy}
          disabled={!interactive}
          tabIndex={interactive ? undefined : -1}
          aria-label={
            swatch
              ? copied
                ? `Copied #${swatch.hex}`
                : `Copy #${swatch.hex}`
              : undefined
          }
        >
          <ChipFace
            phase={phase}
            swatch={swatch}
            asSwatch={asSwatch}
            showHex={showHex}
            copied={copied}
            animate={animate}
            index={index}
          />
        </button>
        {showBookmark && (
          <button
            type="button"
            aria-label={
              saved ? `Remove #${swatch!.hex} from saved swatches` : `Save #${swatch!.hex}`
            }
            aria-pressed={saved}
            onClick={handleToggle}
            className="capture-chip__save"
            tabIndex={interactive && !copied ? undefined : -1}
            disabled={!interactive || bookmarkBusy}
          >
            <span
              className={`bookmark-pop${
                bookmarkMotion && animate
                  ? bookmarkMotion === 'save'
                    ? ' is-saving'
                    : ' is-unsaving'
                  : ''
              }`}
            >
              <Bookmark
                size={15}
                color="var(--text-tertiary)"
                fill={bookmarkFilled ? 'var(--text-tertiary)' : 'none'}
                strokeWidth={1.75}
              />
            </span>
          </button>
        )}
      </div>
      {swatch && (
        <div
          ref={sizerRef}
          className="capture-chip capture-chip--swatch capture-chip--sizer"
          aria-hidden="true"
        >
          <span className="capture-chip__square is-filled" style={{ background: `#${swatch.hex}` }} />
          <span className="text-label-2" style={{ color: 'var(--text-secondary)' }}>
            {swatch.hex}
          </span>
          <span className="capture-chip__save" />
        </div>
      )}
    </>
  );
}

function ChipFace({
  phase,
  swatch,
  asSwatch,
  showHex,
  copied,
  animate,
  index,
}: {
  phase: ChipPhase;
  swatch: Swatch | null;
  asSwatch: boolean;
  showHex: boolean;
  copied: boolean;
  animate: boolean;
  index: number;
}) {
  const filled = Boolean(swatch) && asSwatch;
  return (
    <>
      <span
        className={`capture-chip__square${filled ? ' is-filled' : ''}`}
        style={filled ? { background: `#${swatch!.hex}` } : undefined}
      />
      <span className="capture-chip__code">
        <ScrambleCode
          scanning={phase === 'scanning' || phase === 'settling'}
          settleHex={phase === 'settling' || phase === 'revealed' ? swatch?.hex : null}
          animate={animate}
          chipIndex={index}
        />
        {showHex && swatch && (
          <span
            className={`capture-chip__hex text-label-2${phase === 'revealed' ? ' is-on' : ''}`}
            style={{ color: 'var(--text-secondary)' }}
          >
            <span className={`copy-swap${copied ? ' is-copied' : ''}`} aria-hidden="true">
              <span className="copy-swap__hex">{swatch.hex}</span>
              <span className="copy-swap__copied">Copied</span>
            </span>
          </span>
        )}
      </span>
    </>
  );
}

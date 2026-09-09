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
  /** Fade in (`in`) or fade out (`out`) — parent unmounts after the exit. */
  gate: 'in' | 'out';
  /** Hidden revealed-size probe for the parent's size-aware clamp. */
  sizerRef?: (el: HTMLDivElement | null) => void;
  onToggle: () => void;
  onCopy: () => void;
  /** Called once the press clears the drag threshold, with the pill's rect
   *  as it was when the press began. */
  onDragStart?: (rect: DOMRect) => void;
  /** Cumulative pointer travel since the press began. */
  onDragMove?: (dx: number, dy: number) => void;
  onDragEnd?: () => void;
}

/** Pointer travel (px) before a press on a landed chip becomes a drag. */
const DRAG_SLOP = 8;

/**
 * One capture chip through the whole story: absent on the idle viewfinder,
 * scramble while holding/reading (fades in after a short hold beat), then a
 * FLIP travel to the blob anchor while the reels settle and the square fills.
 * Never two pills for the same color.
 *
 * Once landed, the pill is also draggable: the blob anchor is a guess, and a
 * chip sitting on the part of the photo the user wants to see should be
 * movable. Dragging only exists for a filled swatch — a loader has nothing to
 * reposition.
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
  gate,
  sizerRef,
  onToggle,
  onCopy,
  onDragStart,
  onDragMove,
  onDragEnd,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRectRef = useRef<DOMRect | null>(null);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressRef = useRef<{
    id: number;
    x: number;
    y: number;
    rect: DOMRect;
    dragging: boolean;
  } | null>(null);
  // Set for the lifetime of one press, so the click that follows a drag does
  // not also copy the hex.
  const draggedRef = useRef(false);
  const [bookmarkMotion, setBookmarkMotion] = useState<'save' | 'unsave' | null>(null);
  const [dragging, setDragging] = useState(false);
  // First paint is faded out so the hold-in transition has a from-state.
  const [entered, setEntered] = useState(() => !animate);

  const atDest = phase === 'settling' || phase === 'revealed';
  const layout = atDest
    ? { position: destination, anchor: destAnchor }
    : { position: slot, anchor: slotAnchor };
  const asSwatch = atDest;
  const interactive = phase === 'revealed' && Boolean(swatch);
  const showHex = (phase === 'settling' || phase === 'revealed') && Boolean(swatch);
  const showBookmark = asSwatch && Boolean(swatch);
  const draggable = interactive && Boolean(onDragMove);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    if (phase === 'idle' || phase === 'scanning') {
      el.style.transition = '';
      el.style.transform = '';
      if (entered) firstRectRef.current = el.getBoundingClientRect();
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
  }, [phase, animate, travelDelay, entered]);

  useLayoutEffect(() => {
    if (gate === 'out') {
      setEntered(false);
      return;
    }
    if (!animate) {
      setEntered(true);
      return;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [gate, animate]);

  // A drag moves the pill without touching `transform`, so the FLIP baseline
  // goes stale and the retake would fly the chip out from its old spot.
  useLayoutEffect(() => {
    if (phase !== 'revealed') return;
    const el = rootRef.current;
    if (el) firstRectRef.current = el.getBoundingClientRect();
  }, [phase, layout.position.left, layout.position.top]);

  useEffect(
    () => () => {
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    },
    [],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // A filled container is not "empty space": swallow the press so the
    // viewport does not read it as a tap to retake.
    if (asSwatch) event.stopPropagation();
    draggedRef.current = false;
    if (!draggable) return;
    const el = rootRef.current;
    if (!el) return;
    pressRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rect: el.getBoundingClientRect(),
      dragging: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press || press.id !== event.pointerId) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;

    if (!press.dragging) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      press.dragging = true;
      draggedRef.current = true;
      setDragging(true);
      // Keep receiving moves once the pointer slides off the pill.
      rootRef.current?.setPointerCapture(event.pointerId);
      onDragStart?.(press.rect);
    }
    onDragMove?.(dx, dy);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press || press.id !== event.pointerId) return;
    pressRef.current = null;
    if (!press.dragging) return;
    setDragging(false);
    if (rootRef.current?.hasPointerCapture(event.pointerId)) {
      rootRef.current.releasePointerCapture(event.pointerId);
    }
    onDragEnd?.();
  };

  const handleClickCapture = (event: React.MouseEvent) => {
    if (!draggedRef.current) return;
    draggedRef.current = false;
    event.stopPropagation();
    event.preventDefault();
  };

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
    draggable ? 'is-draggable' : '',
    dragging ? 'is-dragging' : '',
    'is-gated',
    entered ? 'is-entered' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const bookmarkFilled = saved;
  const bookmarkBusy = copied || Boolean(bookmarkMotion);

  return (
    <>
      <div
        ref={rootRef}
        className={className}
        style={layout.position as CSSProperties}
        aria-hidden={!interactive}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClickCapture={handleClickCapture}
      >
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

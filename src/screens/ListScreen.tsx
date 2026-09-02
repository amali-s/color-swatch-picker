import { useEffect, useLayoutEffect, useState } from 'react';
import Header from '../components/Header';
import PrimaryButton from '../components/PrimaryButton';
import SwatchRow from '../components/SwatchRow';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { DUR_BASE, DUR_FLASH, STAGGER_REVERSE } from '../capture/motion';
import type { Swatch } from '../types';

interface Props {
  swatches: Swatch[];
  onRemove: (id: string) => void;
  onOpenCamera: () => void;
  /** True if this session has seen an empty list (survives the camera tab). */
  sawEmpty: boolean;
  /** Call once the empty→filled ceremony has been claimed so it does not replay. */
  onConsumedEmpty: () => void;
}

type Phase = 'empty' | 'empty-in' | 'forward' | 'filled';

const CEREMONY_ROWS = 3;
const FORWARD_MS = DUR_BASE + STAGGER_REVERSE * (CEREMONY_ROWS - 1);

/**
 * Ids already revealed on the list this session. Module-level so a camera
 * visit (which unmounts ListScreen) does not re-enter every row on return.
 * Hydrated rows are seeded on first filled visit; later newcomers fade up.
 */
const revealedIds = new Set<string>();
let listSeeded = false;

function prefersReduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function initialPhase(count: number, sawEmpty: boolean): Phase {
  if (count === 0) return 'empty';
  if (sawEmpty && !prefersReduced()) return 'forward';
  return 'filled';
}

/**
 * The Swatches tab — one screen in two data states: the "Empty state" (1:2)
 * card when nothing is saved, and the "Filled" (31:583) saved-swatches list
 * once at least one color has been captured. The bottom nav lives in App so
 * the active pill can slide without remounting.
 *
 * Empty↔filled is a ceremony, not a hard cut: the empty card eases out then
 * the heading + first rows fade up. First save usually happens on Camera, so
 * `sawEmpty` (owned by App) is what fires the arrival animation.
 */
export default function ListScreen({
  swatches,
  onRemove,
  onOpenCamera,
  sawEmpty,
  onConsumedEmpty,
}: Props) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>(() => initialPhase(swatches.length, sawEmpty));
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());
  const [announcement, setAnnouncement] = useState('');

  // Seed "already shown" ids on the first non-ceremony visit so a reload of
  // a filled list does not replay enter, and so first-save ceremony rows are
  // not marked revealed until they have played.
  if (!listSeeded) {
    listSeeded = true;
    if (phase !== 'forward') {
      swatches.forEach((s) => revealedIds.add(s.id));
    }
  }

  useLayoutEffect(() => {
    if (swatches.length === 0 && phase !== 'empty' && phase !== 'empty-in') {
      setPhase(reduced ? 'empty' : 'empty-in');
    } else if (swatches.length > 0 && (phase === 'empty' || phase === 'empty-in')) {
      setPhase(reduced ? 'filled' : 'forward');
    }
  }, [swatches.length, phase, reduced]);

  useLayoutEffect(() => {
    for (const id of [...revealedIds]) {
      if (!swatches.some((s) => s.id === id)) revealedIds.delete(id);
    }

    if (phase === 'forward') {
      swatches.forEach((s) => revealedIds.add(s.id));
      return;
    }

    if (phase !== 'filled' || reduced) {
      swatches.forEach((s) => revealedIds.add(s.id));
      return;
    }

    const newcomers = swatches.filter((s) => !revealedIds.has(s.id)).map((s) => s.id);
    if (newcomers.length === 0) return;

    // Do not mark revealed until the enter animation finishes — otherwise
    // StrictMode's effect cleanup cancels the timeout and the class sticks.
    setEnteringIds((prev) => {
      const next = new Set(prev);
      newcomers.forEach((id) => next.add(id));
      return next;
    });
    const t = setTimeout(() => {
      newcomers.forEach((id) => revealedIds.add(id));
      setEnteringIds((prev) => {
        const next = new Set(prev);
        newcomers.forEach((id) => next.delete(id));
        return next;
      });
    }, DUR_BASE);
    return () => clearTimeout(t);
  }, [swatches, phase, reduced]);

  useEffect(() => {
    if (phase !== 'forward') return;
    const t = setTimeout(() => {
      setPhase('filled');
      onConsumedEmpty();
    }, FORWARD_MS);
    return () => clearTimeout(t);
  }, [phase, onConsumedEmpty]);

  useEffect(() => {
    if (phase !== 'empty-in') return;
    const t = setTimeout(() => setPhase('empty'), DUR_FLASH);
    return () => clearTimeout(t);
  }, [phase]);

  const showEmpty =
    phase === 'empty' ||
    phase === 'empty-in' ||
    phase === 'forward' ||
    swatches.length === 0;
  const showList = phase === 'forward' || (phase === 'filled' && swatches.length > 0);

  return (
    <div className="screen" style={{ background: 'var(--layer-1)' }}>
      <div className="screen__content">
        <Header />

        <div className="list-swap">
          {showEmpty && (
            <div
              className={[
                'list-swap__empty',
                'empty-card',
                phase === 'forward' ? 'is-exiting' : '',
                phase === 'empty-in' ? 'is-entering' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <h2 className="text-heading-2" style={{ color: 'var(--text-secondary)' }}>
                Start swatching
              </h2>
              <p
                className="text-body-1"
                style={{ color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 212 }}
              >
                Swipe to open the camera and start collecting colors.
              </p>
              <PrimaryButton onClick={onOpenCamera}>Open camera</PrimaryButton>
            </div>
          )}

          {showList && (
            <div className="list-swap__filled">
              <h2
                className={`swatch-list-heading text-heading-2${
                  phase === 'forward' ? ' is-entering' : ''
                }`}
              >
                Saved swatches
              </h2>
              <div className="swatch-list">
                {swatches.map((swatch, index) => {
                  const ceremonyEnter = phase === 'forward' && index < CEREMONY_ROWS;
                  const rowEnter =
                    !reduced &&
                    (ceremonyEnter ||
                      enteringIds.has(swatch.id) ||
                      (phase === 'filled' && !revealedIds.has(swatch.id)));
                  return (
                    <SwatchRow
                      key={swatch.id}
                      swatch={swatch}
                      onRemove={onRemove}
                      onAnnounce={setAnnouncement}
                      entering={rowEnter}
                      enterDelay={ceremonyEnter ? index * STAGGER_REVERSE : 0}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Screen-reader announcement for copy actions. */}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

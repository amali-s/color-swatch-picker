import { useEffect, useLayoutEffect, useState } from 'react';
import Header from '../components/Header';
import PrimaryButton from '../components/PrimaryButton';
import SwatchOrbit from '../components/SwatchOrbit';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { DUR_BASE, DUR_FLASH } from '../capture/motion';
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

const FORWARD_MS = DUR_BASE;

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
 * card when nothing is saved, and the "Filled" saved-swatches view — a color
 * wheel (`SwatchOrbit`) — once at least one color has been captured. The
 * bottom nav lives in App so the active pill can slide without remounting.
 *
 * Empty↔filled is a ceremony, not a hard cut: the empty card eases out then
 * the heading + wheel fade up together. First save usually happens on
 * Camera, so `sawEmpty` (owned by App) is what fires the arrival animation.
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
  const [announcement, setAnnouncement] = useState('');

  useLayoutEffect(() => {
    if (swatches.length === 0 && phase !== 'empty' && phase !== 'empty-in') {
      setPhase(reduced ? 'empty' : 'empty-in');
    } else if (swatches.length > 0 && (phase === 'empty' || phase === 'empty-in')) {
      setPhase(reduced ? 'filled' : 'forward');
    }
  }, [swatches.length, phase, reduced]);

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
              <SwatchOrbit
                swatches={swatches}
                onRemove={onRemove}
                onAnnounce={setAnnouncement}
                entering={phase === 'forward'}
              />
            </div>
          )}
        </div>
      </div>

      {/* Screen-reader announcement for copy/remove actions. */}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

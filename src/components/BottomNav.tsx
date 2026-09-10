import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import SwatchesIcon from './SwatchesIcon';
import CameraIcon from './CameraIcon';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import type { View } from '../App';

interface Props {
  view: View;
  onChange: (view: View) => void;
}

interface PillMetrics {
  x: number;
  w: number;
  h: number;
}

/**
 * Persistent bottom tab bar — cream (`--foreground`) surface. A single
 * `--background` indicator sits behind the two buttons and slides between
 * them; the glyphs themselves don't recolour (matches the exported mocks).
 * Both buttons are ≥44px, carry a Label 2 caption, and expose `aria-current`.
 */
export default function BottomNav({ view, onChange }: Props) {
  const reduced = usePrefersReducedMotion();
  const clusterRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLButtonElement>(null);
  const cameraRef = useRef<HTMLButtonElement>(null);
  const [pill, setPill] = useState<PillMetrics>({ x: 0, w: 84, h: 48 });
  const [canSlide, setCanSlide] = useState(false);

  const measure = useCallback(() => {
    const origin = listRef.current;
    const target = view === 'list' ? listRef.current : cameraRef.current;
    if (!origin || !target) return;
    setPill({
      x: target.offsetLeft - origin.offsetLeft,
      w: origin.offsetWidth,
      h: origin.offsetHeight,
    });
  }, [view]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useLayoutEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    const ro = new ResizeObserver(measure);
    ro.observe(cluster);
    if (listRef.current) ro.observe(listRef.current);
    if (cameraRef.current) ro.observe(cameraRef.current);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setCanSlide(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const slide = canSlide && !reduced;

  return (
    <nav className="bottom-nav" aria-label="Views" data-view={view}>
      <div ref={clusterRef} className="bottom-nav__cluster">
        <span
          className={`bottom-nav__indicator${slide ? ' is-ready' : ''}`}
          style={{
            width: pill.w,
            height: pill.h,
            transform: `translateX(${pill.x}px)`,
          }}
          aria-hidden="true"
        />
        <button
          ref={listRef}
          type="button"
          aria-current={view === 'list' ? 'page' : undefined}
          onClick={() => onChange('list')}
          className="bottom-nav__button"
        >
          <SwatchesIcon size={14} />
          <span className="bottom-nav__label text-label-2">Swatches</span>
        </button>
        <button
          ref={cameraRef}
          type="button"
          aria-current={view === 'camera' ? 'page' : undefined}
          onClick={() => onChange('camera')}
          className="bottom-nav__button"
        >
          <CameraIcon size={14} />
          <span className="bottom-nav__label text-label-2">Camera</span>
        </button>
      </div>
    </nav>
  );
}

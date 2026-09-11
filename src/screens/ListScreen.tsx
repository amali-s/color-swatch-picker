import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import Header from '../components/Header';
import PrimaryButton from '../components/PrimaryButton';
import SwatchDetailCard from '../components/SwatchDetailCard';
import SwatchOrbit from '../components/SwatchOrbit';
import SwatchRow from '../components/SwatchRow';
import ViewSwitcher, { type SwatchViewMode } from '../components/ViewSwitcher';
import { copyText } from '../lib/clipboard';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useWideLayout } from '../hooks/useWideLayout';
import { DUR_BASE, DUR_FLASH, STAGGER } from '../capture/motion';
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
const VIEW_MODE_KEY = 'lens-swatch:view-mode';

function prefersReduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function initialPhase(count: number, sawEmpty: boolean): Phase {
  if (count === 0) return 'empty';
  if (sawEmpty && !prefersReduced()) return 'forward';
  return 'filled';
}

function loadViewMode(): SwatchViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    if (v === 'list' || v === 'wheel') return v;
  } catch {
    /* Storage unavailable — default to the wheel. */
  }
  return 'wheel';
}

/**
 * The Swatches tab — one screen in two data states: the "Empty state" (1:2)
 * card when nothing is saved, and the "Filled" saved-swatches view — a color
 * wheel (`SwatchOrbit`) or the restored list (`SwatchRow`) — once at least
 * one color has been captured. The bottom nav lives in App so the active
 * pill can slide without remounting.
 *
 * Empty↔filled is a ceremony, not a hard cut: the empty card eases out then
 * the heading + collection fade up together. First save usually happens on
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
  const wide = useWideLayout();
  const [phase, setPhase] = useState<Phase>(() => initialPhase(swatches.length, sawEmpty));
  const [announcement, setAnnouncement] = useState('');
  const [viewMode, setViewMode] = useState<SwatchViewMode>(loadViewMode);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onViewMode = (mode: SwatchViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* Storage unavailable — keep going in memory only. */
    }
  };

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

  useEffect(() => {
    if (!wide || swatches.length === 0) {
      if (swatches.length === 0) setSelectedId(null);
      return;
    }
    if (selectedId && swatches.some((s) => s.id === selectedId)) return;
    setSelectedId(swatches[0].id);
  }, [wide, swatches, selectedId]);

  const selected = swatches.find((s) => s.id === selectedId) ?? null;

  const onSelect = useCallback((swatch: Swatch) => {
    setSelectedId(swatch.id);
    setCopied(false);
  }, []);

  const onCopySelected = useCallback(async () => {
    if (!selected) return;
    const ok = await copyText(`#${selected.hex}`);
    if (!ok) return;
    setCopied(true);
    setAnnouncement(`Copied #${selected.hex}`);
    window.setTimeout(() => setCopied(false), 1200);
  }, [selected]);

  const onUnsaveSelected = useCallback(() => {
    if (!selected) return;
    const index = swatches.findIndex((s) => s.id === selected.id);
    onRemove(selected.id);
    setAnnouncement(`Removed #${selected.hex}`);
    const next = swatches.filter((s) => s.id !== selected.id);
    const neighbor = next[Math.min(index, next.length - 1)] ?? null;
    setSelectedId(neighbor?.id ?? null);
    setCopied(false);
  }, [onRemove, selected, swatches]);

  const showEmpty =
    phase === 'empty' ||
    phase === 'empty-in' ||
    phase === 'forward' ||
    swatches.length === 0;
  const showList = phase === 'forward' || (phase === 'filled' && swatches.length > 0);
  const entering = phase === 'forward';

  return (
    <div className="screen" style={{ background: 'var(--layer-1)' }}>
      <div className="screen__content">
        {!wide && <Header />}

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
              <p className="empty-card__copy text-body-1">
                {wide
                  ? 'Open the camera or upload a photo and start collecting colors.'
                  : 'Swipe to open the camera and start collecting colors.'}
              </p>
              <PrimaryButton onClick={onOpenCamera}>Open camera</PrimaryButton>
            </div>
          )}

          {showList && (
            <div className={`list-swap__filled${wide ? ' is-split' : ''}`}>
              <div className="swatch-split__collection">
                <div className={`swatch-list-toolbar${entering ? ' is-entering' : ''}`}>
                  <h2 className="swatch-list-heading text-heading-1">Saved swatches</h2>
                  <ViewSwitcher value={viewMode} onChange={onViewMode} />
                </div>
                {viewMode === 'list' ? (
                  <div className="swatch-list">
                    {swatches.map((swatch, i) => (
                      <SwatchRow
                        key={swatch.id}
                        swatch={swatch}
                        onRemove={onRemove}
                        onAnnounce={setAnnouncement}
                        entering={entering}
                        enterDelay={entering ? i * STAGGER : 0}
                        selected={wide && swatch.id === selectedId}
                        onSelect={wide ? onSelect : undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <SwatchOrbit
                    swatches={swatches}
                    onRemove={onRemove}
                    onAnnounce={setAnnouncement}
                    entering={entering}
                    selectedId={wide ? selectedId : undefined}
                    onSelect={wide ? onSelect : undefined}
                  />
                )}
              </div>
              {wide && (
                <aside className="swatch-split__panel">
                  {selected ? (
                    <SwatchDetailCard
                      swatch={selected}
                      expanded
                      copied={copied}
                      reduced={reduced}
                      variant="panel"
                      onCopy={onCopySelected}
                      onUnsave={onUnsaveSelected}
                      onClose={() => setSelectedId(null)}
                    />
                  ) : (
                    <div className="swatch-panel-empty">
                      <p className="text-body-1" style={{ color: 'var(--text-secondary)' }}>
                        Select a color to inspect it.
                      </p>
                    </div>
                  )}
                </aside>
              )}
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

import { useState } from 'react';
import Header from '../components/Header';
import PrimaryButton from '../components/PrimaryButton';
import SwatchRow from '../components/SwatchRow';
import type { Swatch } from '../types';

interface Props {
  swatches: Swatch[];
  onRemove: (id: string) => void;
  onOpenCamera: () => void;
}

/**
 * The Swatches tab — one screen in two data states: the "Empty state" (1:2)
 * card when nothing is saved, and the "Filled" (31:583) saved-swatches list
 * once at least one color has been captured. The bottom nav lives in App so
 * the active pill can slide without remounting.
 */
export default function ListScreen({ swatches, onRemove, onOpenCamera }: Props) {
  const isEmpty = swatches.length === 0;
  const [announcement, setAnnouncement] = useState('');

  return (
    <div className="screen" style={{ background: 'var(--layer-1)' }}>
      <div className="screen__content">
        <Header />

        {isEmpty ? (
          <div className="empty-card">
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
        ) : (
          <>
            <h2
              className="text-heading-2"
              style={{ color: 'var(--text-tertiary)', marginTop: 56, marginBottom: 8 }}
            >
              Saved swatches
            </h2>
            <div className="swatch-list">
              {swatches.map((swatch) => (
                <SwatchRow
                  key={swatch.id}
                  swatch={swatch}
                  onRemove={onRemove}
                  onAnnounce={setAnnouncement}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Screen-reader announcement for copy actions. */}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

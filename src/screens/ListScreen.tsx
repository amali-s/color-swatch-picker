import { useState } from 'react';
import Header from '../components/Header';
import PrimaryButton from '../components/PrimaryButton';
import SwatchRow from '../components/SwatchRow';
import BottomNav from '../components/BottomNav';
import type { Swatch } from '../types';
import type { View } from '../App';

interface Props {
  swatches: Swatch[];
  onRemove: (id: string) => void;
  onOpenCamera: () => void;
  onNavChange: (view: View) => void;
}

/**
 * The Swatches tab — one screen in two data states: the "Empty state" (1:2)
 * card when nothing is saved, and the "Filled" (31:583) saved-swatches list
 * once at least one color has been captured. The bottom nav is persistent
 * across both.
 */
export default function ListScreen({ swatches, onRemove, onOpenCamera, onNavChange }: Props) {
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

      <BottomNav view="list" onChange={onNavChange} />
    </div>
  );
}

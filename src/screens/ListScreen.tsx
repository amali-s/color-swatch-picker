import Header from '../components/Header';
import PrimaryButton from '../components/PrimaryButton';
import SwatchRow from '../components/SwatchRow';
import BottomNav from '../components/BottomNav';
import type { Swatch } from '../types';
import type { View } from '../App';

interface Props {
  swatches: Swatch[];
  onOpenCamera: () => void;
  onNavChange: (view: View) => void;
}

/**
 * Covers two Figma frames that are really one screen in two data states:
 * "Empty state" (1:2) when there's nothing saved yet, and "Filled" (2:172)
 * once at least one swatch has been captured.
 */
export default function ListScreen({ swatches, onOpenCamera, onNavChange }: Props) {
  const isEmpty = swatches.length === 0;

  return (
    <div className="screen" style={{ background: 'var(--layer-1)' }}>
      <div className="screen__content">
        <Header />

        {isEmpty ? (
          <div className="empty-card">
            <h2 className="text-heading-2" style={{ color: 'var(--text-secondary)' }}>
              Start swatching
            </h2>
            <p className="text-body-1" style={{ color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 212 }}>
              Swipe to open the camera and start collecting colors.
            </p>
            <PrimaryButton onClick={onOpenCamera}>Open camera</PrimaryButton>
          </div>
        ) : (
          <>
            <h2 className="text-heading-2" style={{ color: 'var(--text-tertiary)', marginTop: 56, marginBottom: 24 }}>
              Saved swatches
            </h2>
            <div className="swatch-list">
              {swatches.map((swatch) => (
                <SwatchRow key={swatch.id} {...swatch} />
              ))}
            </div>
          </>
        )}
      </div>

      {!isEmpty && <BottomNav view="list" onChange={onNavChange} />}
    </div>
  );
}

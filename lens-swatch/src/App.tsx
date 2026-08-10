import { useState } from 'react';
import ListScreen from './screens/ListScreen';
import CameraScreen from './screens/CameraScreen';
import type { Swatch } from './types';
import './App.css';

export type View = 'list' | 'camera';

// Stand-in for the k-means color-extraction output (Phase 2/3 of the
// roadmap). Fixed here so the three screens are wireable and demoable
// before the real algorithm exists.
const DETECTED_SWATCHES: Swatch[] = [
  { id: 'detected-1', hex: 'A69090' },
  { id: 'detected-2', hex: 'B17A7A' },
  { id: 'detected-3', hex: '907E88' },
];

function App() {
  const [view, setView] = useState<View>('list');
  const [saved, setSaved] = useState<Swatch[]>([]);

  const savedIds = new Set(saved.map((s) => s.id));

  const handleSave = (swatch: Swatch) => {
    setSaved((prev) => (prev.some((s) => s.id === swatch.id) ? prev : [swatch, ...prev]));
  };

  return (
    <div className="phone-shell">
      <div className="phone-screen">
        {view === 'list' ? (
          <ListScreen swatches={saved} onOpenCamera={() => setView('camera')} onNavChange={setView} />
        ) : (
          <CameraScreen
            detected={DETECTED_SWATCHES}
            savedIds={savedIds}
            onSave={handleSave}
            onNavChange={setView}
          />
        )}
      </div>
    </div>
  );
}

export default App;

import { useState } from 'react';
import ListScreen from './screens/ListScreen';
import CameraScreen from './screens/CameraScreen';
import type { Swatch } from './types';
import './App.css';

export type View = 'list' | 'camera';

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

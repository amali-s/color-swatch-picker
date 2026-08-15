import { useState } from 'react';
import ListScreen from './screens/ListScreen';
import CameraScreen from './screens/CameraScreen';
import { useSavedSwatches } from './hooks/useSavedSwatches';
import './App.css';

export type View = 'list' | 'camera';

function App() {
  const [view, setView] = useState<View>('list');
  const { saved, savedIds, remove, toggle } = useSavedSwatches();

  return (
    <div className="phone-shell">
      <div className="phone-screen">
        {view === 'list' ? (
          <ListScreen
            swatches={saved}
            onRemove={remove}
            onOpenCamera={() => setView('camera')}
            onNavChange={setView}
          />
        ) : (
          <CameraScreen
            savedIds={savedIds}
            onToggleSave={toggle}
            onNavChange={setView}
          />
        )}
      </div>
    </div>
  );
}

export default App;

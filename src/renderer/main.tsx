import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/app.css';

// Renderer-Einstiegspunkt. Mountet die React-App in #root.
// Boundary sitzt aussen, damit jede Render- oder Effect-Cleanup-Exception
// einen Fallback statt einer leeren Body-Surface ergibt (Bugfix 2026-05-19:
// @xterm/addon-webgl warf beim Schliessen unfertig initialisierter Tabs).
const container = document.getElementById('root');
if (!container) {
  throw new Error('Root-Container #root fehlt im HTML.');
}
createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

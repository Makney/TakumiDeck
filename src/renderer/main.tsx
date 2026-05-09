import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/app.css';

// Renderer-Einstiegspunkt. Mountet die React-App in #root.
const container = document.getElementById('root');
if (!container) {
  throw new Error('Root-Container #root fehlt im HTML.');
}
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

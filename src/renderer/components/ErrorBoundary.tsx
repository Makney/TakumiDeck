import { Component, type ErrorInfo, type ReactNode } from 'react';

// Globale ErrorBoundary ueber dem App-Tree.
//
// Hintergrund (Bugfix 2026-05-19): @xterm/addon-webgl@0.19.0 wirft in seinem
// dispose-Pfad eine TypeError, wenn ein Terminal-Tab vor vollstaendiger
// Initialisierung geschlossen wird. Ohne Boundary unmountet React den
// gesamten Render-Tree und der User sieht nur noch den Body-Background. Die
// Boundary fangt solche Effect-Cleanup-Exceptions ab, zeigt einen schmalen
// Fallback und gibt einen Reload-Hebel.
//
// Bewusst eine Class-Component, weil React kein Hook-Equivalent fuer
// componentDidCatch anbietet. Bleibt isoliert in dieser Datei.

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Logging via console — der Renderer hat keinen direkten Zugriff auf den
    // Main-Logger. Fuer Bug-Reports der Standard-DevTools-Workflow.
    console.error('[ErrorBoundary] gefangen:', error, info.componentStack);
  }

  handleReload = (): void => {
    // Renderer-Neuladen — Main bleibt am Leben, PTYs und DB-Verbindungen ueberleben.
    // Schlanker als ein App-Restart, reicht fuer die meisten Renderer-State-Brueche.
    window.location.reload();
  };

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div className="td-bootstrap td-error-boundary">
          <h1>TakumiDeck</h1>
          <p className="td-error-boundary-lead">
            Etwas in der App-Oberflaeche ist abgestuerzt. Der Hauptprozess
            (laufende Claude-Sessions, Token-Tracking, DB) ist davon nicht
            betroffen.
          </p>
          <pre className="td-error-boundary-detail">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="td-error-boundary-reload"
            onClick={this.handleReload}
          >
            Renderer neu laden
          </button>
          <p className="td-meta">
            Details fuer Bug-Reports in den DevTools (F12 oder Ctrl+Shift+I).
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

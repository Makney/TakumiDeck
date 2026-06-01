import { useRef, useState, type RefObject } from 'react';
import { Terminal } from '@xterm/xterm';
import {
  actionsToInsertText,
  classifyDrop,
} from '../../components/terminalDropHandler';
import { hasImageFiles, readFileAsBytes } from './terminalHelpers';

// Phase-2 Season-2: Drag-Drop fuer Screenshots ins Terminal. Zustand
// (isDropTarget + dragDepth) und die vier DnD-Handler plus der Datei-Insert.
export function useTerminalDragDrop(terminalRef: RefObject<Terminal | null>): {
  isDropTarget: boolean;
  handleDragEnter: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
} {
  // Phase-2 Season-2: dragenter/dragleave triggern hier — wir zählen, weil
  // dragleave auch beim Wechsel zwischen Kind-Elementen feuert (jeder Move
  // über ein neues Child-Element gibt ein leave + ein enter ab). Ein simpler
  // Bool-Toggle würde dabei flackern.
  const [isDropTarget, setIsDropTarget] = useState(false);
  const dragDepthRef = useRef(0);

  // Phase-2 Season-2: Drag-Drop für Screenshots ins Terminal.
  // dragover MUSS preventDefault rufen, sonst lehnt der Browser den drop ab
  // (Default-Verhalten: navigieren zur Datei-URL → würde den Renderer
  // wegnavigieren, was zusätzlich vom will-navigate-Handler im Main geblockt
  // wäre, aber der Drop kommt erst gar nicht zustande).
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepthRef.current++;
    if (dragDepthRef.current === 1) setIsDropTarget(true);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    // Cursor zur „Copy"-Variante — signalisiert dem User, dass der Drop OK ist.
    e.dataTransfer.dropEffect = 'copy';
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageFiles(e.dataTransfer)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDropTarget(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDropTarget(false);
    const files = Array.from(e.dataTransfer.files);
    void handleDroppedFiles(files);
  };

  const handleDroppedFiles = async (files: File[]) => {
    const term = terminalRef.current;
    if (!term) return;
    const actions = await classifyDrop(files, {
      getPathForFile: (f) => window.api.fs.getPathForFile(f),
      readAsBytes: readFileAsBytes,
    });
    const text = await actionsToInsertText(actions, {
      saveScreenshot: async ({ mime, base64 }) => {
        const res = await window.api.fs.saveScreenshot({ mime, base64 });
        return res.ok
          ? { ok: true, absolutePath: res.data.absolutePath }
          : { ok: false, error: res.error };
      },
      log: (msg, err) => console.warn(`[TerminalTab] ${msg}`, err),
    });
    if (text.length === 0) return;
    term.paste(text);
    term.focus();
  };

  return {
    isDropTarget,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}

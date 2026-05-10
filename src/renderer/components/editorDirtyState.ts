// Pure-Logik für das Dirty-Tracking eines Editor-Tabs (Sprint 7, Q1 Variante A:
// manueller Save mit „unsaved changes"-Indikator). Konsument ist die Tab-Stack-
// Komponente in Phase 4 — pro offenem Datei-Tab gehört genau ein State.
//
// Vertrag: kein Side-Effect, kein React, kein IPC. Tests fahren gegen synthetische
// Strings und prüfen Identität (Re-Use derselben Referenz, wenn nichts geändert
// wurde) plus Dirty-Detection.

export interface EditorDirtyState {
  // Letzter persistierter Inhalt, wie ihn der Server zuletzt bestätigt hat.
  // Wird beim erfolgreichen fs:write auf den neuen Wert gehoben.
  saved: string;
  // Aktueller Editor-Buffer. Kann temporär vom saved-Wert abweichen — das ist
  // genau der „dirty"-Zustand, der die UI-Pille triggert.
  buffer: string;
}

export function makeEditorState(initial: string): EditorDirtyState {
  return { saved: initial, buffer: initial };
}

export function isDirty(state: EditorDirtyState): boolean {
  return state.saved !== state.buffer;
}

// Aktualisiert den Buffer. Wenn der neue Wert identisch zum aktuellen Buffer ist,
// wird DASSELBE Objekt zurückgegeben — das spart sinnloses React-Re-Render bei
// CodeMirror-onUpdate-Events, die den gleichen Inhalt liefern (z.B. nach einem
// reinen Cursor-Move).
export function updateBuffer(state: EditorDirtyState, value: string): EditorDirtyState {
  if (state.buffer === value) return state;
  return { saved: state.saved, buffer: value };
}

// Nach erfolgreichem Server-Save: saved auf den geschriebenen Wert heben.
// Wir nehmen explizit `value` (nicht state.buffer), weil zwischen schedule-Save
// und save-success der Buffer schon weiter getippt sein kann — saved soll den
// Stand markieren, der wirklich auf der Platte steht.
export function markSaved(state: EditorDirtyState, value: string): EditorDirtyState {
  if (state.saved === value && state.buffer === value) return state;
  // Den Buffer NICHT überschreiben — User hat eventuell schon weiter getippt.
  // saved hochheben reicht, um die isDirty-Logik korrekt zu halten.
  return { saved: value, buffer: state.buffer };
}

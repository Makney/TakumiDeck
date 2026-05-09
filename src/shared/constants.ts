// Shared-Konstanten, die in Main UND Renderer benötigt werden.
//
// DEFAULT_PROJECT_ID ist die stabile UUID des Sprint-2-Default-Projects (FK-Lifeline,
// solange der Workspace-Scanner noch nicht alle Sessions echten Projekten zugeordnet
// hat). Sprint 4 macht den Bucket sichtbar als „Legacy"-Eintrag in der Sidebar, sobald
// noch Sessions daran hängen — der Renderer muss die UUID erkennen, um den Eintrag
// als Legacy zu rendern.

export const DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_PROJECT_NAME = '__default__';

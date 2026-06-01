// Domänen-Typen, die zwischen Main und Renderer geteilt werden.
//
// Barrel: re-exportiert alle Domain-Module, damit Konsumenten weiter
// `@shared/types` (bzw. `./types`) importieren koennen. Die einzelnen
// Domains liegen in Geschwister-Files dieses Ordners — neue Typen kommen in
// das thematisch passende File, nicht hierher.
//
// Aufgeteilt aus der historischen Monolith-`types.ts` (Season 35): Settings,
// Session, Project, Filesystem, Git, Templates, Docs-Sync, Token-Tracking,
// Stats, Updater und die aggregierende Bridge-API (`api.ts`).

export * from './core';
export * from './settings';
export * from './session';
export * from './project';
export * from './fs';
export * from './git';
export * from './templates';
export * from './docs';
export * from './usage';
export * from './stats';
export * from './updater';
export * from './api';

import { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME } from '@shared/constants';

// displayProjectName (Sprint 5, Drive-by aus TECH_SCHULDEN.md).
//
// Gemeinsamer Helper für die UI-Stellen, die einen Project-Anzeigenamen rendern.
// Sprint 4 hatte Sidebar mit Sonderbehandlung, TabContainer-Empty-State aber nicht —
// dadurch erschien beim Klick auf den Legacy-Bucket der DB-Rohname `__default__`.
// Der Helper mappt den Rohnamen auf „Sprint-2/3-Legacy", alle anderen Projekte
// behalten ihren echten Namen.

export interface DisplayableProject {
  id: string;
  name: string;
}

export function displayProjectName(project: DisplayableProject): string {
  if (project.id === DEFAULT_PROJECT_ID) return 'Sprint-2/3-Legacy';
  if (project.name === DEFAULT_PROJECT_NAME) return 'Sprint-2/3-Legacy';
  return project.name;
}

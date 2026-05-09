/// <reference types="vite/client" />

import type { Logger } from '../logger';

// Migrations-Runner für SQLite.
// - Migrations liegen als nummerierte .sql-Dateien in db/migrations/.
// - PRAGMA user_version trackt den aktuellen Schema-Stand.
// - Anwenden in einer einzigen Transaktion, damit Crashes mittendrin keinen Halbzustand hinterlassen.
//
// runMigrations() ist gegen ein schmales MigrationDriver-Interface getestet,
// damit Tests ohne native SQLite-Abhängigkeit laufen.

export interface MigrationDriver {
  getUserVersion(): number;
  setUserVersion(v: number): void;
  exec(sql: string): void;
  inTransaction(fn: () => void): void;
}

export interface Migration {
  id: number;
  name: string;
  up: string;
}

const sqlModules = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function loadMigrations(): Migration[] {
  const out: Migration[] = [];
  for (const [filePath, sql] of Object.entries(sqlModules)) {
    const fileName = filePath.split('/').pop();
    if (!fileName) continue;
    const stem = fileName.replace(/\.sql$/, '');
    const match = stem.match(/^(\d+)_(.+)$/);
    if (!match) continue;
    const idStr = match[1];
    const name = match[2];
    if (idStr === undefined || name === undefined) continue;
    out.push({ id: Number(idStr), name, up: sql });
  }
  return out.sort((a, b) => a.id - b.id);
}

export function runMigrations(
  driver: MigrationDriver,
  migrations: Migration[],
  log: Pick<Logger, 'info'>,
): number {
  const sorted = [...migrations].sort((a, b) => a.id - b.id);
  const current = driver.getUserVersion();
  let highest = current;

  driver.inTransaction(() => {
    for (const m of sorted) {
      if (m.id <= current) continue;
      log.info(`[migrations] ${m.id} ${m.name} ausführen`);
      driver.exec(m.up);
      highest = m.id;
    }
    if (highest > current) {
      driver.setUserVersion(highest);
    }
  });

  return highest;
}

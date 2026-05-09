import Database from 'better-sqlite3';
import { logger } from '../logger';
import { loadMigrations, runMigrations, type MigrationDriver } from './migrations';

// SQLite-Connection im Main-Prozess.
// WAL-Mode für bessere Schreib-Performance bei parallelen Lesern,
// Foreign-Keys aktiviert (nicht Default in SQLite),
// Synchronous=NORMAL als Kompromiss zwischen Crash-Sicherheit und Speed mit WAL.
export function openDatabase(file: string): Database.Database {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  const driver: MigrationDriver = {
    getUserVersion: () => Number(db.pragma('user_version', { simple: true })),
    setUserVersion: (v) => {
      db.pragma(`user_version = ${v}`);
    },
    exec: (sql) => db.exec(sql),
    inTransaction: (fn) => {
      const tx = db.transaction(fn);
      tx();
    },
  };

  const final = runMigrations(driver, loadMigrations(), logger);
  logger.info(`[db] geöffnet, Schema-Version ${final}, Datei ${file}`);
  return db;
}

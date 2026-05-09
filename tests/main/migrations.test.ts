import { describe, it, expect } from 'vitest';
import { runMigrations, type Migration, type MigrationDriver } from '../../src/main/db/migrations';

// Fake-Treiber: protokolliert exec-Calls und hält user_version im Speicher.
function makeFakeDriver(initialVersion = 0): {
  driver: MigrationDriver;
  executed: string[];
  versionHolder: { value: number };
} {
  const versionHolder = { value: initialVersion };
  const executed: string[] = [];
  const driver: MigrationDriver = {
    getUserVersion: () => versionHolder.value,
    setUserVersion: (v) => {
      versionHolder.value = v;
    },
    exec: (sql) => {
      executed.push(sql);
    },
    inTransaction: (fn) => fn(),
  };
  return { driver, executed, versionHolder };
}

const silentLog = { info: () => undefined };

describe('runMigrations', () => {
  it('führt nicht-angewandte Migrations in Reihenfolge aus', () => {
    const { driver, executed, versionHolder } = makeFakeDriver(0);
    const migrations: Migration[] = [
      { id: 1, name: 'init', up: 'A' },
      { id: 2, name: 'foo', up: 'B' },
      { id: 3, name: 'bar', up: 'C' },
    ];
    const final = runMigrations(driver, migrations, silentLog);
    expect(executed).toEqual(['A', 'B', 'C']);
    expect(versionHolder.value).toBe(3);
    expect(final).toBe(3);
  });

  it('überspringt bereits angewandte Migrations', () => {
    const { driver, executed, versionHolder } = makeFakeDriver(2);
    const migrations: Migration[] = [
      { id: 1, name: 'init', up: 'A' },
      { id: 2, name: 'foo', up: 'B' },
      { id: 3, name: 'bar', up: 'C' },
    ];
    const final = runMigrations(driver, migrations, silentLog);
    expect(executed).toEqual(['C']);
    expect(versionHolder.value).toBe(3);
    expect(final).toBe(3);
  });

  it('lässt user_version unverändert wenn nichts anzuwenden ist', () => {
    const { driver, executed, versionHolder } = makeFakeDriver(5);
    const migrations: Migration[] = [
      { id: 1, name: 'init', up: 'A' },
      { id: 2, name: 'foo', up: 'B' },
    ];
    const final = runMigrations(driver, migrations, silentLog);
    expect(executed).toEqual([]);
    expect(versionHolder.value).toBe(5);
    expect(final).toBe(5);
  });

  it('sortiert unsortierte Eingabe', () => {
    const { driver, executed } = makeFakeDriver(0);
    const migrations: Migration[] = [
      { id: 3, name: 'bar', up: 'C' },
      { id: 1, name: 'init', up: 'A' },
      { id: 2, name: 'foo', up: 'B' },
    ];
    runMigrations(driver, migrations, silentLog);
    expect(executed).toEqual(['A', 'B', 'C']);
  });
});

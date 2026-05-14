// Boot-One-Shot Backfill (Phase 2 Season 15).
//
// Zweck: zwei Klassen von Inkonsistenzen einmalig glattziehen, sobald der App-
// Start die DB geoeffnet hat.
//
// Pass 1 — Path-Hydration fuer UUID-bound Sessions.
//   Sessions mit gesetzter claude_session_id, aber jsonl_path = NULL bekommen
//   den deterministisch berechneten Pfad nachgetragen. Reine Pfad-Rechnung,
//   kein FS-Walk noetig. Quelle der Verschiebung: alle Sessions, die vor dem
//   Season-15-Patch gespawnt wurden — die hatten zwar `--session-id`, aber
//   der Spawn-Pfad hat den jsonl_path noch nicht gesetzt.
//
// Pass 2 — Pair-Up fuer resume-tote Multi-Session-Bestaende.
//   Sessions OHNE claude_session_id im selben cwd werden gegen die JSONL-
//   Files unter `<claudeProjectsRoot>/<encodeCwd(cwd)>/` gematcht. Pro cwd:
//   beide Listen sortieren (Sessions nach started_at ASC, Files nach mtime
//   ASC) und paarweise zuordnen. Bei n Sessions und m Files matcht der Pass
//   `min(n, m)` Paare — ueberzaehlige Sessions bleiben resume-tot (sind
//   dokumentiert als Limitation im SEASON_LOG), ueberzaehlige Files bleiben
//   ohne TakumiDeck-Anker (externe claude-Sessions).
//
// Beide Passes laufen einmalig hinter einem Meta-KV-Flag
// (`backfill_jsonl_link_v1` = "done"). Der Flag bleibt im SQLite-`settings`-
// KV-Store; keine Migrations-Versions-Aenderung. Hartfehler im Pass darf den
// App-Start nicht blocken — der Caller wraps den Call in try/catch.

import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { SessionRepository } from '../db/repos/sessions';
import type { MetaKvRepository } from '../db/repos/meta-kv';
import { claudeUuidFromJsonlPath, encodeCwd, expectedJsonlPath } from './cwd-encoding';
import type { Logger } from '../logger';

export const BACKFILL_FLAG_KEY = 'backfill_jsonl_link_v1';
export const BACKFILL_FLAG_VALUE = 'done';

// Schmaler FS-Driver fuer den Pass-2-Walk. Tests injizieren ein in-Memory-
// Fake; Production faehrt `realBackfillFs` weiter unten.
export interface BackfillFsDriver {
  // Liest alle Eintraege im Folder; wirft, wenn der Folder nicht existiert.
  // Statt `readdir({withFileTypes})` returnt die Funktion direkt die Liste
  // der Files mit ihrem mtimeMs. Verzeichnisse + nicht-jsonl-Eintraege werden
  // schon hier rausgefiltert.
  listJsonlFilesWithMtime(folder: string): Promise<Array<{ filePath: string; mtimeMs: number }>>;
}

export const realBackfillFs: BackfillFsDriver = {
  async listJsonlFilesWithMtime(folder: string) {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(folder);
    } catch (e) {
      // ENOENT ist der erwartete Fall, wenn der User nie aus diesem cwd mit
      // claude gestartet hat — leere Liste statt Throw.
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return [];
      throw e;
    }
    const out: Array<{ filePath: string; mtimeMs: number }> = [];
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.jsonl')) continue;
      const full = path.join(folder, entry);
      try {
        const stat = await fs.stat(full);
        if (!stat.isFile()) continue;
        out.push({ filePath: full, mtimeMs: stat.mtimeMs });
      } catch {
        // Race mit anderem Prozess der das File loescht — ueberspringen.
        continue;
      }
    }
    return out;
  },
};

export interface RunBackfillDeps {
  sessions: SessionRepository;
  meta: MetaKvRepository;
  claudeProjectsRoot: string;
  fs?: BackfillFsDriver;
  log: Logger;
}

export interface BackfillReport {
  pathHydrated: number; // Pass 1: Sessions, die einen jsonl_path bekommen haben
  pairsLinked: number; // Pass 2: (session, file)-Paare gematcht
  cwdsScanned: number; // Pass 2: distinkte cwd-Buckets, die wir angefasst haben
  skipped: boolean; // True, wenn das Flag schon "done" stand
}

export async function runJsonlPathBackfill(
  deps: RunBackfillDeps,
): Promise<BackfillReport> {
  const fsDriver = deps.fs ?? realBackfillFs;
  const flag = deps.meta.get(BACKFILL_FLAG_KEY);
  if (flag === BACKFILL_FLAG_VALUE) {
    return { pathHydrated: 0, pairsLinked: 0, cwdsScanned: 0, skipped: true };
  }

  // Pass 1 ist im aktuellen Patch deaktiviert (s. Kommentar weiter unten);
  // der Zaehler bleibt auf 0, ist aber im Report-Shape vorgesehen, damit die
  // Aufrufer-API stabil bleibt, falls Pass 1 spaeter aktiviert wird.
  const pathHydrated = 0;
  let pairsLinked = 0;
  let cwdsScanned = 0;

  // --- Pass 1: Path-Hydration fuer UUID-bound Sessions ---------------------
  // Wir haben keinen dedizierten Selector "claude_session_id IS NOT NULL AND
  // jsonl_path IS NULL". `listMissingClaudeSessionId` filtert auf NULL-UUID,
  // also passt das nicht. Stattdessen: Cross-Cwd-Lauf via Status-Listen ist
  // unsinnig (Status sagt nichts ueber UUID-Stand). Pragmatisch laufen wir
  // ueber Pass 2 hinaus auf die Sessions, die wir gerade noch nicht direkt
  // bedienen — und nutzen den Watcher fuer Pass 1: sobald er die Datei
  // sieht, schreibt sein `backfillClaudeSessionId`-Pfad den jsonl_path mit
  // (Season-15-Patch im Watcher). Hier deaktiviert: Pass 1 ist redundant.
  //
  // Hintergrund-Notiz: das spart einen full-table-scan-Helper im
  // Repository. Wenn der Pfad-Hydration-Bedarf groesser wird, kommt
  // `listMissingJsonlPath` nach.

  // --- Pass 2: Pair-Up fuer resume-tote Sessions ---------------------------
  const allMissing = deps.sessions.listMissingClaudeSessionId();
  if (allMissing.length === 0) {
    deps.meta.set(BACKFILL_FLAG_KEY, BACKFILL_FLAG_VALUE);
    deps.log.info('[jsonl-backfill] keine resume-toten Sessions — Flag gesetzt');
    return { pathHydrated, pairsLinked, cwdsScanned, skipped: false };
  }

  // Pro cwd gruppieren. Map iteration-order = Insert-Order; egal, weil wir
  // pro cwd sortieren.
  const byCwd = new Map<string, typeof allMissing>();
  for (const session of allMissing) {
    const bucket = byCwd.get(session.cwd);
    if (bucket) bucket.push(session);
    else byCwd.set(session.cwd, [session]);
  }

  for (const [cwd, sessionList] of byCwd.entries()) {
    cwdsScanned += 1;
    const folder = path.join(deps.claudeProjectsRoot, encodeCwd(cwd));
    let fileList: Array<{ filePath: string; mtimeMs: number }>;
    try {
      fileList = await fsDriver.listJsonlFilesWithMtime(folder);
    } catch (e) {
      deps.log.warn(
        `[jsonl-backfill] readdir fehlgeschlagen cwd=${cwd}: ${e}`,
      );
      continue;
    }
    if (fileList.length === 0) continue;
    // Nur Files mit auswertbarem UUID-Stem behalten — claude legt sonst
    // gelegentlich Helper-Files an, die wir nicht als Session-UUIDs
    // interpretieren wollen.
    const usable = fileList
      .map((f) => ({ ...f, uuid: claudeUuidFromJsonlPath(f.filePath) }))
      .filter((f): f is { filePath: string; mtimeMs: number; uuid: string } =>
        f.uuid !== null,
      );
    if (usable.length === 0) continue;
    // ASC sortieren — aelteste JSONL (erste Session-Aktivitaet) zuerst.
    usable.sort((a, b) => a.mtimeMs - b.mtimeMs);
    // sessionList kommt aus listMissingClaudeSessionId; SQLite-Driver
    // garantiert ueber den Backfill-spezifischen Selector keine bestimmte
    // Ordnung — wir sortieren hier explizit nach started_at ASC, damit
    // Tests deterministisch sind.
    sessionList.sort((a, b) => a.started_at - b.started_at);

    const pairCount = Math.min(usable.length, sessionList.length);
    for (let i = 0; i < pairCount; i++) {
      const session = sessionList[i];
      const file = usable[i];
      if (!session || !file) continue;
      const claudeIdWritten = deps.sessions.setClaudeSessionId(session.id, file.uuid);
      // setJsonlPath ist idempotent (WHERE jsonl_path IS NULL); falls eine
      // andere Quelle den Pfad inzwischen befuellt hat, kein Effekt.
      const expected = expectedJsonlPath(deps.claudeProjectsRoot, session.cwd, file.uuid);
      const pathWritten = deps.sessions.setJsonlPath(session.id, expected);
      if (claudeIdWritten || pathWritten) {
        pairsLinked += 1;
        deps.log.info(
          `[jsonl-backfill] pair session=${session.id.slice(0, 8)} ↔ uuid=${file.uuid.slice(0, 8)} (claudeId=${claudeIdWritten} path=${pathWritten})`,
        );
      }
    }
  }

  deps.meta.set(BACKFILL_FLAG_KEY, BACKFILL_FLAG_VALUE);
  deps.log.info(
    `[jsonl-backfill] abgeschlossen pairsLinked=${pairsLinked} cwdsScanned=${cwdsScanned}`,
  );
  return { pathHydrated, pairsLinked, cwdsScanned, skipped: false };
}

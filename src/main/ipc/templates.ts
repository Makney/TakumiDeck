import { ipcMain } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Channels } from '@shared/ipc-channels';
import { ok, errFromUnknown, err } from '@shared/result';
import {
  TemplatesAllocateSeasonForSessionInputSchema,
  TemplatesResolveAutoVarsInputSchema,
} from '@shared/schemas';
import type {
  TemplatesAllocateSeasonForSessionResult,
  TemplatesResolveAutoVarsResult,
  SessionRow,
} from '@shared/types';
import { DEFAULT_PROJECT_ID } from '@shared/constants';
import type { ProjectRepository } from '../db/repos/projects';
import type { SessionRepository } from '../db/repos/sessions';
import type { SettingsStore } from '../settings/store';
import type { Logger } from '../logger';
import { assertFromMainWindow } from './sender-guard';
import {
  formatLetzteEntscheidungen,
  formatTechSchuldenRelevant,
} from '../templates/docsParser';
import { parseClaudeMd } from '../workspace/claudeMdParser';

// Phase-2 Season-4 — IPC fuer template-spezifische Auto-Variablen.
//
// Die einfachen Auto-Variablen (PROJEKT_NAME, DATUM, NEXT_SEASON_NR,
// CURRENT_PHASE_FILE) produziert der Renderer weiterhin selbst (siehe
// buildAutoVariables in templateVariables.ts) — sie brauchen keinen DB- oder
// FS-Zugriff.
//
// Drei neue Variablen sind aber serverseitig:
//   - LETZTE_SEASON_NAME       → SessionRepository.findLastCompletedFeatureSession
//   - TECH_SCHULDEN_RELEVANT   → docs/TECH_SCHULDEN.md parsen (Top-N offen)
//   - LETZTE_ENTSCHEIDUNGEN    → docs/ENTSCHEIDUNGEN.md parsen (Top-N)
//
// Phase-2 Season-20: die Top-N-Werte kommen aus settings.template_top_n statt
// hartkodiert. Settings werden pro IPC-Call frisch via settings.read() gelesen,
// damit nachgezogene Schwellwerte beim naechsten Templates-Send-Klick wirken
// (analog Boot-Pass-Pattern aus Season 17).
//
// Default-Behaviour bei fehlenden Quellen: leerer String — der Variable-Filler
// im Renderer setzt einen leeren String ein, statt einen Fehler anzuzeigen.
// Templates, die die Variable einbauen, dokumentieren den fehlenden Inhalt
// dadurch implizit.

export function registerTemplatesIpc(deps: {
  projects: ProjectRepository;
  sessions: SessionRepository;
  settings: SettingsStore;
  log: Logger;
}): void {
  const { projects, sessions, settings, log } = deps;

  // Phase-2 Season-11: vom Templates-Send-Flow gerufen, sobald der Prompt
  // {{NEXT_SEASON_NR}} verwendet. Der Renderer schickt die aktive Session-ID;
  // wir alloziere atomar (siehe SessionRepository.assignSeasonNumber) und
  // geben die finale Nummer + Frisch-Flag zurueck. Idempotent — eine bereits
  // markierte Session bleibt bei ihrer alten Nummer.
  ipcMain.handle(
    Channels.TemplatesAllocateSeasonForSession,
    (event, payload: unknown) => {
      const guard = assertFromMainWindow(event);
      if (!guard.ok) return guard;
      try {
        const input = TemplatesAllocateSeasonForSessionInputSchema.parse(payload);
        const result = sessions.assignSeasonNumber(input.sessionId);
        if (!result) {
          return err<TemplatesAllocateSeasonForSessionResult>(
            `Session ${input.sessionId} nicht gefunden`,
            'SESSION_NOT_FOUND',
          );
        }
        log.info(
          `[templates:allocate-season-for-session] sessionId=${input.sessionId} ` +
            `season=${result.seasonNumber} fresh=${result.freshlyAssigned}`,
        );
        return ok<TemplatesAllocateSeasonForSessionResult>({
          seasonNumber: result.seasonNumber,
          freshlyAssigned: result.freshlyAssigned,
        });
      } catch (e) {
        return errFromUnknown(e, 'TEMPLATES_ALLOCATE_SEASON');
      }
    },
  );

  ipcMain.handle(Channels.TemplatesResolveAutoVars, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = TemplatesResolveAutoVarsInputSchema.parse(payload);
      const project = projects.getById(input.projectId);
      if (!project) {
        return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }

      const topN = settings.read().template_top_n;
      const lastSessionName = await resolveLastSeasonName({
        sessions,
        projectId: project.id,
        projectPath: project.id === DEFAULT_PROJECT_ID ? null : project.path,
      });
      const schulden =
        project.id === DEFAULT_PROJECT_ID || topN.schulden === 0
          ? ''
          : await readAndFormat(
              path.join(project.path, 'docs', 'TECH_SCHULDEN.md'),
              (md) => formatTechSchuldenRelevant(md, topN.schulden),
            );
      const entscheidungen =
        project.id === DEFAULT_PROJECT_ID || topN.entscheidungen === 0
          ? ''
          : await readAndFormat(
              path.join(project.path, 'docs', 'ENTSCHEIDUNGEN.md'),
              (md) => formatLetzteEntscheidungen(md, topN.entscheidungen),
            );

      const result: TemplatesResolveAutoVarsResult = {
        letzte_season_name: lastSessionName,
        tech_schulden_relevant: schulden,
        letzte_entscheidungen: entscheidungen,
      };
      log.info(
        `[templates:resolve-auto-vars] projectId=${input.projectId} ` +
          `season="${lastSessionName}" schulden_len=${schulden.length} ` +
          `entscheidungen_len=${entscheidungen.length}`,
      );
      return ok(result);
    } catch (e) {
      return errFromUnknown(e, 'TEMPLATES_RESOLVE_AUTO_VARS');
    }
  });
}

// LETZTE_SEASON_NAME: "Phase X Season Y: <Titel>" wenn Phase aus
// current_phase_file ableitbar; sonst "Season Y: <Titel>" oder nur "<Titel>".
async function resolveLastSeasonName(args: {
  sessions: SessionRepository;
  projectId: string;
  projectPath: string | null;
}): Promise<string> {
  const session = args.sessions.findLastCompletedFeatureSession(args.projectId);
  if (!session) return '';
  const phaseLabel = args.projectPath
    ? await tryDerivePhaseLabel(args.projectPath)
    : null;
  return formatSeasonName(session, phaseLabel);
}

export function formatSeasonName(
  session: Pick<SessionRow, 'title' | 'season_number'>,
  phaseLabel: string | null,
): string {
  const parts: string[] = [];
  if (phaseLabel) parts.push(phaseLabel);
  if (session.season_number !== null) parts.push(`Season ${session.season_number}`);
  if (parts.length === 0) return session.title;
  return `${parts.join(' ')}: ${session.title}`;
}

// Liest die CLAUDE.md des Projekts (best-effort) und versucht aus
// `workbench.current_phase_file` ein Label wie "Phase 2" abzuleiten.
async function tryDerivePhaseLabel(projectPath: string): Promise<string | null> {
  try {
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    const content = await fs.readFile(claudeMdPath, 'utf8');
    const result = parseClaudeMd(content);
    if (!result.ok) return null;
    const phaseFile = result.data.frontmatter?.workbench.current_phase_file;
    return derivePhaseLabel(phaseFile ?? null);
  } catch {
    return null;
  }
}

// Pure Logik: aus einem Pfad wie "docs/roadmap/PHASE2.md" → "Phase 2".
// Unparsbar oder leer → null (kein Phase-Prefix im Format-String).
export function derivePhaseLabel(phaseFilePath: string | null): string | null {
  if (!phaseFilePath) return null;
  const basename = phaseFilePath.split(/[\\/]/).pop() ?? phaseFilePath;
  const match = basename.match(/PHASE\s*(\d+)/i);
  if (!match || match[1] === undefined) return null;
  return `Phase ${match[1]}`;
}

// Liest eine Datei und wendet den Parser an. Fehler (ENOENT, EACCES, ...)
// werden still geschluckt und liefern leeren String — der Aufrufer signalisiert
// das fehlende Material durch eine leere Variable im Prompt.
async function readAndFormat(
  absPath: string,
  parser: (markdown: string) => string,
): Promise<string> {
  try {
    const content = await fs.readFile(absPath, 'utf8');
    return parser(content);
  } catch {
    return '';
  }
}

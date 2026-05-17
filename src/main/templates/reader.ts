import path from 'node:path';
import { promises as fs } from 'node:fs';
import matter from 'gray-matter';
import type { TemplateFile, TemplateSchema } from '@shared/types';
import { TemplateSchemaSchema } from '@shared/schemas';

// Sprint 6 — Template-Reader (Architektur 6.5).
//
// Q1 Variante B (on-demand): kein Live-Watcher — fs:list-templates wird beim
// Modal-Open frisch gescannt. Templates ändern sich selten und sind klein,
// das spart die chokidar-Komplexität ohne UX-Verlust.
//
// Q2 Variante B (beide separat mit Source-Tag): globale und Per-Projekt-
// Templates erscheinen NEBENEINANDER in der Liste. Konfliktauflösung passiert
// über Sichtbarkeit — der User entscheidet, statt ein Override automatisch
// das eine zu verschlucken.
//
// Pfade laut Architektur 6.5 + Briefing-Konvention:
//   - Global:        %APPDATA%/TakumiDeck/templates/*.md  (oder TakumiDeck-dev/)
//   - Per-Projekt:   <projekt>/docs/templates/*.md
//   - Legacy:        <projekt>/docs/*_TEMPLATE.md  (alte Sprint-2-Konvention)
//
// Driver-Injection wie in workspace/scanner.ts: TemplateFsLikeDriver kapselt
// readdir/readFile, sodass Tests mit Plain-Object-Trees laufen.

export interface TemplateFsLikeDriver {
  // Liefert Datei- und Verzeichnis-Einträge eines Pfads. Bei nicht-existentem
  // Pfad → leeres Array (kein Throw), damit fehlende docs/templates/-Ordner
  // einfach unterschlagen werden, ohne Sonderpfad im Aufrufer.
  readdir(dir: string): Promise<Array<{ name: string; isFile: () => boolean }>>;
  readFile(filePath: string): Promise<string>;
}

export const realTemplateFsDriver: TemplateFsLikeDriver = {
  async readdir(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.map((e) => ({
        name: e.name,
        isFile: () => e.isFile(),
      }));
    } catch (e) {
      if (isExpectedFsError(e)) return [];
      throw e;
    }
  },
  async readFile(filePath: string) {
    return fs.readFile(filePath, 'utf8');
  },
};

function isExpectedFsError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'EACCES' || code === 'ENOTDIR' || code === 'EPERM';
}

export interface ListTemplatesInput {
  // Globaler Templates-Ordner (immer gescannt, auch wenn projectPath null).
  globalDir: string;
  // Per-Projekt-Pfad. null bei Legacy-Default-Bucket — dann werden nur globale
  // Templates geliefert (keine Projekt-Quelle).
  projectPath: string | null;
}

// Stabile Sortier-Reihenfolge: zuerst globale (alphabetisch), dann Per-Projekt
// (alphabetisch). Modal-UI kann die Liste so 1:1 rendern, ohne selbst zu sortieren.
export async function listTemplates(
  input: ListTemplatesInput,
  driver: TemplateFsLikeDriver,
): Promise<TemplateFile[]> {
  const globalFiles = await readMdFilesFlat(
    input.globalDir,
    'global',
    null,
    driver,
  );
  globalFiles.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

  const projectFiles: TemplateFile[] = [];
  if (input.projectPath) {
    const docsDir = path.join(input.projectPath, 'docs');
    const templatesDir = path.join(docsDir, 'templates');
    // Neue Konvention: docs/templates/*.md
    projectFiles.push(
      ...(await readMdFilesFlat(templatesDir, 'project', input.projectPath, driver)),
    );
    // Legacy-Konvention: docs/*_TEMPLATE.md (case-insensitive Suffix-Match).
    const docsEntries = await driver.readdir(docsDir);
    for (const e of docsEntries) {
      if (!e.isFile()) continue;
      if (!/_TEMPLATE\.md$/i.test(e.name)) continue;
      const fullPath = path.join(docsDir, e.name);
      const content = await driver.readFile(fullPath);
      projectFiles.push({
        source: 'project',
        name: e.name,
        path: fullPath,
        relPath: toForwardSlash(path.relative(input.projectPath, fullPath)),
        content,
        schema: parseTemplateSchema(content),
      });
    }
    // Doppel-Erkennung: derselbe Pfad könnte theoretisch durch zwei Pässe rein,
    // wenn jemand einen docs/templates/X_TEMPLATE.md anlegt — wir entdoppeln
    // anhand des Pfads.
    const seen = new Set<string>();
    const deduped: TemplateFile[] = [];
    for (const f of projectFiles) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      deduped.push(f);
    }
    projectFiles.length = 0;
    projectFiles.push(...deduped);
    projectFiles.sort((a, b) =>
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
    );
  }

  return [...globalFiles, ...projectFiles];
}

async function readMdFilesFlat(
  dir: string,
  source: TemplateFile['source'],
  // Projekt-Root fuer relPath-Berechnung. null bei globalen Templates — die
  // liegen in <userData>/templates/ und sind nicht projekt-relativ.
  projectRoot: string | null,
  driver: TemplateFsLikeDriver,
): Promise<TemplateFile[]> {
  const entries = await driver.readdir(dir);
  const out: TemplateFile[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.toLowerCase().endsWith('.md')) continue;
    const fullPath = path.join(dir, e.name);
    const content = await driver.readFile(fullPath);
    const relPath = projectRoot
      ? toForwardSlash(path.relative(projectRoot, fullPath))
      : null;
    out.push({
      source,
      name: e.name,
      path: fullPath,
      relPath,
      content,
      schema: parseTemplateSchema(content),
    });
  }
  return out;
}

// Phase-2 Season-23: Frontmatter-Parser fuer Template-Dateien. Greift auf
// dasselbe gray-matter zurueck wie der CLAUDE.md-Parser, validiert per zod.
// Drei legitime Faelle, alle liefern `null`:
//   1. Kein Frontmatter im Template (Bestand-Templates) → Fallback auf alte
//      hartcodierte Variable-Liste im Renderer.
//   2. Frontmatter da, aber keine `variables:`-Section → ebenfalls Fallback.
//   3. Frontmatter da, aber zod-Validierung schlaegt fehl (z.B. ein Token-
//      Spec mit sowohl `auto` als auch `input`) → Fallback statt Hard-Error,
//      damit ein einzelnes kaputtes Template nicht das ganze Modal lahmlegt.
//      Die Datei taucht in der Liste auf, der User sieht die Tokens als
//      literal und kann das Frontmatter im Editor reparieren.
export function parseTemplateSchema(content: string): TemplateSchema | null {
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(content);
  } catch {
    return null;
  }
  const data = parsed.data;
  if (!data || typeof data !== 'object') return null;
  if (!('variables' in data)) return null;
  const validated = TemplateSchemaSchema.safeParse(data);
  if (!validated.success) return null;
  return validated.data;
}

// Renderer-Konvention fuer relPath ist Forward-Slash (siehe FsReadInput-Doku
// in shared/types.ts). Windows liefert hier `\\` — wir normalisieren ein Mal
// hier, statt im Renderer.
function toForwardSlash(p: string): string {
  return p.split(path.sep).join('/');
}

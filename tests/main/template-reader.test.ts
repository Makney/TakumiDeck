import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  listTemplates,
  type TemplateFsLikeDriver,
} from '../../src/main/templates/reader';

// Fake-Fs für die Reader-Tests. Plain-Object-Tree, kein echtes Filesystem.
// Mappt Pfad → Liste Einträge (für readdir) bzw. Pfad → Inhalt (für readFile).
class FakeFs implements TemplateFsLikeDriver {
  // Dirs werden aus den File-Pfaden abgeleitet — readdir matcht alle Files,
  // deren Verzeichnis exakt `dir` ist.
  private readonly files = new Map<string, string>();

  add(filePath: string, content: string): void {
    this.files.set(path.normalize(filePath), content);
  }

  async readdir(
    dir: string,
  ): Promise<Array<{ name: string; isFile: () => boolean }>> {
    const normDir = path.normalize(dir);
    const names = new Set<string>();
    const entries: Array<{ name: string; isFile: () => boolean }> = [];
    for (const filePath of this.files.keys()) {
      const fileDir = path.dirname(filePath);
      if (fileDir !== normDir) continue;
      const name = path.basename(filePath);
      if (names.has(name)) continue;
      names.add(name);
      entries.push({ name, isFile: () => true });
    }
    return entries;
  }

  async readFile(filePath: string): Promise<string> {
    const content = this.files.get(path.normalize(filePath));
    if (content === undefined) {
      throw new Error(`Datei nicht gefunden im Fake-Fs: ${filePath}`);
    }
    return content;
  }
}

describe('listTemplates', () => {
  it('liefert nur globale Templates, wenn projectPath null ist', async () => {
    const fs = new FakeFs();
    fs.add('C:\\global\\foo.md', 'A');
    fs.add('C:\\global\\bar.md', 'B');
    const result = await listTemplates(
      { globalDir: 'C:\\global', projectPath: null },
      fs,
    );
    expect(result.map((t) => t.name).sort()).toEqual(['bar.md', 'foo.md']);
    expect(result.every((t) => t.source === 'global')).toBe(true);
  });

  it('Q2 Variante B: globale UND Per-Projekt-Quellen erscheinen separat mit source-Tag', async () => {
    const fs = new FakeFs();
    fs.add('C:\\global\\season.md', 'global content');
    fs.add('C:\\proj\\docs\\templates\\season.md', 'project content');
    const result = await listTemplates(
      { globalDir: 'C:\\global', projectPath: 'C:\\proj' },
      fs,
    );
    expect(result).toHaveLength(2);
    const global = result.find((t) => t.source === 'global');
    const project = result.find((t) => t.source === 'project');
    expect(global?.content).toBe('global content');
    expect(project?.content).toBe('project content');
    // Beide haben den GLEICHEN Dateinamen — Konflikt wird nicht aufgelöst,
    // der User sieht beide nebeneinander mit ihrem source-Tag.
    expect(global?.name).toBe('season.md');
    expect(project?.name).toBe('season.md');
  });

  it('Sortierung: globale zuerst (alphabetisch), dann Per-Projekt (alphabetisch)', async () => {
    const fs = new FakeFs();
    fs.add('C:\\global\\zeta.md', '');
    fs.add('C:\\global\\alpha.md', '');
    fs.add('C:\\proj\\docs\\templates\\beta.md', '');
    fs.add('C:\\proj\\docs\\templates\\delta.md', '');
    const result = await listTemplates(
      { globalDir: 'C:\\global', projectPath: 'C:\\proj' },
      fs,
    );
    expect(result.map((t) => `${t.source}:${t.name}`)).toEqual([
      'global:alpha.md',
      'global:zeta.md',
      'project:beta.md',
      'project:delta.md',
    ]);
  });

  it('Legacy-Konvention: docs/*_TEMPLATE.md wird mit aufgelistet', async () => {
    const fs = new FakeFs();
    fs.add('C:\\proj\\docs\\SEASON_PROMPT_TEMPLATE.md', 'legacy content');
    fs.add('C:\\proj\\docs\\templates\\new.md', 'new');
    const result = await listTemplates(
      { globalDir: 'C:\\global', projectPath: 'C:\\proj' },
      fs,
    );
    expect(result.map((t) => t.name).sort()).toEqual([
      'SEASON_PROMPT_TEMPLATE.md',
      'new.md',
    ]);
    expect(result.find((t) => t.name === 'SEASON_PROMPT_TEMPLATE.md')?.content).toBe(
      'legacy content',
    );
  });

  it('Legacy-Match ist case-insensitive auf das _TEMPLATE.md-Suffix', async () => {
    const fs = new FakeFs();
    fs.add('C:\\proj\\docs\\foo_template.MD', 'lower');
    fs.add('C:\\proj\\docs\\BAR_TEMPLATE.md', 'upper');
    const result = await listTemplates(
      { globalDir: 'C:\\global', projectPath: 'C:\\proj' },
      fs,
    );
    expect(result.map((t) => t.name).sort()).toEqual([
      'BAR_TEMPLATE.md',
      'foo_template.MD',
    ]);
  });

  it('docs/-Files ohne _TEMPLATE-Suffix werden NICHT als Templates aufgelistet', async () => {
    const fs = new FakeFs();
    fs.add('C:\\proj\\docs\\CHANGELOG.md', 'no');
    fs.add('C:\\proj\\docs\\TECH_SCHULDEN.md', 'no');
    const result = await listTemplates(
      { globalDir: 'C:\\global', projectPath: 'C:\\proj' },
      fs,
    );
    expect(result).toEqual([]);
  });

  it('entdoppelt, falls eine Datei sowohl per docs/templates/ als auch per Legacy-Suffix matcht', async () => {
    // Edge-Case: docs/templates/X_TEMPLATE.md — würde in beiden Pässen finden
    // (templates-Verzeichnis vs. Legacy-Suffix), aber NUR der templates-Pass läuft
    // hier, weil das File NICHT direkt in docs/ liegt. Dieser Test stellt sicher,
    // dass keine Doppelaufzählung passiert, falls jemand BEIDE Konventionen mischt.
    const fs = new FakeFs();
    fs.add('C:\\proj\\docs\\X_TEMPLATE.md', 'legacy');
    const result = await listTemplates(
      { globalDir: 'C:\\global', projectPath: 'C:\\proj' },
      fs,
    );
    expect(result).toHaveLength(1);
  });

  it('ignoriert Non-md-Files', async () => {
    const fs = new FakeFs();
    fs.add('C:\\global\\foo.md', '');
    fs.add('C:\\global\\bar.txt', '');
    fs.add('C:\\global\\notes.json', '');
    const result = await listTemplates(
      { globalDir: 'C:\\global', projectPath: null },
      fs,
    );
    expect(result.map((t) => t.name)).toEqual(['foo.md']);
  });

  it('toleriert nicht-existente Pfade (leeres readdir)', async () => {
    const fs = new FakeFs();
    // Kein einziges File hinzugefügt — readdir liefert immer [].
    const result = await listTemplates(
      { globalDir: 'C:\\nope', projectPath: 'C:\\also-nope' },
      fs,
    );
    expect(result).toEqual([]);
  });
});

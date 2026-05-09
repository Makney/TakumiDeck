import { describe, it, expect } from 'vitest';
import { parseClaudeMd } from '../../src/main/workspace/claudeMdParser';

// Vollständig valide Frontmatter — Referenz-Form aus Architektur Kapitel 5.
const VALID = `---
workbench:
  project_name: TakumiDeck
  default_model: claude-sonnet-4-6
  current_phase_file: docs/roadmap/PHASE1.md
  trigger_phrases:
    docs_update: "ist korrekt umgesetzt"
    commit: "commit"
  on_demand_files:
    - path: docs/CODING_RULES.md
      trigger: "Read for every implementation"
      auto_inject: false
    - path: docs/roadmap/PHASE1.md
---

# TakumiDeck – Agent Context

Body folgt.
`;

describe('parseClaudeMd', () => {
  it('parst eine vollständig valide Frontmatter inkl. on_demand_files', () => {
    const result = parseClaudeMd(VALID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.frontmatter).not.toBeNull();
    expect(result.data.frontmatter?.workbench.project_name).toBe('TakumiDeck');
    expect(result.data.frontmatter?.workbench.trigger_phrases.docs_update).toBe(
      'ist korrekt umgesetzt',
    );
    expect(result.data.frontmatter?.workbench.trigger_phrases.commit).toBe('commit');
    expect(result.data.frontmatter?.workbench.on_demand_files).toHaveLength(2);
    expect(result.data.body).toContain('# TakumiDeck – Agent Context');
    expect(result.data.warnings).toEqual([]);
  });

  it('akzeptiert Frontmatter ganz ohne on_demand_files', () => {
    const minimal = `---
workbench:
  trigger_phrases:
    docs_update: "X"
    commit: "Y"
---

Body.
`;
    const result = parseClaudeMd(minimal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.frontmatter?.workbench.trigger_phrases.docs_update).toBe('X');
    expect(result.data.frontmatter?.workbench.on_demand_files).toBeUndefined();
  });

  it('liefert frontmatter=null wenn die Datei keine Frontmatter hat (legitim)', () => {
    const noFrontmatter = '# Just a markdown file\n\nNo workbench config here.';
    const result = parseClaudeMd(noFrontmatter);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.frontmatter).toBeNull();
    expect(result.data.body).toBe(noFrontmatter);
    expect(result.data.warnings).toEqual([]);
  });

  it('liefert frontmatter=null + Warning, wenn Frontmatter ohne workbench-Section vorhanden ist', () => {
    const otherFrontmatter = `---
title: Some doc
author: Maker
---

# Body
`;
    const result = parseClaudeMd(otherFrontmatter);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.frontmatter).toBeNull();
    expect(result.data.warnings.length).toBeGreaterThan(0);
    expect(result.data.warnings[0]).toMatch(/workbench/i);
  });

  it('returnt CLAUDE_MD_INVALID_FRONTMATTER, wenn trigger_phrases fehlen', () => {
    const missingTriggers = `---
workbench:
  project_name: X
---

Body.
`;
    const result = parseClaudeMd(missingTriggers);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('CLAUDE_MD_INVALID_FRONTMATTER');
    expect(result.error).toMatch(/trigger_phrases/);
  });

  it('returnt CLAUDE_MD_INVALID_FRONTMATTER, wenn nur ein Trigger gesetzt ist', () => {
    const partial = `---
workbench:
  trigger_phrases:
    docs_update: "X"
---

Body.
`;
    const result = parseClaudeMd(partial);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('CLAUDE_MD_INVALID_FRONTMATTER');
    expect(result.error).toMatch(/commit/);
  });

  it('returnt CLAUDE_MD_PARSE bei kaputtem YAML', () => {
    const broken = `---
workbench:
  trigger_phrases: [unclosed
---

Body.
`;
    const result = parseClaudeMd(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('CLAUDE_MD_PARSE');
  });

  it('verarbeitet CRLF-Zeilenenden', () => {
    const crlf = VALID.replace(/\n/g, '\r\n');
    const result = parseClaudeMd(crlf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.frontmatter?.workbench.project_name).toBe('TakumiDeck');
  });

  it('akzeptiert on_demand_files als Mix aus Strings und Objekten', () => {
    const mixed = `---
workbench:
  trigger_phrases:
    docs_update: "X"
    commit: "Y"
  on_demand_files:
    - just/a/path.md
    - path: another/path.md
      trigger: "manual"
---
`;
    const result = parseClaudeMd(mixed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.frontmatter?.workbench.on_demand_files).toEqual([
      'just/a/path.md',
      { path: 'another/path.md', trigger: 'manual' },
    ]);
  });
});

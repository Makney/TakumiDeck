// TakumiDeck Prototype Data
// All seeded data lives here so the components stay readable.

const TD_DATA = {
  projects: [
    {
      id: "tanalib",
      name: "TanaLib",
      path: "~\\Desktop\\TanaLib",
      activeCount: 2,
      hasGit: true,
      seasonNumber: 6,
    },
    {
      id: "zenvaluation",
      name: "ZenValuation",
      path: "~\\Desktop\\ZenValuation",
      activeCount: 0,
      hasGit: true,
      seasonNumber: 12,
    },
    {
      id: "takumideck",
      name: "TakumiDeck",
      path: "~\\Desktop\\TakumiDeck",
      activeCount: 0,
      hasGit: true,
      seasonNumber: 1,
    },
  ],

  // Sessions are keyed by project. Each session has a tab in the terminal.
  sessions: {
    tanalib: [
      {
        id: "s5-refactor",
        label: "S5 — Refactor Auth",
        season: 5,
        type: "feature",
        status: "running",
        model: "Sonnet 4.6",
        modelId: "claude-sonnet-4-6",
        contextUsed: 142_300,
        contextLimit: 1_000_000,
        notes: "Auth-Layer auf JWT-Rotation umstellen. Edge-Cases:\n- Refresh-Token-Reuse\n- Logout aller Geräte (Allow-List)\n- 401 → silent re-auth im Renderer",
        lastActivity: 2,
        terminal: [
          { kind: "user", text: "/model" },
          { kind: "agent", text: "Aktuelles Modell: claude-sonnet-4-6" },
          { kind: "user", text: "Lies docs/CODING_RULES.md und implementiere die Token-Rotation laut S5-Plan." },
          { kind: "agent", text: "● Read(docs/CODING_RULES.md)\n  ⎿  Read 184 lines (ctrl+r to expand)" },
          { kind: "agent", text: "● Read(core/auth/token_service.py)\n  ⎿  Read 92 lines" },
          { kind: "agent", text: "Plan: 3 Schritte — (1) Allow-List-Schema, (2) Rotation-Hook im Refresh-Endpoint, (3) Reuse-Detection mit 401 + Logout-All. Soll ich loslegen?" },
          { kind: "user", text: "Ja, Schritt 1 und 2. Schritt 3 plane bitte als eigenen Patch." },
          { kind: "agent", text: "● Edit(database/schema.sql)\n  ⎿  +14 −0\n● Edit(core/auth/token_service.py)\n  ⎿  +38 −9" },
          { kind: "system", text: "tool_use: bash · pytest tests/auth -q" },
          { kind: "agent", text: "● Bash(pytest tests/auth -q)\n  ⎿  ........  8 passed in 1.42s" },
          { kind: "agent", text: "Schritt 1+2 fertig. Soll ich Schritt 3 jetzt skizzieren?" },
        ],
      },
      {
        id: "bug-pdf",
        label: "Bug — PDF-Crash",
        season: null,
        type: "bug",
        status: "waiting",
        model: "Sonnet 4.6",
        modelId: "claude-sonnet-4-6",
        contextUsed: 56_800,
        contextLimit: 1_000_000,
        notes: "Crash bei 12 MB PDFs. Vermutung: Pillow Image.open ohne stream-mode. Wiederholt reproduzierbar mit /samples/lehman_2008.pdf.",
        lastActivity: 38,
        terminal: [
          { kind: "user", text: "Reproduziere den PDF-Crash mit samples/lehman_2008.pdf" },
          { kind: "agent", text: "● Bash(python -m takumi.pdf samples/lehman_2008.pdf)\n  ⎿  Traceback ... PIL.Image.DecompressionBombError" },
          { kind: "agent", text: "Gefunden — Pillow blockt das große PDF. Ich kann (a) MAX_IMAGE_PIXELS hochsetzen oder (b) auf streamed pdfplumber wechseln. Empfehlung: (b)." },
          { kind: "system", text: "Permission requested: edit core/pdf/loader.py" },
        ],
      },
      {
        id: "doku-update",
        label: "Doku Update",
        season: null,
        type: "docs-sync",
        status: "idle",
        model: "Haiku 4.5",
        modelId: "claude-haiku-4-5",
        contextUsed: 18_200,
        contextLimit: 200_000,
        notes: "Nach S5: CHANGELOG, FEATURES.md, ROADMAP. Trigger 'ist korrekt umgesetzt' erst nach grünem CI.",
        lastActivity: 240,
        terminal: [
          { kind: "agent", text: "Bereit. Sag Bescheid wenn S5 grün ist und ich die Docs aktualisieren soll." },
        ],
      },
    ],
    zenvaluation: [],
    takumideck: [],
  },

  history: {
    tanalib: [
      { season: 5, label: "S5 — Refactor Auth",   status: "running",   model: "Sonnet 4.6", date: "2026-05-08", notesCount: 4 },
      { season: null, label: "Bug — PDF-Crash",   status: "waiting",   model: "Sonnet 4.6", date: "2026-05-08", notesCount: 2, type: "bug" },
      { season: null, label: "Doku Update",       status: "idle",      model: "Haiku 4.5",  date: "2026-05-08", notesCount: 1, type: "docs-sync" },
      { season: 4, label: "S4 — Watchlist-Filter",status: "completed", model: "Opus 4.7",   date: "2026-05-06", notesCount: 6 },
      { season: 3, label: "S3 — DCF-Engine",      status: "completed", model: "Opus 4.7",   date: "2026-05-04", notesCount: 8 },
      { season: null, label: "Review — Schema",   status: "completed", model: "Sonnet 4.6", date: "2026-05-03", notesCount: 2, type: "review" },
      { season: 2, label: "S2 — DB-Layer",        status: "completed", model: "Sonnet 4.6", date: "2026-05-01", notesCount: 5 },
      { season: 1, label: "S1 — Skeleton",        status: "archived",  model: "Sonnet 4.5", date: "2026-04-28", notesCount: 3 },
    ],
    zenvaluation: [
      { season: 11, label: "S11 — Onboarding",   status: "completed", model: "Opus 4.7",   date: "2026-05-02", notesCount: 4 },
      { season: 10, label: "S10 — Pricing-Page", status: "completed", model: "Sonnet 4.6", date: "2026-04-29", notesCount: 2 },
    ],
    takumideck: [],
  },

  files: {
    tanalib: [
      { name: "__pycache__", kind: "dir" },
      { name: "assets", kind: "dir" },
      { name: "cache", kind: "dir" },
      { name: "core", kind: "dir" },
      { name: "database", kind: "dir" },
      { name: "docs", kind: "dir" },
      { name: "scripts", kind: "dir" },
      { name: "tests", kind: "dir" },
      { name: "ui", kind: "dir" },
      { name: "venv", kind: "dir" },
      { name: "CLAUDE.md", kind: "md" },
      { name: "main.py", kind: "py" },
      { name: "README.md", kind: "md" },
      { name: "requirements.txt", kind: "txt" },
      { name: "TanaLib.bat", kind: "bat" },
      { name: "tanalib.db", kind: "db" },
    ],
    zenvaluation: [
      { name: "src", kind: "dir" },
      { name: "public", kind: "dir" },
      { name: "tests", kind: "dir" },
      { name: "CLAUDE.md", kind: "md" },
      { name: "package.json", kind: "json" },
      { name: "README.md", kind: "md" },
    ],
    takumideck: [
      { name: "docs", kind: "dir" },
      { name: ".gitignore", kind: "txt" },
      { name: "CLAUDE.md", kind: "md" },
      { name: "README.md", kind: "md" },
    ],
  },

  diff: {
    file: ".gitignore",
    branch: "main",
    workspaceLabel: "Arbeitsverzeichnis",
    hunks: [
      { kind: "ctx", n1: 25, n2: 25, line: "25 unmodified lines", muted: true },
      { kind: "ctx", n1: 26, n2: 26, line: "*.swo" },
      { kind: "ctx", n1: 27, n2: 27, line: ".DS_Store" },
      { kind: "ctx", n1: 28, n2: 28, line: "" },
      { kind: "add", n1: "",  n2: 29, line: "# Tooling-/Run-Artefakte (nicht ins Repo)" },
      { kind: "add", n1: "",  n2: 30, line: ".claude/" },
      { kind: "add", n1: "",  n2: 31, line: "cache/" },
      { kind: "add", n1: "",  n2: 32, line: "" },
      { kind: "ctx", n1: 29, n2: 33, line: "# Build-Artefakte" },
      { kind: "ctx", n1: 30, n2: 34, line: "build/" },
      { kind: "ctx", n1: 31, n2: 35, line: "dist/" },
      { kind: "ctx", n1: 32, n2: 36, line: "6 unmodified lines", muted: true },
    ],
  },

  // Token / dashboard stats
  stats: {
    sessions: 118,
    messages: 24297,
    tokensTotal: "18.4M",
    activeDays: 20,
    currentStreak: 0,
    longestStreak: 14,
    peakHour: "21 Uhr",
    favoriteModel: "Opus 4.7",
    funFact: "Du hast ~31× mehr Token als The Lord of the Rings verwendet.",
  },

  plan: [
    { id: "5h",       label: "5-Stunden-Limit",       pct: 0,  reset: "Reset in 4h" },
    { id: "weekly",   label: "Wöchentlich · alle Modelle", pct: 11, reset: "Reset in 1T" },
    { id: "design",   label: "Wöchentlich · Claude Design", pct: 0,  reset: "" },
    { id: "sonnet",   label: "Nur Sonnet",            pct: 2,  reset: "Reset in 1T" },
  ],

  // Heatmap: 7 rows × 30 cols of activity intensity 0-4
  heatmap: (() => {
    const rng = (seed) => {
      let s = seed;
      return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    };
    const r = rng(42);
    const grid = [];
    for (let y = 0; y < 7; y++) {
      const row = [];
      for (let x = 0; x < 30; x++) {
        // ramp up intensity in the right third (recent)
        const recencyBoost = x > 22 ? 1.6 : x > 18 ? 1.2 : 1.0;
        const v = r() * recencyBoost;
        let lvl = 0;
        if (v > 0.45) lvl = 1;
        if (v > 0.7) lvl = 2;
        if (v > 0.9) lvl = 3;
        if (v > 1.05) lvl = 4;
        // sparse on the left
        if (x < 6 && r() > 0.35) lvl = 0;
        row.push(lvl);
      }
      grid.push(row);
    }
    return grid;
  })(),

  // Templates available (per-project + global)
  templates: [
    { id: "season",   name: "00_season_prompt",   scope: "global",  vars: ["FEATURE_NAME", "AUFGABE", "HINWEISE"] },
    { id: "review",   name: "01_review_prompt",   scope: "global",  vars: ["AUFGABE"] },
    { id: "brainstorm",name:"02_brainstorm",      scope: "global",  vars: ["THEMA"] },
    { id: "bug",      name: "10_bug_repro",       scope: "project", vars: ["BUG", "REPRO_PFAD"] },
    { id: "docssync", name: "20_docs_sync",       scope: "project", vars: [] },
  ],

  models: [
    { id: "claude-opus-4-7",   label: "Opus 4.7",   limit: 1_000_000 },
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", limit: 1_000_000 },
    { id: "claude-sonnet-4-5", label: "Sonnet 4.5", limit: 200_000 },
    { id: "claude-haiku-4-5",  label: "Haiku 4.5",  limit: 200_000 },
  ],

  sessionTypes: [
    { id: "feature",  label: "Feature (Season)" },
    { id: "bug",      label: "Bug" },
    { id: "review",   label: "Review" },
    { id: "docs-sync",label: "Docs-Sync" },
  ],
};

window.TD_DATA = TD_DATA;

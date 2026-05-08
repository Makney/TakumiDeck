/* global React, ReactDOM, TD_DATA */
const { useState, useEffect, useRef, useMemo } = React;
const D = window.TD_DATA;

// ============================================================ helpers
function pct(n, lim) { return Math.min(100, (n / lim) * 100); }
function ctxColor(p) {
  if (p >= 95) return "red";
  if (p >= 85) return "orange";
  if (p >= 70) return "warn";
  return "";
}
function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

// ============================================================ Sidebar bits
function ProjectsPanel({ projects, activeId, onPick, onAdd }) {
  return (
    <div className="td-panel">
      <div className="td-panel-head"><div className="td-panel-title">Projekte</div></div>
      <div className="td-panel-body">
        <div className="td-list">
          {projects.map((p) => (
            <div
              key={p.id}
              className={"td-list-item" + (activeId === p.id ? " active" : "")}
              onClick={() => onPick(p.id)}
              title={p.path}
            >
              <span className="td-folder">▸</span>
              <span className="td-name">{p.name}</span>
              {p.activeCount > 0 && <span className="td-badge">{p.activeCount}</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="td-panel-foot">
        <button className="td-action-btn" onClick={onAdd}>+ Add Project</button>
      </div>
    </div>
  );
}

function ActiveSessions({ sessions, activeId, onPick, onNew }) {
  return (
    <div className="td-panel">
      <div className="td-panel-head"><div className="td-panel-title">Aktive Sessions</div></div>
      <div className="td-panel-body">
        {sessions.length === 0 && (
          <div style={{ color: "var(--td-text-mute)", fontSize: 12, padding: 8 }}>
            Keine aktiven Sessions in diesem Projekt.
          </div>
        )}
        <div className="td-list">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={"td-list-item" + (activeId === s.id ? " active" : "")}
              onClick={() => onPick(s.id)}
            >
              <span className={"td-status-dot " + s.status} />
              <span className="td-name">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="td-panel-foot">
        <button className="td-action-btn primary" onClick={onNew}>+ Neue Session</button>
      </div>
    </div>
  );
}

function HistoryPanel({ history, onPickHistory }) {
  return (
    <div className="td-panel">
      <div className="td-panel-head"><div className="td-panel-title">Verlauf</div></div>
      <div className="td-panel-body">
        <div className="td-list" style={{ gap: 1 }}>
          {history.map((h, i) => (
            <div key={i} className={"td-hist-row " + h.status} onClick={() => onPickHistory(h)}>
              <span className="td-hist-tick">
                {h.status === "completed" || h.status === "archived" ? "✓" : h.status === "running" ? "●" : "…"}
              </span>
              <div>
                <div>{h.label}</div>
                <div className="td-hist-meta">
                  {(h.season ? `S${h.season}` : (h.type || "task").toUpperCase())} · {h.model} · {h.date}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================ Terminal
function Terminal({ session, projectName, onSend, onOpenSettings, onOpenTemplates, onTriggerCommit }) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(true);
  const scrollerRef = useRef(null);

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [session?.terminal?.length, session?.id]);

  if (!session) {
    return (
      <div className="td-term" style={{ display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center", color: "var(--td-text-mute)" }}>
          <div style={{ fontFamily: "var(--td-display)", fontSize: 32, color: "var(--td-text-dim)" }}>
            匠
          </div>
          <div style={{ marginTop: 8 }}>Keine Session offen</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Wähle eine Session links oder erstelle eine neue.</div>
        </div>
      </div>
    );
  }

  const ctxP = pct(session.contextUsed, session.contextLimit);
  const ctxC = ctxColor(ctxP);

  return (
    <>
      <div className="td-term" ref={scrollerRef}>
        <div className="td-term-welcome">
          <div className="td-mascot">匠</div>
          <div className="td-meta">
            <div className="head">Claude Code <span>v2.1.133</span></div>
            <div>{session.model} · {projectName}</div>
            <div style={{ color: "var(--td-text-mute)", marginTop: 6 }}>
              ~\Desktop\{projectName}
            </div>
            <div style={{ color: "var(--td-text-mute)", marginTop: 2, fontSize: 11 }}>
              › Try "how does &lt;filepath&gt; work?" &nbsp;·&nbsp; ? for shortcuts
            </div>
          </div>
        </div>

        {session.terminal.map((l, i) => (
          <div key={i} className={"td-term-line " + l.kind}>
            {l.text}
          </div>
        ))}
        <div className="td-cursor" />
      </div>

      <div className="td-term-input-wrap">
        <div className={"td-term-input-row" + (focused ? " focused" : "")}>
          <span className="prompt-glyph">›</span>
          <input
            value={input}
            placeholder='Try "how does <filepath> work?"'
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) {
                onSend(input.trim());
                setInput("");
              }
            }}
          />
          <span style={{ color: "var(--td-text-mute)", fontSize: 11 }}>? for shortcuts</span>
        </div>
        <div className="td-term-hint">
          <span><kbd>Enter</kbd> senden</span>
          <span><kbd>Ctrl</kbd>+<kbd>T</kbd> Templates</span>
          <span><kbd>Ctrl</kbd>+<kbd>K</kbd> Modell wechseln</span>
        </div>
      </div>

      <div className="td-term-bar">
        <span className="td-pill" onClick={onOpenSettings}>● {session.model}</span>
        <span className="td-pill" onClick={onOpenTemplates}>⌘ Templates</span>
        <span className="td-pill" onClick={onTriggerCommit}>⎇ commit</span>
        <div className="td-ctx">
          <span>ctx</span>
          <div className="td-ctx-bar">
            <div className={"td-ctx-fill " + ctxC} style={{ width: ctxP + "%" }} />
          </div>
          <span>{fmtNum(session.contextUsed)} / {fmtNum(session.contextLimit)}</span>
        </div>
        <span style={{ color: "var(--td-text-mute)" }}>
          {session.status === "running" ? "● läuft" : session.status === "waiting" ? "◐ wartet" : "○ idle"}
        </span>
      </div>
    </>
  );
}

// ============================================================ Diff + Files
function DiffViewer({ diff }) {
  const adds = diff.hunks.filter((h) => h.kind === "add").length;
  const rems = diff.hunks.filter((h) => h.kind === "rem").length;
  return (
    <div className="td-diff">
      <div className="td-diff-head">
        <span className="crumb"><b>{diff.branch}</b></span>
        <span className="arr">›</span>
        <span className="crumb">{diff.workspaceLabel}</span>
        <span className="arr">›</span>
        <span className="crumb">{diff.file}</span>
        <div className="meta">
          <span className="add">+{adds}</span>
          <span className="rem">−{rems}</span>
          <span style={{ color: "var(--td-text-mute)" }}>simple-git · merge view</span>
        </div>
      </div>
      <div className="td-diff-body">
        {diff.hunks.map((h, i) => (
          h.muted ? (
            <div key={i} className="td-diff-fold">{h.line}</div>
          ) : (
            <div key={i} className={"td-diff-row " + h.kind}>
              <span className="num">{h.n1}</span>
              <span className="num">{h.n2}</span>
              <span className="line">
                {h.kind === "add" ? "+ " : h.kind === "rem" ? "− " : "  "}
                {h.line}
              </span>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

function FilesPanel({ files, selected, onSelect }) {
  const [q, setQ] = useState("");
  const list = useMemo(
    () => files.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())),
    [files, q]
  );
  return (
    <aside className="td-files">
      <div className="td-files-head">
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <div className="td-panel-title-sm">Dateien</div>
        </div>
        <div className="td-files-search">
          <span>⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Dateien filtern… (?Text zur Inhaltssuche)"
          />
        </div>
      </div>
      <div className="td-files-list">
        {list.map((f) => (
          <div
            key={f.name}
            className={"td-file " + f.kind + (selected === f.name ? " selected" : "")}
            onClick={() => onSelect(f.name)}
          >
            <span className="gl">
              {f.kind === "dir" ? "▸" : f.kind === "md" ? "M" : f.kind === "py" ? "py" : f.kind === "db" ? "db" : "·"}
            </span>
            <span>{f.name}</span>
          </div>
        ))}
        {list.length === 0 && (
          <div style={{ color: "var(--td-text-mute)", padding: 10, fontSize: 11.5 }}>Keine Treffer.</div>
        )}
      </div>
    </aside>
  );
}

// ============================================================ Notes
function NotesPanel({ session, onChange }) {
  const [val, setVal] = useState(session?.notes || "");
  const [saved, setSaved] = useState(true);
  const tRef = useRef(null);

  useEffect(() => { setVal(session?.notes || ""); setSaved(true); }, [session?.id]);

  function handle(v) {
    setVal(v);
    setSaved(false);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => {
      onChange(v);
      setSaved(true);
    }, 500);
  }

  return (
    <div className="td-notes">
      <div className="td-notes-head">
        <div className="td-panel-title">Notizen</div>
        <span className="td-notes-saving">
          {session ? (saved ? "● gespeichert" : "○ tippt…") : ""}
        </span>
      </div>
      <div className="td-notes-body">
        {session ? (
          <textarea
            value={val}
            onChange={(e) => handle(e.target.value)}
            placeholder="Notizen zu dieser Session… (Auto-Save 500ms)"
          />
        ) : (
          <div style={{ color: "var(--td-text-mute)", padding: 10, fontSize: 12 }}>
            Wähle eine Session, um Notizen zu sehen.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================ Bottom dashboard
function StatsPane({ stats, heatmap, range, setRange, dashTab, setDashTab }) {
  return (
    <div className="td-dash-pane">
      <div className="td-dash-head">
        <div className="td-dash-tabs">
          <button className={"td-dash-tab" + (dashTab === "ueb" ? " active" : "")} onClick={() => setDashTab("ueb")}>Übersicht</button>
          <button className={"td-dash-tab" + (dashTab === "mod" ? " active" : "")} onClick={() => setDashTab("mod")}>Modelle</button>
        </div>
        <div className="td-dash-range">
          {["Alle", "30d", "7d"].map((r) => (
            <button key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>

      {dashTab === "ueb" ? (
        <div className="td-ueb">
          <div className="td-ueb-stats">
            <div className="td-stat"><div className="lbl">Sitzungen</div><div className="val">{stats.sessions}</div></div>
            <div className="td-stat"><div className="lbl">Nachrichten</div><div className="val">{stats.messages.toLocaleString("de-DE")}</div></div>
            <div className="td-stat"><div className="lbl">Token gesamt</div><div className="val accent">{stats.tokensTotal}</div></div>
            <div className="td-stat"><div className="lbl">Aktive Tage</div><div className="val">{stats.activeDays}</div></div>
            <div className="td-stat"><div className="lbl">Aktuelle Streak</div><div className="val">{stats.currentStreak}d</div></div>
            <div className="td-stat"><div className="lbl">Längste Streak</div><div className="val">{stats.longestStreak}d</div></div>
            <div className="td-stat"><div className="lbl">Spitzenstunde</div><div className="val">{stats.peakHour}</div></div>
            <div className="td-stat"><div className="lbl">Lieblings-Modell</div><div className="val accent">{stats.favoriteModel}</div></div>
          </div>
          <div className="td-heatmap-wrap">
            <div className="td-heatmap-head">
              <span className="td-panel-title-sm">Aktivität · letzte 30 Wochen</span>
              <span className="td-heatmap-legend">
                weniger
                <span className="td-heat-cell l0" />
                <span className="td-heat-cell l1" />
                <span className="td-heat-cell l2" />
                <span className="td-heat-cell l3" />
                <span className="td-heat-cell l4" />
                mehr
              </span>
            </div>
            <div className="td-heatmap">
              {heatmap.flatMap((row, y) => row.map((lvl, x) => (
                <div key={`${y}-${x}`} className={"td-heat-cell l" + lvl} title={`Tag −${30 * 7 - (x * 7 + y)}`} />
              )))}
            </div>
            <div className="td-fun">{stats.funFact}</div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 16, color: "var(--td-text-dim)", fontSize: 12, lineHeight: 1.6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center" }}>
            {[
              ["Opus 4.7",   "8.4M", 46],
              ["Sonnet 4.6", "7.1M", 39],
              ["Haiku 4.5",  "2.1M", 12],
              ["Sonnet 4.5", "0.8M", 4],
            ].map(([m, t, p]) => (
              <React.Fragment key={m}>
                <div style={{ color: "var(--td-text)" }}>{m}</div>
                <div className="td-ctx-bar" style={{ width: 220 }}>
                  <div className="td-ctx-fill" style={{ width: p + "%" }} />
                </div>
                <div>{t} · {p}%</div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanPane({ plan, onOpenDetail }) {
  return (
    <div className="td-dash-pane">
      <div className="td-plan-head">
        <div className="title">Plannutzung</div>
        <button className="arrow" title="Detail-Panel" onClick={onOpenDetail}>→</button>
      </div>
      <div className="td-plan-list">
        {plan.map((p) => {
          const cls = p.pct >= 95 ? "red" : p.pct >= 85 ? "orange" : p.pct >= 70 ? "warn" : "";
          return (
            <div key={p.id} className={"td-plan-row " + cls}>
              <div className="top">
                <span className="label">{p.label}</span>
                <span className="right"><b>{p.pct}%</b>{p.reset && <> · {p.reset}</>}</span>
              </div>
              <div className="bar"><div style={{ width: Math.max(p.pct, 1) + "%" }} /></div>
            </div>
          );
        })}
        <div style={{ marginTop: "auto", color: "var(--td-text-mute)", fontSize: 11 }}>
          P90 über letzte 192h · Schwellen 70/85/95
        </div>
      </div>
    </div>
  );
}

// ============================================================ Modals
function NewSessionModal({ project, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("feature");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const nextSeason = project.seasonNumber;

  return (
    <div className="td-modal-bg" onClick={onClose}>
      <div className="td-modal" onClick={(e) => e.stopPropagation()}>
        <div className="td-modal-head">
          <div className="h">Neue Session</div>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="td-modal-body">
          <div className="td-field">
            <label>Typ</label>
            <div className="td-radio-row">
              {D.sessionTypes.map((t) => (
                <button key={t.id} className={"td-radio" + (type === t.id ? " active" : "")} onClick={() => setType(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="td-field">
            <label>Name {type === "feature" && <span style={{ color: "var(--td-accent)" }}> · S{nextSeason} wird vergeben</span>}</label>
            <input
              autoFocus
              placeholder={type === "feature" ? `S${nextSeason} — z.B. Token-Dashboard` : "z.B. Bug — Login-Flow"}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="td-field">
            <label>Modell</label>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {D.models.map((m) => (
                <option key={m.id} value={m.id}>{m.label} · ctx {fmtNum(m.limit)}</option>
              ))}
            </select>
          </div>
          <div style={{ color: "var(--td-text-mute)", fontSize: 11 }}>
            cwd = {project.path} · spawnt <code>claude --model {model}</code>
          </div>
        </div>
        <div className="td-modal-foot">
          <button className="td-action-btn ghost" onClick={onClose}>Abbrechen</button>
          <button className="td-action-btn primary" onClick={() => onCreate({ name, type, model, season: type === "feature" ? nextSeason : null })}>
            Session starten
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplatesModal({ onClose, onSend }) {
  const [picked, setPicked] = useState(D.templates[0].id);
  const [feature, setFeature] = useState("");
  const [aufgabe, setAufgabe] = useState("");
  const [hinweise, setHinweise] = useState("");
  const tpl = D.templates.find((t) => t.id === picked);

  return (
    <div className="td-modal-bg" onClick={onClose}>
      <div className="td-modal lg" onClick={(e) => e.stopPropagation()}>
        <div className="td-modal-head">
          <div className="h">Template senden</div>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="td-modal-body" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
          <div className="td-tpl-list">
            {D.templates.map((t) => (
              <div key={t.id} className={"td-tpl" + (picked === t.id ? " active" : "")} onClick={() => setPicked(t.id)}>
                <div>
                  <div className="name">{t.name}.md</div>
                  <div className="meta">{t.vars.length} Variable{t.vars.length === 1 ? "" : "n"}</div>
                </div>
                <span className="scope">{t.scope === "global" ? "Global" : "Projekt"}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="td-field">
              <label>Auto-Variablen</label>
              <div style={{
                background: "var(--td-bg)", border: "1px solid var(--td-line)",
                padding: "8px 10px", fontSize: 11.5, color: "var(--td-text-dim)",
                borderRadius: 2, lineHeight: 1.7
              }}>
                {"{{PROJEKT_NAME}}"} = TanaLib<br/>
                {"{{NEXT_SEASON_NR}}"} = 6<br/>
                {"{{CURRENT_PHASE_FILE}}"} = docs/roadmap/PHASE1.md<br/>
                {"{{DATUM}}"} = 2026-05-08
              </div>
            </div>
            {tpl.vars.includes("FEATURE_NAME") && (
              <div className="td-field"><label>FEATURE_NAME</label>
                <input value={feature} onChange={(e) => setFeature(e.target.value)} placeholder="Token-Dashboard" /></div>
            )}
            {tpl.vars.includes("AUFGABE") && (
              <div className="td-field"><label>AUFGABE</label>
                <textarea rows="3" value={aufgabe} onChange={(e) => setAufgabe(e.target.value)} /></div>
            )}
            {tpl.vars.includes("HINWEISE") && (
              <div className="td-field"><label>HINWEISE (optional)</label>
                <textarea rows="2" value={hinweise} onChange={(e) => setHinweise(e.target.value)} /></div>
            )}
            <div style={{ color: "var(--td-text-mute)", fontSize: 11 }}>
              Wird via Bracketed Paste (\x1b[200~ … \x1b[201~) ans aktive PTY gesendet.
            </div>
          </div>
        </div>
        <div className="td-modal-foot">
          <button className="td-action-btn ghost" onClick={onClose}>Abbrechen</button>
          <button className="td-action-btn primary" onClick={() => onSend(tpl, { feature, aufgabe, hinweise })}>
            Ans Terminal senden
          </button>
        </div>
      </div>
    </div>
  );
}

function CommitModal({ onClose, onConfirm }) {
  const files = [
    { name: "core/auth/token_service.py", changes: "+38 −9", warn: false },
    { name: "database/schema.sql",        changes: "+14 −0", warn: false },
    { name: "tests/auth/test_rotation.py",changes: "+62 −0", warn: false },
    { name: ".env.example",               changes: "+1 −0",  warn: true  },
  ];
  return (
    <div className="td-modal-bg" onClick={onClose}>
      <div className="td-modal" onClick={(e) => e.stopPropagation()}>
        <div className="td-modal-head">
          <div className="h">Pre-Commit · TanaLib</div>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="td-modal-body">
          <div style={{ marginBottom: 10, fontSize: 12, color: "var(--td-text-dim)" }}>
            Branch: <b style={{ color: "var(--td-text)" }}>main</b> · 4 Dateien geändert
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {files.map((f) => (
              <div key={f.name} style={{
                display: "grid", gridTemplateColumns: "1fr auto", gap: 8,
                padding: "6px 10px",
                background: f.warn ? "rgba(240,180,0,0.06)" : "var(--td-bg-2)",
                border: "1px solid " + (f.warn ? "rgba(240,180,0,0.4)" : "var(--td-line)"),
                borderRadius: 2,
                fontSize: 12.5,
              }}>
                <span>{f.warn && "⚠ "}{f.name}</span>
                <span style={{ color: "var(--td-text-dim)" }}>{f.changes}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--td-warn)" }}>
            ⚠ Sensitive-File-Warnung: <code>.env.example</code> berührt — bitte prüfen.
          </div>
          <div style={{ marginTop: 10, color: "var(--td-text-mute)", fontSize: 11 }}>
            Sendet die Trigger-Phrase <b style={{ color: "var(--td-accent)" }}>"commit"</b> ans aktive PTY. Claude Code übernimmt den Commit.
          </div>
        </div>
        <div className="td-modal-foot">
          <button className="td-action-btn ghost" onClick={onClose}>Abbrechen</button>
          <button className="td-action-btn primary" onClick={onConfirm}>Send 'commit'</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================ Code/Editor pane (Diff + MD with tab system)
function MarkdownEditor({ file }) {
  const samples = {
    "CLAUDE.md": `---
workbench:
  project_name: TanaLib
  default_model: claude-sonnet-4-6
  current_phase_file: docs/roadmap/PHASE1.md
  trigger_phrases:
    docs_update: "ist korrekt umgesetzt"
    commit: "commit"
---

# TanaLib — Agent Context

You are a Senior Python Developer mit Schwerpunkt
Daten-Pipelines und Plotting.

## Working Rules
1. Comment language: Deutsch
2. Variants A/B/C vor Architektur-Entscheidungen
3. Doc updates only on trigger phrase`,
    "CHANGELOG.md": `# CHANGELOG

## 2026-05-08 · S5 — Refactor Auth
- JWT-Rotation mit Allow-List
- Reuse-Detection + Logout-All
- Tests: 8 passed

## 2026-05-06 · S4 — Watchlist-Filter
- Tag-Filter persistiert in SQLite
- UI-Chips mit Auto-Complete

## 2026-05-04 · S3 — DCF-Engine
- Discounted-Cashflow-Modell
- Recharts-Visualisierung`,
    "README.md": `# TanaLib

Python-Tool für Equity-Analyse mit Cache-Layer.

## Schnellstart
\`\`\`bash
python -m venv venv
.\\venv\\Scripts\\activate
pip install -r requirements.txt
python main.py
\`\`\`

## Stack
- pandas, numpy, matplotlib
- pdfplumber, Pillow
- SQLite via sqlalchemy`,
  };
  const text = samples[file] || `# ${file}\n\nKeine Vorschau verfügbar.`;
  return (
    <div className="td-md-edit">
      <pre className="td-md-pre">{text}</pre>
      <div className="td-md-bar">
        <span className="td-pill">▤ Editor</span>
        <span className="td-pill">⎘ Preview</span>
        <span style={{ marginLeft: "auto", color: "var(--td-text-mute)" }}>
          {file === "CLAUDE.md" ? "YAML ✓ valid · " : ""}CodeMirror 6 · Ctrl+S
        </span>
      </div>
    </div>
  );
}

function CodePane({ diff, splitOrient, setSplitOrient }) {
  // tabs: diff + a few markdown files
  const tabs = [
    { id: "diff",      kind: "diff", label: ".gitignore", sub: "Diff" },
    { id: "claude",    kind: "md",   label: "CLAUDE.md",  sub: "MD"   },
    { id: "changelog", kind: "md",   label: "CHANGELOG.md", sub: "MD" },
    { id: "readme",    kind: "md",   label: "README.md",  sub: "MD"   },
  ];
  const [active, setActive] = useState("diff");
  const tab = tabs.find((t) => t.id === active);

  function renderPane(kind, label) {
    if (kind === "diff") return <DiffViewer diff={diff} />;
    return <MarkdownEditor file={label} />;
  }

  // For split mode, decide which two panes to show
  const split = splitOrient !== "off";
  const topTab    = tabs.find((t) => t.id === "diff");
  const bottomTab = tabs.find((t) => t.id === active === "diff" ? "claude" : active) ||
                    tabs.find((t) => t.id !== "diff");
  // simpler: when split, show diff + currently picked md (or claude if active is diff)
  const mdTab = active !== "diff" ? tab : tabs.find((t) => t.kind === "md");

  return (
    <div className="td-code">
      <div className="td-window-tabs td-code-tabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={"td-tab" + (active === t.id ? " active" : "")}
            onClick={() => setActive(t.id)}
          >
            <span className={"td-tab-kind " + t.kind}>{t.sub}</span>
            <span>{t.label}</span>
          </div>
        ))}
        <div className="td-tab-actions" style={{ position: "static", marginLeft: "auto", marginRight: 6 }}>
          <button
            className={"td-tab-action" + (splitOrient === "vert" ? " on" : "")}
            title="Split: Diff oben, MD unten"
            onClick={() => setSplitOrient(splitOrient === "vert" ? "off" : "vert")}
          >⊟</button>
          <button
            className={"td-tab-action" + (splitOrient === "vert-rev" ? " on" : "")}
            title="Split: MD oben, Diff unten"
            onClick={() => setSplitOrient(splitOrient === "vert-rev" ? "off" : "vert-rev")}
          >⊞</button>
        </div>
      </div>

      {!split && (
        <div className="td-code-body">{renderPane(tab.kind, tab.label)}</div>
      )}
      {split && (
        <div className={"td-code-split " + splitOrient}>
          {splitOrient === "vert-rev" ? (
            <>
              <div className="td-code-split-head">MD · {mdTab.label}</div>
              <div className="td-code-split-pane"><MarkdownEditor file={mdTab.label} /></div>
              <div className="td-code-split-head">Diff · {topTab.label}</div>
              <div className="td-code-split-pane"><DiffViewer diff={diff} /></div>
            </>
          ) : (
            <>
              <div className="td-code-split-head">Diff · {topTab.label}</div>
              <div className="td-code-split-pane"><DiffViewer diff={diff} /></div>
              <div className="td-code-split-head">MD · {mdTab.label}</div>
              <div className="td-code-split-pane"><MarkdownEditor file={mdTab.label} /></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// expose
Object.assign(window, {
  ProjectsPanel, ActiveSessions, HistoryPanel,
  Terminal, DiffViewer, FilesPanel, NotesPanel,
  StatsPane, PlanPane,
  NewSessionModal, TemplatesModal, CommitModal,
  CodePane, MarkdownEditor,
  fmtNum, pct, ctxColor,
});

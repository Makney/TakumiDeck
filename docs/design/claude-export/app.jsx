/* global React, ReactDOM, TD_DATA, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakToggle */
const { useState, useEffect, useRef, useMemo } = React;
const D = window.TD_DATA;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#4ade80",
  "density": "comfy",
  "showHeatmap": true,
  "midPanel": "terminal"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // ===== state
  const [projectId, setProjectId] = useState("tanalib");
  const [projects, setProjects] = useState(D.projects);
  const [sessions, setSessions] = useState(D.sessions);
  const [history, setHistory] = useState(D.history);
  const [activeSessionId, setActiveSessionId] = useState("s5-refactor");
  const [openTabs, setOpenTabs] = useState(["s5-refactor", "bug-pdf", "doku-update"]);
  const [selectedFile, setSelectedFile] = useState(".gitignore");
  const [modal, setModal] = useState(null); // 'newSession' | 'templates' | 'commit' | 'settings'
  const [toast, setToast] = useState(null);
  const [dashTab, setDashTab] = useState("ueb");
  const [range, setRange] = useState("Alle");
  const [splitOrient, setSplitOrient] = useState("off");

  // Apply accent
  useEffect(() => {
    document.documentElement.style.setProperty("--td-accent", tweaks.accent);
    const hex = tweaks.accent.replace("#", "");
    const r = parseInt(hex.slice(0,2), 16);
    const g = parseInt(hex.slice(2,4), 16);
    const b = parseInt(hex.slice(4,6), 16);
    document.documentElement.style.setProperty("--td-accent-soft", `rgba(${r},${g},${b},0.14)`);
    document.documentElement.style.setProperty("--td-accent-line", `rgba(${r},${g},${b},0.35)`);
    document.documentElement.style.setProperty("--td-add", `rgba(${r},${g},${b},0.10)`);
  }, [tweaks.accent]);

  useEffect(() => {
    document.documentElement.style.fontSize = tweaks.density === "compact" ? "12px" : "13px";
  }, [tweaks.density]);

  const project = projects.find((p) => p.id === projectId);
  const projectSessions = sessions[projectId] || [];
  const tabSessions = openTabs
    .map((id) => projectSessions.find((s) => s.id === id))
    .filter(Boolean);
  const activeSession = projectSessions.find((s) => s.id === activeSessionId) || null;
  const projectHistory = history[projectId] || [];
  const projectFiles = D.files[projectId] || [];

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function pickProject(id) {
    setProjectId(id);
    const sess = sessions[id] || [];
    const ids = sess.map((s) => s.id);
    setOpenTabs(ids);
    setActiveSessionId(sess[0]?.id || null);
  }

  function pickSession(id) {
    if (!openTabs.includes(id)) setOpenTabs([...openTabs, id]);
    setActiveSessionId(id);
  }

  function closeTab(id) {
    const idx = openTabs.indexOf(id);
    const next = openTabs.filter((t) => t !== id);
    setOpenTabs(next);
    if (activeSessionId === id) {
      setActiveSessionId(next[Math.max(0, idx - 1)] || null);
    }
  }

  function sendInput(text) {
    if (!activeSession) return;
    const updated = { ...sessions };
    updated[projectId] = projectSessions.map((s) =>
      s.id === activeSessionId
        ? {
            ...s,
            terminal: [
              ...s.terminal,
              { kind: "user", text },
              { kind: "agent", text: simulateReply(text) },
            ],
            contextUsed: Math.min(s.contextLimit, s.contextUsed + 1200 + text.length * 6),
            status: "running",
          }
        : s
    );
    setSessions(updated);
  }

  function simulateReply(text) {
    const t = text.toLowerCase();
    if (t.startsWith("/model"))   return "Aktuelles Modell: " + (activeSession?.model || "Sonnet 4.6");
    if (t.startsWith("/clear"))   return "● Kontext geleert.";
    if (t.includes("test"))       return "● Bash(pytest -q)\n  ⎿  ........  passed";
    if (t.includes("commit"))     return "● Bereit zu committen. Diff sieht sauber aus.";
    return "● Verstanden. Ich plane den nächsten Schritt und melde mich gleich mit einem Vorschlag zurück.";
  }

  function updateNotes(text) {
    if (!activeSession) return;
    const updated = { ...sessions };
    updated[projectId] = projectSessions.map((s) =>
      s.id === activeSessionId ? { ...s, notes: text } : s
    );
    setSessions(updated);
  }

  function createSession({ name, type, model, season }) {
    const m = D.models.find((x) => x.id === model);
    const newId = "s-" + Date.now();
    const newSession = {
      id: newId,
      label: season ? `S${season} — ${name || "Unbenannt"}` : (name || `${type} — Unbenannt`),
      season,
      type,
      status: "running",
      model: m.label,
      modelId: model,
      contextUsed: 800,
      contextLimit: m.limit,
      notes: "",
      lastActivity: 0,
      terminal: [
        { kind: "system", text: `Spawning claude --model ${model} (cwd=${project.path})` },
        { kind: "agent", text: `Hallo! ${m.label} ist bereit. Was steht an?` },
      ],
    };
    const updated = { ...sessions };
    updated[projectId] = [newSession, ...(updated[projectId] || [])];
    setSessions(updated);
    setOpenTabs([newId, ...openTabs]);
    setActiveSessionId(newId);

    // bump season + active count
    setProjects(projects.map((p) =>
      p.id === projectId
        ? { ...p, seasonNumber: type === "feature" ? p.seasonNumber + 1 : p.seasonNumber, activeCount: p.activeCount + 1 }
        : p
    ));

    // history entry
    const updHist = { ...history };
    updHist[projectId] = [
      { season, label: newSession.label, status: "running", model: m.label, date: "2026-05-08", notesCount: 0, type },
      ...(updHist[projectId] || []),
    ];
    setHistory(updHist);

    setModal(null);
    flashToast(`Session ${newSession.label} gestartet`);
  }

  function sendTemplate(tpl, vars) {
    if (!activeSession) { setModal(null); return; }
    const body = `[Template: ${tpl.name}]\nFEATURE: ${vars.feature || "—"}\nAUFGABE: ${vars.aufgabe || "—"}\nHINWEISE: ${vars.hinweise || "—"}`;
    sendInput(body);
    setModal(null);
    flashToast(`Template ${tpl.name} via bracketed-paste gesendet`);
  }

  function triggerCommit() {
    sendInput("commit");
    setModal(null);
    flashToast("Trigger-Phrase 'commit' gesendet");
  }

  // global shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey && e.key.toLowerCase() === "t") { e.preventDefault(); setModal("templates"); }
      if (e.ctrlKey && e.key.toLowerCase() === "k") { e.preventDefault(); setModal("settings"); }
      if (e.key === "Escape") setModal(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mid pane render
  function MidPane() {
    if (tweaks.midPanel === "editor") {
      return (
        <div className="td-window">
          <div className="td-window-tabs">
            <div className="td-tab active"><span style={{ color: "var(--td-blue)" }}>M</span> CLAUDE.md <span className="td-tab-x">×</span></div>
            <div className="td-tab"><span style={{ color: "var(--td-blue)" }}>M</span> docs/CHANGELOG.md <span className="td-tab-x">×</span></div>
          </div>
          <div className="td-term" style={{ background: "var(--td-panel)" }}>
            <pre style={{ margin: 0, fontSize: 12, color: "var(--td-text-dim)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
{`---
workbench:
  project_name: TanaLib
  default_model: claude-sonnet-4-6
  current_phase_file: docs/roadmap/PHASE1.md
  trigger_phrases:
    docs_update: "ist korrekt umgesetzt"
    commit: "commit"
  on_demand_files:
    - path: docs/CODING_RULES.md
      trigger: "Read for every implementation"
      auto_inject: false
---

# TanaLib — Agent Context

You are a Senior Python Developer mit Schwerpunkt auf
Daten-Pipelines und Plotting.

## Working Rules
1. Comment language: Deutsch
2. Variants A/B/C vor Architektur-Entscheidungen
3. Doc updates only on trigger phrase`}
            </pre>
          </div>
          <div className="td-term-bar">
            <span className="td-pill">▤ Editor</span>
            <span className="td-pill">⎘ Preview</span>
            <span style={{ color: "var(--td-text-mute)", marginLeft: "auto" }}>YAML ✓ valid · CodeMirror 6 · Ctrl+S to save</span>
          </div>
        </div>
      );
    }

    return (
      <div className="td-window">
        <div className="td-window-tabs">
          {tabSessions.map((s) => (
            <div
              key={s.id}
              className={"td-tab" + (activeSessionId === s.id ? " active" : "")}
              onClick={() => setActiveSessionId(s.id)}
            >
              <span className={"td-status-dot " + s.status} style={{ width: 6, height: 6 }} />
              <span>{s.label}</span>
              <span className="td-tab-x" onClick={(e) => { e.stopPropagation(); closeTab(s.id); }}>×</span>
            </div>
          ))}
          <button className="td-tab-add" onClick={() => setModal("newSession")} title="Neue Session">+</button>
          <div className="td-tab-actions">
            <button className="td-tab-action" title="Settings" onClick={() => setModal("settings")}>⚙</button>
            <button className="td-tab-action" title="Schließen">×</button>
          </div>
        </div>
        <Terminal
          session={activeSession}
          projectName={project.name}
          onSend={sendInput}
          onOpenSettings={() => setModal("settings")}
          onOpenTemplates={() => setModal("templates")}
          onTriggerCommit={() => setModal("commit")}
        />
      </div>
    );
  }

  return (
    <div className="td-app">
      {/* Title bar */}
      <div className="td-titlebar">
        <div className="td-brand">
          <span className="td-kanji">匠</span>
          <span><b>TakumiDeck</b> · v0.1.0-dev</span>
        </div>
        <span className="td-title-meta">{project.name} · main · 3 Sessions</span>
        <div className="td-spacer" />
        <span className="td-title-meta">
          {tweaks.midPanel === "editor" ? "Markdown-Editor" : "Terminal"}
          {" · "}P90 192h
        </span>
        <div className="td-icons">
          <button title="Settings" onClick={() => setModal("settings")}>⚙</button>
          <button title="Min">_</button>
          <button title="Max">▢</button>
          <button className="td-close" title="Close">×</button>
        </div>
      </div>

      {/* Main grid */}
      <div className="td-main">
        {/* Left column: 3 stacked panels */}
        <div className="td-col-left">
          <ProjectsPanel
            projects={projects}
            activeId={projectId}
            onPick={pickProject}
            onAdd={() => flashToast("'Add Project' öffnet einen Ordner-Picker")}
          />
          <ActiveSessions
            sessions={projectSessions.filter((s) => s.status === "running" || s.status === "waiting" || s.status === "idle")}
            activeId={activeSessionId}
            onPick={pickSession}
            onNew={() => setModal("newSession")}
          />
          <HistoryPanel
            history={projectHistory}
            onPickHistory={(h) => flashToast(`Verlauf: ${h.label} — Detail-Panel würde sich öffnen`)}
          />
        </div>

        {/* Mid top: terminal */}
        <div className="td-col-mid-top">
          <MidPane />
        </div>

        {/* Right top: code pane (Diff/MD tabs + split) */}
        <div className="td-col-right-top">
          <CodePane diff={D.diff} splitOrient={splitOrient} setSplitOrient={setSplitOrient} />
        </div>

        {/* Mid bottom: Übersicht */}
        <div className="td-col-mid-bottom">
          <StatsPane
            stats={D.stats}
            heatmap={tweaks.showHeatmap ? D.heatmap : []}
            range={range}
            setRange={setRange}
            dashTab={dashTab}
            setDashTab={setDashTab}
          />
        </div>

        {/* Right bottom: Plannutzung */}
        <div className="td-col-right-bottom">
          <div className="td-plan">
            <PlanPane plan={D.plan} onOpenDetail={() => flashToast("Detail-Panel: Per-Projekt + Per-Modell + Burn-Rate")} />
          </div>
        </div>

        {/* Right sidebar: Files + Notizen, spans full height */}
        <div className="td-col-right-stack">
          <FilesPanel
            files={projectFiles}
            selected={selectedFile}
            onSelect={(name) => { setSelectedFile(name); flashToast(`${name} im Editor geöffnet`); }}
          />
          <NotesPanel session={activeSession} onChange={updateNotes} />
        </div>
      </div>

      {/* Modals */}
      {modal === "newSession" && (
        <NewSessionModal project={project} onClose={() => setModal(null)} onCreate={createSession} />
      )}
      {modal === "templates" && (
        <TemplatesModal onClose={() => setModal(null)} onSend={sendTemplate} />
      )}
      {modal === "commit" && (
        <CommitModal onClose={() => setModal(null)} onConfirm={triggerCommit} />
      )}
      {modal === "settings" && (
        <SettingsModal onClose={() => setModal(null)} />
      )}

      {/* Toast */}
      {toast && (
        <div className="td-toast">
          <span style={{ color: "var(--td-accent)" }}>●</span>
          <span>{toast}</span>
        </div>
      )}

      {/* Tweaks */}
      <TweaksPanel title="Tweaks">
        <TweakSection title="Akzent">
          <TweakColor
            label="Accent"
            value={tweaks.accent}
            options={["#4ade80", "#5cb8ff", "#b594ff", "#ff8a3c", "#f0b400"]}
            onChange={(v) => setTweak("accent", v)}
          />
        </TweakSection>
        <TweakSection title="Layout">
          <TweakRadio
            label="Mittel-Panel"
            value={tweaks.midPanel}
            options={[
              { value: "terminal", label: "Terminal" },
              { value: "editor",   label: "MD-Editor" },
            ]}
            onChange={(v) => setTweak("midPanel", v)}
          />
          <TweakRadio
            label="Dichte"
            value={tweaks.density}
            options={[
              { value: "comfy",   label: "Comfy" },
              { value: "compact", label: "Compact" },
            ]}
            onChange={(v) => setTweak("density", v)}
          />
          <TweakToggle
            label="Heatmap zeigen"
            value={tweaks.showHeatmap}
            onChange={(v) => setTweak("showHeatmap", v)}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

function SettingsModal({ onClose }) {
  const [tab, setTab] = useState("Allgemein");
  const tabs = ["Allgemein", "Workspace", "Modelle", "Token-Tracking", "Terminal", "About"];
  return (
    <div className="td-modal-bg" onClick={onClose}>
      <div className="td-modal lg" onClick={(e) => e.stopPropagation()}>
        <div className="td-modal-head">
          <div className="h">Settings</div>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="td-modal-body" style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, padding: 0 }}>
          <div style={{ borderRight: "1px solid var(--td-line)", padding: 12 }}>
            {tabs.map((t) => (
              <div key={t}
                onClick={() => setTab(t)}
                className={"td-list-item" + (tab === t ? " active" : "")}
                style={{ cursor: "pointer" }}>
                <span className="td-name">{t}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: 16, minHeight: 280 }}>
            {tab === "Allgemein" && (
              <>
                <div className="td-field"><label>Theme</label>
                  <div className="td-radio-row">
                    <button className="td-radio active">Dark</button>
                    <button className="td-radio">Light (Phase 2)</button>
                  </div>
                </div>
                <div className="td-field"><label>Workspace-Pfad</label>
                  <input defaultValue="C:\Users\Sebastian\Projects" /></div>
                <button className="td-action-btn">📂 Open Data Folder</button>
              </>
            )}
            {tab === "Modelle" && (
              <div style={{ fontSize: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px", gap: 6, color: "var(--td-text-dim)", marginBottom: 6 }}>
                  <span>Modell</span><span>ID</span><span>Limit</span>
                </div>
                {D.models.map((m) => (
                  <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px", gap: 6, padding: "4px 0", borderBottom: "1px solid var(--td-line)" }}>
                    <span>{m.label}</span>
                    <code style={{ color: "var(--td-text-mute)", fontSize: 11 }}>{m.id}</code>
                    <span>{fmtNum(m.limit)}</span>
                  </div>
                ))}
                <button className="td-action-btn ghost" style={{ marginTop: 10 }}>{ }Edit Raw JSON</button>
              </div>
            )}
            {tab === "Token-Tracking" && (
              <>
                <div className="td-field"><label>P90-Window (Stunden)</label><input defaultValue="192" /></div>
                <div className="td-field"><label>Warning-Schwellen</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input defaultValue="70" style={{ flex: 1 }} />
                    <input defaultValue="85" style={{ flex: 1 }} />
                    <input defaultValue="95" style={{ flex: 1 }} />
                  </div>
                </div>
              </>
            )}
            {tab === "Terminal" && (
              <>
                <div className="td-field"><label>Font Family</label><input defaultValue="MesloLGS NF, Cascadia Code" /></div>
                <div className="td-field"><label>Font Size</label><input defaultValue="14" type="number" /></div>
              </>
            )}
            {tab === "Workspace" && (
              <div style={{ fontSize: 12 }}>
                <div className="td-field"><label>Workspace-Ordner</label>
                  <input defaultValue="C:\Users\Sebastian\Projects" /></div>
                <div style={{ color: "var(--td-text-dim)", marginBottom: 6 }}>Manuell hinzugefügte Projekte:</div>
                {D.projects.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--td-line)" }}>
                    <span>{p.name}</span><code style={{ color: "var(--td-text-mute)" }}>{p.path}</code>
                  </div>
                ))}
              </div>
            )}
            {tab === "About" && (
              <div style={{ color: "var(--td-text-dim)", fontSize: 12, lineHeight: 1.7 }}>
                <div style={{ fontFamily: "var(--td-display)", fontSize: 24, color: "var(--td-text)" }}>匠 TakumiDeck</div>
                <div>Version 0.1.0-dev</div>
                <div>Persönliches Multi-Session-Tool für Claude Code.</div>
                <div>Stack: Electron · TypeScript · React · SQLite · xterm.js · CodeMirror 6</div>
                <div>github.com/Makney/TakumiDeck</div>
              </div>
            )}
          </div>
        </div>
        <div className="td-modal-foot">
          <button className="td-action-btn ghost" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("app")).render(<App />);

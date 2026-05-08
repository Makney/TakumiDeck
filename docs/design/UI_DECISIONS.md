# UI-Entscheidungen

Diese Datei dokumentiert die finalen UI-Entscheidungen für TakumiDeck. Sie ergänzt [TAKUMIDECK_ARCHITEKTUR.md](../TAKUMIDECK_ARCHITEKTUR.md) (Was/Warum auf System-Ebene) mit konkreten Layout-Entscheidungen.

**Visuelle Referenz:** [layout-v1.png](./layout-v1.png)

## Layout-Konzept

**Drei-Spalten-Hauptlayout** mit globaler Header-Bar oben und kontextuellem Eingabe-/Stats-Bereich unten Mitte.
```
┌─────────────────────────────────────────────────────────────┐
│ Header: Logo · Projekt · Branch · Sessions-Counter · Window │
├──────────┬──────────────────────────────────┬───────────────┤
│ Sidebar  │ Terminal-Tabs                    │ Right-Pane    │
│          │ ┌──────────────────────────────┐ │               │
│ Projekte │ │ xterm.js Terminal            │ │ Diff/Files    │
│          │ │ (aktive Session)             │ │ Tabs          │
│ Sessions │ │                              │ │               │
│          │ └──────────────────────────────┘ │ Datei-Browser │
│ Verlauf  │ Eingabezeile                     │               │
│          │ Modell · Templates · Commit · ctx│ Notizen       │
│          │ Übersicht/Modelle (Stats+Heatmap)│ Plannutzung   │
└──────────┴──────────────────────────────────┴───────────────┘
```
## Bereich: Sidebar (links)

**Drei Sektionen, vertikal gestapelt:**

1. **Projekte** — Liste bekannter Projekte mit Session-Counter-Badge bei aktiven Sessions, "+ Add Project"-Button am Ende
2. **Aktive Sessions** — Sessions mit Status `running`, `interrupted`, oder `idle` (= Phase-2-State); Status-Punkt als visueller Indikator (grün=running, orange=interrupted, grau=idle), "+ Neue Session"-Button am Ende
3. **Verlauf** — Abgeschlossene Sessions mit Season-Nummer/Typ, Modell, Datum; Filter-Erweiterung in Phase 2

**Breite:** ~220px (eng genug für Multi-Pane, breit genug für Projektnamen)

## Bereich: Mitte (Terminal + Eingabe + Stats)

### Terminal-Tabs

- Tabs am oberen Rand: Aktive Sessions als Tabs
- Tab-Wechsel ohne Session-Verlust (Background-Sessions laufen weiter)
- "+" am Ende für neue Session
- Schließen-Button (×) pro Tab → Status `archived`

### Terminal-Body

- xterm.js mit Canvas-Renderer
- Dunkler Hintergrund (Terminal-Aesthetic, Code-zentriert)
- Volle TUI-Darstellung: Spinner, Tool-Use-Indikatoren, Slash-Commands

### Eingabezeile

- Single-Line-Input mit Hint "? for shortcuts"
- Hilft-Zeile darunter: `Enter senden · Ctrl+T Templates · Ctrl+K Modell wechseln`

### Action-Bar (unter Eingabe)

Pill-Style-Buttons:
- **Modell** (z.B. "Sonnet 4.6") — öffnet Modell-Picker
- **Templates** — öffnet Template-Modal
- **commit** — sendet Commit-Trigger-Phrase an aktive Session
- **ctx** — Mini-Bar zeigt aktuellen Kontext-Verbrauch (142.3k / 1.0M)
- **läuft**-Badge rechts: Status-Indikator der aktiven Session

### Übersicht/Modelle (unten Mitte)

Toggle zwischen zwei Views:

**Übersicht:**
- Stats-Cards: Sitzungen, Nachrichten, Token gesamt, Aktive Tage, Aktuelle Streak, Längste Streak, Spitzenstunde, Lieblingsmodell
- Aktivitäts-Heatmap: 30-Wochen-Calendar-Heatmap (GitHub-Style)
- Easter-Egg-Vergleich (z.B. "31× mehr Token als The Lord of the Rings")
- Filter-Toggle: Alle / 30d / 7d

**Modelle:**
- Per-Modell-Aufschlüsselung (Phase 2)

## Bereich: Right-Pane (rechts)

**Permanent sichtbar mit Tabs**, anders als ursprünglich geplant (Footer-Bar mit Modal-Switching).

### Top-Section: Diff + Datei-Tabs

- Tab-Bar oben: **Diff** · CLAUDE.md · CHANGELOG.md · README.md (dynamisch erweiterbar)
- Diff-Tab: Working-Tree-Diff via simple-git, gerendert mit CodeMirror Merge
- Datei-Tabs: Markdown-Editor (CodeMirror 6 + lang-markdown)
- Side-by-Side / Unified-Toggle für Diff
- Branch + Pfad-Breadcrumb oben

### Mid-Section: Datei-Browser

- File-Tree des aktiven Projekts
- Filter-Suchfeld oben
- Doppelklick → öffnet Datei in neuem Tab in Top-Section

### Notizen-Section

- Plain-Text-Textarea, expandable
- Auto-Save mit 500ms Debounce
- "gespeichert"-Indikator (grüner Punkt)
- Persistent in SQLite pro Session

### Plannutzung-Section

Konfigurierbare Limit-Bars (siehe Settings).

**Default-Bars** (matcht Claude Desktop):
- 5-Stunden-Limit
- Wöchentlich · alle Modelle
- Wöchentlich · Claude Design (Top-Tier-Modelle)
- Nur Sonnet

**Pro Bar:**
- Label
- Verbrauchs-Prozent (rechts)
- Reset-Zeit
- Farbiger Bar (gelb 70%, orange 85%, rot 95%)

**Footer-Hinweis:** "P90 über letzte 192h · Schwellen 70/85/95"

## Header-Bar

- Logo + App-Name + Version (z.B. "TakumiDeck · v0.1.0-dev")
- Projektname · Branch · Sessions-Counter
- Rechts: "Terminal · P90 192h" als Status-Hinweis
- Window-Controls (minimieren, maximieren, schließen)

## Theming

- **Dark-Theme als einziges Theme im MVP** (Light-Theme = Phase 3)
- Akzent-Farbe: Mint-Grün (#7ed957 oder ähnlich) für aktive Indikatoren, Status-Punkte, Stats-Highlights
- Hintergrund-Hierarchie: Dunkelster Pane = Terminal, dunkelgrau = App-Chrome, mittelgrau = Cards
- Monospaced-Font: Cascadia Code oder MesloLGS NF
- UI-Font: System-Stack (Segoe UI auf Windows)

## Settings-relevante UI-Decisions

Folgende Werte sind in Settings konfigurierbar:

- `limit_bars[]` — Liste der angezeigten Wochen-Bars (Label, Window-Stunden, Modell-Filter)
- `terminal_font_family`
- `terminal_font_size`
- `theme` — Default `dark`, später `light` als Option
- `accent_color` — Default Mint-Grün

## Phasen-Zuordnung

### MVP (Sprint 1-8)

- 3-Spalten-Hauptlayout mit Sidebar/Terminal/Right-Pane
- Header-Bar minimal (Projekt, Sessions-Count, Branch)
- Terminal-Tabs mit xterm.js
- Eingabezeile + Action-Bar mit Modell/Templates/Commit
- Diff-Tab + Datei-Tabs (CLAUDE.md, CHANGELOG.md, README.md, dynamisch)
- Datei-Browser im Right-Pane
- Notizen-Section pro Session
- Plannutzung mit konfigurierbaren Bars
- Default-Werte: 5h + 3 Wochen-Bars

### Phase 2

- Übersicht/Modelle-Toggle mit Stats und Heatmap (Sitzungen, Streaks, Spitzenstunde, Lieblingsmodell)
- Modelle-View mit Per-Modell-Aufschlüsselung
- Easter-Egg-Vergleich
- 30d/7d-Filter

### Phase 3

- Light-Theme
- Theming-Customization
- Erweiterte Heatmap-Filter

## Bewusste Auslassungen

- **Footer-Bar mit Modal-Switching** — verworfen zugunsten permanent sichtbarem Right-Pane
- **Token-Dashboard als oben-Strip** — Plannutzung lebt im Right-Pane, kompakter
- **Sidebar rechts** — links bleibt Standard
- **Side-by-Side-Markdown-Preview** — Toggle reicht im MVP
- **Worktree-Selector im CodePane-Footer** — Phase 5+, nicht im MVP
- **Tailwind / Styled-Components** — pure CSS Modules + tokens.css aus Claude-Design-Export

Vollständige Stack-Entscheidungen und Begründungen: siehe [TAKUMIDECK_ARCHITEKTUR.md Kapitel 2](../TAKUMIDECK_ARCHITEKTUR.md).

## Visuelle Referenzen und Code-Assets

- [layout-v1.png](./layout-v1.png) — Finales Design vom 2026-05-08
- [claude-export/](./claude-export/) — Vollständiger Claude-Design-Handoff mit:
  - `README.md` — Detaillierte Komponenten-Spec
  - `styles.css` — Komplette CSS-Tokens und Komponenten-Styles (1148 Zeilen)
  - `app.jsx` — Root-Komponente mit Layout-Grid
  - `components.jsx` — Alle Panels und Modale
  - `data.js` — Mock-Daten-Struktur (Referenz für SQLite-Schema)
  - `prototype.html` — Lauffähiger Prototyp für Browser-Inspection

**Hinweis zur Übernahme:**

- `styles.css` Token-Block (Zeile 3-32) → wird 1:1 als `src/renderer/styles/tokens.css` ins Projekt übernommen
- Restlicher CSS → als Referenz, fließt komponentenweise in React-Komponenten ein
- `app.jsx` und `components.jsx` → Referenz für Komponenten-Struktur, nicht 1:1-Übernahme (wegen Mock-Daten)
- `tweaks-panel.jsx` → wird **nicht** übernommen (war Design-Tool, nicht App-Feature)

### Versionierung

- Neue Design-Iterationen als `layout-v2.png`, `layout-v3.png` etc.
- Major-Iterationen: neuer Claude-Design-Export → `claude-export-v2/`
- Kleinere Anpassungen direkt am Code, nicht im Design-Asset
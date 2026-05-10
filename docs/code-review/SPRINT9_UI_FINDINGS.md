# Sprint 9 — UI-Findings: Implementation vs. Design-Vorlage

**Datum:** 2026-05-10
**Vorlage:** `docs/design/claude-export/{styles.css,components.jsx,app.jsx,prototype.html}`
**Implementation:** `src/renderer/`
**Methode:** Datei-für-Datei-Vergleich der Token-Defaults, Layout-Klassen, Hover-Pattern, Modal-Pattern, Status-Indikatoren und Komponenten-Hierarchie.

## Legende

| Symbol | Kategorie | Bedeutung |
|---|---|---|
| 🔴 | kritisch | Layout-Bug, Lesbarkeit, falsche Komponenten-Hierarchie — Daily-Driver-Schmerz |
| 🟡 | kosmetisch | Spacing/Color/Font-Drift — sichtbar, aber kein Workflow-Hindernis |
| 🔵 | Spec-Erweiterung | Vorlage hat etwas, das die Impl bewusst weggelassen hat (oder umgekehrt) |
| ⚪ | Spec-Klärung | Vorlage selbst widersprüchlich oder Naming-Drift ohne Funktionsverlust |
| ⚡ | bewusste Abweichung | In Architektur/ENTSCHEIDUNGEN dokumentiert — kein Fix nötig |

## Bewusste Abweichungen (⚡) — sind dokumentiert, kein Sprint-9-Scope

Diese Punkte sind in `docs/CHANGELOG.md`, `docs/ENTSCHEIDUNGEN.md` oder `docs/TAKUMIDECK_ARCHITEKTUR.md` 12 explizit dokumentiert. Hier nur zur Vollständigkeit aufgelistet, damit nichts „erneut entdeckt" wird.

| Komponente | Soll | Ist | Begründung |
|---|---|---|---|
| Mid-Spalten-Verteilung | `1fr 1fr` | `1.6fr 1fr` | Sprint-8-Mid-Sprint-Anpassung — Terminal/Tabelle bekommt 62 % der Mittenfläche, Editor 38 %. CHANGELOG Sprint 8. |
| Diff-Viewer-Renderer | Custom `td-diff-row` mit Add/Rem/Ctx-Patches | `@codemirror/merge.unifiedMergeView` | Sprint-7-Tech-Wahl Q5-B — CodeMirror 6 wiederverwendet, Standard-Editor-Ergonomie statt Custom-Render. |
| StatsPane-Heatmap fehlt | 8 Mini-Karten + 30-Wochen-Heatmap + Fun-Fact | 3 Mini-Karten + Phase-2-Hinweispille | FEATURES.md Sprint 5 + Architektur 6.4 — bewusste Phase-2-Auslassung. |
| Sidebar — Inline-Resume/-X | reine Liste mit Status-Dot + Name | `td-row-action`/`td-row-x` pro Aktive-Session | Sprint-6-UX-Erweiterung — Daily-Driver-Workflow schneller als Detail-Pane. |
| TitleBar-Branch-Refresh | nicht in Vorlage | manueller `↻`-Knopf neben Branch | Sprint 8 V3-B — Branch via Cache + Trigger-Refresh statt Polling. |
| TitleBar-Claude-Health-Banner | nicht in Vorlage | warning-Banner mit Klick-zu-Settings | Sprint 8 V7-C Error-Handling. |
| Welcome-Box im leeren Terminal | `td-term-welcome` mit Mascot + claude-Version | xterm rendert claude-Output direkt | claude-Code rendert sein eigenes Welcome — Doppelrendern wäre Lärm. |
| `td-cursor` Block-Cursor + Blink | Custom Cursor-Animation | xterm-eigener Cursor | xterm.js verwaltet Cursor selbst, td-cursor wäre Konflikt. |
| Tab-Empty-Container-CTA | in Vorlage kein expliziter Empty-State | „+ Neue Session (Ctrl+N)"-CTA | Sprint-3-Erweiterung — Onboarding für leere Projekte. |

---

## A) Kritische Findings (🔴) — sollten in Sprint 9 fixed werden

| # | Komponente | Soll (Vorlage) | Ist (Impl) | Vorschlag |
|---|---|---|---|---|
| A1 | TabBar (Mid-Spalte) — Tab-Optik | Window-Frame-Tabs: `border-top-radius: 6px; border-bottom: none; padding: 7px 12px 8px 12px; bottom: -1px` über der Window-Body-Border (styles.css 357-396). Tabs sehen aus wie nahtlos angesteckte Browser-Tabs. | Pillen-Tabs: `padding: 0 8px; height: 22px; border-radius: 2px` (app.css 564-590) — kompakte Buttons, keine Window-Frame-Optik. | Visual-Identity-Drift, brichts mit der Vorlage. **Variants nötig:** A) Window-Frame-Tabs nach Vorlage übernehmen (Layout-Refactor, evtl. erfordert auch td-window-Container), B) bei Pillen-Tabs bleiben + Vorlage als wertfrei markieren. |
| A2 | KeyboardHints — Hierarchie + Linie | In der Vorlage als `td-term-hint` **innerhalb** des `td-term-input-wrap` direkt unter dem Eingabefeld, **ohne** zusätzliche Trennlinie (styles.css 515-530, components.jsx 172-176). | Eigene Sektion `td-keyboard-hints` mit `border-top: 1px dashed var(--td-line)` **nach** der `td-term-bar` (app.css 2779-2790). | Falsche Hierarchie + Drift bei der dashed-Linie (Vorlage hat keine). Hints gehören semantisch zum Input, nicht zur Action-Bar. **Fix:** Hints-Block in den `td-term-input-wrap` ziehen (xterm-Wrapper hat keinen Input-Wrap → muss als untergeordnete Sektion direkt nach dem xterm-Canvas und VOR der `td-term-bar` sitzen). Dashed-Border entfernen. |
| A3 | Modal-Title — Display-Headline | `font-family: var(--td-display); font-size: 22px; letter-spacing: 0.02em` — markante Display-Headline (styles.css 1020-1024). | `font-family: var(--td-display); font-size: 13px; letter-spacing: 0.06em` — wirkt wie Body-Caption (app.css 822-829). | Modale fühlen sich „flach" an. Display-Font-Slot ist da, aber zu klein. **Fix:** `td-modal-title` auf 22px hochziehen, letter-spacing auf 0.02em angleichen. Betrifft 5 Modale (NewSession, Templates, PreCommit, Settings, UsageDetail). |
| A4 | `.td-panel-title` — Sidebar-Headlines | `font-size: 22px; letter-spacing: 0.02em; line-height: 1` (styles.css 213-219). „Projekte / Aktive Sessions / Verlauf / Notizen" als markante Display-Headlines. | `font-size: 16px; letter-spacing: 0.04em` (app.css 236-242). Wirken wie sekundäre Captions. | Verlust der visuellen Anker auf der Sidebar. **Fix:** Auf Vorlage-Werte angleichen (22px, 0.02em). |
| A5 | PlanPane — Title-Größe | `td-plan-head .title { font-family: var(--td-display); font-size: 28px }` — sehr große Display-Headline „Plannutzung" (styles.css 943-948). | `td-plan-pane-title { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase }` — kleine Caption (app.css 986-992). | Identitäts-Verlust für die Pane. **Fix:** Title auf 28px display ziehen. Optional: rechten `td-plan-head .arrow`-Knopf nachziehen (siehe B5). |

---

## B) Kosmetische Drifts (🟡) — Sprint-9 oder Phase 2

| # | Komponente | Soll | Ist | Vorschlag |
|---|---|---|---|---|
| B1 | `.td-col-left` Background | `var(--td-panel)` (styles.css 134) | `var(--td-panel-2)` (app.css 109) | 1-Wert-Fix in app.css 109. Sidebar harmonisiert sich mit anderen Panels. |
| B2 | `.td-list-item` Font-Size | 13px (styles.css 252) | 12px (app.css 278) | Lesbarkeit minimal verbessert. |
| B3 | `.td-action-btn` Font-Size | 12px (styles.css 305) | 11px (app.css 379) | Konsistenz mit Vorlage. |
| B4 | Modal-Footer Background | `background: var(--td-bg-2); padding: 10px 16px` — sichtbarer Toolbar-Footer (styles.css 1037-1043) | nur `border-top + padding-top: 10px` — flacher Footer (app.css 855-862) | bg + padding nachziehen. |
| B5 | PlanPane — `→`-Detail-Button | `<button className="arrow">→</button>` rechts oben in der Head, öffnet Detail (components.jsx 399) | nicht vorhanden (Klick auf einzelne UsageBar öffnet UsageDetailModal stattdessen) | Spec-Erweiterung — Phase-2-Slot. UsageDetailModal-Trigger pro Bar reicht für MVP. |
| B6 | Modal-Body Padding | 16px (styles.css 1036) | 14px (app.css 847) | 2-px-Drift. |
| B7 | Modal-Field-Label Letter-Spacing | 0.08em (styles.css 1047) | 0.04em (app.css 873) | Schmalere Captions in Impl. |
| B8 | Modal-Wide max-width | 820px (styles.css 1013) | 720px (app.css 1196) | Templates/Settings/UsageDetail enger als spec. |
| B9 | `.td-titlebar-meta-item` Color | `var(--td-text-mute)` (styles.css 94) | `var(--td-text-dim)` (app.css 2706-2708) | dim ist kontrastreicher — minimal heller. Bewusste Abweichung oder Drift? Phase-2 oder Sprint 9. |
| B10 | Action-Bar `.td-pill` Padding | `1px 8px` (styles.css 547) | `2px 10px` (app.css 750) | Pillen leicht runder/größer als spec. |
| B11 | `.td-term-bar` Padding | `4px 12px` (styles.css 537) | `6px 12px` (app.css 738) | 2px höher. |
| B12 | FilesPanel — `td-panel-title-sm`-Header „Dateien" | `<div className="td-panel-title-sm">Dateien</div>` als Caption über dem Search (components.jsx 246) | nur Search-Input direkt | User weiß sonst nicht, was die schmale rechte Spalte ist. |
| B13 | `.td-files-list` Padding | `6px 6px` (styles.css 741) | `4px 4px` (app.css 1988) | 2-px-Drift. |
| B14 | `.td-file` Padding + Font | `padding: 3px 6px; font-size: 12.5px` (styles.css 745-749) | `padding: 2px 6px; font-size: 11.5px` (app.css 1991-1998) | Files dichter gestapelt als Vorlage. |
| B15 | PlanPane Bar-Höhe | 4px (styles.css 982) | 8px `td-usage-bar-track` (app.css 1069) | Doppelt so dick wie spec. |
| B16 | PlanPane `td-plan-list` Gap+Padding | `gap: 14px; padding: 6px 18px 14px 18px` (styles.css 962-969) | `gap: 8px; padding: 12px 14px` (app.css 1000-1007) | Bars dichter gestapelt + weniger Außenabstand. |
| B17 | UsageBar — Card vs. Zeile | Vorlage rendert reine Zeile mit Label + Bar (kein Border, kein Card-Background) (styles.css 970-993) | Impl rendert jede Bar als Card mit `padding: 6px 8px; background: var(--td-bg-3); border: 1px solid var(--td-line); border-radius: 2px` (app.css 1009-1024) | Card-Stil ist visuell schwerer als spec. Zeile/Bar-Reihe wirkt eleganter. **Variant nötig**, weil das eine Verhaltensänderung ist (Click-Target wechselt von Card auf Bar). |
| B18 | NotesPanel — Empty-State | inline `color: var(--td-text-mute); padding: 10px; fontSize: 12` (components.jsx 313) | eigene `.td-notes-empty`-Klasse mit `font-style: italic` (app.css 1907) | Italic ist Drift. |
| B19 | `.td-list-item.legacy` Italic | nicht in Vorlage definiert | `font-style: italic; opacity: 0.7` (app.css 293-296) | Sprint-2/3-Legacy-Bucket-Hinweis — Spec-Erweiterung. Bewusst ✓. |
| B20 | KeyboardHints `<kbd>` Font-Size | 10.5px (styles.css 528) | 10px (app.css 2792-2800) | minor. |

---

## C) Spec-Erweiterungen (🔵) — Vorlage hat mehr, Impl bewusst Phase 2/5+

| # | Komponente | Vorlage-Element | Impl-Status | Empfehlung |
|---|---|---|---|---|
| C1 | Action-Bar — `td-ctx`-Kontext-Bar | Inline-Bar „ctx [████░░] 80k/200k" zwischen Pillen und Status (components.jsx 183-189) | nicht implementiert | PlanPane übernimmt Per-Session-Kontext über die untere Zeile. Doppelte Anzeige wäre Lärm. **Phase 2** wenn die Action-Bar als „Glance" der ctx-Auslastung gewünscht wird. |
| C2 | Toast-Komponente | `.td-toast` für „Session gestartet"-Hinweise etc. (styles.css 1105-1120, app.jsx flashToast) | nicht implementiert — Statusmeldungen kommen via Inline-Text/Console | Stille UX ist im MVP ok. **Phase 2** wenn häufige Status-Hinweise gewünscht werden. |
| C3 | `.td-file.selected`-State | aktiver File-Eintrag im FileBrowser hat `selected`-Klasse (styles.css 753) | nicht implementiert — nur „aktiver Tab im EditorPane" als Indikator | Doppelt: aktiver Tab + selected-File wäre redundant. Phase-2 wenn die schmale Spalte 4 mehrdeutig wirkt. |
| C4 | StatsPane — Range-Toggle „Alle/30d/7d" | rechte Range-Buttons (components.jsx 330-334) | nicht implementiert | StatsPane ist Skeleton, Phase-2-Heatmap kommt mit den Range-Buttons. |
| C5 | TitleBar — System-Status-Slot rechts | „Terminal · P90 192h" (app.jsx 276-279) | nicht implementiert | Geringer Daily-Driver-Mehrwert. **Phase 2 oder verwerfen**. |
| C6 | FilesPanel — Filter-Placeholder-Hinweis | „Dateien filtern… (?Text zur Inhaltssuche)" (components.jsx 254) | „Dateien filtern…" nur | Inhaltssuche ist Phase-2-Feature → Hinweis irreführend. **Erst mit Inhaltssuche zusammen anpassen**. |

---

## D) Spec-Klärungen (⚪) — Naming-Drift oder widersprüchliche Vorlage

| # | Komponente | Soll | Ist | Diskussion |
|---|---|---|---|---|
| D1 | App-Grid-Naming | `.td-main` (styles.css 122) | `.td-app-main` (app.css 92) | Naming-Drift, funktional gleich. Sprint-1 hat eigene Klassen erfunden, bevor das Design-Handoff übernommen wurde. **Sprint 9: angleichen oder Naming als „TakumiDeck-Eigenheit" festschreiben?** |
| D2 | Right-Stack-Naming | `.td-col-right-stack` (styles.css 176) | `.td-right-stack` (app.css 162) | analog D1. |
| D3 | StatsPane — Klassen-Naming | `td-dash-pane / td-dash-tabs / td-stat / td-ueb` (styles.css 808-883) | `td-stats-pane / td-stats-toggle / td-stats-card / td-stats-grid` (app.css 1115-1191) | Funktional analog. Architektur 6.4 hat keine fixen Klassennamen. Drift toleriert. |
| D4 | NewSessionModal — Form-Klassen | `td-field / td-radio-row / td-radio` (components.jsx 437-454, styles.css 1064-1075) | `td-form-row / td-form-pills / td-pill` | Naming-Drift, funktional gleich. Sprint-3-Modal-Klassen wurden vor Übernahme des Design-Handoffs erfunden. Sprint-6 hat dann die Sidebar-Klassen 1:1 übernommen — Inkonsistenz im Codebase. |
| D5 | Settings-Modal — Tab-Bar-Stil | 2-Spalten-Layout mit Sidebar (links) + Body (rechts), Sidebar nutzt `td-list-item`-Klassen (app.jsx 422-431) | horizontale `td-settings-tab`-Bar mit `border-bottom: 2px` (app.css 2812-2841) | Komplett andere Hierarchie. Vorlage ist „klassisches Preferences-Layout", Impl ist Tab-Bar. Beides gültig — **welche Variante ist das verbindliche Spec?** Frage an User. |
| D6 | `.td-list-item:hover` Background-Change | `.td-list-item:hover { background: var(--td-bg-2); border-color: var(--td-line); }` (styles.css 254-257) | identisch (app.css 282-285) | **Vorlage und Impl widersprechen hier beide der Architektur 6.0.3 („KEIN Background-Change").** Das ist eine Spec-Inkonsistenz: Sidebar-Items DOCH bg-Change, Action-Buttons OHNE bg-Change. Architektur-Regel scheint sich nur auf Buttons/Pills zu beziehen, nicht auf Listen-Einträge — sollte aber explizit gemacht werden. **Klärung: Hover-Pattern in Architektur 6.0.3 spezifizieren auf „Buttons + Pills"** statt „alle interaktiven Elemente". |

---

## Zusammenfassung & Empfehlung

**Kritische Punkte (A1–A5, 5 Findings):** sollten in Sprint 9 angegangen werden. A1 (Tab-Optik) ist der größte visuelle Treffer und braucht Variants (Window-Frame-Refactor vs. Pillen-Tab-Bestätigung). A2 (KeyboardHints-Hierarchie) ist ein Layout-Bug. A3/A4/A5 (Display-Headline-Größen) sind 3 koordinierte Token-Mappings — gemeinsam fixen, weil sie zusammen das „Display-Font wird zu wenig genutzt"-Bild reparieren.

**Kosmetische Drifts (B1–B20, 20 Findings):** der Großteil sind 1- bis 2-Wert-CSS-Fixes, kein Variants-Pflicht. Empfehlung: B1–B14 in Sprint 9 als Sammel-Pass durchziehen; B15–B17 nur, wenn der Aufwand für die UsageBar-Refaktor (Card→Zeile) kommit-bar ist (B17 ist Variant-Pflicht — neue Click-Target-Logik).

**Spec-Erweiterungen (C1–C6, 6 Findings):** alle in Phase-2 oder darüber. Keine Aktion in Sprint 9.

**Spec-Klärungen (D1–D6, 6 Findings):** D5 (Settings-Modal-Layout) und D6 (Hover-Pattern-Spec) brauchen User-Entscheidung, bevor sie in Sprint 9 oder später adressiert werden. D1–D4 sind Naming-Drifts ohne Funktionsverlust — Phase-2 oder „akzeptiert".

**Vorschlag für Sprint-9-Scope:**

1. **Pflicht:** A1 (mit Variants), A2, A3, A4, A5.
2. **Easy-Wins:** B1, B2, B3, B4, B6, B7, B12 (alle 1-Wert-CSS-Fixes).
3. **Optional:** B10, B11, B13, B14, B15, B16, B18, B20 (weitere CSS-Drifts, niedrigster Aufwand).
4. **Mit User klären:** B8 (Modal-Wide 820px), B17 (UsageBar Card→Zeile), D5 (Settings-Modal-Layout), D6 (Hover-Pattern-Architektur-Update).
5. **In PHASE2.md übernehmen:** B5, B9, C1–C6, D1–D4.

**Variants-Pflicht (nicht-trivialer Scope):**
- A1 (Tab-Optik) — Window-Frame-Refactor vs. Pillen-Tab-Bestätigung.
- B17 (UsageBar Card→Zeile) — Verhaltensänderung beim Click-Target.
- D5 (Settings-Modal-Layout) — User-Entscheidung über die verbindliche Hierarchie.

**Rein kosmetische Fixes** (alle anderen) brauchen keine Variants — Token-Werte oder Klassen-Anpassung.

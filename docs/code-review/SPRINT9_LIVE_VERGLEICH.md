# Sprint 9 — Live-Vergleich nach A/B/C/D-Fixes

**Datum:** 2026-05-10
**Quelle:** Screenshot der laufenden App (`electron_Do767SAmOa.png`) gegen
`docs/design/claude-export/prototype.html` + `components.jsx` + `app.jsx`.
**Methode:** Pixel-Pass durch jede sichtbare Sektion. Bewusste Auslassungen
aus der ersten Findings-Liste (`SPRINT9_UI_FINDINGS.md`) sind ausgeblendet,
hier nur **neue oder noch nicht adressierte Drifts**.

## Legende

| Symbol | Kategorie | Bedeutung |
|---|---|---|
| 🔴 | kritisch | Bug oder Fehl-Hierarchie — fixen in dieser Iteration |
| 🟡 | kosmetisch | Optik-Drift ohne Workflow-Schaden |
| 🔵 | Spec-Erweiterung | Vorlage hat das Feature, MVP-Auslassung — Phase 2 |
| ⚪ | Spec-Klärung | Vorlage und Impl machen es bewusst anders, Frage an User |
| ⚡ | bewusste Abweichung | Architektur dokumentiert |

## Was passt (Sanity-Check)

| Bereich | Befund |
|---|---|
| Sidebar-Headlines | 22 px Display-Font ✓ (Sprint 9 A4) |
| TabBar Window-Frame-Tabs | sitzt sauber, Status-Dot in der Pille ✓ |
| Action-Bar `ctx`-Slot | live verkabelt, Daten-Pull funktioniert ✓ (C1) |
| StatsPane Range-Pills | „Alle/30d/7d" rechts, korrekt gestyled ✓ (C4) |
| TitleBar System-Status-Slot | „Terminal · P90 192 h" rechts vor Icons ✓ (C5) |
| FilesPanel-Caption „DATEIEN" | sichtbar ✓ (B12) |
| PlanPane „Plannutzung" | 28 px Display-Headline ✓ (A5) |
| UsageBar als Zeile | kein Card-Border mehr ✓ (B17) |
| Schnellzugriff-Pills | unter dem Editor sichtbar ✓ |

## Neue Findings

### 🔴 Kritisch

| # | Komponente | Beobachtung | Vorlage | Vorschlag |
|---|---|---|---|---|
| L1 | Sidebar — Aktive-Sessions-Liste | Beide Tabs (`test6`, `test2`) tragen den Active-Border (accent-line). Es kann nur **einer** als „aktiv im Tab-Container" gelten. | Vorlage hebt nur die `activeId === s.id`-Session hervor (components.jsx 60-63). | LeftSidebar prüfen: hängt der `active`-Klassen-Toggle korrekt am `useSessionStore.activeId`, oder wird hier `s.status === 'running'` als „active" interpretiert? Wenn ja, falsche Bedingung. |
| L2 | NotesPanel | Im Screenshot ist nur der Placeholder-Text sichtbar, kein `textarea`. Bei aktiver Session sollte das `textarea` rendern. | Vorlage rendert immer das `textarea` bei session !== null. | NotesPanel.tsx prüfen: `tab !== null`-Bedingung zieht aus `useSessionStore.tabs.find(...)`. Wenn der Tab beim Start nicht in `tabs` ist (Race), bleibt der Empty-State. Eventuell mit `activeId`-Watch nachladen. |

### 🟡 Kosmetisch

| # | Komponente | Beobachtung | Vorlage | Vorschlag |
|---|---|---|---|---|
| L3 | Editor-Toolbar | Pills „Editor" / „Preview" ohne Glyph davor. | `▤ Editor` und `⎘ Preview` mit Box-Drawing-Symbolen (components.jsx 654-655). | Glyphen ergänzen — 1-Wert-Fix in MarkdownEditor.tsx. |
| L4 | Action-Bar — `ctx`-Slot bei leerem State | Bei 0 Tokens zeigt die Bar einen leeren Track — wirkt unfertig. | Vorlage zeigt bei realer Session immer einen Fill-Wert. | Bei `session === null` ODER `tokens.total === 0`: Track halb-transparent rendern (`opacity: 0.5` auf `td-ctx-bar`), oder Label „—" prominenter. Klein, kosmetisch. |
| L5 | PlanPane-Bars — Wertformat | „277.250.657 Tokens" / „1.659.187.205 Tokens" — sehr breite Zahlen, die das Spalten-Layout pressen. | Vorlage nutzt `fmtNum`: `277.2 M` / `1.6 G`. | Werte durch `fmtNum`-ähnlichen Helper laufen lassen (k/M/G), wir haben den Helper bereits in `TabContainer.tsx fmtTokens`. Extrahieren in shared util. |
| L6 | Editor-Toolbar — Save vs. Status | „Save"-Button + „ungespeichert"-Indikator klar getrennt. Vorlage rendert Plain-Status-Text. | Vorlage: `YAML ✓ valid · CodeMirror 6 · Ctrl+S` (components.jsx 657). | TakumiDeck-Variante ist actionable — UX-Mehrwert. **⚪ Spec-Klärung:** Soll der Save-Button bleiben (klares CTA) oder zur Vorlage zurück (informativer Status)? |
| L7 | Schnellzugriff-Pills-Reihe | Sehr lange Reihe (15+ Pills) unter dem Editor — bricht über mehrere Zeilen. Vorlage hat keine Quick-Access-Pills (eigene Sprint-7-Erweiterung). | Vorlage zeigt nur die Tab-Bar oben. | Pills auf max-N (z.B. 8) limitieren mit „…"-Overflow-Pille, die einen Picker öffnet. Phase-2-Slot — wir haben den Slot, der UX-Schmerz ist nur bei stark gefüllten Projekten. |

### 🔵 Spec-Erweiterungen — Phase 2

| # | Komponente | Vorlage hat | Impl-Status | Empfehlung |
|---|---|---|---|---|
| L8 | PlanPane-Bars — Reset-Zeit | `<span className="right"><b>{p.pct}%</b>{p.reset && <> · {p.reset}</>}</span>` — zeigt z.B. „in 4 h 30 min" pro Bar (components.jsx 408). | Backend liefert keine Reset-Zeiten. | Phase 2: Reset-Zeit-Berechnung in `usage:window` ergänzen, UI-Slot hinzu. |
| L9 | Welcome-Box `td-term-welcome` | Akzent-line-umrandete Box mit Mascot 56×56, „Claude Code v2.1.133", „Sonnet 4.6 · TanaLib", `~\Desktop\TanaLib`-Hint (components.jsx 132-144). | xterm rendert claude-Code's eigenes Welcome stattdessen. | ⚡ bewusst — claude-Code rendert sein Welcome selbst. Doppel-Render wäre Lärm. **Aber:** Vorlage-Welcome ist visuell schöner (Mascot-Frame). Wenn das Phase 2 wichtig wird, könnte ein TakumiDeck-Welcome-Banner **vor** dem PTY-Spawn als „Header" über dem xterm sitzen. |
| L10 | Eingabe-Zeile `td-term-input-row` | HTML-`<input>`-Element unter dem xterm mit `›`-prompt-glyph + „? for shortcuts"-Hint (components.jsx 154-171). | xterm.js handelt Eingabe direkt. | ⚡ bewusst — xterm-Native-Input ist die einzige sinnvolle Variante. Vorlage zeigt das, weil prototype.html keine echte PTY hat und sich als „Mock" rendern lässt. |
| L11 | PlanPane → Detail-Pfeil-Button | `<button className="arrow">→</button>` rechts im Header (components.jsx 399). | UsageDetailModal öffnet pro UsageBar-Klick statt global. | Bekannt als B5 — Phase 2. |

### ⚪ Spec-Klärungen

| # | Frage | Optionen |
|---|---|---|
| L12 | TitleBar-Right-Slot statisch | Aktuell „Terminal · P90 192 h" hartcoded. Phase 2: dynamisch (z.B. „Markdown-Editor" wenn Mid-Pane wechselt — aber Mid-Pane wechselt aktuell nicht im MVP). | Lassen wie es ist, oder schon jetzt Logik fürs Mid-Pane einbauen (überflüssig im MVP, weil keine Mid-Pane-Variants existieren). |
| L13 | Multi-Aktive-Sessions in der Sidebar | Im Screenshot sind beide Tabs als Active gestylt — wahrscheinlich der `active`-Border auf jedes Item, das den status `running` hat statt nur auf den `useSessionStore.activeId`. | Bug oder Feature? Wenn Feature: gewollt, dass die Sidebar zeigt, welche Sessions laufen, nicht welche im Tab fokussiert ist. Vorlage zeigt nur eine als active. |

---

## Empfehlung für die nächste Iteration

**Direkt fixen (🔴):**
- L1 Sidebar-Active-State korrekt nur auf `activeId` binden — kurzer Bug-Fix in `LeftSidebar.tsx`.
- L2 NotesPanel-Empty-State-Bedingung prüfen — evtl. tab-Lookup-Race oder Race mit `activeId`.

**Easy-Wins (🟡):**
- L3 Editor/Preview-Glyphen ergänzen.
- L5 PlanPane-Werte mit `fmtTokens` formatieren (shared util extrahieren).
- L4 ctx-Slot bei leerem State dezenter rendern.

**User-Klärung (⚪):**
- L6 Save-Button vs. Status-Text — UX-Entscheidung.
- L13 Multi-Active-Highlight in der Sidebar — Feature oder Bug?

**Phase 2 (🔵):**
- L8 Reset-Zeit-Hinweis (braucht Backend).
- L11 PlanPane-Detail-Pfeil-Button (bekannt als B5).
- L7 Schnellzugriff-Overflow-Picker.

**Nicht fixen (⚡):**
- L9, L10 — Welcome-Box und Eingabe-Zeile sind bewusste Auslassungen, weil claude-Code/xterm.js die Slots selbst füllen.

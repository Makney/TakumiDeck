# Roadmap Phase 4 – Experimentelles und Gray-Area

**Voraussetzung:** Phase 3 läuft.

**Ziel:** Sammelort für Features, die technisch attraktiv, aber durch externe Faktoren (Anbieter-TOS, Policy, Lizenz) riskant sind. Diese Phase hat **keinen** Versionsplan und keinen festen Trigger — Features werden hier nur dann gezogen, wenn die externen Faktoren sich ändern (z.B. eine Anbieter-Policy lockert sich) oder der Nutzer das Risiko explizit tragen will.

**Milestone:** offen — möglicherweise nie.

---

## Bereich: Quota-Awareness mit erweiterten Anthropic-Daten

### Feature: HTTP-Proxy für Anthropic-Rate-Limit-Header (Opt-In, auf eigene Gefahr)

Ergänzt das in Phase 2/3 umgesetzte Statusline-basierte Quota-Auslesen (5h, 7d) um Felder, die über die offizielle Statusline-API **nicht** verfügbar sind:

- `overage` — der bezahlbare Burst-Pool, der greift, wenn das 7d-Fenster erschöpft ist
- `bottleneck` — welches Fenster aktuell limitierend ist (zwar als `max(5h, 7d)` herleitbar, aber autoritativ aus den Headern)
- Pro-Request-Token-Log mit den dazugehörigen Header-Werten zum Zeitpunkt der Response, als Grundlage für echte Kostenprognose statt nur Stand-jetzt-Anzeige

**Mechanismus:** Ein lokaler Loopback-HTTP-Server im TakumiDeck-Main-Prozess fungiert als transparenter Proxy zwischen den gespawnten Claude-Code-PTYs und `api.anthropic.com`. Die Umlenkung erfolgt über `ANTHROPIC_BASE_URL` in der PTY-Child-Env. Der Proxy reicht alle Requests unverändert weiter und liest nur die Rate-Limit-Header aus den Responses in die TakumiDeck-DB.

---

> ⚠️ **TOS-Vorbehalt — Risiko liegt vollständig beim Nutzer**
>
> Stand 2026-05-19 ist die Anthropic-Position zu diesem Mechanismus **widersprüchlich** dokumentiert:
>
> - Der Autor des Referenz-Tools `claude-quota-proxy` (Reddit-User Inertia-UK) hat den Anthropic-Support kontaktiert und die Antwort erhalten, dass passives Mitlesen des Traffics über `ANTHROPIC_BASE_URL` zulässig sei.
> - Ein anderer Entwickler (Reddit-User Quirky_Category5725, Maintainer der Kitty-Bridge) hat denselben Support-Kanal mit einer anderen Formulierung kontaktiert und die Antwort erhalten, dass „routing requests through Max plan credentials on behalf of third-party tools — isn't permitted." Diese Formulierung passt auf TakumiDeck eins zu eins, da TakumiDeck genau dieses Pattern darstellt.
> - Der Autor des Original-Tools hat seinen eigenen Post daraufhin mit der Warnung versehen: *„proceed with extreme caution at your own risk."*
>
> **Konsequenz für TakumiDeck, falls dieses Feature je umgesetzt wird:**
>
> 1. **Niemals automatisch aktiv.** Explizites Opt-In in den Settings, default off, mit einem Bestätigungsdialog beim ersten Aktivieren, der das TOS-Risiko in voller Länge zeigt.
> 2. **Keine Haftung der TakumiDeck-Maintainer** für Anthropic-Account-Sperrungen, die aus dem Einsatz dieses Features resultieren. Dieser Haftungsausschluss steht im Aktivierungs-Dialog und in der Release-Doku des Features.
> 3. Solange das Anthropic-TOS in dieser Frage nicht eindeutig (zugunsten der Erlaubnis) geklärt ist, bleibt das Feature in Phase 4 geparkt und wird **nicht** umgesetzt.

---

**Trigger:** Eines der folgenden Ereignisse:

- Anthropic veröffentlicht eine eindeutige öffentliche Klarstellung, dass passives Proxy-Mitlesen über `ANTHROPIC_BASE_URL` für Subscription-Tools explizit erlaubt ist.
- Anthropic stellt die fehlenden Felder (`overage`, Pro-Request-Token-Log) über die offizielle Statusline-API oder einen anderen dokumentierten Hook bereit — dann erübrigt sich die Proxy-Variante zugunsten des dokumentierten Kanals.
- Der Nutzer entscheidet bewusst, das Risiko zu tragen und das Feature trotzdem als Opt-In zu erhalten.

**Voraussetzung:** Statusline-basiertes Quota-Auslesen (siehe Phase 2/3) läuft stabil. Das Proxy-Feature würde nur die fehlenden Felder ergänzen, nicht den Hauptkanal ersetzen — der Statusline-Pfad bleibt die dokumentierte Wahrheit.

**Referenzen für die Recherche:**

- Reddit-Thread `r/ClaudeAI/comments/1t9ayg8` — Original-Post + Support-Widerspruch in den Comments
- GitHub: `InertiaUK/claude-quota-proxy` — Referenz-Implementierung (MIT-Lizenz)
- Anthropic-Doku `code.claude.com/docs/en/statusline` — der heute dokumentierte Kanal mit `rate_limits.five_hour` und `rate_limits.seven_day`

---

## Allgemeine Aufnahme-Kriterien für Phase 4

Ein Feature darf nur dann in Phase 4 stehen, wenn alle drei Punkte zutreffen:

- Es ist technisch sauber umsetzbar.
- Es liegt aktuell in einem Anbieter-/Lizenz-/Policy-Graubereich.
- Es gibt einen klaren Trigger, der den Graubereich auflösen könnte.

Ohne Trigger gehört das Feature in „Was NICHT geplant ist" in [ROADMAP.md](./ROADMAP.md), nicht hierher.

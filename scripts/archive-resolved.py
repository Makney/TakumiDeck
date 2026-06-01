"""Verschiebt behobene Code-Review-Befunde aus OFFEN_<BEREICH>.md ins Archiv.

Konvention (analog TanaLib): Ein erledigter Befund bekommt im OFFEN-Dokument
am Ende seines `###`-Eintrags eine Trailer-Zeile

    **Behoben:** 2026-06-01 · Variante B · <kurze Aufloesungs-Notiz>

Dieses Skript scannt alle `docs/code-review/OFFEN_*.md`, schneidet jeden
`###`-Eintrag mit einer solchen Zeile heraus und haengt ihn verbatim ans
zugehoerige `docs/code-review/archiv/ARCHIV_<BEREICH>.md` an (Archiv wird bei
Bedarf neu angelegt). In der OFFEN-Datei bleiben nur die offenen Punkte stehen.

Default ist ein Trockenlauf (nur Report). Erst `--apply` schreibt Dateien.

Nutzung:
    py scripts/archive-resolved.py                 # Trockenlauf ueber alle Bereiche
    py scripts/archive-resolved.py --apply          # tatsaechlich verschieben
    py scripts/archive-resolved.py --apply IPC DB    # nur diese Bereiche
    py scripts/archive-resolved.py --date 2026-06-01 # Section-Datum ueberschreiben
"""

import argparse
import datetime
import re
import sys
from pathlib import Path

# Bereiche, die kein echtes Archiv-Ziel haben (reine Vorlage) -> nie verschieben.
SKIP_AREAS = {"TEMPLATE"}

# Fallback-Titel fuer neu angelegte Archive (sonst wird das AREA-Token genommen).
AREA_TITLES = {
    "STORES": "Renderer-Stores (Zustand)",
    "PRELOAD": "Preload-Bridge",
    "SHARED": "Shared-Layer",
}

# Erkennt eine ATX-Ueberschrift und liefert ihr Level (Anzahl der `#`).
HEADING_RE = re.compile(r"^(#{1,6})\s+\S")
# Trailer-Marker, der einen Eintrag als behoben kennzeichnet. Greift in beiden
# Eintrags-Formaten: als nackter Absatz (`**Behoben:**`, TanaLib-Stil) und als
# Listenpunkt (`- **Behoben:**`, Bullet-Stil der Renderer-Reviews). Doppelpunkt
# optional.
MARKER_RE = re.compile(r"^(?:[-*]\s+)?\*\*Behoben:?\*\*")


class Block:
    """Ein Heading-Abschnitt: die Ueberschriftszeile plus ihr Body bis zur
    naechsten Ueberschrift. `level == 0` ist die Praeambel vor der ersten
    Ueberschrift."""

    def __init__(self, level, lines):
        self.level = level
        self.lines = lines  # inkl. Heading-Zeile (ausser bei der Praeambel)

    @property
    def text(self):
        return "\n".join(self.lines)

    def is_resolved_entry(self):
        """True, wenn dies ein `###`-Eintrag mit **Behoben:**-Trailer ist."""
        if self.level != 3:
            return False
        return any(MARKER_RE.match(ln.strip()) for ln in self.lines)

    def heading_title(self):
        if not self.lines:
            return ""
        return self.lines[0].lstrip("#").strip()


def split_blocks(text):
    """Zerlegt einen Markdown-Text anhand der Ueberschriften in Bloecke."""
    blocks = []
    current = None
    for line in text.split("\n"):
        m = HEADING_RE.match(line)
        if m:
            if current is not None:
                blocks.append(current)
            current = Block(len(m.group(1)), [line])
        else:
            if current is None:
                current = Block(0, [line])  # Praeambel
            current.lines.append(line)
    if current is not None:
        blocks.append(current)
    return blocks


def normalize(text):
    """Raeumt nach dem Entfernen von Bloecken auf: kein doppelter Leerraum,
    keine doppelten `---`-Linien, kein verwaister Trenner am Dateiende,
    genau ein abschliessender Zeilenumbruch (siehe MARKDOWN_RULES.md)."""
    lines = [ln.rstrip() for ln in text.split("\n")]

    # Mehrfach-Leerzeilen auf eine reduzieren.
    collapsed = []
    for ln in lines:
        if ln == "" and collapsed and collapsed[-1] == "":
            continue
        collapsed.append(ln)

    # Aufeinanderfolgende `---` (auch ueber eine Leerzeile hinweg) entdoppeln.
    out = []
    last_nonblank = None
    for ln in collapsed:
        if ln == "---" and last_nonblank == "---":
            continue
        out.append(ln)
        if ln != "":
            last_nonblank = ln

    # Leerzeile nach jedem `---` erzwingen, wenn direkt ein nicht-leerer Inhalt
    # folgt (MARKDOWN_RULES.md §9: Leerzeile vor UND nach dem Trenner). Greift
    # beim erhaltenen Sektions-Trenner, der sonst an der `##`-Folgezeile klebt.
    spaced = []
    for idx, ln in enumerate(out):
        spaced.append(ln)
        if ln == "---" and idx + 1 < len(out) and out[idx + 1] != "":
            spaced.append("")
    out = spaced

    # Verwaisten Trenner / Leerzeilen am Ende abschneiden, dann ein \n anhaengen.
    while out and out[-1] in ("", "---"):
        out.pop()
    return "\n".join(out) + "\n"


def archive_header(area):
    """Standard-Kopf fuer ein neu anzulegendes Archiv."""
    title = AREA_TITLES.get(area, area)
    return (
        f"# Code-Review · {title} · Archiv (behobene Eintraege)\n\n"
        f"Archivierte Befunde aus [`OFFEN_{area}.md`](../OFFEN_{area}.md) — "
        f"Status **Behoben** oder **Gegenstandslos**.\n"
    )


def entry_to_archive_text(block):
    """Eintrag verbatim, aber ohne abschliessende Leerzeilen/Trenner."""
    lines = list(block.lines)
    while lines and lines[-1].rstrip() in ("", "---"):
        lines.pop()
    return "\n".join(lines)


def process_offen(offen_path, archive_dir, run_date, apply):
    """Verarbeitet eine OFFEN-Datei. Liefert (area, moved_titles)."""
    area = offen_path.stem[len("OFFEN_"):]
    text = offen_path.read_text(encoding="utf-8")
    blocks = split_blocks(text)

    moved = [b for b in blocks if b.is_resolved_entry()]
    if not moved:
        return area, []

    # Neue OFFEN-Datei ohne die verschobenen Eintraege. War ein entfernter
    # Eintrag per `---` vom Folge-Block getrennt (letzter Eintrag vor einer
    # `##`-Sektion), bleibt der Trenner erhalten — sonst klebt der naechste
    # Abschnitt an. normalize() entdoppelt etwaige Doppel-Trenner.
    parts = []
    for i, b in enumerate(blocks):
        if b.is_resolved_entry():
            nonblank = [ln for ln in b.lines if ln.strip() != ""]
            ends_with_rule = bool(nonblank) and nonblank[-1].strip() == "---"
            if ends_with_rule and i < len(blocks) - 1:
                parts.append("---")
            continue
        parts.append(b.text)
    new_offen = normalize("\n".join(parts))

    # Archiv-Anhang bauen.
    archive_path = archive_dir / f"ARCHIV_{area}.md"
    if archive_path.exists():
        archive_text = archive_path.read_text(encoding="utf-8").rstrip()
    else:
        archive_text = archive_header(area).rstrip()

    section = (
        f"## {run_date} — Per archive-resolved.py archiviert\n\n"
        f"Verschoben aus [`OFFEN_{area}.md`](../OFFEN_{area}.md). "
        f"Aufloesung steht je Eintrag in der **Behoben:**-Zeile.\n\n"
    )
    entries = "\n\n---\n\n".join(entry_to_archive_text(b) for b in moved)
    new_archive = archive_text + "\n\n---\n\n" + section + entries + "\n"

    if apply:
        offen_path.write_text(new_offen, encoding="utf-8")
        archive_path.write_text(new_archive, encoding="utf-8")

    return area, [b.heading_title() for b in moved]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("areas", nargs="*", help="Nur diese Bereiche (z.B. IPC DB). Default: alle.")
    parser.add_argument("--apply", action="store_true", help="Aenderungen schreiben (sonst Trockenlauf).")
    parser.add_argument("--date", default=datetime.date.today().isoformat(),
                        help="Datum der Archiv-Section (YYYY-MM-DD, Default: heute).")
    parser.add_argument("--root", default=None, help="Repo-Wurzel (Default: aus Skript-Pfad abgeleitet).")
    args = parser.parse_args(argv)

    root = Path(args.root) if args.root else Path(__file__).resolve().parent.parent
    review_dir = root / "docs" / "code-review"
    archive_dir = review_dir / "archiv"
    if not review_dir.is_dir():
        print(f"FEHLER: {review_dir} existiert nicht.", file=sys.stderr)
        return 2
    archive_dir.mkdir(exist_ok=True)

    wanted = {a.upper() for a in args.areas}
    offen_files = sorted(review_dir.glob("OFFEN_*.md"))

    total = 0
    for offen in offen_files:
        area = offen.stem[len("OFFEN_"):]
        if area in SKIP_AREAS:
            continue
        if wanted and area not in wanted:
            continue
        area, titles = process_offen(offen, archive_dir, args.date, args.apply)
        if titles:
            total += len(titles)
            verb = "verschoben" if args.apply else "wuerde verschieben"
            print(f"[{area}] {len(titles)} Eintrag/Eintraege {verb} -> archiv/ARCHIV_{area}.md")
            for t in titles:
                print(f"    · {t}")

    if total == 0:
        print("Keine als **Behoben:** markierten Eintraege gefunden.")
    elif not args.apply:
        print(f"\nTrockenlauf: {total} Eintrag/Eintraege betroffen. Mit --apply tatsaechlich verschieben.")
    else:
        print(f"\nFertig: {total} Eintrag/Eintraege verschoben.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

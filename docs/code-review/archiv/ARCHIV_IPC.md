# Code-Review · IPC-Handler · Archiv (behobene Einträge)

Archivierte Befunde aus [`OFFEN_IPC.md`](../OFFEN_IPC.md) — Status **Behoben** oder **Gegenstandslos**.

---

## Tooling-Hypothesen aus dem Fallow-Vor-Pass (verifiziert: bereits aufgelöst, Bereichs-Review 2026-05-12)

Die im Auftrag genannten Fallow-Hypothesen sind im Code bereits adressiert — dokumentarisch festgehalten, damit der nächste Review-Durchgang das nicht erneut nachzieht:

- `fs.ts:82-95` ↔ `fs.ts:155-167` (fs:read ↔ fs:write Project-Lookup + Anti-Traversal) → konsolidiert in `resolveValidatedProjectPath` (`src/main/ipc/fs.ts:192`). Inline-Kommentar verweist auf B-4/W-2.
- `pty.ts:132-146` ↔ `session.ts:154-164` (PtyManager-Spawn-Args) → die echte Duplikat-Stelle ist der Pre-Spawn-Check (Binary-Lookup + cwd-Existenz), nicht die Spawn-Args selbst. Konsolidiert in `src/main/pty/preSpawnCheck.ts`, beide Handler nutzen den Helper (W-1).
- Komplexitäts-Hotspots `session.ts:93` (Cyclo 11), `project.ts:64` (Cyclo 10), `app.ts:62` (Cyclo 8), `pty.ts:59` (Cyclo 8), `session.ts:62` (Cyclo 7): jede dieser Funktionen ist ein IPC-Handler, der eine echte Multi-Schritt-Orchestrierung (zod-Parse → DB-Lookup → State-Machine → Side-Effect → Result-Wrap) machen muss. Sender-Guard, zod-Parse und try/catch tragen pro Handler zwingend ~6 Branches bei. Der Pfad ist nicht produktiv aufteilbar, ohne den Lese-Fluss zu zersplittern — keine Refactoring-Aktion.

Ungenutzte Cross-Schemas aus Bereich 1 (`SessionUpdatePatchSchema`, `ClaudeMdOnDemandFileSchema`, `JsonlUsageSchema`, `SessionTypeSchema`, `SessionStatusSchema`): verifiziert — alle sind als interne Schema-Bestandteile in `src/shared/schemas.ts` referenziert (Composition aus dem Patch-Schema, dem OnDemand-Union-Member, dem JSONL-Outer-Schema bzw. den Filter-Listen). Keine Stelle, an der ein Handler ohne Validation gegen ein passendes Schema arbeitet.

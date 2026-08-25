# Übergabe — Chat-Modul fertigstellen und alles ausliefern

**Stand: 25. August 2026.** Dieses Dokument ist für eine neue, frische
Session gedacht, die diese Arbeit ohne den bisherigen Gesprächsverlauf
übernimmt. Lies es vollständig, bevor du irgendetwas anfässt — es enthält
alles, was du wissen musst, und macht an mehreren Stellen ausdrücklich, wo
du **anhalten und auf Bestätigung warten** sollst, statt einfach
weiterzumachen.

---

## 0. Worum es geht, in einem Satz

Ein vollständiges Dokumentenablage-Modul (Phasen 0–4) und ein zum Teil
gebautes Chat-Modul (Phase 7a) liegen fertig, aber **komplett
uncommitted** in diesem Arbeitsverzeichnis. Deine Aufgabe: den Chat um
drei im Mockup bereits abgestimmte, aber noch nicht gebaute Fähigkeiten
ergänzen, dann alles — Code **und** die beiden noch nie ausgeführten
SQL-Migrationen — tatsächlich in Betrieb nehmen.

---

## 1. Zuerst lesen, in dieser Reihenfolge

1. **`PLAN-DOCUMENTOS.md`** — der Gesamtplan für die Dokumentenablage.
   Abschnitt 9 (Phasen) zeigt, was von Phase 0–4 bereits fertig ist.
2. **`PLAN-CHAT.md`** — der Plan für das Chat-Modul. Abschnitt 7 (Phasen
   7a–7d) ist der Rahmen für das, was diese Übergabe abschließt.
3. **`SETUP-BACKEND.md`**, besonders **Abschnitt C** (Vercel/Deploy) und
   **Abschnitt E** (Dokumentenablage einrichten) — die Betriebsanleitung,
   die du später ausführst.
4. **`HANDOFF.md`** — allgemeine Konventionen des Projekts (Design-System,
   Sprache, technische Fallstricke). Insbesondere: **kein Regex mit
   Lookbehind** (bricht auf älterem iOS Safari das gesamte Bundle).

---

## 2. Ist-Zustand — geprüft, nicht vermutet

### 2.1 Git

```
Branch:  claude/admin-document-management-plan-9f0650
Remote:  origin = https://github.com/xife12/retoniosdeleden.git
Zustand: NICHTS ist committet. Alles unten ist unstaged/untracked.
```

Geänderte Dateien (bestehend, angepasst):
```
SETUP-BACKEND.md
src/pages/admin/index.astro
src/scripts/admin/dialog.ts
src/scripts/admin/main.ts
src/scripts/admin/router.ts
src/styles/admin/shell.css
```

Neue Dateien (komplettes Dokumenten- und Chat-Modul):
```
PLAN-CHAT.md
PLAN-DOCUMENTOS.md
src/scripts/admin/chat-store.ts
src/scripts/admin/chat-view.ts
src/scripts/admin/document-detail.ts
src/scripts/admin/documents-comments.ts
src/scripts/admin/documents-preview.ts
src/scripts/admin/documents-store.ts
src/scripts/admin/documents-tasks.ts
src/scripts/admin/documents-upload.ts
src/scripts/admin/documents-view.ts
src/scripts/admin/mention-input.ts
src/scripts/admin/mentions.ts
src/styles/admin/chat.css
src/styles/admin/document-detail.css
src/styles/admin/documents.css
supabase/migrations/002_roles.sql
supabase/migrations/003_documentos.sql
```

### 2.2 Was funktioniert bereits (geprüft: `npx tsc --noEmit` und
`npx astro build` liefen zum Zeitpunkt dieser Übergabe beide fehlerfrei)

- **Gesamte Dokumentenablage** (Ordner, Dokumente, Versionen, Vorschläge
  mit Annehmen/Ablehnen, Kommentare mit @-Erwähnungen, Aufgaben, Papierkorb,
  Rollenmodell) — siehe `PLAN-DOCUMENTOS.md`, Phasen 0–4, alle fertig.
- **Chat-Modul, Phase 7a**: Gesprächsliste (Dokumente als Gesprächspartner,
  sortiert nach letzter Aktivität, Ungelesen-Zahl), Konversationsansicht
  mit Sprechblasen, @-Menü beim Schreiben, schwebendes Chat-Icon in der
  gesamten Admin-Hülle mit Ungelesen-Badge, Route `#/documentos/chat`.
- Alle Datenzugriffs-Funktionen, die du gleich brauchst, existieren
  bereits und sind fertig getestet — **nichts davon neu bauen**:
  - `documents-store.ts`: `acceptProposal(id)`, `rejectProposal(id, reason)`,
    `listVersions(documentId)`, `withSession()`, `fail()`, `currentProfile()`,
    `listProfiles()`
  - `documents-preview.ts`: `getOriginalUrl(version)`,
    `getThumbnailUrl(version)`, `previewKindFor(version)`,
    `shouldAutoload(version)` — nimmt **jede beliebige** Version, nicht nur
    die aktuelle
  - `documents-tasks.ts`: `listTasksForDocument(documentId)`,
    `createTask(input)`, `createTaskFromComment(comment, title, assigneeId?, dueDate?)`,
    `markTaskDone(taskId)`, `reopenTask(taskId)`
  - `chat-store.ts`: `listChatThreads()`, `markRead(documentId)`
  - `mention-input.ts`: `attachMentionInput(textarea, menu, idPrefix, localCandidates?)`

### 2.3 Was NICHT existiert

- Die beiden Migrationen (`002_roles.sql`, `003_documentos.sql`) wurden
  **noch nie gegen das echte Supabase-Projekt ausgeführt**. Ohne sie
  funktioniert nichts von alledem in Produktion — die Tabellen gibt es
  dort schlicht nicht.
- Phase 7b (Echtzeit), 7c (eigenständige installierbare App unter `/chat`),
  7d (Push-Benachrichtigungen) aus `PLAN-CHAT.md` sind nicht gebaut.
- Die drei Chat-Erweiterungen aus Abschnitt 3 unten sind nicht gebaut.

---

## 3. Zu bauen: drei Chat-Erweiterungen (bereits mit dem Nutzer
abgestimmt, per Low-Fi-Mockup getestet und freigegeben)

**Wichtig:** Es gibt ein interaktives Mockup, das genau diese drei
Erweiterungen zeigt und vom Nutzer bereits freigegeben wurde:

**https://claude.ai/code/artifact/ac3981c0-114e-4536-b5de-33fd151740b5**

Öffne es (WebFetch oder Browser) und benutze es als verbindliche
UX-Referenz — Anordnung, Beschriftungen, welche Aktion wohin führt. Es ist
in reinem HTML/JS mit erfundenen Testdaten gebaut, **nicht** die
Zielarchitektur — die eigentliche Umsetzung greift auf die echten
Funktionen aus Abschnitt 2.2 zurück, nicht auf das, was im Mockup
clientseitig simuliert wird.

### 3.1 Angeheftete Vorschlagskarte im Gespräch

Gibt es zu dem gerade offenen Dokument eine offene Version mit
`state === 'proposal'` (`listVersions()` liefert sie mit), erscheint sie
**oben im Gesprächsfenster**, fest sichtbar (nicht Teil der scrollenden
Nachrichtenliste): wer, wann, Notiz, Knöpfe „Ver" / „Aceptar" / „Rechazar".
„Rechazar" klappt ein Pflichtfeld für den Grund auf (wie in
`document-detail.ts`s `buildProposalCard()` — dort ist die Referenz-
Umsetzung, kopier den Stil). Nutzt `acceptProposal()`/`rejectProposal()`
unverändert. Nach der Entscheidung: Gesprächsansicht neu laden.

### 3.2 Verlinkte Version direkt ansehen

Der Versions-Chip in einer Chat-Nachricht (aus `renderCommentBody()` in
`mentions.ts`, `onVersionClick`) navigiert aktuell zur ganzen Dokumentseite.
Neu: er öffnet eine **Vorschau genau dieser Version** (nicht zwingend die
aktuelle) — `getOriginalUrl(version)`/`getThumbnailUrl(version)` aus
`documents-preview.ts` unterstützen das bereits, du musst nur die passende
`VersionRow` zur angeklickten Chip-ID finden (`listVersions(documentId)`,
schon geladen für 3.1) und durchreichen.

**Web/Handy-Unterscheidung, mit dem Nutzer abgestimmt:**
- **Eigenständige Handy-App (sobald sie existiert, Phase 7c) oder generell
  bei ausreichender Bildschirmbreite innerhalb der App:** ein interner
  Bildschirmwechsel INNERHALB von `chat-view.ts` (Liste → Gespräch →
  Vorschau, mit „‹ Volver"), genau das Muster, das dort schon für
  Liste↔Gespräch existiert (kein Router-Wechsel, siehe die bestehende
  Umsetzung von `screen`-artigem internem Zustand — in `chat-view.ts`
  aktuell nur zwei Zustände, jetzt um einen dritten erweitern).
- **Eingebettet im schmalen Admin-Panel (aktuelle Situation, `/admin`
  Slide-over o.ä.):** Das Panel ist zu schmal für eine große Vorschau.
  Dort öffnet „Ansehen" stattdessen die signierte Original-Adresse in
  einem **neuen Browser-Tab** (`window.open(await getOriginalUrl(version))`),
  dieselbe Technik wie der bestehende Download-Knopf in
  `document-detail.ts`, nur zum Anzeigen statt Herunterladen.

Auch der neue, kompakte „aktuelle Datei"-Streifen im Gesprächskopf (siehe
Mockup, `.filestrip`) gehört hierher — Antippen löst dieselbe
Web/Handy-Unterscheidung aus.

### 3.3 Aufgabe erstellen, sichtbar im Chat

- **„+ Tarea" an jeder Nachricht** (wie „Convertir en tarea" in
  `document-detail.ts`): öffnet ein kleines Formular (Titel vorausgefüllt
  aus der Nachricht, optional Zuständige Person, optional Fälligkeit),
  ruft `createTaskFromComment()` auf.
- **Einklappbarer „Tareas"-Bereich im Gesprächskopf**: offene Aufgaben zu
  diesem Dokument (`listTasksForDocument()`), mit Zuständiger Person,
  Fälligkeit, „Marcar hecha" (`markTaskDone()`), plus „+ Nueva tarea" ohne
  Bezug zu einer bestimmten Nachricht (`createTask()`). Dasselbe
  Aufklapp-Muster wie „Tareas de esta carpeta" in `documents-view.ts`
  (`mountFolderDocuments()`) — dort ist der Stil-Vorbild.

### Nach dem Bauen

- `npx tsc --noEmit` und `npx astro build` müssen fehlerfrei bleiben.
- Live im Dev-Server testen (Browser-Vorschau), nicht nur typprüfen —
  UI-Änderungen ohne Blicktest waren in dieser Arbeit wiederholt die
  Quelle echter Fehler (siehe Abschnitt 6).
- Halte dich an die Konventionen aus `HANDOFF.md`: deutsche, erklärende
  Codekommentare (WARUM, nicht WAS), spanische Nutzertexte, kein Regex mit
  Lookbehind, keine neuen npm-Abhängigkeiten, Fehler über `toast.ts`
  melden statt roh.

---

## 4. Danach, falls gewünscht: Phase 7b/7c/7d

Nicht Teil dieser Übergabe als Pflicht, aber der nächste sinnvolle Schritt
laut `PLAN-CHAT.md` Abschnitt 7 — **frag nach, bevor du damit anfängst**,
das ist ein eigener, größerer Umfang:

- **7b Echtzeit**: `doc_comments` für Supabase Realtime freischalten
  (`alter publication supabase_realtime add table public.doc_comments;`
  als neue Migration `004_...sql`, plus die Einstellung im
  Dashboard unter *Database → Replication* bestätigen).
- **7c Eigenständige App**: `src/pages/chat.astro` (eigener, schlanker
  Seitenkopf, KEIN `Base.astro` — das würde das falsche Marketing-Manifest
  mitschleppen, siehe `PLAN-CHAT.md` Abschnitt 5.1), `public/chat.webmanifest`,
  minimaler `public/chat-sw.js`.
- **7d Push-Benachrichtigungen**: ausdrücklich zurückgestellt, deutlich
  mehr Aufwand (VAPID-Schlüssel, Edge Function, neue Tabelle) — nur falls
  ausdrücklich gewünscht.

---

## 5. Ausliefern — der eigentliche Auftrag

Halte dich an genau diese Reihenfolge. Nach jedem mit **⏸ STOPP** markierten
Schritt: kurz zusammenfassen, was passiert ist, und auf eine Bestätigung
warten, bevor der nächste (schwerer rückgängig zu machende) Schritt folgt.

### 5.1 Code-Stand sichern

```bash
npx tsc --noEmit && npx astro build
```
Beides muss fehlerfrei sein. Erst dann weiter.

### 5.2 ⏸ STOPP — Commit

`git status` zeigt den vollständigen, oben aufgelisteten Stand. Bespreche
mit der Person, ob alles in **einen** Commit soll oder sinnvoll aufgeteilt
wird (z. B. „Dokumentenablage" getrennt von „Chat-Modul"). Warte auf eine
klare Antwort, bevor du `git add`/`git commit` ausführst — das ist neue,
noch nie committete Arbeit, keine Routine-Änderung.

### 5.3 ⏸ STOPP — Pull Request

Branch pushen, PR gegen `main` öffnen (`gh pr create`, Repo ist
`xife12/retoniosdeleden`). Zeig den PR-Link und **warte auf die
Freigabe zum Mergen** — nicht selbstständig mergen.

### 5.4 ⏸ STOPP — SQL-Migrationen gegen das echte Supabase-Projekt

**Das ist der kritischste Schritt, weil er nicht ohne Weiteres rückgängig
zu machen ist.** Genaue Anleitung: `SETUP-BACKEND.md`, Abschnitt E.

1. Dashboard → **SQL Editor**: `supabase/migrations/002_roles.sql`
   einfügen, **Run**.
2. **Erst danach** `supabase/migrations/003_documentos.sql` — diese
   Reihenfolge ist keine Formsache, siehe die Begründung in
   `SETUP-BACKEND.md` Abschnitt E.1 (sonst wäre der bestehende Zugang für
   einen Moment aus dem eigenen Backend ausgesperrt).
3. Danach prüfen: `select id, display_name, role, is_active from public.profiles;`
   — der/die bereits bestehende Zugang/Zugänge sollte(n) jetzt mit Rolle
   `owner` auftauchen (die Migration vergibt das automatisch an alle
   vorher schon existierenden `auth.users`, damit niemand ausgesperrt
   wird). Rollen danach bei Bedarf anpassen (`SETUP-BACKEND.md`
   Abschnitt E.3).
4. Kontrollieren, dass der Bucket `documentos` **privat** ist
   (`public = false`) — `SETUP-BACKEND.md` Abschnitt E.4 erklärt, warum
   das nicht verhandelbar ist.

**Ob du das selbst ausführen kannst, hängt davon ab, ob dir Zugriff auf
das Supabase-Dashboard dieses Projekts gegeben wurde.** Falls nicht: die
beiden SQL-Dateien der Person zum manuellen Ausführen vorlegen, mit genau
dieser Reihenfolge und Begründung — nicht raten, nicht überspringen.

### 5.5 ⏸ STOPP — Merge und Deploy

Nach grünem Licht: PR mergen. Vercel ist per Git-Integration an `main`
gekoppelt (`SETUP-BACKEND.md` Abschnitt C) — ein Merge löst automatisch
einen neuen Build/Deploy aus, das ist **unabhängig** vom separaten
Deploy-Hook aus Abschnitt D (der feuert nur bei Talleres/Casas-Inhalt,
nicht bei Code-Änderungen). Kein zusätzlicher Schritt nötig, aber danach
im Vercel-Dashboard den Build-Status prüfen.

### 5.6 Danach: Rauchtest in Produktion

- `/admin` aufrufen, anmelden, prüfen: „Documentos"-Knopf da, Chat-Icon
  da, keine Konsolenfehler.
- Einen Ordner/ein Dokument anlegen, einen Kommentar schreiben, prüfen
  dass er im Chat auftaucht.
- Falls Personen außer der bestehenden hinzukommen sollen: siehe
  `SETUP-BACKEND.md` Abschnitt E.2.

---

## 6. Aus dieser Arbeit gelernt — damit es sich nicht wiederholt

- **CSS-`[hidden]` und eigene `display`-Regeln beißen sich.** Setzt eine
  eigene Klasse `display: grid`/`flex` o. ä. unconditional, schlägt das
  Autor-CSS das native `[hidden]{display:none}` der User-Agent-Stylesheet
  — unabhängig von der Spezifität. Für jedes Element, das per `hidden`
  ein-/ausgeblendet wird, IMMER eine explizite `.klasse[hidden]{display:none}`
  danebenstellen.
- **Flex-/Grid-Kinder mit `white-space:nowrap` + `text-overflow:ellipsis`
  brauchen `min-width:0`**, sonst berechnet der Browser die Mindestbreite
  aus dem ungekürzten Text und die Zeile läuft trotzdem über — die
  Ellipse wird nie sichtbar. Bei jeder neuen, potenziell überlaufenden
  Textzeile in einer Flex-/Grid-Reihe daran denken.
- **UI-Änderungen im laufenden Dev-Server testen, nicht nur `tsc`/`build`
  vertrauen** — beide genannten Fehler oben waren typsicher und bauten
  fehlerfrei, sind aber erst im echten Browser aufgefallen.

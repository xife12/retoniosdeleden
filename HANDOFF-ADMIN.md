# Handoff: Admin-Bereich (`/admin`)

An den nächsten Agenten: Dieses Dokument beschreibt die Architektur und den
Code des Backends unter `/admin`, mit dem eine einzelne, nicht-technische
Nutzerin (arbeitet oft am Handy) Talleres (Workshops) und Casas de Barro
(Lehmhäuser) pflegt. Ziel ist, dass du hier die Antwort findest, statt 25
Dateien einzeln öffnen zu müssen.

**Für Einrichtung/Deployment (Supabase-Projekt aufsetzen, Vercel-Umgebungs-
variablen, Deploy-Hook) lies [`SETUP-BACKEND.md`](SETUP-BACKEND.md).**
Dieses Dokument hier beschreibt den Code, nicht die Inbetriebnahme.

Stand: 2026-08-21. Alles unten ist auf `main` gemerged und live.

---

## 1. Überblick in einem Absatz

Astro-5-Site mit `output: 'static'` — es gibt keinen Server zur Laufzeit.
`/admin` ist eine einzelne statische Seite, deren gesamte Logik im Browser
läuft und **direkt** mit Supabase spricht (Postgres + Auth + Storage), über
den öffentlichen `anon`-Key. Sicherheit kommt ausschließlich über Row Level
Security in der Datenbank, nicht über ein Backend, das es nicht gibt. **Die
Policys fragen dabei nach der Person, nicht nach der Anmeldung**: maßgeblich
ist `public.is_admin()` gegen die Allowlist `public.admins`, nicht die Rolle
`authenticated` — siehe Fallstrick 13 und
[`PLAN-SICHERHEIT.md`](PLAN-SICHERHEIT.md). Jeder
Talleres/Casa-Eintrag hat einen **Arbeitsstand** (Autosave beim Tippen) und
einen **veröffentlichten Schnappschuss** (`published_payload`); die
öffentliche Website liest ausschließlich den Schnappschuss über zwei Views.
Veröffentlichen schreibt den Schnappschuss und löst über einen
Datenbank-Trigger + Vercel-Deploy-Hook einen neuen statischen Build aus.

---

## 2. Wo der Code liegt

```
src/pages/admin/index.astro   (63 Z.)   Huelle: Login-Anker, Kopfzeile,
                                         <div data-admin-view> als einziger
                                         Einhaengepunkt. Kein Markup fuer
                                         Liste/Editor -- das bauen die
                                         Ansichten zur Laufzeit.
src/scripts/admin/
  main.ts            (120 Z.)  Verdrahtet Login/Kopfzeile/Router mit den
                                Ansichten. Montage-Vertrag: jede Ansicht
                                liefert mountList(), mountEditor(el,id),
                                unmount().
  auth.ts            (300 Z.)  Supabase-Auth-Wrapper: initAuth, onAuth,
                                isSignedIn, hasValidSession, signIn,
                                verifyCode, reauthenticate, signOut,
                                mountLogin. Kennt den zweiten Faktor:
                                `signedIn` heisst "darf das Panel sehen"
                                (aal2 erbracht), nicht bloss "hat ein Token".
  mfa.ts             (175 Z.)  Zweiter Faktor, Datenseite: mfaState,
                                mfaRequired, enrollTotp, verifyFactor,
                                verifyLoginCode, removeFactor, codeInput.
                                Haengt bewusst an keinem Dialog -- auth.ts
                                und dialog.ts brauchen die Pruefung, ein
                                Import-Zyklus ueber die Oberflaeche waere
                                die Folge.
  mfa-dialog.ts      (215 Z.)  Zweiter Faktor, Oberflaeche: securityDialog()
                                (QR-Code, Schluessel zum Abtippen,
                                Bestaetigung, Entfernen). Erreichbar ueber
                                "Seguridad" in der Kopfzeile, eingehaengt
                                zur Laufzeit von main.ts.
  router.ts          (137 Z.)  History-Router. Route = {view:'talleres'}
                                | {view:'taller';id} | {view:'casas'}
                                | {view:'casa';id}. navigate/onRoute/
                                setLeaveGuard/start.
  store.ts           (165 Z.)  Generischer Datenzugriff fuer beide
                                Tabellen (createStore<T>('workshops'|
                                'casas')): list/create/update/remove/
                                setSortOrder/publish/discardChanges/
                                setStatus. Prueft vor jedem Schreiben die
                                Session, zeigt bei Ablauf reauthDialog()
                                und wiederholt den Aufruf einmal.
  dirty.ts           (176 Z.)  createAutoSaver({save,onState,delay}) --
                                Autosave-Debounce (1200ms Vorgabe),
                                Zustaende clean/dirty/saving/error.
  fields.ts          (250 Z.)  pairedField(): das gepaarte ES/EN-Feld,
                                Herzstueck gegen Sprach-Tabs. completeness()
                                fuer den Vollstaendigkeitszaehler.
  list-editor.ts     (183 Z.)  listEditor<T>(): wiederholbare Listen
                                (Programmschritte, Ausstattung) mit
                                Fokus auf neuer Zeile, Leerzustand,
                                Undo-Toast beim Entfernen.
  sortable.ts        (182 Z.)  Ziehen zum Sortieren (Pointer-Events +
                                Tastatur). fractionalOrder() = Mittelwert
                                der Nachbarn, ein UPDATE statt zwei.
  controls.ts        (314 Z.)  Einsprachige Bedienelemente: textField,
                                numberField, selectField, dateField,
                                switchRow, radioCards, controlRow.
  toast.ts           (135 Z.)  toast(msg,{tone,undo,duration}) --
                                Rueckmeldung mit Rueckgaengig-Aktion.
  dialog.ts          (280 Z.)  confirmDialog() ersetzt natives confirm(),
                                reauthDialog() fuer abgelaufene Sessions.
                                Echter Focus-Trap, Esc, Fokus-Rueckgabe.
  errors.ts          (216 Z.)  humanError(err) uebersetzt Supabase-/
                                PostgREST-Fehler in ruhige spanische
                                Saetze. isSessionCancelled() erkennt
                                abgebrochenen Reauth.
  slug.ts            (66 Z.)   slugify(), ensureUniqueSlug() (ohne
                                Zufallssuffix, Kollision per -2/-3),
                                draftSlug()/isDraftSlug() fuer
                                Entwurfszeilen vor dem ersten Titel.
  drafts.ts          (375 Z.)  Entwurfstypen (WorkshopDraft/CasaDraft,
                                beide Felder gepaart {es,en}) plus
                                Umwandlung von/zur DB-Zeile
                                (draftFromWorkshop/workshopPatch usw.).
  entity-list.ts     (349 Z.)  entityList<T>(): gemeinsame Listenansicht
                                fuer beide Inhaltsarten. Karten mit
                                Zustand/Sprachstand, Suche, Filter-Chips,
                                Ziehen zum Sortieren, Loeschen im
                                Ueberlaufmenue mit Rueckfrage.
  editor-shell.ts    (393 Z.)  editorShell(): Geruest des Editors --
                                sticky Kopfzeile, Speicherzustand,
                                Abschnitts-Sprungleiste, Vorschauspalte/
                                -Sheet, ehrlicher ~90s-Publish-Fortschritt.
  preview.ts         (435 Z.)  workshopPreview()/casaPreview(): Live-
                                Vorschau als verkleinerte Nachbildung von
                                Workshops.astro/Stay.astro (kein echtes
                                Astro-Rendering, das laeuft nur zur
                                Bauzeit). Fehlende Felder bleiben als
                                sichtbare Luecke stehen.
  workshops-view.ts  (565 Z.)  Liste + Editor Talleres.
  casas-view.ts      (575 Z.)  Liste + Editor Casas. "Nueva casa" legt
                                sofort eine Entwurfszeile an, damit
                                Fotos ab Sekunde eins moeglich sind;
                                unberuehrte Entwuerfe werden beim
                                Verlassen wieder entfernt.
  photos.ts          (288 Z.)  photoManager(): Ablegen/Einfuegen/Waehlen,
                                bis zu 3 Uploads gleichzeitig, Fehler je
                                Datei, Titelbild waehlen, Ziehen zum
                                Sortieren.
  image-upload.ts    (101 Z.)  uploadCasaImage/deleteCasaImage/
                                updateCasaImage/fetchCasaImages -- Resize
                                auf max. 2000px vor dem Hochladen.
src/styles/admin/
  base.css   (508 Z.)  Toast, Dialog, Login, gepaartes Feld, Listen-Editor.
  shell.css  (461 Z.)  Kopfzeile der Huelle, Navigation Talleres/Casas.
  editor.css (554 Z.)  Editor-Geruest + alle controls.ts-Bedienelemente.
  list.css   (277 Z.)  Kartenliste, Ueberlaufmenue.
  photos.css (127 Z.)  Fotoverwaltung.
  preview.css(255 Z.)  Live-Vorschau.
src/lib/
  supabase.ts        (22 Z.)   Ein Client fuer Build-Zeit UND Browser.
  fetch-workshops.ts (141 Z.)  Liest workshops_public fuer den
                                OEFFENTLICHEN Website-Build (Workshops.astro).
  fetch-casas.ts     (157 Z.)  Liest casas_public fuer Stay.astro. Bildet
                                build_status auf das Website-Feld `status`
                                um (Namenskollision, siehe Abschnitt 4).
supabase/
  schema.sql                  Vollstaendiges Schema fuer ein FRISCHES
                                Projekt (Tabellen, Views, RPCs, RLS,
                                Storage-Policys).
  migrations/002_admin_allowlist.sql
                               Allowlist `admins` + `is_admin()`, RLS auf
                                die Person statt auf "angemeldet",
                                Rechtepruefung in ALLEN sechs
                                security-definer-RPCs, Storage-Grenzen.
  migrations/003_audit_und_deploy_bremse.sql
                               `audit_log` (wer hat wann was geaendert,
                                bei DELETE die ganze alte Zeile) und
                                notify_deploy_hook() mit Sperrfrist von
                                einer Minute.
  migrations/004_soft_delete.sql
                               `deleted_at` statt echtem DELETE, 30 Tage
                                umkehrbar. Views filtern mit.
scripts/
  pruefen-sicherheit.mjs      Misst die Sicherheitsannahmen von aussen nach
                                (nur anon-Key, nur GET/HEAD). Laeuft in
                                .github/workflows/sicherheit.yml.
  migrations/001_draft_publish.sql
                               Additive Migration fuer ein Projekt, das
                                noch auf dem alten (Vor-Entwurf/Publish)
                                Schema steht. Bereits gegen das Live-
                                Projekt gelaufen, siehe Abschnitt 7.
  seed.sql                     Nur fuer ein frisches Projekt -- ueberträgt
                                die Demo-Inhalte aus src/data/{workshops,
                                casas}.ts. NIEMALS gegen ein Projekt mit
                                echten Daten laufen lassen.
```

Nicht mehr vorhanden (bewusst geloescht beim Rework, falls du sie irgendwo
noch referenziert findest): `src/scripts/admin/{workshops-panel,casas-panel,
repeater,status}.ts`.

---

## 3. Datenmodell (verifiziert gegen `supabase/schema.sql`)

### `workshops`

| Spalte | Typ | Bedeutung |
|---|---|---|
| `status` | text | `draft` \| `published` \| `archived` -- **Veroeffentlichungszustand** |
| `sort_order` | numeric | fraktional, siehe `fractionalOrder()` |
| `theme_id` | text | Schluessel in `src/data/workshop-themes.ts` (Icon/Akzentfarbe im Code, nicht DB) |
| `translations` | jsonb | `{es:{title,summary,longDesc,audience,forWhom,languages,meetingPoint,programme:[{title,text}],included:[],bring:[]}, en:{...}}` |
| `published_payload` | jsonb | Schnappschuss der veroeffentlichten Fassung, von `publish_workshop()` gesetzt |
| `has_unpublished_changes` | boolean | von Trigger `mark_unpublished_changes()` bei jedem UPDATE gesetzt, das nicht der Publish-Vorgang selbst ist |

### `casas`

| Spalte | Typ | Bedeutung |
|---|---|---|
| `status` | text | `draft`\|`published`\|`archived` -- Veroeffentlichungszustand |
| `build_status` | text | `listo`\|`enObra`\|`planeado` -- **Baufortschritt**. `status` und `build_status` **nicht verwechseln** -- vor dem Entwurf/Publish-Umbau trug `status` beides gemeinsam, deshalb liegt die Verwechslungsgefahr nahe. |
| `amenities` | jsonb | **Eigene Spalte, nicht unter `translations`**: `[{glyph, label:{es,en}}]` |
| `highlights` | jsonb | **Eigene Spalte, nicht unter `translations`**: `[{glyph, label:{es,en}, note:{es,en}}]` |
| `translations` | jsonb | `{es:{title,tagline,body:[...],bookNote}, en:{...}}` -- **enthaelt KEINE amenities/highlights** |

### `casa_images`

Eigene Tabelle statt jsonb-Array, weil jedes Bild ein echtes Storage-Objekt
ist. `on delete cascade` raeumt beim Loeschen einer Casa nur die Zeilen ab
-- die Dateien im Bucket `casa-photos` muss der Client vorher selbst
loeschen (siehe `image-upload.ts`), sonst bleiben verwaiste Dateien liegen.

### Oeffentliche Views (einzige Datenquelle des Website-Builds)

`workshops_public` / `casas_public` lesen **ausschliesslich**
`published_payload` (nie den Arbeitsstand) und filtern auf
`status = 'published'`. `anon` hat auf den Basistabellen **keine** Rechte
mehr -- nur auf diese beiden Views. `casas_public` liefert zusaetzlich
`images` (aus `published_payload->'images'`, dort landen die Fotos erst
beim Veroeffentlichen).

### RPCs (jede in genau einem Aufruf, `security definer`)

```
publish_workshop(p_id uuid)          discard_workshop_changes(p_id uuid)
publish_casa(p_id uuid)              discard_casa_changes(p_id uuid)
publish_entity(p_table text, p_id)   discard_changes(p_table text, p_id)
```

Die tabellenspezifischen Varianten sind vorzuziehen; `store.ts` ruft sie so.
`publish_casa()` haengt beim Schreiben des Schnappschusses zusaetzlich die
aktuellen `casa_images`-Zeilen als `images` an -- das ist der einzige Ort,
an dem Fotos live gehen.

---

## 4. Veroeffentlichungs-Fluss

```
Tippen im Editor
  → createAutoSaver() debounced 1200ms
  → store.update(id, patch)              -- schreibt NUR den Arbeitsstand
  → has_unpublished_changes = true        (Trigger mark_unpublished_changes)

Klick "Publicar"
  → saver.flush() (letzter Stand sicher weg)
  → store.publish(id) → RPC publish_workshop/publish_casa
      setzt published_payload, published_at, has_unpublished_changes=false
  → editorShell zeigt ~90s Fortschritt, kein Erfolg auf Vorschuss

DB-Trigger (nur bei UPDATE mit published_at/status/sort_order-Aenderung,
           und bei DELETE -- bewusst NICHT bei INSERT, siehe Abschnitt 7)
  → notify_deploy_hook() → pg_net http_post → Vercel Deploy-Hook-URL
  → Vercel baut neu (~30-90s)
  → fetch-workshops.ts/fetch-casas.ts lesen workshops_public/casas_public
  → live
```

---

## 5. Optik

Ausschliesslich Tokens aus `src/styles/tokens.css` und Bausteine aus
`src/styles/global.css` (`.btn`, `.btn--ghost`, `.card`, `.chip*`). Kein
eigenes Farbsystem: Barro = Primaeraktion/Gefahr, Pistacho = Erfolg,
Lavanda = neutrale Information, Miel = Warnung. 44px Touch-Ziele
(`--adm-touch`), sichtbare Fokusringe ueberall, `prefers-reduced-motion`
respektiert.

---

## 6. Bekannte Fallstricke

Alles hier hat in dieser Sitzung echte Zeit gekostet -- lies das, bevor du
denselben Fehler wiederholst.

1. **Worktree + destruktive Git-Befehle.** Die gesamte unversionierte
   Backend-Arbeit ging einmal komplett verloren, weil ein Agent in der
   Worktree einen Branchwechsel/Reset ausfuehrte. Niemals `git checkout`,
   `git reset`, `git clean`, `git stash` in einer Worktree ohne vorherigen
   Commit. Nach jedem sinnvollen Arbeitsschritt committen.
2. **Supabase SQL-Editor fuehrt ein eingefuegtes Skript als EINE
   Transaktion aus.** Ein Fehler irgendwo rollt alles zurueck, auch
   scheinbar laengst erfolgreich durchgelaufene fruehere Anweisungen
   im selben Paste. Bei einem Fehlschlag ist die Datenbank meist wieder
   exakt im Vorzustand -- nicht von einem Teilzustand ausgehen, sondern
   pruefen (z. B. ob ein neues RPC/View existiert).
3. **Alte RLS-Policy vor abhaengiger Spalte loeschen.** Die urspruengliche
   Policy `casas_public_read` (`using (not archived)`) haengt an der Spalte
   `archived`. Ein `alter table ... drop column archived` OHNE vorheriges
   `drop policy casas_public_read` scheitert mit Fehler `2BP01`. Generell:
   vor jedem Spalten-Drop pruefen, ob eine Policy/View davon abhaengt.
4. **`pg_net` liegt je nach Projekt in Schema `net` ODER `extensions`.**
   `notify_deploy_hook()` ruft deshalb bewusst unqualifiziert `http_post()`
   auf mit `set search_path = extensions, net, public` -- nicht auf ein
   Schema fest verdrahten. Pruefen mit:
   `select extname, extnamespace::regnamespace from pg_extension where extname='pg_net';`
5. **Die "Database Webhooks"-Oberflaeche von Supabase ist nicht immer
   nutzbar.** Sie braucht `supabase_functions.http_request`, was auf
   manchen Projekten (z. B. nach laengerer Pause) fehlt. Deshalb der
   eigene `pg_net`-basierte Trigger-Weg (`notify_deploy_hook()`) statt der
   Dashboard-Oberflaeche -- braucht nur die Extension `pg_net`, die ueber
   **Dashboard → Database → Extensions** aktiviert werden muss (reines
   `create extension pg_net` per SQL reicht oft nicht, weil die Erweiterung
   einen Hintergrundprozess braucht, der `shared_preload_libraries` setzt).
6. **Deploy-Hook-Trigger feuern nur bei UPDATE/DELETE, nie bei INSERT.**
   Eine neu angelegte Zeile bekommt immer `status='draft'` und ist nirgends
   oeffentlich sichtbar -- ein INSERT-Trigger waere reine Verschwendung.
7. **Claude/Agenten duerfen sich nicht selbst in `/admin` einloggen.**
   Passworteingabe ist unabhaengig von jeder Nutzerfreigabe untersagt.
   Tests hinter dem Login muss die Nutzerin selbst durchklicken; ein Agent
   kann parallel Datenbank/Konsole/Netzwerk beobachten, aber nicht selbst
   navigieren, sobald ein Login noetig ist.
8. **`gh`-CLI ist in dieser Umgebung nicht installiert.** PRs muessen ueber
   die manuelle Compare-URL erstellt werden:
   `https://github.com/<owner>/<repo>/compare/main...<branch>?expand=1`.
9. **`src/data/workshops.ts` / `casas.ts` sind nur noch Referenz/Seed-
   Vorlage, werden zur Laufzeit NICHT gelesen** (`Workshops.astro`/
   `Stay.astro` lesen aus Supabase). Trotzdem ein echtes Merge-Konflikt-
   Risiko: Familienmitglieder korrigieren dort direkt Inhalte (z. B. wurde
   ein Bienenstock-Feature aus `casa-2` entfernt und Fakten korrigiert,
   während der Admin-Rework parallel lief -- echter Git-Konflikt beim
   Merge). **Wichtiger:** Eine Korrektur, die so in die TS-Datei einfliesst,
   landet NICHT automatisch in der Datenbank. Nach so einem Merge den
   entsprechenden DB-Eintrag manuell nachziehen (`update ... where slug=...`
   auf die betroffenen Spalten, dann `select publish_workshop(id)` bzw.
   `publish_casa(id)`) und neu veroeffentlichen -- sonst zeigt die Live-Site
   weiter den alten Stand, obwohl der Code laengst korrigiert ist.
10. **Lange zweisprachige Texte nie von Hand in SQL-String-Literale
    packen** (Apostrophe wie *neighbour's*, *wood-fired* brechen naive
    Escaping-Versuche). Stattdessen ein kleines Node-Skript den JSON-Wert
    erzeugen lassen und per Dollar-Quoting (`$tag$...$tag$::jsonb`) in die
    SQL einsetzen -- keine Anfuehrungszeichen-Kollision moeglich.
11. **`formatPrice(price, currency)` nimmt nur zwei Argumente**, kein
    `lang` (im Gegensatz zu `formatDate(iso, lang)`). Leicht zu verwechseln.
12. In dieser Windows-Umgebung uebersetzt Node innerhalb der Bash-Tool-
    Pipeline `/tmp`-Pfade gelegentlich fehlerhaft nach `D:\tmp`. Fuer
    Node-Skripte immer den Scratchpad-Pfad verwenden, nicht `/tmp`.
13. **`authenticated` heisst nicht "die Nutzerin".** Das urspruengliche
    Schema schrieb `to authenticated using (true)` und meinte damit die
    Nutzerin. Postgres versteht darunter "irgendwer mit einem Konto in
    diesem Supabase-Projekt" -- und die Selbstregistrierung war offen, der
    anon-Key steht bauartbedingt in jedem Bundle. Ergebnis: voller Schreib-
    und Loeschzugriff fuer beliebige Dritte. Seit
    `002_admin_allowlist.sql` fragen alle Policys `public.is_admin()`. Wer
    eine neue Tabelle anlegt, muss dasselbe tun -- `to authenticated` allein
    ist in diesem Projekt gleichbedeutend mit "alle".
14. **`security definer` laeuft an RLS vorbei.** Die sechs Publish-/Discard-
    RPCs tun das absichtlich. Deshalb reicht es NICHT, nur die Policys zu
    verschaerfen: ohne eine eigene `is_admin()`-Pruefung als erste Anweisung
    in jeder dieser Funktionen ist die Allowlist ueber `publish_workshop()`
    vollstaendig umgehbar. Gilt fuer jede kuenftige `security definer`-
    Funktion genauso.

---

## 7. Aktueller Stand (2026-08-22)

**Sicherheitsarbeit:** Adminbereich und Datenbank wurden nach
[`PLAN-SICHERHEIT.md`](PLAN-SICHERHEIT.md) ueberarbeitet -- Allowlist statt
`to authenticated`, Rechtepruefung in allen RPCs, Storage-Grenzen,
Aenderungsprotokoll, umkehrbares Loeschen, zweiter Faktor, Security-Header
und ein Pruefskript in der CI. **Die Migrationen 002 bis 004 sind
geschrieben, aber noch NICHT gegen das Live-Projekt gelaufen**, und der
Dashboard-Schalter aus Phase 0 (Selbstregistrierung) ist noch offen. Bis
beides geschehen ist, ist die Datenbank fuer beliebige Dritte beschreibbar.
Reihenfolge und Einzelheiten: PLAN-SICHERHEIT.md, Abschnitte 3 und 4.

- Migration `001_draft_publish.sql` ist gegen das Live-Projekt gelaufen
  (Projekt-Ref `wgoukgndhpdfcgtwbpke`), Deploy-Hook-Trigger stehen.
- Domain `retoniosdeleden.com`, in `astro.config.mjs` (`site:`) eingetragen.
- **Offen:** `casas.facts` (strukturierte Zahlen: `area`, `bedrooms` etc.)
  fuer `casa-2` ist inkonsistent mit dem korrigierten Flusstext (Text sagt
  "fifty square metres, one open bedroom", `facts` steht noch auf
  `area: 60, bedrooms: 2`). War schon auf `main` so, bevor der Admin-Rework
  gemerged wurde -- noch nicht mit der Nutzerin geklaert, welche Zahl
  stimmt.
- **Kaum live end-to-end getestet.** Getestet wurden bisher nur:
  Umsortieren, Archivieren. NICHT getestet: neuen Workshop/neue Casa
  anlegen, Fotoupload, kompletter Publicar-Ablauf mit Fortschrittsanzeige,
  Verhalten bei abgelaufener Session (Reauth-Dialog). Vor grösseren
  Aenderungen an `workshops-view.ts`/`casas-view.ts`/`photos.ts` idealerweise
  zuerst mit der Nutzerin gemeinsam durchklicken, da hier die wenigste
  Praxiserfahrung existiert.

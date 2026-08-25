# Backend einrichten (einmalig)

Diese Schritte richten das Supabase-Backend für Workshops und Lehmhäuser ein.
Danach pflegt sich der Inhalt nur noch über `/admin` — dieses Dokument wird
nur für die Ersteinrichtung oder falls ein zweites Projekt aufgesetzt wird
gebraucht.

## Entwurf und Veröffentlicht — in drei Sätzen

Jeder Workshop und jedes Lehmhaus hat zwei Fassungen: den Arbeitsstand, in
den das Backend beim Tippen automatisch speichert, und den veröffentlichten
Schnappschuss (`published_payload`), den allein die Website liest. Erst der
Knopf **Publicar** kopiert den Arbeitsstand in den Schnappschuss und stößt
den neuen Build an; bis dahin sieht niemand außer der Nutzerin die Änderung.
Deshalb kann man ein halbfertiges Haus tagelang liegen lassen, ohne dass es
je auf der Seite auftaucht — und **Descartar cambios sin publicar** wirft den
Arbeitsstand wieder auf den veröffentlichten Stand zurück.

Ein Eintrag ist immer in genau einem Zustand: `draft` (noch nie
veröffentlicht), `published` (live) oder `archived` (bewusst von der Website
genommen).

---

## A. Bestehende Installation aktualisieren

> **Zum Mitklicken gibt es [`ANLEITUNG-ABSICHERN.md`](ANLEITUNG-ABSICHERN.md)** --
> dort steht jeder Schritt einzeln, in der richtigen Reihenfolge.
>
> **Zuerst Phase 0 aus [`PLAN-SICHERHEIT.md`](PLAN-SICHERHEIT.md).** Solange
> im Dashboard unter Authentication → Sign In / Providers → Email der Schalter
> **„Allow new users to sign up"** an ist, kann sich jeder Mensch selbst ein
> Konto anlegen und bekommt damit vollen Schreibzugriff auf die Datenbank.
> Das ist keine Theorie, sondern der Befund B1 — die Migrationen unten sichern
> diesen Schalter ab, ersetzen ihn aber nicht.

Wenn das Supabase-Projekt schon läuft und Inhalte enthält, laufen im
Dashboard → **SQL Editor** nacheinander (jede Datei einzeln einfügen und
**Run**, Reihenfolge einhalten):

| Datei | Was sie tut | Vorher anpassen |
|---|---|---|
| [`001_draft_publish.sql`](supabase/migrations/001_draft_publish.sql) | Entwurf/Veröffentlicht-Umbau | — |
| [`002_admin_allowlist.sql`](supabase/migrations/002_admin_allowlist.sql) | Allowlist statt „irgendwer angemeldet", Rechteprüfung in allen RPCs, Storage-Grenzen | **E-Mail-Adresse der Nutzerin** |
| [`003_audit_und_deploy_bremse.sql`](supabase/migrations/003_audit_und_deploy_bremse.sql) | Änderungsprotokoll, Deploy-Hook höchstens 1×/Minute | **Deploy-Hook-URL** (4 Stellen) |
| [`004_soft_delete.sql`](supabase/migrations/004_soft_delete.sql) | Löschen wird 30 Tage lang umkehrbar | **Deploy-Hook-URL** (4 Stellen) |

`002` bricht bewusst ab und rollt alles zurück, wenn die Adresse nicht
ersetzt oder falsch geschrieben wurde — lieber gar nichts geändert als das
Panel ausgesperrt. Der Kopf jeder Datei erklärt den Rest.

**`003` und `004` ersetzen Abschnitt D dieses Dokuments.** Wer den alten
SQL-Block von dort noch einmal ausführt, nimmt die Deploy-Bremse und die
Soft-Delete-Bedingung wieder heraus.

Zu 001 im Einzelnen:

Dashboard → **SQL Editor** → Inhalt von
[`supabase/migrations/001_draft_publish.sql`](supabase/migrations/001_draft_publish.sql)
einfügen und **Run**.

Die Migration

- zieht den Baufortschritt der Häuser (`listo` / `enObra` / `planeado`) aus
  `casas.status` in die neue Spalte `casas.build_status` um, damit `status`
  — wie bei den Workshops — den Veröffentlichungszustand tragen kann;
  `casas.archived` entfällt und geht in `status` auf,
- legt `published_payload`, `has_unpublished_changes` und `published_at` an,
- macht `sort_order` zu `numeric` (Umsortieren per Drag & Drop),
- legt die öffentlichen Views `workshops_public` / `casas_public` an und
  nimmt der anonymen Rolle jeden Zugriff auf die Basistabellen,
- **veröffentlicht alles, was vorher live war**, sofort mit — die Seite sieht
  nach dem nächsten Build also genauso aus wie vorher.

Das Skript ist idempotent: ein zweiter Lauf ändert nichts mehr. Danach weiter
bei Abschnitt **D (Deploy-Hook)** — der muss angepasst werden, sonst löst
jedes Autospeichern einen Build aus.

---

## B. Frisches Projekt aufsetzen

### 1. Supabase-Projekt

Falls noch nicht geschehen: Projekt auf [supabase.com](https://supabase.com) anlegen.

### 2. Datenbank-Schema einspielen

Im Supabase-Dashboard → **SQL Editor**, in dieser Reihenfolge ausführen:

1. Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen und **Run**.
   Legt die Tabellen `workshops`, `casas`, `casa_images`, die Funktionen zum
   Veröffentlichen, die öffentlichen Views, die Sicherheitsregeln (Row Level
   Security) und den Storage-Bucket `casa-photos` an.
2. Inhalt von [`supabase/seed.sql`](supabase/seed.sql) einfügen und **Run**.
   Überträgt die bisherigen 5 Workshops und 3 Lehmhäuser in die Datenbank und
   veröffentlicht sie am Ende (der `select publish_workshop(...)`-Block ganz
   unten — ohne ihn bleiben die öffentlichen Views leer).

3. Danach **zwingend** die Migrationen aus Abschnitt A in ihrer Reihenfolge:
   `002_admin_allowlist.sql`, `003_audit_und_deploy_bremse.sql`,
   `004_soft_delete.sql`. `schema.sql` allein enthält noch das alte
   Rechtemodell (`to authenticated using (true)`) — bis 002 gelaufen ist,
   darf jede Person mit irgendeinem Konto in diesem Projekt alles lesen,
   schreiben und löschen.

`schema.sql` ist auf eine leere Datenbank ausgelegt. `seed.sql` darf nur
einmal laufen, sonst stehen die Inhalte doppelt drin.

### 3. Login-Nutzerin anlegen

Dashboard → **Authentication → Users → Add user** (Add user → Create new user).
E-Mail-Adresse und ein Passwort für die Mutter vergeben, "Auto Confirm User"
aktivieren (kein Bestätigungs-Mail-Versand nötig).

Dieser Login ist der einzige Zugang zu `/admin`.

Danach **unbedingt** `002_admin_allowlist.sql` laufen lassen und diese
Adresse dort eintragen: ohne Eintrag in `public.admins` kommt auch die
richtige Person an keine einzige Zeile. Und beim ersten Anmelden im Panel
über **Seguridad** in der Kopfzeile den zweiten Faktor einrichten — solange
das nicht geschehen ist, ist ein einzelnes Passwort der gesamte Schutz der
Datenbank.

### 4. Projekt-Keys besorgen

Dashboard → **Settings → API**:
- **Project URL**
- **anon / public** Key (der `service_role`-Key wird nirgends gebraucht —
  niemals in Code oder Vercel-Einstellungen eintragen)

### 5. Lokale Entwicklung

`.env` im Projektordner anlegen (siehe `.env.example`):

```
PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Danach `npm run dev` — `/admin` ist unter `http://localhost:4321/admin/` erreichbar.

---

## C. Vercel

### 6. Deploy Hook anlegen

Vercel-Projekt → **Settings → Git → Deploy Hooks**: neuen Hook anlegen
(Name z. B. "Supabase Content Update", Branch = der Branch, der live deployt,
üblicherweise `main`). Die erzeugte URL kopieren.

### 7. Umgebungsvariablen

Vercel-Projekt → **Settings → Environment Variables**, für **Production**
(und optional Preview):

| Name | Wert |
|---|---|
| `PUBLIC_SUPABASE_URL` | Project URL aus Schritt 4 |
| `PUBLIC_SUPABASE_ANON_KEY` | anon/public Key aus Schritt 4 |

Danach einmal manuell neu deployen (Vercel-Dashboard → Deployments → Redeploy),
damit der erste Build mit den neuen Variablen läuft.

---

## D. Deploy-Hook: nur beim Veröffentlichen auslösen

**Wichtig, sonst baut die Seite sich alle paar Sekunden neu.** Das Backend
speichert beim Tippen automatisch (etwa jede Sekunde). Ein Webhook, der auf
jedes `UPDATE` reagiert, würde damit einen Dauerlauf an Vercel-Builds
auslösen. Der Hook darf deshalb nur feuern, wenn wirklich veröffentlicht,
umsortiert, archiviert oder gelöscht wurde.

Der naheliegende Weg wäre die Oberfläche unter **Database → Webhooks**, die
intern eine Funktion namens `supabase_functions.http_request` nutzt. Auf
manchen Projekten (z. B. nach einer Pause) ist diese Schema nicht
vorhanden, das Anlegen schlägt dann mit `schema "supabase_functions" does
not exist` fehl. Der folgende Weg braucht die Oberfläche gar nicht erst:
eine eigene, kleine Trigger-Funktion auf Basis von `pg_net` — der
Erweiterung, auf der die Supabase-Oberfläche selbst aufbaut.

**Voraussetzung:** `pg_net` muss aktiv sein. Dashboard → **Database →
Extensions** → nach `pg_net` suchen → aktivieren. Reines SQL
(`create extension pg_net`) reicht dafür oft nicht: die Erweiterung bringt
einen Hintergrundprozess mit, der eine Servereinstellung
(`shared_preload_libraries`) braucht, die nur die Oberfläche korrekt setzt.
Ob sie schon aktiv ist, zeigt:

```sql
select extname, extnamespace::regnamespace as installiert_in
from pg_extension
where extname = 'pg_net';
```

Je nach Projekt landet `pg_net` dabei im Schema `net` oder `extensions` --
die Funktion unten prüft deshalb beide, statt eines fest anzunehmen.

**Seit Migration 003 steht dieser Trigger dort und nicht mehr hier.**

Früher stand an dieser Stelle ein SQL-Block zum Einfügen. Er ist nach
[`supabase/migrations/003_audit_und_deploy_bremse.sql`](supabase/migrations/003_audit_und_deploy_bremse.sql)
gewandert und dort um eine Bremse erweitert: die Funktion löst höchstens
einmal pro Minute tatsächlich aus. Ohne sie kann jede Person mit gültiger
Sitzung in einer Schleife beliebig viele Vercel-Builds auslösen — echte
Kosten, ohne dass ein einziger Inhalt sich ändert (PLAN-SICHERHEIT.md,
Befund B9).

[`004_soft_delete.sql`](supabase/migrations/004_soft_delete.sql) legt die
vier Trigger danach noch einmal an, damit auch das Löschen eines
veröffentlichten Eintrags einen neuen Build auslöst.

In beiden Dateien ist `<DEPLOY-HOOK-URL>` durch die URL aus Schritt 6 zu
ersetzen (je vier Stellen). **Den alten Block von hier nicht mehr ausführen** —
er würde die Bremse und die Soft-Delete-Bedingung wieder herausnehmen.

Zum Verständnis bleibt die Begründung der Trigger-Bedingungen stehen:

Warum nur `update` und `delete`, nicht `insert`: Ein neu angelegter Eintrag
bekommt immer `status = 'draft'` und taucht damit in keiner öffentlichen
View auf -- fürs Anlegen selbst gibt es also nichts neu zu bauen. Sichtbar
wird ein Eintrag erst beim Veröffentlichen (`update`, setzt `published_at`)
oder verschwindet beim direkten Löschen eines bereits veröffentlichten
Eintrags (`delete`).

Auf `casa_images` gehört **kein** Hook: Fotos erscheinen ohnehin erst mit dem
nächsten „Publicar" auf der Website, weil sie Teil des veröffentlichten
Schnappschusses sind.

Meldet `create extension` einen Rechtefehler: Dashboard → **Database →
Extensions** → nach `pg_net` suchen → aktivieren, danach den Block ab
`create or replace function` erneut ausführen.

Damit löst jedes Veröffentlichen automatisch einen neuen Vercel-Build aus
(live nach ca. 30–90 Sekunden).

---

## Danach: laufender Betrieb

Nichts weiter nötig. Login unter `/admin`, Workshops/Lehmhäuser bearbeiten —
das Speichern läuft von selbst mit. Wenn die Änderung live gehen soll:
**Publicar** drücken, dann aktualisiert sich die Seite innerhalb von etwa
einer Minute selbst.

### Wenn der Build meckert

Der Website-Build bricht mit einer deutschen Erklärung ab, wenn

- die Views `workshops_public` / `casas_public` fehlen → Abschnitt A oder B
  nachholen,
- kein einziger Workshop bzw. kein einziges Haus veröffentlicht ist → unter
  `/admin` mindestens einen Eintrag „Publicar",
- `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` fehlen → Schritt 5 bzw. 7.

### Fotos löschen

Beim Löschen eines Hauses räumt die Datenbank nur die Zeilen in `casa_images`
ab. Die Dateien im Bucket löscht das Backend vorher selbst — Reihenfolge
immer erst Storage, dann Datenbankzeile.

---

## E. Dokumentenablage einrichten (Talleres/Casas + Documentos)

Die dritte Sektion im Backend — Baupläne, Anträge, Verträge statt WhatsApp —
braucht zwei weitere Migrationen. Der Hintergrund und alle Entscheidungen
dazu stehen in `PLAN-DOCUMENTOS.md`; hier geht es nur um die Einrichtung.

### 1. Die zwei Dateien, in genau dieser Reihenfolge

Dashboard → **SQL Editor**, nacheinander einfügen und **Run**:

1. [`supabase/migrations/002_roles.sql`](supabase/migrations/002_roles.sql)
2. [`supabase/migrations/003_documentos.sql`](supabase/migrations/003_documentos.sql)

**Warum die Reihenfolge zählt:** `002_roles.sql` führt zum ersten Mal ein
Rollenmodell ein (`owner` / `editor` / `member`). Bisher durfte jede
angemeldete Person auf Talleres und Casas de barro alles — vertretbar,
solange nur ein Zugang existierte. Sobald über die Dokumentenablage weitere
Personen einen Login bekommen können, wäre das nicht mehr sicher: ohne
Rollenprüfung könnte jede neue Person auch die öffentliche Website
bearbeiten. `002_roles.sql` legt deshalb zuerst für **alle bereits
bestehenden Zugänge** automatisch ein Profil mit der höchsten Rolle
(`owner`) an, und **erst danach** stellt sie die Zugriffsregeln auf
Talleres/Casas um. In dieser Reihenfolge sperrt die Migration niemanden
aus — würde man sie umdrehen, wäre der bestehende Zugang für einen Moment
ausgesperrt.

`003_documentos.sql` baut darauf auf (Ordner, Dokumente, Versionen,
Kommentare, Aufgaben, der private Speicher-Bucket) und muss deshalb danach
laufen. Beide Skripte sind idempotent: ein zweiter Lauf ändert nichts mehr.

### 2. Weitere Personen anlegen

Dashboard → **Authentication → Users → Add user** (Add user → Create new
user). E-Mail-Adresse und ein Passwort vergeben, **„Auto Confirm User"**
aktivieren — sonst wartet der Zugang auf eine Bestätigungs-Mail, die nie
verschickt wird.

Beim ersten Login legt ein Trigger automatisch ein Profil mit der
Einstiegsrolle `member` an (Zugriff auf die Dokumentenablage, aber nicht auf
Talleres/Casas). Den Namen und ggf. eine höhere Rolle vergibt danach eine
Person mit der Rolle `owner` — siehe nächster Punkt.

### 3. Rollen vergeben

Rollen ändert man direkt in der Tabelle `profiles`, im **SQL Editor**. Erst
die E-Mail-Adresse der Person nachsehen:

```sql
select id, display_name, role, is_active from public.profiles;
```

Dann die passende Zeile aktualisieren — `<UUID>` durch die `id` aus der
Abfrage oben ersetzen:

```sql
-- Rolle setzen: 'owner' (alles, plus Personen verwalten),
-- 'editor' (Dokumente + Talleres/Casas), oder 'member' (nur Dokumente).
update public.profiles set role = 'editor' where id = '<UUID>';

-- Anzeigenamen korrigieren (der Trigger leitet ihn nur grob aus der
-- E-Mail-Adresse ab).
update public.profiles set display_name = 'Catalina', initials = 'CM' where id = '<UUID>';

-- Zugang sperren, ohne den Auth-Account zu löschen.
update public.profiles set is_active = false where id = '<UUID>';
```

Wichtig: **`owner` darf Personen hinzufügen und Rollen vergeben, `editor`
darf zusätzlich Talleres und Casas de barro bearbeiten.** Wer nur mit
Dokumenten zu tun hat — die meisten neuen Zugänge — bleibt bei `member`.

### 4. Der Bucket `documentos` ist privat — und muss es bleiben

Anders als `casa-photos` (öffentlich, weil Hausfotos auf der Website
landen sollen) ist der Bucket `documentos` mit `public = false` angelegt.
Das ist kein Versehen, sondern der ganze Sinn der Sache: Verträge und
Baupläne dürfen nur nach Login abrufbar sein, nicht über eine erratbare
Adresse im Netz. `003_documentos.sql` erzwingt diese Einstellung sogar bei
einem erneuten Lauf (`on conflict ... do update set public = false`), falls
der Bucket aus Versehen einmal anders angelegt worden wäre.

**Das darf niemand ändern** — auch nicht „nur kurz zum Testen". Anzeigen
und Herunterladen laufen im Backend über zeitlich begrenzte, signierte
Adressen (`createSignedUrl`), nicht über die öffentliche Foto-URL.

### 5. Kein Deploy-Hook für Dokumente

Die Dokumentenablage taucht auf der öffentlichen Website nicht auf.
`003_documentos.sql` richtet deshalb bewusst **keinen** Trigger nach dem
Muster aus Abschnitt D dieses Dokuments ein — ein neuer Kommentar oder eine
neue Dokumentversion darf keinen Vercel-Build auslösen. Die bestehenden
Deploy-Hook-Trigger bleiben unverändert auf `workshops` und `casas`
beschränkt.

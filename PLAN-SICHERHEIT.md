# Plan: Adminbereich & Datenbank absichern

Stand der Analyse: 2026-08-21. Geprüft wurden `supabase/schema.sql`,
`src/scripts/admin/*`, `src/lib/supabase.ts`, der gebaute Stand in `dist/`,
die Git-Historie und — lesend — die Live-Konfiguration des Supabase-Projekts
`wgoukgndhpdfcgtwbpke`.

Dieses Dokument beschreibt **was zu tun ist und warum**. Es beschreibt nicht
den Code (das tut [`HANDOFF-ADMIN.md`](HANDOFF-ADMIN.md)) und nicht die
Ersteinrichtung (das tut [`SETUP-BACKEND.md`](SETUP-BACKEND.md)).

---

## Umsetzungsstand (2026-08-24)

**Scharf geschaltet und live nachgemessen: `npm run seguridad` meldet 13 von
13 bestandenen Pruefungen.** Die Migrationen 002-004 sind gegen das
Live-Projekt gelaufen, die Selbstregistrierung ist gesperrt, der Code ist auf
`main` deployt.

### Offen -- braucht euch

| Was | Wo | Warum nicht von mir |
|---|---|---|
| **Zweiter Faktor einrichten** | `/admin` -> "Seguridad" | Braucht Anmeldung und Handykamera. **Beide Personen**, siehe Anleitung Abschnitt D |
| aal2 zur Pflicht machen | SQL, eine Anweisung | Erst danach; der Schnipsel steht in der Anleitung, Abschnitt E |
| GitHub-Secrets anlegen | GitHub-Einstellungen | `PUBLIC_SUPABASE_ANON_KEY` und `SUPABASE_DB_URL`; sonst laufen Pruef-Workflow und naechtliche Sicherung ins Leere |

Bewusst offen gelassen: `password_min_length` steht weiter auf 6 und der
Abgleich gegen geleakte Passwoerter (`password_hibp_enabled`) ist aus. Beides
greift ohnehin erst, wenn jemand sein Passwort neu setzt -- nachholbar, wann
immer ihr wollt.

### Erledigt am 2026-08-24

- **Migrationen 002, 003, 004** gegen das Live-Projekt gelaufen. Kontrolle:
  2 Eintraege in `admins`, keine `using (true)`-Policy mehr, alle sechs RPCs
  mit Waechter, Bucket auf 5 MB/`image/jpeg`, `audit_log` und `deploy_log`
  angelegt, `deleted_at` auf beiden Tabellen, beide Views filtern mit.
  Die oeffentlichen Views liefern unveraendert Daten (4 Workshops, 3 Casas) --
  der Website-Build ist also nicht betroffen.
- **Selbstregistrierung gesperrt.** Sie war es entgegen der Annahme noch
  nicht: `disable_signup` stand auf `false`, sowohl in der Management-API als
  auch an der oeffentlichen Auth-Schnittstelle. Ueber die API nachgezogen und
  an beiden Stellen verifiziert.
- **Deploy** auf `main`, Header und CSP live.

### Zwei Dinge, die dabei auffielen

1. **`retoniosdeleden.com` leitet mit 308 auf `www.` um.** Wer die Header an
   der Apex-Domain misst, misst die Weiterleitung und sieht sie nie -- das
   hat beim Pruefen erst Verwirrung gestiftet. `SITE_URL` im Pruefskript
   zeigt jetzt auf `www.`.
   **Noch offen und ausserhalb der Sicherheitsarbeit:** `astro.config.mjs`
   traegt `site: 'https://retoniosdeleden.com'` -- ohne `www`. Damit zeigen
   `canonical` und `og:url` auf eine Adresse, die weiterleitet. Fuer die
   Sicherheit belanglos, fuer Suchmaschinen unsauber.
2. **Das Vercel-Muster `/admin/:path*` trifft `/admin/` nicht.**
   path-to-regexp verlangt hinter dem Schraegstrich mindestens ein Segment;
   ausgerechnet die Anmeldeseite blieb dadurch ohne `X-Robots-Tag`. Live
   gemessen, nicht vermutet. `"/admin/(.*)"` darf leer matchen und deckt
   beides ab.

### Vorher umgesetzt (im Repository)

- **B1, B2, B4, B10, B11** — `002_admin_allowlist.sql`: Allowlist `admins` +
  `is_admin()`, alle Policys umgestellt, Rechteprüfung in allen sechs
  `security definer`-RPCs, Storage auf 5 MB/`image/jpeg` begrenzt und die
  `for all`-Policy in getrennte Regeln zerlegt, `search_path` festgenagelt,
  Vorgaberechte entzogen. Ein Wächter bricht ab und rollt alles zurück, falls
  die Adresse nicht eingetragen wurde.
- **B8, B9** — `003_audit_und_deploy_bremse.sql`: `audit_log` mit
  Blattwert-Diff (sonst stünde bei jedem Autosave die komplette
  `translations`-Spalte darin), bei DELETE die ganze alte Zeile;
  Deploy-Hook höchstens einmal pro Minute.
- **B7** — `004_soft_delete.sql` + `store.ts`: `deleted_at` statt echtem
  DELETE, 30 Tage umkehrbar, Views filtern mit. Die Löschdialoge in
  `entity-list.ts`, `workshops-view.ts` und `casas-view.ts` sagen jetzt die
  Wahrheit. Dazu die nächtliche Sicherung als GitHub Action.
- **B3** — `mfa.ts` / `mfa-dialog.ts`: TOTP-Einrichtung über „Seguridad" in
  der Kopfzeile, zweistufige Anmeldung, Codeschritt auch im Reauth-Dialog.
  Aktiviert sich selbst: ohne eingerichteten Faktor verhält sich alles exakt
  wie vorher.
- **B5, B6** — `vercel.json` (HSTS, nosniff, Referrer-Policy,
  Permissions-Policy, `frame-ancestors`, `form-action`, `noindex` und
  `no-store` für `/admin`), CSP über Astro plus
  `src/integrations/csp-ergaenzen.mjs`, `robots.txt`, `noindex` im Layout.
- **Phase 5** — `scripts/pruefen-sicherheit.mjs` (`npm run seguridad`) und
  zwei GitHub Actions.

### Zwei Funde aus der Umsetzung, die im Plan noch nicht stehen

1. **Astros CSP lässt zwei Lücken**, beide im Browser nachgemessen:
   `is:inline`-Skripte hasht sie nicht mit (der Vorgriff in `Apertura.astro`
   wurde dadurch blockiert), und `'unsafe-inline'` in `style-src` ist
   wirkungslos, weil Astro dort immer eine Hash-Quelle einträgt — was laut
   CSP-Spezifikation `'unsafe-inline'` für die **ganze** Direktive
   ausschaltet. Betroffen waren 91 `style="..."`-Attribute allein auf der
   Startseite. Beides schliesst jetzt `src/integrations/csp-ergaenzen.mjs`;
   die Datei erklärt das Warum. Ergebnis im Browser geprüft: Konsole ohne
   Verstoss, 91 von 91 Attributen wirksam, `script-src` weiterhin ohne
   `'unsafe-inline'`.
2. **`create or replace function` verwirft `set`-Konfigurationen**, die nicht
   erneut mitgeschrieben werden. Wer eine der gehärteten Funktionen später
   anfasst und `set search_path` weglässt, macht die B10-Härtung unbemerkt
   rückgängig. Steht auch als Fallstrick in `HANDOFF-ADMIN.md`.

---

## 0. Die Lage in einem Absatz

Das Sicherheitsmodell des Projekts ist bewusst schlank: es gibt keinen
Server, `/admin` läuft komplett im Browser, und der gesamte Schutz liegt in
Row Level Security. Diese Entscheidung ist richtig und wird hier nicht
angetastet. Sie steht und fällt aber mit **einer einzigen Annahme**, die im
Schema so formuliert ist: *„authenticated (die Nutzerin, eingeloggt über
Supabase Auth) darf alles lesen und schreiben."* Diese Annahme gilt gerade
nicht. `authenticated` heißt nicht „die Nutzerin" — es heißt „irgendwer mit
einem Konto in diesem Supabase-Projekt". Und ein solches Konto kann sich
derzeit **jeder Mensch mit Internetzugang selbst anlegen**. Damit ist die
gesamte Inhaltsverwaltung der Website offen. Alles Weitere in diesem Plan
ist Härtung; Punkt B1 ist eine offene Tür.

---

## 1. Was heute schon richtig ist

Damit die folgende Befundliste nicht den Eindruck erweckt, hier sei nichts
bedacht worden — diese Dinge sind gut gebaut und bleiben, wie sie sind:

- **Trennung Arbeitsstand / veröffentlichter Schnappschuss.** Die Website
  liest ausschließlich `published_payload` über die beiden Views. Selbst wer
  Schreibrechte hat, kann nicht durch bloßes Tippen im Autosave etwas live
  schalten — es braucht den bewussten Publish-Vorgang.
- **`anon` hat auf den Basistabellen keinerlei Rechte.** Live verifiziert:
  `GET /rest/v1/workshops` → `HTTP 401`, `GET /rest/v1/workshops_public` →
  `HTTP 200`. Genau so ist es gedacht, und genau so funktioniert es.
- **Kein `service_role`-Key im Code, in der Historie oder im Build.** Die
  Git-Historie wurde über alle Commits nach JWTs, `service_role` und
  `sb_secret_`-Schlüsseln durchsucht: sauber. `.env` ist ignoriert und
  existiert lokal nicht, `.env.example` enthält nur Platzhalter.
- **Der ausgelieferte Key ist tatsächlich der `anon`-Key** (Claim
  `"role":"anon"` im Bundle geprüft) — dass er öffentlich ist, ist kein
  Fehler, sondern Bauart.
- **Anonyme Anmeldungen sind aus** (`"anonymous_users": false`). Dieser
  zweite, sehr bequeme Weg zu einem `authenticated`-Token ist zu.
- **Veröffentlichen läuft in genau einem Aufruf** über `security definer`-
  Funktionen. Der Browser kann keinen halbfertigen Mehrschritt-Schreibvorgang
  hinterlassen.
- **`publish_entity` / `discard_changes` validieren den Tabellennamen** gegen
  eine feste Liste, statt dynamisches SQL zu bauen. Kein Injection-Weg.
- **Kein XSS-Weg über die Inhalte.** Alle `innerHTML`- und
  `set:html`-Stellen interpolieren ausschließlich aus festen Code-Katalogen
  (`workshopThemes`, `casaGlyphs`), nie aus Datenbankfeldern; `theme_id` und
  `glyph` sind zusätzlich per CHECK-Constraint bzw. Lookup-Rückfall begrenzt.

---

## 2. Befunde

| # | Befund | Schwere | Grundlage |
|---|---|---|---|
| B1 | Selbstregistrierung offen → jeder bekommt volle Schreibrechte | **Kritisch** | live verifiziert |
| B2 | `security definer`-RPCs ohne eigene Rechteprüfung | **Kritisch** | Schema |
| B3 | Kein zweiter Faktor, schwache Passwort-Vorgaben | **Hoch** | live verifiziert |
| B4 | Storage-Bucket ohne MIME-/Größengrenze, Policy `for all` | **Hoch** | Schema |
| B5 | Keine Security-Header, keine CSP | **Hoch** | Build geprüft |
| B6 | `/admin` öffentlich auffindbar und indexierbar | Mittel | Build geprüft |
| B7 | Kein Backup, kein Wiederherstellungsweg, harte DELETEs | Mittel | Code |
| B8 | Keine Nachvollziehbarkeit (kein Änderungsprotokoll) | Mittel | Schema |
| B9 | Deploy-Hook als Kosten-/DoS-Vektor | Niedrig | Setup |
| B10 | `search_path` in mehreren Funktionen nicht gesetzt | Niedrig | Schema |
| B11 | Supabase-Vorgaberechte begünstigen künftige Tabellen | Niedrig | Schema |

### B1 — Selbstregistrierung ist offen *(kritisch)*

`GET /auth/v1/settings` des Projekts liefert:

```json
{ "disable_signup": false, "mailer_autoconfirm": false, "external": { "email": true } }
```

`disable_signup: false` heißt: der öffentliche `anon`-Key — der in jedem
ausgelieferten JS-Bundle steht und stehen muss — genügt, um über
`POST /auth/v1/signup` ein Konto anzulegen. Dass `mailer_autoconfirm: false`
gesetzt ist, bremst nur: die angreifende Person bestätigt schlicht ihre
**eigene** Mailadresse und hat danach ein reguläres `authenticated`-Token.

Was dieses Token wert ist, steht in `schema.sql`:

```sql
create policy workshops_authenticated_all
  on public.workshops for all
  to authenticated
  using (true) with check (true);
```

Dasselbe für `casas`, `casa_images` und den Storage-Bucket. Ergebnis:
**vollständiges Lesen, Ändern, Löschen und Veröffentlichen aller Inhalte der
Website durch beliebige Dritte.** Inklusive `delete` — und weil `casa_images`
per `on delete cascade` hängt, inklusive Totalverlust.

Der Weg dahin ist keine Kunst: Bundle öffnen, Key ablesen, zwei HTTP-Aufrufe.
Das ist die Lücke, die zuerst geschlossen gehört.

> **Zur Vorgehensweise:** Ich habe diesen Weg *nicht* durchgespielt — Konten
> anlegen und Passwörter eingeben tue ich grundsätzlich nicht. Der Befund
> stützt sich auf die Konfiguration, die das Projekt selbst öffentlich
> ausgibt, plus die Policys im Schema. Beides zusammen ist eindeutig.

### B2 — `security definer`-RPCs prüfen keine Rechte *(kritisch)*

`publish_workshop`, `publish_casa`, `discard_workshop_changes`,
`discard_casa_changes`, `publish_entity` und `discard_changes` laufen alle
als `security definer` — also mit den Rechten des Eigentümers, **an RLS
vorbei**. Die einzige Hürde ist `grant execute ... to authenticated`.

Das ist schon heute ein Problem, wird aber vor allem zur Falle beim Beheben
von B1: Wer nur die Policys verschärft und die Funktionen unangetastet lässt,
hat nichts gewonnen — die Allowlist wäre über die RPCs vollständig umgehbar.
**Beides muss zusammen passieren.**

### B3 — Ein Passwort ist der ganze Schutz *(hoch)*

Kein zweiter Faktor. Supabase-Vorgaben, sofern nicht geändert: Mindestlänge
6 Zeichen, kein Abgleich gegen geleakte Passwörter, kein CAPTCHA vor dem
Anmelde-Endpunkt. Die Nutzerin arbeitet laut Handoff oft am Handy — also
eher kurzes Passwort, eher wiederverwendet.

### B4 — Storage-Bucket zu weit geöffnet *(hoch)*

```sql
create policy casa_photos_authenticated_write
  on storage.objects for all        -- auch DELETE, auch fremde Pfade
  to authenticated
  using (bucket_id = 'casa-photos')
  with check (bucket_id = 'casa-photos');
```

Der Bucket ist zusätzlich `public: true` und hat **weder `file_size_limit`
noch `allowed_mime_types`**. Damit kann jedes `authenticated`-Token:

- beliebige Dateitypen ablegen — HTML oder SVG mit Skript, ausgeliefert von
  einer `*.supabase.co`-Adresse (brauchbar für Phishing gegen genau diese
  Nutzerin),
- den Speicher volllaufen lassen (Kosten, im schlimmsten Fall Projektstopp),
- **sämtliche Fotos löschen**, in einem Aufruf.

Erfreulich für die Behebung: `image-upload.ts` rendert vor dem Upload immer
über `canvas.toBlob(..., 'image/jpeg', 0.82)`. Es wird also ausschließlich
JPEG hochgeladen — eine harte Einschränkung auf `image/jpeg` bricht nichts.

### B5 — Keine Security-Header, keine CSP *(hoch)*

Es gibt keine `vercel.json`, kein `_headers`, keine Meta-CSP. Kein HSTS,
kein `X-Content-Type-Options`, keine `Referrer-Policy`, keine
`frame-ancestors`. Die Sitzung liegt (Supabase-Standard) in `localStorage`;
ein einziger XSS in `/admin` bedeutet damit **dauerhaften** Vollzugriff auf
die Datenbank, weil das Refresh-Token mitgeht.

Gute Nachricht für die Umsetzung: der Build hat **keine externen
Ressourcen**. Schriften kommen als npm-Paket, GSAP ist gebündelt; die
einzigen fremden URLs im Ausgabeverzeichnis sind `github.com` und `gsap.com`
in Lizenzkommentaren sowie `airbnb.com` als Link-Ziel. Eine strenge CSP ist
hier also realistisch, nicht bloß Wunschdenken.

### B6 — `/admin` ist öffentlich und indexierbar *(mittel)*

Kein `robots.txt`, kein `noindex`, kein vorgelagerter Schutz.
`dist/admin/index.html` wird ganz normal ausgeliefert. Das ist für sich
genommen keine Lücke — RLS ist die eigentliche Tür — aber es lädt Scanner und
Passwort-Raterei ein und macht die Anmeldemaske über Suchmaschinen auffindbar.

### B7 — Kein Backup, harte DELETEs *(mittel)*

`store.remove()` setzt ein echtes `DELETE`; `photoManager` löscht die
Storage-Datei sogar zuerst. Auf dem Supabase-Free-Tier gibt es keine
Point-in-Time-Recovery. Ein verärgerter Angreifer — oder ein Fehlgriff auf
dem Handy — löscht Inhalte **endgültig**. Die `src/data/*.ts`-Dateien sind
laut Handoff nur noch Referenz und teils veraltet, taugen also nicht als
Sicherung.

### B8 — Keine Nachvollziehbarkeit *(mittel)*

Es gibt kein Protokoll darüber, wer wann was geändert oder gelöscht hat. Nach
einem Vorfall ließe sich weder Umfang noch Zeitpunkt bestimmen. Bei einem
Ein-Personen-Backend ist ein vollwertiger Monitoring-Stack Unsinn, eine
Änderungstabelle dagegen billig und im Ernstfall Gold wert.

### B9 — Deploy-Hook als Kosten-/DoS-Vektor *(niedrig)*

Jedes Veröffentlichen, Umsortieren, Archivieren und Löschen feuert den
Vercel-Deploy-Hook. Mit einem gültigen Token lässt sich das in einer Schleife
auslösen — beliebig viele Builds, echte Kosten. Ein Änderungsereignis pro
Minute reicht der Sache vollkommen.

### B10 — `search_path` nicht überall gesetzt *(niedrig)*

`content_snapshot`, `mark_unpublished_changes`, `slugify` und `unique_slug`
haben kein `set search_path`. Sie sind `security invoker`, das Risiko ist
also klein — aber es ist der Hinweis, den der Supabase-Linter zu Recht
meldet, und beim Beheben kostet er eine Zeile pro Funktion.

### B11 — Vorgaberechte für künftige Tabellen *(niedrig)*

Supabase vergibt per `ALTER DEFAULT PRIVILEGES` automatisch Rechte an `anon`
auf **neu angelegte** Tabellen im Schema `public`. `schema.sql` kennt dieses
Verhalten und nimmt die Rechte für die bestehenden Objekte gezielt wieder weg
— die nächste Tabelle, die jemand anlegt, ist aber wieder offen, bis jemand
daran denkt. Das gehört einmal grundsätzlich abgestellt.

---

## 3. Der Plan

Sechs Phasen, bewusst in dieser Reihenfolge. Phase 0 schließt die offene Tür
und kostet eine Viertelstunde ohne jede Code-Änderung. Phase 1 ist das
eigentliche Fundament. Alles ab Phase 3 ist ehrliche Härtung, kein Notfall.

---

### Phase 0 — Sofort, im Dashboard, ohne Code *(~15 Minuten)* — ERLEDIGT

**Ziel: B1 und B3 entschärfen, bevor irgendetwas anderes passiert.**

> Am 2026-08-22 vom Betreiber erledigt. Die Schritte bleiben zur
> Nachvollziehbarkeit stehen. Hinweis für später: „Allow new users to sign
> up" auszuschalten sperrt nur die *Selbst*registrierung über die öffentliche
> API — neue Konten legt man weiterhin ganz normal über Authentication →
> Users → Add user an. Das ist ab jetzt der einzige Weg, und so ist es
> gedacht.

Dashboard → **Authentication → Sign In / Providers → Email**:

1. **„Allow new users to sign up" ausschalten.** Das ist der eine Schalter,
   der B1 schließt. Die Nutzerin existiert bereits; neue Konten legt ohnehin
   nur das Dashboard an.
2. **Minimum password length auf 12** (Authentication → Policies).
3. **„Leaked password protection" einschalten** — Abgleich gegen
   HaveIBeenPwned beim Setzen des Passworts.
4. Dashboard → **Authentication → Users**: prüfen, dass dort **genau eine**
   Person steht. Steht mehr drin als erwartet, ist das der Beleg, dass B1
   bereits ausgenutzt wurde — dann bitte Rückmeldung, bevor irgendetwas
   gelöscht wird.
5. **Passwort der Nutzerin neu setzen** (mindestens 16 Zeichen, aus einem
   Passwortmanager, nirgends sonst verwendet) und danach in der Users-Liste
   über das Kontextmenü alle bestehenden Sitzungen beenden.

> Schritt 5 gehört ausdrücklich zu Phase 0: solange nicht ausgeschlossen ist,
> dass jemand Zugriff hatte, ist das alte Passwort verbrannt. Das Passwort
> setzt die Nutzerin selbst — ich gebe grundsätzlich keine Passwörter ein.

**Prüfung danach:** `/auth/v1/settings` muss `"disable_signup": true`
liefern.

```bash
curl -s "https://wgoukgndhpdfcgtwbpke.supabase.co/auth/v1/settings" -H "apikey: <ANON-KEY>"
```

---

### Phase 1 — Autorisierung an die Person binden *(~1 Stunde, ein SQL-Skript)*

**Ziel: B1 dauerhaft, B2, B4, B10, B11.**

Phase 0 hängt an einem Dashboard-Schalter, den jemand versehentlich wieder
umlegen kann. Phase 1 macht die Berechtigung davon unabhängig: nicht mehr
„wer angemeldet ist", sondern „wer namentlich auf der Liste steht".

**Die Reihenfolge ist kritisch.** Erst die Nutzerin eintragen, dann
umschalten — sonst sperrt sich das Panel selbst aus. Der Notausgang bleibt
immer der SQL-Editor im Dashboard; der läuft als `postgres` und ist von RLS
nicht betroffen. Ausgesperrt-Sein wäre also unangenehm, aber nie endgültig.

Das Skript kommt als `supabase/migrations/002_admin_allowlist.sql` ins Repo
und läuft einmal im SQL-Editor. Aufbau:

```sql
-- 1) Wer darf? Eine Zeile pro Mensch, sonst nichts.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
-- Bewusst KEINE Policy: über PostgREST kommt niemand an diese Tabelle.
-- Lesen tut sie nur is_admin() als security definer.
revoke all on public.admins from anon, authenticated;

-- 2) Die eine Frage, die ab jetzt überall gestellt wird.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $fn$
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$fn$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 3) DIE NUTZERIN EINTRAGEN -- vor Schritt 4, sonst Aussperrung.
--    Adresse anpassen:
insert into public.admins (user_id, email)
select id, email from auth.users where email = 'ADRESSE-DER-NUTZERIN'
on conflict (user_id) do nothing;

-- Kontrolle: muss genau 1 liefern, sonst NICHT weitermachen.
select count(*) from public.admins;
```

Danach die Policys umstellen — `(select public.is_admin())` in Klammern,
damit Postgres den Aufruf einmal pro Anweisung auswertet statt einmal pro
Zeile:

```sql
drop policy if exists workshops_authenticated_all on public.workshops;
create policy workshops_admin_all on public.workshops for all
  to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- identisch für casas und casa_images
```

**Und — der entscheidende Teil, ohne den das Obige wirkungslos ist (B2):**
in *jede* `security definer`-Funktion eine Rechteprüfung als erste Anweisung:

```sql
if not public.is_admin() then
  raise exception 'No autorizado' using errcode = 'insufficient_privilege';
end if;
```

Betroffen: `publish_workshop`, `publish_casa`, `discard_workshop_changes`,
`discard_casa_changes`, `publish_entity`, `discard_changes`.
`casa_images_touch_casa` ist ein Trigger und braucht die Prüfung nicht — dort
schützt bereits die RLS der auslösenden Anweisung.

Im selben Skript erledigt (B4, B10, B11):

```sql
-- Storage: Grenzen setzen. Der Client lädt ohnehin nur JPEG hoch.
update storage.buckets
   set file_size_limit    = 5242880,          -- 5 MB
       allowed_mime_types = array['image/jpeg']
 where id = 'casa-photos';

-- Statt einer "for all"-Policy getrennte, alle an is_admin() gebunden.
-- Öffentliches Lesen bleibt (die Website braucht es).
drop policy if exists casa_photos_authenticated_write on storage.objects;
create policy casa_photos_admin_insert on storage.objects for insert
  to authenticated
  with check (bucket_id = 'casa-photos' and (select public.is_admin()));
-- analog für update und delete

-- Künftige Tabellen nicht mehr automatisch an anon aufmachen.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

-- search_path überall festnageln.
alter function public.content_snapshot(jsonb)        set search_path = public;
alter function public.mark_unpublished_changes()     set search_path = public;
alter function public.slugify(text)                  set search_path = public;
alter function public.unique_slug(text, text, uuid)  set search_path = public;
```

Zum Schluss `supabase/schema.sql` auf denselben Stand bringen — es ist die
Vorlage für ein frisches Projekt und darf die alte Annahme nicht
weitertragen. Auch der Absatz „Sicherheitsmodell" im Kopf der Datei gehört
korrigiert.

**Prüfung danach:** Zeilen 5–8 der Prüfliste in Abschnitt 4.

---

### Phase 2 — Auslieferung härten *(~2 Stunden, Code)*

**Ziel: B5, B6.**

1. **`vercel.json` anlegen** mit Headern für alle Pfade:
   `Strict-Transport-Security` (2 Jahre, `includeSubDomains`, `preload`),
   `X-Content-Type-Options: nosniff`, `Referrer-Policy:
   strict-origin-when-cross-origin`, `Permissions-Policy` (Kamera, Mikrofon,
   Geolocation, Zahlungen aus), `X-Frame-Options: DENY`. Für `/admin(.*)`
   zusätzlich `X-Robots-Tag: noindex, nofollow` und `Cache-Control: no-store`.

2. **CSP.** Weil es keine externen Ressourcen gibt, ist eine strenge Regel
   erreichbar:

   ```
   default-src 'self';
   script-src 'self';
   style-src 'self' 'unsafe-inline';
   img-src 'self' data: blob: https://wgoukgndhpdfcgtwbpke.supabase.co;
   font-src 'self';
   connect-src 'self' https://wgoukgndhpdfcgtwbpke.supabase.co;
   frame-ancestors 'none';
   base-uri 'self';
   form-action 'self';
   object-src 'none';
   ```

   Ein Detail steht dem im Weg: `dist/admin/index.html` enthält zwei
   Inline-Skripte (der `no-js`→`js`-Umschalter aus `Base.astro` und Astros
   Modul-Wrapper). Mit `script-src 'self'` würden sie blockiert.
   **Empfohlener Weg:** den `is:inline`-Block aus `Base.astro` in eine echte
   Datei unter `public/` auslagern und im `<head>` blockierend einbinden — er
   läuft dann weiterhin vor dem ersten Bild, und `script-src 'self'` bleibt
   ohne `'unsafe-inline'`. Das ist der Unterschied zwischen einer CSP, die
   einen XSS wirklich aufhält, und einer, die nur so aussieht.

   `style-src 'unsafe-inline'` bleibt drin: Astro bettet kleines CSS inline
   ein, und inline **Styles** erlauben keine Skriptausführung. Bewusster
   Kompromiss, kein Versehen.

   Vor dem Scharfschalten einmal als `Content-Security-Policy-Report-Only`
   ausrollen und die Konsole auf beiden Sprachversionen, dem Buch und
   `/admin` durchsehen.

3. **`public/robots.txt`** mit `Disallow: /admin` (ergänzt B6; der
   `X-Robots-Tag` aus Schritt 1 ist die verbindlichere Hälfte).

4. **`noindex` in `Base.astro`** über eine neue optionale Prop, gesetzt von
   `src/pages/admin/index.astro`. Drei Wege zum selben Ziel — bei einer
   Anmeldemaske ist das angemessen.

---

### Phase 3 — Zweiter Faktor *(~4 Stunden, Code + Dashboard)*

**Ziel: B3 vollständig.**

Ab hier hilft ein gestohlenes oder erratenes Passwort allein nicht mehr.
Supabase kann TOTP; `auth.ts` kennt es noch nicht. Nötig sind:

1. `supabase.auth.mfa.enroll()` / `challenge()` / `verify()` in `auth.ts`,
   plus eine kleine Einrichtungsansicht (QR-Code) im Panel.
2. `hasValidSession()` erweitern, damit es nicht nur „Sitzung gültig",
   sondern auch „zweiter Faktor erbracht" (`aal2`) prüft.
3. **Erst wenn die Nutzerin nachweislich eingerichtet und einmal erfolgreich
   angemeldet ist**, die Erzwingung in `is_admin()` nachziehen:

   ```sql
   and (select auth.jwt() ->> 'aal') = 'aal2'
   ```

Die Reihenfolge ist kein Formalismus: andersherum sperrt sich die Nutzerin
zuverlässig aus. Zwischen Schritt 2 und 3 gehört ein gemeinsamer Testlauf.

Ergänzend im Dashboard: **CAPTCHA (Turnstile oder hCaptcha) vor den
Auth-Endpunkten** aktivieren. Das braucht eine kleine Anpassung in `signIn()`
(`options: { captchaToken }`) und nimmt automatisierter Passwort-Raterei die
Grundlage.

---

### Phase 4 — Einen Vorfall überleben *(~3 Stunden)*

**Ziel: B7, B8, B9.** Die Phasen davor senken die Wahrscheinlichkeit. Diese
sorgt dafür, dass ein Vorfall — oder ein Fehlgriff — kein Totalverlust ist.

1. **Nächtliche Sicherung.** GitHub Action, die per `pg_dump` gegen die
   Datenbank läuft und den Dump als Artefakt mit 30 Tagen Aufbewahrung
   ablegt. Die Zugangsdaten kommen aus den Actions-Secrets, nicht ins Repo.
   Ein Dump dieser Datenbank ist ein paar hundert Kilobyte — das ist billig.
2. **Löschen entschärfen.** Statt `DELETE` eine Spalte `deleted_at`; die
   Listenansicht blendet aus, die Datenbank behält 30 Tage. Damit ist der
   gefährlichste Knopf im Panel nicht mehr endgültig. Betrifft
   `store.remove()`, die Views und `entity-list.ts`.
3. **Änderungsprotokoll.** Eine Tabelle `audit_log` (Zeitpunkt, `auth.uid()`,
   Tabelle, Zeilen-ID, Vorgang) plus ein
   `after insert or update or delete`-Trigger auf `workshops`, `casas` und
   `casa_images`. Nur für `is_admin()` lesbar. Beantwortet im Ernstfall die
   einzige Frage, die dann zählt: *was genau ist passiert, und ab wann?*
4. **Deploy-Hook bremsen.** In `notify_deploy_hook()` eine Tabelle
   `deploy_log` führen und nicht öfter als einmal pro Minute auslösen.
   Vercel-Builds dauern ohnehin 30–90 Sekunden; es geht dabei kein einziges
   echtes Ereignis verloren, weil der jeweils nächste Build den vollen
   aktuellen Stand liest.

---

### Phase 5 — Nachweisen statt annehmen *(~1 Stunde)*

Der Ursprungsfehler war nicht ein schlechter Entwurf, sondern eine
**ungeprüfte Annahme** über `authenticated`. Dagegen hilft nur, die Annahmen
automatisch nachzumessen.

`scripts/pruefen-sicherheit.mjs` ins Repo, ausschließlich mit dem öffentlichen
`anon`-Key, ohne Anmeldung, ohne Schreibzugriff:

1. `/auth/v1/settings` → `disable_signup` **muss** `true` sein.
2. `/rest/v1/workshops`, `/rest/v1/casas`, `/rest/v1/casa_images` → jeweils
   `401`.
3. `/rest/v1/workshops_public`, `/rest/v1/casas_public` → `200`.
4. `/rest/v1/admins` → `401` oder `404`, nie `200`.
5. `HEAD` auf die Startseite und auf `/admin/` → erwartete Header vorhanden,
   `/admin/` trägt `X-Robots-Tag: noindex`.

Das Skript läuft in einer GitHub Action nach jedem Deploy und wöchentlich per
Zeitplan. Es ist bewusst so klein, dass es niemand pflegen muss — und schlägt
genau dann an, wenn jemand einen Dashboard-Schalter zurückstellt.

---

## 4. Prüfliste zum Abhaken

| Prüfung | Erwartung | Phase |
|---|---|---|
| `/auth/v1/settings` → `disable_signup` | `true` | 0 |
| Authentication → Users | genau 1 Eintrag | 0 |
| `anon` auf `workshops` / `casas` / `casa_images` | `401` | bereits ✓ |
| `anon` auf `workshops_public` / `casas_public` | `200` | bereits ✓ |
| `select count(*) from public.admins` | `1` | 1 |
| `publish_workshop()` ohne Allowlist-Eintrag | `insufficient_privilege` | 1 |
| Bucket `casa-photos` | `file_size_limit` + `allowed_mime_types` gesetzt | 1 |
| Supabase-Linter (Advisors → Security) | keine neuen Warnungen | 1 |
| CSP auf `/admin/` | vorhanden, `script-src` ohne `'unsafe-inline'` | 2 |
| `/admin/` | `X-Robots-Tag: noindex` | 2 |
| Anmeldung ohne zweiten Faktor | wird abgewiesen | 3 |
| Letzte nächtliche Sicherung | nicht älter als 24 h | 4 |
| Prüfskript in CI | grün | 5 |

---

## 5. Was dieser Plan bewusst nicht tut

- **Kein Server, kein eigenes Backend.** Der statische Aufbau ist eine gute
  Entscheidung für dieses Projekt. RLS *kann* diese Aufgabe tragen — sie muss
  nur die richtige Frage stellen („wer ist das?" statt „ist überhaupt wer
  da?").
- **Keine Rollenabstufung.** Es gibt eine Nutzerin. Die `admins`-Tabelle kann
  später Rollen tragen, braucht sie heute aber nicht.
- **Kein WAF, kein Monitoring-Stack, kein Pentest-Programm.** Das steht in
  keinem Verhältnis zu einem Familienprojekt mit einer Handvoll Workshops.
- **Kein Umschreiben des Entwurf-/Veröffentlichen-Modells.** Das trägt und
  ist einer der Gründe, warum ein Vorfall hier begrenzt bliebe.

---

## 6. Reihenfolge, kurz

**Phase 0 heute** — sie ist der Unterschied zwischen „offen" und „zu" und
kostet eine Viertelstunde im Dashboard. **Phase 1 als Nächstes**, weil
Phase 0 an einem Schalter hängt und Phase 1 an einer Tabellenzeile. Alles
darüber hinaus ist gut investiert, aber nicht dringend.

Phase 0 und Schritt 3 von Phase 1 (Adresse der Nutzerin, Passwortwechsel)
brauchen die Nutzerin selbst — Dashboard-Anmeldung und Passworteingabe mache
ich nicht. Alles andere kann ich umsetzen, sobald der Plan passt.

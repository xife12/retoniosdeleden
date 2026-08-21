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

Wenn das Supabase-Projekt schon läuft und Inhalte enthält, ist **nur dieser
eine Schritt** nötig:

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

`schema.sql` ist auf eine leere Datenbank ausgelegt. `seed.sql` darf nur
einmal laufen, sonst stehen die Inhalte doppelt drin.

### 3. Login-Nutzerin anlegen

Dashboard → **Authentication → Users → Add user** (Add user → Create new user).
E-Mail-Adresse und ein Passwort für die Mutter vergeben, "Auto Confirm User"
aktivieren (kein Bestätigungs-Mail-Versand nötig).

Dieser Login ist der einzige Zugang zu `/admin`.

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

**SQL Editor**, `<DEPLOY-HOOK-URL>` durch die URL aus Schritt 6 ersetzen
(kommt an vier Stellen vor) und ausführen:

```sql
-- pg_net ist auf den meisten Supabase-Projekten schon aktiv; falls nicht,
-- richtet dieser Befehl es ein (sonst manuell unter Database → Extensions).
create extension if not exists pg_net with schema net;

-- Eine Funktion für beide Tabellen -- die Ziel-URL kommt als Trigger-
-- Argument, damit sie nicht doppelt im Code steht.
create or replace function public.notify_deploy_hook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hook_url text := tg_argv[0];
begin
  perform net.http_post(
    url := hook_url,
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
  return coalesce(new, old);
end;
$$;

-- Workshops
drop trigger if exists workshops_deploy_hook on public.workshops;
create trigger workshops_deploy_hook
  after update on public.workshops
  for each row
  when (
    old.published_at is distinct from new.published_at
    or old.status is distinct from new.status
    or old.sort_order is distinct from new.sort_order
  )
  execute function public.notify_deploy_hook('<DEPLOY-HOOK-URL>');

drop trigger if exists workshops_deploy_hook_del on public.workshops;
create trigger workshops_deploy_hook_del
  after delete on public.workshops
  for each row
  execute function public.notify_deploy_hook('<DEPLOY-HOOK-URL>');

-- Lehmhäuser
drop trigger if exists casas_deploy_hook on public.casas;
create trigger casas_deploy_hook
  after update on public.casas
  for each row
  when (
    old.published_at is distinct from new.published_at
    or old.status is distinct from new.status
    or old.sort_order is distinct from new.sort_order
  )
  execute function public.notify_deploy_hook('<DEPLOY-HOOK-URL>');

drop trigger if exists casas_deploy_hook_del on public.casas;
create trigger casas_deploy_hook_del
  after delete on public.casas
  for each row
  execute function public.notify_deploy_hook('<DEPLOY-HOOK-URL>');
```

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

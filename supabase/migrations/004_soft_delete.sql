-- ============================================================================
-- Migration 004 — Löschen entschärfen (weiches Löschen)
-- (Phase 4 aus PLAN-SICHERHEIT.md, Punkt 2, Befund B7)
--
-- Zwingende Voraussetzung: 003_audit_und_deploy_bremse.sql muss bereits
-- gelaufen sein -- Abschnitt 5 hier legt die vier Deploy-Hook-Trigger aus
-- 003 neu an und setzt dafür voraus, dass public.notify_deploy_hook() schon
-- existiert (definiert sie NICHT neu, siehe dort). 003 selbst setzt wiederum
-- 002_admin_allowlist.sql voraus -- in der Praxis also einfach der Reihe
-- nach 001 bis 004 laufen lassen.
--
-- Im Supabase SQL Editor als Ganzes ausführen. Der Editor führt ein
-- eingefügtes Skript als EINE Transaktion aus: ein Fehler irgendwo rollt
-- alles zurück, die Datenbank bleibt exakt im Vorzustand (siehe
-- HANDOFF-ADMIN.md, Fallstrick 2). Das Skript ist idempotent: Spalte und
-- Indizes stehen unter IF NOT EXISTS, Funktionen unter CREATE OR REPLACE,
-- Trigger werden vor dem Neuanlegen per DROP IF EXISTS entfernt -- ein
-- zweiter Lauf ändert nichts mehr und setzt auch keinen bereits laufenden
-- 30-Tage-Countdown zurück.
--
-- VOR DEM AUSFÜHREN ERSETZEN: der Platzhalter <DEPLOY-HOOK-URL> kommt an
-- VIER Stellen vor (dieselben vier Trigger wie in 003, ganz unten in
-- Abschnitt 5) -- durch die echte Vercel-Deploy-Hook-URL ersetzen, an allen
-- vier Stellen gleich (siehe SETUP-BACKEND.md Abschnitt C, Schritt 6).
--
-- DAS PROBLEM (Befund B7)
-- ------------------------
-- store.remove() setzte bisher ein echtes DELETE ab. Auf dem Supabase-
-- Free-Tier gibt es keine Point-in-Time-Recovery -- ein Fehlgriff auf dem
-- Handy oder ein Angreifer mit einem gültigen Zugang löscht Inhalte damit
-- endgültig, und casa_images hängt per "on delete cascade" mit dran.
--
-- WAS PASSIERT
-- ------------
--  1. Neue Spalte deleted_at auf workshops und casas, plus ein Teilindex,
--     der genau die Abfrage bedient, die ab jetzt überall zusätzlich läuft.
--  2. public.content_snapshot() schließt deleted_at zusätzlich aus dem
--     Inhaltsteil einer Zeile aus -- KRITISCH, ausführliche Begründung im
--     Kommentar direkt bei der Funktion weiter unten.
--  3. workshops_public / casas_public werden mit der zusätzlichen Bedingung
--     "deleted_at is null" neu angelegt -- ansonsten zeichengenau aus
--     schema.sql übernommen, weil sie die einzige Datenquelle des
--     Website-Builds sind.
--  4. public.soft_delete_cleanup() entfernt Zeilen, deren deleted_at älter
--     als 30 Tage ist, endgültig. Läuft nicht von selbst -- siehe den
--     auskommentierten pg_cron-Vorschlag direkt dabei, im selben Stil wie
--     audit_log_cleanup() in 003.
--  5. Die vier Deploy-Hook-Trigger aus 003 werden neu angelegt (nicht die
--     Funktion notify_deploy_hook() selbst -- die bleibt unverändert): die
--     beiden UPDATE-Trigger bekommen zusätzlich "or old.deleted_at is
--     distinct from new.deleted_at" in ihrer when-Bedingung. Ohne das löst
--     das Löschen eines veröffentlichten Eintrags keinen neuen Build aus,
--     und er bliebe auf der Live-Site stehen, obwohl er im Panel schon
--     verschwunden ist.
--
-- WAS SICH FÜR DIE NUTZERIN ÄNDERT
-- ---------------------------------
-- "Eliminar" wirkt in Panel und Website weiterhin sofort. In der Datenbank
-- bleibt die Zeile aber 30 Tage bestehen, bevor sie endgültig verschwindet
-- -- ein Fehlgriff lässt sich in diesem Fenster von Hand im SQL Editor
-- rückgängig machen:
--
--   update public.workshops set deleted_at = null where id = '...';
--   update public.casas     set deleted_at = null where id = '...';
--
-- Ein eigener "Wiederherstellen"-Knopf im Panel ist nicht Teil dieser
-- Migration.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Spalte deleted_at + Teilindex
--
-- Kein expliziter Default nötig: timestamptz ohne "default" ist bereits
-- NULL, genau wie schon published_at in schema.sql. NULL heißt "nicht
-- gelöscht" -- der weitaus häufigste Fall.
--
-- Der Teilindex deckt genau die Abfrage ab, die ab jetzt praktisch überall
-- zusätzlich läuft: "where deleted_at is null" (store.list(), siehe
-- store.ts) beziehungsweise die um dieselbe Bedingung erweiterten
-- öffentlichen Views weiter unten. sort_order als indizierte Spalte, weil
-- sowohl store.list() als auch der äußere ORDER BY in
-- fetch-workshops.ts/fetch-casas.ts genau danach sortieren -- ein Index nur
-- auf "id" wäre hier wirkungslos, weil id ohnehin schon Primärschlüssel
-- ist und in keiner dieser Abfragen als Sortier- oder Filterkriterium
-- vorkommt. Ein TEILindex statt eines normalen Index, weil gelöschte
-- Zeilen (nach spätestens 30 Tagen wieder weg, siehe Abschnitt 4) darin gar
-- nicht erst mitgeführt werden müssen -- kleiner und schneller als ein
-- Index über den gesamten Bestand.
-- ----------------------------------------------------------------------------
alter table public.workshops add column if not exists deleted_at timestamptz;
alter table public.casas     add column if not exists deleted_at timestamptz;

create index if not exists workshops_active_sort_idx
  on public.workshops (sort_order)
  where deleted_at is null;

create index if not exists casas_active_sort_idx
  on public.casas (sort_order)
  where deleted_at is null;


-- ----------------------------------------------------------------------------
-- 2. content_snapshot() um deleted_at ergänzen (KRITISCH)
-- ----------------------------------------------------------------------------

/**
 * Inhaltsteil einer Zeile: alles außer den Verwaltungsspalten.
 * Genau das wird veröffentlicht und genau das entscheidet, ob es
 * unveröffentlichte Änderungen gibt.
 *
 * `sort_order` und `status` sind bewusst NICHT Inhalt: Umsortieren und
 * Archivieren sind Sofortaktionen aus der Liste, keine Editor-Änderungen.
 *
 * ERGÄNZT IN 004_soft_delete.sql: `deleted_at` gehört aus genau demselben
 * Grund in diese Liste wie `status` und `sort_order` -- weiches Löschen ist
 * ebenfalls eine Sofortaktion aus der Liste, kein Editor-Inhalt. Fehlte es
 * hier, passierten zwei Dinge, die leicht übersehen werden und genau die
 * Art Detail sind, über die der nächste Mensch stolpert:
 *
 *   1. Der BEFORE-Trigger mark_unpublished_changes() vergleicht
 *      content_snapshot(new) mit content_snapshot(old). Bliebe deleted_at
 *      darin sichtbar, wäre jedes Löschen (das ja nur noch ein UPDATE auf
 *      deleted_at ist, siehe store.remove()) eine "inhaltliche Änderung"
 *      und würde has_unpublished_changes = true setzen -- ein gelöschter,
 *      unsichtbarer Eintrag zeigte danach fälschlich "Cambios sin
 *      publicar", sobald er innerhalb der 30-Tage-Frist wiederhergestellt
 *      wird, obwohl an seinem eigentlichen Inhalt gar nichts geändert wurde.
 *   2. Beim nächsten publish_workshop()/publish_casa() für diese Zeile
 *      läse content_snapshot() erneut die volle Zeile inklusive deleted_at
 *      und schriebe den Wert mit in published_payload hinein -- Datenmüll
 *      im veröffentlichten Schnappschuss, der dort unbemerkt hängen bliebe.
 *
 * Mit deleted_at in der Ausschlussliste passiert beides nicht: Löschen und
 * Wiederherstellen sind für den Veröffentlichungsstatus so unsichtbar, wie
 * es Umsortieren und Archivieren bereits sind.
 */
-- Hinweis zu "set search_path = public" unten: in der ursprünglichen
-- Definition (schema.sql / 001_draft_publish.sql) stand das noch nicht
-- dabei -- 002_admin_allowlist.sql hat es nachträglich per
-- "alter function ... set search_path" ergänzt (Befund B10). CREATE OR
-- REPLACE FUNCTION ersetzt aber die komplette Funktionsdefinition
-- inklusive solcher separat gesetzten Konfigurationswerte; ohne die Zeile
-- hier würde dieser Lauf die Härtung aus 002 für genau diese eine Funktion
-- wieder stillschweigend rückgängig machen.
create or replace function public.content_snapshot(p_row jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select p_row - array[
    'id', 'created_at', 'updated_at', 'status', 'sort_order',
    'published_payload', 'published_at', 'has_unpublished_changes',
    'deleted_at'
  ]::text[];
$$;


-- ----------------------------------------------------------------------------
-- 3. Öffentliche Views neu anlegen -- gelöschte Zeilen nie sichtbar
--
-- Zeichengenau aus schema.sql übernommen, einzige Änderung ist die
-- zusätzliche Zeile "and ... deleted_at is null" am Ende jedes WHERE.
-- Jede andere Abweichung würde fetch-workshops.ts oder fetch-casas.ts
-- brechen, die per select('*') alle hier definierten Spalten erwarten.
-- ----------------------------------------------------------------------------
drop view if exists public.workshops_public;
create view public.workshops_public as
select
  (w.published_payload ->> 'slug')                            as slug,
  (w.published_payload ->> 'theme_id')                        as theme_id,
  (w.published_payload ->> 'price')::numeric                  as price,
  (w.published_payload ->> 'currency')                        as currency,
  (w.published_payload ->> 'hours')::numeric                  as hours,
  (w.published_payload ->> 'max_people')::integer             as max_people,
  (w.published_payload ->> 'instructor_first_name')           as instructor_first_name,
  (w.published_payload ->> 'instructor_last_name')            as instructor_last_name,
  coalesce(w.published_payload -> 'dates', '[]'::jsonb)       as dates,
  (w.published_payload ->> 'show_programme')::boolean         as show_programme,
  (w.published_payload ->> 'show_included')::boolean          as show_included,
  (w.published_payload ->> 'show_bring')::boolean             as show_bring,
  (w.published_payload ->> 'show_for_whom')::boolean          as show_for_whom,
  (w.published_payload ->> 'show_languages')::boolean         as show_languages,
  (w.published_payload ->> 'show_meeting_point')::boolean     as show_meeting_point,
  coalesce(w.published_payload -> 'translations', '{}'::jsonb) as translations,
  w.sort_order,
  w.published_at
from public.workshops w
where w.status = 'published'
  and w.published_payload is not null
  and w.deleted_at is null;

drop view if exists public.casas_public;
create view public.casas_public as
select
  (c.published_payload ->> 'slug')                             as slug,
  (c.published_payload ->> 'build_status')                     as build_status,
  (c.published_payload ->> 'airbnb_url')                       as airbnb_url,
  (c.published_payload ->> 'beds')::integer                    as beds,
  (c.published_payload ->> 'guests')::integer                  as guests,
  (c.published_payload ->> 'area')::numeric                    as area,
  (c.published_payload ->> 'bedrooms')::integer                as bedrooms,
  (c.published_payload ->> 'bathrooms')::integer               as bathrooms,
  coalesce(c.published_payload -> 'amenities', '[]'::jsonb)    as amenities,
  coalesce(c.published_payload -> 'highlights', '[]'::jsonb)   as highlights,
  coalesce(c.published_payload -> 'translations', '{}'::jsonb) as translations,
  coalesce(c.published_payload -> 'images', '[]'::jsonb)       as images,
  c.sort_order,
  c.published_at
from public.casas c
where c.status = 'published'
  and c.published_payload is not null
  and c.deleted_at is null;

-- Ein DROP VIEW + CREATE VIEW legt aus Sicht von Postgres ein neues Objekt
-- an. Supabase vergibt per ALTER DEFAULT PRIVILEGES automatisch ALL auf
-- neue Objekte im Schema public an anon -- deshalb wie in schema.sql erst
-- konsequent wegnehmen, dann gezielt nur SELECT wieder vergeben, statt sich
-- auf die (in 002 versuchte, aber nicht auf jedem Projekt garantiert
-- durchsetzbare) Rücknahme der Vorgaberechte zu verlassen.
revoke all on public.workshops_public from anon, authenticated;
revoke all on public.casas_public from anon, authenticated;

grant select on public.workshops_public to anon, authenticated;
grant select on public.casas_public to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4. Aufräumfunktion: nach 30 Tagen endgültig löschen
-- ----------------------------------------------------------------------------

/**
 * Entfernt Zeilen, deren weiches Löschen mehr als 30 Tage zurückliegt --
 * endgültig, aus workshops und casas gemeinsam. 30 Tage sind die in
 * PLAN-SICHERHEIT.md (Befund B7) zugesagte Frist: genug Zeit, damit ein
 * Fehlgriff auffällt, ohne dass die Datenbank unbegrenzt wächst.
 *
 * casa_images hängt an casas per "on delete cascade" -- die Bildzeilen
 * verschwinden hier automatisch mit. Die zugehörigen Dateien im
 * Storage-Bucket räumt das NICHT auf (dafür ist normalerweise
 * image-upload.ts beim gezielten Löschen einzelner Fotos zuständig); wer
 * das ergänzen will, müsste hier zusätzlich die storage_path-Werte lesen
 * und über die Storage-API entfernen, BEVOR die Zeilen verschwinden.
 *
 * Nebeneffekt, der keinen weiteren Code braucht: workshops_audit_log /
 * casas_audit_log aus 003 feuern ganz regulär auch für dieses DELETE --
 * die endgültige Löschung nach 30 Tagen landet also automatisch mit vollem
 * old_data im Protokoll, genau wie jedes andere DELETE.
 *
 * Läuft NICHT von selbst -- siehe den auskommentierten pg_cron-Vorschlag
 * direkt darunter, im selben Stil wie audit_log_cleanup() in
 * 003_audit_und_deploy_bremse.sql.
 */
create or replace function public.soft_delete_cleanup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.workshops
   where deleted_at is not null
     and deleted_at < now() - interval '30 days';

  delete from public.casas
   where deleted_at is not null
     and deleted_at < now() - interval '30 days';
end;
$$;

-- Kein Grant an authenticated: Aufräumen ist Wartung, keine Backend-
-- Funktion -- wie schon audit_log_cleanup() in 003. Ausführbar bleibt sie
-- für die Postgres-Rolle selbst (SQL Editor) und für pg_cron, siehe unten.
revoke all on function public.soft_delete_cleanup() from public;

-- ----------------------------------------------------------------------------
-- Automatisches Aufräumen (optional, NICHT Teil dieser Migration)
--
-- pg_cron ist auf Supabase verfügbar, muss aber im Dashboard aktiviert
-- werden (Database → Extensions → pg_cron). Ist die Erweiterung aktiv,
-- richtet folgender Aufruf einmal im SQL Editor einen täglichen Lauf ein,
-- 03:00 UTC, außerhalb jeder plausiblen Tippzeit -- direkt neben dem
-- gleichartigen Zeitplan für audit_log_cleanup, falls der schon eingerichtet
-- ist:
--
-- select cron.schedule(
--   'soft_delete_cleanup',
--   '0 3 * * *',
--   $$select public.soft_delete_cleanup();$$
-- );
--
-- Zum Entfernen des Zeitplans:
-- select cron.unschedule('soft_delete_cleanup');
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- 5. Deploy-Hook-Trigger neu anlegen -- deleted_at löst jetzt auch aus
--
-- Übernommen aus 003_audit_und_deploy_bremse.sql, unverändert bis auf die
-- zusätzliche "or old.deleted_at is distinct from new.deleted_at"-Zeile in
-- den beiden UPDATE-Triggern. Die Funktion public.notify_deploy_hook()
-- selbst gehört weiterhin 003 -- sie wird hier weder neu angelegt noch
-- verändert, nur erneut referenziert.
--
-- Die beiden DELETE-Trigger (…_del) brauchen keine Anpassung: sie feuern
-- schon heute bei JEDEM DELETE ohne eigene when-Bedingung. Das bleibt
-- richtig so -- ein echtes DELETE kommt jetzt zwar nur noch selten vor
-- (direkt im SQL Editor oder durch soft_delete_cleanup() nach 30 Tagen),
-- soll dann aber unverändert einen Build auslösen. Im Fall von
-- soft_delete_cleanup() ist dieser Build meist überflüssig, weil die Zeile
-- schon 30 Tage zuvor beim weichen Löschen aus den Views verschwunden ist
-- -- aber harmlos: notify_deploy_hook() bremst ohnehin auf höchstens einen
-- Aufruf pro Minute, und ein Build zu viel kostet nur eine ungenutzte
-- Vercel-Minute, nie einen falschen Inhalt.
--
-- <DEPLOY-HOOK-URL> ersetzen -- kommt hier an vier Stellen vor.
-- ----------------------------------------------------------------------------
drop trigger if exists workshops_deploy_hook on public.workshops;
create trigger workshops_deploy_hook
  after update on public.workshops
  for each row
  when (
    old.published_at is distinct from new.published_at
    or old.status is distinct from new.status
    or old.sort_order is distinct from new.sort_order
    or old.deleted_at is distinct from new.deleted_at
  )
  execute function public.notify_deploy_hook('<DEPLOY-HOOK-URL>');

drop trigger if exists workshops_deploy_hook_del on public.workshops;
create trigger workshops_deploy_hook_del
  after delete on public.workshops
  for each row
  execute function public.notify_deploy_hook('<DEPLOY-HOOK-URL>');

drop trigger if exists casas_deploy_hook on public.casas;
create trigger casas_deploy_hook
  after update on public.casas
  for each row
  when (
    old.published_at is distinct from new.published_at
    or old.status is distinct from new.status
    or old.sort_order is distinct from new.sort_order
    or old.deleted_at is distinct from new.deleted_at
  )
  execute function public.notify_deploy_hook('<DEPLOY-HOOK-URL>');

drop trigger if exists casas_deploy_hook_del on public.casas;
create trigger casas_deploy_hook_del
  after delete on public.casas
  for each row
  execute function public.notify_deploy_hook('<DEPLOY-HOOK-URL>');


-- ============================================================================
-- Kontrolle
--
-- Diese Abfrage nach dem Lauf einzeln ausführen. Erwartet wird:
--   workshops_hat_spalte / casas_hat_spalte   = true
--   content_snapshot_ohne_deleted_at          = 0  (deleted_at wird ausgeschlossen)
--   views_ohne_bedingung                      = 0  (beide Views filtern deleted_at)
-- ============================================================================
--
--  select
--    exists (select 1 from information_schema.columns
--             where table_schema = 'public' and table_name = 'workshops'
--               and column_name = 'deleted_at')             as workshops_hat_spalte,
--    exists (select 1 from information_schema.columns
--             where table_schema = 'public' and table_name = 'casas'
--               and column_name = 'deleted_at')             as casas_hat_spalte,
--    (select count(*) from pg_proc p
--       join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public' and p.proname = 'content_snapshot'
--        and p.prosrc not like '%deleted_at%')               as content_snapshot_ohne_deleted_at,
--    (select count(*) from pg_views
--      where schemaname = 'public'
--        and viewname in ('workshops_public', 'casas_public')
--        and definition not like '%deleted_at%')              as views_ohne_bedingung;
--
-- Gegenprobe von außen, ohne Anmeldung: ein Eintrag, der im Panel gelöscht
-- wurde, darf über /rest/v1/workshops_public bzw. /rest/v1/casas_public
-- nicht mehr auftauchen, taucht aber weiterhin in
-- "select * from public.workshops where id = '...'" im SQL Editor auf
-- (mit gesetztem deleted_at) -- erst nach 30 Tagen bzw. nach manuellem
-- Aufruf von soft_delete_cleanup() endgültig weg.
-- ============================================================================

-- ============================================================================
-- Migration 003 — Änderungsprotokoll und Deploy-Hook-Bremse
-- (Phase 4 aus PLAN-SICHERHEIT.md, Befunde B8 und B9)
--
-- Läuft NACH supabase/migrations/002_admin_allowlist.sql -- diese Migration
-- verlässt sich auf public.is_admin(), das 002 anlegt, und definiert weder
-- is_admin() noch admins selbst neu (002 vorher ausführen, sonst schlägt
-- die Policy weiter unten mit "function is_admin() does not exist" fehl).
-- Im Supabase SQL Editor als Ganzes ausführen. Das Skript ist idempotent:
-- ein zweiter Lauf ändert nichts mehr und setzt auch keinen bestehenden
-- Zustand zurück (weder schon geschriebene Protokollzeilen noch den
-- Zeitpunkt der letzten Deploy-Hook-Auslösung).
--
-- VOR DEM AUSFÜHREN ERSETZEN: der Platzhalter <DEPLOY-HOOK-URL> kommt an
-- VIER Stellen vor (je ein Update- und ein Delete-Trigger für workshops
-- und casas, ganz unten in Abschnitt 2) -- durch die echte Vercel-Deploy-
-- Hook-URL aus SETUP-BACKEND.md Abschnitt C, Schritt 6 ersetzen, an allen
-- vier Stellen gleich.
--
-- Was passiert:
--  1. Tabelle audit_log protokolliert jede Änderung an workshops, casas
--     und casa_images: wer (auth.uid(), darf NULL sein), wann, welche
--     Tabelle/Zeile/Vorgang, bei DELETE die vollständige alte Zeile, bei
--     UPDATE nur die tatsächlich geänderten Blattfelder (siehe audit_diff()
--     weiter unten -- wichtig wegen des Autosave-Verhaltens beim Tippen).
--     Lesbar nur für is_admin(), geschrieben ausschließlich durch die
--     security-definer-Triggerfunktion. audit_log_cleanup() entfernt
--     Zeilen älter als 180 Tage; ein pg_cron-Vorschlag dafür steht als
--     Kommentar direkt bei der Funktion, aber NICHT aktiv in dieser
--     Migration.
--  2. public.notify_deploy_hook() wird ersetzt: löst höchstens einmal pro
--     Minute tatsächlich aus (Tabelle deploy_log hält den Zeitpunkt der
--     letzten Auslösung fest). Die Trigger-Bedingungen (nur UPDATE mit
--     published_at/status/sort_order-Änderung, sowie DELETE, nie INSERT)
--     bleiben unverändert -- siehe Begründung direkt bei der Funktion.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Änderungsprotokoll (Befund B8)
-- ----------------------------------------------------------------------------

/**
 * Eine Zeile pro Änderung an workshops, casas oder casa_images.
 *
 * changed_by ist bewusst OHNE Fremdschlüssel auf auth.users: das Protokoll
 * soll auch dann noch aussagekräftig sein, wenn das zugehörige Konto später
 * gelöscht wird. Mit einer Fremdschlüsselbindung müsste man entweder das
 * Löschen eines Kontos blockieren, solange alte Protokollzeilen darauf
 * verweisen (unpraktisch), oder beim Löschen auf NULL setzen (löscht damit
 * rückwirkend genau die Spur, die im Ernstfall zählt). NULL ist ohnehin ein
 * gültiger, aussagekräftiger Wert: Änderungen direkt im SQL Editor oder aus
 * einer Migration heraus laufen ohne auth.uid().
 *
 * id ist "generated ALWAYS" (nicht "by default") als identity: damit kann
 * niemand -- auch nicht die schreibende Triggerfunktion selbst -- eine
 * eigene id unterschieben. Es gibt ohnehin genau einen Schreibweg (siehe
 * audit_log_write()), aber diese Sperre kostet nichts und schließt jede
 * künftige Umgehung von vornherein aus.
 */
create table if not exists public.audit_log (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  changed_by     uuid,
  table_name     text not null
    constraint audit_log_table_name_check
    check (table_name in ('workshops', 'casas', 'casa_images')),
  row_id         uuid not null,
  operation      text not null
    constraint audit_log_operation_check
    check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  -- Nur bei DELETE gefüllt: die vollständige Zeile, wie sie unmittelbar vor
  -- dem Löschen aussah. Das ist der eigentliche Wert dieser Tabelle -- die
  -- Rekonstruktionsgrundlage nach einem Vorfall.
  old_data       jsonb,
  -- Nur bei UPDATE gefüllt: ein schlanker Blattwert-Diff statt der ganzen
  -- Zeile, siehe audit_diff() weiter unten.
  changed_fields jsonb,
  -- Hält den Vertrag der drei Vorgangsarten auch dann ein, wenn die
  -- Triggerfunktion später einmal fehlerhaft geändert wird.
  constraint audit_log_payload_check check (
    case operation
      when 'INSERT' then old_data is null and changed_fields is null
      when 'UPDATE' then old_data is null
      when 'DELETE' then changed_fields is null and old_data is not null
    end
  )
);

-- Für "zeig mir die Historie dieser einen Zeile" (neueste zuerst).
create index if not exists audit_log_table_row_idx
  on public.audit_log (table_name, row_id, created_at desc);

-- Führende created_at-Spalte extra, weil audit_log_cleanup() genau danach
-- filtert -- der obige Index taugt dafür nicht (table_name steht vorn).
create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at);

/**
 * Schlanker Feld-Diff zwischen zwei Zeilen (als jsonb) für audit_log bei
 * UPDATE. Naives Diffing auf Spaltenebene würde bei jedem Tastendruck die
 * GESAMTE translations-Spalte (beide Sprachen, alle Textfelder) erneut
 * speichern: der Editor schreibt bei jedem Autosave immer das komplette
 * Draft-Objekt zurück (siehe workshopPatch()/casaPatch() in drafts.ts),
 * auch wenn nur ein einzelnes Wort geändert wurde. Deshalb steigt diese
 * Funktion in jsonb-OBJEKTE rekursiv hinein und vergleicht bis auf
 * Blattebene -- nur das tatsächlich geänderte Blatt (z. B.
 * translations.es.title) landet im Protokoll, nicht translations.es oder
 * gar translations komplett.
 *
 * jsonb-ARRAYS (dates, programme, included, bring, amenities, highlights)
 * werden bewusst als Ganzes behandelt: eine sinnvolle Positions-/Element-
 * Diff wäre deutlich komplexer (Einfügen/Löschen/Umsortieren einzelner
 * Einträge), und Arrays sind im Vergleich zu den zweisprachigen
 * Textobjekten klein. Ändert sich ein Array, steht es komplett im
 * Protokoll -- immer noch weit schlanker als die ganze Zeile.
 *
 * Fehlt ein Schlüssel auf einer Seite, liefert -> dafür SQL NULL zurück;
 * jsonb_build_object() speichert das korrekt als JSON null, nicht als
 * fehlenden Schlüssel -- das Protokoll zeigt also sichtbar "wurde null/
 * gelöscht" statt einfach zu schweigen.
 */
create or replace function public.audit_diff(p_old jsonb, p_new jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_key    text;
begin
  for v_key in
    select key from jsonb_object_keys(coalesce(p_old, '{}'::jsonb)) as key
    union
    select key from jsonb_object_keys(coalesce(p_new, '{}'::jsonb)) as key
  loop
    if (p_new -> v_key) is distinct from (p_old -> v_key) then
      if jsonb_typeof(p_old -> v_key) = 'object' and jsonb_typeof(p_new -> v_key) = 'object' then
        v_result := v_result
          || jsonb_build_object(v_key, public.audit_diff(p_old -> v_key, p_new -> v_key));
      else
        v_result := v_result || jsonb_build_object(v_key, p_new -> v_key);
      end if;
    end if;
  end loop;

  return v_result;
end;
$$;

/**
 * Eine gemeinsame Triggerfunktion für workshops, casas und casa_images --
 * TG_TABLE_NAME/TG_OP unterscheiden, welche Tabelle und welcher Vorgang.
 * security definer, weil authenticated absichtlich KEIN Schreibrecht auf
 * audit_log bekommt (siehe Rechte-Abschnitt unten): die Funktion läuft als
 * Eigentümerin der Tabelle und damit an deren RLS vorbei, so wie schon
 * casa_images_touch_casa() es für casas vormacht. Eine eigene is_admin()-
 * Prüfung braucht es hier nicht -- wer workshops/casas/casa_images
 * überhaupt ändern darf, entscheidet bereits die RLS der auslösenden
 * Anweisung (siehe 002_admin_allowlist.sql).
 *
 * updated_at wird vor dem Diff aus beiden Seiten entfernt: der BEFORE-
 * Trigger mark_unpublished_changes() setzt ihn bei jedem UPDATE neu, egal
 * ob sich sonst etwas geändert hat -- ohne diesen Abzug stünde in JEDER
 * einzelnen changed_fields-Zeile ein neuer Zeitstempel, der ohnehin exakt
 * dem created_at dieser audit_log-Zeile entspricht. Reine Wiederholung,
 * kein zusätzlicher Erkenntniswert.
 */
create or replace function public.audit_log_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (changed_by, table_name, row_id, operation)
    values (auth.uid(), tg_table_name, new.id, tg_op);
    return new;

  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (changed_by, table_name, row_id, operation, changed_fields)
    values (
      auth.uid(), tg_table_name, new.id, tg_op,
      public.audit_diff(to_jsonb(old) - 'updated_at', to_jsonb(new) - 'updated_at')
    );
    return new;

  else -- DELETE
    insert into public.audit_log (changed_by, table_name, row_id, operation, old_data)
    values (auth.uid(), tg_table_name, old.id, tg_op, to_jsonb(old));
    return old;
  end if;
end;
$$;

drop trigger if exists workshops_audit_log on public.workshops;
create trigger workshops_audit_log
  after insert or update or delete on public.workshops
  for each row execute function public.audit_log_write();

drop trigger if exists casas_audit_log on public.casas;
create trigger casas_audit_log
  after insert or update or delete on public.casas
  for each row execute function public.audit_log_write();

drop trigger if exists casa_images_audit_log on public.casa_images;
create trigger casa_images_audit_log
  after insert or update or delete on public.casa_images
  for each row execute function public.audit_log_write();

-- Rechte: nur is_admin() darf lesen, niemand darf schreiben/ändern/löschen
-- -- das übernimmt ausschließlich audit_log_write() weiter oben.
alter table public.audit_log enable row level security;

-- Supabase vergibt per ALTER DEFAULT PRIVILEGES automatisch Rechte an anon
-- auf neu angelegte Tabellen -- wie schon in schema.sql erst konsequent
-- wegnehmen, dann gezielt neu vergeben.
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read
  on public.audit_log for select
  to authenticated
  using ((select public.is_admin()));

-- Bewusst KEINE Policy für insert/update/delete: audit_log_write() läuft
-- als Eigentümerin der Tabelle ohnehin an RLS vorbei, jede Policy hier
-- wäre entweder wirkungslos oder eine ungewollte zusätzliche Schreibtür.

/**
 * Entfernt Protokollzeilen älter als 180 Tage. Der Zeitraum ist bewusst
 * großzügig: ein Vorfall, der erst Wochen später auffällt, soll noch
 * rekonstruierbar sein, ohne dass die Tabelle unbegrenzt wächst. Läuft
 * NICHT von selbst -- siehe den auskommentierten pg_cron-Vorschlag direkt
 * darunter.
 */
create or replace function public.audit_log_cleanup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.audit_log where created_at < now() - interval '180 days';
end;
$$;

-- Kein Grant an authenticated: Aufräumen ist Wartung, keine Backend-
-- Funktion. Ausführbar bleibt sie für die Postgres-Rolle selbst (SQL
-- Editor) und für pg_cron, siehe unten.
revoke all on function public.audit_log_cleanup() from public;

-- ----------------------------------------------------------------------------
-- Automatisches Aufräumen (optional, NICHT Teil dieser Migration)
--
-- pg_cron ist auf Supabase verfügbar, muss aber im Dashboard aktiviert
-- werden (Database → Extensions → pg_cron). Ist die Erweiterung aktiv,
-- richtet folgender Aufruf einmal im SQL Editor einen täglichen Lauf ein,
-- 03:00 UTC, außerhalb jeder plausiblen Tippzeit:
--
-- select cron.schedule(
--   'audit_log_cleanup',
--   '0 3 * * *',
--   $$select public.audit_log_cleanup();$$
-- );
--
-- Zum Entfernen des Zeitplans:
-- select cron.unschedule('audit_log_cleanup');
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 2. Deploy-Hook bremsen (Befund B9)
-- ----------------------------------------------------------------------------

/**
 * Hält ausschließlich den Zeitpunkt der letzten tatsächlichen Deploy-Hook-
 * Auslösung fest -- keine Historie, kein Wachstum. Die boolesche Spalte id
 * ist ein gängiger Kniff, um eine Tabelle dauerhaft auf genau eine Zeile zu
 * begrenzen: id kann per CHECK nur true sein, ein zweiter Schlüsselwert
 * kann also nie existieren.
 */
create table if not exists public.deploy_log (
  id           boolean primary key default true check (id = true),
  triggered_at timestamptz
);

-- Genau eine Zeile, für alle Zeit. NULL heißt "noch nie ausgelöst" -- das
-- allererste Ereignis nach dieser Migration soll sofort auslösen dürfen,
-- nicht künstlich eine Minute warten.
insert into public.deploy_log (id, triggered_at)
values (true, null)
on conflict (id) do nothing;

alter table public.deploy_log enable row level security;
-- Bewusst KEINE Policy: deploy_log ist ein rein interner Zähler für
-- notify_deploy_hook() weiter unten, niemand liest oder schreibt ihn über
-- PostgREST.
revoke all on public.deploy_log from anon, authenticated;

/**
 * Wie bisher: eine Funktion für beide Tabellen, die Ziel-URL kommt als
 * Trigger-Argument (tg_argv[0]), damit sie nicht doppelt im Code steht.
 * search_path deckt weiterhin beide üblichen Ablageorte von pg_net ab
 * (net und extensions) -- deshalb bleibt auch der Aufruf von http_post()
 * bewusst unqualifiziert, statt ihn auf ein Schema festzunageln.
 *
 * Neu: löst höchstens einmal pro Minute tatsächlich aus. Läuft ein
 * Ereignis in die Sperrfrist, wird der Aufruf übersprungen -- ohne Fehler,
 * ohne Wiederholungsversuch. Das kostet keine Genauigkeit: ein Vercel-
 * Build dauert ohnehin 30-90 Sekunden und liest dabei immer den vollen
 * aktuellen Stand aus workshops_public/casas_public, nicht nur das eine
 * Ereignis, das ihn ausgelöst hat. Jede Änderung, die während der
 * Sperrfrist übersprungen wird, ist also spätestens im nächsten Build
 * enthalten -- der wird ohnehin ausgelöst, sobald die Minute um ist und
 * ein weiteres Ereignis eintrifft, und baut dann zwangsläufig alles
 * Zwischenzeitliche mit. Verloren geht nur die Zahl der Builds, nie ein
 * Inhalt.
 *
 * "for update" sperrt die eine Zeile in deploy_log für die Dauer der
 * Transaktion: treffen zwei Ereignisse quasi gleichzeitig ein, wartet das
 * zweite auf das erste und sieht danach den frisch gesetzten Zeitstempel
 * -- so kommen nicht beide an der Sperrfrist vorbei.
 */
create or replace function public.notify_deploy_hook()
returns trigger
language plpgsql
security definer
set search_path = extensions, net, public
as $$
declare
  hook_url text := tg_argv[0];
  v_last   timestamptz;
begin
  select triggered_at into v_last
    from public.deploy_log
   where id = true
     for update;

  if v_last is not null and now() - v_last < interval '1 minute' then
    return coalesce(new, old);
  end if;

  update public.deploy_log set triggered_at = now() where id = true;

  perform http_post(
    url := hook_url,
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  return coalesce(new, old);
end;
$$;

-- Trigger-Bedingungen unverändert gegenüber SETUP-BACKEND.md Abschnitt D:
-- nur UPDATE mit Änderung an published_at/status/sort_order, sowie DELETE.
-- Nie INSERT -- eine neu angelegte Zeile steht immer auf status='draft'
-- und ist in keiner öffentlichen View sichtbar, dafür gibt es nichts neu
-- zu bauen. Hier erneut angelegt (nicht nur die Funktion ersetzt), damit
-- diese Migration für sich allein funktioniert, unabhängig davon, ob
-- SETUP-BACKEND.md Abschnitt D bereits von Hand gelaufen ist.
--
-- <DEPLOY-HOOK-URL> ersetzen -- kommt hier an vier Stellen vor.
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

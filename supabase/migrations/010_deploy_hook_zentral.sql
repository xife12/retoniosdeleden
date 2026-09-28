-- ============================================================================
-- 010 -- Deploy-Hook-URL an EINER Stelle statt als Argument in jedem Trigger
--
-- WARUM DIESE MIGRATION EXISTIERT
-- --------------------------------------------------------------------------
-- Gemeldet am 24. September 2026: Aenderungen an Modulos und On Tour werden
-- im Panel gespeichert und (seit 009) auch fehlerfrei veroeffentlicht, auf
-- der Website erscheinen sie aber nicht. Die Website ist statisch gebaut
-- (Astro auf Vercel) und liest Supabase nur zur Bauzeit -- ohne neuen
-- Vercel-Build bleibt sie beim alten Stand.
--
-- Ursache: jeder Trigger traegt die Deploy-Hook-URL als eigenes Argument
-- (notify_deploy_hook('<url>')). Beim Einspielen von 006 (modulos) und 008
-- (on_tour_seminarios, on_tour_zonas) ist der Platzhalter <DEPLOY-HOOK-URL>
-- stehen geblieben. Bis 009 liess das die Veroeffentlichung scheitern, seit
-- 009 laeuft sie durch -- aber der Aufruf geht an "<DEPLOY-HOOK-URL>" und
-- damit ins Leere. Talleres und Casas (003/004) haben dagegen die echte URL.
--
-- Die Bauweise "URL in jedem Trigger" macht diesen Fehler bei jeder neuen
-- Inhaltsart wieder moeglich (fuenf Dateien, 16 Ersetzungen von Hand).
--
-- WAS DIESE MIGRATION AENDERT
-- --------------------------------------------------------------------------
--  1. Neue Tabelle public.deploy_config mit genau einer Zeile: hook_url.
--     Intern wie deploy_log -- RLS an, keine Policy, kein Zugriff fuer anon
--     oder authenticated. Nur notify_deploy_hook() (security definer) liest.
--
--  2. Die Tabelle wird automatisch befuellt: aus dem ersten bestehenden
--     *_deploy_hook-Trigger, dessen Argument eine echte https-URL ist (in
--     der Praxis workshops/casas). Von Hand muss nichts eingetragen werden,
--     solange irgendein Trigger die echte URL schon kennt.
--
--  3. notify_deploy_hook() nimmt ab jetzt die URL aus deploy_config. Nur
--     wenn dort nichts steht, faellt sie auf das Trigger-Argument zurueck --
--     und auch das nur, wenn es wirklich mit https:// beginnt. Platzhalter
--     werden erkannt und nie mehr "aufgerufen". Die Fehlerbehandlung aus 009
--     bleibt: ein kaputter Hook verhindert nie eine Veroeffentlichung.
--
--  4. Neu: die Sperrfrist (hoechstens ein Build pro Minute) wird nur noch
--     verbraucht, wenn wirklich ein Aufruf rausgeht. Bisher setzte auch ein
--     Aufruf an den Platzhalter den Zeitstempel -- und blockierte damit fuer
--     eine Minute auch einen gueltigen Aufruf aus Talleres/Casas.
--
-- Die Trigger selbst bleiben unveraendert (ihr Argument wird schlicht nicht
-- mehr gebraucht). Neue Inhaltsarten koennen kuenftig '' uebergeben.
--
-- VOR DEM AUSFUEHREN: nichts ersetzen. Idempotent, kann beliebig oft laufen.
-- Setzt 003 voraus (deploy_log, notify_deploy_hook).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. deploy_config
-- ----------------------------------------------------------------------------
create table if not exists public.deploy_config (
  id       boolean primary key default true check (id = true),
  hook_url text check (hook_url is null or hook_url like 'https://%')
);

insert into public.deploy_config (id, hook_url)
values (true, null)
on conflict (id) do nothing;

alter table public.deploy_config enable row level security;
-- Bewusst KEINE Policy (wie deploy_log): die URL erlaubt jedem, der sie
-- kennt, einen Vercel-Build auszuloesen -- sie gehoert nicht ins Frontend.
revoke all on public.deploy_config from anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. Echte URL aus den bestehenden Triggern uebernehmen
--
-- pg_get_triggerdef() liefert "... EXECUTE FUNCTION notify_deploy_hook('…')".
-- Ueberschrieben wird nur ein leeres Feld -- eine von Hand gesetzte URL
-- bleibt stehen.
-- ----------------------------------------------------------------------------
update public.deploy_config c
   set hook_url = src.url
  from (
    select (regexp_match(pg_get_triggerdef(t.oid),
                         'notify_deploy_hook\(''(https://[^'']+)''\)'))[1] as url
      from pg_trigger t
     where not t.tgisinternal
       and t.tgname like '%deploy_hook%'
       and pg_get_triggerdef(t.oid) ~ 'notify_deploy_hook\(''https://'
     order by t.tgname  -- casas_* vor workshops_*, beide gleich
     limit 1
  ) src
 where c.id = true
   and c.hook_url is null
   and src.url is not null;


-- ----------------------------------------------------------------------------
-- 3. notify_deploy_hook() liest die URL zentral
-- ----------------------------------------------------------------------------
create or replace function public.notify_deploy_hook()
returns trigger
language plpgsql
security definer
set search_path = extensions, net, public
as $$
declare
  hook_url text;
  v_last   timestamptz;
begin
  begin
    select c.hook_url into hook_url
      from public.deploy_config c
     where c.id = true;

    if hook_url is null and tg_argv[0] like 'https://%' then
      hook_url := tg_argv[0];
    end if;

    if hook_url is null then
      raise warning
        'notify_deploy_hook: keine Deploy-Hook-URL hinterlegt (public.deploy_config) -- kein Vercel-Build ausgeloest (Trigger %).',
        tg_name;
      return coalesce(new, old);
    end if;

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
  exception when others then
    -- Wie 009: ein kaputter Hook darf die Veroeffentlichung nie verhindern.
    raise warning
      'notify_deploy_hook: Aufruf fehlgeschlagen (%). Die Veroeffentlichung selbst wurde trotzdem gespeichert.',
      sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;


-- ----------------------------------------------------------------------------
-- 4. Sperrfrist freigeben
--
-- Die letzten Aufrufe an den Platzhalter haben den Zeitstempel gesetzt, ohne
-- dass ein Build lief. Zuruecksetzen, damit das naechste "Publicar" sofort
-- baut.
-- ----------------------------------------------------------------------------
update public.deploy_log set triggered_at = null where id = true;


-- ----------------------------------------------------------------------------
-- Kontrolle
--
--   select hook_url is not null as url_hinterlegt,
--          left(hook_url, 45) || '…' as anfang
--     from public.deploy_config;
--
-- url_hinterlegt = false heisst: kein Trigger kannte die echte URL. Dann in
-- Vercel -> Project Settings -> Git -> Deploy Hooks die URL kopieren (oder
-- einen Hook fuer den Branch main anlegen) und einmal eintragen:
--
--   update public.deploy_config set hook_url = 'https://api.vercel.com/…';
--
-- Danach im Panel ein Modul oder Seminar veroeffentlichen; in Vercel sollte
-- binnen Sekunden ein Deployment "via Deploy Hook" starten. Wer den Aufruf
-- selbst sehen will:
--
--   select id, status_code, created from net._http_response
--    order by created desc limit 5;
-- ----------------------------------------------------------------------------

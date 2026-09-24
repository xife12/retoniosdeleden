-- ============================================================================
-- 011 -- Die Deploy-Bremse verschluckt keine Aenderungen mehr
--
-- WARUM DIESE MIGRATION EXISTIERT
-- --------------------------------------------------------------------------
-- Beobachtet am 24. September 2026: im Panel wurde ein Modul per Pfeiltaste
-- in vier Schritten von Position 1 auf Position 5 geschoben. Der erste
-- Schritt loeste einen Vercel-Build aus, die drei folgenden fielen in die
-- Sperrfrist aus 003 (hoechstens ein Build pro Minute) und wurden
-- uebersprungen. Der Build las einen Zwischenstand -- auf der Website stand
-- das Modul danach an vierter statt an fuenfter Stelle, und dabei blieb es,
-- weil kein weiteres Ereignis mehr kam.
--
-- Die Annahme in 003 ("jede uebersprungene Aenderung ist spaetestens im
-- naechsten Build enthalten") gilt nur, wenn es einen naechsten Build gibt.
--
-- WAS DIESE MIGRATION AENDERT
-- --------------------------------------------------------------------------
--  1. deploy_log bekommt eine Spalte `pending`. Faellt ein Ereignis in die
--     Sperrfrist, wird es nicht mehr verworfen, sondern vorgemerkt.
--  2. Ein pg_cron-Job laeuft jede Minute und loest den vorgemerkten Build
--     aus, sobald die Sperrfrist um ist. Spaetestens rund zwei Minuten nach
--     der letzten Aenderung baut Vercel also mit dem Endstand.
--  3. Die Bremse selbst bleibt: weiterhin hoechstens ein Build pro Minute,
--     egal wie viele Aenderungen hintereinander kommen.
--
-- Setzt 003 und 010 voraus (deploy_log, deploy_config). Idempotent.
-- ============================================================================

create extension if not exists pg_cron;

alter table public.deploy_log
  add column if not exists pending boolean not null default false;


-- ----------------------------------------------------------------------------
-- 1. Der eigentliche Aufruf -- von Trigger und Cron-Job gemeinsam genutzt
--
-- Erwartet, dass der Aufrufer die Zeile in deploy_log schon gesperrt hat.
-- Scheitert http_post, bleibt die Veroeffentlichung trotzdem bestehen (wie
-- seit 009).
-- ----------------------------------------------------------------------------
create or replace function public.fire_deploy_hook()
returns void
language plpgsql
security definer
set search_path = extensions, net, public
as $$
declare
  v_url text;
begin
  select hook_url into v_url from public.deploy_config where id = true;

  if v_url is null then
    raise warning
      'fire_deploy_hook: keine Deploy-Hook-URL hinterlegt (public.deploy_config) -- kein Vercel-Build ausgeloest.';
    return;
  end if;

  update public.deploy_log
     set triggered_at = now(), pending = false
   where id = true;

  begin
    perform http_post(
      url := v_url,
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning
      'fire_deploy_hook: Aufruf fehlgeschlagen (%). Die Veroeffentlichung selbst wurde trotzdem gespeichert.',
      sqlerrm;
  end;
end;
$$;


-- ----------------------------------------------------------------------------
-- 2. Trigger-Funktion: sofort bauen oder vormerken
-- ----------------------------------------------------------------------------
create or replace function public.notify_deploy_hook()
returns trigger
language plpgsql
security definer
set search_path = extensions, net, public
as $$
declare
  v_last timestamptz;
begin
  begin
    select triggered_at into v_last
      from public.deploy_log
     where id = true
       for update;

    if v_last is not null and now() - v_last < interval '1 minute' then
      update public.deploy_log set pending = true where id = true;
    else
      perform public.fire_deploy_hook();
    end if;
  exception when others then
    raise warning
      'notify_deploy_hook: %. Die Veroeffentlichung selbst wurde trotzdem gespeichert.',
      sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;


-- ----------------------------------------------------------------------------
-- 3. Nachholen -- jede Minute per pg_cron
-- ----------------------------------------------------------------------------
create or replace function public.flush_pending_deploy()
returns void
language plpgsql
security definer
set search_path = extensions, net, public
as $$
declare
  v_last    timestamptz;
  v_pending boolean;
begin
  select triggered_at, pending into v_last, v_pending
    from public.deploy_log
   where id = true
     for update;

  if v_pending and (v_last is null or now() - v_last >= interval '1 minute') then
    perform public.fire_deploy_hook();
  end if;
end;
$$;

-- Nur intern: weder das Panel noch anon sollen Builds ausloesen koennen.
revoke all on function public.fire_deploy_hook()     from public, anon, authenticated;
revoke all on function public.flush_pending_deploy() from public, anon, authenticated;

-- cron.schedule mit Namen ersetzt einen gleichnamigen Job -- idempotent.
select cron.schedule(
  'deploy-hook-nachholen',
  '* * * * *',
  $$select public.flush_pending_deploy()$$
);


-- ----------------------------------------------------------------------------
-- Kontrolle
--
--   select jobname, schedule, active from cron.job;
--   select triggered_at, pending from public.deploy_log;
--
-- Zwei Aenderungen im Panel innerhalb einer Minute: nach der zweiten steht
-- pending = true, spaetestens zwei Minuten spaeter wieder false und in
-- Vercel laeuft ein zweites Deployment "via Deploy Hook".
-- ----------------------------------------------------------------------------

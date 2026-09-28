-- ============================================================================
-- 009 -- notify_deploy_hook() darf eine Veroeffentlichung nicht mehr sprengen
--
-- WARUM DIESE MIGRATION EXISTIERT
-- --------------------------------------------------------------------------
-- Gemeldeter Fehler beim Veroeffentlichen eines Schulmoduls (24. September
-- 2026): der Aufruf von rpc/publish_modulo antwortet mit HTTP 500, die
-- Konsole zeigt "Algo no salio bien...". Das Modul selbst ist dabei
-- inhaltlich unveraendert im Panel liegen geblieben -- die Veroeffentlichung
-- ist nie durchgelaufen.
--
-- Ursache, nachgelesen in 003_audit_und_deploy_bremse.sql: publish_modulo()
-- (006_modulos.sql) loest per Trigger modulos_deploy_hook am Ende der
-- Transaktion notify_deploy_hook() aus, und DIESE Funktion ruft
--
--     perform http_post(url := hook_url, ...);
--
-- OHNE jede Fehlerbehandlung auf. Scheitert dieser eine Aufruf -- etwa weil
-- der Platzhalter <DEPLOY-HOOK-URL> beim Einspielen von 006 oder 008 nie
-- durch die echte Vercel-Deploy-Hook-URL ersetzt wurde (siehe die
-- ausdrueckliche Warnung dort, und Punkt 4 "Ausserhalb des Codes" in der
-- Uebergabe-PR #6), oder weil die Erweiterung pg_net auf diesem Projekt
-- nicht aktiviert ist -- wirft Postgres eine Ausnahme. Diese Ausnahme
-- steigt bis in die aufrufende RPC-Funktion hoch und reisst die GANZE
-- Transaktion mit: publish_modulo() bricht ab, BEVOR die Zeile ueberhaupt
-- aktualisiert wird. PostgREST meldet das nach aussen als 500.
--
-- Derselbe Trigger-Aufbau steckt identisch in workshops/casas (003),
-- modulos (006) und on_tour_seminarios/on_tour_zonas (008) -- der Fehler
-- ist also nicht auf Module beschraenkt, er ist bisher nur dort aufgefallen.
--
-- WAS DIESE MIGRATION AENDERT, UND WAS NICHT
-- --------------------------------------------------------------------------
-- Sie ersetzt AUSSCHLIESSLICH notify_deploy_hook() selbst (create or
-- replace, keine neue Tabelle, kein neuer Trigger) -- weil alle vier
-- Inhaltsarten dieselbe Funktion teilen, repariert eine Aenderung hier alle
-- vier auf einmal. Die Ratenbremse (hoechstens einmal pro Minute) und die
-- Trigger-Bedingungen selbst bleiben unveraendert.
--
-- Neu: der Aufruf von http_post() steht in einem eigenen BEGIN/EXCEPTION-
-- Block. Schlaegt er fehl, wird die Ausnahme als WARNING protokolliert
-- (sichtbar in den Postgres-Logs von Supabase) und die Funktion kehrt
-- trotzdem normal zurueck -- die auslösende Veroeffentlichung geht durch.
--
-- Das ist eine bewusste Priorisierung: der Inhalt im Panel ist die
-- Wahrheit, der Deploy-Hook ist nur eine Benachrichtigung DARUEBER. Eine
-- kaputte Benachrichtigung darf die eigentliche Aenderung nicht verhindern.
-- Diese Migration behebt NICHT die eigentliche Ursache (den fehlenden oder
-- falschen Hook) -- das bleibt ein Punkt "ausserhalb des Codes", wie schon
-- in PLAN-ANPASSUNGEN-01.md vermerkt. Solange er nicht behoben ist,
-- veroeffentlicht das Panel weiterhin klaglos, nur ohne automatischen
-- Vercel-Build danach.
--
-- Idempotent: `create or replace function`, kann beliebig oft laufen.
-- ============================================================================

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
  exception when others then
    -- Absichtlich "when others": der Grund kann alles sein, vom fehlenden
    -- pg_net ueber eine kaputte URL bis zu einem Netzwerkfehler -- keiner
    -- davon darf die Veroeffentlichung verhindern. sqlerrm steht im Log,
    -- damit die eigentliche Ursache trotzdem auffindbar bleibt.
    raise warning
      'notify_deploy_hook: Aufruf an % fehlgeschlagen (%). Die Veroeffentlichung selbst wurde trotzdem gespeichert.',
      hook_url, sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;


-- ----------------------------------------------------------------------------
-- Kontrolle
--
-- Nach dem Einspielen: ein Modul (oder Taller/Casa/Seminario/Zona) im Panel
-- veroeffentlichen. Erwartet wird jetzt in jedem Fall ein Erfolg im Panel --
-- mit funktionierendem Hook zusaetzlich ein neuer Vercel-Build, ohne
-- funktionierenden Hook nur eine WARNING-Zeile in Database > Logs, aber
-- KEIN Fehler im Browser.
-- ----------------------------------------------------------------------------

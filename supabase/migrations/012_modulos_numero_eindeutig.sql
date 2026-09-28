-- ============================================================================
-- 012 -- Módulos: die Nummer ist eindeutig und bestimmt die Reihenfolge
--
-- WARUM DIESE MIGRATION EXISTIERT
-- --------------------------------------------------------------------------
-- Gemeldet am 24. September 2026: "Hüston, Hüston, nos escuchan??" traegt
-- die Nummer 5, stand aber in Panel und Website ganz oben. Neue Zeilen
-- bekamen den Spalten-Default sort_order = 0, und die Nummer ("Número en
-- la ruta") war nur Anzeige. Gewuenscht ist: Modul 5 steht an fuenfter
-- Stelle, und jede Nummer gibt es nur einmal.
--
-- Bisher galt (006, Abschnitt 1): "numero ist NICHT sort_order". Das wird
-- hiermit aufgegeben. Das Panel setzt ab jetzt beim Speichern sort_order =
-- numero (src/scripts/admin/drafts.ts, moduloPatch), die Liste hat keinen
-- Ziehgriff mehr, und die Website ordnet nach der veroeffentlichten Nummer
-- (src/lib/fetch-modulos.ts).
--
-- WAS DIESE MIGRATION AENDERT
-- --------------------------------------------------------------------------
--  1. Bricht ab, falls schon zwei nicht geloeschte Module dieselbe Nummer
--     tragen -- dann erst im Panel eine davon aendern, dann erneut ausfuehren.
--  2. Zieht sort_order einmalig auf numero nach.
--  3. Eindeutiger Index auf numero, nur ueber nicht geloeschte Zeilen: ein
--     weich geloeschtes Modul (004) gibt seine Nummer frei.
--
-- Idempotent.
-- ============================================================================

do $$
declare
  v_doppelt text;
begin
  select string_agg(numero::text, ', ')
    into v_doppelt
    from (
      select numero
        from public.modulos
       where deleted_at is null
       group by numero
      having count(*) > 1
    ) d;

  if v_doppelt is not null then
    raise exception
      'modulos: diese Nummern sind mehrfach vergeben: %. Im Panel eindeutig machen und 012 erneut ausfuehren.',
      v_doppelt;
  end if;
end;
$$;

update public.modulos
   set sort_order = numero
 where deleted_at is null
   and sort_order is distinct from numero;

create unique index if not exists modulos_numero_unico
  on public.modulos (numero)
  where deleted_at is null;


-- ----------------------------------------------------------------------------
-- Kontrolle
--
--   select numero, sort_order, translations -> 'es' ->> 'title' as titel
--     from public.modulos where deleted_at is null order by numero;
-- ----------------------------------------------------------------------------

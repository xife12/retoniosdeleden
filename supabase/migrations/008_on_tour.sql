-- ============================================================================
-- Migration 008 — "On Tour" ins Backend holen
-- (Aufgabe D6: die Chacra fährt zum Kunden -- drei Seminare, drei Zonen)
--
-- Voraussetzung: 001 bis 004 sind gelaufen, 006 idealerweise auch. Diese
-- Datei baut auf dem dort angelegten Gerüst auf und legt NICHTS davon neu an:
--   * public.content_snapshot()          (001, in 004 um deleted_at ergänzt)
--   * public.mark_unpublished_changes()  (001)
--   * public.is_admin()                  (002_admin_allowlist)
--   * public.may_edit_site()             (002_roles, optional -- siehe unten)
--   * public.audit_log_write()           (003)
--   * public.notify_deploy_hook()        (003, optional -- siehe Abschnitt 9)
--
-- Im Supabase SQL Editor als Ganzes ausführen. Der Editor führt ein
-- eingefügtes Skript als EINE Transaktion aus: geht irgendwo etwas schief,
-- rollt alles zurück und die Datenbank bleibt exakt im Vorzustand. Das
-- Skript ist idempotent -- Tabellen und Indizes unter IF NOT EXISTS,
-- Funktionen unter CREATE OR REPLACE, Trigger und Policys vor dem
-- Neuanlegen per DROP IF EXISTS. Ein zweiter Lauf ändert nichts mehr und
-- überschreibt insbesondere KEINE inzwischen von Hand gepflegten Inhalte
-- (Abschnitt 8 fügt die Startdaten per ON CONFLICT DO NOTHING ein).
--
-- VOR DEM AUSFÜHREN ERSETZEN: der Platzhalter <DEPLOY-HOOK-URL> in
-- Abschnitt 9 -- VIERMAL, alle Male gleich, mit derselben Vercel-Deploy-
-- Hook-URL wie in 003/004/006 (siehe SETUP-BACKEND.md Abschnitt C,
-- Schritt 6). Wer den Platzhalter stehen lässt, bekommt keine Fehlermeldung,
-- aber auch keinen automatischen Build nach dem Veröffentlichen.
--
--
-- WORUM ES GEHT
-- -------------
-- "On Tour" sind die Seminare, die wir zum Kunden bringen statt ihn zu uns.
-- Sie stehen bisher fest im Code (src/data/on-tour.ts) und ließen sich nur
-- von einem Menschen mit Editor ändern. Sie sollen im Panel unter /admin
-- pflegbar sein -- genau wie Talleres, Casas und Módulos. Der Weg dorthin
-- ist dreimal vorgezeichnet:
--
--     Tabelle + öffentliche View `*_public`
--         └─> src/lib/fetch-*.ts liest zur Bauzeit
--               └─> Komponente rendert
--     src/data/*.ts bleibt Typen + Rückfalldaten, wenn kein Backend da ist
--
--
-- AUSSERDEM IN DIESER DATEI: VIER SPALTEN AN public.solicitudes
-- ------------------------------------------------------------
-- Abschnitt 11 haengt personas, zona, organizacion und lugar an die
-- Anfragetabelle aus 005 und macht die Schulspalten NULL-faehig, damit eine
-- On-Tour-Anfrage ihre Angaben nicht mehr in Spalten mit falschen Namen
-- ablegen muss. Abschnitt 11b traegt die dazugehoerige Prüfregel nach -- die
-- EINZIGE Anweisung dieser Migration mit einer Reihenfolgebedingung
-- gegenueber dem Anwendungscode; die Warnung steht dort ausfuehrlich.
--
--
-- WARUM ZWEI TABELLEN UND NICHT EINE
-- ----------------------------------
-- Der Kopfkommentar von src/data/on-tour.ts sagt es schon: ein Seminar und
-- eine Anfahrtszone haben nichts gemeinsam außer, dass beide in den Preis
-- eingehen. Die Zonen ändern sich unabhängig von den Seminaren (Spritpreis,
-- neue Orte) und sollen einzeln pflegbar sein, ohne dass man ein Seminar
-- aufmacht. Steckte die Zonenliste in jedem Seminar, müsste man sie dreimal
-- pflegen und sie liefe dreimal auseinander.
--
-- Beide Tabellen bekommen dasselbe Entwurf/Veröffentlicht-Modell. Bei den
-- Zonen ist das kein Selbstzweck: eine Zone trägt einen PREIS. Wer den
-- Aufschlag für die Küste von 1200 auf 1500 setzt, soll das in Ruhe tun und
-- erst dann veröffentlichen können, wenn die Zahl stimmt -- nicht mit dem
-- ersten Tastendruck live gehen ("1", dann "15", dann "150"…).
--
--
-- ZWEI BESONDERHEITEN, DIE ES BEI DEN MÓDULOS NICHT GIBT
-- ------------------------------------------------------
--  1. `precio_tipo` unterscheidet "je Teilnehmerin" von "Pauschale für die
--     ganze Gruppe". Ein Betrag OHNE diese Angabe ist zweideutig: "US$ 40"
--     heißt beim einen Seminar pro Kopf und beim nächsten für alle zusammen
--     -- wer das verwechselt, verwechselt es um den Faktor zwanzig. Die
--     Spalte ist deshalb `not null` OHNE Vorbelegung: die Datenbank
--     verweigert ein INSERT, das sie vergisst, statt stillschweigend eine
--     der beiden Lesarten zu raten. Im Editor steht sie als zwei große
--     Karten direkt neben dem Betrag (siehe on-tour-view.ts).
--  2. `a_pedido` bei einer Zone ist NICHT dasselbe wie ein Aufschlag von
--     null. "Sin recargo" heißt: die Fahrt kostet nichts. "A calcular"
--     heißt: der Preis steht noch nicht fest und wird von Hand genannt.
--     Beide Zustände als 0 zu speichern hieße, dem Formular einen Preis
--     versprechen zu lassen, den niemand halten kann. Deshalb ist `recargo`
--     NULLABLE und eine CHECK-Bedingung hält beides sauber auseinander:
--     bei `a_pedido` MUSS `recargo` null sein, sonst MUSS es eine Zahl sein.
-- ============================================================================

create extension if not exists pgcrypto;


-- ----------------------------------------------------------------------------
-- 1. Tabelle: die Seminare
--
-- Spaltenschnitt eins zu eins wie `Seminario` in src/data/on-tour.ts: oben
-- die sprachneutrale Technik, unten die Texte gesammelt in `translations`.
-- Das ist kein Zufall -- die Datei ist bewusst schon so geschnitten worden,
-- damit diese Migration keine Übersetzungsarbeit mehr ist.
--
-- `slug` ist das Gegenstück zu `Seminario.id` ('colmena-viajera',
-- 'barro-y-manos', 'aromas'). Der Wert steht im Anfrageformular der Website
-- und ist damit ein fachlicher Schlüssel, kein technischer -- deshalb wie
-- bei workshops und modulos eine eigene, eindeutige Textspalte neben der
-- uuid, nicht statt ihr.
--
-- `numero` ist NICHT sort_order -- dieselbe Trennung wie bei den Módulos:
-- die Nummer gehört zum Inhalt und wandert in den veröffentlichten
-- Schnappschuss, sort_order ist die technische Reihenfolge und wird per
-- Drag & Drop gesetzt.
--
-- `activo` ist NICHT der Veröffentlichungszustand `status`, genauso wenig
-- wie `estado` es bei den Módulos ist. Ein Entwurf steht gar nicht auf der
-- Website; ein Seminar mit activo=false steht dort, ist aber nicht
-- auswählbar (etwa weil der Alambique gerade kaputt ist). Zwei Spalten
-- nebeneinander, weil sie zwei verschiedene Fragen beantworten: "sieht das
-- jemand?" und "kann man das buchen?".
-- ----------------------------------------------------------------------------
create table if not exists public.on_tour_seminarios (
  id uuid primary key default gen_random_uuid(),

  -- Fachlicher Schlüssel; entspricht Seminario.id in src/data/on-tour.ts.
  slug text not null unique,

  -- Sichtbare Nummer der Karte ("1", "2", "3").
  numero integer not null default 1
    constraint on_tour_seminarios_numero_check check (numero > 0),

  -- Pigment aus tokens.css -- bindet das Seminar sichtbar an sein Thema.
  -- Die Liste ist geschlossen: ein Pigment, das es im Stylesheet nicht gibt,
  -- ergäbe eine Karte ohne Farbe, und das fiele erst auf der Live-Site auf.
  pigmento text not null default 'miel'
    constraint on_tour_seminarios_pigmento_check
    check (pigmento in ('miel', 'barro', 'lavanda')),

  -- Betrag. numeric statt integer, weil krumme Beträge möglich bleiben
  -- müssen (US$ 45,50) -- dieselbe Wahl wie bei workshops.price.
  precio numeric not null default 0
    constraint on_tour_seminarios_precio_check check (precio >= 0),

  -- WIE der Betrag zu lesen ist. Bewusst OHNE default -- siehe Kopfkommentar,
  -- Besonderheit 1: ein Preis ohne diese Angabe ist zweideutig, und eine
  -- Vorbelegung wäre genau die stillschweigende Entscheidung, die hier
  -- niemand treffen darf. Wer die Spalte beim INSERT vergisst, bekommt eine
  -- Fehlermeldung statt einer falschen Rechnung.
  precio_tipo text not null
    constraint on_tour_seminarios_precio_tipo_check
    check (precio_tipo in ('porPersona', 'total')),

  currency text not null default 'USD'
    constraint on_tour_seminarios_currency_check
    check (currency in ('USD', 'UYU', 'EUR', 'ARS')),

  -- Dauer in MINUTEN, wie bei den Módulos: 120, 150 und 180 Minuten lassen
  -- sich als ganze Zahl exakt schreiben, 2,5 h nicht.
  duracion integer not null default 120
    constraint on_tour_seminarios_duracion_check check (duracion > 0),

  min_personas integer not null default 1
    constraint on_tour_seminarios_min_personas_check check (min_personas > 0),

  -- Die Obergrenze darf nie unter der Untergrenze liegen -- sonst zeigte die
  -- Karte "ab 8 bis 6 Personen" und das Anfrageformular könnte gar nicht
  -- mehr abgeschickt werden.
  max_personas integer not null default 20
    constraint on_tour_seminarios_max_personas_check
    check (max_personas >= min_personas),

  -- Buchbarkeit -- siehe Kopfkommentar. Nicht status.
  activo boolean not null default true,

  -- Veröffentlichungszustand, wie bei workshops, casas und modulos.
  status text not null default 'draft'
    constraint on_tour_seminarios_status_check
    check (status in ('draft', 'published', 'archived')),

  -- numeric wie bei den anderen: Umsortieren schreibt den Mittelwert der
  -- neuen Nachbarn und braucht damit nur EIN Update.
  sort_order numeric not null default 0,

  -- { es: { title, summary, longDesc, incluye: [], necesitamos }, en: {…} }
  translations jsonb not null default '{}'::jsonb,

  -- Schnappschuss der veröffentlichten Fassung (nur Inhaltsspalten).
  published_payload jsonb,
  has_unpublished_changes boolean not null default false,
  published_at timestamptz,

  -- Weiches Löschen wie in 004: gesetzt = aus Panel und Website weg, in der
  -- Datenbank aber noch 30 Tage vorhanden.
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists on_tour_seminarios_status_sort_idx
  on public.on_tour_seminarios (status, sort_order);

-- Teilindex wie modulos_active_sort_idx aus 006: genau die Abfrage, die
-- store.list() und die öffentliche View fahren.
create index if not exists on_tour_seminarios_active_sort_idx
  on public.on_tour_seminarios (sort_order)
  where deleted_at is null;


-- ----------------------------------------------------------------------------
-- 2. Tabelle: die Anfahrtszonen
--
-- Spaltenschnitt nach `Zona` in src/data/on-tour.ts.
--
-- `orden` ist hier -- anders als `numero` bei den Seminaren -- keine sichtbare
-- Nummer, sondern die Leserichtung der Liste: Ringe von der Chacra nach
-- außen. Genau so sucht jemand, der wissen will, ob sein Ort dabei ist. Diese
-- Reihenfolge IST Inhalt und gehört deshalb in den veröffentlichten
-- Schnappschuss -- sie darf sich nicht ändern, nur weil jemand im Panel eine
-- Zeile verschiebt. `sort_order` bleibt trotzdem vorhanden (die Tabelle wird
-- vom generischen Store gelesen, der danach sortiert); das Panel schreibt es
-- beim Speichern aus `orden` mit, damit beide nie auseinanderlaufen.
--
-- `recargo` ist NULLABLE, und das ist der Kern dieser Tabelle -- siehe
-- Kopfkommentar, Besonderheit 2.
-- ----------------------------------------------------------------------------
create table if not exists public.on_tour_zonas (
  id uuid primary key default gen_random_uuid(),

  -- Fachlicher Schlüssel; entspricht Zona.id ('cerca', 'costa', 'resto').
  -- Der Wert steht im Anfrageformular der Website.
  slug text not null unique,

  -- Aufschlag für die Anfahrt, EINMAL je Termin -- nicht je Person.
  -- null heißt ausschließlich "wird von Hand gerechnet" (a_pedido = true),
  -- niemals "kostet nichts"; dafür steht die 0.
  recargo numeric
    constraint on_tour_zonas_recargo_check check (recargo is null or recargo >= 0),

  currency text not null default 'UYU'
    constraint on_tour_zonas_currency_check
    check (currency in ('USD', 'UYU', 'EUR', 'ARS')),

  a_pedido boolean not null default false,

  -- Die entscheidende Prüfung. Sie macht die beiden Zustände unverwechselbar
  -- und lässt keinen dritten zu:
  --   a_pedido = true  → recargo MUSS null sein  ("A calcular")
  --   a_pedido = false → recargo MUSS eine Zahl sein (0 = "Sin recargo")
  -- Ohne sie könnte eine Zone gleichzeitig 1200 kosten UND "auf Anfrage"
  -- sein, und die Website müsste raten, welche der beiden Angaben gilt.
  constraint on_tour_zonas_a_pedido_check check (
    (a_pedido and recargo is null) or (not a_pedido and recargo is not null)
  ),

  -- Leserichtung der Liste, von innen nach außen. Siehe oben.
  orden integer not null default 1
    constraint on_tour_zonas_orden_check check (orden > 0),

  -- Veröffentlichungszustand -- ja, auch hier. Eine Preisänderung soll nicht
  -- mit dem ersten Tastendruck live gehen.
  status text not null default 'draft'
    constraint on_tour_zonas_status_check
    check (status in ('draft', 'published', 'archived')),

  sort_order numeric not null default 0,

  -- { es: { nombre, detalle }, en: { nombre, detalle } }
  translations jsonb not null default '{}'::jsonb,

  published_payload jsonb,
  has_unpublished_changes boolean not null default false,
  published_at timestamptz,

  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists on_tour_zonas_status_sort_idx
  on public.on_tour_zonas (status, sort_order);

create index if not exists on_tour_zonas_active_sort_idx
  on public.on_tour_zonas (sort_order)
  where deleted_at is null;


-- ----------------------------------------------------------------------------
-- 3. Trigger
--
-- Alle Funktionen stammen unverändert aus 001 und 003; hier werden nur die
-- Trigger für die zwei neuen Tabellen angehängt.
--   * mark_unpublished_changes() setzt updated_at und, bei inhaltlichen
--     Änderungen, has_unpublished_changes = true.
--   * audit_log_write() protokolliert jede Änderung.
-- ----------------------------------------------------------------------------
drop trigger if exists on_tour_seminarios_mark_changes on public.on_tour_seminarios;
create trigger on_tour_seminarios_mark_changes
  before update on public.on_tour_seminarios
  for each row execute function public.mark_unpublished_changes();

drop trigger if exists on_tour_zonas_mark_changes on public.on_tour_zonas;
create trigger on_tour_zonas_mark_changes
  before update on public.on_tour_zonas
  for each row execute function public.mark_unpublished_changes();

-- Das Protokoll aus 003 kennt bisher workshops, casas, casa_images und (seit
-- 006) modulos. Ohne diese Erweiterung schlägt jedes INSERT/UPDATE/DELETE auf
-- den neuen Tabellen an audit_log_table_name_check fehl -- sie wären
-- unbenutzbar. Deshalb erst die Prüfung erweitern, dann die Trigger anhängen.
--
-- Die Liste steht hier vollständig statt als "alte Liste plus zwei": eine
-- CHECK-Bedingung lässt sich nicht ergänzen, nur ersetzen. Wer eine Tabelle
-- streicht, sperrt sie aus -- also alle sechs aufzählen.
do $$
begin
  if to_regclass('public.audit_log') is not null then
    alter table public.audit_log drop constraint if exists audit_log_table_name_check;
    alter table public.audit_log add constraint audit_log_table_name_check
      check (table_name in (
        'workshops', 'casas', 'casa_images', 'modulos',
        'on_tour_seminarios', 'on_tour_zonas'
      ));

    drop trigger if exists on_tour_seminarios_audit_log on public.on_tour_seminarios;
    create trigger on_tour_seminarios_audit_log
      after insert or update or delete on public.on_tour_seminarios
      for each row execute function public.audit_log_write();

    drop trigger if exists on_tour_zonas_audit_log on public.on_tour_zonas;
    create trigger on_tour_zonas_audit_log
      after insert or update or delete on public.on_tour_zonas
      for each row execute function public.audit_log_write();
  end if;
end
$$;


-- ----------------------------------------------------------------------------
-- 4. Veröffentlichen & Verwerfen
--
-- Wortgleich zu publish_modulo() / discard_modulo_changes() aus 006 --
-- inklusive des Wächters als erster Anweisung. Der ist nicht optional: die
-- Funktionen sind `security definer` und laufen damit an RLS vorbei; ohne ihn
-- könnte jede Person mit irgendeinem Konto in diesem Projekt veröffentlichen.
--
-- Beides läuft in EINEM Aufruf, damit der Browser keinen halbfertigen
-- Mehrschritt-Schreibvorgang hinterlassen kann.
-- ----------------------------------------------------------------------------

create or replace function public.publish_on_tour_seminario(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_payload jsonb;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;

  -- Schnappschuss zuerst holen. Das ist zugleich die Existenzprüfung
  -- (FOUND wäre nach dem set_config unbrauchbar).
  select public.content_snapshot(to_jsonb(s))
    into v_payload
    from public.on_tour_seminarios s
   where s.id = p_id;

  if v_payload is null then
    raise exception 'No existe el seminario %', p_id using errcode = 'no_data_found';
  end if;

  perform set_config('app.publishing', 'on', true);

  update public.on_tour_seminarios
     set published_payload       = v_payload,
         published_at            = now(),
         has_unpublished_changes = false,
         status                  = 'published'
   where id = p_id;

  perform set_config('app.publishing', 'off', true);
end;
$fn$;


create or replace function public.discard_on_tour_seminario_changes(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_payload jsonb;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;

  select published_payload into v_payload
    from public.on_tour_seminarios where id = p_id;

  if v_payload is null then
    raise exception 'El seminario % todavía no fue publicado', p_id
      using errcode = 'no_data_found';
  end if;

  perform set_config('app.publishing', 'on', true);

  -- Spalte für Spalte statt eines pauschalen Rückschreibens: so kann ein
  -- alter Schnappschuss niemals Verwaltungsspalten (status, sort_order,
  -- deleted_at) mit zurückrollen. Dieselbe Liste wie in
  -- discard_modulo_changes(), nur mit den Feldern der Seminare.
  update public.on_tour_seminarios s
     set slug                    = r.slug,
         numero                  = r.numero,
         pigmento                = r.pigmento,
         precio                  = r.precio,
         precio_tipo             = r.precio_tipo,
         currency                = r.currency,
         duracion                = r.duracion,
         min_personas            = r.min_personas,
         max_personas            = r.max_personas,
         activo                  = r.activo,
         translations            = r.translations,
         has_unpublished_changes = false
    from jsonb_populate_record(null::public.on_tour_seminarios, v_payload) r
   where s.id = p_id;

  perform set_config('app.publishing', 'off', true);
end;
$fn$;


create or replace function public.publish_on_tour_zona(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_payload jsonb;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;

  select public.content_snapshot(to_jsonb(z))
    into v_payload
    from public.on_tour_zonas z
   where z.id = p_id;

  if v_payload is null then
    raise exception 'No existe la zona %', p_id using errcode = 'no_data_found';
  end if;

  perform set_config('app.publishing', 'on', true);

  update public.on_tour_zonas
     set published_payload       = v_payload,
         published_at            = now(),
         has_unpublished_changes = false,
         status                  = 'published'
   where id = p_id;

  perform set_config('app.publishing', 'off', true);
end;
$fn$;


create or replace function public.discard_on_tour_zona_changes(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_payload jsonb;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;

  select published_payload into v_payload from public.on_tour_zonas where id = p_id;

  if v_payload is null then
    raise exception 'La zona % todavía no fue publicada', p_id
      using errcode = 'no_data_found';
  end if;

  perform set_config('app.publishing', 'on', true);

  -- recargo und a_pedido MÜSSEN gemeinsam zurückgesetzt werden: einzeln
  -- betrachtet verletzt jeder der beiden Werte für sich die
  -- on_tour_zonas_a_pedido_check-Bedingung, sobald der andere noch aus dem
  -- Arbeitsstand stammt. In EINEM update-Statement gilt die Prüfung erst am
  -- Ende der Anweisung, und beide Werte kommen aus demselben Schnappschuss.
  update public.on_tour_zonas z
     set slug                    = r.slug,
         recargo                 = r.recargo,
         currency                = r.currency,
         a_pedido                = r.a_pedido,
         orden                   = r.orden,
         translations            = r.translations,
         has_unpublished_changes = false
    from jsonb_populate_record(null::public.on_tour_zonas, v_payload) r
   where z.id = p_id;

  perform set_config('app.publishing', 'off', true);
end;
$fn$;


-- Die beiden generischen Weichen aus 001/002/006 um die zwei neuen Tabellen
-- erweitern. Sie werden vom Backend derzeit nicht benutzt (der Store ruft die
-- Einzelfunktionen direkt auf), aber wer sie stehen lässt, wie sie sind, baut
-- eine Weiche, die zwei der fünf Inhaltsarten nicht kennt -- und genau darüber
-- stolpert der nächste Mensch. Wächter doppelt: die aufgerufene Funktion
-- prüft noch einmal selbst, keine verlässt sich auf die andere.
create or replace function public.publish_entity(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;

  case p_table
    when 'workshops'          then perform public.publish_workshop(p_id);
    when 'casas'              then perform public.publish_casa(p_id);
    when 'modulos'            then perform public.publish_modulo(p_id);
    when 'on_tour_seminarios' then perform public.publish_on_tour_seminario(p_id);
    when 'on_tour_zonas'      then perform public.publish_on_tour_zona(p_id);
    else raise exception 'publish_entity: tabla desconocida "%"', p_table;
  end case;
end;
$fn$;


create or replace function public.discard_changes(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;

  case p_table
    when 'workshops'          then perform public.discard_workshop_changes(p_id);
    when 'casas'              then perform public.discard_casa_changes(p_id);
    when 'modulos'            then perform public.discard_modulo_changes(p_id);
    when 'on_tour_seminarios' then perform public.discard_on_tour_seminario_changes(p_id);
    when 'on_tour_zonas'      then perform public.discard_on_tour_zona_changes(p_id);
    else raise exception 'discard_changes: tabla desconocida "%"', p_table;
  end case;
end;
$fn$;


-- ----------------------------------------------------------------------------
-- 5. Öffentliche Views
--
-- Einzige Datenquelle des Website-Builds (src/lib/fetch-on-tour.ts). Sie
-- lesen ausschließlich den veröffentlichten Schnappschuss -- nie den
-- Arbeitsstand aus dem Panel. Dadurch landen Zwischenstände des
-- Autospeicherns niemals auf der Website.
--
-- Aufbau nach modulos_public aus 006 (inklusive "deleted_at is null"), nur
-- mit den Feldern von On Tour.
--
-- `recargo` bleibt bewusst ohne coalesce: NULL heißt hier "wird von Hand
-- gerechnet" und muss auch in der View NULL bleiben, damit fetch-on-tour.ts
-- den Unterschied zu einer echten 0 noch sieht. Ein coalesce(…, 0) an dieser
-- Stelle wäre genau der Fehler, den die CHECK-Bedingung oben verhindert --
-- nur eine Schicht weiter oben und dort unsichtbar.
-- ----------------------------------------------------------------------------
drop view if exists public.on_tour_seminarios_public;
create view public.on_tour_seminarios_public as
select
  (s.published_payload ->> 'slug')                             as slug,
  (s.published_payload ->> 'numero')::integer                  as numero,
  (s.published_payload ->> 'pigmento')                         as pigmento,
  (s.published_payload ->> 'precio')::numeric                  as precio,
  (s.published_payload ->> 'precio_tipo')                      as precio_tipo,
  (s.published_payload ->> 'currency')                         as currency,
  (s.published_payload ->> 'duracion')::integer                as duracion,
  (s.published_payload ->> 'min_personas')::integer            as min_personas,
  (s.published_payload ->> 'max_personas')::integer            as max_personas,
  (s.published_payload ->> 'activo')::boolean                  as activo,
  coalesce(s.published_payload -> 'translations', '{}'::jsonb) as translations,
  s.sort_order,
  s.published_at
from public.on_tour_seminarios s
where s.status = 'published'
  and s.published_payload is not null
  and s.deleted_at is null;


drop view if exists public.on_tour_zonas_public;
create view public.on_tour_zonas_public as
select
  (z.published_payload ->> 'slug')                             as slug,
  (z.published_payload ->> 'recargo')::numeric                 as recargo,
  (z.published_payload ->> 'currency')                         as currency,
  (z.published_payload ->> 'a_pedido')::boolean                as a_pedido,
  (z.published_payload ->> 'orden')::integer                   as orden,
  coalesce(z.published_payload -> 'translations', '{}'::jsonb) as translations,
  z.sort_order,
  z.published_at
from public.on_tour_zonas z
where z.status = 'published'
  and z.published_payload is not null
  and z.deleted_at is null;


-- ----------------------------------------------------------------------------
-- 6. Rechte und Row Level Security
--
-- Dasselbe Modell wie bei workshops, casas und modulos:
--   * anon (der öffentliche Website-Build) hat auf die BASISTABELLEN gar
--     keine Rechte und liest ausschließlich die Views *_public.
--   * Geschrieben wird nur von Personen, die die Website bearbeiten dürfen.
--
-- Welche Funktion dabei die Wahrheit sagt, hängt davon ab, wie weit die
-- Installation ist: 002_admin_allowlist bringt is_admin() (Allowlist),
-- 002_roles bringt danach may_edit_site() (Rollen owner/editor). Diese
-- Migration folgt genau dem, was vorhanden ist, statt eine der beiden Welten
-- zu erzwingen -- damit sind die Policys von On Tour immer deckungsgleich mit
-- denen von workshops.
--
-- `(select public.…())` steht bewusst in Klammern: so wertet Postgres den
-- Aufruf einmal pro Abfrage statt einmal pro Zeile aus.
-- ----------------------------------------------------------------------------
alter table public.on_tour_seminarios enable row level security;
alter table public.on_tour_zonas enable row level security;

grant usage on schema public to anon, authenticated;

revoke all on public.on_tour_seminarios from anon;
revoke all on public.on_tour_zonas from anon;
grant select, insert, update, delete on public.on_tour_seminarios to authenticated;
grant select, insert, update, delete on public.on_tour_zonas to authenticated;

do $$
declare
  v_guard text := case
    when to_regprocedure('public.may_edit_site()') is not null then 'public.may_edit_site()'
    else 'public.is_admin()'
  end;
  v_table text;
  -- Der Policy-Name entsteht als eigene Variable und nicht als "%I_site_editors"
  -- im Formatstring: %I quotiert bei Bedarf, und dann stuende dort
  -- "on_tour_zonas"_site_editors -- syntaktisch kaputt und nur schwer zu
  -- sehen. Ein fertig zusammengesetzter Name geht als Ganzes durch %I.
  v_policy text;
begin
  foreach v_table in array array['on_tour_seminarios', 'on_tour_zonas'] loop
    v_policy := v_table || '_site_editors';
    execute format('drop policy if exists %I on public.%I', v_policy, v_table);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using ((select %s)) with check ((select %s))',
      v_policy, v_table, v_guard, v_guard
    );
  end loop;
  raise notice 'on_tour: Schreibrechte hängen an %', v_guard;
end
$$;

-- Ein CREATE VIEW legt aus Sicht von Postgres ein neues Objekt an, und
-- Supabase vergibt per ALTER DEFAULT PRIVILEGES automatisch ALL auf neue
-- Objekte im Schema public an anon. Deshalb wie überall sonst erst
-- konsequent wegnehmen, dann gezielt nur SELECT wieder vergeben.
revoke all on public.on_tour_seminarios_public from anon, authenticated;
revoke all on public.on_tour_zonas_public from anon, authenticated;
grant select on public.on_tour_seminarios_public to anon, authenticated;
grant select on public.on_tour_zonas_public to anon, authenticated;

revoke all on function public.publish_on_tour_seminario(uuid) from public;
revoke all on function public.discard_on_tour_seminario_changes(uuid) from public;
revoke all on function public.publish_on_tour_zona(uuid) from public;
revoke all on function public.discard_on_tour_zona_changes(uuid) from public;
grant execute on function public.publish_on_tour_seminario(uuid) to authenticated;
grant execute on function public.discard_on_tour_seminario_changes(uuid) to authenticated;
grant execute on function public.publish_on_tour_zona(uuid) to authenticated;
grant execute on function public.discard_on_tour_zona_changes(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 7. Startdatensätze: die drei Seminare aus src/data/on-tour.ts
--
-- Wortgleich übernommen, damit der Umstieg von der Codedatei auf die
-- Datenbank am Markup nichts ändert. ON CONFLICT (slug) DO NOTHING: ein
-- zweiter Lauf lässt inzwischen von Hand gepflegte Texte unangetastet.
--
-- ENTWURF-HINWEIS aus on-tour.ts gilt weiter: Namen, Beschreibungen, Preise,
-- Dauer und Mindestteilnehmerzahl der drei Seminare sind Vorschläge und
-- müssen bestätigt oder ersetzt werden. Genau dafür ist das Panel da. Die
-- drei Zonen weiter unten stammen dagegen aus dem Wunschdokument.
--
-- Eingefügt wird direkt mit status='published', statt publish_* aufzurufen:
-- die Funktionen prüfen is_admin(), und im SQL Editor ist auth.uid() null --
-- der Aufruf würde also scheitern. Der Schnappschuss entsteht deshalb in
-- Abschnitt 8 mit derselben content_snapshot()-Funktion, die publish_* auch
-- benutzt (dasselbe Vorgehen wie in 001 und 006).
-- ----------------------------------------------------------------------------
insert into public.on_tour_seminarios
  (slug, numero, pigmento, precio, precio_tipo, currency, duracion,
   min_personas, max_personas, activo, status, sort_order, translations)
values
  (
    'colmena-viajera', 1, 'miel', 45, 'porPersona', 'USD', 120,
    8, 25, true, 'published', 1,
    jsonb_build_object(
      'es', jsonb_build_object(
        'title', 'La colmena viajera',
        'summary', 'Llevamos un panal de verdad, el traje y la miel recién sacada. Dos horas con las abejas adelante, en tu patio o tu salón.',
        'longDesc', 'Traemos un cuadro de colmena en una caja con vidrio — se ve todo y no sale ninguna abeja —, el traje completo para quien se anime a probárselo, y miel sin filtrar directamente del panal. Contamos cómo se organiza una colmena, por qué deciden mejor en grupo que solas, y qué de lo que hay sobre una mesa existe gracias a ellas. Termina con una cata de tres mieles distintas de la misma chacra: la diferencia entre ellas es la flor, y se nota.',
        'incluye', jsonb_build_array(
          'Cuadro de colmena en caja vidriada',
          'Traje de apicultor para probarse',
          'Cata de tres mieles de la chacra',
          'Todo el material y la coordinación'
        ),
        'necesitamos', 'Una mesa grande y, si es posible, sombra. Nada más.'
      ),
      'en', jsonb_build_object(
        'title', 'The travelling hive',
        'summary', 'We bring a real comb, the suit and honey straight from the frame. Two hours with the bees in front of you, in your yard or your room.',
        'longDesc', 'We bring a hive frame in a glass-fronted box — everything is visible and no bee gets out —, the full suit for whoever wants to try it on, and unfiltered honey straight from the comb. We explain how a hive organises itself, why they decide better together than alone, and how much of what sits on a table exists thanks to them. It ends with a tasting of three different honeys from the same farm: what separates them is the flower, and you can taste it.',
        'incluye', jsonb_build_array(
          'Hive frame in a glass-fronted box',
          'Beekeeper suit to try on',
          'Tasting of three honeys from the farm',
          'All materials and coordination'
        ),
        'necesitamos', 'A large table and, if possible, some shade. Nothing else.'
      )
    )
  ),
  (
    'barro-y-manos', 2, 'barro', 38, 'porPersona', 'USD', 180,
    6, 18, true, 'published', 2,
    jsonb_build_object(
      'es', jsonb_build_object(
        'title', 'Barro y manos',
        'summary', 'Tierra, arena y paja. Se amasa con los pies, se levanta con las manos y cada quien se lleva lo que hizo.',
        'longDesc', 'Las casas de la chacra están hechas con la tierra del propio terreno. Traemos esa misma mezcla y la prueba que decide si un barro sirve o no — la del frasco, que separa arena, limo y arcilla en tres capas y no miente. Después se amasa (con los pies, es más rápido y más divertido) y cada persona construye algo pequeño: un ladrillo, una maceta, un revoque sobre un bastidor. Se seca en unos días y queda.',
        'incluye', jsonb_build_array(
          'Tierra, arena y paja de la chacra',
          'La prueba del frasco para leer un suelo',
          'Herramienta y bastidores',
          'Lo que cada quien hizo, para llevarse'
        ),
        'necesitamos', 'Un espacio exterior con canilla de agua cerca.'
      ),
      'en', jsonb_build_object(
        'title', 'Mud and hands',
        'summary', 'Earth, sand and straw. You knead it with your feet, raise it with your hands, and everyone takes home what they made.',
        'longDesc', 'The houses on the farm are built from the earth of the land itself. We bring that same mixture and the test that decides whether a clay is any good — the jar test, which separates sand, silt and clay into three layers and never lies. Then comes the kneading (with your feet, it is faster and more fun) and each person builds something small: a brick, a pot, a render on a frame. It dries in a few days and it lasts.',
        'incluye', jsonb_build_array(
          'Earth, sand and straw from the farm',
          'The jar test for reading a soil',
          'Tools and frames',
          'Whatever each person made, to take home'
        ),
        'necesitamos', 'An outdoor space with a water tap nearby.'
      )
    )
  ),
  (
    -- Das einzige der drei mit einer PAUSCHALE: US$-Preise je Kopf bei den
    -- ersten beiden, hier 1600 Pesos für die ganze Gruppe. Genau deshalb
    -- steht precio_tipo neben dem Betrag und nicht in den Einstellungen.
    'aromas', 3, 'lavanda', 1600, 'total', 'UYU', 150,
    6, 20, true, 'published', 3,
    jsonb_build_object(
      'es', jsonb_build_object(
        'title', 'Aromas de la chacra',
        'summary', 'Un alambique chico, lavanda recién cortada y el olor llenando la sala. Cada quien se va con su jabón y su vela.',
        'longDesc', 'Montamos el alambique y destilamos lavanda ahí mismo: el vapor pasa por las flores, arrastra el aceite y este queda flotando sobre el agua, donde se separa. De ese único paso salen dos cosas — el aceite esencial y el hidrolato —, y de ahí se abre en dos caminos: jabón por un lado, vela por el otro. La cera de las velas es de nuestras propias colmenas, de las mismas abejas que visitan esa lavanda. Cada persona se lleva un jabón y una vela hechos en el taller.',
        'incluye', jsonb_build_array(
          'Alambique y destilación en vivo',
          'Lavanda de la chacra, recién cortada',
          'Cera de nuestras colmenas',
          'Un jabón y una vela por persona'
        ),
        'necesitamos', 'Una mesa larga, un enchufe y una ventana que se pueda abrir.'
      ),
      'en', jsonb_build_object(
        'title', 'Scents from the farm',
        'summary', 'A small still, freshly cut lavender and the smell filling the room. Everyone leaves with their own soap and candle.',
        'longDesc', 'We set up the still and distil lavender right there: steam passes through the flowers, carries the oil with it, and the oil ends up floating on the water, where it separates. That single step yields two things — the essential oil and the hydrosol — and from there the path opens into two: soap on one side, candle on the other. The wax for the candles comes from our own hives, from the very bees that visit that lavender. Each person takes home a soap and a candle made during the session.',
        'incluye', jsonb_build_array(
          'Still and live distillation',
          'Lavender from the farm, freshly cut',
          'Beeswax from our own hives',
          'One soap and one candle per person'
        ),
        'necesitamos', 'A long table, a power socket and a window that opens.'
      )
    )
  )
on conflict (slug) do nothing;


-- Die drei Zonen. sort_order = orden: beim ersten Anlegen laufen beide
-- gleich, und das Panel schreibt sie danach gemeinsam fort.
--
-- 'resto' ist der Grund für die ganze a_pedido-Mechanik: recargo bleibt NULL,
-- weil der Aufschlag von der Entfernung abhängt und in der Angebotsmail steht.
-- Eine 0 stünde auf der Website als "Incluido" -- ein Versprechen, das
-- niemand halten kann.
insert into public.on_tour_zonas
  (slug, recargo, currency, a_pedido, orden, status, sort_order, translations)
values
  (
    'cerca', 0, 'UYU', false, 1, 'published', 1,
    jsonb_build_object(
      'es', jsonb_build_object(
        'nombre', 'Sin recargo',
        'detalle', 'Maldonado, San Carlos y Punta Ballena.'
      ),
      'en', jsonb_build_object(
        'nombre', 'No travel fee',
        'detalle', 'Maldonado, San Carlos and Punta Ballena.'
      )
    )
  ),
  (
    'costa', 1200, 'UYU', false, 2, 'published', 2,
    jsonb_build_object(
      'es', jsonb_build_object(
        'nombre', 'Costa cercana',
        'detalle', 'Desde Punta del Este hasta San Ignacio, y Piriápolis.'
      ),
      'en', jsonb_build_object(
        'nombre', 'Nearby coast',
        'detalle', 'From Punta del Este to San Ignacio, and Piriápolis.'
      )
    )
  ),
  (
    'resto', null, 'UYU', true, 3, 'published', 3,
    jsonb_build_object(
      'es', jsonb_build_object(
        'nombre', 'Resto del país',
        'detalle', 'Lo calculamos por distancia y te lo decimos en la propuesta.'
      ),
      'en', jsonb_build_object(
        'nombre', 'Rest of the country',
        'detalle', 'We work it out by distance and tell you in the proposal.'
      )
    )
  )
on conflict (slug) do nothing;


-- ----------------------------------------------------------------------------
-- 8. Veröffentlichten Schnappschuss nachziehen
--
-- Für alles, was schon auf 'published' steht, aber noch keinen hat. Beim
-- ersten Lauf sind das genau die sechs Zeilen von oben; bei einem zweiten
-- Lauf ist die Menge leer.
-- ----------------------------------------------------------------------------
do $$
begin
  perform set_config('app.publishing', 'on', true);

  update public.on_tour_seminarios s
     set published_payload       = (select public.content_snapshot(to_jsonb(x))
                                      from public.on_tour_seminarios x where x.id = s.id),
         published_at            = coalesce(s.published_at, s.updated_at, now()),
         has_unpublished_changes = false
   where s.status = 'published'
     and s.published_payload is null;

  update public.on_tour_zonas z
     set published_payload       = (select public.content_snapshot(to_jsonb(x))
                                      from public.on_tour_zonas x where x.id = z.id),
         published_at            = coalesce(z.published_at, z.updated_at, now()),
         has_unpublished_changes = false
   where z.status = 'published'
     and z.published_payload is null;

  perform set_config('app.publishing', 'off', true);
end
$$;


-- ----------------------------------------------------------------------------
-- 9. Deploy-Hook -- die Website nach dem Veröffentlichen neu bauen
--
-- Die Seite ist statisch (Befund B5): eine Änderung im Panel wird erst
-- sichtbar, wenn Vercel neu baut. Dieselben Bedingungen wie bei
-- workshops/casas/modulos: nur UPDATE mit Änderung an published_at, status,
-- sort_order oder deleted_at, sowie DELETE. Nie INSERT -- eine neue Zeile
-- steht immer auf 'draft' und ist in keiner öffentlichen View sichtbar.
--
-- In einem DO-Block mit Existenzprüfung, damit diese Migration auch auf einer
-- Installation läuft, auf der 003 (noch) nicht eingespielt ist: dort gibt es
-- notify_deploy_hook() nicht, und ein unbedingtes CREATE TRIGGER würde die
-- ganze Transaktion scheitern lassen -- also Tabellen, Views und Startdaten
-- gleich mit.
--
-- <DEPLOY-HOOK-URL> ersetzen -- kommt hier an VIER Stellen vor.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.notify_deploy_hook()') is null then
    raise notice
      'on_tour: notify_deploy_hook() fehlt (Migration 003 nicht eingespielt) -- '
      'kein automatischer Build nach dem Veröffentlichen.';
    return;
  end if;

  drop trigger if exists on_tour_seminarios_deploy_hook on public.on_tour_seminarios;
  create trigger on_tour_seminarios_deploy_hook
    after update on public.on_tour_seminarios
    for each row
    when (
      old.published_at is distinct from new.published_at
      or old.status is distinct from new.status
      or old.sort_order is distinct from new.sort_order
      or old.deleted_at is distinct from new.deleted_at
    )
    execute function public.notify_deploy_hook('<DEPLOY-HOOK-URL>');

  drop trigger if exists on_tour_seminarios_deploy_hook_del on public.on_tour_seminarios;
  create trigger on_tour_seminarios_deploy_hook_del
    after delete on public.on_tour_seminarios
    for each row
    execute function public.notify_deploy_hook('<DEPLOY-HOOK-URL>');

  drop trigger if exists on_tour_zonas_deploy_hook on public.on_tour_zonas;
  create trigger on_tour_zonas_deploy_hook
    after update on public.on_tour_zonas
    for each row
    when (
      old.published_at is distinct from new.published_at
      or old.status is distinct from new.status
      or old.sort_order is distinct from new.sort_order
      or old.deleted_at is distinct from new.deleted_at
    )
    execute function public.notify_deploy_hook('<DEPLOY-HOOK-URL>');

  drop trigger if exists on_tour_zonas_deploy_hook_del on public.on_tour_zonas;
  create trigger on_tour_zonas_deploy_hook_del
    after delete on public.on_tour_zonas
    for each row
    execute function public.notify_deploy_hook('<DEPLOY-HOOK-URL>');
end
$$;


-- ----------------------------------------------------------------------------
-- 10. Weiches Löschen mit aufräumen
--
-- soft_delete_cleanup() aus 004 kennt bisher workshops, casas und (seit 006)
-- modulos. Ohne diese Ergänzung blieben gelöschte Seminare und Zonen für
-- immer in der Datenbank stehen -- unsichtbar, aber unaufgeräumt. Wortgleich
-- aus 006 übernommen, ergänzt um die zwei neuen DELETEs. Nur ersetzen, wenn
-- es die Funktion schon gibt: auf einer Installation ohne 004 hat sie hier
-- nichts zu suchen.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.soft_delete_cleanup()') is null then
    raise notice
      'on_tour: soft_delete_cleanup() fehlt (Migration 004 nicht eingespielt) -- '
      'übersprungen.';
    return;
  end if;

  execute $fn$
    create or replace function public.soft_delete_cleanup()
    returns void
    language plpgsql
    security definer
    set search_path = public
    as $body$
    begin
      delete from public.workshops
       where deleted_at is not null
         and deleted_at < now() - interval '30 days';

      delete from public.casas
       where deleted_at is not null
         and deleted_at < now() - interval '30 days';

      if to_regclass('public.modulos') is not null then
        delete from public.modulos
         where deleted_at is not null
           and deleted_at < now() - interval '30 days';
      end if;

      delete from public.on_tour_seminarios
       where deleted_at is not null
         and deleted_at < now() - interval '30 days';

      delete from public.on_tour_zonas
       where deleted_at is not null
         and deleted_at < now() - interval '30 days';
    end;
    $body$;
  $fn$;

  execute 'revoke all on function public.soft_delete_cleanup() from public';
end
$$;


-- ----------------------------------------------------------------------------
-- 11. Anfragen: eigene Spalten für On Tour in public.solicitudes
--
-- Warum das hierher gehört und nicht in 005: 005_solicitudes.sql ist
-- abgeschlossen und läuft auf den bestehenden Installationen bereits. Eine
-- abgeschlossene Migration nachträglich zu ändern hieße, dass zwei
-- Installationen mit derselben Nummer verschieden aussehen -- der sicherste
-- Weg, sich später selbst nicht mehr zu glauben. Änderungen an einer
-- bestehenden Tabelle kommen deshalb per `alter table` in der Migration, die
-- sie braucht.
--
-- WORUM ES GEHT
-- -------------
-- 005 hat `origen` mit den Werten 'escuelas' und 'on_tour' schon vorgesehen,
-- aber nur Schulspalten angelegt. Der fertige On-Tour-Bereich
-- (src/components/OnTour.astro) bildet seine Felder deshalb behelfsweise auf
-- die vorhandenen ab: die Anfahrtszone landet in `clase`, die Personenzahl in
-- `alumnos`, die Organisation in `escuela`, der Ort vorangestellt im Freitext
-- `nota`. Das funktioniert und ist trotzdem eine Falle -- wer die Anfragen
-- ein halbes Jahr später im Backend ansieht, liest einen Zonennamen in einer
-- Spalte namens "Klasse" und glaubt an einen Fehler. Vier eigene Spalten
-- kosten nichts und sagen die Wahrheit.
--
-- Alle vier sind NULL erlaubt: eine Schulanfrage benutzt sie nicht, und
-- umgekehrt benutzt eine On-Tour-Anfrage `alumnos`, `clase` und `escuela`
-- nicht. Welche Kombination gültig ist, entscheidet deshalb weiter unten eine
-- Prüfregel, die an `origen` hängt -- nicht die einzelne Spalte.
--
-- Der Kontaktblock bleibt für BEIDE Herkünfte derselbe: `docente`, `mail`,
-- `telefono`. `docente` heißt trotz seines Namens schlicht "die Person, die
-- schreibt" -- bei einer Firmenanfrage ist das keine Lehrkraft. Die Spalte
-- wird NICHT umbenannt: ein rename bräche jede bestehende Abfrage, jeden
-- Export und die App gleich mit, und der Gewinn wäre ein hübscherer Name.
-- Stattdessen steht es als Kommentar an der Spalte (siehe unten), wo es die
-- nächste Person auch findet.
-- ----------------------------------------------------------------------------
alter table public.solicitudes
  add column if not exists personas     integer,
  add column if not exists zona         text,
  add column if not exists organizacion text,
  add column if not exists lugar        text;

comment on column public.solicitudes.personas is
  'On Tour: wie viele Personen teilnehmen. Das Gegenstueck zu alumnos bei den '
  'Schulanfragen; NULL bei origen = ''escuelas''.';

comment on column public.solicitudes.zona is
  'On Tour: Kennung der Anfahrtszone, entspricht Zona.id in src/data/on-tour.ts '
  '(''cerca'', ''costa'', ''resto''). Bewusst KEIN Fremdschluessel auf '
  'on_tour_zonas: die Anfrage ist ein Dokument ueber einen Zeitpunkt und darf '
  'ihren Inhalt nicht verlieren, wenn eine Zone spaeter umbenannt oder '
  'geloescht wird -- dieselbe Begruendung wie bei solicitudes.modulos.';

comment on column public.solicitudes.organizacion is
  'On Tour: Firma, Schule oder Organisation. Das Gegenstueck zu escuela.';

comment on column public.solicitudes.lugar is
  'On Tour: Ortsangabe und ungefaehre Adresse. Stand bisher dem Freitext nota '
  'vorangestellt.';

comment on column public.solicitudes.docente is
  'Die Person, die schreibt -- fuer BEIDE Herkuenfte. Bei origen = ''on_tour'' '
  'ist das keine Lehrkraft, sondern die Ansprechperson der Firma oder '
  'Organisation. Der Spaltenname stammt aus 005 und wird nicht geaendert, weil '
  'ein rename jede bestehende Abfrage und jeden Export braeche.';

-- Die drei Schulspalten verlieren ihr NOT NULL. Das ist kein Aufweichen,
-- sondern die Voraussetzung dafuer, dass die Prüfregel unten überhaupt etwas
-- Wahres sagen kann: eine On-Tour-Anfrage hat keine Klasse und keine Schule,
-- und sie mit Platzhaltern zu füllen wäre genau der Zustand, den diese
-- Ergänzung beendet. Fuer Schulanfragen bleibt die Pflicht erhalten -- nur
-- steht sie ab jetzt in der origen-Regel statt in der Spalte.
--
-- Die Wertebereichs-Checks aus 005 (alumnos between 1 and 60, Laengen von
-- clase und escuela) bleiben unangetastet: eine CHECK-Bedingung laesst NULL
-- ohnehin durch, sie greift also weiterhin genau dann, wenn ein Wert dasteht.
alter table public.solicitudes alter column alumnos drop not null;
alter table public.solicitudes alter column clase   drop not null;
alter table public.solicitudes alter column escuela drop not null;


-- ----------------------------------------------------------------------------
-- 11b. Prüfregel an `origen`
--
-- ACHTUNG, REIHENFOLGE: Diese eine Anweisung verlangt von jeder neuen
-- On-Tour-Anfrage `personas` und `zona`. Der aktuell ausgelieferte
-- OnTour.astro schickt beides noch nicht (er schreibt in alumnos/clase).
-- Wird 008 eingespielt, BEVOR der neue Anwendungscode live ist, scheitert
-- jedes Absenden des On-Tour-Formulars -- und zwar stumm, aus Sicht der
-- Besucherin.
--
-- Also entweder
--   (a) erst src/lib/solicitudes.ts + OnTour.astro auf die neuen Spalten
--       umstellen und ausliefern, dann diese Anweisung ausfuehren, oder
--   (b) diese eine Anweisung beim ersten Lauf ueberspringen und spaeter
--       nachreichen. Der Rest von Abschnitt 11 ist davon unabhaengig und in
--       jeder Reihenfolge gefahrlos: neue Spalten, die niemand schreibt,
--       stehen einfach auf NULL.
--
-- Zurueck geht es jederzeit mit
--   alter table public.solicitudes drop constraint solicitudes_origen_campos_check;
--
-- Kollidiert die Regel mit etwas Bestehendem? Nein -- geprueft wurde:
--   * solicitudes_sellar() (005, BEFORE INSERT) setzt nur creado_en,
--     consentimiento_en und estado und fasst keines dieser Felder an.
--   * Die anon-INSERT-Policy prueft nur consentimiento und origen.
--   * Bestehende Zeilen sind alle 'escuelas' und haben alumnos, clase und
--     escuela gefuellt (bis eben waren sie NOT NULL) -- ALTER TABLE ADD
--     CONSTRAINT prueft den Bestand mit und geht deshalb durch.
-- ----------------------------------------------------------------------------
alter table public.solicitudes
  drop constraint if exists solicitudes_origen_campos_check;

alter table public.solicitudes
  add constraint solicitudes_origen_campos_check check (
    case origen
      -- Schule: wie viele Kinder, welche Klasse, welche Schule.
      when 'escuelas' then alumnos is not null
                       and clase   is not null
                       and escuela is not null
      -- On Tour: wie viele Personen und wohin wir fahren. `lugar` und
      -- `organizacion` sind bewusst NICHT Pflicht -- eine Geburtstagsfeier im
      -- eigenen Garten hat keine Organisation, und die genaue Adresse klaert
      -- man ohnehin in der Antwortmail. Pflicht ist nur, was den Preis
      -- bestimmt: Personenzahl und Zone.
      when 'on_tour'  then personas is not null
                       and zona     is not null
      else true
    end
  );


-- ============================================================================
-- Kontrolle
--
-- Diese Abfrage nach dem Lauf einzeln ausführen. Erwartet wird:
--   seminarios_existe   = true
--   zonas_existe        = true
--   vistas              = 2
--   seminarios_pub      = 3   (die drei Startseminare)
--   zonas_pub           = 3   (die drei Zonen)
--   sin_snapshot        = 0   (jedes 'published' hat seinen Schnappschuss)
--   politicas           = 2   (je eine *_site_editors)
--   anon_en_tablas      = 0   (anon hat auf den Basistabellen KEIN Recht)
--   anon_en_vistas      = 2   (anon darf genau SELECT auf beiden Views)
--   zonas_a_pedido      = 1   (genau "resto", und zwar mit recargo null)
-- ============================================================================
--
--  select
--    to_regclass('public.on_tour_seminarios') is not null        as seminarios_existe,
--    to_regclass('public.on_tour_zonas')      is not null        as zonas_existe,
--    (select count(*) from pg_views where schemaname = 'public'
--       and viewname in ('on_tour_seminarios_public',
--                        'on_tour_zonas_public'))                as vistas,
--    (select count(*) from public.on_tour_seminarios
--      where status = 'published' and deleted_at is null)        as seminarios_pub,
--    (select count(*) from public.on_tour_zonas
--      where status = 'published' and deleted_at is null)        as zonas_pub,
--    (select count(*) from public.on_tour_seminarios
--      where status = 'published' and published_payload is null)
--    + (select count(*) from public.on_tour_zonas
--      where status = 'published' and published_payload is null) as sin_snapshot,
--    (select count(*) from pg_policies where schemaname = 'public'
--       and tablename in ('on_tour_seminarios', 'on_tour_zonas')) as politicas,
--    (select count(*) from information_schema.role_table_grants
--      where table_schema = 'public' and grantee = 'anon'
--        and table_name in ('on_tour_seminarios',
--                           'on_tour_zonas'))                    as anon_en_tablas,
--    (select count(distinct table_name)
--       from information_schema.role_table_grants
--      where table_schema = 'public' and grantee = 'anon'
--        and table_name in ('on_tour_seminarios_public',
--                           'on_tour_zonas_public'))             as anon_en_vistas,
--    (select count(*) from public.on_tour_zonas
--      where a_pedido and recargo is null)                       as zonas_a_pedido;
--
-- Gegenprobe von außen, ohne Anmeldung: /rest/v1/on_tour_seminarios_public
-- liefert die drei Seminare, /rest/v1/on_tour_seminarios eine
-- Rechtefehlermeldung. Dasselbe für die Zonen.
-- ============================================================================

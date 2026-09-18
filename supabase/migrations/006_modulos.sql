-- ============================================================================
-- Migration 006 — Módulos ("Las abejas educan") ins Backend holen
-- (Aufgabe D3 aus PLAN-ANPASSUNGEN-01.md, Befund B4, Entscheidung E4)
--
-- Voraussetzung: 001 bis 004 sind gelaufen. Diese Datei baut auf dem dort
-- angelegten Gerüst auf und legt NICHTS davon neu an:
--   * public.content_snapshot()          (001, in 004 um deleted_at ergänzt)
--   * public.mark_unpublished_changes()  (001)
--   * public.is_admin()                  (002_admin_allowlist)
--   * public.may_edit_site()             (002_roles, optional -- siehe unten)
--   * public.audit_log_write()           (003)
--   * public.notify_deploy_hook()        (003, optional -- siehe Abschnitt 8)
--
-- Im Supabase SQL Editor als Ganzes ausführen. Der Editor führt ein
-- eingefügtes Skript als EINE Transaktion aus: geht irgendwo etwas schief,
-- rollt alles zurück und die Datenbank bleibt exakt im Vorzustand. Das
-- Skript ist idempotent -- Tabelle und Indizes unter IF NOT EXISTS,
-- Funktionen unter CREATE OR REPLACE, Trigger und Policys vor dem
-- Neuanlegen per DROP IF EXISTS. Ein zweiter Lauf ändert nichts mehr und
-- überschreibt insbesondere KEINE inzwischen von Hand gepflegten Inhalte
-- (Abschnitt 7 fügt die vier Startmodule per ON CONFLICT DO NOTHING ein).
--
-- VOR DEM AUSFÜHREN ERSETZEN: der Platzhalter <DEPLOY-HOOK-URL> in
-- Abschnitt 8 -- zweimal, beide Male gleich, mit derselben Vercel-Deploy-
-- Hook-URL wie in 003/004 (siehe SETUP-BACKEND.md Abschnitt C, Schritt 6).
-- Wer den Platzhalter stehen lässt, bekommt keine Fehlermeldung, aber auch
-- keinen automatischen Build nach dem Veröffentlichen.
--
--
-- WORUM ES GEHT
-- -------------
-- "Las abejas educan" besteht aus vier Schulmodulen. Die stehen bisher fest
-- im Code (src/data/modulos.ts) und ließen sich nur von einem Menschen mit
-- Editor ändern. Sie sollen im Panel unter /admin pflegbar sein -- genau wie
-- die Talleres. Der Weg dorthin ist bei den Talleres vorgezeichnet:
--
--     Tabelle + öffentliche View `*_public`
--         └─> src/lib/fetch-*.ts liest zur Bauzeit
--               └─> Komponente rendert
--     src/data/*.ts bleibt Typen + Rückfalldaten, wenn kein Backend da ist
--
-- Entscheidung E4 sagt: getrennte Tabellen, gemeinsame Bausteine. Deshalb
-- eine eigene Tabelle `modulos` statt einer verbogenen `workshops` -- die
-- Felder unterscheiden sich zu stark (Altersspannen, Klassenstufen,
-- Lernziele, Monate) --, aber dasselbe Entwurf/Veröffentlicht-Modell,
-- dieselben Trigger, dieselbe Rechtelogik.
--
--
-- ZWEI BESONDERHEITEN GEGENÜBER DEN TALLERES
-- ------------------------------------------
--  1. `meses` steht JE DATENSATZ, nicht global. Das Schuljahr und die
--     Bienensaison decken sich nicht: die drei Module in der Schule laufen
--     von März bis November, der Besuch auf der Chacra von Oktober bis
--     April. Eine globale Saisonangabe wäre für beide falsch.
--  2. `estado` kennt neben 'disponible' auch 'proximamente': ein Modul, das
--     auf der Website gezeigt, aber nicht gebucht werden kann. Das ist NICHT
--     dasselbe wie der Veröffentlichungszustand `status` -- ein Entwurf ist
--     gar nicht auf der Website, ein 'proximamente'-Modul schon, nur eben
--     ohne Auswahlknopf. Beide Spalten nebeneinander, weil sie verschiedene
--     Fragen beantworten: "sieht das jemand?" und "kann man das buchen?".
-- ============================================================================

create extension if not exists pgcrypto;


-- ----------------------------------------------------------------------------
-- 1. Hilfsfunktion: sind das gültige Monatszahlen?
--
-- `meses` ist ein jsonb-Array aus Zahlen 1-12 -- dieselbe Form wie
-- workshops.dates (jsonb-Array aus Datumsstrings), damit der Store im
-- Backend nichts Neues können muss.
--
-- Die Prüfung steckt in einer Funktion und nicht direkt in der CHECK-
-- Bedingung, weil Postgres in CHECK keine Unterabfragen erlaubt --
-- jsonb_array_elements() ist eine mengenwertige Funktion und wäre genau das.
-- `immutable` ist hier ehrlich: die Antwort hängt allein vom Argument ab.
--
-- NULL ergibt true, damit die Funktion die NOT-NULL-Prüfung der Spalte nicht
-- doppelt (und nicht widersprüchlich) mitmacht -- CHECK lässt NULL ohnehin
-- durch, die Spalte selbst ist `not null`.
-- ----------------------------------------------------------------------------
create or replace function public.meses_validos(p_meses jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p_meses is null then true
    when jsonb_typeof(p_meses) <> 'array' then false
    else not exists (
      select 1
        from jsonb_array_elements(p_meses) e
       where jsonb_typeof(e) <> 'number'
          or (e #>> '{}')::numeric not between 1 and 12
          or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric)
    )
  end;
$$;

revoke all on function public.meses_validos(jsonb) from public;
grant execute on function public.meses_validos(jsonb) to authenticated;


-- ----------------------------------------------------------------------------
-- 2. Tabelle
--
-- Spaltenschnitt eins zu eins wie `Modulo` in src/data/modulos.ts: oben die
-- sprachneutrale Technik, unten die Texte gesammelt in `translations`. Das
-- ist kein Zufall -- die Datei ist bewusst schon so geschnitten worden, damit
-- diese Migration keine Übersetzungsarbeit mehr ist.
--
-- `slug` ist das Gegenstück zu `Modulo.id` ('ojos', 'equipo', 'frutas',
-- 'chacra'). Der Wert steht im Anfrageformular der Website und ist damit ein
-- fachlicher Schlüssel, kein technischer -- deshalb wie bei workshops eine
-- eigene, eindeutige Textspalte neben der uuid, nicht statt ihr.
--
-- `numero` ist NICHT sort_order. Die Nummer steht sichtbar in der Wabe
-- ("Modul 2") und gehört damit zum Inhalt; sort_order ist die technische
-- Reihenfolge in Liste und Website und wird per Drag & Drop gesetzt. Meist
-- laufen beide parallel, aber sie müssen es nicht -- und nur eine der beiden
-- wandert in den veröffentlichten Schnappschuss (siehe content_snapshot()).
-- ----------------------------------------------------------------------------
create table if not exists public.modulos (
  id uuid primary key default gen_random_uuid(),

  -- Fachlicher Schlüssel; entspricht Modulo.id in src/data/modulos.ts.
  slug text not null unique,

  -- Sichtbare Nummer auf dem Weg ("Modul 1" ... "Modul 4").
  numero integer not null default 1
    constraint modulos_numero_check check (numero > 0),

  -- Wo das Modul stattfindet; trennt die beiden Abschnitte der "Ruta".
  lugar text not null default 'aula'
    constraint modulos_lugar_check check (lugar in ('aula', 'chacra')),

  -- Buchbarkeit -- siehe Kopfkommentar, Besonderheit 2.
  estado text not null default 'disponible'
    constraint modulos_estado_check check (estado in ('disponible', 'proximamente')),

  -- Veröffentlichungszustand, wie bei workshops und casas.
  status text not null default 'draft'
    constraint modulos_status_check check (status in ('draft', 'published', 'archived')),

  -- numeric wie bei den anderen beiden: Umsortieren schreibt den Mittelwert
  -- der neuen Nachbarn und braucht damit nur EIN Update.
  sort_order numeric not null default 0,

  edad_min integer not null default 6
    constraint modulos_edad_min_check check (edad_min >= 0 and edad_min <= 25),

  -- NULL heißt "offen nach oben" ("ab 8"), genau wie das optionale edadMax
  -- in src/data/modulos.ts. Deshalb bewusst ohne NOT NULL.
  edad_max integer
    constraint modulos_edad_max_check
    check (edad_max is null or (edad_max >= edad_min and edad_max <= 25)),

  -- Dauer in MINUTEN, nicht in Stunden wie bei workshops.hours: 60, 90 und
  -- 180 Minuten lassen sich als ganze Zahl exakt schreiben, 1,5 h nicht.
  duracion integer not null default 60
    constraint modulos_duracion_check check (duracion > 0),

  max_alumnos integer not null default 30
    constraint modulos_max_alumnos_check check (max_alumnos > 0),

  -- Monate als Zahlen 1-12, je Modul verschieden -- siehe Kopfkommentar,
  -- Besonderheit 1. Ein leeres Array heißt "keine Angabe", nicht "nie".
  meses jsonb not null default '[]'::jsonb
    constraint modulos_meses_check check (public.meses_validos(meses)),

  -- { es: { title, clase, summary, longDesc, objetivos: [] }, en: { ... } }
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

create index if not exists modulos_status_sort_idx
  on public.modulos (status, sort_order);

-- Teilindex wie workshops_active_sort_idx / casas_active_sort_idx aus 004:
-- genau die Abfrage, die store.list() und die öffentliche View fahren.
create index if not exists modulos_active_sort_idx
  on public.modulos (sort_order)
  where deleted_at is null;


-- ----------------------------------------------------------------------------
-- 3. Trigger
--
-- Alle drei Funktionen stammen unverändert aus 001 und 003; hier werden nur
-- die Trigger für die neue Tabelle angehängt.
--   * mark_unpublished_changes() setzt updated_at und, bei inhaltlichen
--     Änderungen, has_unpublished_changes = true.
--   * audit_log_write() protokolliert jede Änderung.
-- ----------------------------------------------------------------------------
drop trigger if exists modulos_mark_changes on public.modulos;
create trigger modulos_mark_changes
  before update on public.modulos
  for each row execute function public.mark_unpublished_changes();

-- Das Protokoll aus 003 kennt bisher nur workshops, casas und casa_images.
-- Ohne diese Erweiterung schlägt jedes INSERT/UPDATE/DELETE auf modulos an
-- audit_log_table_name_check fehl -- die Tabelle wäre unbenutzbar. Deshalb
-- erst die Prüfung erweitern, dann den Trigger anhängen.
do $$
begin
  if to_regclass('public.audit_log') is not null then
    alter table public.audit_log drop constraint if exists audit_log_table_name_check;
    alter table public.audit_log add constraint audit_log_table_name_check
      check (table_name in ('workshops', 'casas', 'casa_images', 'modulos'));

    drop trigger if exists modulos_audit_log on public.modulos;
    create trigger modulos_audit_log
      after insert or update or delete on public.modulos
      for each row execute function public.audit_log_write();
  end if;
end
$$;


-- ----------------------------------------------------------------------------
-- 4. Veröffentlichen & Verwerfen
--
-- Wortgleich zu publish_workshop() / discard_workshop_changes() in der
-- Fassung aus 002_admin_allowlist.sql -- inklusive des Wächters als erster
-- Anweisung. Der ist nicht optional: die Funktionen sind `security definer`
-- und laufen damit an RLS vorbei; ohne ihn könnte jede Person mit
-- irgendeinem Konto in diesem Projekt veröffentlichen.
--
-- Beides läuft in EINEM Aufruf, damit der Browser keinen halbfertigen
-- Mehrschritt-Schreibvorgang hinterlassen kann.
-- ----------------------------------------------------------------------------

create or replace function public.publish_modulo(p_id uuid)
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
  select public.content_snapshot(to_jsonb(m))
    into v_payload
    from public.modulos m
   where m.id = p_id;

  if v_payload is null then
    raise exception 'No existe el módulo %', p_id using errcode = 'no_data_found';
  end if;

  perform set_config('app.publishing', 'on', true);

  update public.modulos
     set published_payload       = v_payload,
         published_at            = now(),
         has_unpublished_changes = false,
         status                  = 'published'
   where id = p_id;

  perform set_config('app.publishing', 'off', true);
end;
$fn$;


create or replace function public.discard_modulo_changes(p_id uuid)
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

  select published_payload into v_payload from public.modulos where id = p_id;

  if v_payload is null then
    raise exception 'El módulo % todavía no fue publicado', p_id
      using errcode = 'no_data_found';
  end if;

  perform set_config('app.publishing', 'on', true);

  -- Spalte für Spalte statt eines pauschalen Rückschreibens: so kann ein
  -- alter Schnappschuss niemals Verwaltungsspalten (status, sort_order,
  -- deleted_at) mit zurückrollen. Dieselbe Liste wie in
  -- discard_workshop_changes(), nur mit den Feldern der Módulos.
  update public.modulos m
     set slug                    = r.slug,
         numero                  = r.numero,
         lugar                   = r.lugar,
         estado                  = r.estado,
         edad_min                = r.edad_min,
         edad_max                = r.edad_max,
         duracion                = r.duracion,
         max_alumnos             = r.max_alumnos,
         meses                   = r.meses,
         translations            = r.translations,
         has_unpublished_changes = false
    from jsonb_populate_record(null::public.modulos, v_payload) r
   where m.id = p_id;

  perform set_config('app.publishing', 'off', true);
end;
$fn$;


-- Die beiden generischen Weichen aus 002 um 'modulos' erweitern. Sie werden
-- vom Backend derzeit nicht benutzt (der Store ruft publish_modulo direkt
-- auf), aber wer sie stehen lässt, wie sie sind, baut eine Weiche, die eine
-- der drei Inhaltsarten nicht kennt -- und genau darüber stolpert der
-- nächste Mensch. Wächter doppelt: die aufgerufene Funktion prüft noch
-- einmal selbst, keine verlässt sich auf die andere.
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
    when 'workshops' then perform public.publish_workshop(p_id);
    when 'casas'     then perform public.publish_casa(p_id);
    when 'modulos'   then perform public.publish_modulo(p_id);
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
    when 'workshops' then perform public.discard_workshop_changes(p_id);
    when 'casas'     then perform public.discard_casa_changes(p_id);
    when 'modulos'   then perform public.discard_modulo_changes(p_id);
    else raise exception 'discard_changes: tabla desconocida "%"', p_table;
  end case;
end;
$fn$;


-- ----------------------------------------------------------------------------
-- 5. Öffentliche View
--
-- Einzige Datenquelle des Website-Builds (src/lib/fetch-modulos.ts). Sie
-- liest ausschließlich den veröffentlichten Schnappschuss -- nie den
-- Arbeitsstand aus dem Panel. Dadurch landen Zwischenstände des
-- Autospeicherns niemals auf der Website.
--
-- Aufbau zeichengenau nach workshops_public in der Fassung aus 004
-- (inklusive "deleted_at is null"), nur mit den Feldern der Módulos.
--
-- edad_max bleibt bewusst ohne coalesce: NULL heißt hier "offen nach oben"
-- und muss auch in der View NULL bleiben, damit fetch-modulos.ts daraus
-- wieder ein fehlendes `edadMax` machen kann.
-- ----------------------------------------------------------------------------
drop view if exists public.modulos_public;
create view public.modulos_public as
select
  (m.published_payload ->> 'slug')                             as slug,
  (m.published_payload ->> 'numero')::integer                  as numero,
  (m.published_payload ->> 'lugar')                            as lugar,
  (m.published_payload ->> 'estado')                           as estado,
  (m.published_payload ->> 'edad_min')::integer                as edad_min,
  (m.published_payload ->> 'edad_max')::integer                as edad_max,
  (m.published_payload ->> 'duracion')::integer                as duracion,
  (m.published_payload ->> 'max_alumnos')::integer             as max_alumnos,
  coalesce(m.published_payload -> 'meses', '[]'::jsonb)        as meses,
  coalesce(m.published_payload -> 'translations', '{}'::jsonb) as translations,
  m.sort_order,
  m.published_at
from public.modulos m
where m.status = 'published'
  and m.published_payload is not null
  and m.deleted_at is null;


-- ----------------------------------------------------------------------------
-- 6. Rechte und Row Level Security
--
-- Dasselbe Modell wie bei workshops und casas:
--   * anon (der öffentliche Website-Build) hat auf die BASISTABELLE gar
--     keine Rechte und liest ausschließlich die View modulos_public.
--   * Geschrieben wird nur von Personen, die die Website bearbeiten dürfen.
--
-- Welche Funktion dabei die Wahrheit sagt, hängt davon ab, wie weit die
-- Installation ist: 002_admin_allowlist bringt is_admin() (Allowlist),
-- 002_roles bringt danach may_edit_site() (Rollen owner/editor) und stellt
-- die Policys von workshops/casas darauf um. Diese Migration folgt genau
-- dem, was vorhanden ist, statt eine der beiden Welten zu erzwingen: gibt es
-- may_edit_site(), gilt sie auch hier -- sonst is_admin(). Damit sind die
-- Policys von modulos immer deckungsgleich mit denen von workshops.
--
-- `(select public.…())` steht bewusst in Klammern: so wertet Postgres den
-- Aufruf einmal pro Abfrage statt einmal pro Zeile aus (derselbe Grund wie
-- in 002).
-- ----------------------------------------------------------------------------
alter table public.modulos enable row level security;

grant usage on schema public to anon, authenticated;

revoke all on public.modulos from anon;
grant select, insert, update, delete on public.modulos to authenticated;

do $$
declare
  v_guard text := case
    when to_regprocedure('public.may_edit_site()') is not null then 'public.may_edit_site()'
    else 'public.is_admin()'
  end;
begin
  execute 'drop policy if exists modulos_site_editors on public.modulos';
  execute format(
    'create policy modulos_site_editors on public.modulos for all to authenticated '
    || 'using ((select %s)) with check ((select %s))',
    v_guard, v_guard
  );
  raise notice 'modulos: Schreibrechte hängen an %', v_guard;
end
$$;

-- Ein CREATE VIEW legt aus Sicht von Postgres ein neues Objekt an, und
-- Supabase vergibt per ALTER DEFAULT PRIVILEGES automatisch ALL auf neue
-- Objekte im Schema public an anon. Deshalb wie überall sonst erst
-- konsequent wegnehmen, dann gezielt nur SELECT wieder vergeben.
revoke all on public.modulos_public from anon, authenticated;
grant select on public.modulos_public to anon, authenticated;

revoke all on function public.publish_modulo(uuid) from public;
revoke all on function public.discard_modulo_changes(uuid) from public;
grant execute on function public.publish_modulo(uuid) to authenticated;
grant execute on function public.discard_modulo_changes(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 7. Startdatensätze: die vier Module aus src/data/modulos.ts
--
-- Wortgleich übernommen, damit der Umstieg von der Codedatei auf die
-- Datenbank am Markup nichts ändert. ON CONFLICT (slug) DO NOTHING: ein
-- zweiter Lauf lässt inzwischen von Hand gepflegte Texte unangetastet.
--
-- ENTWURF-HINWEIS aus modulos.ts gilt weiter: Inhalte, Altersspannen, Dauer
-- und Lernziele sind Vorschläge und müssen von Catalina bestätigt oder
-- ersetzt werden. Genau dafür ist das Panel da.
--
-- Eingefügt wird direkt mit status='published' und gefülltem
-- published_payload, statt publish_modulo() aufzurufen: die Funktion prüft
-- is_admin(), und im SQL Editor ist auth.uid() null -- der Aufruf würde
-- also scheitern. Der Schnappschuss entsteht deshalb hier mit derselben
-- content_snapshot()-Funktion, die publish_modulo() auch benutzt (dasselbe
-- Vorgehen wie in Abschnitt 7 von 001_draft_publish.sql).
-- ----------------------------------------------------------------------------
insert into public.modulos
  (slug, numero, lugar, estado, status, sort_order,
   edad_min, edad_max, duracion, max_alumnos, meses, translations)
values
  (
    'ojos', 1, 'aula', 'disponible', 'published', 1,
    6, 9, 60, 30, '[3,4,5,6,7,8,9,10,11]'::jsonb,
    jsonb_build_object(
      'es', jsonb_build_object(
        'title', 'El mundo con ojos de abeja',
        'clase', '1.° a 3.°',
        'summary', 'Una abeja ve colores que nosotros no vemos y se habla con olores. Nos ponemos en su lugar y miramos el aula desde ahí.',
        'longDesc', 'Empezamos por lo más sencillo y lo más raro a la vez: una abeja no ve el mundo como nosotros. Distingue colores que para nosotros no existen, encuentra una flor por el olor antes que por la forma y siente el movimiento del aire con los pelitos del cuerpo. Con lentes de cartón, flores de papel y unos pocos experimentos, la clase entera pasa una hora viendo, oliendo y tocando como si fuera una abeja. Al final volvemos a mirar el patio de la escuela y ya no se ve igual.',
        'objetivos', jsonb_build_array(
          'Observar con atención y describir lo que se observa.',
          'Entender que la percepción no termina en la nuestra.'
        )
      ),
      'en', jsonb_build_object(
        'title', 'The world through a bee’s eyes',
        'clase', 'Years 1–3',
        'summary', 'A bee sees colours we cannot see and talks in scent. We step into her place and look at the classroom from there.',
        'longDesc', 'We start with the simplest and strangest thing at once: a bee does not see the world the way we do. She tells apart colours that do not exist for us, finds a flower by smell before shape, and feels the movement of air through the hairs on her body. With cardboard lenses, paper flowers and a handful of experiments, the whole class spends an hour seeing, smelling and touching like a bee. At the end we look at the school yard again, and it no longer looks the same.',
        'objetivos', jsonb_build_array(
          'Observe closely and describe what is observed.',
          'Understand that perception does not end with our own.'
        )
      )
    )
  ),
  (
    'equipo', 2, 'aula', 'disponible', 'published', 2,
    8, 12, 90, 30, '[3,4,5,6,7,8,9,10,11]'::jsonb,
    jsonb_build_object(
      'es', jsonb_build_object(
        'title', 'La colmena es un equipo',
        'clase', '3.° a 6.°',
        'summary', 'Miles de abejas y ninguna jefa. Descubrimos cómo se reparten el trabajo, cómo se avisan dónde hay flores y por qué deciden mejor en grupo.',
        'longDesc', 'En una colmena hay cincuenta mil habitantes y nadie da órdenes. Cada abeja cambia de tarea a lo largo de su vida — limpia, cuida crías, construye, cuida la puerta, sale a volar — y el conjunto funciona sin que nadie lo organice desde arriba. Vemos cómo se avisan dónde hay flores con un baile que indica distancia y dirección, y hacemos el mismo baile en el aula. Después le damos vuelta la pregunta: ¿en qué se parece esta clase a una colmena, y en qué no?',
        'objetivos', jsonb_build_array(
          'Reconocer una organización que funciona sin jefes.',
          'Describir cómo se transmite información dentro de un grupo.',
          'Llevar lo observado a la propia clase.'
        )
      ),
      'en', jsonb_build_object(
        'title', 'The hive is a team',
        'clase', 'Years 3–6',
        'summary', 'Thousands of bees and no boss. We work out how they share the jobs, how they tell each other where the flowers are, and why they decide better together.',
        'longDesc', 'A hive holds fifty thousand inhabitants and nobody gives orders. Each bee changes job over her lifetime — cleaning, nursing, building, guarding the door, flying out — and the whole thing works without anyone organising it from above. We look at how they announce where the flowers are through a dance that carries distance and direction, and we dance it in the classroom. Then we turn the question around: how is this class like a hive, and how is it not?',
        'objetivos', jsonb_build_array(
          'Recognise an organisation that works without a boss.',
          'Describe how information travels inside a group.',
          'Apply what was observed to their own classroom.'
        )
      )
    )
  ),
  (
    'frutas', 3, 'aula', 'disponible', 'published', 3,
    10, 15, 90, 30, '[3,4,5,6,7,8,9,10,11]'::jsonb,
    jsonb_build_object(
      'es', jsonb_build_object(
        'title', 'Sin abejas no hay frutas',
        'clase', '5.° a Ciclo Básico',
        'summary', 'Polinización, cadena alimentaria y una mesa puesta. Sacamos de esa mesa todo lo que no existiría sin abejas y miramos lo que queda.',
        'longDesc', 'Ponemos una mesa con comida de verdad — manzanas, almendras, café, zapallo, miel — y empezamos a sacar de ella todo lo que depende de un insecto polinizador. Lo que queda al final sorprende a cualquiera. A partir de ahí trabajamos la polinización paso a paso, hablamos de qué hace desaparecer a las abejas y qué las trae de vuelta, y terminamos con algo concreto que la clase pueda hacer en el patio de su escuela. No es una charla sobre catástrofes: es una sobre cómo se sostiene lo que comemos.',
        'objetivos', jsonb_build_array(
          'Explicar la polinización y su papel en la producción de alimentos.',
          'Argumentar por qué la biodiversidad no es un lujo.',
          'Proponer una acción concreta y realizable en la escuela.'
        )
      ),
      'en', jsonb_build_object(
        'title', 'Without bees there is no fruit',
        'clase', 'Years 5 to lower secondary',
        'summary', 'Pollination, food chains and a laid table. We take off that table everything that would not exist without bees, and look at what is left.',
        'longDesc', 'We lay a table with real food — apples, almonds, coffee, squash, honey — and start removing everything that depends on a pollinating insect. What remains at the end surprises everybody. From there we work through pollination step by step, talk about what makes bees disappear and what brings them back, and finish with something concrete the class can do in their own school yard. It is not a talk about catastrophe: it is a talk about how what we eat holds together.',
        'objetivos', jsonb_build_array(
          'Explain pollination and its role in food production.',
          'Argue why biodiversity is not a luxury.',
          'Propose one concrete action that is achievable at school.'
        )
      )
    )
  ),
  (
    -- Noch nicht buchbar, aber sichtbar: die Karte ist das Ziel des Weges.
    -- Andere Monate als die drei Module in der Schule -- hier zählt die
    -- Bienensaison, nicht das Schuljahr.
    'chacra', 4, 'chacra', 'proximamente', 'published', 4,
    8, null, 180, 25, '[10,11,12,1,2,3,4]'::jsonb,
    jsonb_build_object(
      'es', jsonb_build_object(
        'title', 'Un día en la chacra',
        'clase', 'Desde 3.°',
        'summary', 'Colmena de verdad, traje puesto y miel directo del panal. Todo lo aprendido en el aula, pero con las abejas adelante.',
        'longDesc', 'La visita a Retoños del Edén cierra el recorrido: lo que en el aula fue un dibujo acá zumba. Los chicos se ponen el traje, abrimos un cuadro y buscan la reina entre miles de obreras; prueban miel sin filtrar directo del panal; caminan el sendero entre los pistachos y la lavanda y ven de dónde sale lo que las abejas juntan. Es medio día entero y vuelve todo el mundo cansado.',
        'objetivos', jsonb_build_array(
          'Reconocer en una colmena real lo trabajado en el aula.',
          'Vivir una experiencia directa con un animal que suele dar miedo.'
        )
      ),
      'en', jsonb_build_object(
        'title', 'A day on the farm',
        'clase', 'From year 3',
        'summary', 'A real hive, a suit on and honey straight from the comb. Everything learned in class, but with the bees in front of you.',
        'longDesc', 'The visit to Retoños del Edén closes the route: what was a drawing in the classroom hums out here. The children put on the suit, we lift out a frame and they hunt for the queen among thousands of workers; they taste unfiltered honey straight from the comb; they walk the path between the pistachios and the lavender and see where what the bees gather comes from. It is a full half day and everybody goes home tired.',
        'objetivos', jsonb_build_array(
          'Recognise in a real hive what was covered in the classroom.',
          'Have a direct experience with an animal that usually frightens people.'
        )
      )
    )
  )
on conflict (slug) do nothing;

-- Veröffentlichten Schnappschuss nachziehen -- für alles, was schon auf
-- 'published' steht, aber noch keinen hat. Beim ersten Lauf sind das genau
-- die vier Zeilen von oben; bei einem zweiten Lauf ist die Menge leer.
do $$
begin
  perform set_config('app.publishing', 'on', true);

  update public.modulos m
     set published_payload       = (select public.content_snapshot(to_jsonb(x))
                                      from public.modulos x where x.id = m.id),
         published_at            = coalesce(m.published_at, m.updated_at, now()),
         has_unpublished_changes = false
   where m.status = 'published'
     and m.published_payload is null;

  perform set_config('app.publishing', 'off', true);
end
$$;


-- ----------------------------------------------------------------------------
-- 8. Deploy-Hook -- die Website nach dem Veröffentlichen neu bauen
--
-- Die Seite ist statisch (Befund B5): eine Änderung im Panel wird erst
-- sichtbar, wenn Vercel neu baut. Dieselben Bedingungen wie bei
-- workshops/casas in 004: nur UPDATE mit Änderung an published_at, status,
-- sort_order oder deleted_at, sowie DELETE. Nie INSERT -- eine neue Zeile
-- steht immer auf 'draft' und ist in keiner öffentlichen View sichtbar.
--
-- In einem DO-Block mit Existenzprüfung, damit diese Migration auch auf
-- einer Installation läuft, auf der 003 (noch) nicht eingespielt ist: dort
-- gibt es notify_deploy_hook() nicht, und ein unbedingtes CREATE TRIGGER
-- würde die ganze Transaktion scheitern lassen -- also Tabelle, View und
-- Startdaten gleich mit.
--
-- <DEPLOY-HOOK-URL> ersetzen -- kommt hier an ZWEI Stellen vor.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.notify_deploy_hook()') is null then
    raise notice
      'modulos: notify_deploy_hook() fehlt (Migration 003 nicht eingespielt) -- '
      'kein automatischer Build nach dem Veröffentlichen.';
    return;
  end if;

  drop trigger if exists modulos_deploy_hook on public.modulos;
  create trigger modulos_deploy_hook
    after update on public.modulos
    for each row
    when (
      old.published_at is distinct from new.published_at
      or old.status is distinct from new.status
      or old.sort_order is distinct from new.sort_order
      or old.deleted_at is distinct from new.deleted_at
    )
    execute function public.notify_deploy_hook('<DEPLOY-HOOK-URL>');

  drop trigger if exists modulos_deploy_hook_del on public.modulos;
  create trigger modulos_deploy_hook_del
    after delete on public.modulos
    for each row
    execute function public.notify_deploy_hook('<DEPLOY-HOOK-URL>');
end
$$;


-- ----------------------------------------------------------------------------
-- 9. Weiches Löschen mit aufräumen
--
-- soft_delete_cleanup() aus 004 kennt bisher nur workshops und casas. Ohne
-- diese Ergänzung blieben gelöschte Módulos für immer in der Datenbank
-- stehen -- unsichtbar, aber unaufgeräumt. Wortgleich aus 004 übernommen,
-- ergänzt um den dritten DELETE. Nur ersetzen, wenn es sie schon gibt: auf
-- einer Installation ohne 004 hat sie hier nichts zu suchen.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.soft_delete_cleanup()') is null then
    raise notice
      'modulos: soft_delete_cleanup() fehlt (Migration 004 nicht eingespielt) -- '
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

      delete from public.modulos
       where deleted_at is not null
         and deleted_at < now() - interval '30 days';
    end;
    $body$;
  $fn$;

  execute 'revoke all on function public.soft_delete_cleanup() from public';
end
$$;


-- ============================================================================
-- Kontrolle
--
-- Diese Abfrage nach dem Lauf einzeln ausführen. Erwartet wird:
--   modulos_existe        = true
--   view_existe           = true
--   publicados            = 4   (die vier Startmodule)
--   sin_snapshot          = 0   (jedes 'published' hat seinen Schnappschuss)
--   politicas             = 1   (genau modulos_site_editors)
--   anon_en_tabla         = 0   (anon hat auf der Basistabelle KEIN Recht)
--   anon_en_vista         = 1   (anon darf genau SELECT auf der View)
-- ============================================================================
--
--  select
--    to_regclass('public.modulos')      is not null            as modulos_existe,
--    to_regclass('public.modulos_public') is not null          as view_existe,
--    (select count(*) from public.modulos
--      where status = 'published' and deleted_at is null)      as publicados,
--    (select count(*) from public.modulos
--      where status = 'published' and published_payload is null) as sin_snapshot,
--    (select count(*) from pg_policies
--      where schemaname = 'public' and tablename = 'modulos')  as politicas,
--    (select count(*) from information_schema.role_table_grants
--      where table_schema = 'public' and table_name = 'modulos'
--        and grantee = 'anon')                                 as anon_en_tabla,
--    (select count(*) from information_schema.role_table_grants
--      where table_schema = 'public' and table_name = 'modulos_public'
--        and grantee = 'anon')                                 as anon_en_vista;
--
-- Gegenprobe von außen, ohne Anmeldung: /rest/v1/modulos_public liefert die
-- vier Module, /rest/v1/modulos liefert eine Rechtefehlermeldung.
-- ============================================================================

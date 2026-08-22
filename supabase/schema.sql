-- ============================================================================
-- Retoños del Edén — Schema für Workshops & Lehmhäuser
--
-- Vollständige Referenz für ein FRISCHES Supabase-Projekt.
-- Im SQL Editor einmalig ausführen, danach seed.sql.
-- Für eine BESTEHENDE Installation stattdessen
-- supabase/migrations/001_draft_publish.sql laufen lassen.
--
-- ============================================================================
-- ACHTUNG -- DIESE DATEI ALLEIN REICHT NICHT
--
-- Danach ZWINGEND in dieser Reihenfolge laufen lassen:
--   migrations/002_admin_allowlist.sql   (Adresse der Nutzerin eintragen)
--   migrations/003_audit_und_deploy_bremse.sql   (Deploy-Hook-URL eintragen)
--   migrations/004_soft_delete.sql               (Deploy-Hook-URL eintragen)
--
-- Bis 002 gelaufen ist, gilt in dieser Datei noch das ALTE Rechtemodell
-- (siehe unten): jede Person mit irgendeinem Konto in diesem Supabase-
-- Projekt darf alles lesen, schreiben und löschen. Ein frisches Projekt
-- gehört deshalb erst nach 002 mit echten Inhalten befüllt -- und der
-- Schalter "Allow new users to sign up" gehört vorher aus
-- (PLAN-SICHERHEIT.md, Phase 0).
-- ============================================================================
--
-- Sicherheitsmodell
-- -----------------
-- anon (der öffentliche Website-Build) liest AUSSCHLIESSLICH die beiden
-- Views workshops_public / casas_public. Auf die Basistabellen hat anon
-- gar keine Rechte mehr -- sonst könnten Autosave-Zwischenstände aus dem
-- Backend auf der Website landen.
--
-- Auf der Schreibseite stand hier ursprünglich "authenticated (die
-- Nutzerin) darf alles". Das war der Fehler: `authenticated` heißt in
-- Postgres nicht "die Nutzerin", sondern "irgendwer mit einem Konto in
-- diesem Projekt" -- und Konten konnte sich jeder selbst anlegen. Seit
-- 002_admin_allowlist.sql fragen alle Policys stattdessen
-- public.is_admin() gegen die Allowlist public.admins.
-- Die Policys weiter unten in dieser Datei sind der Stand VOR dieser
-- Korrektur; 002 ersetzt sie. Wer sie kopiert, kopiert die Lücke mit.
--
-- Entwurf vs. veröffentlicht
-- --------------------------
-- Jede Zeile trägt ihren Arbeitsstand in den normalen Spalten und ihren
-- veröffentlichten Stand als Schnappschuss in `published_payload`.
-- Die Views lesen nur den Schnappschuss. Veröffentlichen und Verwerfen
-- laufen über die RPC-Funktionen weiter unten -- immer in EINEM Aufruf,
-- damit der Browser keinen halbfertigen Mehrschritt-Schreibvorgang
-- hinterlassen kann.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Gemeinsame Helfer
-- ----------------------------------------------------------------------------

/**
 * Inhaltsteil einer Zeile: alles außer den Verwaltungsspalten.
 * Genau das wird veröffentlicht und genau das entscheidet, ob es
 * unveröffentlichte Änderungen gibt.
 *
 * `sort_order` und `status` sind bewusst NICHT Inhalt: Umsortieren und
 * Archivieren sind Sofortaktionen aus der Liste, keine Editor-Änderungen.
 */
create or replace function public.content_snapshot(p_row jsonb)
returns jsonb
language sql
immutable
as $$
  select p_row - array[
    'id', 'created_at', 'updated_at', 'status', 'sort_order',
    'published_payload', 'published_at', 'has_unpublished_changes'
  ]::text[];
$$;

/**
 * Setzt bei jeder inhaltlichen Änderung has_unpublished_changes = true.
 * Publizieren und Verwerfen schalten den Trigger über die
 * Transaktions-Variable app.publishing kurz ab, weil sie die Marker
 * selbst setzen.
 */
create or replace function public.mark_unpublished_changes()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();

  if coalesce(current_setting('app.publishing', true), '') = 'on' then
    return new;
  end if;

  if public.content_snapshot(to_jsonb(new))
     is distinct from public.content_snapshot(to_jsonb(old)) then
    new.has_unpublished_changes := true;
  end if;

  return new;
end;
$$;

/** Slug aus einem Titel: Kleinbuchstaben, ohne Akzente, ohne Zufallssuffix. */
create or replace function public.slugify(p_text text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      trim(both '-' from
        regexp_replace(
          regexp_replace(
            lower(translate(
              coalesce(p_text, ''),
              'áàäâãåéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
              'aaaaaaeeeeiiiiooooouuuuncAAAAAAEEEEIIIIOOOOOUUUUNC'
            )),
            '[^a-z0-9]+', '-', 'g'
          ),
          '-{2,}', '-', 'g'
        )
      ),
      ''
    ),
    'sin-titulo'
  );
$$;

/**
 * Freier Slug für `p_table`: der Slug aus dem Titel, bei Kollision
 * -2, -3, -4 ... `p_id` schließt die eigene Zeile von der Prüfung aus.
 * Bewusst ohne dynamisches SQL, damit die Rechteprüfung eindeutig bleibt.
 */
create or replace function public.unique_slug(
  p_table text,
  p_title text,
  p_id    uuid default null
)
returns text
language plpgsql
stable
as $$
declare
  v_base  text := public.slugify(p_title);
  v_try   text;
  v_n     integer := 1;
  v_taken boolean;
begin
  if p_table not in ('workshops', 'casas') then
    raise exception 'unique_slug: tabla desconocida "%"', p_table;
  end if;

  loop
    v_try := case when v_n = 1 then v_base else v_base || '-' || v_n end;

    if p_table = 'workshops' then
      select exists (
        select 1 from public.workshops
         where slug = v_try and (p_id is null or id <> p_id)
      ) into v_taken;
    else
      select exists (
        select 1 from public.casas
         where slug = v_try and (p_id is null or id <> p_id)
      ) into v_taken;
    end if;

    exit when not v_taken;
    v_n := v_n + 1;
  end loop;

  return v_try;
end;
$$;

-- ----------------------------------------------------------------------------
-- workshops
-- ----------------------------------------------------------------------------
create table if not exists public.workshops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  -- Katalog-Schlüssel aus src/data/workshop-themes.ts (Header-Illustration,
  -- Karten-Icon und Akzentfarbe sind darüber im Code definiert, nicht in der DB).
  theme_id text not null default 'clay'
    constraint workshops_theme_id_check
    check (theme_id in ('bee','lavender','pistachio','organic','clay','cielo','semilla')),
  status text not null default 'draft'
    constraint workshops_status_check
    check (status in ('draft','published','archived')),
  -- numeric statt integer: Umsortieren per Drag & Drop schreibt den
  -- Mittelwert der Nachbarn und braucht damit nur EIN Update.
  sort_order numeric not null default 0,
  price numeric(10,2) not null default 0 check (price >= 0),
  currency text not null default 'USD'
    constraint workshops_currency_check
    check (currency in ('USD','UYU','EUR','ARS')),
  hours numeric(4,1) not null default 1 check (hours > 0),
  max_people integer not null default 1 check (max_people > 0),
  instructor_first_name text not null default '',
  instructor_last_name text not null default '',
  -- Einzeltermine, ISO-Datumsstrings, z. B. ["2026-08-08","2026-08-22"]
  dates jsonb not null default '[]'::jsonb,
  -- Sichtbarkeit der Detail-Blöcke
  show_programme boolean not null default true,
  show_included boolean not null default true,
  show_bring boolean not null default true,
  show_for_whom boolean not null default true,
  show_languages boolean not null default true,
  show_meeting_point boolean not null default true,
  -- { es: { title, summary, longDesc, audience, forWhom, languages,
  --         meetingPoint, programme:[{title,text}], included:[], bring:[] }, en: {...} }
  translations jsonb not null default '{}'::jsonb,
  -- Schnappschuss der veröffentlichten Fassung (nur Inhaltsspalten)
  published_payload jsonb,
  has_unpublished_changes boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists workshops_mark_changes on public.workshops;
create trigger workshops_mark_changes
  before update on public.workshops
  for each row execute function public.mark_unpublished_changes();

create index if not exists workshops_status_sort_idx
  on public.workshops (status, sort_order);

-- ----------------------------------------------------------------------------
-- casas
-- ----------------------------------------------------------------------------
create table if not exists public.casas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  -- Veröffentlichungszustand, wie bei workshops.
  status text not null default 'draft'
    constraint casas_status_check
    check (status in ('draft','published','archived')),
  -- Baufortschritt, siehe Karten-Legende auf der Website. Früher lag der
  -- in `status`; seit dem Entwurf/Veröffentlichen-Umbau hat er eine
  -- eigene Spalte.
  build_status text not null default 'planeado'
    constraint casas_build_status_check
    check (build_status in ('listo','enObra','planeado')),
  sort_order numeric not null default 0,
  airbnb_url text,
  beds integer not null default 0 check (beds >= 0),
  guests integer not null default 0 check (guests >= 0),
  area numeric(6,1) not null default 0 check (area >= 0),
  bedrooms integer not null default 0 check (bedrooms >= 0),
  bathrooms integer not null default 0 check (bathrooms >= 0),
  -- [{ glyph, label: { es, en } }] — glyph-Schlüssel aus src/data/casa-glyphs.ts
  amenities jsonb not null default '[]'::jsonb,
  -- [{ glyph, label: { es, en }, note: { es, en } }]
  highlights jsonb not null default '[]'::jsonb,
  -- { es: { title, tagline, body: [...], bookNote }, en: {...} }
  translations jsonb not null default '{}'::jsonb,
  -- Schnappschuss inkl. der Fotos (Schlüssel "images"), siehe publish_casa
  published_payload jsonb,
  has_unpublished_changes boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists casas_mark_changes on public.casas;
create trigger casas_mark_changes
  before update on public.casas
  for each row execute function public.mark_unpublished_changes();

create index if not exists casas_status_sort_idx
  on public.casas (status, sort_order);

-- ----------------------------------------------------------------------------
-- casa_images — eigene Tabelle statt jsonb, weil jedes Bild ein echtes
-- Storage-Objekt ist (Löschen/Neuordnen muss Datei + Zeile zusammenhalten).
-- Leer für eine Casa => Frontend zeigt eine Aquarell-Platzhalter-Illustration.
--
-- WICHTIG: Beim Löschen einer Casa räumt `on delete cascade` nur die Zeilen
-- ab. Die Dateien im Bucket muss der Client vorher löschen -- Reihenfolge
-- immer: erst Storage, dann Zeile. Sonst bleiben verwaiste Dateien liegen.
-- ----------------------------------------------------------------------------
create table if not exists public.casa_images (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references public.casas (id) on delete cascade,
  storage_path text not null,
  url text not null,
  alt_es text not null default '',
  alt_en text not null default '',
  sort_order numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists casa_images_casa_id_sort_idx
  on public.casa_images (casa_id, sort_order);

/**
 * Fotos sind Sofortaktionen (Hochladen/Löschen wirken direkt), gehören aber
 * zum veröffentlichten Stand. Deshalb markiert jede Fotoänderung das Haus
 * als "geändert, noch nicht veröffentlicht".
 */
create or replace function public.casa_images_touch_casa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_casa uuid;
begin
  if tg_op = 'DELETE' then
    v_casa := old.casa_id;
  else
    v_casa := new.casa_id;
  end if;

  update public.casas
     set has_unpublished_changes = true
   where id = v_casa
     and published_payload is not null;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists casa_images_touch_casa on public.casa_images;
create trigger casa_images_touch_casa
  after insert or update or delete on public.casa_images
  for each row execute function public.casa_images_touch_casa();

-- ----------------------------------------------------------------------------
-- Veröffentlichen & Verwerfen (je EIN Aufruf aus dem Browser)
-- ----------------------------------------------------------------------------

/** Aktuellen Arbeitsstand eines Workshops zum veröffentlichten machen. */
create or replace function public.publish_workshop(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  -- Schnappschuss zuerst holen. Das ist zugleich die Existenzprüfung
  -- (FOUND wäre nach dem set_config unbrauchbar) und spart eine
  -- Ganzzeilen-Referenz im UPDATE.
  select public.content_snapshot(to_jsonb(w))
    into v_payload
    from public.workshops w
   where w.id = p_id;

  if v_payload is null then
    raise exception 'No existe el taller %', p_id using errcode = 'no_data_found';
  end if;

  perform set_config('app.publishing', 'on', true);

  update public.workshops
     set published_payload       = v_payload,
         published_at            = now(),
         has_unpublished_changes = false,
         status                  = 'published'
   where id = p_id;

  perform set_config('app.publishing', 'off', true);
end;
$$;

/**
 * Wie publish_workshop, nur dass die Fotos aus casa_images
 * mit in den Schnappschuss wandern -- die Views lesen ausschließlich
 * den Schnappschuss, dürfen also nicht live auf casa_images schauen.
 */
create or replace function public.publish_casa(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_images  jsonb;
  v_payload jsonb;
begin
  select public.content_snapshot(to_jsonb(c))
    into v_payload
    from public.casas c
   where c.id = p_id;

  if v_payload is null then
    raise exception 'No existe la casa %', p_id using errcode = 'no_data_found';
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',         i.id,
               'url',        i.url,
               'alt_es',     i.alt_es,
               'alt_en',     i.alt_en,
               'sort_order', i.sort_order
             )
             order by i.sort_order, i.created_at
           ),
           '[]'::jsonb
         )
    into v_images
    from public.casa_images i
   where i.casa_id = p_id;

  perform set_config('app.publishing', 'on', true);

  update public.casas
     set published_payload       = v_payload || jsonb_build_object('images', v_images),
         published_at            = now(),
         has_unpublished_changes = false,
         status                  = 'published'
   where id = p_id;

  perform set_config('app.publishing', 'off', true);
end;
$$;

/** Entwurf auf den zuletzt veröffentlichten Stand zurücksetzen. */
create or replace function public.discard_workshop_changes(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  select published_payload into v_payload from public.workshops where id = p_id;

  if v_payload is null then
    raise exception 'El taller % todavía no fue publicado', p_id
      using errcode = 'no_data_found';
  end if;

  perform set_config('app.publishing', 'on', true);

  update public.workshops w
     set slug                    = r.slug,
         theme_id                = r.theme_id,
         price                   = r.price,
         currency                = r.currency,
         hours                   = r.hours,
         max_people              = r.max_people,
         instructor_first_name   = r.instructor_first_name,
         instructor_last_name    = r.instructor_last_name,
         dates                   = r.dates,
         show_programme          = r.show_programme,
         show_included           = r.show_included,
         show_bring              = r.show_bring,
         show_for_whom           = r.show_for_whom,
         show_languages          = r.show_languages,
         show_meeting_point      = r.show_meeting_point,
         translations            = r.translations,
         has_unpublished_changes = false
    from jsonb_populate_record(null::public.workshops, v_payload) r
   where w.id = p_id;

  perform set_config('app.publishing', 'off', true);
end;
$$;

/**
 * Wie discard_workshop_changes. Die Fotos bleiben unangetastet:
 * Hochladen und Löschen wirken sofort auf den Storage, ein Zurückrollen
 * würde entweder Dateien verwaisen lassen oder gelöschte nicht
 * zurückbringen. Auf der Website zählt ohnehin nur der Schnappschuss.
 */
create or replace function public.discard_casa_changes(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  select published_payload into v_payload from public.casas where id = p_id;

  if v_payload is null then
    raise exception 'La casa % todavía no fue publicada', p_id
      using errcode = 'no_data_found';
  end if;

  perform set_config('app.publishing', 'on', true);

  update public.casas c
     set slug                    = r.slug,
         build_status            = r.build_status,
         airbnb_url              = r.airbnb_url,
         beds                    = r.beds,
         guests                  = r.guests,
         area                    = r.area,
         bedrooms                = r.bedrooms,
         bathrooms               = r.bathrooms,
         amenities               = r.amenities,
         highlights              = r.highlights,
         translations            = r.translations,
         has_unpublished_changes = false
    from jsonb_populate_record(null::public.casas, v_payload) r
   where c.id = p_id;

  perform set_config('app.publishing', 'off', true);
end;
$$;

/** Bequeme Weiche für den generischen Store im Backend. */
create or replace function public.publish_entity(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  case p_table
    when 'workshops' then perform public.publish_workshop(p_id);
    when 'casas'     then perform public.publish_casa(p_id);
    else raise exception 'publish_entity: tabla desconocida "%"', p_table;
  end case;
end;
$$;

create or replace function public.discard_changes(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  case p_table
    when 'workshops' then perform public.discard_workshop_changes(p_id);
    when 'casas'     then perform public.discard_casa_changes(p_id);
    else raise exception 'discard_changes: tabla desconocida "%"', p_table;
  end case;
end;
$$;

-- ----------------------------------------------------------------------------
-- Öffentliche Views — die einzige Datenquelle des Website-Builds
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
  and w.published_payload is not null;

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
  and c.published_payload is not null;

-- ----------------------------------------------------------------------------
-- Row Level Security & Rechte
--
-- Die Views laufen bewusst OHNE security_invoker: sie gehören postgres und
-- umgehen damit die RLS der Basistabellen. Genau deshalb darf anon auf den
-- Basistabellen gar keine Rechte haben. Der Supabase-Linter meldet dazu
-- "security definer view" -- das ist hier die Absicht, keine Lücke.
-- ----------------------------------------------------------------------------
alter table public.workshops enable row level security;
alter table public.casas enable row level security;
alter table public.casa_images enable row level security;

grant usage on schema public to anon, authenticated;

revoke all on public.workshops from anon;
revoke all on public.casas from anon;
revoke all on public.casa_images from anon;

grant select, insert, update, delete on public.workshops to authenticated;
grant select, insert, update, delete on public.casas to authenticated;
grant select, insert, update, delete on public.casa_images to authenticated;

-- Supabase vergibt per ALTER DEFAULT PRIVILEGES automatisch ALL auf neue
-- Objekte an anon. Deshalb erst wegnehmen, dann gezielt nur SELECT geben.
revoke all on public.workshops_public from anon, authenticated;
revoke all on public.casas_public from anon, authenticated;

grant select on public.workshops_public to anon, authenticated;
grant select on public.casas_public to anon, authenticated;

drop policy if exists workshops_public_read on public.workshops;
drop policy if exists casas_public_read on public.casas;
drop policy if exists casa_images_public_read on public.casa_images;

drop policy if exists workshops_authenticated_all on public.workshops;
create policy workshops_authenticated_all
  on public.workshops for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists casas_authenticated_all on public.casas;
create policy casas_authenticated_all
  on public.casas for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists casa_images_authenticated_all on public.casa_images;
create policy casa_images_authenticated_all
  on public.casa_images for all
  to authenticated
  using (true)
  with check (true);

-- Funktionen sind per Vorgabe für PUBLIC ausführbar -- hier eingeschränkt.
revoke all on function public.publish_workshop(uuid) from public;
revoke all on function public.publish_casa(uuid) from public;
revoke all on function public.discard_workshop_changes(uuid) from public;
revoke all on function public.discard_casa_changes(uuid) from public;
revoke all on function public.publish_entity(text, uuid) from public;
revoke all on function public.discard_changes(text, uuid) from public;
revoke all on function public.slugify(text) from public;
revoke all on function public.unique_slug(text, text, uuid) from public;

grant execute on function public.publish_workshop(uuid) to authenticated;
grant execute on function public.publish_casa(uuid) to authenticated;
grant execute on function public.discard_workshop_changes(uuid) to authenticated;
grant execute on function public.discard_casa_changes(uuid) to authenticated;
grant execute on function public.publish_entity(text, uuid) to authenticated;
grant execute on function public.discard_changes(text, uuid) to authenticated;
grant execute on function public.slugify(text) to authenticated;
grant execute on function public.unique_slug(text, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Storage: Bucket für Lehmhaus-Fotos
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('casa-photos', 'casa-photos', true)
on conflict (id) do nothing;

drop policy if exists casa_photos_public_read on storage.objects;
create policy casa_photos_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'casa-photos');

drop policy if exists casa_photos_authenticated_write on storage.objects;
create policy casa_photos_authenticated_write
  on storage.objects for all
  to authenticated
  using (bucket_id = 'casa-photos')
  with check (bucket_id = 'casa-photos');

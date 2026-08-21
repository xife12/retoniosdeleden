-- ============================================================================
-- Migration 001 — Entwurf/Veröffentlichen, einheitlicher Status, Slug ohne
-- Zufallssuffix, fraktionale Sortierung.
--
-- Für BESTEHENDE Installationen. Im Supabase SQL Editor als Ganzes
-- ausführen. Das Skript ist idempotent: ein zweiter Lauf ändert nichts
-- mehr und macht nichts kaputt.
--
-- Was passiert:
--  1. casas.status trug bisher den Baufortschritt. Der zieht nach
--     casas.build_status um; casas.status wird -- wie bei workshops --
--     der Veröffentlichungszustand (draft/published/archived).
--     casas.archived entfällt und geht in status auf.
--  2. Neue Spalten published_payload / has_unpublished_changes /
--     published_at plus Trigger.
--  3. sort_order wird numeric (Drag & Drop schreibt Mittelwerte).
--  4. Views workshops_public / casas_public; anon verliert jeden Zugriff
--     auf die Basistabellen.
--  5. Alles, was bisher öffentlich war, bekommt sofort seinen
--     veröffentlichten Schnappschuss -- die Website bleibt also
--     unverändert, sobald der nächste Build läuft.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 0. Gemeinsame Helfer (create or replace => beliebig oft ausführbar)
-- ----------------------------------------------------------------------------

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
-- 1. Neue Spalten
-- ----------------------------------------------------------------------------
alter table public.workshops add column if not exists published_payload jsonb;
alter table public.workshops add column if not exists has_unpublished_changes boolean not null default false;
alter table public.workshops add column if not exists published_at timestamptz;

alter table public.casas add column if not exists published_payload jsonb;
alter table public.casas add column if not exists has_unpublished_changes boolean not null default false;
alter table public.casas add column if not exists published_at timestamptz;

-- ----------------------------------------------------------------------------
-- 2. workshops.status: 'draft' ergänzen
-- ----------------------------------------------------------------------------
alter table public.workshops drop constraint if exists workshops_status_check;
alter table public.workshops alter column status set default 'draft';
alter table public.workshops add constraint workshops_status_check
  check (status in ('draft','published','archived'));

-- Themenkatalog und Währungen bei der Gelegenheit auf den Stand von
-- src/data/workshop-themes.ts bringen (benannte Constraints, damit ein
-- zweiter Lauf sie sauber ersetzen kann).
alter table public.workshops drop constraint if exists workshops_theme_id_check;
alter table public.workshops add constraint workshops_theme_id_check
  check (theme_id in ('bee','lavender','pistachio','organic','clay','cielo','semilla'));

alter table public.workshops drop constraint if exists workshops_currency_check;
alter table public.workshops add constraint workshops_currency_check
  check (currency in ('USD','UYU','EUR','ARS'));

-- ----------------------------------------------------------------------------
-- 3. casas: Baufortschritt nach build_status, status wird Veröffentlichungszustand
-- ----------------------------------------------------------------------------
alter table public.casas add column if not exists build_status text;

-- Alte Prüfung muss weg, bevor 'published' in status geschrieben werden kann.
alter table public.casas drop constraint if exists casas_status_check;

update public.casas
   set build_status = status
 where build_status is null
   and status in ('listo','enObra','planeado');

update public.casas set build_status = 'planeado' where build_status is null;

alter table public.casas alter column build_status set default 'planeado';
alter table public.casas alter column build_status set not null;
alter table public.casas drop constraint if exists casas_build_status_check;
alter table public.casas add constraint casas_build_status_check
  check (build_status in ('listo','enObra','planeado'));

-- archived -> status, danach fällt die Spalte weg.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'casas' and column_name = 'archived'
  ) then
    update public.casas
       set status = case when archived then 'archived' else 'published' end
     where status in ('listo','enObra','planeado');

    -- Die alte Leserichtlinie für anon greift auf "archived" zu (using (not
    -- archived)) und muss vor der Spalte selbst weg, sonst verweigert Postgres
    -- den DROP COLUMN wegen der Abhängigkeit (Fehler 2BP01). Abschnitt 9 legt
    -- ohnehin die endgültige, view-basierte Regel für anon neu an.
    drop policy if exists casas_public_read on public.casas;

    drop index if exists public.casas_archived_sort_idx;
    alter table public.casas drop column archived;
  end if;
end
$$;

-- Sicherheitsnetz, falls archived schon vorher entfernt wurde.
update public.casas set status = 'published' where status in ('listo','enObra','planeado');

alter table public.casas alter column status set default 'draft';
alter table public.casas add constraint casas_status_check
  check (status in ('draft','published','archived'));

create index if not exists casas_status_sort_idx on public.casas (status, sort_order);
create index if not exists workshops_status_sort_idx on public.workshops (status, sort_order);

-- ----------------------------------------------------------------------------
-- 4. sort_order auf numeric (fraktionale Reihenfolge)
-- ----------------------------------------------------------------------------
do $$
begin
  if (select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'workshops'
         and column_name = 'sort_order') is distinct from 'numeric' then
    alter table public.workshops alter column sort_order type numeric;
  end if;

  if (select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'casas'
         and column_name = 'sort_order') is distinct from 'numeric' then
    alter table public.casas alter column sort_order type numeric;
  end if;

  if (select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'casa_images'
         and column_name = 'sort_order') is distinct from 'numeric' then
    alter table public.casa_images alter column sort_order type numeric;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 5. Trigger: alter updated_at-Trigger raus, neuer Änderungsmarker rein
-- ----------------------------------------------------------------------------
drop trigger if exists workshops_set_updated_at on public.workshops;
drop trigger if exists casas_set_updated_at on public.casas;

-- Aufräumen, aber nicht auf Kosten der Migration: falls die Funktion noch
-- irgendwo hängt, bleibt sie einfach stehen.
do $$
begin
  drop function if exists public.set_updated_at();
exception
  when dependent_objects_still_exist then null;
end
$$;

drop trigger if exists workshops_mark_changes on public.workshops;
create trigger workshops_mark_changes
  before update on public.workshops
  for each row execute function public.mark_unpublished_changes();

drop trigger if exists casas_mark_changes on public.casas;
create trigger casas_mark_changes
  before update on public.casas
  for each row execute function public.mark_unpublished_changes();

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
-- 6. Veröffentlichen & Verwerfen
-- ----------------------------------------------------------------------------

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
-- 7. Bestand veröffentlichen: alles, was vorher live war, bleibt live
-- ----------------------------------------------------------------------------
do $$
begin
  perform set_config('app.publishing', 'on', true);

  update public.workshops w
     set published_payload       = (select public.content_snapshot(to_jsonb(x))
                                      from public.workshops x where x.id = w.id),
         published_at            = coalesce(w.published_at, w.updated_at, now()),
         has_unpublished_changes = false
   where w.status = 'published'
     and w.published_payload is null;

  update public.casas c
     set published_payload = (select public.content_snapshot(to_jsonb(y))
                                from public.casas y where y.id = c.id)
           || jsonb_build_object(
                'images',
                coalesce(
                  (select jsonb_agg(
                            jsonb_build_object(
                              'id',         i.id,
                              'url',        i.url,
                              'alt_es',     i.alt_es,
                              'alt_en',     i.alt_en,
                              'sort_order', i.sort_order
                            )
                            order by i.sort_order, i.created_at
                          )
                     from public.casa_images i
                    where i.casa_id = c.id),
                  '[]'::jsonb
                )
              ),
         published_at            = coalesce(c.published_at, c.updated_at, now()),
         has_unpublished_changes = false
   where c.status = 'published'
     and c.published_payload is null;

  perform set_config('app.publishing', 'off', true);
end
$$;

-- ----------------------------------------------------------------------------
-- 8. Öffentliche Views
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
-- 9. Rechte: anon sieht nur noch die Views
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
drop policy if exists casa_images_authenticated_write on public.casa_images;

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
-- 10. Storage-Regeln auffrischen (unverändert, nur idempotent gemacht)
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

-- ============================================================================
-- Retoños del Edén — Schema für Workshops & Lehmhäuser
--
-- Im Supabase SQL Editor ausführen (einmalig), danach seed.sql ausführen.
-- Sicherheitsmodell: anon (der öffentliche Website-Build) darf nur
-- veröffentlichte / nicht archivierte Inhalte lesen. authenticated (die
-- Mutter, eingeloggt über Supabase Auth) darf alles lesen und schreiben.
-- Es gibt bewusst keine weitere Rollenabstufung (Einzelnutzerin).
-- ============================================================================

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- workshops
-- ----------------------------------------------------------------------------
create table workshops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  -- Katalog-Schlüssel aus src/data/workshop-themes.ts (Header-Illustration,
  -- Karten-Icon und Akzentfarbe sind darüber im Code definiert, nicht in der DB).
  theme_id text not null check (theme_id in ('bee','lavender','pistachio','organic','clay','cielo','semilla')),
  status text not null default 'published' check (status in ('published','archived')),
  sort_order integer not null default 0,
  price numeric(10,2) not null check (price >= 0),
  currency text not null default 'USD' check (currency in ('USD','UYU','EUR','ARS')),
  hours numeric(4,1) not null check (hours > 0),
  max_people integer not null check (max_people > 0),
  instructor_first_name text not null default '',
  instructor_last_name text not null default '',
  -- Einzeltermine, ISO-Datumsstrings, z. B. ["2026-08-08","2026-08-22"]
  dates jsonb not null default '[]'::jsonb,
  -- Sichtbarkeit der Detail-Blöcke (JTB "Formularfelder an/aus")
  show_programme boolean not null default true,
  show_included boolean not null default true,
  show_bring boolean not null default true,
  show_for_whom boolean not null default true,
  show_languages boolean not null default true,
  show_meeting_point boolean not null default true,
  -- { es: { title, summary, longDesc, audience, forWhom, languages,
  --         meetingPoint, programme:[{title,text}], included:[], bring:[] }, en: {...} }
  translations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workshops_set_updated_at
  before update on workshops
  for each row execute function set_updated_at();

create index workshops_status_sort_idx on workshops (status, sort_order);

-- ----------------------------------------------------------------------------
-- casas
-- ----------------------------------------------------------------------------
create table casas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  -- Baufortschritt, siehe Karten-Legende auf der Website
  status text not null default 'planeado' check (status in ('listo','enObra','planeado')),
  -- unabhängig vom Baufortschritt: von der Website ausgeblendet
  archived boolean not null default false,
  sort_order integer not null default 0,
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
  -- { es: { tagline, body: [...], bookNote }, en: {...} }
  translations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger casas_set_updated_at
  before update on casas
  for each row execute function set_updated_at();

create index casas_archived_sort_idx on casas (archived, sort_order);

-- ----------------------------------------------------------------------------
-- casa_images — eigene Tabelle statt jsonb, weil jedes Bild ein echtes
-- Storage-Objekt ist (Löschen/Neuordnen muss Datei + Zeile zusammenhalten).
-- Leer für eine Casa => Frontend zeigt eine Aquarell-Platzhalter-Illustration.
-- ----------------------------------------------------------------------------
create table casa_images (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references casas (id) on delete cascade,
  storage_path text not null,
  url text not null,
  alt_es text not null default '',
  alt_en text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index casa_images_casa_id_sort_idx on casa_images (casa_id, sort_order);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table workshops enable row level security;
alter table casas enable row level security;
alter table casa_images enable row level security;

grant usage on schema public to anon, authenticated;

grant select on workshops to anon;
grant select, insert, update, delete on workshops to authenticated;

grant select on casas to anon;
grant select, insert, update, delete on casas to authenticated;

grant select on casa_images to anon, authenticated;
grant insert, update, delete on casa_images to authenticated;

create policy workshops_public_read
  on workshops for select
  to anon
  using (status = 'published');

create policy workshops_authenticated_all
  on workshops for all
  to authenticated
  using (true)
  with check (true);

create policy casas_public_read
  on casas for select
  to anon
  using (not archived);

create policy casas_authenticated_all
  on casas for all
  to authenticated
  using (true)
  with check (true);

-- Bilder sind nicht sensibel (der Build fragt ohnehin nur Bilder bereits
-- gefilterter Casas ab), deshalb offen lesbar statt über eine Subquery
-- an den Status der übergeordneten Casa gekoppelt.
create policy casa_images_public_read
  on casa_images for select
  to anon, authenticated
  using (true);

create policy casa_images_authenticated_write
  on casa_images for all
  to authenticated
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- Storage: Bucket für Lehmhaus-Fotos
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('casa-photos', 'casa-photos', true)
on conflict (id) do nothing;

create policy casa_photos_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'casa-photos');

create policy casa_photos_authenticated_write
  on storage.objects for all
  to authenticated
  using (bucket_id = 'casa-photos')
  with check (bucket_id = 'casa-photos');

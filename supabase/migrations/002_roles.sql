-- ============================================================================
-- Migration 002 — Rollen: profiles, may_edit_site(), Policies umstellen.
--
-- Für BESTEHENDE Installationen. Im Supabase SQL Editor als Ganzes
-- ausführen, NACH 001_draft_publish.sql. Das Skript ist idempotent: ein
-- zweiter Lauf ändert nichts mehr und macht nichts kaputt.
--
-- Warum es dieses Modul gibt: bisher darf jede angemeldete Person auf
-- workshops/casas ALLES (`using (true)`). Das war vertretbar, solange nur
-- die Familie einen Zugang hatte. Mit dem Dokumentenmodul (Migration 003)
-- können beliebig viele Personen einen Login bekommen -- und ohne
-- Rollenprüfung könnte jede von ihnen die öffentliche Website bearbeiten,
-- veröffentlichen oder löschen. Siehe PLAN-DOCUMENTOS.md Abschnitt 3.
--
-- ACHTUNG, REIHENFOLGE IST SICHERHEITSKRITISCH
-- ----------------------------------------------
-- Diese Migration MUSS in der Reihenfolge ausgeführt werden, in der sie
-- unten steht:
--   1. Tabelle `profiles` anlegen.
--   2. Für JEDE bereits vorhandene `auth.users`-Zeile sofort ein Profil mit
--      Rolle 'owner' erzeugen.
--   3. ERST DANACH die Policies auf workshops/casas/casa_images von
--      `using (true)` auf `may_edit_site()` umstellen.
-- Würde Schritt 3 vor Schritt 2 laufen, hätte die bestehende Nutzerin für
-- den Moment dazwischen kein Profil und wäre aus ihrem eigenen Backend
-- ausgesperrt. Deshalb stehen die Schritte hier nicht nur in dieser
-- Reihenfolge im Skript, sondern sind unten zusätzlich klar markiert.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- SCHRITT 1 — Tabelle profiles
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  -- Anzeigename, unabhängig von der E-Mail-Adresse -- wird überall gebraucht,
  -- wo eine Person genannt wird (Kommentare, Aufgaben, Versionsverlauf).
  display_name text not null,
  -- 1-2 Zeichen für den Avatar, z. B. "CM" für Catalina.
  initials     text not null,
  role         text not null default 'member'
    constraint profiles_role_check
    check (role in ('owner', 'editor', 'member')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SCHRITT 2 — Profile für ALLE bereits vorhandenen auth.users anlegen,
-- BEVOR irgendeine Policy umgestellt wird. Rolle 'owner', damit niemand
-- Bestehendes ausgesperrt wird -- Maxi kann Rollen danach im SQL Editor
-- oder (später) über #/documentos/personas anpassen.
--
-- *** DIESER BLOCK MUSS VOR SCHRITT 3 LAUFEN. NICHT UMSTELLEN. ***
-- ----------------------------------------------------------------------------

insert into public.profiles (id, display_name, initials, role, is_active)
select
  u.id,
  -- Anzeigename aus der E-Mail-Adresse ableiten: Teil vor dem @, erster
  -- Buchstabe groß. Nur ein Startwert -- Maxi trägt echte Namen nach.
  -- coalesce fängt den (bei Passwort-Logins seltenen) Fall ab, dass
  -- email null ist, damit das Anlegen nie an "display_name not null" scheitert.
  initcap(split_part(coalesce(u.email, 'usuario'), '@', 1)),
  upper(left(split_part(coalesce(u.email, 'usuario'), '@', 1), 2)),
  'owner',
  true
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);

-- ----------------------------------------------------------------------------
-- Trigger: neue auth.users-Zeilen bekommen automatisch ein Profil.
-- Rolle 'member' -- eine höhere Rolle vergibt Maxi bewusst von Hand, nie
-- automatisch. Läuft mit security definer, weil das Einfügetrigger auf
-- auth.users sonst an dessen RLS scheitern würde.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, initials, role, is_active)
  values (
    new.id,
    initcap(split_part(coalesce(new.email, 'usuario'), '@', 1)),
    upper(left(split_part(coalesce(new.email, 'usuario'), '@', 1), 2)),
    'member',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- may_edit_site() -- darf die öffentliche Website (workshops/casas) bearbeiten?
-- security definer, weil ausführende Personen selbst kein select-Recht auf
-- profiles brauchen sollen, nur die Antwort dieser Funktion.
-- ----------------------------------------------------------------------------

create or replace function public.may_edit_site()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and is_active
       and role in ('owner', 'editor')
  );
$$;

-- Wie may_edit_site(), aber ausschließlich für die Rolle owner -- gebraucht,
-- um profiles selbst zu schreiben (Rollen vergeben, Personen deaktivieren).
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and is_active
       and role = 'owner'
  );
$$;

-- ----------------------------------------------------------------------------
-- SCHRITT 3 — Policies auf workshops/casas/casa_images umstellen.
-- Läuft NACH Schritt 2, siehe Warnung oben.
-- ----------------------------------------------------------------------------

drop policy if exists workshops_authenticated_all on public.workshops;
create policy workshops_site_editors
  on public.workshops for all
  to authenticated
  using (public.may_edit_site())
  with check (public.may_edit_site());

drop policy if exists casas_authenticated_all on public.casas;
create policy casas_site_editors
  on public.casas for all
  to authenticated
  using (public.may_edit_site())
  with check (public.may_edit_site());

drop policy if exists casa_images_authenticated_all on public.casa_images;
create policy casa_images_site_editors
  on public.casa_images for all
  to authenticated
  using (public.may_edit_site())
  with check (public.may_edit_site());

-- ----------------------------------------------------------------------------
-- RLS & Rechte auf profiles
--
-- Lesen: ALLE angemeldeten Personen dürfen ALLE Profile lesen -- Anzeigenamen
-- und Initialen werden überall gebraucht (Kommentare, Aufgaben, @-Erwähnungen,
-- Versionsverlauf), nicht nur für die eigene Person. Das deckt "jede Person
-- darf ihr eigenes Profil lesen" automatisch mit ab, eine engere Regel dafür
-- wäre also nur zusätzlicher, wirkungsloser Code.
-- Schreiben: nur owner darf profiles ändern (Rolle vergeben, deaktivieren).
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;

grant usage on schema public to anon, authenticated;

revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;

drop policy if exists profiles_authenticated_read on public.profiles;
create policy profiles_authenticated_read
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists profiles_owner_write on public.profiles;
create policy profiles_owner_write
  on public.profiles for insert
  to authenticated
  with check (public.is_owner());

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update
  on public.profiles for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists profiles_owner_delete on public.profiles;
create policy profiles_owner_delete
  on public.profiles for delete
  to authenticated
  using (public.is_owner());

revoke all on function public.may_edit_site() from public;
grant execute on function public.may_edit_site() to authenticated;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

revoke all on function public.handle_new_user() from public;

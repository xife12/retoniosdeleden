-- ============================================================================
-- 002 — Autorisierung an die Person binden
--
-- Behebt die Befunde B1, B2, B4, B10 und B11 aus PLAN-SICHERHEIT.md.
--
-- Das Problem in zwei Sätzen
-- -------------------------
-- Bisher lauteten alle Policys `to authenticated using (true)`. Das Schema
-- meinte damit "die Nutzerin"; Postgres versteht darunter aber "irgendwer mit
-- einem Konto in diesem Supabase-Projekt". Solange sich jeder Mensch selbst
-- eines anlegen kann -- und der dafür nötige anon-Key steht bauartbedingt in
-- jedem ausgelieferten JS-Bundle --, ist das gleichbedeutend mit "alle".
--
-- Diese Migration ersetzt die Frage "ist überhaupt wer angemeldet?" durch
-- "steht diese Person auf der Liste?".
--
-- ----------------------------------------------------------------------------
-- VOR DEM AUSFÜHREN
-- ----------------------------------------------------------------------------
-- 1. Im Dashboard unter Authentication -> Sign In / Providers -> Email den
--    Schalter "Allow new users to sign up" ausschalten (Phase 0 des Plans).
--    Diese Migration ersetzt diesen Schritt nicht, sie sichert ihn ab.
--
-- 2. Herausfinden, welche Adresse eingetragen werden muss. Dazu ZUERST diese
--    Abfrage allein ausführen:
--
--        select id, email, created_at, last_sign_in_at
--          from auth.users order by created_at;
--
--    Erwartet werden zwei Zeilen: du und deine Mutter. Steht dort eine
--    dritte, unbekannte Adresse, ist das der Beleg, dass die offene
--    Registrierung genutzt wurde -- dann NICHT weitermachen, sondern erst
--    klären, wem das Konto gehört.
--
-- 3. Unten bei "HIER ANPASSEN" BEIDE Adressen eintragen -- an zwei Stellen
--    (Abschnitt 3 und Abschnitt 4), jeweils dieselben.
--
-- ----------------------------------------------------------------------------
-- SICHERHEITSNETZ
-- ----------------------------------------------------------------------------
-- Der Supabase-SQL-Editor führt ein eingefügtes Skript als EINE Transaktion
-- aus (HANDOFF-ADMIN.md, Fallstrick 2). Das ist hier ausdrücklich erwünscht:
-- Wird eine Adresse vergessen oder falsch geschrieben, bricht der Wächter
-- weiter unten ab und die gesamte Migration rollt zurück. Die Datenbank
-- bleibt dann exakt im Vorzustand -- lieber gar nichts geändert als das Panel
-- ausgesperrt.
--
-- Und falls doch etwas schiefgeht: der SQL-Editor im Dashboard läuft als
-- `postgres` und ist von RLS nicht betroffen. Ausgesperrt-Sein wäre also
-- unangenehm, aber nie endgültig.
--
-- Reihenfolge: nach 001_draft_publish.sql, vor 003. Idempotent -- ein zweiter
-- Lauf ändert nichts (er trägt die Nutzerin nur nicht doppelt ein).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Die Liste
--
-- Eine Zeile pro Mensch, der das Panel bedienen darf. Bewusst eine eigene
-- Tabelle statt eines Claims im JWT: eine Zeile löschen kann man sofort und
-- ohne Deployment, ein Token-Claim wirkt erst nach dem nächsten Refresh.
-- ----------------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- Nur zur Lesbarkeit beim Draufschauen. Maßgeblich ist user_id;
  -- auth.users bleibt die Wahrheit über Adressen.
  email      text not null,
  created_at timestamptz not null default now()
);

comment on table public.admins is
  'Allowlist für den Adminbereich. Wer hier nicht steht, kommt an keine Zeile '
  'und an keine RPC -- unabhängig davon, ob er ein gültiges Supabase-Konto hat.';

alter table public.admins enable row level security;

-- Bewusst KEINE Policy. Damit ist die Tabelle über PostgREST für niemanden
-- lesbar; die Rechte darauf hat allein is_admin() als security definer.
-- Ein Angreifer soll nicht einmal herausfinden können, wer berechtigt ist.
revoke all on public.admins from anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. Die eine Frage, die ab jetzt überall gestellt wird
--
-- security definer, weil die aufrufende Rolle selbst keinerlei Rechte auf
-- public.admins hat und auch keine bekommen soll.
-- stable statt volatile: Postgres darf das Ergebnis innerhalb einer Anweisung
-- wiederverwenden, statt es pro geprüfter Zeile neu zu berechnen.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $fn$
  select exists (
           select 1 from public.admins a where a.user_id = auth.uid()
         )
     -- Gürtel und Hosenträger: anonyme Anmeldungen sind im Projekt zwar aus,
     -- aber ein solches Token trüge ebenfalls die Rolle `authenticated`.
     -- Würde der Schalter je umgelegt, bliebe die Tür hier trotzdem zu.
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;

  -- PHASE 3 (zweiter Faktor): Sobald die Nutzerin TOTP eingerichtet und sich
  -- damit einmal erfolgreich angemeldet hat, hier zusätzlich anhängen:
  --
  --   and (auth.jwt() ->> 'aal') = 'aal2'
  --
  -- NICHT vorher. Andersherum sperrt sich die Nutzerin zuverlässig aus.
$fn$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;


-- ----------------------------------------------------------------------------
-- 3. HIER ANPASSEN -- wer darf ins Panel?
--
-- Beide Adressen eintragen (du und deine Mutter), jeweils genau so
-- geschrieben wie in auth.users. Gross-/Kleinschreibung und Leerzeichen sind
-- egal, der Rest nicht.
--
-- Die Adressen bekommst du mit dieser Abfrage -- am besten VORHER einmal
-- allein ausfuehren und von dort kopieren:
--
--     select email from auth.users order by created_at;
--
-- Kommt spaeter eine dritte Person dazu, reicht eine Zeile mehr in der
-- values-Liste plus ein erneuter Lauf dieses Abschnitts.
--
-- Muss vor Abschnitt 4 stehen, sonst sperrt sich das Panel selbst aus.
-- ----------------------------------------------------------------------------
insert into public.admins (user_id, email)
select u.id, u.email
  from auth.users u
  join (values
          ('DEINE-ADRESSE@example.com'),          -- <<<<< ERSETZEN
          ('ADRESSE-DER-MUTTER@example.com')      -- <<<<< ERSETZEN
        ) as gewuenscht(email)
    on lower(trim(u.email)) = lower(trim(gewuenscht.email))
on conflict (user_id) do nothing;


-- ----------------------------------------------------------------------------
-- 4. Waechter
--
-- Ab hier wird scharfgeschaltet. Steht die falsche oder gar keine Adresse in
-- Abschnitt 3, waere das Panel danach fuer alle zu. Deshalb hier lieber
-- abbrechen: der Supabase-SQL-Editor fuehrt das ganze Skript als EINE
-- Transaktion aus, ein Abbruch rollt also alles zurueck und die Datenbank
-- steht exakt wie vorher.
--
-- Der Waechter sagt ausserdem, WELCHE Adresse er nicht gefunden hat -- ein
-- Tippfehler soll nicht als raetselhafter Fehlschlag enden.
-- ----------------------------------------------------------------------------
do $guard$
declare
  v_anzahl    integer;
  v_unbekannt text;
begin
  select count(*) into v_anzahl from public.admins;

  -- Gewuenscht, aber in auth.users nicht vorhanden: fast immer ein
  -- Tippfehler oder eine Person, die im Dashboard noch gar nicht angelegt
  -- wurde (Authentication -> Users -> Add user).
  select string_agg(g.email, ', ')
    into v_unbekannt
    from (values
            ('DEINE-ADRESSE@example.com'),          -- <<<<< dieselben zwei
            ('ADRESSE-DER-MUTTER@example.com')      -- <<<<< wie in Abschnitt 3
          ) as g(email)
   where not exists (
           select 1 from auth.users u
            where lower(trim(u.email)) = lower(trim(g.email))
         );

  if v_unbekannt is not null then
    raise exception
      'Abbruch: diese Adresse(n) gibt es in auth.users nicht: %. '
      'Tippfehler, oder die Person ist im Dashboard noch nicht angelegt '
      '(Authentication -> Users -> Add user). Es wurde nichts geaendert.',
      v_unbekannt;
  end if;

  if v_anzahl = 0 then
    raise exception
      'Abbruch: public.admins ist leer. Wurden die Adressen in Abschnitt 3 '
      'wirklich ersetzt? Es wurde nichts geaendert -- die Datenbank ist im '
      'Vorzustand.';
  end if;

  raise notice 'Allowlist enthaelt % Eintrag/Eintraege. Weiter.', v_anzahl;
end;
$guard$;


-- ----------------------------------------------------------------------------
-- 5. Row Level Security umstellen (Befund B1)
--
-- `(select public.is_admin())` steht bewusst in Klammern: so wertet Postgres
-- den Aufruf einmal pro Anweisung als InitPlan aus statt einmal pro Zeile.
-- Ohne die Klammern kostet jede Listenabfrage einen Funktionsaufruf je Zeile.
-- ----------------------------------------------------------------------------
drop policy if exists workshops_authenticated_all on public.workshops;
drop policy if exists workshops_admin_all         on public.workshops;
create policy workshops_admin_all
  on public.workshops for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists casas_authenticated_all on public.casas;
drop policy if exists casas_admin_all         on public.casas;
create policy casas_admin_all
  on public.casas for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists casa_images_authenticated_all on public.casa_images;
drop policy if exists casa_images_admin_all         on public.casa_images;
create policy casa_images_admin_all
  on public.casa_images for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));


-- ----------------------------------------------------------------------------
-- 6. Rechteprüfung in die RPCs (Befund B2)
--
-- OHNE DIESEN ABSCHNITT IST ABSCHNITT 5 WIRKUNGSLOS.
--
-- Alle sechs Funktionen sind `security definer` und laufen damit mit den
-- Rechten des Eigentümers -- an RLS vorbei. Die einzige Hürde war bisher
-- `grant execute to authenticated`. Wer nur die Policys verschärft und die
-- Funktionen unangetastet lässt, kann die Allowlist über publish_workshop()
-- vollständig umgehen: veröffentlichen, verwerfen, Status setzen, alles.
--
-- Die Funktionen sind unverändert aus schema.sql übernommen; hinzugekommen
-- ist ausschließlich der Wächter als jeweils erste Anweisung.
-- ----------------------------------------------------------------------------

create or replace function public.publish_workshop(p_id uuid)
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
$fn$;


create or replace function public.publish_casa(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_images  jsonb;
  v_payload jsonb;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;

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
$fn$;


create or replace function public.discard_workshop_changes(p_id uuid)
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
$fn$;


create or replace function public.discard_casa_changes(p_id uuid)
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
$fn$;


-- Die beiden generischen Weichen prüfen ebenfalls selbst. Die aufgerufene
-- Funktion prüft danach noch einmal -- das ist gewollt: keine der sechs
-- Funktionen soll sich darauf verlassen, dass jemand anderes geprüft hat.
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
    else raise exception 'discard_changes: tabla desconocida "%"', p_table;
  end case;
end;
$fn$;


-- ----------------------------------------------------------------------------
-- 7. search_path festnageln (Befund B10)
--
-- Diese vier laufen als security invoker, das Risiko ist also klein. Es ist
-- aber der Hinweis, den der Supabase-Linter zu Recht meldet, und er kostet
-- eine Zeile pro Funktion.
-- ----------------------------------------------------------------------------
alter function public.content_snapshot(jsonb)       set search_path = public;
alter function public.mark_unpublished_changes()    set search_path = public;
alter function public.slugify(text)                 set search_path = public;
alter function public.unique_slug(text, text, uuid) set search_path = public;


-- ----------------------------------------------------------------------------
-- 8. Storage härten (Befund B4)
--
-- Bisher galt eine einzige Policy `for all` -- also auch DELETE, für jedes
-- Objekt im Bucket. Ein einziger Aufruf hätte sämtliche Fotos gelöscht.
--
-- Die Grenzen am Bucket sind der wichtigere Teil: ohne allowed_mime_types
-- lässt sich HTML oder SVG mit Skript ablegen, ausgeliefert von einer
-- *.supabase.co-Adresse -- brauchbar für Phishing gegen genau diese Nutzerin.
-- image-upload.ts rendert vor jedem Upload über
-- canvas.toBlob(..., 'image/jpeg', 0.82); es geht also ausschließlich JPEG
-- hinaus, und die harte Einschränkung bricht nichts.
--
-- In einen eigenen Block gefasst: sollte `postgres` auf diesem Projekt keine
-- Rechte auf storage.buckets haben, degradiert das zu einer Warnung, statt
-- die ganze Migration -- inklusive Abschnitt 5 und 6 -- zurückzurollen.
-- Ersatzweise dann im Dashboard unter Storage -> casa-photos -> Settings.
-- ----------------------------------------------------------------------------
do $storage$
begin
  update storage.buckets
     set file_size_limit    = 5242880,               -- 5 MB, großzügig für 2000px-JPEG
         allowed_mime_types = array['image/jpeg']
   where id = 'casa-photos';

  raise notice 'Bucket casa-photos: Größen- und Typgrenze gesetzt.';
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'Bucket-Grenzen konnten nicht per SQL gesetzt werden. Bitte im '
      'Dashboard unter Storage -> casa-photos -> Settings eintragen: '
      'File size limit 5 MB, Allowed MIME types image/jpeg.';
end;
$storage$;

-- Öffentliches Lesen bleibt: die Website lädt die Fotos direkt aus dem Bucket.
drop policy if exists casa_photos_public_read on storage.objects;
create policy casa_photos_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'casa-photos');

-- Schreiben, Ändern und Löschen jeweils einzeln und nur für die Allowlist.
drop policy if exists casa_photos_authenticated_write on storage.objects;

drop policy if exists casa_photos_admin_insert on storage.objects;
create policy casa_photos_admin_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'casa-photos' and (select public.is_admin()));

drop policy if exists casa_photos_admin_update on storage.objects;
create policy casa_photos_admin_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'casa-photos' and (select public.is_admin()))
  with check (bucket_id = 'casa-photos' and (select public.is_admin()));

drop policy if exists casa_photos_admin_delete on storage.objects;
create policy casa_photos_admin_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'casa-photos' and (select public.is_admin()));


-- ----------------------------------------------------------------------------
-- 9. Vorgaberechte für künftige Tabellen (Befund B11)
--
-- Supabase vergibt per ALTER DEFAULT PRIVILEGES automatisch Rechte an anon
-- auf NEU angelegte Tabellen im Schema public. schema.sql kennt das und nimmt
-- sie den bestehenden Objekten gezielt wieder weg -- die nächste Tabelle, die
-- jemand anlegt, wäre aber wieder offen, bis jemand daran denkt.
--
-- Wer die Vorgabe gesetzt hat, darf sie zurücknehmen. Je nach Projektalter
-- ist das `postgres` oder `supabase_admin`; auf neueren Projekten ist
-- `postgres` kein Superuser mehr und kommt an die zweite Variante nicht heran.
-- Deshalb beide versuchen und Fehlschläge schlucken -- das ist Vorsorge, kein
-- Notfall. Die verlässliche Absicherung ist Prüfung 4 in
-- scripts/pruefen-sicherheit.mjs, die genau das regelmäßig nachmisst.
-- ----------------------------------------------------------------------------
do $defaults$
declare
  v_rolle text;
begin
  foreach v_rolle in array array['postgres', 'supabase_admin'] loop
    begin
      execute format(
        'alter default privileges for role %I in schema public '
        'revoke all on tables from anon', v_rolle);
      execute format(
        'alter default privileges for role %I in schema public '
        'revoke all on functions from anon', v_rolle);
      raise notice 'Vorgaberechte für anon entzogen (Rolle %).', v_rolle;
    exception when others then
      raise notice 'Vorgaberechte für Rolle % nicht änderbar (%). Übersprungen.',
        v_rolle, sqlerrm;
    end;
  end loop;
end;
$defaults$;


-- ============================================================================
-- 10. Kontrolle
--
-- Diese Abfrage nach dem Lauf einzeln ausführen. Erwartet wird:
--   admins_eintraege        = 2
--   policys_mit_true        = 0   (keine `using (true)` mehr übrig)
--   rpcs_ohne_wachter       = 0   (alle sechs prüfen is_admin)
--   bucket_mime             = {image/jpeg}
-- ============================================================================
--
--  select
--    (select count(*) from public.admins)                        as admins_eintraege,
--    (select count(*) from pg_policies
--      where schemaname = 'public'
--        and tablename in ('workshops','casas','casa_images')
--        and coalesce(qual, '') = 'true')                        as policys_mit_true,
--    (select count(*) from pg_proc p
--       join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public'
--        and p.proname in ('publish_workshop','publish_casa',
--                          'discard_workshop_changes','discard_casa_changes',
--                          'publish_entity','discard_changes')
--        and p.prosrc not like '%is_admin%')                     as rpcs_ohne_wachter,
--    (select allowed_mime_types from storage.buckets
--      where id = 'casa-photos')                                 as bucket_mime;
--
-- Gegenprobe von außen, ohne Anmeldung (sollte 401 liefern):
--
--   curl -s -o /dev/null -w "%{http_code}\n" \
--     -H "apikey: <ANON-KEY>" \
--     "https://wgoukgndhpdfcgtwbpke.supabase.co/rest/v1/admins?select=user_id"
-- ============================================================================

-- ============================================================================
-- 014 -- Anfragen: Taller-Reservierungen und Kontaktnachrichten
--
-- Gewuenscht am 28. September 2026: Platzreservierungen fuer Talleres und
-- Nachrichten aus "Escribinos" sollen im Adminbereich "Solicitudes"
-- einsehbar sein. Bisher waren beide Formulare Attrappen (Workshops.astro,
-- Contact.astro) und schickten nichts.
--
-- Statt zweier neuer Tabellen zwei neue Werte fuer `origen` in der
-- bestehenden Tabelle: dieselbe RLS (anonym nur INSERT), derselbe
-- Einwilligungsnachweis, dieselbe Loeschfunktion borrar_solicitud() und
-- dieselbe Ansicht im Panel.
--
--   origen = 'taller'    modulos = [slug des Talleres], fecha_1 = gewaehlter
--                        Termin, personas = Plaetze. Pflicht: alle drei.
--   origen = 'contacto'  nur Name, Mail und Nachricht (nota). modulos ist
--                        leer, fecha_1 NULL.
--
-- Dafuer werden zwei Pflichten aus 005, die fuer eine Kontaktnachricht
-- keinen Sinn ergeben ("mindestens ein Modul", "ein Wunschtermin"), aus der
-- Spalte in die origen-Regel verschoben -- fuer Schulen und On Tour gelten
-- sie unveraendert weiter. Dasselbe Vorgehen wie 008 mit alumnos/clase.
--
-- Idempotent.
-- ============================================================================

-- 1. Die zwei neuen Herkuenfte zulassen ------------------------------------

alter table public.solicitudes
  drop constraint if exists solicitudes_origen_check;
alter table public.solicitudes
  add constraint solicitudes_origen_check
  check (origen in ('escuelas', 'on_tour', 'taller', 'contacto'));


-- 2. modulos darf leer sein, fecha_1 darf fehlen (nur fuer 'contacto') -----

alter table public.solicitudes
  drop constraint if exists solicitudes_modulos_check;
alter table public.solicitudes
  add constraint solicitudes_modulos_check
  check (jsonb_typeof(modulos) = 'array'
         and jsonb_array_length(modulos) between 0 and 20);

alter table public.solicitudes alter column fecha_1 drop not null;

-- Plaetze bei einer Taller-Reservierung: dieselbe Obergrenze wie bei den
-- Schulen, mehr passt in keinen Taller.
alter table public.solicitudes
  drop constraint if exists solicitudes_personas_check;
alter table public.solicitudes
  add constraint solicitudes_personas_check
  check (personas is null or personas between 1 and 200);


-- 3. Pruefregel an origen, jetzt mit vier Faellen -----------------------------

alter table public.solicitudes
  drop constraint if exists solicitudes_origen_campos_check;
alter table public.solicitudes
  add constraint solicitudes_origen_campos_check check (
    case origen
      when 'escuelas' then alumnos is not null
                       and clase   is not null
                       and escuela is not null
                       and fecha_1 is not null
                       and jsonb_array_length(modulos) >= 1
      when 'on_tour'  then personas is not null
                       and zona     is not null
                       and fecha_1  is not null
                       and jsonb_array_length(modulos) >= 1
      when 'taller'   then personas is not null
                       and fecha_1  is not null
                       and jsonb_array_length(modulos) = 1
      when 'contacto' then nota is not null
                       and length(btrim(nota)) >= 2
      else false
    end
  );


-- 4. Anonymes Einfuegen auch fuer die neuen Herkuenfte -----------------------

drop policy if exists solicitudes_anon_insert on public.solicitudes;
create policy solicitudes_anon_insert
  on public.solicitudes for insert
  to anon
  with check (
    consentimiento = true
    and origen in ('escuelas', 'on_tour', 'taller', 'contacto')
  );


comment on table public.solicitudes is
  'Anfragen aus den Formularen der Website: Las abejas educan (escuelas), '
  'On Tour, Taller-Reservierungen (taller) und Escribinos (contacto). '
  'Personenbezogene Daten nach Ley 18.331: zweckgebunden an die Beantwortung '
  'dieser einen Anfrage. Anonyme duerfen ausschliesslich INSERT, nie lesen. '
  'Loeschen erfolgt hart ueber public.borrar_solicitud(), nicht per Soft-Delete.';


-- ----------------------------------------------------------------------------
-- Kontrolle
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.solicitudes'::regclass order by 1;
--   select policyname, with_check from pg_policies
--    where tablename = 'solicitudes';
-- ----------------------------------------------------------------------------

-- ============================================================================
-- 005 — Anfragen ("solicitudes"): das erste echte Formular-Backend
--
-- Setzt D1 aus PLAN-ANPASSUNGEN-01.md um, auf Grundlage der Entscheidung E1
-- vom 30. August: Weg (a) — das Formular schreibt in eine Supabase-Tabelle.
-- Bis hierher war jedes Formular im Projekt eine Attrappe (Befund B3:
-- Contact.astro und Workshops.astro fangen das Absenden ab und tun nichts).
-- Diese Migration ist der Punkt, an dem zum ersten Mal personenbezogene
-- Daten von Dritten in dieser Datenbank landen.
--
-- Genau deshalb sieht sie anders aus als 001 bis 004. Alles davor waren
-- UNSERE eigenen Inhalte: Workshops, Häuser, Dokumente. Wer die verliert,
-- ärgert sich. Hier geht es um Namen, Mailadressen und Telefonnummern von
-- Lehrerinnen und Lehrern, die uns nur eine Frage gestellt haben. Dafür
-- gelten andere Regeln — die aus dem Gesetz, nicht die aus unserer Bequem-
-- lichkeit.
--
-- ----------------------------------------------------------------------------
-- RECHTLICHER RAHMEN: Ley N° 18.331 (Uruguay)
-- ----------------------------------------------------------------------------
-- "Ley de Protección de Datos Personales y Acción de Habeas Data", dazu das
-- Regelwerk Decreto 414/009 und die Aufsichtsbehörde URCDP (Unidad
-- Reguladora y de Control de Datos Personales, angesiedelt bei AGESIC).
-- Für dieses Formular sind vier Punkte des Gesetzes bindend:
--
--   1. EINWILLIGUNG (Art. 9). Sie muss vorher, ausdrücklich und informiert
--      erteilt sein — und sie muss NACHWEISBAR sein. Ein Häkchen, dessen
--      Wortlaut wir später ändern, beweist nichts. Deshalb speichert diese
--      Tabelle nicht nur "ja", sondern auch WANN und den WORTLAUT, der der
--      Person in genau diesem Moment auf dem Bildschirm stand
--      (consentimiento, consentimiento_en, consentimiento_texto).
--
--   2. ZWECKBINDUNG (Art. 8). Die Daten dürfen ausschließlich dazu dienen,
--      diese eine Anfrage zu beantworten und den Besuch zu vereinbaren.
--      Kein Newsletter, keine Weitergabe, keine Wiederverwendung für ein
--      anderes Angebot. Es gibt in dieser Tabelle bewusst KEINE Spalte für
--      Werbeeinwilligung — was nicht existiert, kann auch nicht versehent-
--      lich benutzt werden.
--
--   3. DATENSPARSAMKEIT (Art. 7). Erhoben werden Daten der SCHULE und der
--      LEHRKRAFT. Von den Kindern ausschließlich die ANZAHL und die
--      Klassenstufe. Keine Namen, keine Geburtsdaten, keine Fotos. Das ist
--      keine Sparsamkeit aus Faulheit: Daten Minderjähriger sind der
--      heikelste Fall des Gesetzes (siehe die offenen Punkte unten), und
--      der sicherste Umgang damit ist, sie gar nicht erst zu haben.
--
--   4. HABEAS DATA (Art. 13–15). Jede betroffene Person darf Auskunft,
--      Berichtigung und LÖSCHUNG verlangen. Löschung heißt löschen.
--      Deshalb die Funktion borrar_solicitud() weiter unten — und deshalb
--      hier ausdrücklich KEIN Soft-Delete wie in 004.
--
-- ----------------------------------------------------------------------------
-- WAS AUSSERHALB DIESES CODES OFFEN BLEIBT
--
-- Diese Migration erfüllt die technischen Pflichten. Zwei Pflichten kann
-- kein SQL erfüllen; sie bleiben ausdrücklich offen und müssen von Hand
-- erledigt bzw. geklärt werden:
--
--   A. ANMELDUNG DER DATENBANK BEI DER URCDP. Art. 29 der Ley 18.331
--      verlangt, dass jede Datenbank mit personenbezogenen Daten im
--      "Registro de Bases de Datos Personales" der URCDP eingetragen wird,
--      bevor sie betrieben wird. Das ist ein Formular bei der Behörde
--      (Träger: Retoños del Edén), keine Zeile Code. Solange die
--      Eintragung fehlt, wird diese Tabelle zwar technisch funktionieren,
--      der Betrieb ist aber nicht regelkonform. ZUERST ANMELDEN, DANN
--      DAS FORMULAR SCHARF SCHALTEN.
--
--   B. DATEN MINDERJÄHRIGER SIND JURISTISCH NICHT ABSCHLIESSEND GEKLÄRT.
--      Wir erheben bewusst keine, aber die Anfrage betrifft eine
--      Schulklasse, und der Besuch selbst findet mit Kindern statt. Ob
--      und ab wann daraus eigene Pflichten entstehen (Einwilligung der
--      Erziehungsberechtigten, Rolle der Schule als eigener Verantwort-
--      licher, Fotos während des Besuchs), ist mit dem Gesetzestext
--      allein nicht zu beantworten. Das gehört einmal anwaltlich geprüft,
--      bevor der Bereich über die Anfrage hinaus wächst — insbesondere
--      BEVOR irgendwann Fotos vom Besuch auf die Seite kommen.
--
-- ----------------------------------------------------------------------------
-- REIHENFOLGE
-- Läuft nach 004_soft_delete.sql. Setzt public.is_admin() aus
-- 002_admin_allowlist.sql voraus — ohne 002 legt diese Migration Policys an,
-- die auf eine nicht existierende Funktion zeigen, und schlägt fehl. Das ist
-- Absicht: sie soll fehlschlagen und nicht etwa "offen" durchlaufen.
-- ============================================================================

create extension if not exists pgcrypto;


-- ----------------------------------------------------------------------------
-- 1. Die Tabelle
--
-- Spaltennamen auf Spanisch wie überall sonst im Schema (casas, workshops,
-- modulos). `origen` ist der einzige Blick in die Zukunft: On Tour (§8 des
-- Anpassungsplans) bekommt dasselbe Formular mit anderem Inhalt. Zwei
-- getrennte Tabellen wären für dieselben acht Kontaktfelder Unfug — hier
-- unterscheiden sich die Angebote nämlich NICHT, anders als bei den
-- Inhalten (Entscheidung E4: getrennte Tabellen für Módulos und Talleres).
-- ----------------------------------------------------------------------------
create table if not exists public.solicitudes (
  id         uuid primary key default gen_random_uuid(),

  -- Serverzeit, nicht Browserzeit. Der Trigger unten überschreibt jeden
  -- mitgeschickten Wert -- siehe die Begründung dort.
  creado_en  timestamptz not null default now(),

  -- Aus welchem Bereich die Anfrage kommt. Heute nur 'escuelas'
  -- (Las abejas educan); 'on_tour' ist vorbereitet, damit der zweite
  -- Bereich später keine Schema-Änderung braucht.
  origen     text not null default 'escuelas'
             check (origen in ('escuelas', 'on_tour')),

  -- Die gewählten Module als Liste ihrer stabilen IDs, z. B.
  -- ["colmena-viva", "polinizacion"]. jsonb statt text[], weil das Backend
  -- ohnehin überall mit jsonb arbeitet (published_payload) und weil bei
  -- On Tour später Objekte statt bloßer IDs darin stehen könnten.
  --
  -- Bewusst KEIN Fremdschlüssel auf eine Modultabelle: die Anfrage ist ein
  -- Dokument über einen Zeitpunkt. Wird ein Modul umbenannt oder gelöscht,
  -- darf die alte Anfrage dadurch nicht ihren Inhalt verlieren.
  modulos    jsonb not null default '[]'::jsonb
             check (jsonb_typeof(modulos) = 'array'
                    and jsonb_array_length(modulos) between 1 and 20),

  -- Zwei Wunschtermine. Der zweite ist freiwillig, spart aber
  -- erfahrungsgemäß eine halbe Mailrunde.
  fecha_1    date not null,
  fecha_2    date,

  -- Von den Kindern NUR das hier: wie viele, und welche Klasse. Mehr
  -- braucht ein Angebot nicht, und mehr wollen wir nicht haben.
  alumnos    integer not null check (alumnos between 1 and 60),
  clase      text not null check (length(btrim(clase)) between 1 and 80),

  -- Schule und Lehrkraft: die eigentlichen personenbezogenen Daten.
  escuela    text not null check (length(btrim(escuela)) between 2 and 160),
  docente    text not null check (length(btrim(docente)) between 2 and 160),
  mail       text not null check (length(btrim(mail)) between 5 and 254
                                  and mail like '%_@_%.__%'),
  telefono   text check (telefono is null or length(btrim(telefono)) <= 40),
  nota       text check (nota is null or length(nota) <= 2000),

  -- ---- Nachweis der Einwilligung (Art. 9 Ley 18.331) ----
  -- Drei Spalten statt einer, weil ein blosses `true` nichts beweist:
  --   consentimiento        DASS eingewilligt wurde. Der Check erzwingt,
  --                         dass es ohne Einwilligung gar keine Zeile gibt.
  --   consentimiento_en     WANN. Serverzeit, siehe Trigger.
  --   consentimiento_texto  WOZU -- der Satz, der der Person in genau
  --                         diesem Moment auf dem Bildschirm stand, in
  --                         ihrer Sprache. Ändern wir den Wortlaut später,
  --                         bleiben die alten Anfragen mit dem alten
  --                         Wortlaut stehen. Genau das ist der Nachweis.
  consentimiento       boolean not null check (consentimiento = true),
  consentimiento_en    timestamptz not null default now(),
  consentimiento_texto text not null
                       check (length(btrim(consentimiento_texto)) between 20 and 1000),

  -- Bearbeitungsstand im Backend. Die Werte sind gemischt deutsch/spanisch,
  -- weil sie so im Auftrag stehen; sie sind reine Innensicht und erscheinen
  -- nirgends auf der Website.
  estado     text not null default 'neu'
             check (estado in ('neu', 'beantwortet', 'confirmado', 'cancelado'))
);

comment on table public.solicitudes is
  'Anfragen aus dem Formular "Las abejas educan" (später auch On Tour). '
  'Personenbezogene Daten nach Ley 18.331: zweckgebunden an die Beantwortung '
  'dieser einen Anfrage. Anonyme dürfen ausschliesslich INSERT, nie lesen. '
  'Löschen erfolgt hart über public.borrar_solicitud(), nicht per Soft-Delete.';

comment on column public.solicitudes.consentimiento_texto is
  'Der exakte Wortlaut der Einwilligung, wie er beim Absenden angezeigt wurde. '
  'Nachweis nach Art. 9 Ley 18.331 -- nie nachträglich überschreiben.';

-- Der Blick ins Backend ist immer "was ist neu, neueste zuerst".
create index if not exists solicitudes_estado_creado_idx
  on public.solicitudes (estado, creado_en desc);


-- ----------------------------------------------------------------------------
-- 2. Serverseitige Wahrheit bei den drei Spalten, auf die es ankommt
--
-- Ein anonymer Client darf die Zeile anlegen. Damit könnte er auch
-- creado_en, consentimiento_en und estado frei bestimmen -- Spaltenrechte
-- allein zu entziehen wäre hier unpraktisch, weil PostgREST dann bei jedem
-- mitgeschickten Feld die ganze Anfrage abweist und das Formular an einer
-- Kleinigkeit stillschweigend scheitern würde.
--
-- Der robustere Weg: mitschicken darf man alles, gelten tut die Serverzeit.
-- Ein Zeitstempel, den der abgebende Browser setzt, taugt ohnehin nicht als
-- Nachweis -- die Uhr eines fremden Rechners ist kein Beleg. Und `estado`
-- gehört dem Backend, nicht dem Formular.
-- ----------------------------------------------------------------------------
create or replace function public.solicitudes_sellar()
returns trigger
language plpgsql
as $$
begin
  new.creado_en        := now();
  new.consentimiento_en := now();
  new.estado           := 'neu';
  return new;
end;
$$;

drop trigger if exists solicitudes_sellar on public.solicitudes;
create trigger solicitudes_sellar
  before insert on public.solicitudes
  for each row
  execute function public.solicitudes_sellar();


-- ----------------------------------------------------------------------------
-- 3. Rechte und Policys
--
-- Das Gefälle ist bewusst extrem asymmetrisch:
--
--   anon           darf INSERT. Sonst nichts. Kein SELECT, kein UPDATE,
--                  kein DELETE -- auch nicht auf die eigene, gerade
--                  geschriebene Zeile. Andernfalls könnte jeder Besucher
--                  mit dem anon-Key (der bauartbedingt in jedem
--                  JS-Bundle steht) sämtliche Anfragen aller Schulen
--                  auslesen. Das wäre der schwerste denkbare Fehler an
--                  dieser Stelle.
--   authenticated  darf alles -- aber jede Policy fragt is_admin(), also
--                  in Wahrheit: nur wer in public.admins steht.
--
-- Praktische Folge für den Client: das Formular MUSS ohne `.select()`
-- einfügen (supabase-js schickt dann `Prefer: return=minimal`). Mit
-- `.select()` würde PostgREST die geschriebene Zeile zurücklesen wollen,
-- dafür fehlt anon das Recht, und die Anfrage schlüge fehl -- obwohl das
-- Einfügen selbst richtig ist. Siehe src/lib/solicitudes.ts.
-- ----------------------------------------------------------------------------
alter table public.solicitudes enable row level security;

revoke all on public.solicitudes from anon, authenticated;

grant insert on public.solicitudes to anon;
grant select, insert, update, delete on public.solicitudes to authenticated;

-- Anonym: nur einfügen, und nur mit gesetzter Einwilligung. Der Check ist
-- die zweite Verteidigungslinie hinter dem Spalten-Check -- er macht die
-- Absicht an der Stelle sichtbar, an der über den Zugriff entschieden wird.
drop policy if exists solicitudes_anon_insert on public.solicitudes;
create policy solicitudes_anon_insert
  on public.solicitudes for insert
  to anon
  with check (
    consentimiento = true
    and origen in ('escuelas', 'on_tour')
  );

-- Es gibt bewusst KEINE anon-Policy für select/update/delete. Ohne Policy
-- ist unter RLS nichts erlaubt; zusammen mit dem fehlenden Tabellenrecht
-- ist das doppelt zu.

drop policy if exists solicitudes_admin_all on public.solicitudes;
create policy solicitudes_admin_all
  on public.solicitudes for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));


-- ----------------------------------------------------------------------------
-- 4. Echtes Löschen -- und warum hier NICHT das Soft-Delete aus 004 gilt
--
-- 004_soft_delete.sql hat für workshops und casas das weiche Löschen
-- eingeführt: eine Zeile bekommt deleted_at, verschwindet aus den Views und
-- wird erst nach 30 Tagen wirklich entfernt. Für UNSERE eigenen Inhalte ist
-- das genau richtig -- der Papierkorb rettet den Fehlgriff.
--
-- Für Anfragen ist es falsch, aus zwei Gründen:
--
--   1. RECHT. Art. 15 der Ley 18.331 gibt der betroffenen Person das Recht
--      auf Löschung (habeas data). Wer "gelöscht" sagt und "unsichtbar
--      gemacht" tut, hat das Recht nicht erfüllt, sondern nur die Ansicht
--      geändert. Ein Datensatz, der weiterhin vollständig in der Tabelle
--      liegt und von jedem Admin per SQL wieder sichtbar zu machen ist,
--      ist nicht gelöscht.
--
--   2. ZWECK. Die Daten dürfen nur so lange existieren, wie sie zur
--      Beantwortung der Anfrage gebraucht werden. Eine Aufbewahrungsfrist
--      von 30 Tagen NACH dem Löschwunsch ist kein Zweck, sondern ein
--      Zufallsprodukt des Papierkorbs.
--
-- Deshalb: eine Funktion, die wirklich löscht. Sie ist security definer,
-- weil sie nichts tun soll, was die aufrufende Rolle nicht ohnehin dürfte,
-- aber ihre Prüfung selbst in der Hand haben muss -- dieselbe Machart wie
-- die sechs RPCs aus 002.
--
-- Ebenfalls bewusst: für solicitudes gibt es KEINEN Audit-Log-Trigger wie
-- in 003 für workshops/casas. Ein Protokoll, das old_data vollständig
-- mitschreibt, würde die Löschung aufheben -- der Datensatz stünde danach
-- im Protokoll statt in der Tabelle. Wer für dieses Formular je ein
-- Protokoll will, darf darin nur id, estado und Zeitpunkt festhalten, nie
-- die Inhalte.
-- ----------------------------------------------------------------------------
create or replace function public.borrar_solicitud(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nicht berechtigt.' using errcode = '42501';
  end if;

  delete from public.solicitudes where id = p_id;

  if not found then
    raise exception 'Anfrage % existiert nicht.', p_id using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.borrar_solicitud(uuid) from public, anon;
grant execute on function public.borrar_solicitud(uuid) to authenticated;

comment on function public.borrar_solicitud(uuid) is
  'Löscht eine Anfrage endgültig (habeas data, Art. 15 Ley 18.331). '
  'Bewusst hart statt weich -- siehe Kommentar in 005_solicitudes.sql.';


-- ----------------------------------------------------------------------------
-- 5. Aufräumen nach Ablauf des Zwecks
--
-- Zweckbindung heisst auch: irgendwann ist der Zweck erledigt. Eine
-- beantwortete oder abgesagte Anfrage von vor zwei Jahren dient nichts
-- mehr. 24 Monate sind grosszügig gewählt, weil ein Schuljahr in Uruguay
-- von März bis Dezember läuft und eine Schule durchaus im Folgejahr auf
-- dieselbe Anfrage zurückkommt.
--
-- Läuft wie soft_delete_cleanup() aus 004 NICHT von selbst -- der
-- pg_cron-Vorschlag steht darunter.
-- ----------------------------------------------------------------------------
create or replace function public.solicitudes_cleanup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.solicitudes
   where estado in ('beantwortet', 'confirmado', 'cancelado')
     and creado_en < now() - interval '24 months';
end;
$$;

revoke all on function public.solicitudes_cleanup() from public, anon, authenticated;

-- select cron.schedule(
--   'solicitudes_cleanup',
--   '30 3 * * *',
--   $$select public.solicitudes_cleanup();$$
-- );


-- ----------------------------------------------------------------------------
-- 6. Selbstprüfung
--
-- Nach dem Ausführen einmal laufen lassen. Erwartet wird:
--   anon_rechte_ausser_insert = 0
--   anon_policys_ausser_insert = 0
--   rls_an                     = true
-- ----------------------------------------------------------------------------
-- select
--   (select count(*) from information_schema.role_table_grants
--     where table_schema = 'public' and table_name = 'solicitudes'
--       and grantee = 'anon' and privilege_type <> 'INSERT')  as anon_rechte_ausser_insert,
--   (select count(*) from pg_policies
--     where schemaname = 'public' and tablename = 'solicitudes'
--       and 'anon' = any(roles) and cmd <> 'INSERT')          as anon_policys_ausser_insert,
--   (select relrowsecurity from pg_class
--     where oid = 'public.solicitudes'::regclass)             as rls_an;

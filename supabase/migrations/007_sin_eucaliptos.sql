-- ============================================================
-- 007 · Eukalyptus aus den veröffentlichten Inhalten entfernen
-- ============================================================
--
-- WARUM DIESE MIGRATION EXISTIERT
--
-- Aus dem Anpassungsdokument (§5): Eukalyptus soll auf der ganzen Seite
-- nicht mehr vorkommen; Eichen und Ahorn bleiben. Im Quelltext ist das
-- erledigt (Welle A) — aber die Talleres- und Casas-Texte kommen zur
-- Bauzeit NICHT aus dem Quelltext, sondern aus dieser Datenbank. Eine
-- Änderung an `seed.sql` erreicht bereits veröffentlichte Datensätze
-- deshalb nicht: `seed.sql` legt an, es aktualisiert nicht.
--
-- Nachgezählt im gebauten HTML vor dieser Migration: vier Stellen auf der
-- spanischen und vier auf der englischen Startseite, alle aus
-- `workshops_public` und `casas_public`.
--
-- WAS SIE BERÜHRT
--
-- Jeder Datensatz trägt den Text zweimal: einmal als Arbeitsstand
-- (`translations`, `slides`, …) und einmal als veröffentlichten
-- Schnappschuss (`published_payload`). Beide müssen geändert werden —
-- nur der Schnappschuss steht auf der Website, aber nur der Arbeitsstand
-- steht im Backend. Bliebe einer stehen, käme das Wort beim nächsten
-- „Publicar" zurück.
--
-- Ersetzt wird gezielt Wendung für Wendung, nicht das blosse Wort: aus
-- „bajo los eucaliptos" darf nicht „bajo los" werden. Die neuen
-- Formulierungen nennen Bäume, die es auf der Chacra wirklich gibt
-- (Aromos, der bosque aromático) — siehe die Stationen 8 und 11 der
-- Karte in `src/i18n/es.ts`.
--
-- Am Ende steht eine Prüfung, die abbricht, wenn irgendwo noch etwas
-- übrig ist. Eine Migration, die ihr eigenes Ziel nicht nachweist, ist
-- bei einer Textersetzung wertlos.

begin;

-- ------------------------------------------------------------
-- 1 · Die Wendungen
-- ------------------------------------------------------------
create temporary table _sustituciones (orden int, viejo text, nuevo text)
on commit drop;

insert into _sustituciones (orden, viejo, nuevo) values
  -- Spanisch. Die längeren Wendungen zuerst, sonst greift eine kürzere
  -- vorher und lässt einen halben Satz stehen.
  (10, 'la cortina de eucaliptos y aromos', 'la cortina de aromos'),
  (11, 'cortina de eucaliptos',             'cortina de aromos'),
  (12, 'el cinturón de eucaliptos',         'la cortina de árboles del borde'),
  (13, 'cinturón de eucaliptos',            'cortina de árboles del borde'),
  (14, 'el bosque de eucaliptos',           'el bosque aromático'),
  (15, 'bosque de eucaliptos',              'bosque aromático'),
  (16, 'bajo los eucaliptos',               'a la sombra de los árboles'),
  (17, 'entre los eucaliptos',              'entre los árboles'),
  (18, 'los eucaliptos',                    'los árboles'),
  (19, 'eucaliptos',                        'árboles'),

  -- Englisch
  (30, 'a grove of eucalyptus and acacia trees', 'a stand of acacia trees'),
  (31, 'the eucalyptus belt',              'the belt of trees along the boundary'),
  (32, 'eucalyptus belt',                  'belt of trees along the boundary'),
  (33, 'the eucalyptus forest',            'the aromatic wood'),
  (34, 'eucalyptus forest',                'aromatic wood'),
  (35, 'under the eucalyptus',             'in the shade of the trees'),
  (36, 'among the eucalyptus',             'among the trees'),
  (37, 'the eucalyptus',                   'the trees'),
  (38, 'eucalyptus',                       'trees');

-- ------------------------------------------------------------
-- 2 · Ersetzen, Spalte für Spalte
-- ------------------------------------------------------------
--
-- Über den Umweg Text: `jsonb` kennt keine Ersetzung über den ganzen
-- Baum hinweg, und die Texte stecken verschachtelt in Listen und
-- Objekten. `::text` und zurück fasst jedes Blatt auf einmal. Das ist
-- zulässig, weil die Wendungen keine Zeichen enthalten, die in JSON
-- entwertet werden (kein Anführungszeichen, kein Backslash) — sonst
-- würde diese Abkürzung die Struktur zerschneiden.

do $$
declare
  s record;
  tabla text;
  col text;
  columnas text[];
begin
  foreach tabla in array array['workshops', 'casas'] loop
    if to_regclass('public.' || tabla) is null then
      raise notice '007: Tabelle % gibt es hier nicht, wird übersprungen.', tabla;
      continue;
    end if;

    -- Alle jsonb- und text-Spalten der Tabelle, die Fliesstext tragen
    -- können. Bewusst aus dem Katalog gelesen statt aufgezählt: die
    -- beiden Tabellen haben verschiedene Spalten, und es sollen keine
    -- vergessen werden.
    select array_agg(column_name::text)
      into columnas
      from information_schema.columns
     where table_schema = 'public'
       and table_name = tabla
       and data_type in ('jsonb', 'text', 'character varying');

    foreach col in array coalesce(columnas, array[]::text[]) loop
      for s in select viejo, nuevo from _sustituciones order by orden loop
        execute format(
          'update public.%I set %I = replace(%I::text, %L, %L)::%s
             where %I::text like %L',
          tabla, col, col, s.viejo, s.nuevo,
          (select data_type from information_schema.columns
            where table_schema = 'public' and table_name = tabla and column_name = col),
          col, '%' || s.viejo || '%'
        );
      end loop;
    end loop;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3 · Nachweis
-- ------------------------------------------------------------
--
-- Bricht ab, wenn irgendwo noch „eucalip" oder „eucalyp" steht. Dann ist
-- eine Wendung durchgerutscht, die oben fehlt — die Meldung nennt Tabelle
-- und Spalte, damit man sie ergänzen kann.

do $$
declare
  tabla text;
  col text;
  columnas text[];
  restos int;
  hallazgos text := '';
begin
  foreach tabla in array array['workshops', 'casas'] loop
    if to_regclass('public.' || tabla) is null then
      continue;
    end if;

    select array_agg(column_name::text)
      into columnas
      from information_schema.columns
     where table_schema = 'public'
       and table_name = tabla
       and data_type in ('jsonb', 'text', 'character varying');

    foreach col in array coalesce(columnas, array[]::text[]) loop
      execute format(
        'select count(*) from public.%I where %I::text ~* %L',
        tabla, col, 'eucalip|eucalyp'
      ) into restos;

      if restos > 0 then
        hallazgos := hallazgos || format('  %s.%s: %s Zeile(n)%s', tabla, col, restos, chr(10));
      end if;
    end loop;
  end loop;

  if hallazgos <> '' then
    raise exception E'007: Es steht noch Eukalyptus in den Daten:\n%\nErgänze die fehlende Wendung in Abschnitt 1 und lass die Migration erneut laufen.', hallazgos;
  end if;

  raise notice '007: Keine Eukalyptus-Erwähnung mehr in workshops und casas.';
end $$;

commit;

-- ------------------------------------------------------------
-- Danach
-- ------------------------------------------------------------
--
-- Die Website ist statisch gebaut: die Änderung ist erst nach einem neuen
-- Build sichtbar. Entweder über den Deploy-Hook (siehe 003) oder von Hand
-- in Vercel anstossen.
--
-- Gegenprobe im gebauten Ergebnis:
--   grep -ric "eucalip\|eucalyp" dist/
-- muss 0 ergeben.

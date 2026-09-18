# Plan — Anpassungen 01 (Eingänge bis 29. August 2026)

**Stand: 30. August 2026.** Sortierung und Priorisierung der Änderungswünsche
aus „Anpassungen 01". Dieser Plan setzt noch nichts um — er ordnet die
Wünsche nach Abhängigkeit, Aufwand und Systemwirkung und benennt die
Entscheidungen, die vor der ersten Zeile Code fallen müssen.

Grundlage ist eine Prüfung im Repository, nicht eine Einschätzung aus dem
Bauch: jede Aufwandsangabe unten nennt die Datei, um die es geht.

---

## 1. Sechs Befunde aus dem Code, die die Reihenfolge bestimmen

Diese sechs Dinge sind der Grund, warum die Liste unten nicht in der
Reihenfolge des Wunschdokuments abgearbeitet wird.

### B1 · Inhalte liegen an drei Orten, nicht an einem

| Ort | Was dort liegt | Wer pflegt es |
|---|---|---|
| `src/i18n/es.ts` + `src/i18n/en.ts` | Hero, Historia, Karte, Herbario, Produkte, Lavanda — **alle Fließtexte der Startseite** | nur wir, im Code |
| `src/data/*.ts` | Rückfalldaten für Talleres/Casas, `nosotros.ts`, `libro.ts` | nur wir, im Code |
| Supabase (`workshops`, `casas`) | die veröffentlichten Talleres- und Casas-Texte | Mutter, über `/admin` |

Ein Textwunsch aus dem Dokument ist deshalb selten **eine** Änderung. Beispiel
Eukalyptus (§5): das Wort steht in `es.ts`, `en.ts`, `workshops.ts`,
`casas.ts`, `supabase/seed.sql` **und** in den bereits veröffentlichten
Datensätzen in der Datenbank. Eine Code-Änderung allein entfernt es nicht von
der Seite.

### B2 · Die Kartenfehler haben eine einzige, klar benennbare Ursache

In `src/components/FincaMap.astro:17-29` stehen **zehn** Koordinaten. In
`src/i18n/es.ts:75-118` stehen **zwölf** Stationen. Ab Station 9 verrutscht
alles um genau die zwei fehlenden Punkte:

| Station | bekommt aktuell die Koordinate von |
|---|---|
| 9 · El camino de los colibríes | Casa 1 / Quincho (200, 715) |
| 10 · El quincho de fardos | Tajamar (150, 852) |
| 11 · El bosque aromático | *nichts* → `undefined` → außerhalb der Karte |
| 12 · El tajamar | *nichts* → `undefined` → außerhalb der Karte |

Das deckt sich exakt mit der Beobachtung im Wunschdokument. Es sind nicht
„mehrere Layoutfehler", sondern ein Fehler mit vier Symptomen. Zwei
Koordinaten ergänzen, die drei verschobenen richtigstellen — eine knappe
Stunde inklusive Nachmessen.

### B3 · Es gibt kein Formular-Backend. Kein einziges

`Contact.astro:69` und `Workshops.astro:504` fangen das Absenden ab und tun
nichts damit. Kein Mailversand, kein Datenbankschreiben, kein WhatsApp-Link.
Alle Formulare sind Attrappen — so ist es in `README.md` auch dokumentiert.

**Las abejas educan** und **On Tour** hängen beide an „Anfrage → Angebot →
Reservierung mit Kalender". Beide Bereiche sind ohne dieses Backend hübsch
und wertlos. Es ist der größte einzelne Neubau in der ganzen Liste und die
Voraussetzung für zwei von drei neuen Bereichen.

### B4 · `/admin` kennt drei Bereiche, die neuen brauchen zwei weitere

`src/pages/admin/index.astro:44-46` und `src/scripts/admin/router.ts`:
Talleres, Casas, Documentos. Die Wünsche verlangen „vollständig im
/admin-Bereich anpassbar" für **Módulos** (abejas educan) und **On Tour**.

Die gute Nachricht: das Muster steht. `entity-list.ts`, `editor-shell.ts`,
`drafts.ts`, `list-editor.ts`, `fields.ts`, das Entwurf/Veröffentlicht-Modell
aus `001_draft_publish.sql` und die öffentliche View für den Build
(`fetch-workshops.ts`) sind alle generisch genug, um wiederverwendet zu
werden. Ein neuer Bereich ist damit kein Neubau, sondern eine Kopie mit
eigenem Schema — realistisch je zwei bis drei Tage statt zwei Wochen.

### B5 · Die Seite ist statisch gebaut

Astro-Build, Vercel, Inhalte werden **zur Bauzeit** aus Supabase gelesen. Eine
Änderung meiner Mutter im Backend erscheint erst nach einem neuen Build. Für
Talleres ist das bisher hingenommen worden. Bei einem Buchungskalender mit
Datumsauswahl (§7, §8) geht es nicht mehr: freie Termine müssen zur Laufzeit
kommen. Das ist eine Architekturentscheidung, keine Fleißarbeit — siehe E2.

### B6 · Zwei Wünsche sind noch keine Aufgaben

Hero (§1) und Nuestro Panal (§6) sind ausdrücklich als „müssen wir zusammen
planen" formuliert. Sie brauchen zuerst einen Termin, dann eine Aufgabe. Sie
blockieren nichts anderes und sollten deshalb **nicht** vorne in der
Umsetzungsreihenfolge stehen, sondern vorne in der *Termin*reihenfolge.

---

## 2. Priorisierung in vier Wellen

Leitgedanke: erst alles Falsche richtigstellen (billig, sofort sichtbar,
keine Abhängigkeiten), dann die Fundamente entscheiden, dann die großen
Umbauten, dann die neuen Bereiche. Neue Bereiche zuletzt, weil sie sonst auf
einem Fundament stehen, das wir noch ändern.

### Welle A — Richtigstellungen (1 Arbeitstag, sofort starten)

Alles hier ist unstrittig, klein und unabhängig voneinander. Es gibt keinen
Grund, damit auf irgendetwas zu warten.

| # | Aufgabe | Quelle | Dateien | Aufwand |
|---|---|---|---|---|
| A1 | Kartenkoordinaten 9–12 richtigstellen (siehe B2) | §4 | `FincaMap.astro:17-29` | 1 h |
| A2 | Station 1: „El portón" → „La tranquera" | §4 | `es.ts`, `en.ts` | 10 min |
| A3 | Stationen 6 und 7: nur die Hausnamen, keine Nummern | §4 | `es.ts`, `en.ts` | 20 min |
| A4 | Historia 2025: „leyenda" ohne „familiar", ein Stock statt eines Astes, Vogel „blanco y lila (la monjita o viudita blanca)", „microorganismos eficientes" | §2 | `es.ts:44`, `en.ts` | 30 min |
| A5 | Primeros años: „La primera sombra de la chacra fue el vivero…" | §2 | `es.ts`, `en.ts` | 20 min |
| A6 | El suelo dice que sí: „…acá pueden crecer pistachos" | §2 | `es.ts`, `en.ts` | 15 min |
| A7 | 2030 → **2031**, plus neuer Pistazien-Satz | §2 | `es.ts:62`, `en.ts:64` **und** `es.ts:138`, `en.ts:140` (Produkt-Badge!) | 30 min |
| A8 | „Fugus" → „Fresnos dorados" | §5 | `es.ts:398`, `en.ts:399`, Kommentare in `FincaMap.astro:19,113` | 20 min |
| A9 | Eukalyptus vollständig entfernen (Robles y arces bleiben) | §5 | `es.ts:127,402-403`, `en.ts:129,403-404`, `workshops.ts` (6 Stellen), `casas.ts`, `seed.sql`, **und die veröffentlichten Datensätze in Supabase** | 2 h |

**Zu A7:** Die Jahreszahl steht an vier Stellen, zwei davon außerhalb der
Zeitleiste. Wird nur die Zeitleiste geändert, widerspricht die Seite sich
selbst.

**Zu A9:** Der Code-Teil ist in einer Stunde erledigt. Der zweite Teil —
Backend-Datensätze — muss meine Mutter in `/admin` tun oder wir per
Migration. Bitte vorher entscheiden, sonst steht das Wort nach dem nächsten
Build wieder auf der Seite.

**Zu A2/A3:** „Tranquera" statt „Portón" taucht auch in Talleres-Texten als
Treffpunkt auf („Portón de entrada"). Bei der Gelegenheit mitziehen, sonst
heißt dieselbe Stelle auf der Seite zweimal verschieden.

### Welle B — Entscheidungen (kein Code, aber blockierend)

Diese vier Entscheidungen bestimmen, wie die Wellen C und D gebaut werden.
Sie kosten Gespräche, keine Tage.

**E1 · Anfrage-Backend: welcher Weg?** (blockiert §7 und §8 vollständig)
Drei Möglichkeiten: (a) Formular schreibt in eine Supabase-Tabelle,
Benachrichtigung per Mail — passt zum bestehenden System, wir sehen alle
Anfragen im Backend, meiste Arbeit; (b) Mailversand über einen Dienst, keine
Datenhaltung — schnell, aber keine Übersicht und kein Reservierungsstatus;
(c) WhatsApp-Link mit vorbefülltem Text — in einem Tag fertig, aber ohne
Kalender und ohne Modulauswahl. **Empfehlung: (a)**, weil sowohl „abejas
educan" als auch „On Tour" Reservierungen mit Datum, Modulauswahl und Status
brauchen und das in (b) und (c) schlicht nicht abbildbar ist.

**E2 · Statisch bleiben oder Laufzeitdaten?** (folgt aus B5)
Ein Buchungskalender braucht aktuelle Belegung. Empfehlung: die Seite bleibt
statisch, die **Verfügbarkeit** wird zur Laufzeit direkt aus Supabase gelesen
(anonymer Lesezugriff auf eine eng geschnittene öffentliche View, wie es
`workshops_public` schon vormacht). Kein Serverumbau, aber ein
Sicherheitsthema — gehört vor der Umsetzung durch den Sicherheitscheck.

**E3 · Auslagern oder eingewoben lassen?** (die „weiterführenden Gedanken")
Talleres, Las abejas educan und On Tour sind drei Angebote mit demselben
Muster: Beschreibung, Zielgruppe, Termine, Preis, Anfrage. Empfehlung:
**beides** — je eine eigene Unterseite mit dem vollständigen Angebot, und auf
der Startseite je ein kurzer Abschnitt, der dorthin führt. Das erhält den
Kaufanreiz auf der Landingpage, ohne dass die Startseite auf die dreifache
Länge wächst. Technisch ist die Startseite jetzt schon sehr lang; drei
vollständige Angebotsblöcke würde sie nicht tragen.

**E4 · Ein Datenmodell für alle drei Angebote oder drei getrennte?**
Empfehlung: **getrennte Tabellen, gemeinsame Bausteine.** Die Felder
unterscheiden sich zu stark (Module haben Klassenstufen und Lernziele,
Seminare haben Preise pro Person und Anfahrtszonen), aber Editor,
Entwurf/Veröffentlichen, Sortierung und Bildupload werden geteilt. Ein
Zwangs-Einheitsmodell würde beide Bereiche verbiegen.

### Welle C — Mittlere Umbauten (nach den Entscheidungen, ca. 1–2 Wochen)

| # | Aufgabe | Quelle | Abhängigkeit | Aufwand |
|---|---|---|---|---|
| C1 | Lavanda: „De la flor al jabón" um den Kerzen-Zweig erweitern | §3 | keine | 1–2 Tage |
| C2 | Hero-Interview führen + Konzept | §1 | keine, aber Termin nötig | ½ Tag Gespräch |
| C3 | Hero-Neubau | §1 | C2 | 3–4 Tage |
| C4 | Nuestro Panal: Konzept (Waben statt Baum, keine Hierarchie, Platz für temporäre Begleiter) | §6 | keine, aber Termin nötig | ½ Tag Gespräch |
| C5 | Nuestro Panal: Umsetzung | §6 | C4 | 4–5 Tage |

**Zu C1:** Die Infografik ist eine handgebaute SVG-Kette in `Lavanda.astro`
(489 Zeilen). Die ehrliche Frage vorab: sind Seife und Kerze derselbe Weg bis
zur Destillation und trennen sich erst danach, oder sind es zwei Wege? Bei
„trennt sich am Ende" wird die Grafik zu einer Gabel und der Titel zu „De la
flor al jabón y a la vela" — das ist die kleinere und schönere Lösung. Bei
zwei getrennten Prozessen brauchen wir eine zweite Grafik und einen
Umschalter. **Diese Frage bitte vor Umsetzungsbeginn beantworten**, sie
halbiert oder verdoppelt den Aufwand.

**Zu C5:** `NosotrosPage.astro` sind 805 Zeilen mit dem Baum als tragender
Struktur; `PersonAvatar.astro` zeichnet je Generation. Ein Wabenraster
ersetzt beides. `nosotros.ts` bekommt ein Feld für die Art der Beteiligung
(fest / temporär / begleitend), damit die Unterstützerinnen und Unterstützer
einen echten Platz im Modell haben und nicht nur einen Satz. Der Datentyp
`Generation` steuert heute Farbe **und Größe** — wenn Hierarchie verschwinden
soll, muss die Größenstaffelung mit weg, sonst bleibt die Rangordnung
sichtbar, obwohl der Baum fort ist.

### Welle D — Neue Bereiche (nach Welle C, ca. 3–5 Wochen)

| # | Aufgabe | Quelle | Abhängigkeit | Aufwand |
|---|---|---|---|---|
| D1 | Anfrage-Backend: Tabelle, Formular, Benachrichtigung, Ansicht in `/admin` | §7, §8 | E1, E2 | 4–5 Tage |
| D2 | Marke „Las abejas educan": Siegel, Farb- und Textbausteine | §7 | keine | 2 Tage |
| D3 | Schema + Admin-Bereich „Módulos" | §7 | E4 | 3 Tage |
| D4 | Öffentlicher Bereich „Las abejas educan": Filter nach Alter/Klasse, Modulkarten, Mehr-lesen, Anfrage mit Mehrfachauswahl | §7 | D1, D2, D3 | 4–5 Tage |
| D5 | Banner „Das Buch kommt bald, erzählt von Meli" | §7 | D4 | ½ Tag |
| D6 | Schema + Admin-Bereich „On Tour" | §8 | E4, D3 (dasselbe Muster) | 2 Tage |
| D7 | Öffentlicher Bereich „On Tour": drei Seminare, Preise, Anfahrtszonen, Anfrage | §8 | D1, D6 | 3–4 Tage |

**Zu D2:** Das Siegel zuerst, nicht zuletzt. Es entscheidet über Farbe, Form
und Ton des ganzen Bereichs; wird es nachgereicht, wird der Bereich zweimal
gebaut. `Logo.astro` ist die Vorlage für die Machart — dasselbe
Aquarell-und-Tusche-Vokabular, damit die neue Marke als Teil von Retoños del
Edén lesbar bleibt und nicht als Fremdkörper.

**Zu D6/D7:** On Tour ist „ab Dezember" geplant und hat damit die spätere
Frist. Es ist außerdem der einfachere der beiden Bereiche — drei feste
Seminare ohne Altersfilter und ohne Modulverkettung. Trotzdem **nach** D3/D4
bauen: was dort an Muster entsteht (Anfrageformular, Preisdarstellung,
Zonenaufschlag), wird hier nur noch angewendet.

**Zu D7, inhaltlich zu prüfen:** die Preisangaben enthalten zwei Währungen
(U$S und UY) und eine Entfernungsregel „Rest des Landes nach Distanz". Das
braucht eine Darstellung, die nicht nach Kleingedrucktem aussieht, und im
Backend ein Feld für die Zonen. Bitte vor D7 klären, ob die Zonen fest sind
oder meine Mutter sie pflegen können soll.

---

## 3. Was zuerst passieren sollte, in einem Satz

**Welle A diese Woche** (ein Tag, neun Richtigstellungen, sofort sichtbar),
**parallel die zwei Termine** für Hero und Nuestro Panal ansetzen, und
**E1 entscheiden**, weil ohne diese Entscheidung an §7 und §8 nicht sinnvoll
angefangen werden kann.

---

## 4. Offene Fragen, gesammelt

1. **A9:** Wer entfernt Eukalyptus aus den veröffentlichten Backend-Daten —
   Mutter über `/admin` oder wir per Migration?
2. **C1:** Seife und Kerze — ein Prozess mit Gabelung am Ende oder zwei
   getrennte Prozesse?
3. **E1:** Anfrage-Backend — Weg (a), (b) oder (c)?
4. **E3:** Eigene Unterseiten für die drei Angebote, mit Anreißern auf der
   Startseite?
5. **§7:** Die vier Module — Namen, Altersspannen, Lernziele und verfügbare
   Monate liegen noch nicht vor. Ohne sie ist D4 nicht baubar.
6. **D7:** Anfahrtszonen fest verdrahtet oder im Backend pflegbar?
7. **§7:** „Hinweis-Banner Buch" — gibt es einen Termin oder bleibt es bei
   „bald"?

---

## 5. Entscheidungen vom 30. August, und was daraus folgte

| Frage | Entscheidung | Folge |
|---|---|---|
| E1 Anfrage-Backend | Weg **(a)**, Supabase-Tabelle | Datenschutz nach Ley 18.331 kommt hinzu; D1 waechst auf **6 Tage** (URCDP-Anmeldung, Einwilligung, Datenschutzseite, echte Loeschung) |
| E4 Datenmodell | **getrennt** — abejas educan und Talleres wachsen beide weiter | Zwei eigene Tabellen, gemeinsame Bausteine |
| C1 Seife/Kerze | recherchiert: **eine Gabelung**, kein zweiter Prozess | Aufwand faellt von 2 Tagen auf 1 |
| C5 Wabe | Fassung **B** (Kern in der Mitte, Begleiter ringsum) | gebaut |
| §7 Layout | **Lámina 4 · V2** ("Ruta") | gebaut, inkl. nachtraeglicher Modulwahl im Formular |
| §7 Modul 4 | Besuch auf der Chacra erst **in Zukunft** | Karte bleibt sichtbar, aber `estado: proximamente`, nicht buchbar |
| A9 Eukalyptus | entfernen wir selbst, auch im Backend | Teil von Welle A |
| D7 Zonen | im Backend pflegbar | eigene kleine Zonentabelle |
| §7 Buch-Banner | Termin bleibt offen | Banner ohne Datum |

### Was am 31. August gebaut wurde

- **Nuestro Panal** — `NosotrosPage.astro`, `PersonAvatar.astro`, `nosotros.ts`.
  Wabe statt Baum, alle Zellen gleich gross, Detailansicht je Person, drei
  `vuelo`-Waben fuer die Begleiterinnen und Begleiter, freie Zellen als
  Aussage. Der Bereich heisst jetzt ueberall "Nuestro Panal" / "Our Hive".
- **Las abejas educan** — `AbejasEducan.astro`, `modulos.ts`,
  `SelloAbejas.astro` (sechs Siegelentwuerfe, umschaltbar).
  Ruta-Layout, Altersfilter, Auswahl an zwei Stellen, dreistufiges
  Anfrageformular, Buch-Banner.

### Was danach noch offen ist

1. **D1 Anfrage-Backend.** Das Formular sendet nichts — es gibt im Projekt
   kein Formular-Backend. Bis dahin zeigt es ehrlich an, dass nichts
   gesendet wird.
2. **D3 Schema und Admin-Bereich Módulos.** Die Inhalte liegen in
   `src/data/modulos.ts`, geschnitten wie `workshops.ts`. Der Wechsel auf
   Supabase aendert nur die Quelle, nicht das Markup.
3. **Siegel waehlen** (Empfehlung: 1 Panal fuer die Seite, 4 Lacre fuer
   Gedrucktes). Danach ist es ein Wort in `AbejasEducan.astro`.
4. **Modulinhalte** von Catalina bestaetigen lassen — Namen, Altersspannen,
   Lernziele, Monate sind Entwuerfe.
5. **Detailtexte der Wabe** ebenso, samt der drei Begleiter-Waben.

---

## 10. Stand 1. September 2026 — was laeuft, was noch von Hand kommt

Umgesetzt und geprueft (`astro check` 0 Fehler, `astro build` 9 Seiten):

- **Welle A** — alle neun Richtigstellungen. Karte mit zwoelf echten
  Koordinaten, „La tranquera", „Fresnos dorados", 2031.
- **C1** — die Lavendel-Grafik gabelt sich nach der Destillation in Seife
  und Kerze. Das Wachs kommt aus den eigenen Stoecken; damit haengt der
  Abschnitt an den Bienen.
- **D1** — Anfrage-Backend mit `solicitudes`, RLS (anonym nur INSERT),
  serverseitigem Einwilligungsnachweis, Datenschutzseiten
  `/es/privacidad` und `/en/privacy`, echter Loeschfunktion.
- **D3** — Admin-Bereich „Módulos" mit Entwurf/Veroeffentlichen.
  `AbejasEducan.astro` liest die Module ueber `fetchModulos()`; ohne
  Backend greifen die Entwurfsdaten und der Build meldet das.
- **Siegel** — sieben Entwuerfe in `SelloAbejas.astro`, im Einsatz ist
  `arbol` (offenes Sechseck, Bienenbaum). Alle sieben stehen zum
  Vergleich auf `/design`.

### Offen, ausserhalb des Codes

1. **Migrationen 005, 006 und 007 einspielen.** In 006 vorher den
   Platzhalter `<DEPLOY-HOOK-URL>` an zwei Stellen ersetzen.
2. **URCDP-Anmeldung** vor dem Scharfschalten des Formulars.
3. **Echte Kontaktadresse** in `src/data/privacidad.ts` — dort steht ein
   Platzhalter, und an einer Datenschutzerklaerung ist die
   Auskunftsadresse der wichtigste Satz.
4. **Daten Minderjaehriger** anwaltlich pruefen lassen, bevor je Fotos
   eines Schulbesuchs auf die Seite kommen.

### Zu 007 — der Eukalyptus in der Datenbank

Nach Welle A war der Quelltext sauber, das gebaute HTML aber nicht: vier
Stellen je Sprache, alle aus `workshops_public` und `casas_public`. Die
Texte der Talleres und Casas kommen zur Bauzeit aus der Datenbank, und
`seed.sql` legt an statt zu aktualisieren — die veroeffentlichten
Datensaetze blieben also unberuehrt.

`007_sin_eucaliptos.sql` ersetzt die Wendungen in Arbeitsstand UND
veroeffentlichtem Schnappschuss (bliebe einer stehen, kaeme das Wort beim
naechsten „Publicar" zurueck) und bricht ab, wenn danach noch etwas
uebrig ist.

**Zwei Vorbehalte:** Die Migration ist gegen keine laufende Datenbank
getestet — hier gibt es keine. Und die letzten beiden Regeln der Liste
sind Auffangregeln („eucaliptos" → „árboles"), damit die Schlusspruefung
nicht scheitert; die davon betroffenen Saetze gehoeren nach dem
Einspielen einmal gegengelesen.

---

## 11. Vermerk: die Navigation muss ueberarbeitet werden

**Aufgenommen am 1. September 2026, zurueckgestellt hinter die laufenden
Aufgaben.**

Die Kopfleiste traegt die Seite nicht mehr. Sichtbarer Befund auf dem
Schreibtisch: der Schriftzug „Retoños del Edén" ueberlappt den ersten
Menuepunkt „Historia" — die Leiste ist also schon jetzt zu voll, nicht
erst grenzwertig.

Die Ursache ist strukturell, nicht kosmetisch. `Nav.astro` ist als
Ankerliste EINER langen Startseite gebaut. Inzwischen mischen sich darin
drei verschiedene Dinge:

- Anker innerhalb der Startseite (`#historia`, `#chacra`, `#productos`,
  `#talleres`, `#visita`, `#contacto`, `#escuelas`, bald `#on-tour`)
- eigene Seiten (`Nuestro Panal`, das Buch)
- Nebensaechliches, das trotzdem Platz braucht (Sprachumschalter)

Dazu kommt: `NosotrosPage.astro` und die Datenschutzseiten haben je eine
EIGENE, nachgebaute Kopfleiste, weil `Nav.astro` mit seinen Ankern dort
nicht funktioniert. Drei Kopfleisten, die gleich aussehen sollen und es
per Hand tun — das laeuft auseinander, sobald eine geaendert wird.

Was die Ueberarbeitung mindestens klaeren muss:

1. **Trennung von Ort und Abschnitt.** Eine Navigation kann nicht
   gleichzeitig Inhaltsverzeichnis einer Seite und Wegweiser zwischen
   Seiten sein, ohne dass eines von beidem leidet.
2. **Was gehoert ueberhaupt hinein?** Mit „Las abejas educan" und
   „On Tour" gibt es jetzt drei Angebote (mit den Talleres). Die
   gehoeren womoeglich unter einen Punkt statt einzeln nebeneinander.
3. **Eine Kopfleiste statt drei.** Die nachgebauten Leisten in
   `NosotrosPage.astro` und `PrivacidadPage.astro` durch eine
   gemeinsame Komponente ersetzen, die beide Faelle kann.
4. **Alle Bildschirmbreiten.** Der heutige Umbruchpunkt (860 px)
   entscheidet ueber eine einzeilige Leiste, die inzwischen nicht mehr
   einzeilig ist.

Das ist ein eigener Umbau in der Groessenordnung von zwei bis drei Tagen
und sollte NICHT nebenbei passieren, sondern geplant werden wie der
Panal — erst der Aufbau, dann der Code.

---

## 12. On Tour (D6 + D7) — umgesetzt am 1. September 2026

`astro check` 0 Fehler, `astro build` 9 Seiten.

**Oeffentlich** (`src/components/OnTour.astro`, Abschnitt `#on-tour`): drei
Seminare als gleichrangige Karten, Zonenblock, Anfragedialog mit
ueberschlaegiger Schaetzung. Eingehaengt in `Site.astro` nach
„Las abejas educan", Ankerlink in `Nav.astro`.

**Backend** (`008_on_tour.sql`): `on_tour_seminarios` und `on_tour_zonas`
mit Entwurf/Veroeffentlicht, oeffentliche Views, RLS wie gehabt;
`fetch-on-tour.ts` liest zur Bauzeit mit Rueckfall auf `src/data/on-tour.ts`.
Admin-Bereich „On Tour" mit Editoren fuer Seminare und Zonen.

### Drei Entscheidungen, die im Code stehen und einen Grund haben

1. **Zwei Tabellen statt einer.** Seminar und Anfahrtszone haben nichts
   gemeinsam ausser dem Preis. Zonen aendern sich unabhaengig und sollen
   einzeln pflegbar sein; in jedem Seminar mitgefuehrt liefe die Liste
   dreifach auseinander.
2. **`precioTipo` ist Pflicht ohne Vorgabewert.** „US$ 40" heisst beim
   einen Seminar pro Kopf und beim naechsten fuer die ganze Gruppe. Ein
   Datensatz ohne diese Angabe wird abgelehnt statt geraten, und auf der
   Seite steht die Lesart direkt neben dem Betrag — gleiche Farbe, gleiche
   Staerke, nicht kleingedruckt.
3. **`aPedido` ist nicht null.** „Rest des Landes" hat keinen Aufschlag von
   null, sondern noch keinen. Die Datenbank erzwingt das (bei `a_pedido`
   muss `recargo` NULL sein), die View rundet es nicht weg, und die
   Schaetzung zeigt dort keine Zahl, sondern den Satz, dass die Anfahrt in
   der Antwort genannt wird.

### Die Schaetzung

Rechnet je Seminar `porPersona ? preis x personen : preis`, dazu der
Zonenaufschlag EINMAL. Waehrungen werden getrennt gefuehrt und nie
addiert (Seminare teils USD, Anfahrt UYU): „Seminarios US$ 450 + $U 1600 ·
Traslado $U 1200 · Aproximado US$ 450 + $U 2800". Bei der Zone ohne
Aufschlag steht „Incluido" und keine Null — eine Null liest sich wie ein
Platzhalter. Die Mindestgruppe sperrt nicht, sondern weist hin und nennt
die betroffenen Seminare.

### Was dabei geradegezogen wurde

Der oeffentliche Bereich hatte seine Felder zunaechst auf die Schulspalten
von `solicitudes` abgebildet — die Anfahrtszone lag in einer Spalte namens
`clase`. Im Backend haette dort ein Zonenname unter der Ueberschrift
„Klasse" gestanden. Migration 008 ergaenzt deshalb `personas`, `zona`,
`organizacion`, `lugar` und eine Pruefregel `solicitudes_origen_campos_check`,
die je Herkunft die richtigen Felder verlangt; `solicitudes.ts` schickt nur
noch die Felder der jeweiligen Herkunft, die anderen als NULL.

**Reihenfolge beim Einspielen:** Der Code ist bereits umgestellt, 008 kann
also ohne Sonderweg laufen. Zurueck ginge es mit
`alter table public.solicitudes drop constraint solicitudes_origen_campos_check;`

### Offen

- `<DEPLOY-HOOK-URL>` in 008 an **vier** Stellen ersetzen, dann 005–008 im
  SQL-Editor ausfuehren.
- **Die drei Seminare sind Entwurf** — Namen, Preise, Dauer und
  Mindestteilnehmerzahl bestaetigen lassen. Die drei Zonen stammen aus dem
  Wunschdokument und sind belastbar.
- Die Migration ist gegen keine laufende Datenbank getestet.


# „Luna y el secreto de la colmena" als lebendes Buch

Konzept für die interaktive Umsetzung des Kinderbuchs von **Catalina Marzorati**
auf der Website von Retoños del Edén.

---

## 1. Die Grundidee: Meli schließt den Kreis

Das Buch ist kein Anhang zur Website. Es ist ihr **Ursprung**.

Auf der Website führt eine Biene namens **Meli** die Besucher durch die Plantage.
Im Buch führt eine Biene namens **Meli** das Mädchen Luna durch den Bienenstock.
Es ist dieselbe Biene. Diese Entdeckung ist der emotionale Kern der Umsetzung.

Daraus folgt die Dramaturgie:

> Meli erzählt auf der Website die Geschichte der Plantage.
> Im Buch erzählt sie, **wie sie Führerin wurde**.
> Am Ende steht Luna wieder im Garten, und dieser Garten ist Retoños del Edén.
> Wer weiterlesen will, kauft das Buch. Wer es erleben will, bucht den Workshop.

Damit fließen die drei geforderten Ebenen ineinander:
**Fantasie** (Lunas Verwandlung), **Wissen** (echte Bienenbiologie) und
**Retoños del Edén** (die Chacra als realer Schauplatz).

### Entscheidungen (mit dem Auftraggeber abgestimmt)

| Frage | Entscheidung |
|---|---|
| Umfang online | **Leseprobe von etwa 10 Seiten**, danach Einladung zum Buch |
| Sprache | **Nur Spanisch.** Der Text ist fest in die Bilder eingebrannt und bleibt unangetastet. Die englische Seite bekommt eine englische Rahmung (Einleitung, Bedienhinweise, Wissenskarten), die Buchseiten selbst bleiben spanisch |
| Verkauf | Noch offen. **Platzhalter-Bereich**, der ins Kontaktformular führt; die Kauf-URL wird später an einer Stelle eingetragen |
| Ort | **Eigene Unterseite** `/es/libro` bzw. `/en/book`, plus Teaser in der Bienen-Sektion |

---

## 2. Der Eintritt: die Einladung auf der Startseite

In der Sektion „Las abejas, el corazón que zumba" bekommt Meli einen neuen Moment.
Ein geschlossenes Buch liegt im Gras, Meli sitzt auf dem Buchdeckel.

- Beim Scrollen hebt sich der Buchdeckel einen Spalt, warmes Honiglicht dringt heraus.
- Sprechblase: *„¿Querés saber cómo llegué a ser guía? Está escrito en un libro."*
- Ein Klick führt auf die Buchseite. Der Übergang ist eine Aufblende in Honiggold,
  damit sich der Wechsel wie ein Eintauchen anfühlt und nicht wie ein Seitenwechsel.

Zusätzlich: eine Karte im Workshop-Bereich, weil „El mundo de las abejas"
und das Buch dieselbe Zielgruppe haben (Schulen, Kindergärten, Familien).

---

## 3. Der Buchraum: hinab in den Stock

Kein klassischer Blätterer. Das Buch wird zu einem **vertikalen Abstieg in den Bienenstock**,
weil das der Bewegung des Lesens auf dem Handy entspricht und der Erzählung folgt:
Luna geht von der Wiese hinunter in den Stock und am Ende wieder hinauf ans Licht.

```
Oben:   Wiese, Sonnenlicht, Blumen        (heller Papierton)
        ↓  Lunas Verwandlung
Mitte:  Waben, Honiglicht, Dämmerung      (warmes Bernstein)
        ↓  die Aufgaben der Bienen
Unten:  Herz des Stocks, Königin          (tiefes Gold)
        ↑  Rückkehr
Ende:   Der Garten. Und der Garten ist real.
```

Die Hintergrundfarbe der Seite wandert beim Scrollen durch diese Zonen.
Das ist der ruhige, unaufdringliche WOW-Effekt: Man merkt erst nach einer Weile,
dass man tatsächlich tiefer gekommen ist.

### Seitendarstellung

- Eine Buchseite füllt jeweils einen Bildschirm, mittig, mit weichem Papierrand und Schlagschatten.
- Beim Eintritt: sanfter Ken-Burns-Zoom (1.06 → 1.0 über etwa 1,2 s) plus leichtes Aufhellen.
  Dadurch wirken die statischen Bilder lebendig, ohne dass etwas neu gezeichnet werden muss.
- Auf dem Handy Hochformat: Bild oben, Bedienleiste unten fest im Daumenbereich.
- Meli fliegt beim Seitenwechsel über den Rand ins nächste Bild. Sie ist die Klammer
  zwischen Website und Buch und bleibt durchgehend dieselbe Figur.

---

## 4. Die vier Interaktionsebenen

### Ebene 1: Vorlesen (die wichtigste Funktion)

Die Zielgruppe sind Kinder in Kindergärten und der ersten Schulklasse. Viele können noch nicht lesen.

- Ein deutlich sichtbarer Vorlese-Knopf liest den spanischen Seitentext vor
  (Web Speech API, Stimme `es-*`, kein Backend, keine Kosten).
- Während des Vorlesens pulsiert Meli sacht im Takt.
- Automatisches Weiterblättern nach dem Vorlesen ist abschaltbar, damit Kinder
  auch ohne Erwachsene durch die Geschichte kommen.
- Fällt die Sprachausgabe im Browser aus, verschwindet der Knopf still.

### Ebene 2: Wissenskarten („¿Sabías que...?")

Auf jeder Seite sitzen ein bis zwei kaum sichtbare Pollenpunkte im Bild.
Antippen öffnet eine kleine Aquarellkarte mit einem echten biologischen Fakt,
passend zu dem, was gerade zu sehen ist:

| Seite | Wissenskarte |
|---|---|
| Luna im Garten | Bienen sehen ultraviolettes Licht. Für sie tragen Blüten leuchtende Landebahnen |
| Die Verwandlung | Eine Arbeiterbiene lebt im Sommer nur etwa sechs Wochen und wechselt in dieser Zeit mehrmals den Beruf |
| Ammenbiene | Aus einer Larve wird nur dann eine Königin, wenn sie ausschließlich Gelée royale bekommt |
| Wächterbiene | Wächterinnen erkennen Fremde am Geruch. Jeder Stock hat seinen eigenen Duft |
| Sammlerin | Für ein Glas Honig fliegen Bienen zusammen etwa drei Erdumrundungen weit |
| Der Stock | Ein Volk sind bis zu 60.000 Bienen. Genau so viele leben in unseren Kästen im Nordwesten der Chacra |

Diese Karten sind der Ort, an dem **Wissen und Retoños del Edén zusammenfließen**:
Jeder Fakt endet, wo es möglich ist, mit einem Bezug zur echten Plantage.
Das ist auch der Teil, der auf der englischen Seite übersetzt wird.

### Ebene 3: Mitmach-Momente, die etwas beibringen

An drei Schlüsselstellen wird aus Lesen Handeln. Bewusst nur drei, damit sie besondere
Momente bleiben und den Lesefluss nicht zerhacken.

**Das Grundprinzip** ist dasselbe wie beim Bestäubungsspiel und beim Quiz auf der Startseite:

> Handlung → sofortige, sichtbare Reaktion → echter Fakt, den man sich merkt.

Entscheidend: Man lernt **durch das Tun**, nicht durch einen Text danach. Und niemand
verliert. Ein falscher Griff führt nicht zu „Falsch", sondern zu einer Entdeckung,
die Meli freundlich einordnet. Genau wie im Quiz, wo eine falsche Antwort mit
*„Sorpresa: es el viento."* beantwortet wird und nicht mit einem roten Kreuz.

**a) Die Verwandlung: einen Bienenkörper bauen** (der WOW-Moment)

Luna wird zur Biene, und das Kind baut die Biene dabei Stück für Stück selbst.
Man hält den Finger auf Luna, Pollenlicht sammelt sich, und **nacheinander wächst
je ein Körperteil heran, jedes mit seinem Namen und seinem Zweck**:

| Was erscheint | Was Meli dazu sagt |
|---|---|
| **4 alas** | „Cuatro, no dos. Se enganchan de a pares para volar más fuerte." |
| **5 ojos** | „Dos grandes y tres chiquitos arriba. Con ellos veo la luz del sol aunque esté nublado." |
| **2 antenas** | „Con estas huelo el mundo. Una flor la reconozco antes de verla." |
| **6 patas con cestas** | „En las de atrás llevo el polen. Son como dos canastas." |

Lässt man zu früh los, bleibt die Verwandlung unvollständig, und Meli sagt:
*„Todavía te falta algo, ¿seguimos?"* Das Kind hält erneut. Am Ende steht die
Zählprobe: *„Cinco ojos, cuatro alas, dos antenas, seis patas. Ya sos una abeja."*

Nach dem Erlebnis kennt das Kind die Anatomie einer Biene, ohne dass sie ihm
jemand erklärt hätte. Das ist der Unterschied zu einem Faktenkasten.

**b) Ammenbiene: wer bekommt was zu essen?**

Der stärkste Wissensmoment des Buchs, weil er eine echte biologische Überraschung
erfahrbar macht: **Was eine Larve frisst, entscheidet, was aus ihr wird.**

In der Wabe liegen vier Larven, eine davon in einer größeren, anders geformten Zelle.
Das Kind hat zwei Futtersorten zur Wahl, die es auf die Larven ziehen kann:

- **Jalea real** (Gelée royale, perlweiß)
- **Pan de abeja** (Pollen und Honig, goldbraun)

Was passiert:

- Larve in der großen Zelle bekommt Gelée royale → sie wächst zur **Königin** heran.
  Meli: *„Esa va a ser reina. Va a poner dos mil huevos por día."*
- Normale Larve bekommt Pollenbrei → sie wird **Arbeiterin**.
- Normale Larve bekommt Gelée royale → sie wird **auch zur Königin**, und plötzlich
  hat der Stock zwei. Meli lacht: *„¡Ay! Ahora tenemos dos reinas y nadie que junte
  néctar. La comida decide quién sos, no el huevo."*

Genau diese Fehlbedienung ist der Lernmoment. Sie ist erlaubt, sie ist lustig,
und sie merkt man sich. Ein „Otra vez"-Knopf setzt die Wabe zurück.
Abschluss: eine Wabe, in der jedes Kind sieht, dass alle Larven zuerst gleich waren.

**c) Wächterbiene: der Stock riecht nach Zuhause**

Am Eingang landen nacheinander fünf Anflieger. Das Kind entscheidet:
**einlassen** oder **abweisen**. Der Clou: Man kann die Entscheidung nicht am
Aussehen treffen, sondern nur am Duft, den ein kleines Duftsymbol über jedem
Ankömmling anzeigt.

| Ankömmling | Richtige Entscheidung | Was man lernt |
|---|---|---|
| Biene, staubig und zerzaust, **richtiger Duft** | einlassen | Eine eigene Biene bleibt eigen, auch wenn sie schmutzig heimkommt |
| Biene, makellos, **fremder Duft** | abweisen | Aussehen sagt nichts. Jeder Stock hat seinen eigenen Duft |
| Biene mit vollen Pollenhöschen, **richtiger Duft** | einlassen | Sammlerinnen kommen schwer beladen zurück |
| **Wespe** | abweisen | Der echte Feind. Sie will den Honig, nicht helfen |
| Verirrte Biene, **fremder Duft, aber Nektar dabei** | einlassen | Wächterinnen lassen fremde Bienen durch, wenn sie Nektar mitbringen. Der Stock ist strenger bei leeren Händen |

Die zweite und die letzte Zeile brechen bewusst die Erwartung „anders aussehen
gleich fremd" und sind der eigentliche Wissenskern. Bei jeder Entscheidung erklärt
Meli in einem Satz, warum, und man macht weiter. Es gibt keine Punktzahl und
kein Scheitern, nur fünf kleine Erkenntnisse.

**Für die Vollversion vorgemerkt:** der **Schwänzeltanz**. Das Kind stellt den
Winkel zur Sonne ein und die Länge des Summens, andere Bienen fliegen los und
finden die Blume oder eben nicht. Das ist der spektakulärste Bienenfakt überhaupt,
gehört aber erzählerisch in die zweite Hälfte des Buchs und damit hinter die Leseprobe.

Die bestehenden Spiele auf der Startseite (Bestäubung, Quiz) bleiben, wo sie sind.
Das Buch wiederholt sie nicht: Dort geht es um Bestäubung und um die Chacra,
hier um Anatomie, Kasten und Stockverteidigung. Zusammen ergeben sie einen
vollständigen Bienenkundeunterricht, verteilt über die ganze Website.

### Ebene 4: Die Wabe als Fortschritt

Statt eines Fortschrittsbalkens eine Honigwabe am Rand: eine Zelle pro Seite.
Gelesene Seiten füllen sich mit Honig. Antippen springt zur Seite zurück.
Am Ende der Leseprobe ist die Wabe zu einem Drittel gefüllt, der Rest bleibt leer.
Das zeigt ohne einen Satz Text, dass die Geschichte weitergeht.

---

## 5. Der Abschluss der Leseprobe

Kein hartes Bezahlfenster. Nach der zehnten Seite kommt eine eigens gestaltete Seite:

- Die Wabe im Hintergrund, ein Drittel gefüllt.
- Meli sagt: *„Acá termina lo que puedo contarte volando. El resto está en el libro."*
- Darunter drei Wege, gleichwertig nebeneinander:
  1. **El libro** — Cover, Klappentext, Catalina als Autorin, Kauf-Bereich (vorerst Platzhalter, führt ins Kontaktformular)
  2. **Para escuelas** — Material für Lehrkräfte und Anfrage für Schulbesuche
  3. **El taller** — direkt zum Workshop „El mundo de las abejas"

So endet die Leseprobe nicht in einer Sackgasse, sondern in den drei Dingen,
die dem Projekt tatsächlich nützen.

---

## 6. Für Lehrerinnen und Lehrer

Der eigentliche Grund, warum das Buch entstanden ist. Ein ruhiger, sachlicher Bereich
unterhalb des Erlebnisses:

- Worum es geht und für welches Alter (etwa 4 bis 9 Jahre)
- Welche Themen abgedeckt sind: Bestäubung, Arbeitsteilung, Lebenszyklus, Ökosystem
- Druckvorlagen zum Herunterladen: Ausmalseite, Wabenrätsel, „Welcher Bienenberuf bist du?"
- Verbindung zum Workshop auf der Chacra für Schulklassen
- Anfrage über das bestehende Kontaktformular

Diese Vorlagen entstehen als Aquarell-SVG im bestehenden Stil und lassen sich
direkt aus dem Browser drucken. Kein PDF-Verwaltungsaufwand.

---

## 7. Technische Umsetzung

**Route und Aufbau**

```
src/pages/es/libro.astro          Leseerlebnis Spanisch
src/pages/en/book.astro           gleiche Seiten, englische Rahmung
src/components/libro/
  BookHero.astro                  Einstieg, Cover, Titel
  BookReader.astro                Der Abstieg, Seitenlogik
  BookPage.astro                  Eine Seite mit Hotspots
  KnowledgeCard.astro             Wissenskarte
  Transformation.astro            Halten-Interaktion
  LarvaGame.astro / GuardGame.astro
  HoneycombProgress.astro         Wabenfortschritt
  BookEnding.astro                Abschluss mit den drei Wegen
  TeacherCorner.astro             Bereich für Lehrkräfte
src/data/libro.ts                 Seitenreihenfolge, Text, Hotspots, Wissenskarten
src/assets/libro/                 Die Bilddateien
```

**Bilder**

- 42 Vorlagen à 1536×1024, zusammen etwa 20 MB. Für die Leseprobe werden 10 gebraucht.
- Verarbeitung über `astro:assets` (Sharp ist in Astro enthalten): WebP und AVIF,
  Breiten 768 / 1200 / 1536, `loading="lazy"` ab der zweiten Seite,
  erste Seite vorgeladen. Ziel: unter 150 KB je Seite.
- Die restlichen Seiten bleiben im Projekt liegen, aber außerhalb des Builds,
  damit die Vollversion später ohne neue Beschaffung ergänzt werden kann.

**Daten**

`src/data/libro.ts` hält pro Seite: Datei, Abschnitt, spanischer Text (wortgetreu
transkribiert, auch für die Sprachausgabe), Hotspot-Koordinaten in Prozent,
Wissenskarten zweisprachig, und ob ein Mitmach-Moment auf der Seite liegt.
Die Transkription aller 42 Seiten liegt in `bilder/SEITEN.md`.

**Leistung und Zugänglichkeit**

- Eigene Route, damit die Startseite nicht schwerer wird.
- `prefers-reduced-motion`: kein Ken Burns, keine Flugbewegung, keine Zonenfahrt.
  Die Geschichte bleibt vollständig lesbar, die Spiele bleiben spielbar.
- Vollständig mit der Tastatur bedienbar: Pfeiltasten blättern, Leertaste hält,
  Escape schließt Karten.
- Jede Buchseite bekommt einen echten Alternativtext (die Transkription),
  damit Screenreader die Geschichte vorlesen können, obwohl der Text im Bild steht.
- Sichtbare Bedienhinweise beim ersten Aufruf, danach dezent.

**Rechtliches**

Der Hinweis, dass Text und Illustrationen von Catalina Marzorati stammen und
urheberrechtlich geschützt sind, steht am Fuß der Buchseite. Rechtsklick-Sperren
oder Wasserzeichen sind bewusst nicht vorgesehen: Sie schrecken echte Leser ab
und halten niemanden auf, der kopieren will.

---

## 8. Stand der Umsetzung

**Gebaut und geprüft:**

1. Seitenreihenfolge und Transkription des Anfangs (`bilder/SEITEN.md`)
2. Neun Buchseiten als optimierte Bilder im Build (WebP, 32 bis 170 KB statt 500 KB)
3. Route `/es/libro` und `/en/book`, Einstieg mit Cover, Abstieg mit Zonenfarben
4. Wabenfortschritt: neun gefüllte Zellen plus vier leere für den Rest des Buchs
5. Vorlesefunktion auf jeder Seite (spanische Stimme, Web Speech API)
6. Acht Wissenskarten, davon fünf mit Bezug zur echten Chacra
7. Die drei Mitmach-Momente (siehe unten)
8. Abschluss mit den drei Wegen, Teaser in der Bienen-Sektion, Eintrag im Menü

**Die Mitmach-Momente wurden an die tatsächliche Seitenfolge angepasst.**
Beim Transkribieren zeigte sich, dass der Schwänzeltanz schon auf Seite 8 steht
und die Ammenbiene sowie die Wächterbiene erst nach der Leseprobe kommen. Daher:

| Seite | Moment | Was man dabei lernt |
|---|---|---|
| 5 Die Verwandlung | Halten, bis der Bienenkörper fertig ist | 4 Flügel, 5 Augen, 2 Antennen, 6 Beine mit Pollenkörbchen |
| 8 Der Schwänzeltanz | Winkel zur Sonne und Zahl der Schwänzel einstellen, Bienen losschicken | Der Winkel zeigt die Richtung, die Länge die Entfernung |
| 9 Die Königin | Aus drei Anfliegern die richtige einlassen | Der Stockgeruch entscheidet, nicht das Aussehen |

Larven füttern und Wächterbiene bleiben für die Vollversion vorgemerkt.

**Offen:**

- Restliche Seiten (`26_3` bis `26_32`, `17-49-48`) erfassen und ordnen
- Kauf-URL eintragen, sobald der Verkaufsweg feststeht (eine Stelle in `BookReader.astro`)
- Druckvorlagen für Lehrkräfte
- **Wichtig für den Druck:** Alle Seiten ab `25_4` tragen ein sichtbares
  Wasserzeichen „AI-Generated" und müssen ohne dieses neu exportiert werden.
  Außerdem enthält der Text mehrere Tippfehler und falsche Akzente.

---

## 9. Die Verschmelzung: das Blatt (Überarbeitung)

Die erste Fassung stapelte drei Bausteine übereinander — Bild, dann ein
Info-Modal, dann ein Spielkasten. Genau das wurde als „verschmilzt nicht"
kritisiert. Die Überarbeitung ersetzt den Stapel durch **ein einziges Objekt**:

```
.hoja  — das Blatt, ein Papier, ein Schatten, ein Rahmen
  ├── .plate    Illustration + Wissenslichter + Spielbühne (.tablero)
  └── .margen   gerissener Papierrand: Kapitel, Vorlesen, Spielsteuerung
```

- **Ab 920 px steht der Rand NEBEN dem Bild** wie die Marginalien einer echten
  Buchseite. Dadurch passt jede Seite samt Spiel auf einen Bildschirm.
- **Die Spielbühne (`.tablero`) liegt deckungsgleich über der Illustration.**
  Alle Bilder sind 1536×1024, also exakt 3:2; die Overlays rechnen deshalb in
  einem viewBox-Raum von 300×200 und sitzen bei jeder Bildschirmgröße an
  derselben Stelle im Bild.
- **Kein Website-Kartenstil mehr.** Gemeinsame Bildsprache in
  `src/styles/libro.css`: Pergamentpapier, gerissene Kanten (SVG-Masken),
  Wabenwasserzeichen, Tuscheknöpfe (`.boton`), Wachssiegel für den
  Chacra-Bezug. Die Wissenskarte ist eine Seite aus Melis Heft, kein Dialog.

### Der Abstieg wird sichtbar

Statt vier ähnlicher Gelbtöne steuert jetzt eine Tiefe `--hondura` (0 … 1)
mehrere Ebenen gleichzeitig: Seitenhintergrund (`#e6f0dc` → `#5a3008`), eine
feste Vignette über dem ganzen Viewport (Deckkraft 0 → 0,62), aufsteigender
Pollenstaub (0,18 → 1), die Rahmenfarbe des Blattes (kühles Weiß → Bernstein)
und dessen Lichthof. Tief im Stock ist die Seite dunkel und das Blatt
leuchtet — beleuchtete Bühne statt hingelegtem Bild.

### Acht Momente statt drei

| Seite | Moment | Was man dabei lernt |
|---|---|---|
| 2 Jardín | **Ojos de abeja** — die Illustration kippt per SVG-Kanaltausch in Bienensicht | UV-Landebahnen, Rot existiert nicht |
| 3 Encuentro | **El zumbido** — 5 s so schnell tippen wie möglich, Flügel und Ton folgen | Das Summen sind die Flügel: 230/s |
| 4 Invitación | **El plato** — wegnehmen, was ohne Bestäuber verschwindet; das Bild verliert dabei Farbe | Eine von drei Cucharadas |
| 5 Transformación | **Halten** — Körperteile wachsen an der kleinen Luna im Bild | 4 Flügel, 5 Augen, 2 Antennen, 6 Beine |
| 6 Vuelo | **¿Cuántas viven ahí?** — schätzen, dann strömt der Schwarm aus der Kiste | ~60.000, fast alle Schwestern |
| 7 Entrada | **Las larvas** — Futter auf vier Larven verteilen | Das Futter entscheidet, nicht das Ei |
| 8 Baile | **El baile del meneo** — drinnen tanzen, draußen fliegen die Arbeiterinnen | Oben = zur Sonne; Länge = Entfernung |
| 9 Reina | **Las guardianas** — fünf Anflieger, Duft statt Aussehen | Der Stockgeruch ist der Ausweis |

Alle acht folgen demselben Prinzip: Handlung → sichtbare Reaktion im Bild →
Meli ordnet ein. Niemand verliert; eine „falsche" Wahl ist der Lernmoment
(zwei Königinnen, die eingelassene Wespe).

### Sammelheft statt Punktestand

Jede gefundene Wissenskarte und jede bestandene Probe meldet ein `libro:logro`
an das Heft (`carnet`). Die Wabe rechts füllt sich, die betreffende Zelle
glänzt, und am Ende steht, was das Kind entdeckt hat — 14 Secretos, 8 Pruebas.

### Vorlesen ohne Roboter (`src/scripts/voz.ts`)

Der monotone Klang kam daher, dass ein ganzer Absatz als ein Block an die Web
Speech API ging. Jetzt: beste verfügbare spanische Stimme (Natural/Neural/
Google bevorzugt, eSpeak abgewertet, Rioplatense zuerst), Zerlegung in Sätze
mit eigener Tonhöhe und eigenem Tempo je Satzart (Frage tiefer/langsamer,
Ausruf schneller/höher) und echten Atempausen dazwischen, dazu ein
Mitlese-Band mit Wortmarkierung und — wenn mehrere Stimmen da sind — eine
Stimmenauswahl für den Fall, dass die Systemstimme trotzdem blechern klingt.

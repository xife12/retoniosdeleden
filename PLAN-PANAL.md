# Plan — Nuestro Panal als Scroll-Seite (Weg A)

**Stand: 31. August 2026. Umgesetzt.** Dieser Plan ersetzt die
bisherige Fassung der Seite `/es/nosotros` vollständig. Die Storyboards
dazu stehen im Entwurfsdokument „Panal en Movimiento"; entschieden ist
**Weg A — el panal crece**.

Grundlage sind drei Befunde aus der verworfenen Fassung, die dieser Plan
nicht wiederholen darf:

1. **Sie war für breite Bildschirme gedacht.** Landkarte links, Karte
   rechts — am Telefon lagen beide untereinander und beide waren zu klein.
2. **Zu wenig Bewegung.** Es gab nur einen Zustandswechsel je Station.
   Zwischen zwei Personen passierte nichts, obwohl man weiterscrollte.
3. **Zu klein gedacht.** Ein Abschnitt mit einer Überschrift, keine Seite,
   die einen durch etwas hindurchführt.

---

## 1. Die Idee in drei Sätzen

Am Anfang ist die Wabe leer. Jede Person bringt beim Scrollen ihre eigene
Zelle mit, Meli trägt sie herein, und die Zelle bleibt. Am Ende steht ein
Stock, den man selbst hat wachsen sehen — mit ein paar Zellen, die noch
frei sind.

Das ist keine Dekoration der Aussage, das **ist** die Aussage: hier ist
etwas langsam und von Hand gewachsen, und es ist nicht fertig.

---

## 2. Was am Telefon nie passieren darf

Die eine Regel, aus der alles andere folgt: **es steht nie etwas
nebeneinander.** Zu jedem Zeitpunkt gibt es genau eine Sache im Bild.

Das geht bei Weg A ohne Kunstgriff, weil die Wabe die längste Zeit klein
ist — sie ist ja noch nicht fertig. Groß wird sie erst im Schlussbild, und
da steht kein Text mehr daneben.

| Scrollstand | Was im Bild ist | Wabe belegt |
|---|---|---|
| Einstieg | Titel, eine leere Zelle, Meli fliegt herein | ~40 % der Breite |
| Station 1–7 | Wachsende Wabe oben, darunter Name und Text | 40 → 70 % |
| Station 8–10 | Wabe mit Umflug, darunter Name und Text | ~75 % |
| Schluss | Nur die vollständige Wabe, ein Satz darunter | ~88 % |

---

## 3. Der Ablauf der Seite, von oben nach unten

### Szene 0 · Einstieg (ein Bildschirm)

Titel „Nuestro Panal", darunter der Einleitungssatz. In der Mitte **eine
einzige leere Zelle**, gestrichelt. Meli fliegt von außen herein und setzt
sich darauf. Der Einstieg macht die Regel klar, bevor sie gebraucht wird:
eine Zelle, eine Person.

### Szenen 1–10 · Die Menschen

Je Person eine Station. Oben die wachsende Wabe, darunter:

- Art der Beteiligung (klein, gesperrt: „Están todos los días")
- Name (groß, Fraunces)
- die eine Zeile (`role`)
- der längere Text (`detail`)

Die **Reihenfolge ist chronologisch**, nicht räumlich: wer zuerst da war,
kommt zuerst. Das ist eine Geschichte, keine Rangordnung — und es ist die
einzige Reihenfolge, in der „die Wabe wächst" überhaupt Sinn ergibt.

| # | Wer | Warum an dieser Stelle |
|---|---|---|
| 1 | Abuela Alba | Die erste Zelle. Alles wächst um sie herum. |
| 2 | Catalina | |
| 3 | Stefan | |
| 4 | Florian | |
| 5 | Maxi | |
| 6 | Jasmin | „Se sumó a la familia" — passt genau hierhin. |
| 7 | Los nietos | Schließt die Blüte. |
| 8 | Los vecinos | Ab hier die gestrichelten Zellen: der Umflug. |
| 9 | Los voluntarios | |
| 10 | Las escuelas | Führt zu „Las abejas educan" hinüber. |

**Der Haken, den du kennen musst:** Alba sitzt damit in der Mitte der
Wabe. Das kann man als Vorrang lesen. Ich halte es für vertretbar — die
Mitte eines Stocks ist kein „oben", und der Text sagt ohnehin, dass sie den
ersten Baum gepflanzt hat. Wenn dir das zu viel Bedeutung ist, gibt es zwei
Auswege: die erste Zelle bleibt eine **leere** Zelle und Alba dockt daneben
an, oder die Ordnung wird gemischt und die Wabe wächst in Sprüngen. Beides
kostet den natürlichen Fluss. **Bitte entscheiden.**

### Szene 11 · Schlussbild (ein Bildschirm)

Die vollständige Wabe, jetzt groß und allein. Drei Zellen bleiben **frei** —
sie erklären sich hier von selbst, weil man gerade zugesehen hat, wie sich
alle anderen gefüllt haben. Darunter ein Satz („El panal sigue creciendo")
und der Werte-Absatz „Cómo trabajamos".

**Hier und nur hier wird die Wabe zum Nachschlagewerk:** jede Zelle ist
antippbar und zeigt ihre Person noch einmal. Die Sprungmöglichkeit liegt
damit am *Ende* der Reise statt daneben — sie stört den Weg nicht, ist aber
da, wenn man jemanden wiederfinden will.

---

## 4. Wie die Wabe wächst — die Geometrie

Die bisherige Datenstruktur (`panalFilas`, Zeilen von Zellen) trägt das
nicht. Sie kann nicht beantworten, welche Zelle an welche grenzt, und genau
das braucht ein Wachstum: **jede neue Zelle muss die bestehende Form
berühren**, sonst schwebt sie daneben und es sieht kaputt aus.

Ersetzt wird sie durch **Achsenkoordinaten** (`q`, `r`) je Person — das
übliche Modell für Sechseckraster. Daraus folgt alles Weitere durch
Rechnung statt durch Handarbeit:

```
x = groesse * 1.5 * q
y = groesse * √3 * (r + q / 2)
```

- **Nachbarschaft** ist geprüft, nicht gehofft: zwei Zellen grenzen
  aneinander, wenn ihre Koordinaten sich um einen der sechs
  Nachbarschritte unterscheiden. Ein Aufbau, der eine Lücke lässt, fällt
  beim Bauen auf statt im Browser.
- **Mittigkeit** ergibt sich: aus den bisher gezeigten Zellen wird der
  Schwerpunkt gerechnet, und die ganze Gruppe wird darum zentriert. Deshalb
  wandert die Wabe beim Wachsen sanft mit, statt nach einer Seite zu
  kippen.
- **Größe** ergibt sich ebenso: aus der Ausdehnung der gezeigten Zellen und
  der verfügbaren Breite. Die Wabe füllt immer denselben Anteil des Bildes,
  egal ob eine oder dreizehn Zellen darin liegen.

Die Zielform bleibt die geschlossene Blüte (Alba in der Mitte, sechs
darum), außen die drei gestrichelten Zellen des Umflugs und drei freie.

---

## 5. Bewegung — der Punkt, an dem es letztes Mal scheiterte

Es reicht nicht, dass sich an den Stationen etwas ändert. Solange gescrollt
wird, muss sich etwas bewegen. Drei Ebenen übereinander:

**a) Durchgehend, direkt am Scrollen hängend.** Der Maßstab der Wabe und
ihre Mitte verschieben sich stufenlos. Zwischen Station 4 und 5 wird die
Wabe also nicht ruckartig kleiner, sondern die ganze Strecke über ein
bisschen. Das ist eine einzige Transformation auf einem einzigen Element —
billig und flüssig, auch auf einem alten Telefon.

**b) Je Station, von Meli getragen.** Meli fliegt von ihrer alten Zelle zur
neuen Stelle, auf einer gepunkteten Bahn im Duktus der Startseite. Wo sie
landet, wächst die neue Zelle aus dem Nichts hoch. Sie trägt die Zelle
herein — das ist der Grund, warum sie überhaupt da ist.

**c) Ständig, ohne Bezug zum Scrollen.** Melis Flügelschlag, ein
kaum merkliches Schweben, die Aquarellwaschung im Hintergrund. Damit die
Seite auch dann lebt, wenn jemand kurz nicht scrollt.

Bei `prefers-reduced-motion` bleibt nur die Ebene a, und die in Stufen
statt stufenlos: die Zelle ist da oder nicht, Meli springt.

---

## 6. Technik

| Frage | Entscheidung |
|---|---|
| Bühne | Ein klebender Bildschirm in einer hohen Bahn; aus dem Scrollfortschritt folgen Station **und** der Bruchteil innerhalb der Station |
| Animationsbibliothek | **Keine.** GSAP liegt zwar im Projekt, wird hier aber nicht gebraucht: es sind zwei Transformationen und eine Klasse |
| Taktung | `requestAnimationFrame`, mit Rückfall auf `setTimeout`, wenn der Bildaufbau angehalten ist |
| Daten | `src/data/nosotros.ts`, erweitert um `q`/`r` je Person; Reihenfolge = Reihenfolge im Feld |
| Ohne JavaScript | Alle Stationen als schlichte Liste untereinander, das Schlussbild als eine statische Wabe |
| Vorlesegeräte | Jede Station ist ein `<section>` mit Überschrift und steht vollständig im Markup — die Erzählung ist ohne Bewegung vollständig lesbar |
| Tastatur | Im Schlussbild sind die Zellen Knöpfe mit sichtbarem Fokus; die Reise selbst braucht keine Bedienung |

### Was aus dem jetzigen Stand bleibt

Nicht alles war falsch. Erhalten bleiben:

- **Die Bauweise einer Zelle** (zwei Ebenen: Element = Kontur, `::before` =
  Fläche). Ein `border` folgt dem Rechteck und wird von `clip-path` an den
  Schrägkanten weggeschnitten — diese Lösung ist weiter nötig.
- **Die feste Höhe statt `aspect-ratio`.** `aspect-ratio` ist nur ein
  Vorschlag, den der Inhalt überstimmt; genau daher kamen die gestreckten
  Waben.
- **Die gestrichelte Kontur als SVG-Pfad** für die Zellen des Umflugs.
- **`PersonAvatar.astro`** und die Pigmente nach Tätigkeit.
- **Die Texte** in `nosotros.ts` (Entwurfstexte, noch zu bestätigen).

Ersatzlos weg: die Zweiteilung Landkarte + Karte, die kleine Landkarte, die
Auswahl-Karte neben der Wabe, `panalFilas`.

---

## 7. Schritte

| # | Schritt | Aufwand |
|---|---|---|
| 1 | `nosotros.ts`: Achsenkoordinaten, Erzählreihenfolge, Nachbarschaftsprüfung beim Bauen | ½ Tag |
| 2 | Gerüst: hohe Bahn, klebende Bühne, Scrollfortschritt → Station + Bruchteil | ½ Tag |
| 3 | Die Wabe: Zellen aus Koordinaten, stufenloses Zentrieren und Skalieren | 1 Tag |
| 4 | Meli: Flugbahn je Station, Aufwachsen der neuen Zelle | ½ Tag |
| 5 | Szene 0 und Szene 11 (Einstieg und Schlussbild mit antippbaren Zellen) | ½ Tag |
| 6 | Rückfälle: ohne JavaScript, `prefers-reduced-motion`, Vorlesegeräte | ½ Tag |
| 7 | Abnahme am echten Telefon und am Rechner | — |

**Zusammen etwa 3½ Tage.**

Schritt 7 ist kein Anhängsel: **die Abnahme muss auf einem echten Gerät
stattfinden.** In der Arbeitsumgebung scrollt die Vorschau nicht und friert
Übergänge ein — das Gefühl dieser Seite lässt sich dort grundsätzlich nicht
beurteilen. Der Stellknopf fürs Tempo ist die Bahnlänge je Station
(Vorschlag: 80 vh); das ist eine Zahl, die man in einer Minute ändert.

---

## 8. Offene Fragen

1. **Alba in der Mitte** — in Ordnung, oder soll die erste Zelle leer
   bleiben? (Abschnitt 3)
2. **Zehn Stationen oder acht?** Die drei Zellen des Umflugs ließen sich zu
   einer Station zusammenziehen („und um uns herum fliegen noch viele
   mehr"). Kürzer, aber die drei Gruppen verlieren ihren eigenen Auftritt.
3. **Was steht ganz am Anfang?** Nur der Titel, oder ein Satz von Meli, der
   den Weg ankündigt?
4. **Endet die Seite mit „Cómo trabajamos"** wie heute, oder soll etwas
   anderes die Reise abschließen?
5. Bleibt es bei den Entwurfstexten der drei Begleiter-Gruppen (`vecinos`,
   `voluntarios`, `escuelas`) — oder gibt es echte Namen und Sätze dafür?

---

## 9. Umsetzung — was gebaut wurde

Alle Schritte aus Abschnitt 7 sind erledigt. Gebaut in
`src/data/nosotros.ts` und `src/components/nosotros/NosotrosPage.astro`.

Zwoelf Stationen: Einstieg, zehn Personen, Schlussbild. Geprueft wurde jede
Station einzeln — Zellzahl, Massstab, Text, Meli:

| Station | Zellen | Was zu sehen ist |
|---|---|---|
| 1 | 1 (leer) | „Asi empieza un panal" |
| 2 | 1 (gefuellt) | Abuela Alba — die erste Zelle fuellt sich |
| 3–11 | 2 → 10 | je eine Person, je eine Zelle mehr |
| 12 | 13 | vollstaendige Wabe samt drei freien Zellen |

Der Massstab laeuft dabei stufenlos von 2,6 auf 0,7 herunter. Innerhalb
einer Station gemessen: 1,595 → 1,549 → 1,430 → 1,288 → 1,169 → 1,122.
Das ist die durchgehende Bewegung zwischen den Stationen, die vorher
gefehlt hat.

Am Telefon (375 px) belegt die Wabe am Anfang 69 % der Breite mit einer
einzigen Zelle und im Schlussbild 85 % mit dreizehn. Zu keinem Zeitpunkt
steht etwas nebeneinander, und es gibt kein Querscrollen.

### Zwei Dinge, die beim Bauen aufgefallen sind

- **`animation-fill-mode: both` ist hier gefaehrlich.** Mit Fuelleigenschaft
  bleibt eine Zelle auf dem Anfangsbild der Animation stehen — also winzig
  und unsichtbar —, falls die Animation nie anlaeuft. Ohne sie gilt in dem
  Fall der normale Zustand.
- **Das Schlussbild braucht den reservierten Textplatz nicht.** Waehrend der
  Erzaehlung haelt der Textbereich Platz fuer den laengsten Stationstext
  frei, damit die Wabe nicht bei jedem Wechsel huepft. Im Schlussbild gibt
  er ihn wieder frei (`.es-final`), sonst stuende die vollstaendige Wabe
  unnoetig klein da — 60 % statt 85 % der Breite.

### Was weiterhin offen ist

Die Abnahme am echten Geraet (Schritt 7). In der Arbeitsumgebung scrollt
die Vorschau nicht — `scrollY` bleibt auf 0, es feuert kein einziges
Scroll-Ereignis, und Animationen frieren ein. Geprueft wurde deshalb, indem
die Bahn selbst verschoben und das Scroll-Ereignis ausgeloest wurde: das
trifft dieselbe Rechnung, sagt aber nichts darueber, wie es sich anfuehlt.

Stellknopf fuers Tempo: `80vh` je Station in `.panal.esta-viva .panal-pista`.

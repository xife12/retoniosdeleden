# Handoff: „Luna y el secreto de la colmena" — Überarbeitung

An den nächsten Agenten: Das interaktive Buch ist gebaut, läuft und ist fehlerfrei
(`npm run build` durchläuft, keine Konsolenfehler), aber der Auftraggeber hat nach
Ansicht vier konkrete Schwachstellen benannt. Dieses Dokument fasst den Ist-Zustand,
die Kritik und den Kontext zusammen, den du zum Weiterarbeiten brauchst.

**Lies zuerst `KONZEPT-LIBRO.md`** im Projektwurzelverzeichnis — dort steht die
komplette Konzeption (Grundidee, die vier Interaktionsebenen, technischer Aufbau).
Dieses Dokument hier ergänzt es um die Nutzerkritik nach dem ersten Rundgang und
soll NICHT das Konzept ersetzen, sondern präzisieren, wo die Umsetzung hinter der
Absicht zurückbleibt.

---

## 1. Wo der Code liegt

```
src/pages/es/libro.astro          Route /es/libro
src/pages/en/book.astro           Route /en/book
src/components/libro/
  BookPage.astro                  Einstiegs-Hero mit Cover (230 Zeilen)
  BookReader.astro                Der ganze Leseabschnitt: Abstieg, Seiten,
                                   Wissenskarten, alle drei Mitmach-Momente
                                   (964 Zeilen — das Herzstück, hier ansetzen)
src/data/libro.ts                 Seiteninhalte, Wissenskarten-Texte, UI-Strings,
                                   zoneColors (463 Zeilen)
bilder/SEITEN.md                  Transkription und Reihenfolge der Buchseiten
src/assets/libro/                 Die 9 Bilddateien der Leseprobe (01–09)
```

Teaser auf der Startseite: `src/components/Abejas.astro`, Klasse `.libro-teaser`
(gegen Ende der Datei). Menüeintrag „El libro": `src/components/Nav.astro`.

---

## 2. Nutzerkritik nach dem ersten Rundgang (wörtlich, mit Einordnung)

### 2.1 „Der Abstieg in den Bienenstock wirkt nicht. Man merkt nicht mal unterbewusst den Unterschied."

**Ursache im Code:** `BookReader.astro`, Zeilen 235–251. Ein `IntersectionObserver`
setzt beim Sektionswechsel `--zone` auf die Astro-Root, `.reader` interpoliert das
per `transition: background 900ms`. Die vier Zonenfarben stehen in `libro.ts`,
`zoneColors`:

```
pradera: '#f4f7ea'   umbral: '#fdf3e0'   colmena: '#f3d9a4'   corazon: '#e8bd6d'
```

Das Problem: Diese vier Töne sind sich viel zu ähnlich (alle helle, warme Gelbtöne
mit geringem Kontrast) und der Hintergrund ist über weite Strecken ohnehin von den
großformatigen Buchbildern selbst verdeckt — man sieht das `--zone`-Blau/Gelb nur
in schmalen Rand­streifen. Eine reine Farbinterpolation im Hintergrund reicht als
Trägersignal für „ich sinke tiefer in den Stock" nicht aus, zumal die Bilder selbst
(Wiesenbild → Wabenbild → goldenes Wabenlicht) den Effekt eigentlich schon
mitbringen und der CSS-Hintergrund kaum etwas beiträgt.

**Ansatzpunkte für die Überarbeitung** (keine fertige Lösung, zur Auswahl/Kombination):
- Deutlich stärkere Farbdifferenz zwischen den Zonen (heller Himmel-Ton → sattes
  Bernstein → dunkles Waben-Gold), nicht nur vier Gelbnuancen.
  Denk an tatsächliche Beleuchtungsstimmung, nicht nur Hue-Shift.
- Ein zusätzliches visuelles Signal, das man wirklich sieht, nicht nur den Rand:
  z. B. eine feste Vignette/Overlay-Schicht, die mit der Zone dunkler/wärmer wird
  und über dem ganzen Viewport liegt (nicht nur `body`-Hintergrund hinter den
  Bildern). Oder Partikel (Pollenstaub, Lichtpunkte), deren Dichte mit der Tiefe
  zunimmt.
- Der Wabenfortschritt (`.comb`, rechts fixiert) könnte die Zone ebenfalls
  reflektieren, damit man auch dort eine Tiefenanzeige hat, nicht nur „Seite x von y".
- Denkbar: ein simples, dezentes Parallax/Scale auf den Bildkacheln selbst, das mit
  der Zone stärker wird, damit sich Tempo/Gewicht der Bewegung verändert.
- Zur Kalibrierung: der Effekt sollte in einem stillen Screenshot-Vergleich
  zwischen Seite 1 (Wiese) und Seite 9 (Herz des Stocks) sofort sichtbar sein,
  nicht erst beim genauen Hinsehen.

### 2.2 „Der Startpunkt des Buches wirkt nicht sehr einladend, sondern sehr statisch. Hier erwarte ich mehr Dynamik und Aufregung."

**Ursache im Code:** `BookPage.astro`, Sektion `.libro-hero` (~Zeilen 55–90 Markup,
Styles ab `.libro-hero` weiter unten). Aktuell: Cover-Bild leicht schräg (`rotate:
-1.2deg`), das sich nur bei Hover minimal aufrichtet (Desktop-only, `@media (hover:
hover)`), daneben Meli statisch mit einer Sprechblase, ein Button. Kein
Eigenbewegung, kein Sound-Signal, keine Aufforderung, die über einen Standard-Hero
hinausgeht. Auf dem Handy (die Haupt-Zielgruppe: Eltern/Kinder) passiert beim
Laden der Seite optisch praktisch nichts — kein Pendant zum Honiglicht-Effekt, den
der Teaser auf der Startseite schon hat (`.lt-cover`/`.lt-glow`/`.lt-sparks` in
`Abejas.astro`, dort hebt sich der Deckel bei Hover und Lichtpunkte funkeln —
genau dieses Aufregungslevel fehlt dem eigentlichen Bucheinstieg noch, und der
Teaser kann sogar als Vorbild für „wie sich das anfühlen soll" dienen).

**Ansatzpunkte:**
- Aktive Eigenbewegung beim Laden, nicht nur bei Hover (Hover existiert auf dem
  Handy sowieso nicht): z. B. Cover „öffnet" sich leicht beim Scrollen in den
  View, Meli fliegt ins Bild statt einfach dazustehen, ein Pollenstaub-/
  Lichteffekt der wirklich zieht.
- Der „Start"-Button ist aktuell ein normaler `.btn`. Für den Einstiegsmoment
  könnte er sich abheben (z. B. wie der Honig-Glow-Effekt aus dem Teaser, den
  gibt es an dieser Stelle noch nicht).
- Ggf. eine kurze, überspringbare Mikro-Animation direkt beim ersten Laden
  (Buchdeckel schwingt auf, o. ä.), die klar macht: hier passiert jetzt etwas.
- Wichtig: `prefers-reduced-motion` weiterhin respektieren — die aufregendere
  Fassung braucht einen sauberen ruhigen Fallback, nicht nur „Animation aus".

### 2.3 „Die Wissenskarten sind langweilig und sieht man kaum auf den Bildern."

**Ursache im Code:** `BookReader.astro`, Markup Zeile 56 (`class="pollen"`), Styles
Zeile 617ff. Jeder Hotspot ist ein 34×34px runder Button mit einem einfachen
`radial-gradient` in Honigfarbe und einer Pulsanimation. Auf großformatigen,
detailreichen, farbintensiven Kinderbuch-Illustrationen (1536×1024, viele warme
Gelb-/Goldtöne) geht ein honigfarbener Punkt fast unter — genau die falsche Farbe
für genau diesen Bildhintergrund. Und geöffnet erscheint nur eine simple weiße
Karte mit Titel + Fließtext (`.know`, Bottom-Sheet), die stilistisch nichts mit
der Bildwelt des Buchs zu tun hat — sie sieht aus wie ein generisches Info-Modal,
nicht wie ein Teil der Geschichte.

**Ansatzpunkte:**
- Der Hotspot selbst braucht mehr visuelle Präsenz und einen Kontrastbruch zum
  Bild: z. B. ein kleines Icon/Symbol statt eines reinen Farbpunkts (eine Lupe,
  ein Fragezeichen-Blütenblatt, ein Glitzerstern — passend zum Aquarell-Stil der
  restlichen Seite), ein sichtbarer heller Rand/Schlagschatten, der sich vom
  jeweiligen Bildbereich abhebt, oder eine kurze Einführungsanimation beim
  Erscheinen der Seite, die den Blick einmal bewusst dorthin lenkt.
- Die Karte selbst (`.know`) sollte wie ein Teil des Buchs aussehen, nicht wie ein
  Standard-Dialog: Illustration statt nur Text, Pergament-/Wabenrand, evtl. Meli,
  die den Fakt „erzählt" statt eines unpersönlichen Titel+Absatz-Layouts.
- Prüfen, ob 34px auf einem 1536-breiten Bild, das auf 100vw skaliert wird,
  überhaupt eine sinnvolle Trefferfläche/Sichtbarkeit ergibt — auf einem breiten
  Desktop-Bild kann derselbe Punkt winzig wirken.

### 2.4 „Das Bienenspiel sollte mehr animiert sein mit einer Biene und nicht mit einem Punkt und Textfeldern."

Unklar, ob damit der **Schwänzeltanz** (Seite 8, `momento--dance`) oder die
**Wächter-Szene** (Seite 9, `momento--scent`) gemeint ist — vermutlich der Tanz,
weil dort tatsächlich nur ein Zielpunkt (`.target`, ein oranger Kreis) und ein
Bienenschwarm aus drei winzigen Punkten (`.swarm`, Kreise à 3–4px, Zeilen ~102–116
Markup) über zwei Schieberegler gesteuert werden. Es gibt an dieser Stelle **keine
einzige gezeichnete Biene** — weder Meli noch eine Symbolbiene fliegt sichtbar,
obwohl das ganze Projekt bereits eine ausgearbeitete `<BeeMeli>`-Komponente mit
Aquarell-Körper, Flügeln und Fühlern hat (`src/components/BeeMeli.astro`, wird an
zig Stellen der Hauptseite wiederverwendet, z. B. `Abejas.astro` fürs
Bestäubungsspiel — dort fliegt tatsächlich eine gezeichnete Biene von Blume zu
Blume, siehe `.game-bee` / `data-game-bee`, Zeilen ~126 und 441ff).

Auch die Duft-Szene (`.scent-opt`, Zeile 137) arbeitet mit selbstgezeichneten
kleinen Bienen-Icons in Buttons nebeneinander (kein Freiflug, eher eine
Auswahlliste mit Illustrationen) — die fühlt sich dadurch eher wie ein Quiz an
als wie eine Spielszene.

**Vergleichsmaßstab im eigenen Projekt:** Das Bestäubungsspiel in `Abejas.astro`
(Startseite, Sektion „Las abejas") macht genau das richtig, was hier fehlt: eine
echte `<BeeMeli>` fliegt sichtbar von Ziel zu Ziel (`bee.style.transform =
translate(...)`, Zeilen ~252ff), es gibt Wachstums-/Blüh-Animationen an den
Zielen selbst, kein Punkt-und-Regler-Interface. **Diese Machart sollte auf den
Schwänzeltanz übertragen werden**: eine echte Biene fliegt (mit GSAP oder simplen
CSS-Transitions, wie im Bestäubungsspiel) den eingestellten Winkel/die Distanz ab,
landet sichtbar auf der Zielblume oder verfehlt sie sichtbar, statt dass nur ein
Punkt springt.

---

## 3. Der eigentliche Kern der Kritik (wichtiger als die vier Einzelpunkte)

Wörtlich vom Auftraggeber:

> „Geschichte, Wissensvermittlung und Wissensspiele müssen viel mehr ineinander
> verschmelzen. Sowohl inhaltlich, visuell und von der UX. Das passiert hier nicht."

Das ist die eigentliche Leitplanke für die Überarbeitung, nicht nur die vier
Symptome oben. Konkret bedeutet das im aktuellen Code:

- **Strukturell getrennt statt verschmolzen:** Buchbild → dann *separat* ein
  Pollenpunkt mit Fakten-Modal → dann *separat* eine Momento-Box unterhalb des
  Bildes mit eigenem Kasten, eigenem Hintergrund, eigener Überschrift
  (`.momento`, weißer Kasten mit Radius und Schatten, Zeilen ~505ff). Die drei
  Ebenen (Geschichte im Bild, Wissen in der Karte, Spiel im Kasten darunter)
  sehen wie drei verschiedene UI-Bausteine aus, die untereinandergestapelt sind,
  nicht wie eine einzige fließende Erfahrung.
- **Visuell inkonsistent:** Das Buchbild ist warmes, gemaltes Kinderbuch-Aquarell
  (Original-Illustrationen von Catalina). Die Wissenskarte und die Momento-Boxen
  sind schlichte `#fffdf8`-Karten im generischen Website-Kartenstil des restlichen
  Projekts (`--r-lg`, `--shadow-soft`, Standard-Buttons). Der Stilbruch zwischen
  „gemaltes Buch" und „Website-UI-Komponente" ist genau das, was hier als
  „verschmilzt nicht" wahrgenommen wird.
- **Inhaltlich lose gekoppelt:** Die Mitmach-Momente sitzen zwar auf der
  richtigen Seite (Tanz auf Seite 8, wo im Buch tatsächlich vom Tanz die Rede
  ist), aber sie sind eigenständige Mini-Widgets, die nicht auf das Bild selbst
  einwirken oder mit ihm interagieren. Die Verwandlung (`momento--hold`) ist die
  einzige, die dem Bild wenigstens thematisch folgt (Luna wird zur Biene), aber
  auch sie passiert in einer separaten Box unter dem Bild statt im Bild selbst.

**Für die Überarbeitung heißt das:** nicht nur die vier Einzelsymptome flicken,
sondern grundsätzlich überlegen, wie Bild, Wissen und Spiel eine einzige visuelle
und interaktive Fläche werden können — z. B. Hotspots und Spielelemente direkt
im/über dem Illustrationsbereich statt in Kästen darunter, ein gemeinsames
Aquarell-Bildsprache statt Website-Kartenkomponenten für Wissen und Spiel, und
Reaktionen, die im selben Bildraum passieren, in dem die Geschichte erzählt wird
(vgl. wie auf der Startseite die Pistazie „aufknackt" direkt in der Illustration,
`Pistacho.astro`, `.crack-btn`/`.kernel` — das ist ein Beispiel im Projekt, wo
Spiel und Bild eins sind, nicht getrennt).

---

## 4. Was NICHT angefasst werden muss

- Die Dateninfrastruktur (`libro.ts`: Seiteninhalte, Übersetzungen ES/EN,
  Wissenskarten-Texte, UI-Strings) ist inhaltlich fertig und muss nur bei neuen
  Textbedürfnissen erweitert werden, nicht neu aufgebaut.
- Die Bildoptimierung (`astro:assets`, WebP-Ausgabe, 32–170 KB pro Seite) läuft
  und muss nicht angefasst werden.
- Vorlesefunktion (`speechSynthesis`) funktioniert und wurde nicht kritisiert.
- Wabenfortschritt (`.comb`, rechts fixiert) wurde nicht kritisiert, könnte aber
  bei der Zonen-Überarbeitung (Punkt 2.1) sinnvoll mit einbezogen werden.
- Der Abschluss der Leseprobe (drei Wege: Buch/Schulen/Workshop) wurde nicht
  kritisiert.
- Teaser auf der Startseite (`.libro-teaser` in `Abejas.astro`) wurde nicht
  kritisiert — im Gegenteil, er zeigt bereits den Ton (Honiglicht, sich hebender
  Deckel, Funken), den der Bucheinstieg selbst noch braucht (siehe 2.2).

---

## 5. Offene Punkte aus der vorherigen Konzeptphase (unverändert, zur Erinnerung)

- Restliche ~30 Buchseiten (`bilder/25_3.jpg` bis `26_32.jpg`, `17-49-48*.jpg`)
  sind noch nicht transkribiert/geordnet — nur relevant für eine spätere
  Vollversion, nicht für diese Überarbeitung.
- Kauf-URL für das Buch ist ein Platzhalter (`BookReader.astro`, Kommentar bei
  `endBookCta`), noch offen.
- Alle Bilder ab `25_4.jpg` tragen ein sichtbares „AI-Generated"-Wasserzeichen
  und müssten für den Druck neu exportiert werden — betrifft nicht die
  Web-Umsetzung.
- Tippfehler im Originaltext der Bilder (z. B. „Què", „silenclo") sind bekannt
  und bleiben unangetastet, da der Text im Bild eingebrannt ist.

---

## 6. Vorschlag für den Einstieg in die Überarbeitung

1. Erst **Punkt 3 (Verschmelzung)** konzeptionell klären, bevor an den vier
   Einzelsymptomen gearbeitet wird — sonst repariert man vier Symptome eines
   strukturellen Problems einzeln und landet wieder bei getrennten Bausteinen.
2. Ein Blick auf `Pistacho.astro` (`.crack-btn`) und `Abejas.astro`
   (`.game-bee`/`.game-flower`) lohnt sich als Vorbild: beides sind Stellen im
   *bestehenden* Projekt, an denen Spiel/Interaktion bereits direkt in der
   Illustration passiert statt in einer separaten Box darunter — genau die
   Machart, die dem Buch fehlt.
3. Bei Bedarf Rücksprache mit dem Auftraggeber, ob „mehr Dynamik am Start"
   Ton-Ideen einschließt (z. B. ein leiser Zumm-Sound beim Öffnen) oder rein
   visuell gemeint ist — dazu gab es keine explizite Aussage.

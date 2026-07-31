# Plan — Eingangsanimation und Seitenübergang

**Stand: 31. Juli 2026. Beide sind gebaut.** Was gegenüber diesem Plan
anders gemacht wurde, steht in Abschnitt 4 am Ende — der Plan selbst ist
unverändert stehen geblieben, damit die Abweichungen nachvollziehbar sind.

1. **Apertura** — ein Auftritt von rund 2,6 s, bevor man die Startseite sieht.
2. **Travesía** — der Übergang von der Startseite ins Buch (`/libro`) und zurück.

Beide sollen sich an die bestehende Bewegungssprache halten, nicht daneben
stehen: Aquarell und Tusche, Meli als Figur, die gepunktete Fluglinie
(`stroke-dasharray: 1.6 7`, `--miel-700`) als wiederkehrendes Motiv, die
Marke als goldener Ring.

---

## 0. Was schon da ist — darauf wird aufgebaut

| Vorhandenes | Wo | Rolle im Plan |
|---|---|---|
| Bewegungstoken `--dur-1/2/3`, `--ease-out`, `--ease-in-out`, `--ease-bounce` | `src/styles/tokens.css:110–115` | Grundwortschatz, wird ergänzt, nicht ersetzt |
| Papierfarben `--papel #fbf6ec`, `--papel-warm #f7efdd` | `tokens.css:47–48` | die Farbe, in der beide Animationen liegen |
| `data-reveal`-Aufbau | `src/scripts/scroll-story.ts`, 14 Komponenten | die Apertura **übergibt** daran, ersetzt es nicht |
| Hero mit Biene auf gepunkteter Bahn | `src/components/Hero.astro:87–96` | Zielbild der Apertura |
| Buch-Einstieg, zeilenweise (`--l: 0…5`) | `BookPage.astro:479–493` | die Travesía **landet** darin |
| Bildmarke, viewBox 200×200, um (100,100) zentriert | `src/components/Logo.astro` | Hauptdarsteller der Apertura |
| Meli als Figur | `src/components/BeeMeli.astro` | Hauptdarstellerin der Travesía |
| Buch-Links | `.nav-libro` (Desktop), `.is-libro` (Mobilmenü) in `Nav.astro` | Auslöser der Travesía |

Noch **nicht** da: View Transitions (`ClientRouter` wird nirgends benutzt),
`prefetch` (in `astro.config.mjs` nicht eingeschaltet).

---

## 1 · Apertura — der Auftritt der Startseite

### Bild

Die Marke zeichnet sich selbst und wächst dann zur Landschaft auf. Vier
Phasen, zusammen 2,6 s:

| Phase | Zeit | Was passiert |
|---|---|---|
| **0 · Papier** | 0 – 0,15 s | Bildfüllend `--papel`. Kein Weißblitz, kein schwarzer Rahmen: dieselbe Farbe, auf der der Hero ohnehin liegt. |
| **1 · Der Ring schreibt sich** | 0,15 – 1,0 s | Der offene Goldring der Marke zieht sich in einem Zug, `stroke-dashoffset` von voller Pfadlänge auf 0, `--ease-in-out`. Ein Pinselstrich, kein Ladebalken. |
| **2 · Die Chacra wächst hinein** | 1,0 – 1,8 s | Die Zeichen der Marke setzen sich in der Reihenfolge, in der die Chacra wächst: Lavendel steigt von unten in die Ringlücke, Olivenzweig klappt auf, Blüte und Stock setzen sich unten ab, zuletzt kommt die Biene oben an — auf einer kurzen gepunkteten Bahn eingeflogen, derselbe Strich wie im Hero. Versatz je 80 ms, `--ease-out`; nur die Biene bekommt `--ease-bounce`, das ist Melis Token. |
| **3 · Der Ring öffnet sich** | 1,8 – 2,6 s | Der Ring wächst über den Bildrand hinaus. Technisch: `clip-path: circle()` auf der Auflage, Mittelpunkt = Ringmitte, Radius von Ringgröße auf `150vmax`. Darunter liegt der fertige Hero und kommt zum Vorschein. Die Marke selbst fliegt gleichzeitig auf ihren Platz in der Kopfleiste (oben links, 34 px) — damit ist erklärt, wo das Logo wohnt. |

Danach übernimmt der bestehende `data-reveal`-Aufbau des Hero und die
Hero-Biene startet ihre Bahn. Die Apertura ersetzt den Einstieg nicht, sie
reicht ihn weiter.

### Regeln, ohne die das nicht gebaut werden darf

- **Höchstens einmal pro Sitzung.** `sessionStorage`-Merker. Wer aus dem
  Buch zurückkommt, darf nicht wieder 2,6 s warten — sonst wird die
  Travesía (unten) unerträglich.
  *Empfehlung darüber hinaus:* über `localStorage` nur beim **ersten**
  Besuch überhaupt. Ein Auftritt, der sich bei jedem Besuch wiederholt,
  wird vom dritten Mal an als Sperre erlebt. Das ist eine
  Geschmacksentscheidung — bitte bewusst treffen.
- **Nie eine Sperre.** Die Auflage steht schon im HTML und ihr CSS liegt
  inline im `<head>`, damit sie vor dem ersten Bild da ist. Fällt das
  Skript aus, räumt eine reine CSS-Animation sie nach 3 s ab
  (`forwards` + `pointer-events: none`). Die Seite darunter ist die ganze
  Zeit vollständig und bedienbar, nur verdeckt.
- **Abbrechbar.** Klick, Taste, Rad oder Scrollen springt ans Ende — als
  Vorspulen über 250 ms, nicht als harter Schnitt. Ein leiser
  „Saltar / Skip"-Knopf erscheint nach 800 ms; ein echter `<button>`,
  fokussierbar.
- **`prefers-reduced-motion`: ruhige Fassung, nicht Stille.** Marke steht
  fertig auf dem Papier, blendet in 400 ms zum Hero über. Kein Schreibzug,
  kein Aufziehen, keine fliegende Biene. Zusammen rund 0,6 s.
- **Zugänglichkeit.** Auflage `aria-hidden="true"`, Inhalt darunter
  solange `inert`. Der Fokus bleibt, wo er ist. Nach dem Ende wird die
  Auflage aus dem DOM entfernt, nicht nur unsichtbar gemacht.
- **Nur `opacity`, `translate`/`scale`, `clip-path`, `stroke-dashoffset`.**
  **Kein `filter` in irgendeinem Keyframe** — eine Animation mit
  `fill-mode: both`, die `filter` setzt, gewinnt dauerhaft gegen normale
  Deklarationen und hat in diesem Projekt schon einmal die Bildfilter der
  Spiele ausgehebelt (Bienensicht, verblassende Welt). Steht so in
  `HANDOFF.md` Abschnitt 4.

### Der ehrliche Preis

Die Auflage verdeckt die `h1` des Hero — und die ist das LCP-Element. Bei
jedem Besucher, der die Animation sieht, verschiebt sich LCP um bis zu
2,6 s. Für eine Seite, die auch ein Betrieb ist, ist das kein Nebenaspekt.
Gegenmaßnahmen: den Hero darunter **gerendert lassen** (nicht
`display: none`), und die Animation auf den Erstbesuch beschränken. Damit
zahlt den Preis nur, wer ihn einmal zahlt.

### Dateien

- **neu** `src/components/Apertura.astro` — Markup, Stil und ein kleines
  Modul-Skript in einer Datei. *Nicht* `Intro.astro` nennen, die gibt es
  schon (Abschnitt „Historia").
- **berührt** `src/layouts/Base.astro` — einmal einbinden, nur auf der
  Startseite.
- **berührt** `src/styles/tokens.css` — ein Token `--dur-apertura: 2600ms`.

Kein GSAP nötig, obwohl es als Abhängigkeit da liegt: CSS-Keyframes plus
ein kleines Skript für Sitzungsmerker und Abbruch reichen und passen zum
Rest der Seite, der ebenfalls CSS-getrieben ist.

---

## 2 · Travesía — von der Startseite ins Buch

### Bild

**Meli fliegt voraus und nimmt dich mit.** Das Buch hat mit `.entrada`
bereits einen eigenen Auftritt; der Übergang muss dort **landen**, nicht
davor noch eine zweite Tür aufmachen.

*Hinweg, rund 700 ms:*

1. Klick auf „El libro". Vom Link aus zeichnet sich die gepunktete Bahn
   quer über den Schirm nach unten rechts — derselbe Strich wie im Hero
   (`1.6 7`, `--miel-700`), 300 ms `stroke-dashoffset`.
2. Meli fliegt sie ab: `offset-path` auf genau diesem Pfad, 500 ms,
   `--ease-in-out`. Sie führt, die Seite folgt.
3. Hinter ihr hebt sich die Startseite leicht und geht aus
   (`opacity 1→0`, `translate 0 -8px`, 400 ms), und das warme Papier des
   Buches wischt aus der Richtung ein, aus der sie kam — `clip-path`
   entlang ihrer Bahn. Die Farbe wird **von ihr hereingetragen**.
4. Am Ende steht der Schirm im Papierton des Buches, Meli sitzt genau
   dort, wo die Meli des Buch-Einstiegs (`.entrada-meli`) sitzt. Erst
   dann wird navigiert.

*Ankunft auf `/libro`, rund 500 ms:*

5. `/libro` öffnet auf demselben Papierton, Meli an derselben Stelle — die
   ankommende Auflage ist bildgleich mit dem Endbild der abgehenden. Genau
   das macht die Naht unsichtbar.
6. Das Papier der Auflage löst sich auf; der bestehende `.entrada-l`-Aufbau
   läuft wie heute, nur mit einem `animation-delay`, das um die Dauer der
   Auflage versetzt ist.
7. Meli blendet in die echte Biene von `.entrada-meli` über.

*Rückweg (Buch → Startseite), rund 450 ms:* dasselbe gespiegelt, aber
kürzer und **ohne** gezeichnete Linie. Ein Rückweg darf nicht so feierlich
sein wie der Hinweg. Und er darf die Apertura nicht neu auslösen — dafür
sorgt der Sitzungsmerker aus Teil 1.

### Mechanik — zwei Wege, eine Empfehlung

**Option A · eigener Übergang, ohne Router. → Empfohlen.**
Klick abfangen, abgehende Animation spielen, dann `location.href`. Auf
`/libro` spielt die ankommende Auflage vor dem Einstieg. Kein SPA-Router,
kein anderes Verhalten auf allen übrigen Seiten, **kein Risiko für die
acht Spiele**. Preis: zwischen den Hälften liegt eine Netzwerklücke.
Dagegen `prefetch` auf dem Buch-Link (in `astro.config.mjs` einschalten,
`data-astro-prefetch` am Link) — dann liegt die Seite meist schon im Cache
und die Lücke ist nicht zu sehen.

**Option B · `ClientRouter` und `transition:name`.**
Echter Morph, Papier und Marke könnten über die Navigation hinweg stehen
bleiben. Schöner und wirklich lückenlos. Preis: die ganze Seite wird
client-geroutet; alle Skripte des Buches müssten mehrfach-aufrufbar
gemacht und an `astro:page-load` neu gebunden werden — `voz.ts`,
`juego.ts` und acht Spiele. Das ist die Sorte Arbeit, die still bricht.

**Empfehlung: A jetzt, B als spätere Ausbaustufe** — und B erst, wenn die
Spiele ohnehin einmal angefasst werden.

### Regeln

- **Nie den Nutzer festhalten.** Ist die Zielseite nach 900 ms noch nicht
  da, wird trotzdem navigiert. Die Animation ist Beiwerk, nicht Bedingung.
- **Ctrl/Cmd/Shift/Mittelklick durchlassen.** `e.metaKey || e.ctrlKey ||
  e.shiftKey || e.button !== 0` → kein Abfangen. „In neuem Tab öffnen"
  muss funktionieren.
- **Zurück-Taste.** Auf `pageshow` mit `event.persisted` (bfcache) jede
  übrig gebliebene Auflage entfernen. Sonst landet man beim Zurückgehen
  auf einem honigfarbenen leeren Schirm. Das ist der klassische Fehler
  dieser Bauart und der Grund, warum er hier ausdrücklich steht.
- **`prefers-reduced-motion`:** 200 ms Überblendung im Papierton, keine
  fliegende Biene, keine gezeichnete Linie.
- **Kein `filter` in den Keyframes**, aus demselben Grund wie oben.

### Dateien

- **neu** `src/components/Travesia.astro` — die Auflage, auf beiden Seiten
  eingebunden (abgehend und ankommend ist dieselbe Auflage in zwei
  Richtungen).
- **neu** `src/scripts/travesia.ts` — Klickabfang, Richtung, bfcache.
- **berührt** `src/layouts/Base.astro` — einbinden.
- **berührt** `src/components/libro/BookPage.astro` — `animation-delay`
  der `.entrada-l` um die Dauer der Auflage versetzen.
- **berührt** `astro.config.mjs` — `prefetch` einschalten.
- **nicht berührt** `Nav.astro` — das Skript greift die vorhandenen
  Klassen `.nav-libro` und `.is-libro` ab, dort muss nichts geändert
  werden.

---

## 3 · Aufteilung, wenn das gebaut wird

Getrennte Dateien, damit sich nichts überschreibt — dieselbe Regel wie in
`HANDOFF.md` Abschnitt 4.

| Rolle | Auftrag | Dateien | Modell |
|---|---|---|---|
| **Apertura** | Teil 1 | `Apertura.astro`, `tokens.css`, `Base.astro` (Einbindung) | Opus — offene Gestaltungsarbeit, viel Urteil |
| **Travesía** | Teil 2 | `Travesia.astro`, `travesia.ts`, `BookPage.astro`, `astro.config.mjs` | Opus — die Naht zwischen zwei Seiten ist der schwierige Teil |

Beide berühren `Base.astro`. Entweder nacheinander laufen lassen, oder die
zwei Einbindungszeilen vorher von Hand setzen und den Agents die Datei
sperren. Zweiteres ist sicherer.

**Abnahme:** Die Screenshot-Strecke aus dieser Sitzung
(`scratchpad/shot.mjs`, `playwright-core` gegen den installierten Chrome)
kann Zwischenbilder zu festen Zeitpunkten aufnehmen — damit sind beide
Animationen wirklich prüfbar und nicht nur gerechnet. Für eine Animation
ist das der einzige ehrliche Weg: mehrere Bilder über die Laufzeit
(z. B. bei 0,3 / 1,0 / 1,8 / 2,4 / 2,8 s) und ansehen.

**Am Ende:** `npx astro build` muss fehlerfrei durchlaufen (5 Seiten).

---

## 4 · Was beim Bauen anders wurde

Sechs Abweichungen, jede mit Grund. Vier davon kamen erst heraus, weil die
Zwischenbilder wirklich angesehen wurden — gerechnet hätte man sie nicht
gefunden.

- **Apertura, Phase 3: kein aufziehender `clip-path`-Kreis.** Stattdessen
  fliegt die Marke per FLIP auf ihren gemessenen Platz in der Kopfleiste,
  während das Papier abblendet. Der Kreis hätte dasselbe gesagt, aber die
  Übergabe an das echte Logo ist der Teil, der die Bewegung begründet —
  und sie ist robuster, weil sie nur zwei Werte braucht statt einer
  Maskengeometrie.
- **Die gepunkteten Bahnen zeichnen sich nicht, sie blenden ein.** Eine
  Punktreihe lässt sich über `stroke-dashoffset` nicht aufdecken, das
  verschöbe nur die Punkte. Der saubere Weg wäre ein zweiter, breiter Pfad
  in einem `<mask>`; bei 300–400 ms Laufzeit ist der Unterschied das nicht
  wert.
- **`pathLength="1"` gehört nur an den Ring.** Am gepunkteten Pfad normiert
  es die Länge auf 1 und macht aus `stroke-dasharray: 1.6 7` einen einzigen
  Riesenstrich. Genau das war im ersten Wurf beider Animationen falsch und
  auf den Bildern sofort zu sehen.
- **Überblendungen laufen `linear`, Aufziehendes `--ease-in-out`.** Die
  Projektkurve `--ease-out` ist so steil, dass sie nach der halben Laufzeit
  bei rund 94 % steht: gemessen war das Papier der Ankunft nach 250 von
  480 ms schon bei 19 % Deckkraft, und der Blühkreis deckte nach 450 von
  640 ms alles zu. `--ease-out` ist richtig für Dinge, die ankommen, aber
  falsch für Dinge, die vergehen.
- **Der Blühradius wird gerechnet, nicht geschätzt.** `--tr-r` ist der
  Abstand vom Landepunkt zur entferntesten Fensterecke. Ein pauschales
  `150vmax` war so groß, dass die Blüte nach 40 % der Laufzeit vorbei war.
- **Die ruhige Fassung ist länger geworden, nicht kürzer** (rund 0,95 s
  statt 0,65 s). Bei 250 ms Standzeit war die Marke ein Aufblitzen — für
  jemanden, der wenig Bewegung will, unruhiger als gar keine Auflage.

**Nicht gebaut:** die `localStorage`-Fassung. Die Apertura läuft derzeit
**einmal je Sitzung** (`sessionStorage`, Schlüssel `re:apertura`). Der
Umstieg auf „nur beim allerersten Besuch" ist ein Wort an zwei Stellen in
`Apertura.astro` und dort kommentiert.

**Prüfstand:** Die Bilder entstanden mit `scratchpad/shot.mjs` gegen den
gebauten Stand (`astro preview`). Der Kniff, ohne den Animationen nicht
prüfbar sind: `document.getAnimations()` anhalten und alle auf dieselbe
`currentTime` setzen — dann ist ein Bild bei 1,4 s reproduzierbar. Bei
klickausgelösten Übergängen muss zusätzlich der Navigations-Zeitgeber
stillgelegt werden, sonst navigiert die Seite mitten in die Aufnahme; das
sieht wie ein hängender Browser aus und ist keiner.

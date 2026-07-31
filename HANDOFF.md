# Handoff — Stand und offene Arbeit

**Stand: 30. Juli 2026.** Diese Datei ist der aktuelle Einstiegspunkt.
`HANDOFF-LIBRO.md` beschreibt einen überholten Zustand (vor dem Umbau auf
zwei Takte) und ist nur noch historisch interessant. Die Konzeption steht in
`KONZEPT-LIBRO.md`, der neue Aufbau dort in **Abschnitt 9**.

**Der Build läuft fehlerfrei** (`npx astro build`, 5 Seiten). Nichts ist
kaputt — die offenen Punkte unten sind Abnahme und Restarbeit, kein Notfall.

---

## 1. Warum es diese Datei gibt

Vier Agents haben parallel gearbeitet. Einer wurde fertig, zwei wurden
inhaltlich fertig und starben beim Verifizieren, einer kam gar nicht los —
alle drei Abbrüche wegen **„You've hit your monthly spend limit"**, nicht
wegen eines fachlichen Problems.

| Agent | Zuständig | Status |
|---|---|---|
| Technik | Fluglinie, Bienenflug, Überlagerung | **fertig und belegt** |
| UX | „Armá tu cuerpo de abeja" aus Meli zerlegen | **inhaltlich fertig, unverifiziert** |
| Design | Kopfbereich `/libro`, Angleichung an die Startseite | **inhaltlich fertig, unverifiziert** |
| Marke | Logo, Favicon, Navigation | **abgebrochen — danach von Hand nachgeholt** |

---

## 2. Was seit der letzten Abnahme gemacht wurde

### Fluglinie und Bienenflug (`BookReader.astro`, `.vuelo*` in `libro.css`)

Drei Fehler, alle behoben:

- **Linie zu dick und anders als auf der Startseite.** Ursache: `viewBox`
  100×100 mit `preserveAspectRatio="none"` in einer Box von ~480×127 px →
  Skalierung 4,80 zu 1,20. Dieselbe Linie war an senkrechten Stellen 11,5 px
  und an waagerechten 2,9 px dick, die Punkte wurden zu Strichen gezogen.
  Jetzt viewBox 84×260 mit passendem `aspect-ratio`, kein `none` mehr, dazu
  `vector-effect="non-scaling-stroke"`. Ton exakt wie `Abejas.astro`:
  `stroke-width: 2.2`, `stroke-dasharray: 1.6 7`, `--miel-700`.
- **Biene flog nur seitwärts.** Zwei Ursachen: die waagerechte Position wurde
  mit der Breite der `.vuelo`-Box gerechnet (bis 1184 px), die gezeichnete
  Linie war aber nur 480 px breit — Meli flog messbar **neben** ihrer Linie
  (±130 px Ausschlag auf ±53 px Bahn). Zusätzlich war die Kurve flach
  (0,44 : 1). Jetzt rechnet das Skript im Rechteck des SVG, die Kurve ist
  schmal und hoch: **5,00 : 1** abwärts zu seitwärts, y streng monoton.
- **Linie überlagerte Text und Spiele.** `.vuelo` hatte `z-index: 93`, die
  Takte keinen. Jetzt liegt `.vuelo-senda` auf `z-index: -1` innerhalb des
  Stapelkontexts von `.columna` — also hinter allem Inhalt, aber vor dem
  Papier. Meli bleibt auf `z-index: 2` sichtbar, unter Wissenslichtern (3),
  Lupe (4) und Spielen (30).

**Konstruktiv abgesichert:** Die Bézier-Kontrollpunkte stehen nur noch
**einmal** im Frontmatter von `BookReader.astro` (`vueloSegs`). Daraus wird
sowohl das `d` des Pfades als auch — über `data-vuelo-curva` — die
Auswertung im Skript gespeist. Doppelte Pflege ist nicht mehr möglich.
Stellknopf für den Abstand zwischen den Takten: `--vuelo-alto` in
`libro.css` (aktuell 210–320 px); `aspect-ratio` und viewBox dabei **nicht**
anfassen, sonst verzerrt sich die Strichstärke wieder.

### „Armá tu cuerpo de abeja" (`juegos/Transformacion.astro`)

Vorher wurde eine frontal gesehene Biene gebaut, während die Erzählerfigur
der Website im Profil blickt — zwei verschiedene Bienen im selben Buch.
Jetzt entsteht **Meli selbst**: Formen, Farben und Tuschekonturen stammen
aus `BeeMeli.astro`, das Profil bleibt erhalten, die vier Wachstumsschritte
setzen ihre Teile an. Die Halte-Mechanik ist unverändert.

### Kopfbereich `/libro` (`BookPage.astro`)

Die Leiste ist jetzt dreiteilig (Marke — Buchtitel — Sprache) und übernimmt
Höhe, Polsterung, Papierfarbe, Unschärfe und Schattenkante 1:1 aus
`.site-nav`, damit der Wechsel von der Startseite keinen Sprung macht. Der
Rückweg zur Chacra hängt an der Marke statt an einem eigenen lauten Knopf.
Der Einstieg wurde auf **einen** Auftritt zusammengezogen; danach leben nur
noch drei Dinge weiter (Flügelschlag, Funken, die Biene am unteren Rand).

### Marke (von Hand, nachdem der Agent ausfiel)

- `src/components/Logo.astro` — Bildmarke nach der Logovorlage, **ohne
  Wortmarke**: offener Goldring, Lavendelrispen links, Biene oben,
  Olivenzweig mit zwei Bernsteinblättern rechts, runde Blüte und
  Bienenstock mit Flugloch unten. Props: `width`, `simple` (nur Ring, Stock,
  Biene — für kleine Größen), `decorative`.
- `public/favicon.svg` — die reduzierte Fassung mit kräftigeren Strichen,
  bewusst ohne CSS-Variablen (Favicons erben keine Seiten-Styles).
- `Nav.astro` — die alte kleine Biene im Header ist durch
  `<Logo width="34px" decorative />` ersetzt.
- **Buch-Link im Desktop-Menü** wandert von der Ankerliste nach rechts zu
  den Aktionen, getrennt durch einen feinen Strich, mit Buchzeichen und
  ohne Pillenform. Er war vorher hinten an die Sektionen geklebt und wirkte
  wie ein Fremdkörper. Ab 860 px sichtbar, darunter übernimmt das
  Mobilmenü. Kontrast 5,26:1.

### Vorlesen

`src/scripts/voz.ts` spielt vorbereitete MP3s Satz für Satz ab und markiert
das gesprochene Wort im Buchtext mit. Fehlen die Aufnahmen, springt die
Browserstimme ein (mit Satzzerlegung und eigener Prosodie je Satzart).
Erzeugt werden die Dateien mit `scripts/generar-voz.mjs`.

---

## 3. Offene Arbeit

### A · Optische Abnahme (blockiert alles andere)

**Nichts davon ist je gesehen worden.** In der Arbeitsumgebung rendert die
Browser-Ansicht keine Frames — `requestAnimationFrame`, CSS-Animationen und
`IntersectionObserver` stehen still, Screenshots schlagen fehl. Alles oben
ist über DOM-Messungen und Rechnung belegt, nicht visuell.

Bitte zuerst selbst durchsehen, auf `/es/libro`:

1. Die Fluglinie zwischen den Takten — Stärke, Punktabstand, Farbe im
   Vergleich zur Startseite.
2. Melis Flug daran — fliegt sie erkennbar **hinunter** und **auf** der
   Linie?
3. Ob noch irgendwo Inhalt in die Naht ragt, besonders auf einem kurzen
   Fenster (unter 700 px Höhe).
4. Das Spiel auf Seite 5 — ist die Biene als Meli erkennbar?
5. Den Kopfbereich auf 390 px und auf 1280 px.
6. Das Logo im Header und das Favicon im Tab.

### B · Das Logo gegen die Vorlage prüfen

`Logo.astro` ist ein **Nachbau nach Augenschein**, keine Konvertierung der
Originaldatei — die lag nur als Bild im Chat vor. Proportionen, Abstände und
Farbtöne sollten gegen das Original geprüft werden. **Falls eine Vektordatei
des Logos existiert (AI, SVG, EPS), ist sie diesem Nachbau vorzuziehen** —
dann nur den Schriftzug entfernen und die Pfade übernehmen.

Ebenfalls offen: ein `apple-touch-icon`. Das braucht PNG, das aus dieser
Umgebung heraus nicht erzeugt werden konnte.

### C · Überlauf der Spielszenen

Ursache: `.acto { min-height: 100svh; align-content: center }` in
`libro.css` (etwa Zeile 124). Ist der Inhalt höher als der Bildschirm, läuft
er oben **und** unten aus der Box. Betroffen sind auf 390×844 zwei Szenen mit
je rund 4 % Überstand. Die Fluglinie kann dadurch nichts mehr kaputtmachen,
aber sauber ist es nicht. Zu prüfen wäre `align-content: safe center` oder
ein Wechsel auf `min-height: auto` bei zu hohem Inhalt.

### D · Die echte Vorlesestimme

Der einzige Punkt, der **von dir** abhängt:

```bash
npm run voz -- --dry
```

zeigt, was erzeugt würde — **40 Sätze, 1761 Zeichen**, das passt in jedes
Gratiskontingent. Für die echten Dateien eine `.env` im Projektwurzel-
verzeichnis anlegen (steht in `.gitignore`):

```
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

Stimme in der Voice Library aussuchen: spanisch, weiblich, warm, ruhig —
„Rioplatense" oder „Latin American" passt zum Buch. Dann `npm run voz`.
Solange die Dateien fehlen, läuft die Browserstimme weiter; es ist also
nichts kaputt, es klingt nur schlechter.

### E · Detector nachziehen

Der Design-Detector wurde für `BookPage.astro` nie zu Ende gelaufen:

```bash
node .claude/skills/impeccable/scripts/detect.mjs --json src/components/libro/BookPage.astro src/components/Nav.astro src/components/Logo.astro
```

Treffer vom Typ `bounce-easing` sind **akzeptiert** — `--ease-bounce` ist ein
bewusster Projekt-Token („/* Meli */" in `tokens.css`) und die etablierte
Bewegungssprache der Biene. Alles andere gehört behoben.

---

## 4. Auftrag für den neuen Chat

Sinnvolle Rollenverteilung, mit getrennten Dateien, damit sich Agents nicht
überschreiben:

| Rolle | Auftrag | Dateien |
|---|---|---|
| **Abnahme/QA** | Punkt A durchgehen, Fehler dokumentieren statt selbst zu fixen | keine (nur lesen) |
| **Layout** | Punkt C, Überlauf der Takte | `src/styles/libro.css` |
| **Marke** | Punkt B, Logo gegen Vorlage schärfen, `apple-touch-icon` | `src/components/Logo.astro`, `public/*` |
| **Design** | Punkt E und was die Abnahme meldet | je nach Befund |

**Wichtig für jeden Agent:**

- Dateien vorher aufteilen. `libro.css` und `BookReader.astro` werden von
  mehreren Themen berührt — immer nur ein Agent pro Datei.
- `npx astro build` muss am Ende fehlerfrei durchlaufen.
- Kein Regex mit Lookbehind — bricht auf älterem iOS Safari das gesamte
  gebündelte Skript, samt aller Spiele.
- Keine CSS-Animation mit `fill-mode: both`, die `filter` setzt: sie
  gewinnt dauerhaft gegen normale Deklarationen und hebelt die Bildfilter
  der Spiele aus (Bienensicht, verblassende Welt). Das ist hier schon
  einmal passiert.
- Honig als **Textfarbe** ist `--miel-800` (#8f5c14). `--miel-700` erreicht
  auf warmem Papier nur 3,5:1 und ist für Schrift zu hell.
- Die Bildsprache ist **Aquarell und Tusche**, kein flaches Cartoon-SVG.
  Filter dafür: `url(#wc-wash)`, `url(#wc-soft)`, `url(#wc-rough)`,
  `url(#ink)` aus `WatercolorDefs.astro`. Das Logo ist die bewusste
  Ausnahme — flache Vektorform, weil es bei 16 px stehen muss.
- `prefers-reduced-motion` braucht eine ruhige Fassung, nicht nur
  abgeschaltete Animation.

---

## 5. Wo was liegt

```
src/data/libro.ts              Seiten, Wissenskarten, alle UI-Texte (ES/EN)
src/data/narracion.json        Vorlesetexte — Quelle für Website UND Generator
src/scripts/voz.ts             Vorlesen: Aufnahmen, sonst Browserstimme
src/scripts/juego.ts           Gemeinsames für die Spiele (Logros, Ton, Meli)
src/styles/libro.css           Die ganze Buchwelt
src/components/Logo.astro      Bildmarke ohne Wortmarke
src/components/libro/
  BookPage.astro               Kopfleiste + Einstieg
  BookReader.astro             Die Takte, Abstieg, Fluglinie, Sammelheft
  Juego.astro                  Verteiler für die Spiele
  juegos/*.astro               Die acht Mitmach-Momente
scripts/generar-voz.mjs        Erzeugt die MP3s (braucht .env)
```

Noch offen aus der Konzeptphase, unverändert: die Kauf-URL für das Buch
(eine Stelle in `BookReader.astro`), Druckvorlagen für Lehrkräfte, und die
restlichen rund 30 Buchseiten für eine spätere Vollversion.

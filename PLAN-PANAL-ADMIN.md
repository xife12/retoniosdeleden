# Plan — Adminbereich für Nuestro Panal (Personas)

**Stand: 18. September 2026 (Anpassungen 02). Nur geplant, nicht gebaut** —
wie in PLAN-ANPASSUNGEN-01.md Abschnitt 13 gefordert: erst die vier offenen
Fragen klären, dann erst Code. Dieser Plan beantwortet sie anhand des
tatsächlichen Codes (`src/data/nosotros.ts`, `comprobarPanal()`), nicht aus
dem Bauch.

---

## 1. Was heute da ist, und was fehlt

Die ganze Wabe ist eine **statische Konstante** in `src/data/nosotros.ts`:
`personas: Persona[]` und `celdasLibres`. Es gibt keine Tabelle, keine
`fetch-nosotros.ts`, keinen Adminbereich — anders als Talleres, Casas,
Módulos und On Tour, die alle nach demselben Muster (Tabelle → öffentliche
View → `fetch-*.ts` zur Bauzeit → Admin-Editor) laufen.

`comprobarPanal()` (`nosotros.ts:308`) prüft beim Bauen (Astro-Frontmatter,
`NosotrosPage.astro:81`) zwei Dinge über die feste Reihenfolge des Arrays:

1. Jede Person, außer der ersten, muss mindestens eine der **bereits davor
   gesetzten** Zellen berühren (`sonVecinas()`) — sonst schwebt sie.
2. Keine zwei Zellen liegen auf derselben Koordinate.

Dieselbe Prüfung läuft über `celdasLibres`.

### Die tatsächliche Form, nachgerechnet

Ich habe die Koordinaten aller 13 Zellen durchgerechnet, nicht geschätzt:

| Ring | Zellen | Koordinaten |
|---|---|---|
| Mitte | catalina | (0,0) |
| Ring 1 (voll, alle 6 Nachbarn) | stefan, alba, florian, maxi, jasmin, nietos | (1,-1) (0,-1) (1,0) (0,1) (-1,1) (-1,0) |
| Ring 2 (nur 6 von 12 möglichen Zellen) | vecinos, voluntarios, escuelas + 3 `celdasLibres` | (2,-1) (0,-2) (-1,2) + (-2,1) (1,1) (-1,-1) |

Die sechs benutzten Ring-2-Zellen sind **keine** einheitliche Formel —
manche liegen genau doppelt so weit wie ein Ring-1-Nachbar (voluntarios =
2×Albas Richtung), andere in der Ecke zwischen zwei Ring-1-Nachbarn
(vecinos = Summe von Stefans und Albas Richtung). Das ist eine von Hand
gestaltete Blüte, keine generierte Form. **Das ist wichtig für Frage 1**:
ein generischer Algorithmus, der diese 13 Zellen aus dem Nichts neu
berechnen würde, träfe diese Form nicht. Deshalb bleibt die Gründungsblüte
unangetastet (siehe unten) und nur das *Wachsen darüber hinaus* wird
automatisiert.

---

## 2. Grundentscheidung: die Gründungsblüte bleibt fest

Die 13 heutigen Zellen (7 Kern + 6 Ring-2, davon 3 belegt/3 frei) werden
**nicht** aus einem Algorithmus neu erzeugt. Sie ziehen als Startdaten in
die neue Tabelle ein — mit genau ihren heutigen `q`/`r` — und sind damit
Vergangenheit, nicht Regel. Die Admin-Oberfläche darf ihre **Texte,
Pigment und Verknüpfungsart** ändern, aber Koordinaten bleiben unangetastet
für alles, was schon Teil der Blüte ist.

Was wächst, ist alles **danach** — neue HelferInnen, neue Gruppen. Genau
dafür ist der Bereich gedacht ("el panal sigue creciendo").

---

## 3. Die vier Fragen

### Frage 1 — Wer vergibt die Koordinaten?

**Automatisch, nach einer festen Spiralreihenfolge, beim Veröffentlichen —
nie von Hand.**

- Für jede neue Person/Gruppe berechnet eine SQL-Funktion (Vorbild:
  `publish_modulo()`) beim ersten Veröffentlichen die nächste freie
  Zelle: die kanonische Sechseck-Spirale um den Mittelpunkt (Ring für
  Ring, feste Rotationsreihenfolge), übersprungen werden bereits belegte
  Zellen, genommen wird die erste, die **an eine bereits belegte oder
  reservierte Zelle grenzt**. Jede Zelle einer Sechseck-Spirale grenzt per
  Definition an die vorige Ringzelle — die Berührung ist also automatisch
  erfüllt, nicht zusätzlich zu prüfen.
- Einmal vergeben, ändert sich `q`/`r` nicht mehr — auch nicht, wenn die
  Erzählreihenfolge (`sort_order`, per Ziehen wie überall sonst) später
  umsortiert wird. Reihenfolge und Ort trennen sich damit bewusst: die
  Geschichte lässt sich neu erzählen, ohne die gebaute Form zu verschieben.
  (`comprobarPanal()` prüft am Ende trotzdem die Reihenfolge — dazu Frage 3.)
- Die Admin-Oberfläche zeigt `q`/`r` **nirgends als Eingabefeld**. Wer eine
  Person anlegt, sieht höchstens eine kleine Vorschauzelle, die zeigt, wo
  sie landen würde.
- Kern (`nucleo`) und Umflug (`vuelo`) teilen sich einen Zellenvorrat.
  Ein neuer Kern-Eintrag ist der seltene, bewusste Fall (die Familie
  wächst nicht oft) und bekommt dieselbe Spiralregel — die Blüte würde
  dann nicht mehr "leer in der Mitte, ausgemalt im Kern" aussehen, wenn
  Ring 2 schon teilweise belegt ist. Das ist eine bewusste Grenze, keine
  Lücke: **ein neuer `nucleo`-Eintrag, sobald Ring 1 voll ist (er ist es
  bereits), verlangt eine kurze Rücksprache**, bevor er veröffentlicht
  wird — die Oberfläche kann das als Hinweis zeigen, nicht als Sperre.

### Frage 2 — Was passiert beim Löschen einer Zelle?

**Löschen heißt „leere Zelle", nie ein echtes Entfernen aus der Mitte der
Form** — genau der Vorschlag aus Abschnitt 13, jetzt mit einer Regel, wann
die Ausnahme gilt:

- Der Normalfall (jede Zelle, die noch mindestens eine Nachbarzelle hat,
  die NUR über sie mit dem Rest verbunden ist — ein Schnittpunkt im
  Berührungsgraphen): die Zeile bekommt `estado = 'libre'` statt gelöscht
  zu werden. Sie behält ihre Koordinate, verliert Namen/Rolle/Text und
  erscheint fortan wie die heutigen `celdasLibres` — gestrichelt, leer,
  eine Aussage statt eine Lücke.
- Die Ausnahme — **wirklich entfernen** — gilt nur für eine Zelle, die
  **kein anderer Zelle als einziger Nachbar dient**, d. h. ihr Wegfall
  reißt die Form nirgends auf (ein „Blatt" im Berührungsgraphen, meist die
  zuletzt hinzugekommene). Das prüft dieselbe Nachbarschaftsrechnung wie
  `comprobarPanal()`, nur umgekehrt: „bleibt der Rest zusammenhängend,
  wenn ich diese eine Zelle herausnehme?"
- Praktisch für die Oberfläche: der Löschen-Knopf fragt nie nach einer
  Entscheidung. Er prüft die Blatt-Bedingung selbst und sagt entweder
  „wird eine leere Zelle" oder „wird ganz entfernt" — die Person muss das
  nicht wissen, nur bestätigen.

### Frage 3 — Wie kommt die Prüfung in die Datenbank?

**Gar nicht in die Datenbank — sie bleibt genau da, wo sie ist:
`comprobarPanal()` läuft weiter zur Bauzeit in TypeScript**, nur gegen
Zeilen aus einer neuen `fetch-nosotros.ts` statt gegen die feste Konstante.
Das ist dieselbe Antwort, die B5 aus PLAN-ANPASSUNGEN-01.md für den Rest
der Seite schon gibt: die Website ist statisch, die Datenbank liefert nur
die Rohdaten zur Bauzeit, geprüft wird im Code, der ohnehin schon da ist.

- `fetch-nosotros.ts` liest `personas_public` (nur `status = 'published'`,
  wie `modulos_public`), fällt ohne Zugangsdaten auf `src/data/nosotros.ts`
  zurück (dieselbe Regel wie überall sonst).
- `comprobarPanal()` bekommt die Liste als Parameter statt sie global zu
  importieren — sonst bräuchte sie top-level await, was hier nicht nötig
  ist, weil `NosotrosPage.astro` schon eine `await`-fähige Astro-Komponente
  ist.
- Bricht die Prüfung ab, bricht der Build ab — wie heute, wie bei jedem
  anderen Inhalt dieser Seite. Kein Rückfall auf „kaputt aber sichtbar".
- Weil Koordinaten beim Veröffentlichen fix vergeben werden (Frage 1) und
  sich danach nie mehr ändern, kann diese Prüfung **nur noch durch eine
  falsche Erzählreihenfolge** scheitern (jemand zieht beim Sortieren eine
  Zelle vor ihre einzige Nachbarin) — das ist ein Bedienfehler, den der
  Build zu Recht meldet, kein Zustand, den die Datenbank verhindern müsste.

### Frage 4 — Entwurf/Veröffentlicht

**Ja, dasselbe Modell wie überall** (`status`, `sort_order`,
`published_payload`, `has_unpublished_changes`, `deleted_at`) — mit einer
Ergänzung gegenüber `modulos`:

- `q`/`r` werden **nicht** beim ersten Speichern gesetzt (ein Entwurf hat
  noch keinen Platz in der Wabe), sondern **beim ersten Veröffentlichen**,
  von derselben SQL-Funktion, die auch den Schnappschuss zieht
  (`publish_persona()`, Vorbild `publish_modulo()`). Ein Entwurf ist damit
  ehrlich unsichtbar, nicht eine Zelle, die schon reserviert, aber leer
  ist.
- Weitere Veröffentlichungen derselben Zeile (Textkorrektur) behalten die
  einmal vergebene Koordinate — die Funktion vergibt nur beim allerersten
  Mal eine neue.
- Verwerfen (`discard_persona_changes`) funktioniert wie bei `modulos`:
  Text zurück auf den Schnappschuss, Koordinate unberührt.

---

## 4. Datenmodell (Vorschlag für die Migration)

```
create table public.personas (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,       -- 'catalina', 'vecinos', …
  q                   integer,                     -- NULL bis zum ersten Publish
  r                   integer,
  generation          text not null,               -- 'abuela'|'padres'|'hijos'|'nietos'
  vinculo             text not null,               -- 'nucleo'|'vuelo'
  pigmento            text not null,               -- 'miel'|'barro'|'pistacho'|'lavanda'
  grupo               boolean not null default false,
  translations        jsonb not null default '{}', -- name/role/detail je Sprache
  status, sort_order, published_payload,
  has_unpublished_changes, deleted_at              -- wie modulos/on_tour_seminarios
);
```

`celdasLibres` braucht **keine eigene Tabelle**: eine leere Zelle ist eine
`personas`-Zeile mit `status = 'libre'` (neuer vierter Wert neben
draft/published/archived) und leeren Texten — genau die Umsetzung von
Frage 2. `fetch-nosotros.ts` liest sie zusammen mit den gefüllten Zellen
und die Astro-Komponente unterscheidet wie heute über die Zellen ohne
Person.

---

## 5. Neue Dateien (Umsetzung, wenn freigegeben)

| Datei | Rolle | Vorbild |
|---|---|---|
| `supabase/migrations/009_personas.sql` | Tabelle, Views, `publish_persona()`, `assign_next_cell()` | `006_modulos.sql` |
| `src/lib/fetch-nosotros.ts` | Liest zur Bauzeit, Rückfall auf `data/nosotros.ts` | `fetch-modulos.ts` |
| `src/scripts/admin/personas-store.ts` | Supabase-Zugriff | `store.ts` (erweitert um `assignCell`) |
| `src/scripts/admin/personas-view.ts` | Liste (Wabenvorschau statt Sechseck-Icon) + Editor | `modulos-view.ts` |
| Router/`main.ts`/`index.astro` | `#/personas`-Route, Navknopf | wie beim Anfragebereich |

**Aufwand grob**: Migration + `assign_next_cell()`-Logik 1 Tag, Store +
View 1–1½ Tage, `comprobarPanal()` umstellen + `fetch-nosotros.ts` ½ Tag,
Abnahme ½ Tag — **rund 3 Tage**, ähnlich der Einschätzung für Módulos (D3).

---

## 6. Was diese Planung bewusst offen lässt

1. **Die Rücksprache-Schwelle bei neuem `nucleo`** (Frage 1, letzter
   Punkt) ist ein Hinweistext, keine harte Regel — müsste im Editor
   formuliert werden, sobald es so weit ist.
2. Ob eine `libre`-Zelle im Admin überhaupt als eigene Zeile auftaucht
   oder nur als Nebenprodukt des Löschens entsteht (kein manuelles
   „Zelle als frei anlegen") — Vorschlag: nur als Nebenprodukt, siehe
   Frage 2.
3. Fotos (`photo`-Feld, im Kopfkommentar von `nosotros.ts` schon
   vorgesehen) sind hier nicht mitgeplant — eigenes Thema, eigene Freigabe.

---

**Das ist der Plan. Ich baue nichts davon, bis er bestätigt ist.**

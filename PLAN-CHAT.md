# Plan — Chat-Modul (Phase 7)

**Stand: 25. August 2026.** Planung, noch nicht umgesetzt. Ergänzt
[PLAN-DOCUMENTOS.md](PLAN-DOCUMENTOS.md), dessen Abschnitt 9 diese Phase
bisher nur skizzierte ("Chat-Panel, niedrigste Priorität"). Dieser Plan
löst die Skizze ein und erweitert sie um zwei neue Anforderungen:

1. Ein **Icon innerhalb des Backends** (`/admin`), das den Chat öffnet.
2. Eine **eigenständige, auf dem Handy installierbare Web-App** — derselbe
   Chat, aber ohne die übrige Admin-Hülle drumherum.

Beides teilt sich dasselbe Datenmodell und denselben Chat-Code; es sind
zwei Fenster auf dieselbe Sache, kein zweites System.

---

## 1. Die Grundidee bleibt: Dokumente sind die Unterhaltungen

„Personen und Dokumente können miteinander chaten" heißt konkret: **nicht**
wählt man zuerst eine Person und schreibt ihr, sondern man öffnet ein
Dokument, und alle, die Zugang zur Ablage haben, schreiben dort hinein.
Das ist exakt das Modell, das bereits gebaut ist — `doc_comments` ist schon
eine Nachrichtenliste je Dokument, nur bisher als Kommentarspalte
dargestellt statt als Chatverlauf. Der Chat ist im Kern eine neue
**Oberfläche** auf vorhandenen Daten, keine neue Datenstruktur.

---

## 2. Bestandsaufnahme — was schon da ist

Geprüft im Repository, Stand heute:

| Baustein | Zustand |
|---|---|
| `doc_comments` (Nachrichten, inkl. @-Erwähnungen im Text) | fertig, in Gebrauch |
| `doc_mentions` | fertig, in Gebrauch |
| `mentions.ts` (@-Menü, Chip-Darstellung) | fertig, aber Erwähnungs-Eingabe (`attachMentionInput`) steckt aktuell nur in `document-detail.ts`, nicht exportiert |
| `documents.last_activity_at` | fertig, wird von Triggern nachgezogen — genau die Sortierung, die ein Chat-Postfach braucht |
| `doc_reads` (Tabelle: wer hat wann zuletzt gelesen) | **Tabelle existiert, aber niemand schreibt je hinein.** Es gibt keine `markRead()`-Funktion. Für einen Ungelesen-Zähler ist das die erste Lücke, die diese Phase schließen muss |
| Echtzeit (Supabase Realtime) | **nicht aktiviert.** Keine Migration schaltet `doc_comments` für die Realtime-Publikation frei. Bisher lädt die ganze Ablage alles per Anfrage nach, nie live |
| PWA/Manifest | Es gibt bereits `public/site.webmanifest`, verlinkt über `src/layouts/Base.astro` — für die **Marketing-Seite** (`start_url: "/es/"`). `/admin` benutzt denselben `Base.astro`-Kopf und erbt damit dasselbe Manifest, ungeprüft und mit falschem Startziel für eine eigene App. Für den Chat als eigene App darf das **nicht** einfach mitverwendet werden (siehe Abschnitt 5) |
| Service Worker | keiner vorhanden, keine PWA-Bibliothek im Projekt (`package.json` enthält nichts dergleichen) — passt zum bisherigen Grundsatz „keine neuen Abhängigkeiten", heißt aber: von Hand bauen |
| App-Icon-Basis | `src/components/Logo.astro` hat bereits eine extra reduzierte `simple`-Fassung der Bildmarke (Goldring, Bienenstock, Biene, doppelte Strichstärke), ausdrücklich beschrieben als Grundlage „für Favicon, App-Icons und alles unter etwa 40 px". `public/icon-192.png`/`icon-512.png` existieren schon daraus. Für den Chat kann dieselbe Bildmarke wiederverwendet werden — kein neues Icon-Design nötig |

---

## 3. Architektur: ein Modul, zwei Einstiege

```
                     ┌─────────────────────────┐
                     │   chat-store.ts          │  Datenzugriff:
                     │   chat-view.ts           │  doc_comments, doc_reads,
                     │   (gemeinsames Modul)     │  documents.last_activity_at
                     └────────────┬─────────────┘
                                  │
                 ┌────────────────┴────────────────┐
                 │                                  │
      Einstieg A: Icon in /admin          Einstieg B: eigene Seite /chat
      #/documentos/chat innerhalb         eigenes Manifest, eigener
      der bestehenden SPA (main.ts,       Service Worker, installierbar
      router.ts kennen die Route          auf dem Homescreen — KEIN
      bereits laut Plan-Abschnitt 8)      Talleres/Casas-Chrome
```

Warum nicht zwei getrennte Implementierungen? Weil sonst @-Erwähnungen,
Ungelesen-Zähler und Nachrichtendarstellung zweimal gepflegt werden
müssten. Der Unterschied zwischen A und B ist nur die **Hülle** darum, nicht
die Chat-Logik selbst.

### Einstieg A — Icon im Backend

Ein schwebender Knopf (typische Chat-Widget-Position, unten rechts),
sichtbar in der **gesamten** Admin-Hülle — nicht nur innerhalb von
„Documentos", sondern auch auf Talleres/Casas, weil eine neue Nachricht
überall ankommen kann, während man gerade woanders arbeitet. Ein kleines
Zahlen-Badge zeigt die Anzahl der Dokumente mit ungelesenen Nachrichten.
Klick navigiert zu `#/documentos/chat`.

### Einstieg B — eigenständige App

Eine neue, schlanke Astro-Seite `src/pages/chat.astro`, die **nicht**
`Base.astro` verwendet (das würde das falsche Marketing-Manifest
mitschleppen), sondern einen eigenen, minimalen Kopf mit eigenem Manifest.
Details in Abschnitt 5.

---

## 4. Datenmodell — was neu dazukommt

Fast alles ist schon da. Konkret zu ergänzen:

### 4.1 `doc_reads` tatsächlich beschreiben

```ts
// chat-store.ts (oder documents-store.ts, näher am Rest der Datenschicht)
export async function markRead(documentId: string): Promise<void> {
  // upsert auf (user_id, document_id) -- Zeile existiert oder nicht,
  // beides ist ein gültiger Ausgangszustand.
}
```

Aufgerufen, sobald ein Gesprächsverlauf geöffnet wird. Ohne diese Funktion
bleibt der Ungelesen-Zähler dauerhaft falsch, weil die Tabelle dafür zwar
angelegt, aber nie befüllt wurde.

### 4.2 Ungelesen-Zähler

Kein neuer Datenbank-Zugriff nötig: Ein Dokument gilt als ungelesen für
eine Person, wenn `documents.last_activity_at` neuer ist als der eigene
`doc_reads.last_read_at`-Eintrag (oder gar keiner existiert). Beide Werte
sind bereits Teil der ohnehin geladenen Thread-Liste — der Vergleich passiert
client-seitig, keine eigene Abfrage.

### 4.3 Echtzeit (Supabase Realtime)

Neue, kleine Migration:

```sql
alter publication supabase_realtime add table public.doc_comments;
```

Zusätzlich im Supabase-Dashboard unter *Database → Replication* bestätigen,
dass `doc_comments` in der Publikation auftaucht — das ist ein Schalter, der
nicht per SQL allein gesetzt wird. Realtime-Abonnements respektieren die
bestehenden RLS-Regeln automatisch (dieselbe Regel, die auch für normale
Abfragen gilt) — es sind keine separaten „Realtime-Policies" nötig.

> **Bewusst zurückgestellt für den ersten Wurf (siehe Phase 7a/7b unten):**
> Echtzeit ist ein „schöner machen"-Schritt, kein Blocker. Ohne sie
> funktioniert der Chat genauso wie der Rest der Ablage bisher — man sieht
> neue Nachrichten beim Öffnen/Aktualisieren, nicht live, während man
> zusieht.

---

## 5. PWA-Technik im Detail

Das ist der Teil, der wirklich neu ist — nichts davon existiert im Projekt.

### 5.1 Eigene Seite statt geteiltem Layout

`src/pages/chat.astro` bekommt einen **eigenen** minimalen Kopf (kein
`<Base>`), der die Chat-SPA direkt lädt, ohne Umweg über die
Talleres-Standardansicht von `/admin`. Grund, das eigens zu betonen: würde
diese Seite `Base.astro` einbinden, liefe man in genau das Problem, das
`/admin` heute schon lautlos hat — das Marketing-Manifest mit `start_url:
"/es/"` würde mitgeladen, und ein installiertes Chat-Icon würde beim
erneuten Öffnen die Startseite zeigen statt den Chat.

### 5.2 Eigenes Manifest

```json
// public/chat.webmanifest
{
  "name": "Retoños del Edén — Chat",
  "short_name": "Chat",
  "lang": "es",
  "start_url": "/chat",
  "scope": "/chat",
  "display": "standalone",
  "background_color": "#fbf6ec",
  "theme_color": "#fbf6ec",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Dieselben Icon-Dateien wie die Marketing-Seite (dieselbe Bildmarke, siehe
Abschnitt 2) — Konsistenz statt einer zweiten Bildsprache. Wer beide Apps
installiert, kann die Symbole auf dem Homescreen zunächst nicht
unterscheiden; als spätere Feinheit ließe sich ein kleines
Sprechblasen-Zeichen auf die Chat-Variante legen (siehe Abschnitt 8, offene
Entscheidung).

### 5.3 Minimaler Service Worker

Nur fürs Installierbar-Sein nötig (Android/Chrome verlangt einen Service
Worker mit einem `fetch`-Handler, bevor der automatische Install-Vorschlag
erscheint) — **keine** Offline-Nachrichtenablage, kein
Konfliktmanagement. Der Chat braucht ohnehin eine Netzverbindung zu
Supabase; ein ambitionierter Offline-Modus wäre Aufwand ohne echten Nutzen
für dieses Werkzeug.

```js
// public/chat-sw.js -- bewusst simpel
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // leer reicht als Installierbarkeits-Signal
```

Registriert **nur** auf `/chat`, nicht auf `/admin` oder der Marketing-Seite
— sonst würde ein Service Worker mit leerem Fetch-Handler dort
Netzwerkanfragen unnötig durch die Vermittlungsebene schleusen.

### 5.4 iOS

Safari auf iOS braucht für „Zum Home-Bildschirm" **keinen** Service
Worker, nur die passenden Kopfzeilen-Tags — dasselbe Muster, das
`Base.astro` für die Marketing-Seite schon zeigt (`apple-touch-icon`,
`theme-color`), einmal für `/chat` nachgebaut.

### 5.5 Anmeldung

Keine zweite Anmeldung nötig: `/chat` läuft auf derselben Domain wie
`/admin`, benutzt denselben Supabase-Client und damit denselben
Sitzungsspeicher. Wer im selben Browser schon bei `/admin` angemeldet war,
ist auch in der installierten Chat-App angemeldet. Bei einem komplett
neuen Gerät/Browser zeigt `/chat` dasselbe Login-Formular wie `/admin`
(`auth.ts` wird 1:1 wiederverwendet).

---

## 6. Oberfläche

### 6.1 Thread-Liste

Dokumente, absteigend nach `last_activity_at`, je Zeile:

- Ordnername (kleiner, gedeckter Text — Kontext, nicht Hauptinformation)
- Dokumenttitel
- Letzte Nachricht, gekürzt (oder „Sin mensajes todavía" bei einem frisch
  angelegten Dokument ohne Kommentar)
- Zeitpunkt relativ („hace 5 min", „ayer", Datum ab einer Woche)
- Ungelesen-Punkt/Zahl, wenn zutreffend (Abschnitt 4.2)

### 6.2 Gesprächsansicht

- Kopfbereich: Dokumenttitel, aktuelle Versionsnummer, ein Knopf „Ver
  documento" (öffnet die volle Detailansicht mit Versionen/Aufgaben/Upload
  — der Chat ersetzt die Dokumentverwaltung nicht, er ist der schnelle,
  gesprächsartige Zugang dazu)
- Nachrichten als Sprechblasen, eigene rechtsbündig, fremde linksbündig,
  nach Tag gruppiert mit Datumstrenner
- Eingabefeld mit @-Menü — **Refactoring nötig:** `attachMentionInput()`
  und `localVersionCandidates()` stecken aktuell nur in
  `document-detail.ts`, nicht exportiert. Für den Chat braucht es dieselbe
  Eingabe-Logik an zweiter Stelle — sie gehört in ein gemeinsames Modul
  (z. B. `mention-input.ts`), das beide Stellen importieren, statt sie ein
  zweites Mal zu schreiben
- Senden ruft dieselbe `createComment()` auf, die es schon gibt — keine
  neue Schreibfunktion nötig

### 6.3 Leerer Zustand

Erststart ohne jede Unterhaltung: kurze, freundliche Erklärung, dass jede
Unterhaltung an ein Dokument gebunden ist, mit einem Link zurück zur
Dokumentenablage, um eines zu öffnen oder anzulegen.

---

## 7. Umsetzung in Phasen

Jede Phase ist für sich nutzbar, wie beim Rest der Ablage.

### Phase 7a — Chat eingebettet, ohne Echtzeit

- `chat-store.ts`: `markRead()` ergänzen (Abschnitt 4.1), Thread-Liste
  laden (Dokumente + letzte Nachricht + Ungelesen-Status)
- `chat-view.ts`: Thread-Liste, Gesprächsansicht, Senden über
  `createComment()`
- `mention-input.ts` als gemeinsames Modul aus `document-detail.ts`
  herausgelöst (Abschnitt 6.2), dort UND im Chat verwendet
- Schwebendes Icon in der Admin-Hülle (`main.ts`), Route `#/documentos/chat`
  (Router kennt sie bereits, siehe `router.ts`)
- Aktualisierung wie überall sonst: beim Öffnen und nach dem Senden neu
  laden, kein Live-Push

### Phase 7b — Echtzeit

- Migration aus Abschnitt 4.3
- Neue Nachrichten erscheinen ohne Neuladen, während der Verlauf offen ist
- Ungelesen-Badge am Icon aktualisiert sich live, auch während man in
  einem anderen Bereich arbeitet

### Phase 7c — Eigenständige App

- `src/pages/chat.astro`, `public/chat.webmanifest`, `public/chat-sw.js`
  (Abschnitt 5)
- Installation auf Android (Chrome) und iOS (Safari, „Zum
  Home-Bildschirm") tatsächlich ausprobieren — beide Wege verhalten sich
  unterschiedlich genug, dass das nicht am Schreibtisch allein zu prüfen ist

### Phase 7d — Web-Push-Benachrichtigungen *(ausdrücklich später, optional)*

Bewusst **nicht** Teil des ersten Wurfs. Braucht: VAPID-Schlüsselpaar,
eine Supabase Edge Function, die bei neuer Zeile in `doc_comments`
feuert, explizite Berechtigungsabfrage im Browser, und einen Weg, die
Push-Subscription je Gerät zu speichern (neue Tabelle). Deutlich mehr
Aufwand als der Rest dieses Plans zusammen — sinnvoll erst, wenn sich
zeigt, dass „beim Öffnen der App nachsehen" in der Praxis nicht reicht.

---

## 8. Offene Entscheidungen

1. **Icon in der Admin-Hülle — überall sichtbar oder nur unter
   „Documentos"?** Der Plan geht von „überall" aus (Abschnitt 3), weil eine
   Nachricht ja unabhängig davon ankommt, wo man gerade arbeitet.
2. **Freier Chat ohne Dokumentbezug?** Dieser Plan geht davon aus, dass
   *jede* Unterhaltung an ein Dokument gebunden bleibt, wie ursprünglich
   besprochen. Ein Chat ganz ohne Dokument (reines 1:1-Gespräch) wäre ein
   neues Konzept — ein „Kanal" ohne `document_id` — und ist hier nicht
   vorgesehen.
3. **Eigenes Icon-Motiv für die Chat-App?** Vorschlag: erstmal dieselbe
   Bildmarke wie die Hauptseite (Abschnitt 5.2), mit einem kleinen
   Sprechblasen-Zeichen als spätere Verfeinerung, falls Verwechslung auf
   dem Homescreen tatsächlich stört.
4. **Reichweite von `markRead()`:** Zählt ein Dokument schon als gelesen,
   sobald die Gesprächsansicht geöffnet wird, oder erst, wenn man bis zur
   letzten Nachricht scrollt? Vorschlag: Öffnen reicht (einfacher, und bei
   der erwartbaren Nachrichtenmenge pro Dokument liest man ohnehin fast
   immer alles).

---

## 9. Was dieser Plan nicht anfasst

- `public/site.webmanifest` (Marketing-Seite) bleibt unverändert.
- Dass `/admin` aktuell dasselbe Manifest wie die Marketing-Seite erbt
  (Abschnitt 2), ist ein bestehender Zustand, keine Folge dieses Plans —
  ihn sauber zu ziehen (ein eigenes, leeres/no-op-Manifest oder gar keins
  für `/admin`) wäre ein eigener, kleiner Aufräumschritt, keine
  Voraussetzung fürs Chat-Modul.
- Phase 5 (Personenverwaltung als Oberfläche) und Phase 6 (Ordnerrechte für
  Externe) aus PLAN-DOCUMENTOS.md sind von diesem Plan unberührt.
